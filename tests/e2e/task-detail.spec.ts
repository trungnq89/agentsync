import { expect, test, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { createDb } from '../../src/db/client';
import { users } from '../../src/db/schema';
import { getPendingFeedback, postUpdate, submitSolutionSummary } from '../../src/server/tasks/activity';
import { confirmTask, createTask, setTaskStatus } from '../../src/server/tasks/service';
import { resetE2eDb, seedOrg } from '../helpers/e2e-db';

const ADMIN = { username: 'admin', password: 'admin-password-1' };
const PW = 'user-password-1';
const isoDay = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

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

async function withDb<T>(fn: (db: ReturnType<typeof createDb>, u: { manager: typeof users.$inferSelect; leader: typeof users.$inferSelect }) => Promise<T>): Promise<T> {
  const db = createDb(process.env.DATABASE_URL_E2E!);
  try {
    const [manager] = await db.select().from(users).where(eq(users.id, ids.managerId));
    const [leader] = await db.select().from(users).where(eq(users.id, ids.leaderId));
    return await fn(db, { manager, leader });
  } finally {
    await db.$client.end();
  }
}

const base = (title: string, mode: 'executive' | 'project' = 'executive') => ({
  title, mode, agreedOutcome: 'Kết quả thống nhất ABC', startDate: isoDay(-3), agreedDueDate: isoDay(10),
  steps: ['Bước 1', 'Bước 2'],
});

test('manager confirms a pending task', async ({ page }) => {
  const task = await withDb((db, { leader }) => createTask(db, leader, base('Việc chờ xác nhận')));
  await login(page, 'manager1', PW);
  await page.goto(`/tasks/${task.id}`);
  await expect(page.getByTestId('task-status')).toContainText('Chờ xác nhận');
  await expect(page.getByText('Kết quả thống nhất ABC')).toBeVisible();
  await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(page.getByTestId('task-status')).toContainText('Đang làm');
});

test('manager asks "Cần sửa" on a project review with a note', async ({ page }) => {
  const task = await withDb(async (db, { manager, leader }) => {
    const t = await createTask(db, leader, base('Dự án cần review', 'project'));
    await confirmTask(db, manager, t.id);
    await submitSolutionSummary(db, leader, t.id, {
      problem: 'Vấn đề P', solution: 'Giải pháp S', rejectedAlternatives: 'Không', keyChanges: 'Đổi X',
      risks: 'Rủi ro R', testing: 'Đã test', prUrl: 'https://example.com/pr/1',
    });
    await setTaskStatus(db, leader, t.id, 'complete');
    return t;
  });
  await login(page, 'manager1', PW);
  await page.goto(`/tasks/${task.id}`);
  await expect(page.getByTestId('task-status')).toContainText('chờ review');
  await expect(page.getByText('Giải pháp S')).toBeVisible();
  await page.getByTestId('open-changes').click();
  await page.getByLabel('Ghi chú').fill('Thiếu test cho case rỗng');
  await page.getByRole('button', { name: 'Gửi yêu cầu sửa' }).click();
  await expect(page.getByTestId('task-status')).toContainText('Đang làm');
  const fb = await withDb((db, { leader }) => getPendingFeedback(db, leader));
  expect(fb.reviewResults.map((r) => r.note)).toContain('Thiếu test cho case rỗng');
});

test('manager question reaches the leader', async ({ page }) => {
  const task = await withDb(async (db, { manager, leader }) => {
    const t = await createTask(db, leader, base('Việc có câu hỏi'));
    await confirmTask(db, manager, t.id);
    return t;
  });
  await login(page, 'manager1', PW);
  await page.goto(`/tasks/${task.id}`);
  await page.getByLabel('Đặt câu hỏi cho Minh Leader').fill('Khi nào xong phần 1?');
  await page.getByRole('button', { name: 'Gửi câu hỏi' }).click();
  await expect(page.getByTestId('question-box')).toContainText('Khi nào xong phần 1?');
  const fb = await withDb((db, { leader }) => getPendingFeedback(db, leader));
  expect(fb.questionsForMe.map((q) => q.body)).toContain('Khi nào xong phần 1?');
});

test('activity shows 3 latest by default, rest behind "Xem thêm"; no overflow at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const task = await withDb(async (db, { manager, leader }) => {
    const t = await createTask(db, leader, base('Việc nhiều cập nhật'));
    await confirmTask(db, manager, t.id);
    for (let i = 1; i <= 5; i++) {
      await postUpdate(db, leader, t.id, { body: `Cập nhật số ${i}`, source: i % 2 ? 'auto' : 'reviewed' },
        new Date(Date.now() - (6 - i) * 3_600_000));
    }
    return t;
  });
  await login(page, 'manager1', PW);
  await page.goto(`/tasks/${task.id}`);
  const items = page.getByTestId('activity-item');
  await expect(items).toHaveCount(5);
  await expect(page.locator('[data-testid=activity-item]:visible')).toHaveCount(3);
  await expect(page.getByText('Cập nhật số 5')).toBeVisible();
  await expect(page.getByText('Cập nhật số 1')).toBeHidden();
  await page.getByText('Xem thêm').click();
  await expect(page.locator('[data-testid=activity-item]:visible')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('unknown or non-viewable task is 404', async ({ page }) => {
  await login(page, 'manager1', PW);
  await page.goto('/tasks/00000000-0000-0000-0000-000000000000');
  await expect(page.getByText('This page could not be found')).toBeVisible();
});
