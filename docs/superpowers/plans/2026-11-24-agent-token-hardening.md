# Agent Token Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Token agent có phạm vi (`member` hoặc `manager`) và có hạn dùng. Trang Cài đặt cảnh báo khi chạy HTTP không mã hóa. Mỗi checkpoint ghi lại nguồn xác nhận (qua agent hay trên web).

**Architecture:**
- **Xác thực:** `authenticateAgentToken` trả về cả user lẫn thông tin token (phạm vi, hạn dùng).
- **MCP:** `registerTools` nhận phạm vi token. Tool quản lý chặn token `member` ngay ở tầng MCP. `task_detail` lọc theo chủ việc khi token là `member`.
- **Nguồn xác nhận:** `postUpdate` và `reviewCheckpoint` nhận thêm tham số `via`.

**Tech Stack:** Next 16, Drizzle/Postgres, Vitest, Playwright, next-intl.

**Spec:** `docs/superpowers/specs/2026-11-24-agent-token-hardening-design.md`

## Global Constraints

- **Phạm vi token:**
  - Cột `agent_tokens.scope`: `member` hoặc `manager`, CHECK, mặc định `member`.
  - Token mới chỉ được chọn `manager` khi người tạo đang có ít nhất 1 cấp dưới trực tiếp đang hoạt động. Ngược lại báo `VALIDATION` key `tokenScopeNotAllowed`, `field: 'scope'`.
  - Phạm vi không đổi được sau khi tạo.
- **Hạn dùng token:**
  - Cột `agent_tokens.expiresAt`, NOT NULL.
  - Khi tạo được chọn 30, 90 hoặc 180 ngày, mặc định 90. Giá trị khác báo `VALIDATION` key `invalidTokenLifetime`, `field: 'days'`.
  - Token hết hạn khi `expiresAt <= now`. Khi đó `/api/mcp` và `/api/agent/tasks/{id}/plan` trả 401, giống hệt token đã thu hồi.
- **Migration cho token đã có:** thêm cột `legacy`, mặc định false. Token cũ nhận `scope='manager'`, `legacy=true`, `expiresAt = now() + interval '90 days'`.
- **Tool MCP bắt buộc token `manager`:** `team_overview`, `needs_attention`, `weekly_digest`, `confirm_task`, `request_changes`, `answer_blocker`, `ask_question`, `review_solution`, `review_checkpoint`, `set_checkpoint_confirmer`.
  - Token `member` gọi các tool này nhận `isError` với message key `tokenScopeMember` (dịch theo locale) và không có gì bị thay đổi.
- **`task_detail` với token `member`:** chỉ trả việc do chính chủ token sở hữu. Việc của người khác trả NOT_FOUND, giống cách báo khi không có quyền xem.
- **`get_my_settings`** trả thêm `tokenScope`, `tokenExpiresAt` và `tokenLegacy`.
- **Cảnh báo HTTP:** hiện khi `APP_URL` bắt đầu bằng `http://` và hostname không thuộc `localhost`, `127.0.0.1`, `::1` hay `[::1]`. Viết thành hàm thuần `isInsecureAppUrl(url?: string): boolean`.
- **Nguồn xác nhận:** bước plan có thêm `confirmedVia?: 'agent' | 'web'`, ghi cùng lúc với `confirmedBy`.
  - MCP `update_progress` và `review_checkpoint` → `'agent'`.
  - Action web duyệt hoặc duyệt tất cả → `'web'`.
- **Nhắc hết hạn trong Slack digest:** phần "Việc của bạn" thêm `expiringTokens: { label: string; expiresAt: Date }[]`. Gồm các token chưa thu hồi, chưa hết hạn, và hết hạn trong vòng 7 ngày tính từ `now`. Mục này được tính là nội dung có giá trị khi xét tin rỗng.
- **Chuỗi hiển thị:** mọi chuỗi có cả en và vi, và test chặn chuỗi cứng phải pass.
- **Commit:** trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, làm trên nhánh `feat/agent-token-hardening`.

## Review Focus

1. **Lách phạm vi bằng tool hai chiều:** token `member` gọi `task_detail` với `taskId` việc của cấp dưới → NOT_FOUND. Test ở Task 1.
2. **Sửa form để tạo token `manager`:** người không có cấp dưới gửi `scope=manager` bằng cách tự sửa request → `tokenScopeNotAllowed`. Test ở Task 1 (gọi thẳng hàm server) và Task 2 (e2e: form không hiện lựa chọn).
3. **Biên hết hạn:** `expiresAt` đúng bằng `now` → 401, còn 1 giây → 200. Test ở Task 1.
4. **Token cũ sau migration:** vẫn gọi được `review_checkpoint`, có `legacy=true`, `expiresAt` cách thời điểm chạy migration khoảng 90 ngày. Test ở Task 1.
5. **Cảnh báo HTTP:**
   - `http://192.168.1.10:3000` → true
   - `http://localhost:3000` → false
   - `https://x` → false
   - không có `APP_URL` → false

   Test ở Task 2.

