import { randomInt } from 'node:crypto';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
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
    .values({ mode: m, trigger: 'manual', actorId: actor.id, status: 'running' })
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
type Ref = { userId: string } | { employeeId: number };
type Prehashed = Map<number, { password: string; hash: string }>;
export type SyncCounts = { created: number; linked: number; updated: number; disabled: number; skipped: number };

const isUniqueViolation = (e: unknown): boolean => {
  const code = (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  return code === '23505';
};

/** Re-validates every change against current data and applies it inside the caller's transaction. */
async function applyChanges(
  tx: Tx,
  changes: Change[],
  now: Date,
  prehashed: Prehashed,
): Promise<{ counts: SyncCounts; stored: OdooRunCounts; created: { userId: string; email: string; password: string }[] }> {
  const q = tx as unknown as Db;
  const rows = await q.select().from(users);
  const cur = new Map<string, Cur>(
    rows.map((u) => [u.id, { id: u.id, username: u.username, email: u.email, managerId: u.managerId, isAdmin: u.isAdmin, disabled: u.disabledAt !== null, odooEmployeeId: u.odooEmployeeId }]),
  );
  const emailTaken = new Set(rows.flatMap((u) => [norm(u.email), norm(u.username)]).filter(Boolean));
  const empToUser = new Map<number, string>();
  for (const u of rows) if (u.odooEmployeeId !== null) empToUser.set(u.odooEmployeeId, u.id);

  const counts: SyncCounts = { created: 0, linked: 0, updated: 0, disabled: 0, skipped: 0 };
  const stored: OdooRunCounts = {};
  const done = (k: keyof SyncCounts, type: string) => { counts[k]++; stored[type] = (stored[type] ?? 0) + 1; };
  const skip = () => { counts.skipped++; };
  const created: { userId: string; email: string; password: string }[] = [];
  const createdByEmp = new Map<number, string>();

  /** Runs one write in a savepoint; a unique-constraint race becomes a skip (false). */
  const attempt = async <T>(fn: (w: Db) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> => {
    try {
      return { ok: true, value: await q.transaction((sp) => fn(sp as unknown as Db)) };
    } catch (e) {
      if (isUniqueViolation(e)) return { ok: false };
      throw e;
    }
  };

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
  const resolveRef = (ref: Ref): string | null =>
    'userId' in ref ? ref.userId : (createdByEmp.get(ref.employeeId) ?? empToUser.get(ref.employeeId) ?? null);
  const setManager = async (userId: string, ref: Ref | null): Promise<boolean> => {
    const u = cur.get(userId);
    if (!u || u.disabled) return false;
    let target: string | null = null;
    if (ref) {
      target = resolveRef(ref);
      const t = target ? cur.get(target) : undefined;
      if (!target || !t || t.disabled || wouldCycle(userId, target)) return false;
    }
    await attempt((w) => w.update(users).set({ managerId: target }).where(eq(users.id, userId)));
    u.managerId = target;
    return true;
  };

  const of = <T extends Change['type']>(t: T) => changes.filter((c): c is Extract<Change, { type: T }> => c.type === t);

  // 1. creates
  const createdChanges: Extract<Change, { type: 'create' }>[] = [];
  for (const c of of('create')) {
    const email = norm(c.email);
    if (!email || emailTaken.has(email) || empToUser.has(c.employeeId)) { skip(); continue; }
    const pre = prehashed.get(c.employeeId) ?? (() => { const password = generateTempPassword(); return { password, hash: '' }; })();
    const hash = pre.hash || (await hashPassword(pre.password));
    const r = await attempt(async (w) => {
      const [u] = await w
        .insert(users)
        .values({
          username: email,
          email,
          displayName: c.displayName.trim() || email,
          passwordHash: hash,
          level: c.level,
          source: 'odoo',
          odooEmployeeId: c.employeeId,
          mustChangePassword: true,
        })
        .returning();
      return u;
    });
    if (!r.ok) { skip(); continue; }
    const u = r.value;
    cur.set(u.id, { id: u.id, username: u.username, email, managerId: null, isAdmin: false, disabled: false, odooEmployeeId: c.employeeId });
    emailTaken.add(email);
    empToUser.set(c.employeeId, u.id);
    createdByEmp.set(c.employeeId, u.id);
    created.push({ userId: u.id, email, password: pre.password });
    createdChanges.push(c);
    done('created', 'create');
  }
  // 2. links
  for (const c of of('link')) {
    const u = cur.get(c.userId);
    const owner = empToUser.get(c.employeeId);
    if (!u || (owner && owner !== u.id)) { skip(); continue; }
    const r = await attempt((w) => w.update(users).set({ odooEmployeeId: c.employeeId }).where(eq(users.id, u.id)));
    if (!r.ok) { skip(); continue; }
    if (u.odooEmployeeId !== null && empToUser.get(u.odooEmployeeId) === u.id) empToUser.delete(u.odooEmployeeId);
    u.odooEmployeeId = c.employeeId;
    empToUser.set(c.employeeId, u.id);
    done('linked', 'link');
  }
  // 3. managers (created users first, then existing)
  for (const c of createdChanges) {
    if (c.managerRef) await setManager(createdByEmp.get(c.employeeId)!, c.managerRef); // best effort: unresolved leaves no manager
  }
  for (const c of of('updateManager')) {
    if (await setManager(c.userId, c.to)) done('updated', 'updateManager');
    else skip();
  }
  // 4. names, 5. levels
  for (const c of of('updateName')) {
    if (!cur.has(c.userId) || !c.to.trim()) { skip(); continue; }
    await attempt((w) => w.update(users).set({ displayName: c.to.trim() }).where(eq(users.id, c.userId)));
    done('updated', 'updateName');
  }
  for (const c of of('updateLevel')) {
    if (!cur.has(c.userId)) { skip(); continue; }
    await attempt((w) => w.update(users).set({ level: c.to }).where(eq(users.id, c.userId)));
    done('updated', 'updateLevel');
  }
  // 6. disables (never an admin); active reports are detached so none stays under a disabled manager
  for (const c of of('disable')) {
    const u = cur.get(c.userId);
    if (!u || u.isAdmin || u.disabled) { skip(); continue; }
    await attempt(async (w) => {
      await w.update(users).set({ disabledAt: now }).where(eq(users.id, u.id));
      await w.update(users).set({ managerId: null }).where(and(eq(users.managerId, u.id), isNull(users.disabledAt)));
      await w.delete(sessions).where(eq(sessions.userId, u.id));
    });
    u.disabled = true;
    for (const r of cur.values()) if (r.managerId === u.id && !r.disabled) r.managerId = null;
    done('disabled', 'disable');
  }
  stored.skipped = counts.skipped;
  return { counts, stored, created };
}

async function acquireLock(tx: Tx) {
  const res = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext('agentsync_odoo_sync')) as ok`);
  if (!res.rows[0] || (res.rows[0] as { ok: boolean }).ok !== true) throw new DomainError('VALIDATION', 'odooSyncBusy');
}

const PASSTHROUGH = new Set(['odooSyncBusy', 'odooPreviewExpired', 'odooRunNotFound']);

async function applyRun(
  db: Db,
  runId: string,
  selectedKeys: string[] | undefined,
  now: Date,
  storeCredentials: boolean,
): Promise<SyncCounts & { credentials: Credential[] }> {
  const selectChanges = (mode: string, preview: Preview) => {
    const selected = mode === 'review' ? new Set(selectedKeys ?? []) : null;
    return preview.changes.filter((c) => !selected || selected.has(c.key));
  };
  // Hash passwords before taking the advisory lock (argon2 is slow).
  const prehashed: Prehashed = new Map();
  const [pre] = await db.select().from(odooSyncRuns).where(eq(odooSyncRuns.id, runId));
  if (pre?.preview && pre.status === 'previewed') {
    for (const c of selectChanges(pre.mode, pre.preview as Preview)) {
      if (c.type !== 'create') continue;
      const password = generateTempPassword();
      prehashed.set(c.employeeId, { password, hash: await hashPassword(password) });
    }
  }
  try {
    return await db.transaction(async (tx) => {
      await acquireLock(tx);
      const q = tx as unknown as Db;
      const [run] = await q.select().from(odooSyncRuns).where(eq(odooSyncRuns.id, runId)).for('update');
      if (!run) throw new DomainError('NOT_FOUND', 'odooRunNotFound');
      if (run.status !== 'previewed' || !run.preview || now.getTime() - run.startedAt.getTime() > PREVIEW_TTL_MS) {
        throw new DomainError('VALIDATION', 'odooPreviewExpired');
      }
      const changes = selectChanges(run.mode, run.preview as Preview);
      const r = await applyChanges(tx, changes, now, prehashed);
      if (storeCredentials && r.created.length) {
        await q.insert(pendingCredentials).values(
          r.created.map((c) => ({ userId: c.userId, runId, secretEnc: encryptSecret(JSON.stringify({ email: c.email, password: c.password })) })),
        );
      }
      await q.update(odooSyncRuns).set({ status: 'applied', finishedAt: now, counts: r.stored }).where(eq(odooSyncRuns.id, runId));
      return { ...r.counts, credentials: r.created.map(({ email, password }) => ({ email, password })) };
    });
  } catch (e) {
    if (e instanceof DomainError && PASSTHROUGH.has(e.key)) throw e;
    // The transaction rolled back; record the failure outside of it. Never surface the raw error.
    await recordFailure(db, runId, new DomainError('VALIDATION', 'odooApplyFailed'));
    throw new DomainError('VALIDATION', 'odooApplyFailed');
  }
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
    .values({ mode: 'incremental', trigger, actorId: actor?.id ?? null, status: 'running' })
    .returning();
  try {
    const diff = await computeDiff(db, 'incremental', deps);
    await db.update(odooSyncRuns).set({ status: 'previewed', preview: diff }).where(eq(odooSyncRuns.id, run.id));
    const r = await applyRun(db, run.id, undefined, new Date(), true);
    return { runId: run.id, created: r.created, linked: r.linked, updated: r.updated, disabled: r.disabled, skipped: r.skipped };
  } catch (e) {
    await recordFailure(db, run.id, e);
    throw e;
  }
}

export async function listPendingCredentials(db: Db, actor: Actor) {
  requireAdmin(actor);
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(pendingCredentials).orderBy(pendingCredentials.createdAt).for('update');
    const out: { id: string; email: string; password: string; createdAt: Date }[] = [];
    for (const r of rows) {
      try {
        const { email, password } = JSON.parse(decryptSecret(r.secretEnc)) as Credential;
        out.push({ id: r.id, email, password, createdAt: r.createdAt });
      } catch {
        // undecryptable row: dropped below so it cannot block the others
      }
    }
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
