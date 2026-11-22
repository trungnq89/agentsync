# Odoo HR Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đồng bộ nhân viên và quan hệ quản lý từ Odoo HR vào AgentSync, với 3 chế độ (đồng bộ mới / chỉ thay đổi mới tự động / có duyệt), ánh xạ chức danh bật tắt được, tài khoản mới đăng nhập bằng email + mật khẩu tạm.

**Architecture:**
- `src/server/odoo/*` tách thành bốn phần: client JSON-RPC, hàm thuần tính thay đổi (diff), lưu cấu hình đã mã hóa, và áp dụng đồng bộ kèm nhật ký.
- Web (tab Quản trị → Odoo) và bộ hẹn giờ trong `instrumentation.ts` đều gọi vào các hàm này.
- Dữ liệu Odoo chỉ được đọc, không ghi ngược.

**Tech Stack:** Next 16, Drizzle/Postgres, Node `crypto` (AES-256-GCM), `fetch`, Vitest, Playwright, `node:http` (Odoo giả lập).

**Spec:** `docs/superpowers/specs/2026-11-22-odoo-hr-sync-design.md`

## Global Constraints

- **Odoo JSON-RPC** dùng `POST {url}/jsonrpc`. Đăng nhập bằng `common.authenticate(db, login, apiKey, {})`. Lấy nhân viên bằng `object.execute_kw(db, uid, apiKey, 'hr.employee', 'search_read', [[]], { fields: ['id','name','work_email','parent_id','job_title','job_id','active'], context: { active_test: false } })`. Mỗi lần gọi có timeout 20 giây.
- **API key** mã hóa AES-256-GCM bằng `SETTINGS_ENCRYPTION_KEY` (32 byte, base64). Thiếu khóa thì tính năng Odoo bị tắt kèm lỗi `odooKeyMissing`. Key không bao giờ trả về UI hay ghi vào log.
- **Ghép tài khoản:** ưu tiên `users.odooEmployeeId`, nếu chưa có thì ghép theo email đã chuẩn hóa `trim().toLowerCase()`.
- **Các loại thay đổi:** `create`, `updateManager`, `updateName`, `updateLevel`, `disable`. Trường hợp không xử lý được thì ghi `skip` kèm lý do (`noEmail`, `duplicateEmail`, `managerCycle`, `managerNoAccount`).
- **Luật an toàn:**
  - Tài khoản admin không bao giờ bị `disable` và không bao giờ bị gỡ quyền admin.
  - Tài khoản `source='local'` không khớp với Odoo thì không bị đụng tới.
  - Quan hệ quản lý tạo vòng lặp thì bỏ qua với lý do `managerCycle`.
  - Mọi thay đổi được kiểm tra lại ngay lúc áp dụng.
- **Ba chế độ:**
  - `full`: xem trước, rồi áp dụng tất cả.
  - `incremental`: chỉ `create`, chạy theo lịch 1, 6 hoặc 24 giờ (hoặc tắt), và có nút chạy ngay.
  - `review`: xem trước, admin tick chọn thay đổi rồi áp dụng.
  - Chế độ mặc định là `review`.
- **Ánh xạ chức danh:**
  - Mỗi dòng ánh xạ có dạng `{ pattern, level }`. So khớp kiểu "chứa", không phân biệt hoa thường. Lấy dòng đầu tiên khớp, không khớp dòng nào thì là `member`.
  - Nguồn chức danh: `job_title`, nếu trống thì lấy tên `job_id`.
  - **Tắt ánh xạ:** người mới là `member`. Người đang có giữ nguyên cấp.
- **Tài khoản mới tạo từ Odoo:**
  - `username = email`, `source='odoo'`, `mustChangePassword=true`.
  - Mật khẩu tạm dài 16 ký tự. Bảng ký tự không có các ký tự dễ nhầm `0 O o 1 l I`.
- **Mật khẩu tạm:**
  - Hiện đúng một lần sau khi admin áp dụng, kèm nút tải CSV.
  - Với đồng bộ tự động, lưu đã mã hóa trong `pending_credentials`. Mật khẩu bị xóa ngay sau khi admin xem.
  - Không bao giờ ghi vào log.
- **Đăng nhập** bằng email hoặc username. Thông báo lỗi giữ nguyên một câu chung cho mọi trường hợp như hiện nay.
- **Người có `mustChangePassword`:**
  - Trên web: mọi trang chuyển về `/settings`, kèm thông báo bắt buộc đổi mật khẩu. Riêng đăng xuất vẫn dùng được.
  - Trên MCP: trả 401.
  - Đổi mật khẩu xong thì cờ được xóa.