---

### Task 1: Dữ liệu token, xác thực, phân quyền MCP

**Files:** `src/db/schema.ts` (kèm migration), `src/server/auth/tokens.ts`, `app/api/mcp/route.ts`, `app/api/agent/tasks/[id]/plan/route.ts`, `src/mcp/tools.ts`, `src/mcp/format.ts`, `app/_actions/settings.ts` (truyền `scope` và `days` từ form), `src/server/account.ts` (`TokenInfo` thêm `scope`, `expiresAt`, `legacy`), `messages/*.json`.
Test: `tests/server/tokens.test.ts`, `tests/server/mcp-tools.test.ts`, `tests/server/mcp-route.test.ts`, `tests/server/agent-plan-route.test.ts`.

**Interfaces (Produces):**
- `type TokenScope = 'member' | 'manager'`, `const TOKEN_LIFETIMES = [30, 90, 180] as const`.
- `createAgentToken(db, userId, label, opts?: { scope?: TokenScope; days?: number }, now = new Date()) → { token, record }`. Kiểm tra quyền chọn `manager` và giá trị `days` theo Global Constraints.
- `authenticateAgentToken(db, bearer, now = new Date()) → { user: User; token: { id: string; scope: TokenScope; expiresAt: Date; legacy: boolean; label: string } }`.
  - **Đổi kiểu trả về:** phải cập nhật mọi chỗ gọi.
  - Token đã hết hạn ném `UNAUTHORIZED` key `badToken`.
- `ToolCtx` có thêm `tokenScope: TokenScope` và `token: { expiresAt: Date; legacy: boolean }`.
- `registerTools`: các tool trong danh sách bắt buộc `manager` được bọc một lớp kiểm tra phạm vi.

- [ ] **Step 1: Viết test thất bại**
  - **Tạo token:**
    - Mặc định là `member` / 90 ngày, và `expiresAt` bằng `now + 90 ngày`.
    - Chọn `days: 30` → `expiresAt` bằng `now + 30 ngày`.
    - `days: 365` → `invalidTokenLifetime`.
    - Người không có cấp dưới tạo `manager` → `tokenScopeNotAllowed`. Người có cấp dưới tạo `manager` → thành công.
  - **Xác thực:**
    - `expiresAt = now` → `badToken`. `now − 1s` (tức còn 1 giây trước hạn) → thành công.
    - Kết quả trả về có `token.scope`.
  - **Route `/api/mcp`:** token hết hạn → 401. Route plan: token hết hạn → 401.
  - **MCP:**
    - Token `member` gọi `review_checkpoint` → `isError`, message chứa đoạn dịch của `tokenScopeMember`, và bước vẫn ở `pending_approval`.
    - Token `member` gọi `needs_attention` → `isError`.
    - Token `manager` gọi `review_checkpoint` → thành công.
    - Token `member` gọi `task_detail` với việc của mình → OK, với việc của cấp dưới → NOT_FOUND.
    - `get_my_settings` có phạm vi và hạn dùng.
  - **Migration:** tạo token trước khi chạy migration (insert thẳng các cột cũ trong test schema), rồi kiểm tra token đó có `legacy`, `scope='manager'` và `expiresAt` cách khoảng 90 ngày. Nếu khó dựng trạng thái trước migration, test thay thế bằng câu SQL UPDATE dùng trong migration.
- [ ] **Step 2:** Chạy để thấy RED.
- [ ] **Step 3:** Cài đặt. Chạy `pnpm db:generate`, rồi sửa migration để backfill trước khi thêm ràng buộc NOT NULL.
- [ ] **Step 4:** Chạy để thấy GREEN, sau đó chạy toàn bộ vitest, typecheck và lint.
- [ ] **Step 5:** Commit `feat(tokens): scoped, expiring agent tokens`.

### Task 2: Giao diện token, cảnh báo HTTP, nhắc hết hạn, tài liệu

