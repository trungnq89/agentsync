# AgentSync Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây giai đoạn 1 của AgentSync: một ứng dụng self-host gồm web cho quản lý đọc/xác nhận, MCP server cho agent của member và quản lý, và gói skill cho Claude Code + Codex.

**Architecture:** Một ứng dụng Next.js (App Router) + Postgres. Toàn bộ nghiệp vụ nằm trong `src/server/` dưới dạng hàm thuần nhận `(db, actor, input)`, không phụ thuộc HTTP. Web (server actions / RSC) và MCP (route `/api/mcp`) chỉ là lớp mỏng gọi vào đó, nên phân quyền và quy tắc chỉ viết một lần. Mọi kiểm tra quyền đi qua `src/server/authz.ts`.

**Tech Stack:** TypeScript (strict), Next.js 15 App Router, React 19, Postgres 16, Drizzle ORM + drizzle-kit, `@node-rs/argon2`, `@modelcontextprotocol/sdk` + `mcp-handler` (adapter Streamable HTTP cho Next.js), `zod`, Tailwind CSS, Vitest, Playwright, pnpm, Docker Compose. Cài bản stable mới nhất tại thời điểm làm và ghi version cụ thể vào `package.json`.

**Spec:** `docs/superpowers/specs/2026-11-21-agentsync-design.md` (đọc trước khi bắt đầu bất kỳ task nào).

## Global Constraints

- Self-host, triển khai bằng Docker Compose. Không gọi dịch vụ bên ngoài lúc runtime (không CDN, không analytics, không font từ Google: dùng font hệ thống).
- Phân quyền: A xem được việc của B **chỉ khi** `B.id === A.id` hoặc `B.managerId === A.id`. **Không kế thừa.** Admin không được xem báo cáo của người khác.
- Việc riêng tư (`isPrivate = true`) chỉ chủ sở hữu thấy, ở mọi nơi: web, MCP, số liệu trên thẻ, mục cần chú ý.
- Quyền xem/xác nhận/review luôn theo `managerId` **hiện tại** của chủ việc. `tasks.confirmerIdAtCreation` chỉ là thông tin lịch sử.
- Cấp hiển thị (`level`): `director | manager | leader | member`. Nhãn UI: `Director`, `Manager`, `Leader`, `Thành viên`.
- Mode việc: `executive` (mode 1, không code) | `project` (mode 2, có code).
- Chế độ gửi của member: `auto | review`, mặc định `review`.
- Cửa sổ sửa cập nhật/vướng mắc: 24 giờ kể từ `createdAt`. Cửa sổ sửa plan mode `project`: 24 giờ kể từ `createdAt` của phiên bản plan hiện tại.
- "Việc xong" trên thẻ: hoàn thành trong 30 ngày gần nhất.
- "Lâu không cập nhật": mặc định 3 ngày làm việc (T2–T6), cấu hình được trong `app_settings.staleBusinessDays`.
- Múi giờ hiển thị và tính ngày làm việc: `Asia/Ho_Chi_Minh`. Lưu DB bằng `timestamptz` (UTC).
- Ngôn ngữ UI: tiếng Việt. Identifier trong code: tiếng Anh.
- UI đơn giản, mặc định tổng hợp: plan thu gọn thành "x/y bước", diễn biến hiện 3 mục gần nhất, có nút "Xem thêm".
- Token agent dạng `ags_` + 32 byte random base64url. DB chỉ lưu SHA-256 hash và 8 ký tự đầu để hiển thị.

## Review Focus

1. **Đổi quản lý giữa chừng:** quản lý cũ mở link việc cũ → 404 (không lộ là việc tồn tại). Quản lý mới thấy cả lịch sử. Test trong Task 3 và Task 8.
2. **Rò rỉ việc riêng tư** qua đường phụ: số đếm trên thẻ, `needs_attention`, `weekly_digest`, URL `/tasks/:id` gõ trực tiếp. Test trong Task 7 và Task 8.
3. **Token bị thu hồi hoặc sai:** MCP trả 401, không trả dữ liệu một phần. Token của user bị vô hiệu hóa (`disabledAt`) cũng phải 401. Test trong Task 2 và Task 8.
4. **Ranh giới 24 giờ và ngày làm việc qua cuối tuần:** cập nhật lúc T6 17:00 không bị coi là "lâu không cập nhật" vào T2 sáng. Sửa lúc 23:59:59 sau khi tạo được, lúc 24:00:01 bị chặn. Test trong Task 6 và Task 7 dùng đồng hồ tiêm vào (`now: Date`).
5. **Agent gửi cập nhật cho việc không hợp lệ** (việc của người khác, việc đã đóng hoặc hủy, id sai): lỗi rõ ràng bằng tiếng Việt, kèm gợi ý gọi `list_my_tasks`, không âm thầm tạo dữ liệu. Test trong Task 6 và Task 8.

---

## Cấu trúc file

```
docker-compose.yml            Postgres (dev/test) + app (prod profile)
Dockerfile
.env.example
drizzle.config.ts
vitest.config.ts
playwright.config.ts
src/db/schema.ts              toàn bộ bảng + enum
src/db/client.ts              createDb(url), type Db
src/server/errors.ts          DomainError
src/server/clock.ts           businessDaysBetween, addHours, VN timezone helpers
src/server/auth/password.ts   hash/verify
src/server/auth/session.ts    session cookie
src/server/auth/tokens.ts     agent token
src/server/org.ts             user CRUD, đặt manager/level
src/server/authz.ts           mọi kiểm tra quyền
src/server/tasks/lifecycle.ts máy trạng thái (thuần)
src/server/tasks/service.ts   tạo/xác nhận/plan/trạng thái
src/server/tasks/activity.ts  update, blocker, question, solution, review, pending feedback
src/server/tasks/queries.ts   overview, attention, timeline, detail, digest
src/server/tasks/health.ts    tính health + progress (thuần)
src/mcp/format.ts             render Markdown cho agent
src/mcp/tools.ts              đăng ký tool member + manager
app/api/mcp/[transport]/route.ts
app/(auth)/login/page.tsx
app/page.tsx                  trang chủ
app/people/[id]/page.tsx      dòng thời gian một người
app/tasks/[id]/page.tsx       chi tiết việc
app/settings/page.tsx         token, chế độ gửi, mật khẩu
app/admin/page.tsx            user, sơ đồ tổ chức, ngưỡng stale
app/_components/*             PersonCard, TierSection, AttentionList, TimelineBar, TaskHeader, ...
plugins/agentsync/            gói cài cho agent (skill + cấu hình MCP)
tests/helpers/db.ts           resetDb(), testDb
tests/helpers/factories.ts    makeUser, makeTask
tests/server/*.test.ts
tests/e2e/*.spec.ts
```

