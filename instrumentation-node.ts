import { getDb } from '@/db';
import { runScheduledSyncIfDue } from '@/server/odoo/sync';

const INTERVAL_MS = 15 * 60 * 1000;

const g = globalThis as typeof globalThis & { __agentsyncOdooTimer?: ReturnType<typeof setInterval> };

if (process.env.NODE_ENV !== 'test' && !g.__agentsyncOdooTimer) {
  const tick = async () => {
    try {
      await runScheduledSyncIfDue(getDb(), new Date());
    } catch {
      // The scheduler must never take the server down.
    }
  };
  g.__agentsyncOdooTimer = setInterval(tick, INTERVAL_MS);
  g.__agentsyncOdooTimer.unref();
}
