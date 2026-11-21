import { expect, test, type Page } from '@playwright/test';
import { loginAs } from '../helpers/auth';
import { resetE2eDb } from '../helpers/e2e-db';

const ADMIN = { username: 'admin', password: 'admin-password-1' };

async function logout(page: Page) {
  await page.getByTestId('user-menu').click();
  await page.getByTestId('logout').click();
}

async function choose(page: Page, scope: ReturnType<Page['locator']>, label: string, option: string) {
  await scope.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function createUser(page: Page, f: { username: string; name: string; level: string; manager?: string }) {
  const form = page.getByTestId('create-user');
  await form.getByLabel('Tên đăng nhập').fill(f.username);
  await form.getByLabel('Tên hiển thị').fill(f.name);
  await form.getByLabel('Mật khẩu').fill('user-password-1');
  await choose(page, form, 'Cấp', f.level);
  await choose(page, form, 'Quản lý', f.manager ?? 'Không có');
  await form.getByRole('button', { name: 'Tạo' }).click();
  await expect(page.getByText(`Đã tạo người dùng ${f.username}`)).toBeVisible();
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

test.beforeEach(async () => {
  await resetE2eDb(ADMIN);
});

test('unauthenticated users are redirected to /login', async ({ page }) => {
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/login$/);
});

test('wrong password shows an error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập').fill(ADMIN.username);
  await page.getByLabel('Mật khẩu').fill('nope');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText('Sai tên đăng nhập hoặc mật khẩu');
});

test('admin creates users, leader logs in and creates a token shown once', async ({ page }) => {
  await loginAs(page, ADMIN.username, ADMIN.password);
  await expect(page.getByTestId('nav-admin')).toBeVisible();

  await page.getByTestId('nav-admin').click();
  await createUser(page, { username: 'manager1', name: 'Manager Một', level: 'Manager' });
  await createUser(page, { username: 'leader1', name: 'Leader Một', level: 'Leader', manager: 'Manager Một' });
  await expect(page.getByTestId('user-leader1')).toContainText('Manager Một');

  await logout(page);
  await expect(page).toHaveURL(/\/login$/);

  await loginAs(page, 'leader1', 'user-password-1');
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
  await loginAs(page, ADMIN.username, ADMIN.password);
  await page.getByTestId('nav-admin').click();
  await createUser(page, { username: 'plain', name: 'Plain', level: 'Thành viên' });
  await logout(page);
  await loginAs(page, 'plain', 'user-password-1');
  await page.goto('/admin');
  await expect(page).toHaveURL('/');
});

test('/api/mcp is not redirected to login', async ({ request }) => {
  const res = await request.post('/api/mcp', { data: {}, maxRedirects: 0 });
  expect(res.status()).toBe(401);
});

test('a short password is reported under the password field, in Vietnamese', async ({ page }) => {
  await loginAs(page, ADMIN.username, ADMIN.password);
  await page.getByTestId('nav-admin').click();
  const form = page.getByTestId('create-user');
  await form.getByLabel('Tên đăng nhập').fill('shorty');
  await form.getByLabel('Tên hiển thị').fill('Shorty');
  await form.getByLabel('Mật khẩu').fill('abc');
  await form.getByRole('button', { name: 'Tạo' }).click();
  const pw = form.getByLabel('Mật khẩu');
  await expect(pw).toHaveAttribute('aria-invalid', 'true');
  await expect(form).toContainText('Mật khẩu phải có ít nhất 8 ký tự');
  await expect(form.getByLabel('Tên đăng nhập')).not.toHaveAttribute('aria-invalid', 'true');
});

