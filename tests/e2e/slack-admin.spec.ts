import { expect, test, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { loginAs } from '../helpers/auth';
import { createDb } from '../../src/db/client';
import { slackSettings, users } from '../../src/db/schema';
import { resetE2eDb, seedOrg } from '../helpers/e2e-db';

const ADMIN = { username: 'admin', password: 'admin-password-1' };
const MEMBER = { username: 'leader1', password: 'user-password-1' };
const TOKEN = 'xoxb-e2e-token';
const FAKE = 'http://127.0.0.1:3199';

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(process.env.DATABASE_URL_E2E!);
  try {
    return await fn(db);
  } finally {
    await db.$client.end();
  }
}
const posts = async () => ((await (await fetch(`${FAKE}/__posts`)).json()) as { posts: { channel: string; text: string }[] }).posts;
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

test.beforeEach(async () => {
  await resetE2eDb(ADMIN);
  await seedOrg();
  await fetch(`${FAKE}/__reset`, { method: 'POST' });
  await withDb((db) => db.update(users).set({ email: 'admin@e2e.test' }).where(eq(users.username, 'admin')));
});

test('admin saves the token, tests the connection, turns Slack on and sends a test', async ({ page }) => {
  await loginAs(page, ADMIN.username, ADMIN.password);
  await page.goto('/admin/slack');
  await expect(page.getByTestId('slack-privacy')).toContainText('được gửi sang Slack');
  await expect(page.getByTestId('slack-enable')).toBeDisabled();

  const form = page.getByTestId('slack-token-form');
  await form.getByLabel('Bot token').fill(TOKEN);
  await form.getByRole('button', { name: 'Lưu token' }).click();
  await expect(page.getByTestId('slack-token-saved')).toBeVisible();

  // The token is never rendered back.
  await page.reload();
  expect(await page.content()).not.toContain(TOKEN);
  await expect(page.getByTestId('slack-token-form').getByLabel('Bot token')).toHaveValue('');

  await page.getByRole('button', { name: 'Kiểm tra kết nối' }).click();
  await expect(page.getByTestId('slack-test-result')).toContainText('Acme Team');

  await page.getByTestId('slack-enable').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Bật' }).click();
  await expect(page.getByTestId('slack-status')).toContainText('đang bật');

  await page.getByRole('button', { name: 'Gửi thử cho tôi' }).click();
  await expect(page.getByText('Đã gửi tin thử')).toBeVisible();
  const sent = await posts();
  expect(sent).toHaveLength(1);
  expect(sent[0].channel).toBe('UADMIN');

  // Users without an email cannot be matched.
  const rows = page.getByTestId('slack-unmatched-row');
  await expect(rows.filter({ hasText: 'Người mới' })).toContainText('Chưa có email');
});

test('member changes the send time, then goes back to the company default', async ({ page }) => {
  await withDb((db) => db.update(slackSettings).set({ enabled: true }).where(eq(slackSettings.id, 1)));
  await loginAs(page, MEMBER.username, MEMBER.password);
  await page.goto('/settings');
  const form = page.getByTestId('digest-prefs-form');
  await expect(page.getByTestId('digest-not-linked')).toBeVisible();
  await expect(page.getByTestId('digest-inherited-time')).toBeVisible();

  await form.getByLabel('Giờ gửi').click();
  await page.getByRole('option', { name: '09:15', exact: true }).click();
  await form.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByText('Đã lưu thiết lập tóm tắt Slack')).toBeVisible();
  await expect(page.getByTestId('digest-inherited-time')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('digest-prefs-form').getByLabel('Giờ gửi')).toContainText('09:15');
  await expect(page.getByTestId('digest-inherited-time')).toHaveCount(0);
  await expect(page.getByTestId('digest-inherited-timezone')).toBeVisible();

  await page.getByRole('button', { name: 'Dùng mặc định' }).click();
  await expect(page.getByTestId('digest-inherited-time')).toBeVisible();
  await expect(page.getByTestId('digest-prefs-form').getByLabel('Giờ gửi')).toContainText('08:30');
});

test('member must keep at least one day, and the card is locked while Slack is off', async ({ page }) => {
  await loginAs(page, MEMBER.username, MEMBER.password);
  await page.goto('/settings');
  await expect(page.getByTestId('digest-slack-off')).toBeVisible();
  await expect(page.getByTestId('digest-prefs-form').getByRole('button', { name: 'Lưu' })).toBeDisabled();

  await withDb((db) => db.update(slackSettings).set({ enabled: true }).where(eq(slackSettings.id, 1)));
  await page.reload();
  const days = page.getByTestId('digest-days').getByRole('checkbox');
  for (let i = 0; i < 5; i++) await days.nth(i).click();
  await page.getByTestId('digest-prefs-form').getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByTestId('digest-prefs-form').getByText('Chọn ít nhất một ngày')).toBeVisible();
});

test('the Slack tab shows the last error and the pause', async ({ page }) => {
  await withDb((db) =>
    db.update(slackSettings).set({ lastError: 'slackAuthFailed', lastErrorAt: new Date(), pausedUntil: new Date(Date.now() + 10 * 60_000) }).where(eq(slackSettings.id, 1)),
  );
  await loginAs(page, ADMIN.username, ADMIN.password);
  await page.goto('/admin/slack');
  await expect(page.getByTestId('slack-last-error')).toContainText('Slack từ chối bot token');
  await expect(page.getByTestId('slack-paused')).toContainText('tạm dừng đến');
});

test('a member cannot open the Slack admin tab', async ({ page }) => {
  await loginAs(page, MEMBER.username, MEMBER.password);
  await page.goto('/admin/slack');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('slack-privacy')).toHaveCount(0);
});

for (const locale of ['vi', 'en'] as const) {
  test(`no horizontal scroll at 375px (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await withDb((db) => db.update(slackSettings).set({ enabled: true }).where(eq(slackSettings.id, 1)));
    await loginAs(page, MEMBER.username, MEMBER.password, locale);
    await page.goto('/settings');
    await expect(page.getByTestId('digest-prefs-card')).toBeVisible();
    expect(await overflow(page)).toBe(false);

    await page.context().clearCookies();
    await loginAs(page, ADMIN.username, ADMIN.password, locale);
    await page.goto('/admin/slack');
    await expect(page.getByTestId('slack-privacy')).toBeVisible();
    await expect(page.getByTestId('slack-unmatched-row').first()).toBeVisible();
    expect(await overflow(page)).toBe(false);
  });
}