- **Phân quyền:** chỉ admin được thao tác với Odoo. Phân quyền đặt trong `src/server`.
- **Khóa chống chạy trùng:** mỗi lần đồng bộ giữ `pg_try_advisory_xact_lock(hashtext('agentsync_odoo_sync'))`. Không lấy được khóa thì báo lỗi `odooSyncBusy`.
- **i18n:** đầy đủ cả `en` lẫn `vi`. Test chặn chuỗi cứng vẫn phải pass. Màu chỉ dùng token.
- **Commit:** trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Làm trên nhánh `feat/odoo-sync`.

## Review Focus

1. **Odoo trả dữ liệu bẩn:** email trùng giữa hai nhân viên, `parent_id` trỏ tới nhân viên không tồn tại hoặc đã nghỉ, quản lý tạo vòng lặp A→B→A. Không được crash, và từng trường hợp phải hiện thành `skip` có lý do. Test ở Task 3.
2. **Admin hiện tại không có trong Odoo** và chạy chế độ `full`: admin vẫn hoạt động và giữ nguyên quyền admin. Test ở Task 3 và Task 4.
3. **Dữ liệu đổi giữa lúc xem trước và lúc áp dụng**, ví dụ có người được tạo tay trùng email: phải kiểm tra lại, bỏ qua thay đổi không còn hợp lệ, không được báo lỗi 500. Test ở Task 4.
4. **Odoo sai mật khẩu, sai URL hoặc chậm:** hiện lỗi đã dịch, không lộ API key, nhật ký lần chạy ghi trạng thái `failed`. Test ở Task 2 và Task 4.
5. **Người dùng mới đăng nhập bằng email viết hoa** hoặc có khoảng trắng thừa: vẫn đăng nhập được. Test ở Task 5.

---

## Cấu trúc file

```
src/server/secret.ts                 encryptSecret/decryptSecret (AES-256-GCM)
src/server/odoo/settings.ts          getOdooSettingsView, saveOdooSettings, loadOdooConnection
src/server/odoo/client.ts            createOdooClient → listEmployees, testConnection
src/server/odoo/diff.ts              mapTitle, computeOdooDiff (thuần)
src/server/odoo/sync.ts              previewSync, applySync, runScheduledSyncIfDue, credentials
instrumentation.ts                   register(): bộ hẹn giờ cho lịch tự động
app/admin/odoo/page.tsx (+ _components)  tab Odoo
tests/helpers/fake-odoo.ts           server JSON-RPC giả lập
```

---

### Task 1: Schema, mã hóa bí mật, cấu hình Odoo

**Files:**
- Modify: `src/db/schema.ts` (sinh migration)
- Create: `src/server/secret.ts`, `src/server/odoo/settings.ts`
- Test: `tests/server/secret.test.ts`, `tests/server/odoo-settings.test.ts`

**Interfaces:**
- Produces:
  - Schema: thêm vào `users` các cột `email` (text, unique theo `lower(email)`, nullable), `odooEmployeeId` (integer, unique, nullable), `mustChangePassword` (bool, mặc định false), `source` (text, CHECK in local/odoo, mặc định 'local').
  - Bảng `odoo_settings`, chỉ có một dòng id=1 có CHECK: `url`, `database`, `login`, `apiKeyEnc` (đều nullable), `mode` (full/incremental/review, mặc định 'review'), `scheduleHours` (int, CHECK in 0/1/6/24, mặc định 0), `titleMappingEnabled` (bool, mặc định false), `titleMappings` (jsonb, mặc định '[]').
  - Bảng `odoo_sync_runs`: id, mode, trigger (manual/schedule), actorId (nullable), startedAt, finishedAt (nullable), status (previewed/applied/failed), counts (jsonb), preview (jsonb, nullable), errorKey (nullable).
  - Bảng `pending_credentials`: id, userId, runId, secretEnc, createdAt.
  - `encryptSecret(plain: string): string` và `decryptSecret(enc: string): string`. Dạng lưu là `v1:<iv b64>:<tag b64>:<ct b64>`. Ném `DomainError('VALIDATION','odooKeyMissing')` khi thiếu hoặc sai khóa.
  - `getOdooSettingsView(db, actor): Promise<{ url, database, login, hasApiKey: boolean, mode, scheduleHours, titleMappingEnabled, titleMappings, encryptionReady: boolean }>`
  - `saveOdooSettings(db, actor, input: { url?, database?, login?, apiKey?, mode?, scheduleHours?, titleMappingEnabled?, titleMappings? })`. Input `apiKey` rỗng hoặc undefined thì giữ key cũ. URL phải là http(s). `titleMappings` tối đa 50 dòng, mỗi dòng có pattern không rỗng và level hợp lệ. Sai thì ném VALIDATION kèm `params.field`.
  - `loadOdooConnection(db): Promise<{ url, database, login, apiKey } | null>`: chỉ dùng nội bộ, đã giải mã.
  - Hàm cho admin dùng `requireAdmin` sẵn có (người không phải admin nhận FORBIDDEN). Resetdb seed `odoo_settings` id=1, theo mẫu `app_settings`.

