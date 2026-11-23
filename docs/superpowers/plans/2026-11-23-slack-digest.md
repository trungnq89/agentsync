# Slack Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gửi cho mỗi người một bản tóm tắt (DM) qua Slack theo lịch họ tự đặt: giờ, ngày trong tuần, múi giờ.

**Architecture:**
- Cấu hình Slack và thiết lập cá nhân nằm trong DB. Token được mã hóa.
- Slack được gọi qua client `fetch`, đặt sau interface `DigestTransport`.
- Hàm `collectDigestData` lấy dữ liệu bằng các truy vấn hiện có. Hàm thuần `buildDigest` dựng tin nhắn kiểu Block Kit.
- `runDigestsIfDue` chạy mỗi 60 giây từ `instrumentation-node.ts`. Nó dùng advisory lock và bảng `digest_deliveries` có ràng buộc unique để không gửi trùng.

**Tech Stack:** Next 16, Drizzle/Postgres, Vitest, Playwright, next-intl, `Intl.DateTimeFormat` cho múi giờ (không thêm thư viện).

**Spec:** `docs/superpowers/specs/2026-11-23-slack-digest-design.md`

## Global Constraints

- **Slack toàn hệ thống mặc định tắt.** Chỉ admin cấu hình được. Bot token (`xoxb-…`) lưu mã hóa bằng `encryptSecret` và không bao giờ được trả về giao diện. Thiếu `SETTINGS_ENCRYPTION_KEY` thì tab Slack bị tắt. Thiếu `APP_URL` thì không cho bật.
- **Mặc định của công ty:** bật, `08:30`, `[1,2,3,4,5]` (1 = thứ 2 … 7 = chủ nhật), múi giờ `process.env.DEFAULT_TIMEZONE ?? 'Asia/Ho_Chi_Minh'`.
- **Thiết lập cá nhân:**
  - Các cột `users.digestEnabled|digestTime|digestDays|digestTimezone` cho phép null. Null nghĩa là theo mặc định công ty.
  - Chỉ chính người đó sửa được.
  - Giờ gửi theo bước 15 phút (`HH:MM`, phút thuộc `00|15|30|45`).
  - Đang bật thì phải có ít nhất 1 ngày.
  - Múi giờ phải là tên IANA hợp lệ.
  - Giá trị sai thì ném `VALIDATION` có `field`.
- **Ghép Slack theo email** (`trim().toLowerCase()`) qua `users.lookupByEmail`, cache vào `users.slackUserId`. Email đổi thì xóa `slackUserId`. Gặp lỗi `user_not_found|channel_not_found|is_archived` khi gửi thì cũng xóa `slackUserId`. `account_inactive` là lỗi của chính token bot, nên tính là `slackAuthFailed`.
- **Nội dung tin nhắn:**
  - Phần "Cần bạn xử lý" lấy từ `needsAttention(db, actor)` **bỏ các mục `ownerIsMe`**. Nhóm "Chờ bạn duyệt" gồm `pending_confirmation|awaiting_review|checkpoint_pending|question_for_me`. Nhóm "Có vấn đề" là các loại còn lại. Mỗi nhóm tối đa 10 mục, phần dư hiện "… và N mục khác".
  - Cuối phần đó có dòng tổng hợp team: việc đang làm, việc xong và việc mới tạo kể từ `since`. Chỉ tính cấp dưới trực tiếp, không tính việc riêng tư.
  - Phần "Việc của bạn" gồm `rejectedCheckpoints`, `changesRequested`, `questionsForMe`, các câu trả lời trong `answersToMyQuestions` có thời điểm trả lời sau `since`, việc của mình quá hạn hoặc tới hạn trong 2 ngày, và số bước của mình đang `pending_approval`.
  - Cả hai phần trống thì không gửi, ghi `skipped_empty`.
- **`since`** = `sentAt` của lần `sent` gần nhất. Chưa có lần nào thì lấy `now − 24h`.
- **Lịch và giới hạn:**
  - Bộ hẹn giờ 60 giây, `unref`, nuốt mọi lỗi, không chạy khi `NODE_ENV=test`.
  - Dùng advisory lock riêng.
  - Ràng buộc unique `(userId, localDate, channel)`, giành dòng bằng `INSERT … ON CONFLICT DO NOTHING`.
  - Gửi bù chỉ trong cùng ngày theo giờ địa phương.
  - Lỗi thì thử lại tối đa 3 lần, mỗi lần cách ít nhất 5 phút. Lỗi ghép tài khoản (`slackUserNotFound`, `noEmail`) thì không thử lại.
  - Gặp 429 thì dừng lần chạy này.
  - Mỗi lần gọi Slack timeout 10 giây.
