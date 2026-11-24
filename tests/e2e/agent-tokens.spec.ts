import { expect, test, type Page } from '@playwright/test';
import { loginAs } from '../helpers/auth';
import { resetE2eDb, seedOrg } from '../helpers/e2e-db';

const ADMIN = { username: 'admin', password: 'admin-password-1' };
const PW = 'user-password-1';

test.beforeEach(async () => {
  await resetE2eDb(ADMIN);
  await seedOrg();
});

async function noHorizontalScroll(page: Page) {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/settings');
  await expect(page.getByTestId('token-form')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test('member without reports: no scope select, 30-day token shows badges', async ({ page }) => {
  await loginAs(page, 'loner1', PW);
  await page.goto('/settings');
  const form = page.getByTestId('token-form');
  await expect(form.locator('select[name="days"]')).toHaveValue('90');
  await expect(form.locator('select[name="scope"]')).toHaveCount(0);
  await form.getByLabel('Nhãn token').fill('Laptop');
  await form.locator('select[name="days"]').selectOption('30');
  await form.getByRole('button', { name: 'Tạo token' }).click();
  await expect(page.getByTestId('new-token')).toBeVisible();
  const list = page.getByTestId('token-list');
  await expect(list.getByText('member', { exact: true })).toBeVisible();
  await expect(list.getByText('Hết hạn sau 30 ngày')).toBeVisible();
});

test('a tampered scope=manager from someone without reports shows a form-level error', async ({ page }) => {
  await loginAs(page, 'loner1', PW);
  await page.goto('/settings');
  const form = page.getByTestId('token-form');
  await form.getByLabel('Nhãn token').fill('Hack');
  await form.evaluate((f) => {
    const i = document.createElement('input');
    i.type = 'hidden';
    i.name = 'scope';
    i.value = 'manager';
    f.appendChild(i);
  });
  await form.getByRole('button', { name: 'Tạo token' }).click();
  await expect(form.getByRole('alert')).toContainText('cấp dưới trực tiếp');
  await expect(page.getByTestId('new-token')).toHaveCount(0);
});

test('manager sees the scope select and can create a manager token', async ({ page }) => {
  await loginAs(page, 'manager1', PW);
  await page.goto('/settings');
  const form = page.getByTestId('token-form');
  await expect(form.locator('select[name="scope"]')).toHaveValue('member');
  await form.getByLabel('Nhãn token').fill('Team agent');
  await form.locator('select[name="scope"]').selectOption('manager');
  await form.getByRole('button', { name: 'Tạo token' }).click();
  await expect(page.getByTestId('new-token')).toBeVisible();
  await expect(page.getByTestId('token-list').getByText('manager', { exact: true })).toBeVisible();
  await expect(page.getByTestId('token-list').getByText('Hết hạn sau 90 ngày')).toBeVisible();
});

for (const locale of ['vi', 'en'] as const) {
  test(`no horizontal scroll at 375px (${locale}), with a long-label token`, async ({ page }) => {
    await loginAs(page, 'manager1', PW, locale);
    await noHorizontalScroll(page);
    const form = page.getByTestId('token-form');
    await form.locator('input[name="label"]').fill('L'.repeat(60));
    await form.locator('select[name="scope"]').selectOption('manager');
    await form.locator('button[type="submit"]').click();
    await expect(page.getByTestId('new-token')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
