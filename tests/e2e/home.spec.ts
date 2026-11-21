import { expect, test, type Page } from '@playwright/test';
import { resetE2eDb, seedOrg } from '../helpers/e2e-db';

const ADMIN = { username: 'admin', password: 'admin-password-1' };
const PW = 'user-password-1';

async function login(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập').fill(username);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL('/');
}

let ids: Awaited<ReturnType<typeof seedOrg>>;

test.beforeEach(async () => {
  await resetE2eDb(ADMIN);
  ids = await seedOrg();
});

test('director sees manager tier with blocked badge, not the leader', async ({ page }) => {
  await login(page, ADMIN.username, ADMIN.password);
  await expect(page.getByTestId('tier-manager')).toBeVisible();
  const card = page.getByTestId('person-card').filter({ hasText: 'Hà Manager' });
  await expect(card).toContainText('kẹt');
  await expect(card).toContainText('việc đang làm');
  await expect(page.getByTestId('attention')).toContainText('Đàm phán đối tác X');
  await expect(page.getByText('Minh Leader')).toHaveCount(0);

  await page.goto(`/people/${ids.leaderId}`);
  await expect(page.getByText('This page could not be found')).toBeVisible();
});

test('director opens manager timeline', async ({ page }) => {
  await login(page, ADMIN.username, ADMIN.password);
  await page.getByTestId('person-card').filter({ hasText: 'Hà Manager' }).click();
  await expect(page).toHaveURL(`/people/${ids.managerId}`);
  const row = page.getByTestId('timeline-row').filter({ hasText: 'Đàm phán đối tác X' });
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute('href', /\/tasks\//);
  await expect(page.getByTestId('timeline-today')).toBeVisible();
});

test('manager attention list never contains the leader private task', async ({ page }) => {
  await login(page, 'manager1', PW);
  await expect(page.getByTestId('tier-leader')).toContainText('Minh Leader');
  const body = await page.locator('body').innerText();
  expect(body).not.toContain('Việc riêng tư bí mật');
  expect(body).not.toContain('Vướng riêng tư');
  await page.goto(`/people/${ids.leaderId}`);
  await expect(page.getByTestId('timeline-row')).toHaveCount(1);
  await expect(page.getByText('Việc riêng tư bí mật')).toHaveCount(0);
});

test('no horizontal scroll at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, 'manager1', PW);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(await overflow()).toBe(false);
  await page.goto(`/people/${ids.leaderId}`);
  await expect(page.getByTestId('timeline-row')).toHaveCount(1);
  expect(await overflow()).toBe(false);
});

test('user with no reports and no tasks sees the install hint', async ({ page }) => {
  await login(page, 'loner1', PW);
  await expect(page.getByTestId('empty-hint')).toContainText('hướng dẫn');
});
