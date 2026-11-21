import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { users, type User } from '@/db/schema';
import { hashPassword } from './auth/password';
import type { Actor } from './authz';
import { DomainError } from './errors';
import { isUuid } from './ids';

type Level = User['level'];

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
    const [row] = await db.select({ managerId: users.managerId }).from(users).where(eq(users.id, cur));
    if (!row) throw new DomainError('VALIDATION', 'Không tìm thấy quản lý được chọn.');
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
  const managerId = input.managerId || null;
  if (managerId) await assertValidManager(db, null, managerId);
  const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.username, input.username));
  if (dup) throw new DomainError('VALIDATION', 'Tên đăng nhập đã tồn tại.');
  const [u] = await db
    .insert(users)
    .values({
      username: input.username,
      displayName: input.displayName,
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
  // '' means "no manager".
  const managerId = patch.managerId === '' ? null : patch.managerId;
  if (managerId) await assertValidManager(db, id, managerId);

  const set: Partial<typeof users.$inferInsert> = {};
  if (patch.displayName !== undefined) set.displayName = patch.displayName;
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
  const rows = await db
    .update(users)
    .set({ passwordHash: await hashPassword(pw) })
    .where(eq(users.id, id))
    .returning({ id: users.id });
  if (rows.length === 0) throw userNotFound();
}
