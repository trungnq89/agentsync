import type { TitleMapping } from '@/db/schema';
import type { OdooEmployee } from './client';

export type UserLevel = TitleMapping['level'];
export type Mapping = { pattern: string; level: UserLevel };
export type Mode = 'full' | 'incremental' | 'review';
export type ManagerRef = { userId: string } | { employeeId: number };

export type ExistingUser = {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  level: UserLevel;
  managerId: string | null;
  isAdmin: boolean;
  disabled: boolean;
  source: 'local' | 'odoo';
  odooEmployeeId: number | null;
};

export type Change =
  | { key: string; type: 'create'; employeeId: number; email: string; displayName: string; level: UserLevel; managerRef: ManagerRef | null }
  | { key: string; type: 'link'; userId: string; employeeId: number }
  | { key: string; type: 'updateManager'; userId: string; from: string | null; to: ManagerRef | null }
  | { key: string; type: 'updateName'; userId: string; from: string; to: string }
  | { key: string; type: 'updateLevel'; userId: string; from: UserLevel; to: UserLevel }
  | { key: string; type: 'disable'; userId: string };

export type Skip = {
  employeeId?: number;
  userId?: string;
  reason: 'noEmail' | 'duplicateEmail' | 'managerCycle' | 'managerNoAccount';
};

export type DiffOptions = { mode: Mode; titleMappingEnabled: boolean; mappings: Mapping[] };
export type DiffResult = { changes: Change[]; skipped: Skip[]; untouchedLocal: string[] };

export function mapTitle(title: string | null, mappings: Mapping[]): UserLevel {
  const t = (title ?? '').toLowerCase();
  if (!t) return 'member';
  for (const m of mappings) {
    const p = m.pattern.trim().toLowerCase();
    if (p && t.includes(p)) return m.level;
  }
  return 'member';
}

const normEmail = (e: string | null | undefined): string | null => {
  const v = (e ?? '').trim().toLowerCase();
  return v === '' ? null : v;
};

const TYPE_ORDER: Change['type'][] = ['create', 'link', 'updateManager', 'updateName', 'updateLevel', 'disable'];

