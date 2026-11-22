import { expect, test } from '@playwright/test';
import { resetE2eDb } from '../helpers/e2e-db';
import { createDb } from '../../src/db/client';
import { users } from '../../src/db/schema';
import { hashPassword } from '../../src/server/auth/password';

const ADMIN = { username: 'admin', password: 'admin-password-1' };

test.beforeEach(async () => {
  await resetE2eDb(ADMIN);
  const db = createDb(process.env.DATABASE_URL_E2E!);
  try {
    await db.insert(users).values({
      username: 'newbie@x.com', email: 'newbie@x.com', displayName: 'Newbie', level: 'member',
      passwordHash: await hashPassword('temp-password-1'), mustChangePassword: true, source: 'odoo',
    });
  } finally {
    await db.$client.end();
  }
});

test('forced password change: email login lands on settings, / is blocked until changed', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập').fill('  Newbie@X.com ');
  await page.getByLabel('Mật khẩu').fill('temp-password-1');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(/\/settings\?mustChange=1$/);
  await expect(page.getByTestId('must-change-notice')).toBeVisible();

  await page.goto('/');
  await expect(page).toHaveURL(/\/settings\?mustChange=1$/);

  await page.getByLabel('Mật khẩu hiện tại').fill('temp-password-1');
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill('brand-new-pass-1');
  await page.getByLabel('Nhập lại mật khẩu mới').fill('brand-new-pass-1');
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(page.getByText('Đã đổi mật khẩu')).toBeVisible();

  await page.goto('/');
  await expect(page).toHaveURL('/');
});