**Files:** `app/settings/page.tsx`, `app/_components/token-form.tsx`, `src/server/auth/insecure-url.ts` (mới, chứa `isInsecureAppUrl`), `src/server/digest/collect.ts` và `build.ts` (`expiringTokens`), `messages/*.json`, `README.md`, `README.vi.md`, `docs/install-agent.md`, `docs/install-agent.vi.md`.
Test: `tests/server/insecure-url.test.ts`, `tests/server/digest-content.test.ts` (bổ sung), `tests/e2e/agent-tokens.spec.ts` (mới).

**Interfaces:**
- Consumes: `TOKEN_LIFETIMES`, `TokenScope`, `TokenInfo` mới (Task 1).
- Produces: `isInsecureAppUrl(url?: string): boolean`. `DigestData.mine.expiringTokens`.
- **Form tạo token:**
  - Chọn hạn dùng 30/90/180 ngày, mặc định 90.
  - Chọn phạm vi `member`/`manager`, **chỉ hiện khi người dùng có cấp dưới**, mặc định `member`.
  - Mỗi lựa chọn có mô tả ngắn.
- **Danh sách token:**
  - Badge phạm vi.
  - Badge "token cũ, toàn quyền" khi `legacy`.
  - "Hết hạn sau N ngày", chuyển tone cảnh báo khi còn 7 ngày hoặc ít hơn.
  - "Đã hết hạn" khi quá hạn.
- **Cảnh báo HTTP:** hiện trong thẻ Token khi `isInsecureAppUrl(process.env.APP_URL)`.
- **Tài liệu:**
  - Mục "HTTPS" trong README (en và vi), có ví dụ Caddy khoảng 5 dòng.
  - `install-agent*.md`:
    - ghi chú `chmod 600` cho file chứa token;
    - giải thích phạm vi token;
    - nói rõ token có hạn 30/90/180 ngày, hết hạn thì tạo token mới.

- [ ] **Test:**
  - `insecure-url`: 4 trường hợp trong Review Focus 5, thêm `http://[::1]:3000` → false.
  - **Digest:**
    - Token hết hạn sau 3 ngày → có trong `expiringTokens`, và `isDigestEmpty` trả false.
    - Token hết hạn sau 10 ngày, token đã thu hồi, token đã hết hạn → đều không có.
    - `buildDigest` hiện nhãn token, có escape.
  - **E2E:**
    - Member không có cấp dưới: không thấy ô chọn phạm vi. Tạo token với 30 ngày → danh sách hiện badge `member` và "hết hạn sau 30 ngày".
    - Quản lý: thấy ô chọn phạm vi, tạo token `manager` → badge `manager`.
    - Không cuộn ngang ở 375px, cả vi và en.
- [ ] Chạy toàn bộ vitest, playwright, typecheck, lint và build. Commit `feat(tokens): token UI, HTTP warning, expiry reminders, docs`.

### Task 3: Ghi nguồn xác nhận checkpoint

**Files:** `src/server/tasks/activity.ts` (`postUpdate`), `src/server/tasks/confirm.ts` (`reviewCheckpoint`), `src/mcp/tools.ts`, `app/_actions/task.ts`, `app/_components/PlanSummary.tsx`, `src/db/schema.ts` (kiểu `PlanStep`), `messages/*.json`.
Test: `tests/server/confirm.test.ts`, `tests/e2e/checkpoint-confirmation.spec.ts` (bổ sung assertion).

**Interfaces:**
- `postUpdate(…, input & { via?: 'agent' | 'web' })`: mặc định là `'agent'`, vì hiện chỉ MCP gọi hàm này với `memberConfirmed`.
- `reviewCheckpoint(db, actor, taskId, stepTitle, decision, note?, now?, via: 'agent' | 'web' = 'web')`: MCP truyền `'agent'`, action web truyền `'web'`.
- Kiểu `PlanStep` có thêm `confirmedVia?: 'agent' | 'web'`.
- Khi `confirmedVia` có giá trị, `PlanSummary` hiện "(qua agent)" hoặc "(trên web)" sau dòng ai đã xác nhận.

- [ ] **Test:**
  - Member xác nhận qua `postUpdate` → `confirmedVia = 'agent'`.
  - Quản lý duyệt với `via = 'web'` → `'web'`.
  - Quản lý duyệt qua MCP `review_checkpoint` → `'agent'`.
  - Duyệt tất cả qua web → mọi bước được duyệt đều có `'web'`.
  - Bước cũ không có `confirmedVia` vẫn hiển thị như trước.
  - E2E: sau khi quản lý bấm Đạt, dòng xác nhận có "(trên web)" hoặc "(via web)".
- [ ] Chạy toàn bộ vitest, playwright, typecheck và lint. Commit `feat(confirm): record confirmation source`.