---

### Task 1: Khung dự án, schema DB, môi trường test

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `docker-compose.yml`, `.env.example`, `.gitignore` (gồm `.superpowers/`, `.env`), `drizzle.config.ts`, `vitest.config.ts`, `src/db/schema.ts`, `src/db/client.ts`, `src/server/errors.ts`, `src/server/clock.ts`, `tests/helpers/db.ts`, `tests/helpers/factories.ts`
- Test: `tests/server/schema.test.ts`, `tests/server/clock.test.ts`

**Interfaces:**
- Produces:
  - `createDb(url: string): Db`, `type Db` (Drizzle node-postgres)
  - Enums: `userLevel`, `taskMode`, `taskStatus` = `pending_confirmation | changes_requested | in_progress | paused | done | awaiting_review | closed | cancelled`, `sendMode`, `blockerStatus` = `open | answered | resolved`, `questionDirection` = `member_to_manager | manager_to_member`, `reviewVerdict` = `approved | changes_needed`, `planChangeKind` = `initial | edit | revision`
  - Bảng (camelCase trong TS):
    - `users` (id uuid, username unique, displayName, avatarUrl?, passwordHash, level, managerId? → users, isAdmin bool, sendMode, disabledAt?, createdAt)
    - `sessions` (id, userId, expiresAt)
    - `agentTokens` (id, userId, label, tokenHash unique, prefix, createdAt, lastUsedAt?, revokedAt?)
    - `tasks` (id, ownerId, confirmerIdAtCreation?, title, mode, status, isPrivate, agreedOutcome, startDate date, agreedDueDate date, expectedEndDate date, progressOverride int?, repoRef jsonb? `{repo?, branch?}`, cwdHint?, createdAt, confirmedAt?, completedAt?, statusChangedAt, statusReason?)
    - `planVersions` (id, taskId, version int, kind, reason?, steps jsonb `{title, status: 'todo'|'doing'|'done'}[]`, createdAt). Unique (taskId, version)
    - `updates` (id, taskId, authorId, body, stepsCompleted jsonb string[], source `auto|reviewed`, evidence jsonb? `{branch?, commits?: number, prUrl?}`, createdAt, editedAt?)
    - `questions` (id, taskId, authorId, direction, body, isBlocker bool, status blockerStatus, answer?, answeredById?, answeredAt?, createdAt, editedAt?)
    - `solutionSummaries` (id, taskId unique, problem, solution, rejectedAlternatives, keyChanges, risks, testing, prUrl?, createdAt)
    - `reviews` (id, taskId, reviewerId, verdict, note?, createdAt)
    - `managerFeedback` (id, taskId, authorId, kind `changes_requested`, note, createdAt, consumedAt?)
    - `appSettings` (singleton id=1, staleBusinessDays int default 3)
  - `class DomainError extends Error { code: 'FORBIDDEN'|'NOT_FOUND'|'INVALID_TRANSITION'|'EDIT_WINDOW_CLOSED'|'VALIDATION'|'UNAUTHORIZED'; }`. Message bằng tiếng Việt.
  - `businessDaysBetween(from: Date, to: Date): number`: số ngày T2–T6 trọn vẹn đã trôi qua theo giờ VN.
  - `isWithinHours(start: Date, now: Date, hours: number): boolean`
  - `resetDb(): Promise<void>`: TRUNCATE mọi bảng CASCADE. `testDb: Db` đọc từ `DATABASE_URL_TEST`
  - `makeUser(p?: Partial<NewUser>): Promise<User>`, `makeTask(ownerId: string, p?: Partial<NewTask> & {steps?: string[]}): Promise<Task>` (tạo kèm planVersion 1)

- [ ] **Step 1:** `git init`, scaffold Next.js (TypeScript, App Router, Tailwind, `src/`), thêm các dependency ở Tech Stack. `docker-compose.yml` có service `db` (postgres:16, port 5432) dùng cho dev/test.
- [ ] **Step 2: Viết test thất bại**

```ts
// tests/server/schema.test.ts
it('creates a user with a manager and a task with plan v1', async () => {
  const boss = await makeUser({ level: 'director' });
  const m = await makeUser({ level: 'manager', managerId: boss.id });
  const t = await makeTask(m.id, { steps: ['A', 'B'] });
  const plans = await testDb.select().from(planVersions).where(eq(planVersions.taskId, t.id));
  expect(plans).toHaveLength(1);
  expect(plans[0].steps.map(s => s.title)).toEqual(['A', 'B']);
});
// tests/server/clock.test.ts
it('Fri 17:00 VN to Mon 09:00 VN is 0 business days', () => {
  expect(businessDaysBetween(new Date('2026-11-20T10:00:00Z'), new Date('2026-11-23T02:00:00Z'))).toBe(0);
});
it('Mon 09:00 to Thu 09:00 VN is 3 business days', () => {
  expect(businessDaysBetween(new Date('2026-11-23T02:00:00Z'), new Date('2026-11-26T02:00:00Z'))).toBe(3);
});
it('isWithinHours boundary', () => {
  const s = new Date('2026-11-21T00:00:00Z');
  expect(isWithinHours(s, new Date('2026-11-21T23:59:59Z'), 24)).toBe(true);
  expect(isWithinHours(s, new Date('2026-11-22T00:00:01Z'), 24)).toBe(false);
});
```

- [ ] **Step 3:** Chạy `docker compose up -d db && pnpm vitest run`. Kỳ vọng: FAIL (chưa có schema).
- [ ] **Step 4:** Viết schema, client, errors, clock, helpers. Tạo migration bằng `pnpm drizzle-kit generate`. Thêm script `db:migrate`. Vitest `globalSetup` chạy migrate lên DB test, `fileParallelism: false`, `beforeEach(resetDb)`.
- [ ] **Step 5:** `pnpm vitest run`. Kỳ vọng: PASS. `pnpm tsc --noEmit` sạch.
- [ ] **Step 6:** Commit `chore: scaffold app, db schema, test harness`

---

### Task 2: Mật khẩu, phiên đăng nhập, token agent