- **"Gửi thử cho tôi"** không ghi vào `digest_deliveries`.
- **Log và lỗi:** chỉ lưu mã lỗi Slack (ví dụ `invalid_auth`), không ghi token hay nội dung tin nhắn vào log hoặc vào cột `error`.
- **Tin nhắn:** dùng `locale` của người nhận, nếu không có thì `DEFAULT_LOCALE`. Link dạng `${APP_URL}/tasks/{id}`. Mọi chuỗi nằm trong `messages/{en,vi}.json`, và test chặn chuỗi cứng phải pass.
- **Theo mẫu có sẵn:** `DomainError(code, key, params)`, phân quyền đặt trong `src/server`, mọi thao tác ghi chạy trong transaction.
- **Commit:** trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Làm trên nhánh `feat/slack-digest`.

## Review Focus

1. **Múi giờ lệch ngày so với UTC.** Người dùng ở `America/New_York` lúc 03:00 UTC ngày 24, tức 22:00 ngày 23 giờ địa phương, với giờ gửi `21:00` và ngày 23 là ngày được chọn: lần gửi phải tính cho `localDate = ngày 23` và không gửi lần nữa trong ngày 23. Test ở Task 4.
2. **Hai lần chạy đồng thời,** hoặc hai tiến trình, chỉ gửi đúng một tin: gọi `runDigestsIfDue` song song hai lần thì fake Slack chỉ nhận một `chat.postMessage` cho mỗi người. Test ở Task 4.
3. **Đổi giờ gửi sau khi hôm nay đã gửi:** không gửi thêm. Đổi sang giờ muộn hơn khi hôm nay chưa gửi: gửi theo giờ mới. Test ở Task 4.
4. **Token sai (`invalid_auth`):** lần chạy dừng ngay. Không tạo hàng loạt dòng `failed` cho 20 người. Lỗi chỉ được ghi một lần vào `slack_settings.lastError` và hiện ở tab Slack. Test ở Task 4.
5. **Phân quyền nội dung:**
   - Quản lý cũ không còn thấy cấp dưới cũ.
   - Quản lý của quản lý không thấy cấp dưới gián tiếp.
   - Việc riêng tư của cấp dưới không xuất hiện.
   - Người bị vô hiệu hóa không nhận tin.

   Test ở Task 3 và Task 4.

---

### Task 1: Dữ liệu, cấu hình Slack, thiết lập cá nhân

**Files:**
- Modify: `src/db/schema.ts`. Migration mới tạo bằng drizzle-kit.
- Create: `src/server/digest/settings.ts`, `src/server/digest/prefs.ts`.
- Modify: những chỗ ghi `users.email`: cập nhật user ở `src/server/org.ts` và đồng bộ ở `src/server/odoo/sync.ts`. Email đổi thì đặt `slackUserId = null`.
- Modify: `messages/*.json`.
- Test: `tests/server/digest-settings.test.ts`.

**Interfaces (Produces):**
- **Schema:**
  - `slack_settings`: singleton `id=1`, gồm `enabled bool default false`, `botTokenEnc text null`, `defaultEnabled bool default true`, `defaultTime text default '08:30'`, `defaultDays integer[] default {1,2,3,4,5}`, `defaultTimezone text null` (null nghĩa là lấy theo env), `lastError text null`, `lastErrorAt ts null`.
  - `users`: thêm `digestEnabled bool null`, `digestTime text null`, `digestDays integer[] null`, `digestTimezone text null`, `slackUserId text null`.
  - `digest_deliveries`: `id`, `userId` (FK), `localDate date`, `channel text default 'slack'`, `status text` (CHECK `sent|skipped_empty|failed`), `attempts int default 1`, `error text null`, `createdAt`, `updatedAt`, `sentAt null`. Unique `(user_id, local_date, channel)`.