- [ ] **Step 1:** `git checkout -b feat/odoo-sync` (nhánh do controller tạo sẵn).
- [ ] **Step 2: Viết test thất bại.**
  - `secret round-trip`
  - `tampered ciphertext → VALIDATION odooKeyMissing`
  - `missing env → odooKeyMissing`
  - `view never contains apiKey, hasApiKey true after save`
  - `empty apiKey keeps previous`
  - `non-admin FORBIDDEN`
  - `invalid url VALIDATION field url`
  - `51 mappings → VALIDATION field titleMappings`
  - `users.email unique case-insensitive`
- [ ] **Step 3:** Chạy `pnpm vitest run tests/server/secret.test.ts tests/server/odoo-settings.test.ts`. Kỳ vọng: FAIL.
- [ ] **Step 4:** Cài đặt. Thêm `SETTINGS_ENCRYPTION_KEY` vào `.env`/`.env.test`, dùng một khóa test, và vào `.env.example` kèm hướng dẫn sinh khóa bằng `openssl rand -base64 32`.
- [ ] **Step 5:** Chạy lại để thấy PASS, sau đó chạy toàn bộ vitest, typecheck và lint.
- [ ] **Step 6:** Commit `feat(odoo): schema, encrypted settings`.

---

### Task 2: Client JSON-RPC của Odoo và server giả lập

**Files:**
- Create: `src/server/odoo/client.ts`, `tests/helpers/fake-odoo.ts`
- Test: `tests/server/odoo-client.test.ts`

**Interfaces:**
- Produces:
  - `type OdooEmployee = { id: number; name: string; email: string | null; managerId: number | null; jobTitle: string | null; active: boolean }`. Map từ `work_email`, `parent_id[0]`, `job_title`, hoặc `job_id[1]` khi `job_title` rỗng. Giá trị `false` của Odoo đổi thành `null`.
  - `createOdooClient(conn, opts?: { fetchImpl?, timeoutMs? = 20000 }): { listEmployees(): Promise<OdooEmployee[]>; testConnection(): Promise<{ count: number }> }`
  - Mã lỗi:
    - sai đăng nhập (`uid` false) → `DomainError('VALIDATION','odooAuthFailed')`
    - lỗi mạng hoặc timeout → `odooUnreachable`
    - JSON-RPC trả `error` hoặc dữ liệu sai dạng → `odooBadResponse`
    - Message không bao giờ chứa key.
  - `startFakeOdoo({ db, login, apiKey, employees, delayMs? }): Promise<{ url, setEmployees(e), close() }>`: kiểm tra đúng `service`, `method` và `args` như Global Constraints.

- [ ] **Step 1: Viết test thất bại.**
  - `lists employees and maps fields (job_id fallback, false→null)`
  - `wrong key → odooAuthFailed`
  - `unreachable url → odooUnreachable`
  - `delay beyond timeout → odooUnreachable`
  - `rpc error → odooBadResponse`
  - `testConnection returns count`
  - `error message never contains the api key`
- [ ] **Step 2:** Chạy. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt. Các khóa lỗi phải có trong cả hai file dịch, namespace `errors`.
- [ ] **Step 4:** Chạy lại để thấy PASS, sau đó chạy toàn bộ vitest.
- [ ] **Step 5:** Commit `feat(odoo): json-rpc client and fake server`.

---

### Task 3: Tính thay đổi (hàm thuần)

**Files:**
- Create: `src/server/odoo/diff.ts`
- Test: `tests/server/odoo-diff.test.ts`

