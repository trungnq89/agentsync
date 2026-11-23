# Checkpoint Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mỗi checkpoint (bước plan) phải được xác nhận trước khi tính là xong. Người xác nhận là member (mặc định) hoặc quản lý trực tiếp, cấu hình theo từng member bởi quản lý trực tiếp.

**Architecture:**
- Server nắm trạng thái bước: `todo`, `doing`, `pending_approval`, `done`.
- `postUpdate` kiểm tra xác nhận của member, hoặc chuyển bước sang `pending_approval` khi người xác nhận là quản lý. Quản lý duyệt qua `reviewCheckpoint`.
- Truy vấn, hook, MCP, skill và web đều đọc cùng một nguồn trạng thái.

**Tech Stack:** Next 16, Drizzle/Postgres, Vitest, Playwright, next-intl.

**Spec:** `docs/superpowers/specs/2026-11-23-checkpoint-confirmation-design.md` (đọc cả §10b)

## Global Constraints

- **`users.checkpointConfirmer`:** `member` hoặc `manager`, mặc định `member`. Chỉ **quản lý trực tiếp hiện tại** đổi được, admin không có quyền này. Thiết lập giữ nguyên khi đổi quản lý.
- **Người xác nhận hiệu lực của một việc** là `checkpointConfirmer` của chủ việc, trừ khi việc riêng tư hoặc chủ việc không có quản lý, khi đó luôn là `member`.
- **Trạng thái bước:**
  - Gồm `todo | doing | pending_approval | done`.
  - Bước có thêm `confirmedBy?: 'member'|'manager'`, `confirmedById?`, `confirmedAt?` (ISO).
  - Chỉ luồng xác nhận mới đặt được `done`. `changePlan` bỏ qua `done`/`pending_approval` gửi vào: bước giữ nguyên tên thì giữ trạng thái đã lưu, bước mới hoặc đổi tên bắt đầu từ `todo`. Agent chỉ đặt được `todo`/`doing`.
- **`postUpdate` với `stepsCompleted`:**
  - Hiệu lực `member`: bắt buộc `memberConfirmed: true`, nếu thiếu thì ném `VALIDATION` key `checkpointConfirmationRequired` và không ghi gì. Có xác nhận thì bước thành `done` với `confirmedBy='member'`.
  - Hiệu lực `manager`: bước thành `pending_approval`.
  - Bước đã `done` giữ nguyên.
- **`reviewCheckpoint(db, actor, taskId, stepTitle | null, decision, note?)`:**
  - Chỉ quản lý trực tiếp hiện tại được gọi.
  - `stepTitle = null` nghĩa là duyệt mọi bước đang chờ của việc đó, và chỉ dùng được với `approved`.
  - `rejected` bắt buộc có `note` (`VALIDATION`, `field: 'note'`). Bước quay về `doing`, ghi vào `checkpoint_reviews`.
  - `approved` đưa bước thành `done` với `confirmedBy='manager'`.
- **Tiến độ % = số bước `done` / tổng số bước.** `progressOverride` bị bỏ qua.
- **`setTaskStatus complete`** chỉ được khi mọi bước đã `done`, nếu không thì ném `VALIDATION` key `stepsNotConfirmed`.
- **`getPendingFeedback().rejectedCheckpoints`** gồm các lần "Chưa đạt" chưa được xử lý. Một lần trở thành đã xử lý (`consumedAt`) khi bước đó được báo lại.
- **Phân quyền, locking và i18n giữ nguyên:**
  - Người không được xem nhận NOT_FOUND. Việc riêng tư chỉ chủ việc thấy.
  - Mọi thao tác ghi chạy trong transaction có `forUpdate`.
  - Mọi chuỗi có cả `en` và `vi`.
- **Commit:** trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Làm trên nhánh `feat/checkpoint-confirmation`.

## Review Focus