- **Kiểu dữ liệu:**
  - `type DigestPrefs = { enabled: boolean; time: string; days: number[]; timezone: string }`
  - `type DigestPrefsView = DigestPrefs & { inherited: { enabled: boolean; time: boolean; days: boolean; timezone: boolean } }`
- **Hàm:**
  - `effectiveDigestPrefs(user: Pick<User,'digestEnabled'|'digestTime'|'digestDays'|'digestTimezone'>, s: SlackSettingsRow): DigestPrefsView`
  - `getSlackSettingsView(db, actor) → { enabled, tokenSaved, encryptionReady, appUrlSet, defaults: DigestPrefs, lastError: string|null, lastErrorAt: Date|null }`: chỉ admin, người khác nhận `FORBIDDEN`, theo mẫu `getOdooSettingsView`.
  - `saveSlackSettings(db, actor, input: { enabled?: boolean; botToken?: string; defaults?: Partial<DigestPrefs> })`:
    - chỉ admin gọi được;
    - `botToken` rỗng hoặc không có nghĩa là giữ token cũ;
    - bật khi thiếu token → `VALIDATION` key `slackTokenRequired`;
    - bật khi thiếu `APP_URL` → `slackAppUrlRequired`;
    - thiếu khóa mã hóa → `encryptionKeyMissing`, dùng lại key của Odoo nếu đã có.
  - `loadSlackToken(db): Promise<string | null>`
  - `getMyDigestPrefs(db, actor) → DigestPrefsView & { slackEnabled: boolean; slackLinked: boolean | null }`
  - `setMyDigestPrefs(db, actor, input: Partial<DigestPrefs>)` và `resetMyDigestPrefs(db, actor)` (đặt về null).
  - `validateDigestPrefs(p: Partial<DigestPrefs>)` ném các key: `invalidDigestTime` (field `time`), `digestDaysRequired` (field `days`), `invalidTimezone` (field `timezone`).

- [ ] **Step 1: Viết test thất bại**
  - Mặc định: user không có giá trị riêng thì nhận `{enabled:true,time:'08:30',days:[1..5],timezone:'Asia/Ho_Chi_Minh'}`, tất cả cờ `inherited` là true. Admin đổi `defaultTime` thành `09:00` thì user này nhận `09:00`.
  - `setMyDigestPrefs({time:'08:10'})` → `invalidDigestTime`. `{days:[]}` khi đang bật → `digestDaysRequired`. `{timezone:'Mars/Base'}` → `invalidTimezone`. Giá trị hợp lệ được lưu, và `reset` đưa mọi trường về null.
  - `saveSlackSettings`: người không phải admin → FORBIDDEN. Token lưu ở dạng mã hóa, khác chuỗi gốc, và `getSlackSettingsView` không chứa token. Bật khi chưa có token → `slackTokenRequired`. Bật khi `APP_URL` trống → `slackAppUrlRequired`.
  - Đổi email user qua hàm cập nhật của org → `slackUserId` trở thành null.
- [ ] **Step 2:** Chạy `pnpm vitest run tests/server/digest-settings.test.ts`, kỳ vọng FAIL.
- [ ] **Step 3:** Cài đặt, sinh migration, thêm key i18n cho cả en và vi.
- [ ] **Step 4:** Chạy lại test thấy PASS, rồi chạy toàn bộ `pnpm vitest run`, `pnpm typecheck` và `pnpm lint`.
- [ ] **Step 5:** Commit `feat(digest): slack settings, personal digest prefs, schema`.

### Task 2: Slack client, transport, server giả lập

**Files:**
- Create: `src/server/digest/slack.ts`.
- Create: `tests/helpers/fake-slack.ts`.
- Test: `tests/server/slack-client.test.ts`.

