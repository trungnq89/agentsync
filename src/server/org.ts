import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { pendingCredentials, sessions, users, type User } from '@/db/schema';
import { assertPasswordLength, hashPassword } from './auth/password';
import { requireAdmin, type Actor } from './authz';
import { DomainError } from './errors';
import { isUuid } from './ids';

type Level = User['level'];
const LEVELS: readonly string[] = ['director', 'manager', 'leader', 'member'];

function assertLevel(level: string) {
  if (!LEVELS.includes(level)) throw new DomainError('VALIDATION', 'invalidLevel', { field: 'level' });
}
function assertDisplayName(name: string) {
  if (!name.trim()) throw new DomainError('VALIDATION', 'displayNameRequired', { field: 'displayName' });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** '' / blank means "no email" (null); otherwise trimmed, lowercased and format-checked. */
function normalizeEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? '').trim().toLowerCase();
  if (!e) return null;
  if (!EMAIL_RE.test(e)) throw new DomainError('VALIDATION', 'invalidEmail', { field: 'email' });
  return e;
}
async function assertEmailFree(db: Db, email: string, exceptId?: string) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email} or lower(${users.username}) = ${email}`);
  if (rows.some((r) => r.id !== exceptId)) throw new DomainError('VALIDATION', 'emailTaken', { field: 'email' });
}

/** Maps a unique-constraint race on users to the same errors the pre-checks give. */
function mapUniqueViolation(e: unknown): never {
  const err = e as { code?: string; constraint_name?: string; constraint?: string; cause?: { code?: string; constraint_name?: string; constraint?: string } };
  const code = err.code ?? err.cause?.code;
  const constraint = err.constraint_name ?? err.constraint ?? err.cause?.constraint_name ?? err.cause?.constraint ?? '';
  if (code === '23505') {
    if (constraint.includes('email')) throw new DomainError('VALIDATION', 'emailTaken', { field: 'email' });
    if (constraint.includes('username')) throw new DomainError('VALIDATION', 'usernameTaken', { field: 'username' });
  }
  throw e;
}

const userNotFound = () => new DomainError('NOT_FOUND', 'notFoundUser');

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
  if (!isUuid(managerId)) throw new DomainError('VALIDATION', 'invalidManager', { field: 'managerId' });
  if (userId !== null && managerId === userId) {
    throw new DomainError('VALIDATION', 'selfManager', { field: 'managerId' });
  }
  // Walk up the manager chain from the new manager; meeting userId means a cycle.
  const seen = new Set<string>();
  let cur: string | null = managerId;
  while (cur) {
    if (userId !== null && cur === userId) {
      throw new DomainError('VALIDATION', 'managerCycle', { field: 'managerId' });
    }
    if (seen.has(cur)) break;
    seen.add(cur);
    const [row] = await db
      .select({ managerId: users.managerId, disabledAt: users.disabledAt })
      .from(users)
      .where(eq(users.id, cur));
    if (!row) throw new DomainError('VALIDATION', 'managerNotFound', { field: 'managerId' });
    if (cur === managerId && row.disabledAt) {
      throw new DomainError('VALIDATION', 'managerDisabled', { field: 'managerId' });
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
    email?: string | null;
  },
): Promise<User> {
  requireAdmin(actor);
  assertLevel(input.level);
  const email = normalizeEmail(input.email);
  if (email) await assertEmailFree(db, email);
  assertDisplayName(input.displayName);
  assertPasswordLength(input.password);
  const managerId = input.managerId || null;
  if (managerId) await assertValidManager(db, null, managerId);
  const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.username, input.username));
  if (dup) throw new DomainError('VALIDATION', 'usernameTaken', { field: 'username' });
  const passwordHash = await hashPassword(input.password);
  try {
    const [u] = await db
      .insert(users)
      .values({
        username: input.username,
        displayName: input.displayName.trim(),
        passwordHash,
        level: input.level,
        managerId,
        isAdmin: input.isAdmin ?? false,
        email,
      })
      .returning();
    return u;
  } catch (e) {
    return mapUniqueViolation(e);
  }
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
    email: string | null;
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
      throw new DomainError('VALIDATION', 'lastAdmin');
    }
  }
  const email = patch.email === undefined ? undefined : normalizeEmail(patch.email);
  if (email && email !== (existing.email ?? '').toLowerCase()) await assertEmailFree(db, email, id);
  // '' means "no manager".
  const managerId = patch.managerId === '' ? null : patch.managerId;
  // An unchanged (possibly now-disabled) manager stays valid when other fields are saved.
  if (managerId && managerId !== existing.managerId) await assertValidManager(db, id, managerId);

  const set: Partial<typeof users.$inferInsert> = {};
  if (patch.displayName !== undefined) set.displayName = patch.displayName.trim();
  if (patch.level !== undefined) set.level = patch.level;
  if (managerId !== undefined) set.managerId = managerId;
  if (email !== undefined) set.email = email;
  if (patch.isAdmin !== undefined) set.isAdmin = patch.isAdmin;
  if (patch.disabled !== undefined) set.disabledAt = patch.disabled ? now : null;
  if (Object.keys(set).length === 0) return existing;
  try {
    const [u] = await db.update(users).set(set).where(eq(users.id, id)).returning();
    return u;
  } catch (e) {
    return mapUniqueViolation(e);
  }
}

export async function setPassword(db: Db, actor: Actor, id: string, pw: string): Promise<void> {
  requireAdmin(actor);
  if (!isUuid(id)) throw userNotFound();
  assertPasswordLength(pw);
  const rows = await db
    .update(users)
    .set({ passwordHash: await hashPassword(pw), mustChangePassword: true })
    .where(eq(users.id, id))
    .returning({ id: users.id });
  if (rows.length === 0) throw userNotFound();
  await db.delete(sessions).where(eq(sessions.userId, id));
  await db.delete(pendingCredentials).where(eq(pendingCredentials.userId, id));
}
