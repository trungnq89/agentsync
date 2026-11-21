import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { sessions, users, type User } from '@/db/schema';
import { assertPasswordLength, hashPassword } from './auth/password';
import type { Actor } from './authz';
import { DomainError } from './errors';
import { isUuid } from './ids';

type Level = User['level'];
const LEVELS: readonly string[] = ['director', 'manager', 'leader', 'member'];

function assertLevel(level: string) {
  if (!LEVELS.includes(level)) throw new DomainError('VALIDATION', 'Cấp không hợp lệ.');
}
function assertDisplayName(name: string) {
  if (!name.trim()) throw new DomainError('VALIDATION', 'Tên hiển thị không được để trống.');
}

function requireAdmin(actor: Actor) {
  if (!actor.isAdmin) throw new DomainError('FORBIDDEN', 'Chỉ quản trị viên mới có quyền thực hiện thao tác này.');
}

const userNotFound = () => new DomainError('NOT_FOUND', 'Không tìm thấy người dùng.');

export async function listDirectReports(db: Db, managerId: string): Promise<User[]> {
  return db
    .select()
    .from(users)
    .where(and(eq(users.managerId, managerId), isNull(users.disabledAt)))
    .orderBy(asc(users.displayName));
}

export async function listAllUsers(db: Db, actor: Actor): Promise<User[]> {
  requireAdmin(actor);
  return db.select().from(users).orderBy(asc(users.displayName), asc(users.username));
}

async function assertValidManager(db: Db, userId: string | null, managerId: string) {
  if (!isUuid(managerId)) throw new DomainError('VALIDATION', 'Quản lý không hợp lệ.');
  if (userId !== null && managerId === userId) {
    throw new DomainError('VALIDATION', 'Không thể đặt chính mình làm quản lý.');
  }
  // Walk up the manager chain from the new manager; meeting userId means a cycle.
  const seen = new Set<string>();
  let cur: string | null = managerId;
  while (cur) {
    if (userId !== null && cur === userId) {
      throw new DomainError('VALIDATION', 'Quản lý này tạo thành vòng lặp trong sơ đồ tổ chức.');
    }
    if (seen.has(cur)) break;
    seen.add(cur);
    const [row] = await db
      .select({ managerId: users.managerId, disabledAt: users.disabledAt })
      .from(users)
      .where(eq(users.id, cur));
    if (!row) throw new DomainError('VALIDATION', 'Không tìm thấy quản lý được chọn.');
    if (cur === managerId && row.disabledAt) {
      throw new DomainError('VALIDATION', 'Không thể chọn người đã bị vô hiệu hóa làm quản lý.');
    }
    cur = row.managerId;
  }
}

export async function createUser(
  db: Db,
  actor: Actor,
  input: {
    username: string;
    displayName: string;
    password: string;
    level: Level;
    managerId?: string | null;
    isAdmin?: boolean;
  },
): Promise<User> {
  requireAdmin(actor);
  assertLevel(input.level);
  assertDisplayName(input.displayName);
  assertPasswordLength(input.password);
  const managerId = input.managerId || null;
  if (managerId) await assertValidManager(db, null, managerId);
  const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.username, input.username));
  if (dup) throw new DomainError('VALIDATION', 'Tên đăng nhập đã tồn tại.');
  const [u] = await db
    .insert(users)
    .values({
      username: input.username,
      displayName: input.displayName.trim(),
      passwordHash: await hashPassword(input.password),
      level: input.level,
      managerId,
      isAdmin: input.isAdmin ?? false,
    })
    .returning();
  return u;
}

export async function updateUser(
  db: Db,
  actor: Actor,
  id: string,
  patch: Partial<{
    displayName: string;
    level: Level;
    managerId: string | null;
    isAdmin: boolean;
    disabled: boolean;
  }>,
  now: Date = new Date(),
): Promise<User> {
  requireAdmin(actor);
  if (!isUuid(id)) throw userNotFound();
  const [existing] = await db.select().from(users).where(eq(users.id, id));
  if (!existing) throw userNotFound();
  if (patch.level !== undefined) assertLevel(patch.level);
  if (patch.displayName !== undefined) assertDisplayName(patch.displayName);
  const losesAdmin =
    existing.isAdmin && !existing.disabledAt && (patch.isAdmin === false || patch.disabled === true);
  if (losesAdmin) {
    const others = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.isAdmin, true), isNull(users.disabledAt), ne(users.id, id)))
      .limit(1);
    if (others.length === 0) {
      throw new DomainError('VALIDATION', 'Phải còn ít nhất một quản trị viên đang hoạt động.');
    }
  }
  // '' means "no manager".
  const managerId = patch.managerId === '' ? null : patch.managerId;
  // An unchanged (possibly now-disabled) manager stays valid when other fields are saved.
  if (managerId && managerId !== existing.managerId) await assertValidManager(db, id, managerId);

  const set: Partial<typeof users.$inferInsert> = {};
  if (patch.displayName !== undefined) set.displayName = patch.displayName.trim();
  if (patch.level !== undefined) set.level = patch.level;
  if (managerId !== undefined) set.managerId = managerId;
  if (patch.isAdmin !== undefined) set.isAdmin = patch.isAdmin;
  if (patch.disabled !== undefined) set.disabledAt = patch.disabled ? now : null;
  if (Object.keys(set).length === 0) return existing;
  const [u] = await db.update(users).set(set).where(eq(users.id, id)).returning();
  return u;
}

export async function setPassword(db: Db, actor: Actor, id: string, pw: string): Promise<void> {
  requireAdmin(actor);
  if (!isUuid(id)) throw userNotFound();
  assertPasswordLength(pw);
  const rows = await db
    .update(users)
    .set({ passwordHash: await hashPassword(pw) })
    .where(eq(users.id, id))
    .returning({ id: users.id });
  if (rows.length === 0) throw userNotFound();
  await db.delete(sessions).where(eq(sessions.userId, id));
}