**Interfaces:**
- Consumes: `loadSlackToken`, cột `users.slackUserId` (Task 1).
- Produces:
  - `createSlackClient(token: string, baseUrl = process.env.SLACK_API_BASE ?? 'https://slack.com/api')` trả về:
    - `authTest(): Promise<{ team: string; botName: string }>`
    - `lookupByEmail(email): Promise<string>`, trả về user id
    - `postMessage(channel, msg: { text: string; blocks?: unknown[] }): Promise<void>`
  - Lỗi Slack (`ok:false`, HTTP lỗi, timeout 10 giây) được ánh xạ sang `DomainError`:
    - `slackAuthFailed`: `invalid_auth`, `not_authed`, `account_inactive` của bot, `token_revoked`
    - `slackUserNotFound`: `users_not_found`
    - `slackRecipientGone`: `user_not_found`, `channel_not_found`
    - `slackRateLimited`: HTTP 429, kèm `params.retryAfter`
    - `slackUnavailable`: mọi lỗi còn lại
    - Mỗi lỗi có `params.code` là mã của Slack.
  - `interface DigestTransport { channel: 'slack'; resolveRecipient(db, user): Promise<string>; send(db, user, msg): Promise<void> }` (không giữ trạng thái; xem task-2-report "Fixes")
  - `slackTransport(client): DigestTransport`. Hàm `resolveRecipient`:
    - dùng `slackUserId` đã cache nếu có;
    - không có email → ném `noEmail`;
    - nếu chưa có cache thì lookup rồi lưu lại;
    - khi `send` ném `slackRecipientGone` thì xóa cache rồi ném lại lỗi.
- **Fake Slack:** `startFakeSlack({ token, usersByEmail, failNext?: { method, error | status, retryAfter? } })` trả về `{ url, posts: {channel,text,blocks}[], close() }`. Chạy bằng `node:http`, nhận `Authorization: Bearer`, theo mẫu của `tests/helpers/fake-odoo.ts`.

- [ ] **Step 1: Viết test thất bại**
  - Token đúng thì `authTest` trả về team và bot. Token sai → `slackAuthFailed`, và `message`/`params` của lỗi không chứa token.
  - `lookupByEmail` thấy người dùng thì trả về id. Không thấy → `slackUserNotFound`.
  - `postMessage` gửi được, fake ghi nhận đúng `channel` và `text`. Gặp 429 kèm `Retry-After: 7` → `slackRateLimited`, `params.retryAfter = 7`. Server treo lâu hơn timeout → `slackUnavailable`. Test này tiêm một timeout ngắn qua tham số tùy chọn `timeoutMs`.
  - Transport: lần đầu lookup rồi lưu `slackUserId`. Lần sau không lookup lại, đếm số request lookup trên fake để kiểm tra. Gửi bị `channel_not_found` thì `slackUserId` thành null.
- [ ] **Step 2–4:** Chạy thấy RED, cài đặt, chạy thấy GREEN, rồi chạy toàn bộ vitest, typecheck và lint.
- [ ] **Step 5:** Commit `feat(digest): slack client and transport`.

### Task 3: Thu thập dữ liệu và dựng tin nhắn

**Files:**
- Create: `src/server/digest/collect.ts`, `src/server/digest/build.ts`.
- Modify: `messages/*.json`, namespace `digest`.
- Test: `tests/server/digest-content.test.ts`.

**Interfaces:**
- Consumes: `needsAttention` và `AttentionItem` (`src/server/tasks/queries.ts`), `getPendingFeedback` (`src/server/tasks/activity.ts`), `actorFromUser` hoặc cách dựng `Actor` từ một user mà `src/server/authz.ts` đang dùng.
- Produces:
  - `type DigestData = { manager: { awaiting: AttentionItem[]; problems: AttentionItem[]; team: { active: number; doneSince: number; createdSince: number } | null }; mine: { rejected: …; changesRequested: …; questionsForMe: …; answers: …; dueSoon: { taskId; title; dueDate; overdue: boolean }[]; pendingApprovalSteps: number } }`. Các trường `mine` lấy đúng kiểu từ `PendingFeedback`.
  - `collectDigestData(db, user: User, since: Date, now: Date): Promise<DigestData>`. `team` là null khi người này không có cấp dưới trực tiếp.
    - `PendingFeedback.answersToMyQuestions` không có thời điểm trả lời. Nếu cần, có thể thêm `answeredAt` vào kiểu đó (cột `questions.answered_at` đã có), miễn là các chỗ gọi hiện có vẫn chạy đúng.
  - `isDigestEmpty(d: DigestData): boolean`. Dòng team và `pendingApprovalSteps` không tính là có nội dung. Tin chỉ được gửi khi có ít nhất một mục cần hành động hoặc một câu trả lời mới.
  - `buildDigest(d: DigestData, opts: { locale: Locale; timezone: string; appUrl: string; now: Date; test?: boolean }): { text: string; blocks: unknown[] }`, là hàm thuần. Header có ngày theo `timezone`. Mỗi mục là một dòng mrkdwn chứa `<${appUrl}/tasks/${id}|title>`. Mỗi nhóm tối đa 10 mục, kèm dòng "… và N mục khác" trỏ về `${appUrl}/`. `test: true` thì thêm dòng "Tin thử" và, nếu không có mục nào, dòng "không có gì cần chú ý".