**Interfaces:**
- Produces:
  - `mapTitle(title: string | null, mappings: {pattern: string; level: UserLevel}[]): UserLevel`
  - `type ExistingUser = { id; username; email: string | null; displayName; level; managerId: string | null; isAdmin: boolean; disabled: boolean; source: 'local'|'odoo'; odooEmployeeId: number | null }`
  - `type Change`, có `key` ổn định, ví dụ `create:e12`, `manager:<userId>`:
    - `{ key; type: 'create'; employeeId; email; displayName; level; managerRef: { userId } | { employeeId } | null }`
    - `{ key; type: 'updateManager'; userId; from: string|null; to: { userId } | { employeeId } | null }`
    - `{ key; type: 'updateName'; userId; from; to }`
    - `{ key; type: 'updateLevel'; userId; from; to }`
    - `{ key; type: 'disable'; userId }`
    - `{ key; type: 'link'; userId; employeeId }`: gắn `odooEmployeeId` khi ghép được theo email
  - `type Skip = { employeeId?; userId?; reason: 'noEmail'|'duplicateEmail'|'managerCycle'|'managerNoAccount' }`
  - `computeOdooDiff(employees: OdooEmployee[], users: ExistingUser[], opts: { mode: 'full'|'incremental'|'review'; titleMappingEnabled: boolean; mappings }): { changes: Change[]; skipped: Skip[]; untouchedLocal: string[] }`
    - `incremental`: chỉ có `create` (kèm managerRef và level của người mới) và `link`.
    - `full` và `review`: có mọi loại thay đổi. `updateLevel` chỉ xuất hiện khi bật ánh xạ.
    - **Không bao giờ** sinh `disable` cho admin.
    - Vòng lặp xét trên cây quản lý *sau khi* áp dụng mọi thay đổi. Người nằm trong vòng lặp nhận skip `managerCycle`, và quản lý của họ không bị đổi.

- [ ] **Step 1: Viết test thất bại.** Tên test và kỳ vọng:
  - `mapTitle first match case-insensitive contains; no match → member; null → member`
  - `new active employee with email → create with mapped level when enabled, member when disabled`
  - `employee without email → skip noEmail`
  - `two employees same email → both skip duplicateEmail`
  - `existing user matched by email → link + updateName/updateManager when different (full)`
  - `incremental: existing user manager differs → no updateManager; new employee → create with managerRef`
  - `manager is an employee being created → managerRef {employeeId}`
  - `manager employee has no email → skip managerNoAccount, managerRef null`
  - `A→B→A cycle → skip managerCycle for both, no updateManager`
  - `inactive employee linked to user → disable (full/review), none in incremental`
  - `admin user whose employee is inactive → no disable`
  - `local user not in Odoo → untouchedLocal, no changes`
  - `titleMapping disabled → no updateLevel for existing`
  - `deterministic order and stable keys`
- [ ] **Step 2:** Chạy. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt.
- [ ] **Step 4:** Chạy lại để thấy PASS.
- [ ] **Step 5:** Commit `feat(odoo): pure diff computation`.

---

### Task 4: Xem trước, áp dụng, nhật ký, mật khẩu tạm

**Files:**
- Create: `src/server/odoo/sync.ts`
- Test: `tests/server/odoo-sync.test.ts`

**Interfaces:**
- Consumes: Task 1–3, `hashPassword` và `assertValidManager` trong `org.ts` (export nếu cần).
- Produces:
  - `previewSync(db, actor, mode?: Mode, deps?: { clientFactory? }): Promise<{ runId: string; changes: Change[]; skipped: Skip[]; untouchedLocal }>`. Chỉ admin. Lưu run trạng thái `previewed` kèm preview. Lỗi Odoo thì ghi run `failed` với errorKey rồi ném lại lỗi.
  - `applySync(db, actor, runId, selectedKeys?: string[], now?): Promise<{ applied: number; skipped: number; credentials: { email: string; password: string }[] }>`
    - Chỉ admin. Run phải đang ở trạng thái `previewed` và chưa quá 1 giờ, nếu không thì ném `odooPreviewExpired`.
    - Chế độ `full` áp dụng mọi thay đổi. Chế độ `review` chỉ áp dụng các key trong `selectedKeys`.
    - Toàn bộ chạy trong một transaction có advisory lock. Từng thay đổi được kiểm tra lại: email đã bị chiếm, vòng lặp, hay sắp đụng tới admin thì bỏ qua và đếm vào `skipped`.
    - Thứ tự áp dụng: tạo và gắn tài khoản trước, rồi tới quản lý, tên, cấp, cuối cùng là vô hiệu hóa.
    - Ghi run `applied` kèm counts.
  - `runIncrementalSync(db, trigger: 'manual'|'schedule', actor?, deps?)`: tính diff `incremental` và áp dụng ngay. Mật khẩu tạm của các tài khoản tạo ra được lưu mã hóa trong `pending_credentials`. Lần chạy ghi trigger tương ứng.
  - `listPendingCredentials(db, actor): Promise<{ id; email; password; createdAt }[]>` (giải mã) rồi **xóa luôn** các bản ghi đã trả về. `countPendingCredentials(db, actor)`.
  - `listSyncRuns(db, actor, limit=20)`.
  - Bỏ tài khoản bị vô hiệu hóa ra khỏi danh sách quản lý: dùng lại `updateUser`/`assertValidManager` của `org.ts`, hoặc viết logic tương đương. Admin không bao giờ bị vô hiệu hóa.

