import { randomInt } from 'node:crypto';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { odooSettings, odooSyncRuns, pendingCredentials, sessions, users, type OdooRunCounts } from '@/db/schema';
import { hashPassword } from '../auth/password';
import { requireAdmin, type Actor } from '../authz';
import { DomainError } from '../errors';
import { isUuid } from '../ids';
import { decryptSecret, encryptSecret } from '../secret';
import { createOdooClient, type OdooConnection, type OdooEmployee } from './client';
import { computeOdooDiff, type Change, type DiffResult, type ExistingUser, type Mode } from './diff';
import { loadOdooConnection } from './settings';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Client = { listEmployees(): Promise<OdooEmployee[]> };
export type SyncDeps = { clientFactory?: (conn: OdooConnection) => Client };
export type Credential = { email: string; password: string };
export type Preview = DiffResult;

const PREVIEW_TTL_MS = 60 * 60 * 1000;
// No 0 O o 1 l I.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function generateTempPassword(): string {
  let out = '';
  for (let i = 0; i < 16; i++) out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  return out;
}

const norm = (e: string | null | undefined) => (e ?? '').trim().toLowerCase();

async function computeDiff(db: Db, mode: Mode, deps: SyncDeps): Promise<DiffResult> {
  const conn = await loadOdooConnection(db);
  if (!conn) throw new DomainError('VALIDATION', 'odooNotConfigured');
  const client = (deps.clientFactory ?? createOdooClient)(conn);
  const employees = await client.listEmployees();
  const [cfg] = await db.select().from(odooSettings).where(eq(odooSettings.id, 1));
  const rows = await db.select().from(users);
  const existing: ExistingUser[] = rows.map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.displayName,
    level: u.level,
    managerId: u.managerId,
    isAdmin: u.isAdmin,
    disabled: u.disabledAt !== null,
    source: u.source as 'local' | 'odoo',
    odooEmployeeId: u.odooEmployeeId,
  }));
  return computeOdooDiff(employees, existing, {
    mode,
    titleMappingEnabled: cfg?.titleMappingEnabled ?? false,
    mappings: cfg?.titleMappings ?? [],
  });
}

function errorKeyOf(e: unknown): string {
  return e instanceof DomainError ? e.key : 'odooUnreachable';
}

async function recordFailure(db: Db, runId: string, e: unknown) {
  await db
    .update(odooSyncRuns)
    .set({ status: 'failed', errorKey: errorKeyOf(e), finishedAt: new Date() })
    .where(eq(odooSyncRuns.id, runId));
}

async function currentMode(db: Db): Promise<Mode> {
  const [cfg] = await db.select({ mode: odooSettings.mode }).from(odooSettings).where(eq(odooSettings.id, 1));
  return (cfg?.mode as Mode) ?? 'review';
}

export async function previewSync(db: Db, actor: Actor, mode?: Mode, deps: SyncDeps = {}) {
  requireAdmin(actor);
  const m = mode ?? (await currentMode(db));
  const [run] = await db
    .insert(odooSyncRuns)
    .values({ mode: m, trigger: 'manual', actorId: actor.id, status: 'failed' })
    .returning();
  try {
    const diff = await computeDiff(db, m, deps);
    await db.update(odooSyncRuns).set({ status: 'previewed', preview: diff }).where(eq(odooSyncRuns.id, run.id));
    return { runId: run.id, ...diff };
  } catch (e) {
    await recordFailure(db, run.id, e);
    throw e;
  }
}

type Cur = {
  id: string;
  username: string;
  email: string | null;
  managerId: string | null;
  isAdmin: boolean;
  disabled: boolean;
  odooEmployeeId: number | null;
};