**Files:**
- Create: `src/server/auth/password.ts`, `src/server/auth/session.ts`, `src/server/auth/tokens.ts`
- Test: `tests/server/auth.test.ts`

**Interfaces:**
- Consumes: `Db`, bảng `users`, `sessions`, `agentTokens`, `DomainError`
- Produces:
  - `hashPassword(pw: string): Promise<string>`, `verifyPassword(hash: string, pw: string): Promise<boolean>` (argon2id)
  - `login(db, username: string, pw: string): Promise<{ sessionId: string; user: User }>`. Sai thông tin hoặc user bị disabled thì ném `UNAUTHORIZED`, cùng một message cho mọi trường hợp.
  - `getSessionUser(db, sessionId: string, now?: Date): Promise<User | null>`. Session sống 14 ngày.
  - `logout(db, sessionId: string): Promise<void>`
  - `createAgentToken(db, userId: string, label: string): Promise<{ token: string; record: AgentToken }>`. Plaintext chỉ trả về đúng lần này.
  - `authenticateAgentToken(db, bearer: string, now?: Date): Promise<User>`. Ném `UNAUTHORIZED` nếu token sai, đã thu hồi, hoặc user bị disabled. Cập nhật `lastUsedAt`.
  - `revokeAgentToken(db, actorId: string, tokenId: string): Promise<void>`. Chỉ chủ token được thu hồi.

- [ ] **Step 1: Viết test thất bại.** Các assertion chính:
  - `login` đúng trả về user. Sai mật khẩu, username lạ, hoặc user có `disabledAt` → `rejects.toMatchObject({code:'UNAUTHORIZED'})`.
  - `getSessionUser` trả null khi `now` > expiresAt.
  - `createAgentToken` trả token khớp `/^ags_[A-Za-z0-9_-]{43}$/`. DB không chứa plaintext (`tokenHash !== token`).
  - `authenticateAgentToken`: thành công với token đúng. Sau `revokeAgentToken` → UNAUTHORIZED. User bị disable → UNAUTHORIZED.
  - User khác gọi `revokeAgentToken` → FORBIDDEN.
- [ ] **Step 2:** `pnpm vitest run tests/server/auth.test.ts`. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt. So sánh hash bằng `crypto.timingSafeEqual`.
- [ ] **Step 4:** Chạy lại. Kỳ vọng: PASS.
- [ ] **Step 5:** Commit `feat(auth): passwords, sessions, agent tokens`

---

### Task 3: Sơ đồ tổ chức và phân quyền

**Files:**
- Create: `src/server/org.ts`, `src/server/authz.ts`
- Test: `tests/server/authz.test.ts`, `tests/server/org.test.ts`

**Interfaces:**
- Consumes: `Db`, `users`, `tasks`
- Produces:
  - `type Actor = Pick<User, 'id' | 'isAdmin'>`
  - `canViewUser(actor: Actor, target: Pick<User,'id'|'managerId'>): boolean`
  - `canViewTask(actor: Actor, task: Pick<Task,'ownerId'|'isPrivate'>, owner: Pick<User,'id'|'managerId'>): boolean`: chủ việc luôn xem được. Quản lý trực tiếp xem được khi `!isPrivate`.
  - `isCurrentManagerOf(actor: Actor, owner: Pick<User,'managerId'>): boolean`
  - `loadTaskForViewer(db, actor: Actor, taskId: string): Promise<{task: Task; owner: User}>`. Không có quyền hoặc không tồn tại thì đều ném `NOT_FOUND`.
  - `listDirectReports(db, managerId: string): Promise<User[]>` (bỏ user disabled)
  - Admin-only, ném `FORBIDDEN` nếu `!actor.isAdmin`:
    - `createUser(db, actor, input: {username, displayName, password, level, managerId?, isAdmin?})`
    - `updateUser(db, actor, id, patch: Partial<{displayName, level, managerId: string|null, isAdmin, disabled: boolean}>)`
    - `setPassword(db, actor, id, pw)`
  - `updateUser` ném `VALIDATION` nếu `managerId` tạo thành vòng (A→B→A), hoặc là chính mình.

- [ ] **Step 1: Viết test thất bại**

```ts
it('direct manager sees report task; grand-manager does not', ...)       // director→manager→leader: director cannot view leader task
it('nobody but owner sees private task, including manager and admin', ...)
it('after manager change, old manager gets NOT_FOUND and new manager sees it', async () => {
  // leader.managerId = m1; makeTask(leader); updateUser(admin, leader.id, {managerId: m2.id})
  await expect(loadTaskForViewer(testDb, m1, t.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(loadTaskForViewer(testDb, m2, t.id)).resolves.toBeTruthy();
});
it('admin without management link cannot view task', ...)
it('rejects manager cycle', ...)  // expect code 'VALIDATION'
it('non-admin cannot createUser', ...) // 'FORBIDDEN'
```

- [ ] **Step 2:** Chạy. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt. Kiểm tra vòng bằng cách đi ngược chuỗi `managerId` từ manager mới; nếu gặp lại `id` thì là vòng.
- [ ] **Step 4:** Chạy. Kỳ vọng: PASS.
- [ ] **Step 5:** Commit `feat(org): org chart and direct-report authorization`

---

### Task 4: Máy trạng thái của việc (thuần, không DB)

**Files:**
- Create: `src/server/tasks/lifecycle.ts`
- Test: `tests/server/lifecycle.test.ts`

**Interfaces:**
- Produces:
  - `type TaskAction = 'confirm'|'request_changes'|'resubmit'|'complete'|'approve_review'|'reject_review'|'pause'|'resume'|'cancel'`
  - `type Role = 'owner'|'manager'`
  - `nextStatus(ctx: { status: TaskStatus; mode: TaskMode; hasManager: boolean; isPrivate: boolean }, action: TaskAction, role: Role): TaskStatus`. Transition không hợp lệ ném `INVALID_TRANSITION`, sai vai trò ném `FORBIDDEN`.
  - `initialStatus(ctx: { hasManager: boolean; isPrivate: boolean }): TaskStatus`: `in_progress` nếu private hoặc không có quản lý, ngược lại `pending_confirmation`.
  - `ACTIVE_STATUSES`, `DONE_STATUSES = ['done','closed']`, `TERMINAL_STATUSES = ['done','closed','cancelled']`

Bảng chuyển trạng thái (nguồn chân lý cho test):