- [ ] **Step 1: Viết test thất bại**
  - **Quản lý M** có cấp dưới A và B:
    - A có việc `blocked`, B có checkpoint đang chờ. `awaiting` chứa mục `checkpoint_pending`, `problems` chứa `blocked`.
    - Việc riêng tư của A không xuất hiện.
    - M cũng là cấp dưới của D, và M có việc bị `changes_requested`. Mục này nằm trong `mine.changesRequested`, không nằm trong `manager`.
  - **Quản lý của quản lý (D):** không thấy việc của A trong phần `manager`.
  - **Đổi quản lý:** A chuyển sang quản lý khác thì phần `manager` của M không còn việc của A.
  - **Member thường:**
    - Có câu hỏi mở từ quản lý → `questionsForMe` có mục đó.
    - Câu trả lời có `answeredAt` trước `since` không được đưa vào, câu trả lời sau `since` thì có.
    - Việc tới hạn ngày mai → `dueSoon` có `overdue: false`. Việc hạn hôm qua → `overdue: true`.
  - **`isDigestEmpty`:** chỉ có dòng team → true. Có một mục bất kỳ → false.
  - **`buildDigest`:**
    - Locale `vi` có header tiếng Việt, `en` có header tiếng Anh. Kiểm tra bằng message key, không dùng chuỗi cứng.
    - 12 mục `problems` thì hiện 10 mục cùng dòng "… và 2", và link `.../tasks/<id>` có trong `blocks`.
    - `text` không rỗng.
    - Ngày ở header dùng `timezone`: `now = 2026-11-23T20:00Z` với `Asia/Ho_Chi_Minh` hiện ngày 24/11.
- [ ] **Step 2–4:** Chạy thấy RED, cài đặt, chạy thấy GREEN, rồi chạy toàn bộ vitest, typecheck, lint và test chặn chuỗi cứng.
- [ ] **Step 5:** Commit `feat(digest): collect digest data and build slack message`.

### Task 4: Lịch gửi, chống gửi trùng, gửi thử

**Files:**
- Create: `src/server/digest/schedule.ts`.
- Modify: `instrumentation-node.ts`.
- Test: `tests/server/digest-schedule.test.ts`.

