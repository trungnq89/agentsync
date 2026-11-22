import { expect, test, type Page } from '@playwright/test';
import { loginAs } from '../helpers/auth';
import { resetE2eDb } from '../helpers/e2e-db';
import { startFakeOdoo, type FakeOdooEmployee } from '../helpers/fake-odoo';

const ADMIN = { username: 'admin', password: 'admin-password-1' };
const API_KEY = 'super-secret-api-key-xyz';

const emp = (id: number, name: string, email: string, parent?: [number, string]): FakeOdooEmployee => ({
  id, name, work_email: email, parent_id: parent ?? false, job_title: false, job_id: false, active: true,
});
const EMPLOYEES = [
  emp(1, 'Alice Boss', 'alice@x.com'),
  emp(2, 'Bob Dev', 'bob@x.com', [1, 'Alice Boss']),
  emp(3, 'Carol Dev', 'carol@x.com', [1, 'Alice Boss']),
];

let odoo: Awaited<ReturnType<typeof startFakeOdoo>>;
test.beforeAll(async () => {
  odoo = await startFakeOdoo({ db: 'hr', login: 'api@x.com', apiKey: API_KEY, employees: EMPLOYEES });
});
test.afterAll(async () => {
  await odoo.close();
});
test.beforeEach(async () => {
  await resetE2eDb(ADMIN);
});

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

async function saveConnection(page: Page) {
  const form = page.getByTestId('odoo-connection-form');
  await form.getByLabel('Địa chỉ Odoo').fill(odoo.url);
  await form.getByLabel('Cơ sở dữ liệu').fill('hr');
  await form.getByLabel('Tài khoản đăng nhập').fill('api@x.com');
  await form.getByLabel('Khóa API').fill(API_KEY);
  await form.getByRole('button', { name: 'Lưu kết nối' }).click();
  await expect(page.getByText('Đã lưu kết nối')).toBeVisible();
}

async function chooseMode(page: Page, option: string) {
  const form = page.getByTestId('odoo-mode-form');
  await form.getByLabel('Chế độ', { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await form.getByRole('button', { name: 'Lưu chế độ' }).click();
  await expect(page.getByText('Đã lưu chế độ')).toBeVisible();
}

async function applyPreview(page: Page) {
  await page.getByRole('button', { name: 'Xem trước' }).click();
  await expect(page.getByTestId('change-row').first()).toBeVisible();
}
async function confirmApply(page: Page) {
  await page.getByRole('button', { name: 'Áp dụng' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Áp dụng' }).click();
}

test('connection, review-mode apply with unticked row, one-time credentials, forced change', async ({ page }) => {
  await loginAs(page, ADMIN.username, ADMIN.password);
  await page.goto('/admin/odoo');
  await saveConnection(page);

  // API key is never rendered back; the saved state is shown.
  await page.reload();
  expect(await page.content()).not.toContain(API_KEY);
  await expect(page.getByTestId('odoo-connection-form').getByLabel('Khóa API')).toHaveValue('');
  await expect(page.getByText('Đã lưu khóa API', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Kiểm tra kết nối' }).click();
  await expect(page.getByTestId('odoo-test-result')).toContainText('3');

  await applyPreview(page);
  await page.getByTestId('change-row').filter({ hasText: 'Carol Dev' }).getByRole('checkbox').click();
  await confirmApply(page);

  const creds = page.getByTestId('odoo-credentials');
  await expect(creds).toBeVisible();
  await expect(creds.getByTestId('credential-row')).toHaveCount(2);
  await expect(creds).toContainText('alice@x.com');
  await expect(creds).toContainText('bob@x.com');
  await expect(creds).not.toContainText('carol@x.com');
  const password = (await creds.getByTestId('credential-row').filter({ hasText: 'bob@x.com' }).getByTestId('credential-password').textContent())!.trim();
  expect(password).toHaveLength(16);

  await page.reload();
  await expect(page.getByTestId('odoo-credentials')).toHaveCount(0);

  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập').fill('Bob@X.com');
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(/\/settings\?mustChange=1$/);
  await expect(page.getByTestId('must-change-notice')).toBeVisible();
  // Only the forced-change notice and the password card are shown.
  await expect(page.getByRole('heading', { name: 'Đổi mật khẩu' })).toBeVisible();
  await expect(page.getByText('Gửi cập nhật')).toHaveCount(0);
  await expect(page.getByText('Token cho agent')).toHaveCount(0);
});

test('full mode with an admin missing from Odoo keeps the admin working', async ({ page }) => {
  await loginAs(page, ADMIN.username, ADMIN.password);
  await page.goto('/admin/odoo');
  await saveConnection(page);
  await chooseMode(page, 'Toàn bộ');
  await applyPreview(page);
  await expect(page.getByTestId('full-warning')).toBeVisible();
  await confirmApply(page);
  await expect(page.getByTestId('odoo-result')).toBeVisible();
  await page.context().clearCookies();
  await loginAs(page, ADMIN.username, ADMIN.password);
});

test('unticking a manager create warns on the creates that depend on it', async ({ page }) => {
  await loginAs(page, ADMIN.username, ADMIN.password);
  await page.goto('/admin/odoo');
  await saveConnection(page);
  await applyPreview(page);
  await page.getByTestId('change-row').filter({ hasText: 'Alice Boss' }).getByRole('checkbox').click();
  await expect(page.getByTestId('change-row').filter({ hasText: 'Bob Dev' })).toContainText('Alice Boss chưa được chọn');
});

for (const locale of ['vi', 'en'] as const) {
  test(`no horizontal scroll at 375px (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await loginAs(page, ADMIN.username, ADMIN.password, locale);
    await page.goto('/admin/odoo');
    const name = locale === 'vi' ? 'Lưu kết nối' : 'Save connection';
    const form = page.getByTestId('odoo-connection-form');
    const labels = locale === 'vi' ? ['Địa chỉ Odoo', 'Cơ sở dữ liệu', 'Tài khoản đăng nhập', 'Khóa API'] : ['Odoo address', 'Database', 'Login account', 'API key'];
    for (const [i, v] of [odoo.url, 'hr', 'api@x.com', API_KEY].entries()) await form.getByLabel(labels[i]).fill(v);
    await form.getByRole('button', { name }).click();
    await expect(page.getByText(locale === 'vi' ? 'Đã lưu kết nối' : 'Connection saved')).toBeVisible();
    await page.getByRole('button', { name: locale === 'vi' ? 'Xem trước' : 'Preview' }).click();
    await expect(page.getByTestId('change-row').first()).toBeVisible();
    expect(await overflow(page)).toBe(false);
  });
}