/** Re-validates every change against current data and applies it inside the caller's transaction. */
async function applyChanges(
  tx: Tx,
  changes: Change[],
  now: Date,
): Promise<{ applied: number; skipped: number; counts: OdooRunCounts; created: { userId: string; email: string; password: string }[] }> {
  const q = tx as unknown as Db;
  const rows = await q.select().from(users);
  const cur = new Map<string, Cur>(
    rows.map((u) => [u.id, { id: u.id, username: u.username, email: u.email, managerId: u.managerId, isAdmin: u.isAdmin, disabled: u.disabledAt !== null, odooEmployeeId: u.odooEmployeeId }]),
  );
  const emailTaken = new Set(rows.flatMap((u) => [norm(u.email), norm(u.username)]).filter(Boolean));
  const empToUser = new Map<number, string>();
  for (const u of rows) if (u.odooEmployeeId !== null) empToUser.set(u.odooEmployeeId, u.id);

  const counts: OdooRunCounts = {};
  let applied = 0;
  let skipped = 0;
  const ok = (type: string) => { applied++; counts[type] = (counts[type] ?? 0) + 1; };
  const skip = () => { skipped++; };
  const created: { userId: string; email: string; password: string }[] = [];
  const createdByEmp = new Map<number, string>();

  const wouldCycle = (userId: string, managerId: string): boolean => {
    const seen = new Set<string>();
    let c: string | null = managerId;
    while (c && !seen.has(c)) {
      if (c === userId) return true;
      seen.add(c);
      c = cur.get(c)?.managerId ?? null;
    }
    return false;
  };
  const resolveRef = (ref: { userId: string } | { employeeId: number }): string | null =>
    'userId' in ref ? ref.userId : (createdByEmp.get(ref.employeeId) ?? empToUser.get(ref.employeeId) ?? null);
  const setManager = async (userId: string, ref: { userId: string } | { employeeId: number } | null): Promise<boolean> => {
    const u = cur.get(userId);
    if (!u || u.disabled) return false;
    let target: string | null = null;
    if (ref) {
      target = resolveRef(ref);
      const t = target ? cur.get(target) : undefined;
      if (!target || !t || t.disabled || wouldCycle(userId, target)) return false;
    }
    await q.update(users).set({ managerId: target }).where(eq(users.id, userId));
    u.managerId = target;
    return true;
  };

  const of = <T extends Change['type']>(t: T) => changes.filter((c): c is Extract<Change, { type: T }> => c.type === t);

  // 1. creates
  const createdChanges: Extract<Change, { type: 'create' }>[] = [];
  for (const c of of('create')) {
    const email = norm(c.email);
    if (!email || emailTaken.has(email) || empToUser.has(c.employeeId)) { skip(); continue; }
    const password = generateTempPassword();
    const [u] = await q
      .insert(users)
      .values({
        username: email,
        email,
        displayName: c.displayName.trim() || email,
        passwordHash: await hashPassword(password),
        level: c.level,
        source: 'odoo',
        odooEmployeeId: c.employeeId,
        mustChangePassword: true,
      })
      .returning();
    cur.set(u.id, { id: u.id, username: u.username, email, managerId: null, isAdmin: false, disabled: false, odooEmployeeId: c.employeeId });
    emailTaken.add(email);
    empToUser.set(c.employeeId, u.id);
    createdByEmp.set(c.employeeId, u.id);
    created.push({ userId: u.id, email, password });
    createdChanges.push(c);
    ok('create');
  }
  // 2. links
  for (const c of of('link')) {
    const u = cur.get(c.userId);
    const owner = empToUser.get(c.employeeId);
    if (!u || (owner && owner !== u.id)) { skip(); continue; }
    await q.update(users).set({ odooEmployeeId: c.employeeId }).where(eq(users.id, u.id));
    if (u.odooEmployeeId !== null && empToUser.get(u.odooEmployeeId) === u.id) empToUser.delete(u.odooEmployeeId);
    u.odooEmployeeId = c.employeeId;
    empToUser.set(c.employeeId, u.id);
    ok('link');
  }
  // 3. managers (created users first, then existing)
  for (const c of createdChanges) {
    if (c.managerRef) await setManager(createdByEmp.get(c.employeeId)!, c.managerRef); // best effort: unresolved leaves no manager
  }
  for (const c of of('updateManager')) {
    if (await setManager(c.userId, c.to)) ok('updateManager');
    else skip();
  }
  // 4. names, 5. levels
  for (const c of of('updateName')) {
    if (!cur.has(c.userId) || !c.to.trim()) { skip(); continue; }
    await q.update(users).set({ displayName: c.to.trim() }).where(eq(users.id, c.userId));
    ok('updateName');
  }
  for (const c of of('updateLevel')) {
    if (!cur.has(c.userId)) { skip(); continue; }
    await q.update(users).set({ level: c.to }).where(eq(users.id, c.userId));
    ok('updateLevel');
  }
  // 6. disables (never an admin)
  for (const c of of('disable')) {
    const u = cur.get(c.userId);
    if (!u || u.isAdmin || u.disabled) { skip(); continue; }
    await q.update(users).set({ disabledAt: now }).where(eq(users.id, u.id));
    await q.delete(sessions).where(eq(sessions.userId, u.id));
    u.disabled = true;
    ok('disable');
  }
  counts.skipped = skipped;
  return { applied, skipped, counts, created };
}

