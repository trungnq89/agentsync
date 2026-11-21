import { expect, test, type Page } from '@playwright/test';
import { resetE2eDb } from '../helpers/e2e-db';

const ADMIN = { username: 'admin', password: 'admin-password-1' };

async function login(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập').fill(username);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
}

async function logout(page: Page) {
  await page.getByTestId('user-menu').click();
  await page.getByTestId('logout').click();
}

async function createUser(page: Page, f: { username: string; name: string; level: string; manager?: string }) {
  const form = page.getByTestId('create-user');
  await form.getByLabel('Tên đăng nhập').fill(f.username);
  await form.getByLabel('Tên hiển thị').fill(f.name);
  await form.getByLabel('Mật khẩu').fill('user-password-1');
  await form.getByLabel('Cấp').selectOption({ label: f.level });
  if (f.manager) await form.getByLabel('Quản lý').selectOption({ label: f.manager });
  await form.getByRole('button', { name: 'Tạo' }).click();
  await expect(form.getByRole('status')).toContainText(`Đã tạo người dùng ${f.username}`);
}

test.beforeEach(async () => {
  await resetE2eDb(ADMIN);
});

test('unauthenticated users are redirected to /login', async ({ page }) => {
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/login$/);
});

test('wrong password shows an error', async ({ page }) => {
  await login(page, ADMIN.username, 'nope');
  await expect(page.locator('form').getByRole('alert')).toContainText('Sai tên đăng nhập hoặc mật khẩu');
});

test('admin creates users, leader logs in and creates a token shown once', async ({ page }) => {
  await login(page, ADMIN.username, ADMIN.password);
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('nav-admin')).toBeVisible();

  await page.getByTestId('nav-admin').click();
  await createUser(page, { username: 'manager1', name: 'Manager Một', level: 'Manager' });
  await createUser(page, { username: 'leader1', name: 'Leader Một', level: 'Leader', manager: 'Manager Một' });
  const mgrId = await page.getByTestId('user-manager1').locator('input[name=userId]').first().inputValue();
  await expect(page.getByTestId('user-leader1').getByLabel('Quản lý')).toHaveValue(mgrId);

  await logout(page);
  await expect(page).toHaveURL(/\/login$/);

  await login(page, 'leader1', 'user-password-1');
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('nav-admin')).toHaveCount(0);

  await page.getByTestId('nav-settings').click();
  await page.getByLabel('Nhãn token').fill('Laptop');
  await page.getByRole('button', { name: 'Tạo token' }).click();
  const plaintext = page.getByTestId('token-plaintext');
  await expect(plaintext).toHaveText(/^ags_/);
  const token = (await plaintext.textContent())!;
  await expect(page.getByTestId('new-token')).toContainText('/api/mcp');
  await expect(page.getByTestId('new-token')).toContainText('claude mcp add --transport http agentsync');

  await page.reload();
  await expect(page.getByTestId('token-plaintext')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(token);
  await expect(page.getByTestId('token-list')).toContainText('Laptop');
  await expect(page.getByTestId('token-list')).toContainText(token.slice(0, 8));
});

test('non-admin cannot open /admin', async ({ page }) => {
  await login(page, ADMIN.username, ADMIN.password);
  await page.getByTestId('nav-admin').click();
  await createUser(page, { username: 'plain', name: 'Plain', level: 'Thành viên' });
  await logout(page);
  await login(page, 'plain', 'user-password-1');
  await expect(page).toHaveURL('/');
  await page.goto('/admin');
  await expect(page).toHaveURL('/');
});

test('/api/mcp is not redirected to login', async ({ request }) => {
  const res = await request.post('/api/mcp', { data: {}, maxRedirects: 0 });
  expect(res.status()).toBe(401);
});

test('no horizontal scroll at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await page.goto('/login');
  expect(await overflow()).toBe(false);
  await login(page, ADMIN.username, ADMIN.password);
  await expect(page).toHaveURL('/');
  for (const path of ['/', '/settings', '/admin']) {
    await page.goto(path);
    expect(await overflow(), path).toBe(false);
  }
});

test('saving a report keeps a disabled manager selected', async ({ page }) => {
  await login(page, ADMIN.username, ADMIN.password);
  await page.getByTestId('nav-admin').click();
  await createUser(page, { username: 'mgr', name: 'Sếp', level: 'Manager' });
  await createUser(page, { username: 'rep', name: 'Nhân viên', level: 'Leader', manager: 'Sếp' });
  const mgrId = await page.getByTestId('user-mgr').locator('input[name=userId]').first().inputValue();

  const mgr = page.getByTestId('user-mgr');
  await mgr.getByLabel('Vô hiệu hóa').check();
  await mgr.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(mgr.getByRole('status')).toHaveText('Đã lưu.');

  await page.reload();
  const rep = page.getByTestId('user-rep');
  await expect(rep.getByLabel('Quản lý')).toHaveValue(mgrId);
  await rep.getByLabel('Tên', { exact: true }).fill('Nhân viên mới');
  await rep.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(rep.getByRole('status')).toHaveText('Đã lưu.');
  await page.reload();
  await expect(page.getByTestId('user-rep').getByLabel('Quản lý')).toHaveValue(mgrId);
  await expect(page.getByTestId('user-rep').getByLabel('Tên', { exact: true })).toHaveValue('Nhân viên mới');
});