| from | action | role | to |
|---|---|---|---|
| pending_confirmation | confirm | manager | in_progress |
| pending_confirmation | request_changes | manager | changes_requested |
| changes_requested | resubmit | owner | pending_confirmation |
| in_progress | complete | owner | `done` nếu mode=executive hoặc !hasManager hoặc isPrivate. Ngược lại `awaiting_review` |
| awaiting_review | approve_review | manager | closed |
| awaiting_review | reject_review | manager | in_progress |
| in_progress | pause | owner | paused |
| paused | resume | owner | in_progress |
| mọi trạng thái không thuộc TERMINAL | cancel | owner | cancelled |

- [ ] **Step 1: Viết test thất bại.** Dùng `it.each` cho từng dòng của bảng. Thêm các test:
  - `complete` ở mode project có quản lý → `awaiting_review`.
  - `confirm` với role owner → FORBIDDEN.
  - `pause` từ `done` → INVALID_TRANSITION.
  - `cancel` từ `closed` → INVALID_TRANSITION.
- [ ] **Step 2:** Chạy. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt bằng một bảng tra.
- [ ] **Step 4:** Chạy. Kỳ vọng: PASS.
- [ ] **Step 5:** Commit `feat(tasks): lifecycle state machine`

---

### Task 5: Dịch vụ việc: tạo, xác nhận, plan, trạng thái, riêng tư

**Files:**
- Create: `src/server/tasks/service.ts`
- Test: `tests/server/task-service.test.ts`

**Interfaces:**
- Consumes: `nextStatus`, `initialStatus` (Task 4), `loadTaskForViewer`, `isCurrentManagerOf` (Task 3), `isWithinHours` (Task 1)
- Produces (tất cả nhận `now: Date = new Date()` làm tham số cuối):
  - `createTask(db, actor, input: { title; mode; agreedOutcome; startDate; agreedDueDate; steps: string[]; isPrivate?: boolean; repoRef?; cwdHint? }): Promise<Task>`:
    - `expectedEndDate = agreedDueDate`
    - `confirmerIdAtCreation = owner.managerId`
    - plan v1 có kind `initial`
    - `steps` rỗng → VALIDATION
    - `agreedDueDate < startDate` → VALIDATION
  - `confirmTask(db, actor, taskId)` và `requestChanges(db, actor, taskId, note: string)`: chỉ quản lý hiện tại được gọi. `requestChanges` ghi `managerFeedback`.
  - `changePlan(db, actor, taskId, input: { steps: {title, status}[]; reason?: string; expectedEndDate?: string })`. Chỉ owner. Quy tắc:
    - Nếu status là `changes_requested`: tạo version kind `revision` rồi chạy `resubmit`. Các `managerFeedback` chưa tiêu thụ được đánh dấu `consumedAt`.
    - Mode `executive`: luôn tạo version kind `edit`. `reason` là tùy chọn.
    - Mode `project`, trong 24 giờ kể từ `createdAt` của version hiện tại: kind `edit`.
    - Mode `project`, quá 24 giờ: kind `revision`, `reason` bắt buộc. Thiếu `reason` → `EDIT_WINDOW_CLOSED`, message: "Plan đã khóa sau 24 giờ. Hãy gửi lý do để tạo phiên bản mới."
    - `expectedEndDate` được cập nhật nếu có truyền vào.
  - `setTaskStatus(db, actor, taskId, action: 'complete'|'pause'|'resume'|'cancel', reason?: string)`:
    - `pause` và `cancel` bắt buộc `reason` (thiếu → VALIDATION).
    - `complete` ở mode project có quản lý bắt buộc đã có `solutionSummaries`. Thiếu → VALIDATION, message: "Cần gửi tóm tắt giải pháp trước khi đánh dấu xong."
    - Ghi `statusChangedAt` và `statusReason`. Ghi `completedAt` khi chuyển sang done hoặc awaiting_review.
  - `makePublic(db, actor, taskId)`. Chỉ owner, chỉ khi `isPrivate`. Đặt `isPrivate=false`. Nếu có quản lý: status → `pending_confirmation`, `confirmerIdAtCreation` = manager hiện tại.
  - `getCurrentPlan(db, taskId): Promise<PlanVersion>`

- [ ] **Step 1: Viết test thất bại.** Tên test và assertion:
  - `create → pending_confirmation when owner has manager`
  - `create → in_progress when private`
  - `create → in_progress when owner has no manager`
  - `manager confirms → in_progress; non-manager confirm → NOT_FOUND`
  - `request changes then changePlan resubmits and consumes feedback`
  - `project plan edit within 24h → kind edit, no reason needed`
  - `project plan after 24h without reason → EDIT_WINDOW_CLOSED; with reason → kind revision`
  - `executive plan edit after 10 days without reason → kind edit, version increments`
  - `pause without reason → VALIDATION`
  - `complete project task without solution → VALIDATION`
  - `makePublic on private task of member with manager → pending_confirmation`
- [ ] **Step 2:** Chạy. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt. Mọi thao tác ghi chạy trong `db.transaction`. Version kế tiếp = max + 1 (đã có unique constraint chặn trùng).
- [ ] **Step 4:** Chạy. Kỳ vọng: PASS.
- [ ] **Step 5:** Commit `feat(tasks): create, confirm, plan changes, status, privacy`

---

### Task 6: Hoạt động: cập nhật, vướng mắc/câu hỏi, tóm tắt giải pháp, review, phản hồi chờ xử lý

**Files:**
- Create: `src/server/tasks/activity.ts`
- Test: `tests/server/activity.test.ts`