1. **Agent lách xác nhận** bằng cách gửi `changePlan` hoặc `revise_plan` với `status: 'done'`. Trạng thái không được đổi. Test ở Task 1.
2. **Đổi người xác nhận khi đang có bước chờ duyệt**, và **đổi quản lý**: quản lý mới duyệt được, quản lý cũ nhận NOT_FOUND. Test ở Task 2.
3. **Việc riêng tư hoặc chủ việc không có quản lý**, dù chủ việc được cấu hình `manager`: hiệu lực vẫn là `member`, không treo ở trạng thái chờ duyệt. Test ở Task 2.
4. **Tiến độ khớp ở mọi nơi:** trang chủ, timeline, chi tiết việc, MCP và API plan của hook cùng một con số khi có bước chờ duyệt. Test ở Task 3.
5. **Hook không nhắc lặp lại** với bước đang chờ duyệt, nhưng nhắc lại khi bước bị Chưa đạt rồi agent in dấu lần nữa. Test ở Task 3.

---

### Task 1: Dữ liệu, thiết lập người xác nhận, quyền sở hữu trạng thái bước, tiến độ

**Files:** `src/db/schema.ts` (kèm migration), `src/server/tasks/confirm.ts` (mới), `src/server/tasks/service.ts` (changePlan), `src/server/tasks/health.ts` (progressPct), `messages/*.json`.
Test: `tests/server/confirm.test.ts`, cập nhật `task-service.test.ts` và `health.test.ts`.

**Interfaces (Produces):**
- Schema:
  - `users.checkpointConfirmer`: text, CHECK nằm trong `member`/`manager`, mặc định `member`.
  - Bảng `checkpoint_reviews`: `id`, `taskId`, `stepTitle`, `decision` (CHECK `approved`/`rejected`), `note`, `reviewerId`, `createdAt`, `consumedAt`.
  - Kiểu `PlanStep.status` mở rộng thêm `pending_approval`, cùng các trường confirm tùy chọn.
- `effectiveConfirmer(task: Pick<Task,'isPrivate'>, owner: Pick<User,'managerId'|'checkpointConfirmer'>): 'member'|'manager'`
- `setCheckpointConfirmer(db, actor, userId, confirmer)`:
  - chỉ quản lý trực tiếp hiện tại được gọi;
  - không tìm thấy người dùng, hoặc không phải quản lý trực tiếp → NOT_FOUND;
  - giá trị sai → VALIDATION `invalidConfirmer`.
- `changePlan`: trạng thái bước gửi vào được chuẩn hóa theo Global Constraints.
- `progressPct(plan, _override)` bỏ qua `_override`. Có thể đổi chữ ký, nhưng phải cập nhật mọi chỗ gọi.

- [ ] **Step 1:** Controller tạo nhánh `feat/checkpoint-confirmation`.
- [ ] **Step 2: Viết test thất bại.**
  - `effectiveConfirmer`: chủ việc cấu hình manager → `manager`; việc riêng tư → `member`; chủ việc không có quản lý → `member`.
  - `setCheckpointConfirmer`: quản lý trực tiếp đổi được; admin không phải quản lý → NOT_FOUND; quản lý của quản lý → NOT_FOUND; giá trị sai → VALIDATION.
  - `changePlan` với `{title:'A',status:'done'}` khi A đang `todo` → A vẫn `todo`; A đang `done` được gửi lại `doing` → A vẫn `done`; đổi tên bước đã `done` → bước mới là `todo`.
  - `progress` bỏ qua override; bước `pending_approval` không được đếm.
  - Migration giữ nguyên dữ liệu cũ (người dùng có sẵn nhận mặc định `member`).
- [ ] **Step 3:** Chạy test, xác nhận FAIL. **Step 4:** Cài đặt, rồi chạy lại để thấy PASS, sau đó chạy toàn bộ vitest, typecheck và lint.
- [ ] **Step 5:** Commit `feat(confirm): confirmer setting, server-owned step status, progress`.

### Task 2: Báo bước, duyệt, phản hồi, quy tắc xong việc

