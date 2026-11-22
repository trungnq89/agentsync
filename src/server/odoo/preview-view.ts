import type { Db } from '@/db/client';
import { users } from '@/db/schema';
import type { Change, ManagerRef, Skip, DiffResult } from './diff';
import type { OdooMode } from './settings';

export type ChangeRow = {
  key: string;
  type: Change['type'];
  name: string;
  email?: string;
  level?: string;
  from?: string | null;
  to?: string | null;
  /** key of the `create` this row depends on (updateManager only). */
  dependsOnKey?: string;
  /** For a `create` whose manager is created in the same run: that manager's create key and name. */
  managerCreate?: { key: string; name: string };
};
export type PreviewView = {
  runId: string;
  mode: OdooMode;
  rows: ChangeRow[];
  skipped: { name: string | null; employeeId?: number; reason: Skip['reason'] }[];
  untouched: string[];
};

/** Resolves ids in a diff to display names for the admin UI. Call only after authorization. */
export async function buildPreviewView(db: Db, runId: string, mode: OdooMode, res: DiffResult): Promise<PreviewView> {
  const all = await db.select().from(users);
  const nameOf = new Map(all.map((u) => [u.id, u.displayName]));
  const userOfEmp = new Map(all.filter((u) => u.odooEmployeeId !== null).map((u) => [u.odooEmployeeId as number, u.displayName]));
  const createByEmp = new Map<number, Extract<Change, { type: 'create' }>>();
  for (const c of res.changes) if (c.type === 'create') createByEmp.set(c.employeeId, c);
  const user = (id: string) => nameOf.get(id) ?? id;
  const ref = (r: ManagerRef | null): string | null => {
    if (!r) return null;
    if ('userId' in r) return user(r.userId);
    return createByEmp.get(r.employeeId)?.displayName ?? userOfEmp.get(r.employeeId) ?? `#${r.employeeId}`;
  };
  const rows: ChangeRow[] = res.changes.map((c) => {
    switch (c.type) {
      case 'create': {
        const m = c.managerRef && 'employeeId' in c.managerRef ? createByEmp.get(c.managerRef.employeeId) : undefined;
        return {
          key: c.key, type: c.type, name: c.displayName, email: c.email, level: c.level, to: ref(c.managerRef),
          ...(m ? { managerCreate: { key: m.key, name: m.displayName } } : {}),
        };
      }
      case 'link':
        return { key: c.key, type: c.type, name: user(c.userId) };
      case 'updateManager':
        return {
          key: c.key, type: c.type, name: user(c.userId), from: c.from ? user(c.from) : null, to: ref(c.to),
          ...(c.to && 'employeeId' in c.to && createByEmp.has(c.to.employeeId) ? { dependsOnKey: createByEmp.get(c.to.employeeId)!.key } : {}),
        };
      case 'updateName':
        return { key: c.key, type: c.type, name: user(c.userId), from: c.from, to: c.to };
      case 'updateLevel':
        return { key: c.key, type: c.type, name: user(c.userId), from: c.from, to: c.to };
      case 'disable':
        return { key: c.key, type: c.type, name: user(c.userId) };
    }
  });
  const skipped = res.skipped.map((s) => ({
    name: s.name ?? (s.userId ? user(s.userId) : null),
    ...(s.employeeId !== undefined ? { employeeId: s.employeeId } : {}),
    reason: s.reason,
  }));
  const untouched = res.untouchedLocal.map((id) => all.find((u) => u.id === id)?.username ?? id);
  return { runId, mode, rows, skipped, untouched };
}