**Interfaces:**
- Consumes: Task 3, Task 4, Task 5 (`getCurrentPlan`)
- Produces (cùng quy ước `now`):
  - `postUpdate(db, actor, taskId, input: { body; stepsCompleted?: string[]; progressPct?: number; expectedEndDate?: string; source: 'auto'|'reviewed'; evidence? })`:
    - Chỉ owner.
    - Task ở TERMINAL → INVALID_TRANSITION, message: "Việc này đã đóng/hủy. Dùng list_my_tasks để chọn việc đang mở."
    - Task không tồn tại hoặc của người khác → NOT_FOUND, message gợi ý `list_my_tasks`.
    - Đánh dấu các step khớp tiêu đề trong `stepsCompleted` thành done (cập nhật trực tiếp lên version hiện tại, không tạo version mới).
    - `progressPct` (0–100) ghi vào `progressOverride`.
  - `editUpdate(db, actor, updateId, body)` và `editQuestion(db, actor, questionId, body)`: chỉ tác giả, trong 24 giờ, đặt `editedAt`. Quá hạn → EDIT_WINDOW_CLOSED.
  - `deleteUpdate(db, actor, updateId)`: chỉ khi task `isPrivate`, ngược lại → FORBIDDEN.
  - `askQuestion(db, actor, taskId, body, opts: { isBlocker: boolean })`: owner → `member_to_manager`, quản lý hiện tại → `manager_to_member` (isBlocker luôn false).
  - `answerQuestion(db, actor, questionId, answer)`: phía còn lại trả lời → status `answered`.
  - `resolveQuestion(db, actor, questionId)`: chỉ người hỏi.
  - `submitSolutionSummary(db, actor, taskId, input: {problem, solution, rejectedAlternatives, keyChanges, risks, testing, prUrl?})`: chỉ mode project. Upsert.
  - `reviewSolution(db, actor, taskId, verdict, note?)`: quản lý hiện tại. Gọi `nextStatus` với `approve_review` hoặc `reject_review`. Ghi `reviews`.
  - `getPendingFeedback(db, actor): Promise<{ changesRequested: {taskId, title, note}[]; questionsForMe: {questionId, taskId, title, body}[]; answersToMyQuestions: {...}[]; reviewResults: {taskId, title, verdict, note}[] }>`:
    - `changesRequested`: managerFeedback chưa consumed.
    - `questionsForMe`: câu `manager_to_member` đang open trên việc của actor.
    - `answersToMyQuestions`: câu actor hỏi đã `answered` nhưng chưa resolve.
    - `reviewResults`: review mới nhất có verdict `changes_needed` trên việc đang `in_progress`.

- [ ] **Step 1: Viết test thất bại.** Gồm:
  - `postUpdate on someone else's task → NOT_FOUND mentioning list_my_tasks`
  - `postUpdate on cancelled task → INVALID_TRANSITION`
  - `stepsCompleted marks steps done in current plan`
  - `editUpdate at +23h59m ok, at +24h01m EDIT_WINDOW_CLOSED`
  - `deleteUpdate on public task → FORBIDDEN`
  - `manager question appears in owner's getPendingFeedback.questionsForMe; disappears after answer`
  - `reviewSolution changes_needed → in_progress and shows in reviewResults`
  - `submitSolutionSummary on executive task → VALIDATION`
- [ ] **Step 2:** Chạy. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt.
- [ ] **Step 4:** Chạy. Kỳ vọng: PASS.
- [ ] **Step 5:** Commit `feat(tasks): updates, questions, solution summary, review, pending feedback`

---

### Task 7: Tính sức khỏe việc và các truy vấn tổng hợp

**Files:**
- Create: `src/server/tasks/health.ts`, `src/server/tasks/queries.ts`
- Test: `tests/server/health.test.ts`, `tests/server/queries.test.ts`

**Interfaces:**
- Consumes: Task 1–6
- Produces:
  - `progressPct(plan: PlanVersion, override: number | null): number`: dùng override nếu có, ngược lại `round(done/total*100)`.
  - `computeHealth(i: { status; agreedDueDate; expectedEndDate; lastActivityAt: Date; hasOpenBlocker: boolean; staleBusinessDays: number; now: Date }): { health: 'on_track'|'at_risk'|'blocked'; overdue: boolean; stale: boolean }`:
    - `blocked` nếu có blocker đang mở.
    - `at_risk` nếu overdue hoặc stale.
    - `overdue` = `expectedEndDate > agreedDueDate`, hoặc (hôm nay theo giờ VN > agreedDueDate và chưa thuộc DONE_STATUSES).
    - `stale` = status thuộc `in_progress|paused` và `businessDaysBetween(lastActivityAt, now) >= staleBusinessDays`.
    - `lastActivityAt` = max(createdAt, update mới nhất, statusChangedAt).
  - `teamOverview(db, actor, now)`: trả `{ tiers: { level: UserLevel; people: PersonCard[] }[] }`, trong đó `PersonCard = { userId, displayName, avatarUrl, doneCount30d, activeCount, hasBlocked, hasAwaitingReview, lastActivityAt: Date|null }`:
    - Gồm thẻ của chính actor và các direct report.
    - Thứ tự tầng: director, manager, leader, member. Bỏ tầng rỗng.
    - Việc riêng tư chỉ được tính trong thẻ của chính actor.
  - `needsAttention(db, actor, now): AttentionItem[]`, trong đó `AttentionItem = { kind: 'pending_confirmation'|'awaiting_review'|'blocked'|'overdue'|'stale'|'paused_or_cancelled'|'changes_requested'|'question_for_me'; taskId; taskTitle; ownerName; detail: string; at: Date }`:
    - Việc của các direct report (không private): pending_confirmation, awaiting_review, blocked, overdue, stale, và paused/cancelled trong 7 ngày gần nhất.
    - Việc của chính actor: changes_requested, question_for_me.
    - Sắp xếp theo thứ tự kind như trên, rồi theo `at` giảm dần.
  - `personTimeline(db, actor, userId, now)`: trả `{ person: User; tasks: TimelineTask[] }`:
    - Không có quyền xem người đó → NOT_FOUND.
    - Gồm việc đang active và việc hoàn thành trong 30 ngày gần nhất. Mỗi việc có `startDate, agreedDueDate, expectedEndDate, progress, health, status`.
  - `taskDetail(db, actor, taskId, now)`: trả `{ task; owner; plan; progress; health; updates (mới nhất trước); questions; solution?; latestReview?; planHistory: {version, kind, reason, createdAt}[]; canConfirm; canReview; canEdit }`
  - `weeklyDigest(db, actor, now)`: trả `{ people: { displayName; completed: {title}[]; started: {title}[]; blocked: {title, detail}[]; slipped: {title, from, to}[] }[] }` cho 7 ngày gần nhất, chỉ trên các việc của direct report không private.