async function acquireLock(tx: Tx) {
  const res = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext('agentsync_odoo_sync')) as ok`);
  if (!res.rows[0] || (res.rows[0] as { ok: boolean }).ok !== true) throw new DomainError('VALIDATION', 'odooSyncBusy');
}

async function applyRun(
  db: Db,
  runId: string,
  selectedKeys: string[] | undefined,
  now: Date,
  storeCredentials: boolean,
): Promise<{ applied: number; skipped: number; credentials: Credential[] }> {
  return db.transaction(async (tx) => {
    await acquireLock(tx);
    const q = tx as unknown as Db;
    const [run] = await q.select().from(odooSyncRuns).where(eq(odooSyncRuns.id, runId)).for('update');
    if (!run) throw new DomainError('NOT_FOUND', 'odooRunNotFound');
    if (run.status !== 'previewed' || !run.preview || now.getTime() - run.startedAt.getTime() > PREVIEW_TTL_MS) {
      throw new DomainError('VALIDATION', 'odooPreviewExpired');
    }
    const preview = run.preview as Preview;
    const selected = run.mode === 'review' ? new Set(selectedKeys ?? []) : null;
    const changes = preview.changes.filter((c) => !selected || selected.has(c.key));
    const r = await applyChanges(tx, changes, now);
    if (storeCredentials && r.created.length) {
      await q.insert(pendingCredentials).values(
        r.created.map((c) => ({ userId: c.userId, runId, secretEnc: encryptSecret(JSON.stringify({ email: c.email, password: c.password })) })),
      );
    }
    await q.update(odooSyncRuns).set({ status: 'applied', finishedAt: now, counts: r.counts }).where(eq(odooSyncRuns.id, runId));
    return { applied: r.applied, skipped: r.skipped, credentials: r.created.map(({ email, password }) => ({ email, password })) };
  });
}

export async function applySync(db: Db, actor: Actor, runId: string, selectedKeys?: string[], now: Date = new Date()) {
  requireAdmin(actor);
  if (!isUuid(runId)) throw new DomainError('NOT_FOUND', 'odooRunNotFound');
  return applyRun(db, runId, selectedKeys, now, false);
}

export async function runIncrementalSync(db: Db, trigger: 'manual' | 'schedule', actor?: Actor, deps: SyncDeps = {}) {
  if (actor) requireAdmin(actor);
  const [run] = await db
    .insert(odooSyncRuns)
    .values({ mode: 'incremental', trigger, actorId: actor?.id ?? null, status: 'failed' })
    .returning();
  try {
    const diff = await computeDiff(db, 'incremental', deps);
    await db.update(odooSyncRuns).set({ status: 'previewed', preview: diff }).where(eq(odooSyncRuns.id, run.id));
    const r = await applyRun(db, run.id, undefined, new Date(), true);
    return { runId: run.id, applied: r.applied, skipped: r.skipped };
  } catch (e) {
    await recordFailure(db, run.id, e);
    throw e;
  }
}

export async function listPendingCredentials(db: Db, actor: Actor) {
  requireAdmin(actor);
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(pendingCredentials).orderBy(pendingCredentials.createdAt).for('update');
    const out = rows.map((r) => {
      const { email, password } = JSON.parse(decryptSecret(r.secretEnc)) as Credential;
      return { id: r.id, email, password, createdAt: r.createdAt };
    });
    if (rows.length) await tx.delete(pendingCredentials).where(inArray(pendingCredentials.id, rows.map((r) => r.id)));
    return out;
  });
}

export async function countPendingCredentials(db: Db, actor: Actor): Promise<number> {
  requireAdmin(actor);
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(pendingCredentials);
  return r?.n ?? 0;
}

export async function listSyncRuns(db: Db, actor: Actor, limit = 20) {
  requireAdmin(actor);
  return db
    .select({
      id: odooSyncRuns.id,
      mode: odooSyncRuns.mode,
      trigger: odooSyncRuns.trigger,
      actorId: odooSyncRuns.actorId,
      startedAt: odooSyncRuns.startedAt,
      finishedAt: odooSyncRuns.finishedAt,
      status: odooSyncRuns.status,
      counts: odooSyncRuns.counts,
      errorKey: odooSyncRuns.errorKey,
    })
    .from(odooSyncRuns)
    .orderBy(desc(odooSyncRuns.startedAt))
    .limit(limit);
}