**Files:** `src/server/tasks/activity.ts` (postUpdate, getPendingFeedback), `src/server/tasks/confirm.ts` (reviewCheckpoint), `src/server/tasks/service.ts` (setTaskStatus complete), `messages/*.json`.
Test: `tests/server/confirm.test.ts`, `tests/server/activity.test.ts`.

**Interfaces:**
- `postUpdate(…, input & { memberConfirmed?: boolean })` theo Global Constraints. Báo lại một bước đã bị "Chưa đạt" thì đặt `consumedAt` cho các review rejected của bước đó.
- `reviewCheckpoint(db, actor, taskId, stepTitle: string|null, decision: 'approved'|'rejected', note?, now?) → { approved: number; rejected: number }`
- `getPendingFeedback` có thêm `rejectedCheckpoints: { taskId, title, stepTitle, note, at }[]`.
- `setTaskStatus('complete')` ném `stepsNotConfirmed` khi còn bước chưa `done`.

- [ ] **Step 1: Viết test thất bại.**
  - Hiệu lực `member`: thiếu `memberConfirmed` → VALIDATION, bước không đổi; có `memberConfirmed` → bước `done`, `confirmedBy='member'`.
  - Hiệu lực `manager`: bước → `pending_approval`, rồi quản lý duyệt đạt → `done`, `confirmedBy='manager'`.
  - `rejected` không có note → VALIDATION `field: 'note'`; `rejected` có note → bước về `doing` và xuất hiện trong `rejectedCheckpoints`; báo lại bước đó → biến mất khỏi danh sách.
  - Duyệt tất cả (`stepTitle = null`) → mọi bước chờ thành `done`; `stepTitle = null` đi cùng `rejected` → VALIDATION.
  - Chủ việc tự duyệt bước của mình → FORBIDDEN hoặc NOT_FOUND, theo đúng mẫu hiện có.
  - Đổi quản lý: quản lý cũ → NOT_FOUND, quản lý mới duyệt được.
  - Đổi người xác nhận từ manager sang member khi đang có bước chờ: bước vẫn `pending_approval`, quản lý vẫn duyệt được; member báo lại kèm `memberConfirmed` → `done`.
  - Việc riêng tư với chủ việc cấu hình `manager` → hoạt động như `member`.
  - Đánh dấu xong khi còn bước `pending_approval` → `stepsNotConfirmed`; mọi bước `done` → thành công.
- [ ] **Step 2–4:** Chạy để thấy RED, cài đặt, chạy để thấy GREEN, rồi chạy toàn bộ vitest, typecheck và lint.
- [ ] **Step 5:** Commit `feat(confirm): member confirmation, manager review, completion rule`.

### Task 3: Truy vấn, API plan, hook

**Files:** `src/server/tasks/queries.ts`, `src/i18n/attention.ts`, `plugins/agentsync/hooks/agentsync-hook.mjs`, các test liên quan.

**Interfaces:**
- `AttentionItem.kind` có thêm `checkpoint_pending`: mỗi việc có bước chờ duyệt cho một mục, kèm `detailParams.count`. Thứ tự hiển thị nằm ngay sau `awaiting_review`.
- `PersonCard` có thêm `pendingApprovals: number`. Việc riêng tư không được đếm khi người xem không phải chủ việc.
- `taskDetail` trả thêm:
  - `effectiveConfirmer`;
  - `canReviewCheckpoint` (người xem là quản lý hiện tại và có ít nhất một bước `pending_approval`);
  - `canSetConfirmer` không nằm ở đây mà ở dữ liệu `personTimeline`;
  - các bước kèm thông tin confirm.
- `personTimeline` trả thêm `checkpointConfirmer` và `canSetConfirmer`.
- `listMyTasks` và `getOwnTaskPlan` trả thêm `effectiveConfirmer` và giữ trạng thái `pending_approval`.
- Hook (`decide`):
  - `pending_approval` tính là đã báo: không nằm trong pending, không tính là done khi xét hoàn thành.
  - Nhắc hoàn thành chỉ khi mọi bước `done`.
  - Bước bị rejected quay về `doing`: nếu agent in lại dấu, hook nhắc như bước mới. Giải pháp: bỏ bước đó khỏi danh sách `reminded` khi server trả về trạng thái không phải `done`/`pending_approval` và agent lại claim.