- [ ] **Step 1: Viết test thất bại.** Gồm:
  - `computeHealth`: có blocker mở → blocked. Expected > agreed → at_risk + overdue. Cập nhật lúc T6 17:00 VN, xem lúc T2 09:00 VN → không stale. Cập nhật từ T2, xem lúc T5 → stale.
  - `teamOverview`: director→manager→leader. Director chỉ thấy thẻ của chính mình và của manager, không có tầng leader. Một việc private của manager không được tính vào `activeCount` trên thẻ manager khi director xem.
  - `needsAttention`: việc private đang pending của report không xuất hiện. Việc awaiting_review của report có xuất hiện.
  - `personTimeline` cho người không phải report → NOT_FOUND.
  - `weeklyDigest` bỏ qua việc private.
- [ ] **Step 2:** Chạy. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt. Với 20 user thì N+1 nhỏ vẫn chấp nhận được, nhưng ưu tiên một truy vấn cho mỗi danh sách.
- [ ] **Step 4:** Chạy. Kỳ vọng: PASS.
- [ ] **Step 5:** Commit `feat(tasks): health and aggregate queries`

---

### Task 8: MCP server

**Files:**
- Create: `src/mcp/format.ts`, `src/mcp/tools.ts`, `app/api/mcp/[transport]/route.ts`
- Test: `tests/server/mcp-tools.test.ts`, `tests/server/mcp-route.test.ts`

**Interfaces:**
- Consumes: Task 2 (`authenticateAgentToken`), Task 5–7
- Produces:
  - `registerTools(server: McpServer, ctx: { db: Db; getActor: () => User; now?: () => Date }): void`. Đăng ký các tool sau, input dùng zod, mô tả bằng tiếng Việt:
    - **Member:**
      - `list_my_tasks` ({ includeDone?: boolean })
      - `create_task` (giống `createTask`)
      - `update_progress` (taskId + input của `postUpdate`)
      - `revise_plan` (taskId + input của `changePlan`)
      - `set_task_status` (taskId, action, reason?)
      - `make_task_public` (taskId)
      - `report_blocker` (taskId, body)
      - `ask_manager` (taskId, body)
      - `answer_question` (questionId, answer)
      - `submit_solution_summary`
      - `get_pending_feedback` ({})
      - `get_my_settings` ({}): trả `sendMode` để skill biết cần duyệt trước hay không
    - **Manager:**
      - `team_overview`
      - `needs_attention`
      - `task_detail` (taskId)
      - `weekly_digest`
      - `confirm_task` (taskId)
      - `request_changes` (taskId, note)
      - `answer_blocker` (questionId, answer)
      - `ask_question` (taskId, body)
      - `review_solution` (taskId, verdict, note?)
  - Mỗi tool trả `content: [{type:'text', text: markdown}, {type:'text', text: JSON.stringify(data)}]`. Lỗi `DomainError` trả về `isError: true` kèm message tiếng Việt, không ném ra transport.
  - `format.ts`: `formatOverview`, `formatAttention`, `formatTaskDetail`, `formatDigest`, `formatTaskList`. Markdown ngắn gọn: tiêu đề, trạng thái tiếng Việt, %, ngày dự kiến, vướng mắc.
  - Route: dùng `createMcpHandler` của `mcp-handler`, `basePath: '/api'`. Đọc header `Authorization: Bearer <token>` rồi gọi `authenticateAgentToken`. Thất bại → HTTP 401 JSON `{error:'unauthorized'}`, chưa đăng ký tool nào.

- [ ] **Step 1: Viết test thất bại**
  - `mcp-tools.test.ts`: tạo `McpServer`, gọi `registerTools`, nối với `Client` của SDK qua `InMemoryTransport.createLinkedPair()`. Test:
    - `create_task then list_my_tasks contains it with status "Chờ xác nhận"`
    - `update_progress on other user's task returns isError with "list_my_tasks"`
    - `manager team_overview excludes grand-reports`
    - `needs_attention excludes private tasks`
    - `after manager change, old manager task_detail isError`
  - `mcp-route.test.ts`: gọi trực tiếp handler `POST` export từ route với `Request`. Header thiếu, token sai, hoặc token đã thu hồi → `status 401`. Token đúng + `tools/list` (JSON-RPC) → 200 và có `create_task`.
- [ ] **Step 2:** Chạy. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt. Map trạng thái sang tiếng Việt trong một chỗ duy nhất (`src/server/labels.ts`, dùng chung với web):
  - `pending_confirmation`: Chờ xác nhận
  - `changes_requested`: Cần sửa plan
  - `in_progress`: Đang làm
  - `paused`: Tạm dừng
  - `done`: Xong
  - `awaiting_review`: Xong, chờ review
  - `closed`: Đã đóng
  - `cancelled`: Đã hủy
- [ ] **Step 4:** Chạy. Kỳ vọng: PASS.
- [ ] **Step 5:** Commit `feat(mcp): member and manager tools over streamable http`

---

### Task 9: Web nền tảng: đăng nhập, layout, cài đặt, admin

**Files:**
- Create: `middleware.ts` (chuyển hướng về `/login` nếu chưa có session), `app/(auth)/login/page.tsx`, `app/layout.tsx`, `app/settings/page.tsx`, `app/admin/page.tsx`, `app/_lib/actor.ts`, `app/_actions/*.ts`, `src/server/labels.ts` (nếu chưa có), `scripts/seed-admin.ts`, `playwright.config.ts`
- Test: `tests/e2e/auth-admin.spec.ts`

**Interfaces:**
- Consumes: Task 2, Task 3
- Produces:
  - `getActor(): Promise<User>`: đọc cookie `ags_session` (httpOnly, sameSite=lax, secure khi production). Không có session thì redirect `/login`.
  - `pnpm seed:admin --username <u> --password <p>`: tạo admin đầu tiên.
  - Settings:
    - danh sách token (prefix, nhãn, lần dùng gần nhất), tạo token mới (hiện plaintext đúng một lần, kèm đoạn cấu hình MCP để copy), thu hồi
    - chọn `sendMode`
    - đổi mật khẩu
  - Admin:
    - bảng user: tên, username, cấp, quản lý (select), admin, vô hiệu hóa
    - tạo user, đặt lại mật khẩu
    - ô `staleBusinessDays`

- [ ] **Step 1: Viết e2e thất bại.** Seed admin, đăng nhập, tạo 2 user (manager, leader với manager = manager), đăng xuất, đăng nhập bằng leader, tạo token. Assert token hiện ra khớp `/^ags_/` và sau khi reload trang thì không còn hiện plaintext.
- [ ] **Step 2:** `pnpm playwright test tests/e2e/auth-admin.spec.ts`. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt. Server actions gọi hàm trong `src/server`, `DomainError` hiển thị thành thông báo lỗi trên form. Giao diện tối giản, Tailwind, hỗ trợ dark mode bằng `prefers-color-scheme`.
- [ ] **Step 4:** Chạy. Kỳ vọng: PASS.
- [ ] **Step 5:** Commit `feat(web): login, settings, admin`