export function computeOdooDiff(employeesIn: OdooEmployee[], usersIn: ExistingUser[], opts: DiffOptions): DiffResult {
  const employees = [...employeesIn].sort((a, b) => a.id - b.id);
  const users = [...usersIn].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const full = opts.mode !== 'incremental';
  const changes: Change[] = [];
  const skipped: Skip[] = [];

  const empById = new Map(employees.map((e) => [e.id, e]));
  const emailCount = new Map<string, number>();
  for (const e of employees) {
    const m = e.active ? normEmail(e.email) : null;
    if (m) emailCount.set(m, (emailCount.get(m) ?? 0) + 1);
  }
  const userByEmpId = new Map<number, ExistingUser>();
  for (const u of users) if (u.odooEmployeeId !== null && !userByEmpId.has(u.odooEmployeeId)) userByEmpId.set(u.odooEmployeeId, u);
  const userByEmail = new Map<string, ExistingUser>();
  for (const u of users) {
    const m = normEmail(u.email);
    if (m && !userByEmail.has(m)) userByEmail.set(m, u);
  }

  // Match employees to users (id first, then email for unlinked, active, non-duplicate employees).
  const matched = new Map<number, ExistingUser>(); // employeeId -> user
  const claimed = new Set<string>(); // user ids
  for (const [eid, u] of userByEmpId) if (empById.has(eid)) { matched.set(eid, u); claimed.add(u.id); }
  const toCreate: OdooEmployee[] = [];
  const relinked = new Set<string>();
  const sorted = [...employees].sort((a, b) => a.id - b.id);
  for (const e of sorted) {
    if (matched.has(e.id)) continue;
    if (!e.active) continue;
    const em = normEmail(e.email);
    if (!em) { skipped.push({ employeeId: e.id, reason: 'noEmail' }); continue; }
    if ((emailCount.get(em) ?? 0) > 1) { skipped.push({ employeeId: e.id, reason: 'duplicateEmail' }); continue; }
    const u = userByEmail.get(em);
    if (!u) {
      toCreate.push(e);
    } else if (u.odooEmployeeId === null) {
      if (claimed.has(u.id)) continue;
      matched.set(e.id, u);
      claimed.add(u.id);
      changes.push({ key: `link:${u.id}`, type: 'link', userId: u.id, employeeId: e.id });
    } else {
      const x = empById.get(u.odooEmployeeId);
      if (!x || !x.active) {
        // rehire / new Odoo record: re-link the user to the active employee
        if (x && matched.get(x.id) === u) matched.delete(x.id);
        matched.set(e.id, u);
        relinked.add(u.id);
        changes.push({ key: `link:${u.id}`, type: 'link', userId: u.id, employeeId: e.id });
      } else {
        skipped.push({ employeeId: e.id, userId: u.id, reason: 'duplicateEmail' });
      }
    }
  }
  const creating = new Set(toCreate.map((e) => e.id));

  const disabling = new Set<string>();
  // Disable + untouchedLocal
  const untouchedLocal: string[] = [];
  for (const u of users) {
    const eid = u.odooEmployeeId;
    const emp = eid !== null ? empById.get(eid) : undefined;
    if (eid !== null && (!emp || !emp.active) && !relinked.has(u.id)) {
      if (full && !u.isAdmin && !u.disabled) disabling.add(u.id);
      if (full && !u.isAdmin && !u.disabled) changes.push({ key: `disable:${u.id}`, type: 'disable', userId: u.id });
    } else if (!claimed.has(u.id) && u.source === 'local') {
      untouchedLocal.push(u.id);
    }
  }

  // Manager graph. Node ids: u:<userId> | e:<employeeId>
  type Node = { id: string; employeeId: number; user?: ExistingUser; proposed: boolean; desired: ManagerRef | null; current: string | null };
  const nodes = new Map<string, Node>();
  const nodeOfEmployee = (id: number): string | null =>
    creating.has(id)
      ? `e:${id}`
      : matched.has(id) && !matched.get(id)!.disabled && !disabling.has(matched.get(id)!.id)
        ? `u:${matched.get(id)!.id}`
        : null;
  const refOf = (nid: string): ManagerRef => (nid.startsWith('u:') ? { userId: nid.slice(2) } : { employeeId: Number(nid.slice(2)) });

  for (const u of users) {
    // untouched users keep their current manager in the graph
    nodes.set(`u:${u.id}`, { id: `u:${u.id}`, employeeId: -1, user: u, proposed: false, desired: null, current: u.managerId ? `u:${u.managerId}` : null });
  }
  const resolveManager = (e: OdooEmployee): { ok: true; node: string | null } | { ok: false } => {
    if (e.managerId === null) return { ok: true, node: null };
    const m = empById.get(e.managerId);
    const nid = m && m.active ? nodeOfEmployee(m.id) : null;
    return nid ? { ok: true, node: nid } : { ok: false };
  };

  for (const e of sorted) {
    const u = matched.get(e.id);
    if (u && e.active && full && !u.disabled) {
      const r = resolveManager(e);
      const node = nodes.get(`u:${u.id}`)!;
      node.employeeId = e.id;
      if (!r.ok) skipped.push({ employeeId: e.id, userId: u.id, reason: 'managerNoAccount' });
      const target = r.ok ? r.node : null;
      const cur = u.managerId ? `u:${u.managerId}` : null;
      if (target !== cur) { node.proposed = true; node.desired = target ? refOf(target) : null; }
    } else if (u) {
      nodes.get(`u:${u.id}`)!.employeeId = e.id;
    } else if (creating.has(e.id)) {
      const r = resolveManager(e);
      if (!r.ok) skipped.push({ employeeId: e.id, reason: 'managerNoAccount' });
      nodes.set(`e:${e.id}`, { id: `e:${e.id}`, employeeId: e.id, proposed: true, desired: r.ok && r.node ? refOf(r.node) : null, current: null });
    }
  }

  // Cycle detection on the post-change graph; revert members until no unreverted node sits on a cycle.
  const edge = (n: Node, reverted: Set<string>): string | null => {
    if (reverted.has(n.id)) return n.current;
    if (!n.proposed) return n.current;
    const d = n.desired;
    return d ? ('userId' in d ? `u:${d.userId}` : `e:${d.employeeId}`) : null;
  };
  const reverted = new Set<string>();
  for (;;) {
    const onCycle = new Set<string>();
    const state = new Map<string, number>();
    for (const start of nodes.keys()) {
      const path: string[] = [];
      let cur: string | null = start;
      while (cur && nodes.has(cur) && !state.has(cur)) {
        state.set(cur, 1);
        path.push(cur);
        cur = edge(nodes.get(cur)!, reverted);
      }
      if (cur && state.get(cur) === 1) {
        const i = path.indexOf(cur);
        if (i >= 0) for (const p of path.slice(i)) onCycle.add(p);
      }
      for (const p of path) state.set(p, 2);
    }
    const fresh = [...onCycle].filter((id) => !reverted.has(id));
    if (fresh.length === 0) break;
    for (const id of fresh) reverted.add(id);
  }
  for (const id of [...reverted].sort()) {
    const n = nodes.get(id)!;
    skipped.push(n.user ? { userId: n.user.id, ...(n.employeeId >= 0 ? { employeeId: n.employeeId } : {}), reason: 'managerCycle' } : { employeeId: n.employeeId, reason: 'managerCycle' });
  }

  // Emit creates and manager/name/level changes
  for (const e of toCreate) {
    const n = nodes.get(`e:${e.id}`)!;
    changes.push({
      key: `create:e${e.id}`,
      type: 'create',
      employeeId: e.id,
      email: normEmail(e.email)!,
      displayName: e.name,
      level: opts.titleMappingEnabled ? mapTitle(e.jobTitle, opts.mappings) : 'member',
      managerRef: reverted.has(n.id) ? null : n.desired,
    });
  }
  if (full) {
    for (const e of sorted) {
      const u = matched.get(e.id);
      if (!u || !e.active || u.disabled) continue;
      const n = nodes.get(`u:${u.id}`)!;
      if (n.proposed && !reverted.has(n.id)) {
        changes.push({ key: `manager:${u.id}`, type: 'updateManager', userId: u.id, from: u.managerId, to: n.desired });
      }
      if (e.name !== u.displayName) changes.push({ key: `name:${u.id}`, type: 'updateName', userId: u.id, from: u.displayName, to: e.name });
      if (opts.titleMappingEnabled) {
        const lvl = mapTitle(e.jobTitle, opts.mappings);
        if (lvl !== u.level) changes.push({ key: `level:${u.id}`, type: 'updateLevel', userId: u.id, from: u.level, to: lvl });
      }
    }
  }

  changes.sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  skipped.sort((a, b) => (a.employeeId ?? 0) - (b.employeeId ?? 0) || (a.userId ?? '').localeCompare(b.userId ?? '') || a.reason.localeCompare(b.reason));
  untouchedLocal.sort();
  return { changes, skipped, untouchedLocal };
}
