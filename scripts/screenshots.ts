/**
 * Captures the README screenshots against a running demo instance.
 *
 *   DATABASE_URL=postgres://.../agentsync_demo pnpm seed:demo --lang en --reset
 *   (start the app on port 3200 with the same DATABASE_URL, DEFAULT_LOCALE=en, COOKIE_SECURE=false)
 *   DATABASE_URL=postgres://.../agentsync_demo pnpm screenshots --lang en
 *
 * Uses the demo accounts only (shared demo password) and never creates agent tokens, so no real
 * credential can appear in an image. Output: docs/screenshots/<lang>/*.png
 */
import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { chromium, type Browser, type Page } from '@playwright/test';
import { createDb } from '../src/db/client';
import { tasks, users } from '../src/db/schema';
import { DEMO_PASSWORD } from './seed-demo';

const BASE = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:3200';
const LABELS = {
  en: { username: 'Username', password: 'Password', submit: 'Sign in' },
  vi: { username: 'Tên đăng nhập', password: 'Mật khẩu', submit: 'Đăng nhập' },
} as const;

const langArg = process.argv[process.argv.indexOf('--lang') + 1];
if (langArg !== 'en' && langArg !== 'vi') throw new Error('usage: pnpm screenshots --lang en|vi');
const lang = langArg;
const out = join(process.cwd(), 'docs/screenshots', lang);
mkdirSync(out, { recursive: true });

async function session(browser: Browser, username: string, opts: { dark?: boolean; mobile?: boolean } = {}) {
  const context = await browser.newContext({
    viewport: opts.mobile ? { width: 375, height: 812 } : { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: opts.dark ? 'dark' : 'light',
    locale: lang === 'vi' ? 'vi-VN' : 'en-US',
    timezoneId: 'Asia/Ho_Chi_Minh',
  });
  await context.addCookies([{ name: 'locale', value: lang, url: BASE }]);
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  const l = LABELS[lang];
  await page.getByLabel(l.username).fill(username);
  await page.getByLabel(l.password).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: l.submit }).click();
  await page.waitForURL(`${BASE}/`);
  return { context, page };
}

async function shot(page: Page, path: string, name: string, fullPage = false) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: join(out, `${name}.png`), fullPage });
  console.log(`${lang}/${name}.png`);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = createDb(url);
  const id = async (username: string) => (await db.select().from(users).where(eq(users.username, username)))[0].id;
  const nam = await id('nam.vu');
  const anh = await id('anh.le');
  const [sso] = await db.select().from(tasks).where(and(eq(tasks.ownerId, nam), eq(tasks.status, 'awaiting_review')));
  const [cloud] = await db.select().from(tasks).where(and(eq(tasks.ownerId, anh), eq(tasks.mode, 'executive')));
  await db.$client.end();

  const browser = await chromium.launch();
  try {
    let s = await session(browser, 'linh.tran');
    await shot(s.page, '/', 'home-manager-light');
    await shot(s.page, `/people/${nam}`, 'person-timeline');
    await shot(s.page, `/tasks/${sso.id}`, 'task-detail-project', true);
    await shot(s.page, '/settings', 'settings', true); // before any token exists
    await s.context.close();

    s = await session(browser, 'linh.tran', { dark: true });
    await shot(s.page, '/', 'home-dark');
    await s.context.close();

    s = await session(browser, 'linh.tran', { mobile: true });
    await shot(s.page, '/', 'mobile-home');
    await s.context.close();

    s = await session(browser, 'quan.nguyen');
    await shot(s.page, `/tasks/${cloud.id}`, 'task-detail-executive', true);
    await shot(s.page, '/admin', 'admin-users', true);
    await shot(s.page, '/admin/odoo', 'admin-odoo');
    await s.context.close();
  } finally {
    await browser.close();
  }
}

void main();