---

### Task 10: Web: trang chủ và trang một người

**Files:**
- Create: `app/page.tsx`, `app/people/[id]/page.tsx`, `app/_components/AttentionList.tsx`, `app/_components/TierSection.tsx`, `app/_components/PersonCard.tsx`, `app/_components/Timeline.tsx`
- Test: `tests/e2e/home.spec.ts`

**Interfaces:**
- Consumes: `teamOverview`, `needsAttention`, `personTimeline` (Task 7), `getActor` (Task 9)
- Produces: các component `PersonCard({card})`, `Timeline({tasks, now})` cho Task 11 dùng lại nếu cần.

Theo spec §6.1–6.2 và mockup `.superpowers/brainstorm/*/content/overview-tiers-v2.html`:
- **Trang chủ:**
  - Phía trên là mục "Cần anh chú ý", ẩn khi rỗng. Mỗi dòng gồm tên người, tên việc, mô tả, link tới việc.
  - Bên dưới là các tầng. Thẻ gồm avatar (chữ cái đầu nếu không có ảnh), tên, "X việc xong · Y việc đang làm", huy hiệu đỏ "kẹt" hoặc xanh "chờ review", "cập nhật …" theo thời gian tương đối tiếng Việt.
  - Bấm vào thẻ mở `/people/:id`.
- **Trang một người:** trục ngày từ min(startDate) − 3 ngày đến max(expectedEndDate) + 7 ngày.
  - Mỗi việc là một hàng: tên bên trái, thanh từ start đến expectedEnd, phần tô đậm theo %.
  - Màu: đỏ nếu blocked, vàng nếu at_risk, xanh lá nếu đã xong.
  - Có vạch đỏ "hôm nay". Nếu expectedEnd > agreedDue thì có nét đứt ở agreedDue.
  - Bấm vào hàng mở `/tasks/:id`.
  - Vẽ bằng CSS (div định vị theo %), không thêm thư viện chart.

- [ ] **Step 1: Viết e2e thất bại.** Seed: director → manager → leader. Manager có 1 việc đang kẹt. Leader có 1 việc. Kiểm tra:
  - Đăng nhập director: thấy tầng "Manager" với thẻ manager có huy hiệu "kẹt". Không thấy chữ tên leader.
  - Vào `/people/<leaderId>` → trang 404.
  - Đăng nhập manager: mục chú ý không chứa việc private của leader.
- [ ] **Step 2:** Chạy. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt. `NOT_FOUND` từ server gọi `notFound()` của Next.
- [ ] **Step 4:** Chạy. Kỳ vọng: PASS. Kiểm tra thêm ở chiều rộng 375px: không có scroll ngang.
- [ ] **Step 5:** Commit `feat(web): home tiers, attention list, person timeline`

---

### Task 11: Web: chi tiết việc và các hành động của quản lý

**Files:**
- Create: `app/tasks/[id]/page.tsx`, `app/_components/TaskHeader.tsx`, `app/_components/PlanSummary.tsx`, `app/_components/QuestionBox.tsx`, `app/_components/SolutionCard.tsx`, `app/_components/ActivityFeed.tsx`, `app/_actions/task.ts`
- Test: `tests/e2e/task-detail.spec.ts`

**Interfaces:**
- Consumes: `taskDetail` (Task 7), `confirmTask`, `requestChanges` (Task 5), `answerQuestion`, `askQuestion`, `reviewSolution` (Task 6)

Theo spec §6.3 và mockup `task-detail.html`, thứ tự hiển thị:
1. Header: tiêu đề, trạng thái (nhãn từ `labels.ts`), %, ngày dự kiến (có "trễ N ngày" nếu trễ), cập nhật gần nhất. Với việc chờ xác nhận và `canConfirm`: nút **Xác nhận** và **Yêu cầu sửa** (mở ô nhập ghi chú).
2. Kết quả đã thống nhất.
3. Vướng mắc / câu hỏi đang mở, kèm ô trả lời. Có ô "Đặt câu hỏi cho {tên}".
4. Mode project: thẻ Tóm tắt giải pháp. Nếu `canReview`: nút **Đã review, ổn** và **Cần sửa** (kèm ghi chú). Link PR.
5. Plan thu gọn "x/y bước", bấm để mở danh sách bước. Nếu đã có version kind `revision` thì hiện "Plan đã đổi N lần" và lý do gần nhất.
6. Diễn biến: 3 mục gần nhất, nút "Xem thêm". Mỗi mục có nhãn "tự động" hoặc "đã duyệt", và "đã sửa" nếu có `editedAt`.

- [ ] **Step 1: Viết e2e thất bại**
  - Manager mở việc pending của leader, bấm Xác nhận → trạng thái "Đang làm".
  - Việc project awaiting_review: bấm "Cần sửa" kèm ghi chú → trạng thái "Đang làm", và `getPendingFeedback(leader).reviewResults` có ghi chú đó (kiểm bằng gọi hàm server trong test).
  - Manager gửi câu hỏi → xuất hiện trong `questionsForMe` của leader.
  - Việc có 5 cập nhật: mặc định chỉ hiện 3.
- [ ] **Step 2:** Chạy. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt.
- [ ] **Step 4:** Chạy. Kỳ vọng: PASS.
- [ ] **Step 5:** Commit `feat(web): task detail with confirm, review, questions`

---

### Task 12: Gói skill cho Claude Code và Codex

**Files:**
- Create:
  - `plugins/agentsync/.claude-plugin/plugin.json`
  - `plugins/agentsync/.mcp.json`
  - `plugins/agentsync/skills/agentsync-plan/SKILL.md`
  - `plugins/agentsync/skills/agentsync-session/SKILL.md`
  - `plugins/agentsync/skills/agentsync-manager/SKILL.md`
  - `plugins/agentsync/codex/README.md`
  - `docs/install-agent.md`
- Test: `tests/server/plugin-files.test.ts`

**Interfaces:**
- Consumes: tên các tool MCP (Task 8)