- [ ] **Step 1: Viết test thất bại**, dùng fake Odoo của Task 2 qua `deps.clientFactory`:
  - `preview stores run and returns changes`
  - `apply full creates users with source odoo, mustChangePassword, username=email, manager links incl. created-to-created; returns credentials once`
  - `credentials passwords 16 chars from safe alphabet and verify with argon2`
  - `review applies only selected keys`
  - `admin not in Odoo stays enabled and admin after full`
  - `email taken between preview and apply → that create skipped, others applied, no throw`
  - `expired preview (>1h) → odooPreviewExpired`
  - `odoo auth failure → run failed with errorKey odooAuthFailed`
  - `concurrent apply → second gets odooSyncBusy`
  - `incremental creates only new users and stores pending credentials; listPendingCredentials returns then deletes`
  - `non-admin FORBIDDEN on all`
- [ ] **Step 2:** Chạy. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt.
- [ ] **Step 4:** Chạy lại để thấy PASS, sau đó chạy toàn bộ vitest.
- [ ] **Step 5:** Commit `feat(odoo): preview/apply sync with run log and temp credentials`.

---

### Task 5: Đăng nhập bằng email, bắt đổi mật khẩu, bộ hẹn giờ

**Files:**
- Modify: `src/server/auth/session.ts` (login theo email hoặc username), `src/server/auth/tokens.ts` (chặn token khi `mustChangePassword`), `src/server/account.ts` (đổi mật khẩu thì xóa cờ), `app/_lib/actor.ts` và layout hoặc `proxy.ts` (chuyển hướng về `/settings?mustChange=1`), `src/server/org.ts` cùng form admin (trường email)
- Create: `instrumentation.ts`, thêm `runScheduledSyncIfDue(db, now)` vào `src/server/odoo/sync.ts`
- Test: `tests/server/auth.test.ts`, `tests/server/account.test.ts`, `tests/server/odoo-schedule.test.ts`, `tests/e2e/must-change-password.spec.ts`

**Interfaces:**
- Produces:
  - `login(db, identifier, pw)`: so khớp với `username` hoặc `lower(email)` sau khi trim và chuyển chữ thường.
  - `authenticateAgentToken`: người dùng có `mustChangePassword` thì ném UNAUTHORIZED.
  - `changeMyPassword`: đặt `mustChangePassword = false`.
  - `createUser`/`updateUser` nhận thêm `email`. Email sai định dạng hoặc trùng thì ném VALIDATION, `field: 'email'`.
  - `runScheduledSyncIfDue(db, now)`:
    - Chỉ chạy khi `mode='incremental'`, `scheduleHours > 0`, kết nối đã cấu hình, và lần chạy `schedule` gần nhất cách đây ít nhất `scheduleHours`.
    - Lỗi được nuốt (ghi run failed). Không bao giờ ném ra ngoài.
  - `instrumentation.ts` `register()`: chỉ chạy khi `NEXT_RUNTIME === 'nodejs'` và không ở môi trường test. Đặt `setInterval` 15 phút gọi hàm trên, timer có `unref`. Đọc `node_modules/next/dist/docs` về instrumentation trước khi viết.

