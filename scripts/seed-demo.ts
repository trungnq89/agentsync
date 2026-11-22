import 'dotenv/config';
import { getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { createDb, type Db } from '../src/db/client';
import * as schema from '../src/db/schema';
import { users, type Task, type User } from '../src/db/schema';
import { hashPassword } from '../src/server/auth/password';
import { vnDateString } from '../src/server/clock';
import { createUser } from '../src/server/org';
import {
  answerQuestion, askQuestion, postUpdate, reviewSolution, submitSolutionSummary,
} from '../src/server/tasks/activity';
import {
  changePlan, confirmTask, createTask, getCurrentPlan, requestChanges, setTaskStatus,
} from '../src/server/tasks/service';

export type DemoLang = 'en' | 'vi';

/** Shared by every demo account. Demo only: never use this value on a real install. */
export const DEMO_PASSWORD = 'demo-password-123';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** The database name (last path segment of the URL) must be agentsync_demo or end with _demo / -demo. Checked before any write. */
export function assertDemoDatabase(databaseUrl: string): void {
  let name = '';
  try {
    name = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
  } catch {
    throw new Error('seed:demo refused: DATABASE_URL is not a valid URL.');
  }
  if (!(name === 'agentsync_demo' || name.endsWith('_demo') || name.endsWith('-demo'))) {
    throw new Error(`seed:demo refused: database "${name}" is not a demo database (its name must be agentsync_demo or end with _demo or -demo).`);
  }
}

const tableNames = (Object.values(schema) as unknown[])
  .filter((v): v is PgTable => is(v, PgTable))
  .map((t) => `"${getTableName(t)}"`);

/** Truncates every table and restores the singleton settings rows. Caller must have checked the database name. */
export async function wipeDatabase(db: Db): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE ${tableNames.join(', ')} RESTART IDENTITY CASCADE`));
  await db.insert(schema.appSettings).values({ id: 1, staleBusinessDays: 3 });
  await db.insert(schema.odooSettings).values({ id: 1 });
}

export interface DemoSummary {
  users: number;
  tasks: number;
  usernames: string[];
}

/**
 * Seeds the demo organisation and tasks through the normal service functions, with timestamps relative to `now`.
 * Expects migrated, empty tables (see wipeDatabase). Odoo is left unconfigured.
 */
export async function seedDemo(db: Db, opts: { lang: DemoLang; now?: Date }): Promise<DemoSummary> {
  const { lang } = opts;
  const now = opts.now ?? new Date();
  const T = (en: string, vi: string) => (lang === 'vi' ? vi : en);
  const ago = (days: number, hours = 0) => new Date(now.getTime() - days * DAY - hours * HOUR);
  const dateAgo = (days: number) => vnDateString(ago(days));
  const dateAhead = (days: number) => vnDateString(new Date(now.getTime() + days * DAY));

  const [existing] = await db.select({ id: users.id }).from(users).limit(1);
  if (existing) throw new Error('seed:demo refused: the database already has users. Re-run with --reset on a demo database.');
  await db.insert(schema.appSettings).values({ id: 1, staleBusinessDays: 3 }).onConflictDoNothing();
  await db.insert(schema.odooSettings).values({ id: 1 }).onConflictDoNothing();

  // ---- Organisation: 1 director (admin), 2 managers, 4 leaders/members
  const [admin] = await db.insert(users).values({
    username: 'quan.nguyen', displayName: 'Nguyễn Minh Quân', email: 'quan.nguyen@demo.example',
    passwordHash: await hashPassword(DEMO_PASSWORD), level: 'director', isAdmin: true, locale: lang,
  }).returning();
  const mk = (
    username: string, displayName: string, level: User['level'], managerId: string,
  ) => createUser(db, admin, {
    username, displayName, password: DEMO_PASSWORD, level, managerId, email: `${username}@demo.example`,
  });
  const linh = await mk('linh.tran', 'Trần Thu Linh', 'manager', admin.id);
  const ducAnh = await mk('anh.le', 'Lê Đức Anh', 'manager', admin.id);
  const ngoc = await mk('ngoc.pham', 'Phạm Bảo Ngọc', 'leader', linh.id);
  const nam = await mk('nam.vu', 'Vũ Hoàng Nam', 'member', linh.id);
  const kiet = await mk('kiet.bui', 'Bùi Tuấn Kiệt', 'leader', ducAnh.id);
  const vy = await mk('vy.dang', 'Đặng Khánh Vy', 'member', ducAnh.id);
  await db.update(users).set({ locale: lang }).where(sql`true`);

  let taskCount = 0;
  const create = async (
    owner: User,
    t: Parameters<typeof createTask>[2],
    when: Date,
  ): Promise<Task> => {
    taskCount += 1;
    return createTask(db, owner, t, when);
  };
  const confirm = (task: Task, manager: User, when: Date) => confirmTask(db, manager, task.id, when);
  const update = (
    task: Task, owner: User, when: Date, body: string, stepsCompleted: string[] = [],
    extra: Partial<Parameters<typeof postUpdate>[3]> = {},
  ) => postUpdate(db, owner, task.id, { body, stepsCompleted, source: 'auto', ...extra }, when);

  // ---- Director: executive task, no manager so it starts in progress
  const priorities = await create(admin, {
    title: T('Set 2026 engineering priorities', 'Chốt ưu tiên kỹ thuật năm 2026'),
    mode: 'executive',
    agreedOutcome: T('A ranked list of five engineering priorities agreed with both managers.', 'Danh sách năm ưu tiên kỹ thuật đã thống nhất với hai quản lý.'),
    startDate: dateAgo(20), agreedDueDate: dateAhead(25),
    steps: [T('Collect proposals from managers', 'Thu thập đề xuất từ các quản lý'), T('Rank by impact and cost', 'Xếp hạng theo tác động và chi phí'), T('Publish the final list', 'Công bố danh sách cuối cùng')],
  }, ago(20));
  await update(priorities, admin, ago(10), T('Both managers sent their proposals; eleven candidates in total.', 'Cả hai quản lý đã gửi đề xuất, tổng cộng mười một ứng viên.'), [T('Collect proposals from managers', 'Thu thập đề xuất từ các quản lý')]);
  await update(priorities, admin, ago(2), T('Ranking workshop held; shortlist down to seven.', 'Đã họp xếp hạng, rút gọn còn bảy mục.'));

  // ---- Managers' own executive tasks (confirmed by the director)
  await create(linh, {
    title: T('Plan Q1 team capacity', 'Lập kế hoạch năng lực nhóm quý 1'),
    mode: 'executive',
    agreedOutcome: T('Capacity plan covering leave, onboarding and the portal roadmap.', 'Kế hoạch năng lực gồm nghỉ phép, onboarding và lộ trình cổng khách hàng.'),
    startDate: dateAgo(1), agreedDueDate: dateAhead(14),
    steps: [T('Gather leave calendar', 'Gom lịch nghỉ phép'), T('Estimate roadmap effort', 'Ước lượng công sức lộ trình'), T('Review with director', 'Duyệt với giám đốc')],
  }, ago(1, 3));

  const cloud = await create(ducAnh, {
    title: T('Cut cloud spend by 15%', 'Giảm 15% chi phí hạ tầng cloud'),
    mode: 'executive',
    agreedOutcome: T('Monthly cloud bill down 15% without hurting latency.', 'Hóa đơn cloud hằng tháng giảm 15% mà không ảnh hưởng độ trễ.'),
    startDate: dateAgo(18), agreedDueDate: dateAhead(10),
    steps: [T('Audit current usage', 'Rà soát mức sử dụng hiện tại'), T('Right-size idle instances', 'Điều chỉnh cấu hình máy nhàn rỗi'), T('Move logs to cold storage', 'Chuyển log sang lưu trữ lạnh'), T('Report savings', 'Báo cáo mức tiết kiệm')],
  }, ago(18));
  await confirm(cloud, admin, ago(17, 20));
  await update(cloud, ducAnh, ago(12), T('Audit finished: 22% of instances idle more than 80% of the time.', 'Rà soát xong: 22% máy chạy dưới 20% công suất phần lớn thời gian.'), [T('Audit current usage', 'Rà soát mức sử dụng hiện tại')]);
  await update(cloud, ducAnh, ago(6), T('Right-sized 14 instances, saving about 9% so far.', 'Đã hạ cấu hình 14 máy, tiết kiệm khoảng 9% cho tới nay.'), [T('Right-size idle instances', 'Điều chỉnh cấu hình máy nhàn rỗi')], { progressPct: 50 });
  await update(cloud, ducAnh, ago(0, 5), T('Log archive policy drafted; waiting on retention sign-off.', 'Đã soạn chính sách lưu log; chờ duyệt thời hạn lưu.'));

  // ---- Linh's team
  // Ngọc: healthy project with a plan revision and a manager answer
  const sNgoc1 = [T('Design the job queue', 'Thiết kế hàng đợi tác vụ'), T('Move PDF rendering to a worker', 'Chuyển dựng PDF sang worker'), T('Add progress endpoint', 'Thêm endpoint tiến độ'), T('Roll out to 10% of customers', 'Triển khai cho 10% khách hàng')];
  const invoice = await create(ngoc, {
    title: T('Move invoice export to background jobs', 'Chuyển xuất hóa đơn sang tác vụ nền'),
    mode: 'project',
    agreedOutcome: T('Exporting a large invoice batch no longer times out and shows progress.', 'Xuất lô hóa đơn lớn không còn bị timeout và có hiển thị tiến độ.'),
    startDate: dateAgo(12), agreedDueDate: dateAhead(6), steps: sNgoc1,
    repoRef: { repo: 'example/billing-service', branch: 'feat/async-export' },
  }, ago(12));
  await confirm(invoice, linh, ago(12, -2));
  await update(invoice, ngoc, ago(10), T('Queue design agreed with the platform team; using the existing worker pool.', 'Đã thống nhất thiết kế hàng đợi với nhóm nền tảng, dùng lại worker pool hiện có.'), [sNgoc1[0]], { evidence: { branch: 'feat/async-export', commits: 2 } });
  await update(invoice, ngoc, ago(7), T('PDF rendering now runs in a worker. A 5,000-invoice batch takes 40s instead of timing out.', 'Dựng PDF đã chạy trong worker. Lô 5.000 hóa đơn mất 40 giây thay vì bị timeout.'), [sNgoc1[1]], { evidence: { branch: 'feat/async-export', commits: 5 } });
  const q1 = await askQuestion(db, ngoc, invoice.id, T('Should failed exports be retried automatically, or shown to the user as failed?', 'Xuất thất bại nên tự thử lại hay hiện lỗi cho người dùng?'), { isBlocker: false }, ago(5));
  await answerQuestion(db, linh, q1.id, T('Retry up to 3 times with backoff, then show the failure with a retry button.', 'Thử lại tối đa 3 lần có giãn cách, sau đó hiện lỗi kèm nút thử lại.'), ago(5, -3));
  const plan1 = await getCurrentPlan(db, invoice.id);
  await changePlan(db, ngoc, invoice.id, {
    steps: [...plan1.steps, { title: T('Add retry and dead-letter handling', 'Thêm thử lại và hàng đợi lỗi'), status: 'todo' }],
    reason: T('Manager asked for automatic retries on failed exports.', 'Quản lý yêu cầu tự động thử lại khi xuất thất bại.'),
  }, ago(4));
  await update(invoice, ngoc, ago(0, 3), T('Progress endpoint is live in staging; starting on retry handling.', 'Endpoint tiến độ đã chạy trên staging; bắt đầu làm phần thử lại.'), [sNgoc1[2]], { evidence: { branch: 'feat/async-export', commits: 9 } });

  // Ngọc: executive plan awaiting confirmation
  await create(ngoc, {
    title: T('Q1 hiring plan for the support team', 'Kế hoạch tuyển dụng quý 1 cho nhóm hỗ trợ'),
    mode: 'executive',
    agreedOutcome: T('Approved headcount and job descriptions for three support roles.', 'Chỉ tiêu và mô tả công việc đã duyệt cho ba vị trí hỗ trợ.'),
    startDate: dateAgo(2), agreedDueDate: dateAhead(12),
    steps: [T('Draft job descriptions', 'Soạn mô tả công việc'), T('Agree budget with finance', 'Thống nhất ngân sách với tài chính'), T('Open the postings', 'Đăng tin tuyển dụng')],
  }, ago(2));

  // Ngọc: changes requested
  const filters = await create(ngoc, {
    title: T('Redesign dashboard filters', 'Thiết kế lại bộ lọc dashboard'),
    mode: 'project',
    agreedOutcome: T('Filters are reachable in two clicks and the choice survives a page reload.', 'Bộ lọc dùng được trong hai cú nhấp và giữ lựa chọn sau khi tải lại trang.'),
    startDate: dateAgo(3), agreedDueDate: dateAhead(9),
    steps: [T('Audit current filters', 'Rà soát bộ lọc hiện tại'), T('Prototype the new layout', 'Làm mẫu bố cục mới'), T('Implement and test', 'Triển khai và kiểm thử')],
  }, ago(3));
  await requestChanges(db, linh, filters.id, T('Please add a step for accessibility review and say how saved filters are stored.', 'Hãy thêm bước rà soát khả năng truy cập và nêu cách lưu bộ lọc đã chọn.'), ago(2, 4));

  // Ngọc: executive, done
  const handbook = await create(ngoc, {
    title: T('Publish the onboarding handbook', 'Phát hành sổ tay onboarding'),
    mode: 'executive',
    agreedOutcome: T('New joiners get a single handbook covering tools, access and team norms.', 'Người mới có một sổ tay duy nhất về công cụ, quyền truy cập và quy tắc nhóm.'),
    startDate: dateAgo(20), agreedDueDate: dateAgo(4),
    steps: [T('Collect existing docs', 'Gom tài liệu hiện có'), T('Write the missing sections', 'Viết các phần còn thiếu'), T('Publish and announce', 'Phát hành và thông báo')],
  }, ago(20));
  await confirm(handbook, linh, ago(19, 20));
  await update(handbook, ngoc, ago(12), T('Existing docs collected; four sections are missing.', 'Đã gom tài liệu hiện có; còn thiếu bốn phần.'), [T('Collect existing docs', 'Gom tài liệu hiện có')]);
  await update(handbook, ngoc, ago(7), T('All sections written and reviewed by two new joiners.', 'Đã viết xong các phần và hai bạn mới đã đọc góp ý.'), [T('Write the missing sections', 'Viết các phần còn thiếu')]);
  await update(handbook, ngoc, ago(5), T('Handbook published and announced in the all-hands channel.', 'Đã phát hành sổ tay và thông báo trong kênh toàn công ty.'), [T('Publish and announce', 'Phát hành và thông báo')]);
  await setTaskStatus(db, ngoc, handbook.id, 'complete', undefined, ago(5));

  // Nam: awaiting review with a solution summary
  const sSso = [T('Add the OIDC callback route', 'Thêm route callback OIDC'), T('Map identity claims to portal accounts', 'Ánh xạ thông tin danh tính sang tài khoản cổng'), T('Write integration tests', 'Viết kiểm thử tích hợp'), T('Update the login page', 'Cập nhật trang đăng nhập')];
  const sso = await create(nam, {
    title: T('Add SSO login to the customer portal', 'Thêm đăng nhập SSO cho cổng khách hàng'),
    mode: 'project',
    agreedOutcome: T('Customers can sign in with their company identity provider (OIDC).', 'Khách hàng đăng nhập được bằng nhà cung cấp định danh của công ty (OIDC).'),
    startDate: dateAgo(14), agreedDueDate: dateAhead(2), steps: sSso,
    repoRef: { repo: 'example/customer-portal', branch: 'feat/sso' },
  }, ago(14));
  await confirm(sso, linh, ago(14, -3));
  await update(sso, nam, ago(11), T('Callback route in place; tokens are verified against the provider keys.', 'Đã có route callback; token được xác minh bằng khóa của nhà cung cấp.'), [sSso[0]], { evidence: { branch: 'feat/sso', commits: 3 } });
  await update(sso, nam, ago(7), T('Claims mapped to existing accounts by verified email; new accounts are created on first login.', 'Đã ánh xạ claim sang tài khoản theo email đã xác minh; tài khoản mới được tạo khi đăng nhập lần đầu.'), [sSso[1]], { evidence: { branch: 'feat/sso', commits: 7 } });
  await update(sso, nam, ago(3), T('Integration tests cover login, logout and a rejected token.', 'Kiểm thử tích hợp bao phủ đăng nhập, đăng xuất và token bị từ chối.'), [sSso[2]], { evidence: { branch: 'feat/sso', commits: 11 } });
  await update(sso, nam, ago(1, 6), T('Login page updated; opened the pull request.', 'Đã cập nhật trang đăng nhập và mở pull request.'), [sSso[3]], { source: 'reviewed', evidence: { branch: 'feat/sso', commits: 13, prUrl: 'https://github.com/example/repo/pull/42' } });
  await submitSolutionSummary(db, nam, sso.id, {
    problem: T('Enterprise customers could only sign in with a portal password, which blocked their security reviews.', 'Khách hàng doanh nghiệp chỉ đăng nhập được bằng mật khẩu cổng, vướng yêu cầu bảo mật của họ.'),
    solution: T('Added an OpenID Connect login flow. Accounts are matched by verified email and created on first sign-in.', 'Thêm luồng đăng nhập OpenID Connect. Tài khoản được ghép theo email đã xác minh và tạo khi đăng nhập lần đầu.'),
    rejectedAlternatives: T('SAML (heavier to configure for customers) and a hosted auth proxy (extra service to run).', 'SAML (khách khó cấu hình hơn) và proxy xác thực bên ngoài (thêm một dịch vụ phải vận hành).'),
    keyChanges: T('New /auth/oidc routes, an identity table linked to accounts, and a provider settings page.', 'Các route /auth/oidc mới, bảng danh tính liên kết với tài khoản và trang cấu hình nhà cung cấp.'),
    risks: T('A provider that changes its signing keys needs a settings refresh; accounts with a changed email are not re-linked.', 'Nhà cung cấp đổi khóa ký cần làm mới cấu hình; tài khoản đổi email sẽ không tự ghép lại.'),
    testing: T('14 new integration tests and a manual run against a sandbox identity provider.', '14 kiểm thử tích hợp mới và chạy thủ công với nhà cung cấp định danh sandbox.'),
    prUrl: 'https://github.com/example/repo/pull/42',
  }, ago(1, 2));
  await setTaskStatus(db, nam, sso.id, 'complete', undefined, ago(1));

  // Nam: blocked on an open question
  const sPay = [T('Create sandbox merchant account', 'Tạo tài khoản merchant sandbox'), T('Implement the checkout call', 'Làm lời gọi thanh toán'), T('Handle webhooks', 'Xử lý webhook'), T('Test refunds', 'Kiểm thử hoàn tiền')];
  const pay = await create(nam, {
    title: T('Integrate the payment gateway sandbox', 'Tích hợp sandbox cổng thanh toán'),
    mode: 'project',
    agreedOutcome: T('Checkout in staging completes a test payment and a refund through the gateway sandbox.', 'Checkout trên staging hoàn tất thanh toán thử và hoàn tiền qua sandbox cổng thanh toán.'),
    startDate: dateAgo(8), agreedDueDate: dateAhead(3), steps: sPay,
    repoRef: { repo: 'example/checkout', branch: 'feat/gateway-sandbox' },
  }, ago(8));
  await confirm(pay, linh, ago(8, -2));
  await update(pay, nam, ago(6), T('Read the gateway docs and requested a sandbox merchant account.', 'Đã đọc tài liệu cổng thanh toán và xin tài khoản merchant sandbox.'));
  await update(pay, nam, ago(3), T('Sandbox account arrived; checkout call works for card payments.', 'Đã có tài khoản sandbox; lời gọi thanh toán bằng thẻ chạy được.'), [sPay[0], sPay[1]], { evidence: { branch: 'feat/gateway-sandbox', commits: 4 } });
  await askQuestion(db, nam, pay.id, T('The sandbox rejects our webhook URL because it is not publicly reachable. Can we get a temporary public staging address?', 'Sandbox từ chối URL webhook vì không truy cập được từ internet. Có thể cấp địa chỉ staging công khai tạm thời không?'), { isBlocker: true }, ago(1));

  // Nam: overdue and quiet for a while
  const flaky = await create(nam, {
    title: T('Fix flaky checkout tests', 'Sửa các kiểm thử checkout không ổn định'),
    mode: 'project',
    agreedOutcome: T('The checkout suite passes 50 consecutive CI runs.', 'Bộ kiểm thử checkout qua 50 lần chạy CI liên tiếp.'),
    startDate: dateAgo(20), agreedDueDate: dateAgo(4),
    steps: [T('Reproduce the flakes locally', 'Tái hiện lỗi không ổn định trên máy'), T('Isolate shared state between tests', 'Tách trạng thái dùng chung giữa các test'), T('Stabilise timing-dependent assertions', 'Ổn định các assertion phụ thuộc thời gian')],
  }, ago(20));
  await confirm(flaky, linh, ago(19, 22));
  await update(flaky, nam, ago(12), T('Reproduced two of the three flakes; both depend on test order.', 'Tái hiện được hai trong ba lỗi; cả hai phụ thuộc thứ tự chạy test.'), [T('Reproduce the flakes locally', 'Tái hiện lỗi không ổn định trên máy')]);

  // Nam: closed after an approved review
  const upgrade = await create(nam, {
    title: T('Upgrade Node.js to v22', 'Nâng cấp Node.js lên v22'),
    mode: 'project',
    agreedOutcome: T('All services run on Node.js 22 with no regressions in CI.', 'Mọi dịch vụ chạy trên Node.js 22, CI không có lỗi mới.'),
    startDate: dateAgo(25), agreedDueDate: dateAgo(9),
    steps: [T('Upgrade the base images', 'Nâng cấp base image'), T('Fix deprecated API usage', 'Sửa các API đã lỗi thời'), T('Roll out service by service', 'Triển khai từng dịch vụ')],
  }, ago(25));
  await confirm(upgrade, linh, ago(24, 20));
  await update(upgrade, nam, ago(18), T('Base images upgraded; three deprecated APIs found.', 'Đã nâng cấp base image; tìm thấy ba API lỗi thời.'), [T('Upgrade the base images', 'Nâng cấp base image')]);
  await update(upgrade, nam, ago(12), T('Deprecated APIs replaced; CI is green.', 'Đã thay các API lỗi thời; CI xanh.'), [T('Fix deprecated API usage', 'Sửa các API đã lỗi thời')]);
  await update(upgrade, nam, ago(9, 2), T('All services migrated; no regressions seen over two days.', 'Đã chuyển hết dịch vụ; hai ngày không thấy lỗi mới.'), [T('Roll out service by service', 'Triển khai từng dịch vụ')], { evidence: { prUrl: 'https://github.com/example/repo/pull/37' } });
  await submitSolutionSummary(db, nam, upgrade.id, {
    problem: T('Node.js 18 reached end of life.', 'Node.js 18 đã hết hạn hỗ trợ.'),
    solution: T('Moved every service to Node.js 22 LTS.', 'Chuyển mọi dịch vụ sang Node.js 22 LTS.'),
    rejectedAlternatives: T('Staying on 20 for another quarter.', 'Ở lại bản 20 thêm một quý.'),
    keyChanges: T('Base images, three API replacements, CI matrix.', 'Base image, ba chỗ thay API, ma trận CI.'),
    risks: T('Native modules may need rebuilding on new hosts.', 'Module native có thể cần build lại trên máy mới.'),
    testing: T('Full CI plus two days of production monitoring.', 'Chạy đủ CI và theo dõi production hai ngày.'),
    prUrl: 'https://github.com/example/repo/pull/37',
  }, ago(9, 1));
  await setTaskStatus(db, nam, upgrade.id, 'complete', undefined, ago(9));
  await reviewSolution(db, linh, upgrade.id, 'approved', T('Clear summary, thanks.', 'Tóm tắt rõ ràng, cảm ơn.'), ago(8));

  // Nam: private task, visible only to him
  await create(nam, {
    title: T('Learn Rust basics', 'Học cơ bản về Rust'),
    mode: 'executive', isPrivate: true,
    agreedOutcome: T('Finish the first six chapters of the Rust book.', 'Đọc xong sáu chương đầu của sách Rust.'),
    startDate: dateAgo(5), agreedDueDate: dateAhead(30),
    steps: [T('Chapters 1 to 3', 'Chương 1 đến 3'), T('Chapters 4 to 6', 'Chương 4 đến 6')],
  }, ago(5));

  // ---- Đức Anh's team
  const sCsv = [T('Parse and validate the CSV', 'Phân tích và kiểm tra tệp CSV'), T('Show a preview with errors', 'Hiện bản xem trước kèm lỗi'), T('Import in batches', 'Nhập theo từng lô')];
  const csv = await create(vy, {
    title: T('Add CSV import for contacts', 'Thêm nhập danh bạ từ CSV'),
    mode: 'project',
    agreedOutcome: T('Users can import up to 10,000 contacts from a CSV file and see row-level errors.', 'Người dùng nhập được tối đa 10.000 liên hệ từ CSV và thấy lỗi theo từng dòng.'),
    startDate: dateAgo(7), agreedDueDate: dateAhead(5), steps: sCsv,
    repoRef: { repo: 'example/crm', branch: 'feat/csv-import' },
  }, ago(7));
  await confirm(csv, ducAnh, ago(7, -1));
  await update(csv, vy, ago(5), T('Parser handles quoted fields and mixed encodings.', 'Bộ phân tích xử lý được trường có dấu nháy và nhiều bảng mã.'), [sCsv[0]], { evidence: { branch: 'feat/csv-import', commits: 3 } });
  await update(csv, vy, ago(2), T('Preview screen shows the first 20 invalid rows with reasons.', 'Màn hình xem trước hiện 20 dòng lỗi đầu tiên kèm lý do.'), [sCsv[1]], { evidence: { branch: 'feat/csv-import', commits: 6 } });
  await update(csv, vy, ago(0, 4), T('Batch import works locally; now measuring a 10,000-row file.', 'Nhập theo lô chạy được trên máy; đang đo với tệp 10.000 dòng.'), [], { evidence: { branch: 'feat/csv-import', commits: 8 } });

  const vendor = await create(kiet, {
    title: T('Vendor security review', 'Rà soát bảo mật nhà cung cấp'),
    mode: 'executive',
    agreedOutcome: T('Every vendor with access to customer data has a current security assessment.', 'Mọi nhà cung cấp có quyền truy cập dữ liệu khách hàng đều có đánh giá bảo mật còn hiệu lực.'),
    startDate: dateAgo(14), agreedDueDate: dateAhead(14),
    steps: [T('List vendors with data access', 'Liệt kê nhà cung cấp có quyền truy cập dữ liệu'), T('Send questionnaires', 'Gửi bảng câu hỏi'), T('Score and summarise answers', 'Chấm điểm và tóm tắt câu trả lời')],
  }, ago(14));
  await confirm(vendor, ducAnh, ago(13, 20));
  await update(vendor, kiet, ago(9), T('Found 17 vendors with access to customer data.', 'Tìm thấy 17 nhà cung cấp có quyền truy cập dữ liệu khách hàng.'), [T('List vendors with data access', 'Liệt kê nhà cung cấp có quyền truy cập dữ liệu')]);
  await update(vendor, kiet, ago(3), T('Questionnaires sent; 6 of 17 answered so far.', 'Đã gửi bảng câu hỏi; 6 trên 17 đã trả lời.'), [T('Send questionnaires', 'Gửi bảng câu hỏi')]);
  await askQuestion(db, ducAnh, vendor.id, T('Which vendors should we treat as high risk for the first scoring pass?', 'Nên coi những nhà cung cấp nào là rủi ro cao ở đợt chấm điểm đầu?'), { isBlocker: false }, ago(1));

  const sRate = [T('Add a token-bucket limiter', 'Thêm bộ giới hạn token-bucket'), T('Return Retry-After headers', 'Trả về header Retry-After'), T('Load test the limits', 'Kiểm thử tải các giới hạn')];
  const rate = await create(kiet, {
    title: T('Rate limiting for the public API', 'Giới hạn tốc độ cho API công khai'),
    mode: 'project',
    agreedOutcome: T('Abusive clients are throttled without affecting normal traffic.', 'Client lạm dụng bị hạn chế mà lưu lượng bình thường không bị ảnh hưởng.'),
    startDate: dateAgo(15), agreedDueDate: dateAhead(4), steps: sRate,
    repoRef: { repo: 'example/api-gateway', branch: 'feat/rate-limit' },
  }, ago(15));
  await confirm(rate, ducAnh, ago(15, -2));
  await update(rate, kiet, ago(11), T('Limiter implemented with per-key buckets stored in Redis.', 'Đã làm bộ giới hạn với bucket theo từng khóa, lưu trong Redis.'), [sRate[0], sRate[1]], { evidence: { branch: 'feat/rate-limit', commits: 6 } });
  await update(rate, kiet, ago(7), T('Load test passed at 2x expected peak.', 'Kiểm thử tải đạt 2 lần đỉnh dự kiến.'), [sRate[2]], { evidence: { prUrl: 'https://github.com/example/repo/pull/58' } });
  await submitSolutionSummary(db, kiet, rate.id, {
    problem: T('A few clients sent bursts that degraded the API for everyone.', 'Một vài client gửi lượng lớn làm API chậm cho mọi người.'),
    solution: T('Per-key token buckets with Retry-After headers.', 'Bucket token theo từng khóa kèm header Retry-After.'),
    rejectedAlternatives: T('Limiting at the load balancer only (no per-customer limits).', 'Chỉ giới hạn ở load balancer (không có hạn mức theo khách).'),
    keyChanges: T('New middleware, Redis keys, and limit settings per plan.', 'Middleware mới, khóa Redis và cấu hình hạn mức theo gói.'),
    risks: T('Redis outage falls back to a permissive default.', 'Redis gặp sự cố thì chuyển về chế độ cho phép.'),
    testing: T('Load test at 2x peak and unit tests for the bucket maths.', 'Kiểm thử tải 2 lần đỉnh và unit test cho phép tính bucket.'),
    prUrl: 'https://github.com/example/repo/pull/58',
  }, ago(6, 3));
  await setTaskStatus(db, kiet, rate.id, 'complete', undefined, ago(6));
  await reviewSolution(db, ducAnh, rate.id, 'changes_needed', T('Please document the fallback behaviour and add an alert when Redis is unreachable.', 'Hãy ghi lại hành vi dự phòng và thêm cảnh báo khi không kết nối được Redis.'), ago(5));
  await update(rate, kiet, ago(1, 2), T('Added the Redis-unreachable alert; documenting the fallback now.', 'Đã thêm cảnh báo mất kết nối Redis; đang viết tài liệu hành vi dự phòng.'));

  return {
    users: 7,
    tasks: taskCount,
    usernames: [admin, linh, ducAnh, ngoc, nam, kiet, vy].map((u) => u.username),
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Seeds the demo database named by `url`; the demo-name guard always runs first, with or without --reset. */
export async function runSeedDemo(url: string, lang: DemoLang, reset: boolean): Promise<DemoSummary> {
  assertDemoDatabase(url);
  const db = createDb(url);
  try {
    if (reset) await wipeDatabase(db);
    return await seedDemo(db, { lang });
  } finally {
    await db.$client.end();
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Usage: DATABASE_URL=postgres://.../agentsync_demo pnpm seed:demo --lang en|vi --reset');
    process.exit(1);
  }
  const lang = arg('lang') ?? 'en';
  if (lang !== 'en' && lang !== 'vi') {
    console.error('--lang must be en or vi');
    process.exit(1);
  }
  try {
    const summary = await runSeedDemo(url, lang, process.argv.includes('--reset'));
    console.log(`Seeded ${summary.users} users and ${summary.tasks} tasks (${lang}).`);
    console.log('');
    console.log('DEMO ONLY - every demo account uses this shared password. Never use it on a real install.');
    console.log(`  password: ${DEMO_PASSWORD}`);
    console.log(`  accounts: ${summary.usernames.join(', ')}`);
    console.log('  quan.nguyen is the director and admin; linh.tran and anh.le are managers.');
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('seed-demo.ts')) void main();