- [ ] Test:
  - Tiến độ khớp nhau giữa `teamOverview`, `personTimeline`, `taskDetail`, `listMyTasks` và API plan khi có bước chờ duyệt.
  - `needsAttention` có mục `checkpoint_pending` cho quản lý, không có cho người khác, không có với việc riêng tư.
  - Logic hook: bước pending → không nhắc; tất cả pending → không nhắc hoàn thành; bước bị rejected rồi agent in lại dấu → nhắc lại.
- [ ] Commit `feat(confirm): queries, plan API, hook awareness`.

### Task 4: MCP và skill

**Files:** `src/mcp/tools.ts`, `src/mcp/format.ts`, `plugins/agentsync/skills/agentsync-session/SKILL.md`, `plugins/agentsync/skills/agentsync-plan/SKILL.md`, `plugins/agentsync/skills/agentsync-manager/SKILL.md`, các test (`mcp-tools`, `plugin-files`), tài liệu `docs/install-agent*.md`.

**Interfaces:**
- `update_progress` có thêm `memberConfirmed?: boolean`.
- `planStep` schema chỉ nhận `todo` | `doing`.
- `get_my_settings` trả thêm `checkpointConfirmer`.
- `list_my_tasks` và `task_detail` có thêm `effectiveConfirmer`.
- `get_pending_feedback` có thêm `rejectedCheckpoints`.
- Tool mới `review_checkpoint({ taskId, stepTitle?, decision, note? })`.
- Tool mới `set_checkpoint_confirmer({ userId, confirmer })`.
- `needs_attention` hiển thị loại `checkpoint_pending`.
- Mô tả tool viết tiếng Anh. Nội dung trả về dịch theo ngôn ngữ của người dùng.
- Skill theo spec §7, dấu checkpoint chỉ in **sau khi** xác nhận ở chế độ member:
  - session: các bước trong §7;
  - plan: ghi chú rằng trạng thái bước do server quản lý;
  - manager: cách duyệt từng bước và duyệt tất cả.
- [ ] Test:
  - Gọi qua MCP từ đầu đến cuối với cả hai chế độ.
  - `review_checkpoint` khi không phải quản lý → isError.
  - `planStep` có `done` → bị zod từ chối.
  - Test `plugin-files` vẫn pass, các tool mới được nhắc tới trong skill.
- [ ] Commit `feat(confirm): MCP tools and skills`.

### Task 5: Giao diện web

**Files:** `app/people/[id]/page.tsx` (thẻ thiết lập người xác nhận), `app/tasks/[id]/page.tsx` cùng `PlanSummary.tsx` (badge, nút Đạt/Chưa đạt, Duyệt tất cả, thông tin ai xác nhận, tự mở plan khi có bước chờ), `AttentionList.tsx`, `PersonCard.tsx`, `app/_actions/*`, `messages/*.json`.
Test: `tests/e2e/checkpoint-confirmation.spec.ts`.

- [ ] E2E:
  - Quản lý đặt Minh là "Tôi duyệt".
  - Seed một bước pending: quản lý thấy mục chú ý "1 bước chờ duyệt" và badge trên PersonCard.
  - Mở chi tiết việc: Đạt → bước có "✓ Quản lý duyệt".
  - Seed bước pending thứ hai: Chưa đạt mà không có ghi chú → lỗi hiện dưới ô; có ghi chú → bước về đang làm.
  - Duyệt tất cả qua hộp xác nhận.
  - Member thường xem trang một người khác thì không thấy thẻ thiết lập.
  - Không cuộn ngang ở 375px, cả `vi` lẫn `en`.
- [ ] Chạy toàn bộ playwright, vitest, typecheck và lint. Commit `feat(confirm): web UI`.