test('a duplicate username is reported under the username field', async ({ page }) => {
  await loginAs(page, ADMIN.username, ADMIN.password);
  await page.getByTestId('nav-admin').click();
  const form = page.getByTestId('create-user');
  await form.getByLabel('Tên đăng nhập').fill(ADMIN.username);
  await form.getByLabel('Tên hiển thị').fill('Dup');
  await form.getByLabel('Mật khẩu').fill('user-password-1');
  await form.getByRole('button', { name: 'Tạo' }).click();
  await expect(form.getByLabel('Tên đăng nhập')).toHaveAttribute('aria-invalid', 'true');
  await expect(form).toContainText('Tên đăng nhập đã tồn tại');
});

test('changing the language in Settings switches the page to English', async ({ page }) => {
  await loginAs(page, ADMIN.username, ADMIN.password);
  await page.getByTestId('nav-settings').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cài đặt');
  await choose(page, page.locator('main'), 'Ngôn ngữ', 'Tiếng Anh');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('revoking a token needs confirmation; the new token can be copied', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await loginAs(page, ADMIN.username, ADMIN.password);
  await page.getByTestId('nav-settings').click();
  await page.getByLabel('Nhãn token').fill('Laptop');
  await page.getByRole('button', { name: 'Tạo token' }).click();
  const token = (await page.getByTestId('token-plaintext').textContent())!;
  await page.getByTestId('copy-token').click();
  await expect(page.getByText('Đã sao chép token')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(token);

  const list = page.getByTestId('token-list');
  await list.getByRole('button', { name: 'Thu hồi' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Hủy' }).click();
  await expect(list).not.toContainText('Đã thu hồi');

  await list.getByRole('button', { name: 'Thu hồi' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Thu hồi' }).click();
  await expect(page.getByText('Đã thu hồi token')).toBeVisible();
  await expect(list).toContainText('Đã thu hồi');
});

for (const locale of ['vi', 'en'] as const) {
  test(`no horizontal scroll at 375px (${locale})`, async ({ page }) => {
    await loginAs(page, ADMIN.username, ADMIN.password);
    await page.getByTestId('nav-admin').click();
    await createUser(page, {
      username: 'longname',
      name: 'Nguyễn Thị Rất Rất Rất Dài Tên Để Kiểm Tra Bố Cục Trên Màn Hình Nhỏ',
      level: 'Thành viên',
    });
    await page.setViewportSize({ width: 375, height: 800 });
    if (locale === 'en') {
      await page.getByTestId('lang-switch').click();
      await page.getByRole('menuitemradio', { name: 'Tiếng Anh', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    }
    for (const path of ['/', '/settings', '/admin']) {
      await page.goto(path);
      expect(await overflow(page), `${locale} ${path}`).toBe(false);
    }
    await page.goto('/admin');
    await page.getByTestId('user-card-longname').getByRole('button').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await overflow(page), `${locale} dialog`).toBe(false);
  });
}

test('saving a report keeps a disabled manager selected', async ({ page }) => {
  await loginAs(page, ADMIN.username, ADMIN.password);
  await page.getByTestId('nav-admin').click();
  await createUser(page, { username: 'mgr', name: 'Sếp', level: 'Manager' });
  await createUser(page, { username: 'rep', name: 'Nhân viên', level: 'Leader', manager: 'Sếp' });

  await page.getByTestId('user-mgr').getByRole('button', { name: 'Vô hiệu hóa' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Vô hiệu hóa' }).click();
  await expect(page.getByText('Đã vô hiệu hóa người dùng')).toBeVisible();

  await page.reload();
  const rep = page.getByTestId('user-rep');
  await rep.getByRole('button', { name: 'Sửa' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Quản lý', { exact: true })).toContainText('Sếp (đã vô hiệu hóa)');
  await dialog.getByLabel('Tên hiển thị').fill('Nhân viên mới');
  await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu', { exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('user-rep')).toContainText('Nhân viên mới');
  await expect(page.getByTestId('user-rep')).toContainText('Sếp');
  await page.getByTestId('user-rep').getByRole('button', { name: 'Sửa' }).click();
  await expect(page.getByRole('dialog').getByLabel('Quản lý', { exact: true })).toContainText('Sếp (đã vô hiệu hóa)');
});
