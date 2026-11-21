import { expect, test, type Page } from '@playwright/test';
import { resetE2eDb } from '../helpers/e2e-db';

const ADMIN = { username: 'admin', password: 'admin-password-1' };

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập').fill(ADMIN.username);
  await page.getByLabel('Mật khẩu').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL('/');
}

async function pick(page: Page, switchId: 'lang-switch' | 'theme-switch', option: string) {
  await page.getByTestId(switchId).click();
  await page.getByRole('menuitemradio', { name: option, exact: true }).click();
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

test.beforeEach(async () => {
  await resetE2eDb(ADMIN);
});

test('login page switches language while logged out', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByTestId('lang-switch')).toBeVisible();
  await expect(page.getByTestId('theme-switch')).toBeVisible();
  await pick(page, 'lang-switch', 'Tiếng Anh');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('language choice persists via DB across contexts', async ({ page, browser, baseURL }) => {
  await login(page);
  await pick(page, 'lang-switch', 'Tiếng Anh');
  await expect(page.getByTestId('nav-home')).toHaveText('Home');
  await page.reload();
  await expect(page.getByTestId('nav-home')).toHaveText('Home');

  await page.getByTestId('user-menu').click();
  await page.getByTestId('logout').click();
  await expect(page).toHaveURL(/\/login$/);

  const ctx = await browser.newContext({ locale: 'vi-VN', baseURL });
  const p2 = await ctx.newPage();
  await p2.goto('/login');
  await p2.getByLabel('Tên đăng nhập').fill(ADMIN.username);
  await p2.getByLabel('Mật khẩu').fill(ADMIN.password);
  await p2.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(p2).toHaveURL('/');
  await expect(p2.getByTestId('nav-home')).toHaveText('Home');
  await ctx.close();
});

test('dark theme sets html.dark and persists', async ({ page }) => {
  await login(page);
  await pick(page, 'theme-switch', 'Tối');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await pick(page, 'theme-switch', 'Sáng');
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
});

test.describe('system theme on a dark machine', () => {
  test.use({ colorScheme: 'dark' });
  test('init script ships in HTML and sets html.dark with all app JS blocked', async ({ page, context, baseURL }) => {
    const html = await (await page.request.get('/login')).text();
    expect(html).toContain('prefers-color-scheme');
    await context.addCookies([{ name: 'theme', value: 'system', url: baseURL! }]);
    await page.route('**/_next/static/**', (route) => route.abort());
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    // Single synchronous read: no retries, so only the inline script can have set it.
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
  });
});

test('no React script-tag warning after a revalidating preference change', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (m) => logs.push(m.text()));
  await login(page);
  await pick(page, 'theme-switch', 'Tối');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await pick(page, 'lang-switch', 'Tiếng Anh');
  await expect(page.getByTestId('nav-home')).toHaveText('Home');
  expect(logs.filter((l) => l.includes('Encountered a script tag'))).toEqual([]);
});

test('switchers expose the current option as a checked radio', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('lang-switch').click();
  await expect(page.getByRole('menuitemradio', { name: 'Tiếng Việt' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await page.getByTestId('theme-switch').click();
  await expect(page.getByRole('menuitemradio', { name: 'Theo hệ thống' })).toHaveAttribute('aria-checked', 'true');
});

for (const locale of ['vi', 'en'] as const) {
  test.describe(`375px ${locale}`, () => {
    test.use({ viewport: { width: 375, height: 800 } });
    test('no horizontal scroll and mobile menu opens', async ({ page }) => {
      await login(page);
      if (locale === 'en') await pick(page, 'lang-switch', 'Tiếng Anh');
      expect(await overflow(page)).toBe(false);
      await page.getByTestId('mobile-nav-toggle').click();
      await expect(page.getByTestId('mobile-nav-admin')).toBeVisible();
      await page.keyboard.press('Escape');
      expect(await overflow(page)).toBe(false);
    });
  });
}
