import { expect, test, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { createDb } from '../../src/db/client';
import { tasks, users } from '../../src/db/schema';
import { postUpdate } from '../../src/server/tasks/activity';
import { loginAs } from '../helpers/auth';
import { resetE2eDb, seedOrg } from '../helpers/e2e-db';

const ADMIN = { username: 'admin', password: 'admin-password-1' };
const PW = 'user-password-1';
const TITLE = 'Việc công khai của leader';
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

let ids: Awaited<ReturnType<typeof seedOrg>>;

test.beforeEach(async () => {
  await resetE2eDb(ADMIN);
  ids = await seedOrg();
});

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(process.env.DATABASE_URL_E2E!);
  try {
    return await fn(db);
  } finally {
    await db.$client.end();
  }
}

const taskId = () => withDb(async (db) => (await db.select().from(tasks).where(eq(tasks.title, TITLE)))[0].id);

/** The leader reports a step as done (goes pending when the manager is the confirmer). */
async function leaderReports(step: string) {
  const id = await taskId();
  await withDb(async (db) => {
    const [leader] = await db.select().from(users).where(eq(users.id, ids.leaderId));
    await postUpdate(db, leader, id, { body: 'Xong bước', source: 'auto', stepsCompleted: [step] });
  });
  return id;
}

async function managerConfirms(page: Page) {
  await page.goto(`/people/${ids.leaderId}`);
  await page.getByLabel('Tôi (quản lý) duyệt').check();
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.locator('[data-sonner-toast]')).toContainText('Đã lưu');
}

test('manager sets confirmer, then approves, rejects and approves all', async ({ page }) => {
  await loginAs(page, 'manager1', PW);
  await managerConfirms(page);

  const id = await leaderReports('Bước 1');
  await page.goto('/');
  await expect(page.getByTestId('attention')).toContainText('Có 1 bước đang chờ bạn duyệt');
  await expect(page.getByTestId('person-card').filter({ hasText: 'Minh Leader' })).toContainText('1 chờ duyệt');

  await page.goto(`/tasks/${id}`);
  const step1 = page.getByTestId('plan-step').filter({ hasText: 'Bước 1' });
  await expect(step1).toHaveAttribute('data-status', 'pending_approval');
  await expect(step1).toContainText('Chờ duyệt');
  await step1.getByTestId('step-approve').click();
  await expect(step1).toHaveAttribute('data-status', 'done');
  await expect(step1.getByTestId('step-confirmed')).toContainText('✓ Quản lý duyệt');

  await leaderReports('Bước 2');
  await page.goto(`/tasks/${id}`);
  const step2 = page.getByTestId('plan-step').filter({ hasText: 'Bước 2' });
  await expect(step2).toHaveAttribute('data-status', 'pending_approval');
  await step2.getByTestId('step-reject').click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: 'Trả lại' }).click();
  await expect(dialog.getByLabel('Ghi chú')).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog).toContainText('ghi chú');
  await dialog.getByLabel('Ghi chú').fill('Chưa có test');
  await dialog.getByRole('button', { name: 'Trả lại' }).click();
  await expect(step2).toHaveAttribute('data-status', 'doing');

  await leaderReports('Bước 2');
  await page.goto(`/tasks/${id}`);
  await expect(step2).toHaveAttribute('data-status', 'pending_approval');
  await page.getByTestId('approve-all').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Duyệt tất cả' }).click();
  await expect(step2).toHaveAttribute('data-status', 'done');
  await expect(page.getByTestId('approve-all')).toHaveCount(0);
});

test('a repeated approval shows an info toast, not an error', async ({ page, browser }) => {
  await loginAs(page, 'manager1', PW);
  await managerConfirms(page);
  const id = await leaderReports('Bước 1');
  await page.goto(`/tasks/${id}`);
  // A second manager tab approves first; the stale page then clicks Approve again.
  const other = await browser.newPage();
  await loginAs(other, 'manager1', PW);
  await other.goto(`/tasks/${id}`);
  await other.getByTestId('step-approve').click();
  await expect(other.getByTestId('plan-step').filter({ hasText: 'Bước 1' })).toHaveAttribute('data-status', 'done');
  await other.close();
  await page.getByTestId('step-approve').click();
  await expect(page.locator('[data-sonner-toast]')).toContainText('Không có bước nào đang chờ duyệt');
  await expect(page.locator('p[role="alert"]')).toHaveCount(0);
});

test('a member does not see the confirmer card', async ({ page }) => {
  await loginAs(page, 'leader1', PW);
  await page.goto(`/people/${ids.leaderId}`);
  await expect(page.getByRole('heading', { name: 'Minh Leader' })).toBeVisible();
  await expect(page.getByTestId('confirmer-card')).toHaveCount(0);
  const res = await page.goto(`/people/${ids.managerId}`);
  expect(res?.status()).toBe(404);
});

for (const locale of ['vi', 'en'] as const) {
  test(`no horizontal scroll at 375px with pending steps (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await loginAs(page, 'manager1', PW, locale);
    await page.goto(`/people/${ids.leaderId}`);
    await page.locator('input[name="confirmer"][value="manager"]').check();
    await page.getByTestId('confirmer-card').getByRole('button').click();
    await expect(page.locator('[data-sonner-toast]')).toBeVisible();
    expect(await overflow(page)).toBe(false);
    const id = await leaderReports('Bước 1');
    await page.goto('/');
    expect(await overflow(page)).toBe(false);
    await page.goto(`/tasks/${id}`);
    await expect(page.getByTestId('step-approve')).toBeVisible();
    expect(await overflow(page)).toBe(false);
    await page.getByTestId('step-reject').click();
    expect(await overflow(page)).toBe(false);
  });
}
