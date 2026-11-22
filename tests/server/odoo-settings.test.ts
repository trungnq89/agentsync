import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { testDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { getOdooSettingsView, loadOdooConnection, saveOdooSettings } from '@/server/odoo/settings';
import { DomainError } from '@/server/errors';

async function admin() { return makeUser({ isAdmin: true }); }
async function rejects(p: Promise<unknown>) {
  try { await p; } catch (e) { return e as DomainError; }
  throw new Error('expected rejection');
}

describe('odoo settings', () => {
  it('view never contains apiKey, hasApiKey true after save', async () => {
    const a = await admin();
    expect((await getOdooSettingsView(testDb, a)).hasApiKey).toBe(false);
    await saveOdooSettings(testDb, a, { url: 'https://odoo.example.com', database: 'db', login: 'me', apiKey: 'secret-key' });
    const view = await getOdooSettingsView(testDb, a);
    expect(view.hasApiKey).toBe(true);
    expect(view.encryptionReady).toBe(true);
    expect(view.mode).toBe('review');
    expect(JSON.stringify(view)).not.toContain('secret-key');
    expect(view).not.toHaveProperty('apiKey');
    expect(await loadOdooConnection(testDb)).toEqual({
      url: 'https://odoo.example.com', database: 'db', login: 'me', apiKey: 'secret-key',
    });
  });

  it('empty apiKey keeps previous', async () => {
    const a = await admin();
    await saveOdooSettings(testDb, a, { url: 'https://o.example.com', database: 'd', login: 'l', apiKey: 'k1' });
    await saveOdooSettings(testDb, a, { apiKey: '', mode: 'full' });
    await saveOdooSettings(testDb, a, { scheduleHours: 6 });
    expect((await loadOdooConnection(testDb))?.apiKey).toBe('k1');
    const v = await getOdooSettingsView(testDb, a);
    expect(v.mode).toBe('full');
    expect(v.scheduleHours).toBe(6);
  });

  it('non-admin FORBIDDEN', async () => {
    const u = await makeUser({ isAdmin: false });
    expect((await rejects(getOdooSettingsView(testDb, u))).code).toBe('FORBIDDEN');
    expect((await rejects(saveOdooSettings(testDb, u, { mode: 'full' }))).code).toBe('FORBIDDEN');
  });

  it('invalid url VALIDATION field url', async () => {
    const a = await admin();
    const e = await rejects(saveOdooSettings(testDb, a, { url: 'ftp://x.example.com' }));
    expect(e.code).toBe('VALIDATION');
    expect(e.params?.field).toBe('url');
  });

  it('51 mappings → VALIDATION field titleMappings', async () => {
    const a = await admin();
    const rows = Array.from({ length: 51 }, (_, i) => ({ pattern: `p${i}`, level: 'leader' as const }));
    const e = await rejects(saveOdooSettings(testDb, a, { titleMappings: rows }));
    expect(e.code).toBe('VALIDATION');
    expect(e.params?.field).toBe('titleMappings');
    const bad = await rejects(saveOdooSettings(testDb, a, { titleMappings: [{ pattern: ' ', level: 'leader' }] }));
    expect(bad.params?.field).toBe('titleMappings');
    const bad2 = await rejects(saveOdooSettings(testDb, a, { titleMappings: [{ pattern: 'x', level: 'boss' as never }] }));
    expect(bad2.params?.field).toBe('titleMappings');
  });

  it('users.email unique case-insensitive', async () => {
    await makeUser({ email: 'A@Example.com' });
    const err = await makeUser({ email: 'a@example.COM' }).catch((e) => e);
    const code = (err as { code?: string; cause?: { code?: string } }).code ?? (err as { cause?: { code?: string } }).cause?.code;
    expect(code).toBe('23505');
    await makeUser({ email: null });
    await makeUser({ email: null });
  });

  it('seeds the odoo_settings singleton', async () => {
    const rows = await testDb.execute(sql`select id, mode, schedule_hours from odoo_settings`);
    expect(rows.rows).toEqual([{ id: 1, mode: 'review', schedule_hours: 0 }]);
  });
});