- [ ] **Step 1: Viết test thất bại.**
  - `login with uppercase email and spaces`
  - `login with username still works`
  - `wrong password same error`
  - `token rejected while mustChangePassword; accepted after changeMyPassword`
  - `schedule: not due → no run; due → incremental run with trigger schedule; mode review → no run; odoo down → run failed, no throw`
  - E2E: người dùng có `mustChangePassword` đăng nhập thì bị đưa về trang settings có thông báo, và vào `/` vẫn bị chuyển hướng. Đổi mật khẩu xong thì vào `/` được.
- [ ] **Step 2:** Chạy. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt.
- [ ] **Step 4:** Chạy lại để thấy PASS, sau đó chạy toàn bộ vitest và playwright.
- [ ] **Step 5:** Commit `feat(auth): email login, forced password change, scheduled odoo sync`.

---

### Task 6: Giao diện Quản trị → Odoo, tài liệu

**Files:**
- Create: `app/admin/odoo/page.tsx` và các component con, `app/_actions/odoo.ts`
- Modify: điều hướng trong trang admin (tab Người dùng | Odoo), `messages/en.json`, `messages/vi.json`, `README.md`, `README.vi.md`, `docker-compose.prod.yml` (`SETTINGS_ENCRYPTION_KEY`)
- Test: `tests/e2e/odoo-admin.spec.ts`

**Interfaces:**
- Consumes: mọi hàm ở Task 1, 4 và 5.
- Yêu cầu (spec §10):
  - **Thẻ Kết nối:** URL, database, login, API key dạng password (để trống nghĩa là giữ key cũ, có hiện "đã lưu"). Nút "Kiểm tra kết nối" hiện số nhân viên hoặc lỗi đã dịch. Nếu `encryptionReady = false` thì hiện cảnh báo và khóa form.
  - **Thẻ Chế độ:** chọn chế độ và lịch chạy (Tắt/1/6/24 giờ). Lịch chỉ hiển thị khi chọn chế độ incremental.
  - **Thẻ Ánh xạ chức danh:** công tắc bật/tắt, các dòng gồm pattern và Select cấp, có thêm, xóa, kéo lên/xuống bằng nút.
  - **Thẻ Đồng bộ:**
    - "Xem trước" hiện bảng thay đổi nhóm theo loại, có Badge tone theo loại, ô tick khi ở chế độ review, mục bỏ qua có lý do, và danh sách tài khoản local không bị đụng tới.
    - "Áp dụng" đi qua `ConfirmAction`. Chế độ full hiện cảnh báo ghi đè.
    - Với incremental có nút "Chạy ngay".
  - **Mật khẩu tạm:** sau khi áp dụng, hiện danh sách email và mật khẩu đúng một lần, có nút sao chép và nút "Tải CSV" (CSV tạo ở client từ state, không gọi server). Có thẻ "Mật khẩu chờ xem (N)" mở ra để xem các mật khẩu từ đồng bộ tự động.
  - **Thẻ Lịch sử:** 20 lần chạy gần nhất gồm thời gian, chế độ, trigger, trạng thái, số lượng và lỗi đã dịch.
  - **Form người dùng:** thêm trường email.
  - Mọi chữ có cả `en` và `vi`. Test chặn chuỗi cứng phải pass. Không cuộn ngang ở 375px.
- E2E chạy với fake Odoo do test tự khởi động, nhập URL của nó qua giao diện. Playwright webServer cần env `SETTINGS_ENCRYPTION_KEY`.

- [ ] **Step 1: Viết e2e thất bại.**
  - Admin lưu cấu hình. API key không xuất hiện lại trong HTML.
  - Kiểm tra kết nối hiện "3".
  - Chế độ review: xem trước, bỏ tick một dòng `create`, áp dụng. Chỉ những người được tick được tạo. Mật khẩu hiện một lần, reload thì mất.
  - Đăng nhập bằng email của người mới với mật khẩu tạm thì bị bắt đổi mật khẩu.
  - Chế độ full với admin không có trong Odoo: admin vẫn đăng nhập được.
  - Không cuộn ngang ở 375px, cả vi lẫn en.
- [ ] **Step 2:** Chạy `pnpm playwright test tests/e2e/odoo-admin.spec.ts`. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt, kèm tài liệu song ngữ: mục "Odoo HR sync" mô tả 3 chế độ, cách tạo API key chỉ đọc trong Odoo, và `SETTINGS_ENCRYPTION_KEY`.
- [ ] **Step 4:** Chạy toàn bộ vitest, playwright, typecheck và lint, kỳ vọng tất cả PASS.
- [ ] **Step 5:** Commit `feat(odoo): admin UI, docs`.
