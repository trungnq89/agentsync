import { expect, type Page } from '@playwright/test';

const LABELS = {
  vi: { username: 'Tên đăng nhập', password: 'Mật khẩu', submit: 'Đăng nhập' },
  en: { username: 'Username', password: 'Password', submit: 'Sign in' },
} as const;

/**
 * Signs in through the login form and waits for the home page. `locale` pins the UI language of the
 * login page (the config's browser locale is vi-VN) via the locale cookie; baseURL comes from the config.
 */
export async function loginAs(page: Page, username: string, password: string, locale: 'vi' | 'en' = 'vi') {
  if (locale !== 'vi') {
    await page.goto('/login');
    await page.context().addCookies([{ name: 'locale', value: locale, url: new URL(page.url()).origin }]);
  }
  await page.goto('/login');
  const l = LABELS[locale];
  await page.getByLabel(l.username).fill(username);
  await page.getByLabel(l.password).fill(password);
  await page.getByRole('button', { name: l.submit }).click();
  await expect(page).toHaveURL('/');
}
