const INTERVAL_MS = 15 * 60 * 1000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV === 'test') return;
  const { getDb } = await import('@/db');
  const { runScheduledSyncIfDue } = await import('@/server/odoo/sync');
  const tick = async () => {
    try {
      await runScheduledSyncIfDue(getDb(), new Date());
    } catch {
      // The scheduler must never take the server down.
    }
  };
  setInterval(tick, INTERVAL_MS).unref();
}