**Interfaces:**
- Consumes: Task 1, 2 và 3.
- Produces:
  - `localParts(now: Date, timezone: string): { date: string /* YYYY-MM-DD */; weekday: 1..7; minutes: number }`, dùng `Intl.DateTimeFormat` với `hourCycle: 'h23'`.
  - `isDue(prefs: DigestPrefs, now: Date): { due: boolean; localDate: string }`. Đến hạn khi `enabled`, `weekday ∈ days`, và `minutes >= time`.
  - `runDigestsIfDue(db, now: Date, makeTransport?: (token: string) => DigestTransport) → { sent: number; skipped: number; failed: number; aborted?: ErrorKey }`. Các bước:
    1. Lấy advisory lock bằng `pg_try_advisory_lock(<hằng số riêng>)` trên một kết nối riêng, mở khóa trong `finally`. Không lấy được khóa thì trả về toàn số 0.
    2. Thoát nếu Slack tắt, không có token, hoặc không có `APP_URL`.
    3. Lấy user đang hoạt động (`disabledAt` null) mà `isDue` đúng.
    4. Giành dòng: `INSERT (status 'failed', attempts 0, error 'claimed') ON CONFLICT DO NOTHING RETURNING`. Nếu không insert được, chỉ giành lại dòng `failed` khi `attempts < 3`, `updatedAt <= now − 5 phút` và `error` không thuộc `slackUserNotFound|noEmail`. Việc này làm bằng một `UPDATE … WHERE … RETURNING` có điều kiện.
    5. Thu thập và dựng tin. Rỗng thì ghi `skipped_empty`. Gửi được thì ghi `sent` kèm `sentAt = now`. Lỗi thì ghi `failed`, `attempts+1`, `error = key`.
    6. Gặp `slackAuthFailed`: ghi `slack_settings.lastError` và `lastErrorAt`, **xóa dòng vừa giành**, dừng vòng lặp và trả về `aborted`.
    7. Gặp `slackRateLimited`: trả dòng vừa giành về trạng thái chưa gửi (xóa nếu nó mới được tạo trong lần chạy này) rồi dừng.
    8. Có một lần gửi thành công thì đặt `lastError` về null.
  - `sendTestDigest(db, actor, now?)`:
    - chỉ admin gọi được;
    - dựng tin `test: true` của chính admin rồi gửi;
    - không ghi `digest_deliveries`;
    - trả về `{ ok: true }` hoặc ném lỗi đã ánh xạ.
  - `testSlackConnection(db, actor) → { team, botName }`, chỉ admin gọi được.
  - `rematchSlackUser(db, actor, userId)`: chỉ admin gọi được. Xóa `slackUserId` của user đó, và xóa dòng `failed` của user đó trong ngày hôm nay có lỗi `slackUserNotFound`.
  - `listDigestDeliveries(db, actor, limit = 50)` và `listUnmatchedSlackUsers(db, actor)`. Danh sách chưa ghép gồm user đang hoạt động không có email, và user có dòng `failed` gần nhất mang lỗi `slackUserNotFound`. Cả hai hàm chỉ admin gọi được.
  - Trong `instrumentation-node.ts`, thêm bộ hẹn giờ `__agentsyncDigestTimer`, 60 giây, theo đúng mẫu Odoo.

- [ ] **Step 1: Viết test thất bại.** Dùng fake Slack và `now` cố định.
  - `isDue`, `Asia/Ho_Chi_Minh`, giờ gửi 08:30, thứ 2–6:
    - thứ 2 lúc 01:29Z (08:29 địa phương) → không đến hạn;
    - 01:30Z → đến hạn;
    - thứ 7 → không đến hạn.
  - **Review Focus 1:** `America/New_York`, giờ gửi 21:00, ngày 2026-11-23 là thứ 2. `now = 2026-11-24T03:00Z` → `due`, `localDate = '2026-11-23'`. Chạy rồi chạy lại 10 phút sau thì fake chỉ nhận đúng 1 tin.
  - **Review Focus 2:** `Promise.all([run(), run()])` → mỗi user nhận đúng 1 tin.
  - **Review Focus 3:** đã gửi lúc 08:30, user đổi giờ thành 07:00, chạy lại → 0 tin. User khác chưa gửi đổi giờ từ 08:30 thành 10:00, chạy lúc 09:00 → 0 tin, chạy lúc 10:00 → 1 tin.
  - **Gửi bù:** server không chạy trong khoảng 08:30–11:00. Lần chạy lúc 11:00 vẫn gửi. Sang ngày hôm sau lúc 00:10 địa phương không gửi bù ngày cũ, vì `minutes < time`.
  - **Review Focus 4:** token sai → `aborted: 'slackAuthFailed'`, không còn dòng nào trong `digest_deliveries`, `slack_settings.lastError` đã được đặt. Sửa token rồi chạy lại thì gửi được và `lastError` thành null.
  - **Thử lại:** lần đầu Slack trả `slackUnavailable` → `failed`, `attempts=1`. Chạy lại sau 2 phút → không thử. Sau 6 phút → thử và gửi được, dòng đó thành `sent`. Sau 3 lần thất bại thì không thử nữa.
  - **Lỗi ghép tài khoản:** email không có trong Slack → `failed` với `slackUserNotFound`, không thử lại trong ngày, và user nằm trong `listUnmatchedSlackUsers`. Gọi `rematchSlackUser` thì lần chạy sau thử lại.
  - **Không có nội dung** → `skipped_empty`, fake không nhận tin nào.
  - **User bị vô hiệu hóa** → không gửi. **User tắt bản tóm tắt** → không gửi.
  - **`since`:** câu trả lời đã nằm trong tin gửi hôm qua thì hôm nay không lặp lại.
  - **`sendTestDigest`:** fake nhận đúng 1 tin có dòng "Tin thử", và `digest_deliveries` vẫn trống. Người không phải admin → FORBIDDEN.