Nội dung các skill (viết tiếng Việt, frontmatter `name` và `description` bằng tiếng Anh để agent kích hoạt đúng):
- **`agentsync-plan`**: kích hoạt khi member muốn lập plan hoặc tạo việc sau buổi thảo luận với quản lý. Các bước:
  1. Hỏi những gì còn thiếu: kết quả đã thống nhất, hạn, việc riêng tư hay không.
  2. Đoán mode: trong repo git thì `project`, ngược lại `executive`. Báo cho member để họ sửa nếu cần.
  3. Soạn plan 3–8 bước.
  4. Gọi `get_my_settings`. Nếu `sendMode=review` thì hiện bản nháp và chờ member đồng ý.
  5. Gọi `create_task` với `cwdHint` = thư mục hiện tại và `repoRef.branch` nếu có.
- **`agentsync-session`**: kích hoạt khi bắt đầu hoặc tiếp tục làm một việc đã có, và khi member nói đã xong hoặc kết thúc phiên.
  - **Khi bắt đầu:**
    - Gọi `get_pending_feedback` và nhắc member các mục đang chờ.
    - Xác định việc đang làm theo thứ tự: branch hiện tại khớp `repoRef.branch`, rồi `cwdHint`, nếu vẫn không được thì hỏi member chọn từ `list_my_tasks`.
  - **Khi kết thúc:**
    - Tóm tắt trong 2–4 câu: đã làm gì, bước nào xong, phát hiện gì mới, có vướng mắc không.
    - Đính kèm bằng chứng: lấy branch từ `git branch --show-current`, số commit từ `git rev-list --count <base>..HEAD`, link PR nếu có.
    - Nếu `sendMode=review` thì cho member duyệt trước. Sau đó gọi `update_progress`.
    - Nếu có vướng mắc cần quản lý quyết thì gọi `report_blocker`.
  - **Khi xong việc mode project:** soạn tóm tắt giải pháp (vấn đề, giải pháp, phương án đã loại, thay đổi chính, rủi ro, kiểm thử), gọi `submit_solution_summary`, rồi `set_task_status complete`.
  - **Không bao giờ:** gửi nội dung code, secret, hoặc dữ liệu khách hàng lên server. Chỉ gửi bản tóm tắt.
- **`agentsync-manager`**: kích hoạt khi quản lý hỏi tình hình team, việc nào cần chú ý, hoặc muốn xác nhận, review, trả lời. Dùng các tool manager. Trả lời ngắn gọn ở mức tổng hợp, chỉ đi sâu khi được hỏi.
- **`.mcp.json`:** server `agentsync`, type `http`, url `${AGENTSYNC_URL}/api/mcp`, header `Authorization: Bearer ${AGENTSYNC_TOKEN}`.
- **`codex/README.md`:**
  - Cách copy thư mục `skills/` vào `~/.codex/skills/`.
  - Cách thêm MCP server dạng streamable HTTP với bearer token qua `codex mcp add`, hoặc qua `~/.codex/config.toml`.
  - Kiểm tra cú pháp chính xác theo tài liệu Codex hiện hành tại developers.openai.com/codex trước khi viết.
- **`docs/install-agent.md`:** hướng dẫn một trang cho member: lấy token ở trang Cài đặt, cài cho Claude Code (`/plugin install` từ thư mục, hoặc copy), cài cho Codex.

- [ ] **Step 1: Viết test thất bại.** `plugin-files.test.ts` kiểm tra:
  - Mỗi `SKILL.md` có frontmatter `name` và `description`.
  - Mọi tên tool được nhắc tới trong các SKILL.md (regex `` `([a-z_]+)` `` lọc theo danh sách) đều thuộc tập tool mà `registerTools` đã đăng ký.
  - `.mcp.json` là JSON hợp lệ.
- [ ] **Step 2:** Chạy. Kỳ vọng: FAIL.
- [ ] **Step 3:** Viết các file.
- [ ] **Step 4:** Chạy. Kỳ vọng: PASS.
- [ ] **Step 5: Kiểm tra thủ công**
  - Chạy app local. Cài plugin vào Claude Code. Trong một repo thử, nói "lập plan cho việc thêm API X, hạn thứ 6". Việc phải xuất hiện "Chờ xác nhận" trên web của quản lý.
  - Ghi kết quả vào `docs/install-agent.md` mục "Đã kiểm tra".
  - Nếu không có Codex trong môi trường thì ghi rõ là chưa kiểm tra với Codex.
- [ ] **Step 6:** Commit `feat(agent): skills and plugin packaging for Claude Code and Codex`

---

### Task 13: Đóng gói triển khai và kiểm tra khói toàn hệ thống

**Files:**
- Create: `Dockerfile` (multi-stage, Next standalone output), `docker-compose.prod.yml` (app + db + volume), `scripts/smoke-mcp.ts`, `README.md`
- Test: `scripts/smoke-mcp.ts` (chạy tay hoặc chạy trong CI)

**Interfaces:**
- Consumes: toàn bộ

- [ ] **Step 1:** Viết `scripts/smoke-mcp.ts`. Script dùng `Client` của MCP SDK với `StreamableHTTPClientTransport`, đọc URL và token từ env, rồi chạy tuần tự:
  1. `create_task`
  2. `update_progress`
  3. `get_pending_feedback`
  4. `list_my_tasks`

  In "SMOKE OK" nếu mọi bước không có `isError`.
- [ ] **Step 2:** Viết `Dockerfile` và `docker-compose.prod.yml`. Container app chạy migrate khi khởi động rồi mới start. Biến môi trường gồm `DATABASE_URL`, `SESSION_SECRET`, `APP_URL`, ghi vào `.env.example`.
- [ ] **Step 3: Kiểm tra**
  - `docker compose -f docker-compose.prod.yml up -d --build`
  - `pnpm tsx scripts/seed-admin.ts …` (chạy trong container)
  - Tạo user và token qua web
  - `AGENTSYNC_URL=http://localhost:3000 AGENTSYNC_TOKEN=… pnpm tsx scripts/smoke-mcp.ts`

  Kỳ vọng: `SMOKE OK`.
- [ ] **Step 4:** Chạy toàn bộ `pnpm vitest run && pnpm playwright test`. Kỳ vọng: PASS hết.
- [ ] **Step 5:** README gồm: kiến trúc 5 dòng, cách chạy dev, cách triển khai, cách tạo admin đầu tiên, link tới `docs/install-agent.md`.
- [ ] **Step 6:** Commit `chore: docker deployment, smoke test, README`