- [ ] **Step 2–4:** Chạy thấy RED, cài đặt, chạy thấy GREEN, rồi chạy toàn bộ vitest, typecheck và lint.
- [ ] **Step 5:** Commit `feat(digest): scheduler, dedupe, retries, test send`.

### Task 5: Giao diện, tài liệu, e2e

**Files:**
- Create: `app/admin/slack/page.tsx` và các thành phần trong `app/admin/slack/_components/*`, theo mẫu `app/admin/odoo`.
- Modify: `app/admin/_components/admin-tabs.tsx`, thêm tab `slack`.
- Modify: `app/settings/page.tsx`, thêm thẻ "Tóm tắt Slack".
- Server actions đặt trong `app/_actions/`, theo mẫu Odoo và preferences.
- Modify: `messages/*.json`.
- Docs: tạo `docs/slack-setup.md` và `docs/slack-setup.vi.md`. Cập nhật `README.md`, `README.vi.md` (danh sách tính năng, biến `APP_URL`, `SETTINGS_ENCRYPTION_KEY`, `DEFAULT_TIMEZONE`), `.env.example`, `docker-compose.prod.yml` (`DEFAULT_TIMEZONE`).
- Test: `tests/e2e/slack-admin.spec.ts`. Server e2e được cấu hình `SLACK_API_BASE` trỏ tới fake Slack khởi động trong global setup của Playwright, hoặc cách tương đương mà e2e Odoo đang dùng.

**Interfaces:** dùng các hàm của Task 1 và Task 4. Mọi action lấy actor từ `getActor()`.

- **Tab Slack của admin:**
  - Hộp cảnh báo rằng dữ liệu sẽ được gửi sang Slack.
  - Thiếu khóa mã hóa hoặc `APP_URL` thì hiện cảnh báo tương ứng.
  - Form token, hiện "đã lưu" khi đã có token.
  - Nút "Kiểm tra kết nối", hiện team và bot.
  - Công tắc bật/tắt.
  - Form giá trị mặc định: bật/tắt, giờ (dropdown bước 15 phút), ngày (nhóm checkbox), múi giờ (`Intl.supportedValuesOf('timeZone')` kèm ô tìm kiếm).
  - Nút "Gửi thử cho tôi".
  - Thẻ hiện `lastError` nếu có.
  - Bảng "Chưa ghép Slack" có nút "Ghép lại".
  - Bảng "Lịch sử gửi" 50 dòng.
  - Một đoạn hướng dẫn ngắn, link tới `docs/slack-setup*.md` trên GitHub.
- **Thẻ ở `/settings`:**
  - Các trường cá nhân, mỗi trường có nhãn "(mặc định công ty)" khi đang theo mặc định, và nút "Dùng mặc định".
  - Slack chưa bật thì các ô bị khóa kèm dòng giải thích.
  - Chưa ghép được thì hiện cảnh báo.

- [ ] **E2E:**
  - Admin lưu token rồi kiểm tra kết nối, thấy tên team.
  - Bật Slack, bấm gửi thử, fake nhận được tin. Có thể kiểm tra qua một endpoint đếm của fake, hoặc qua thông báo toast.
  - Bảng "Chưa ghép" có một user không có email.
  - Member mở `/settings`, đổi giờ thành 09:15 và lưu, tải lại trang vẫn là 09:15. Bấm "Dùng mặc định" thì nhãn "(mặc định công ty)" quay lại.
  - Chọn giờ sai không làm được với dropdown, nên chỉ test lỗi "chọn ít nhất một ngày" hiện dưới ô.
  - Member không truy cập được `/admin/slack`, theo hành vi hiện có của trang admin.
  - Không cuộn ngang ở 375px, cả `vi` lẫn `en`, ở cả hai trang.
- [ ] Chạy toàn bộ `pnpm playwright test`, `pnpm vitest run`, `pnpm typecheck`, `pnpm lint` và `pnpm build`.
- [ ] Commit `feat(digest): admin slack tab, personal settings, docs`.
