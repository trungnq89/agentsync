# AgentSync — Bản tóm tắt định kỳ qua Slack

*Ngày: 2026-11-23 · Trạng thái: người dùng đã chốt cách làm; chi tiết ghi "(quyết định của tôi)" do tôi tự chốt; chờ duyệt · Nền tảng: `main` (e06145d)*

## 1. Mục đích

AgentSync được làm ra để quản lý **không phải hỏi** "việc tới đâu rồi". Hiện tại quản lý vẫn phải tự mở web mới biết có việc chờ mình duyệt hay member đang bị vướng. Member cũng chỉ thấy phản hồi của quản lý khi mở agent.

Tính năng này gửi cho mỗi người **một tin nhắn riêng (DM) trên Slack, theo lịch họ tự chọn**. Tin nhắn tóm tắt những gì cần họ chú ý. Team của người dùng dùng Slack hằng ngày.

## 2. Quyết định của người dùng

- **Kênh đầu tiên là Slack.** Email và Telegram để sau.
- **Chỉ gửi bản tóm tắt định kỳ**, không gửi thông báo tức thì.
- **Mỗi người có thiết lập riêng.**
- **Cách hẹn giờ:** dùng bộ hẹn giờ trong server, kiểm tra mỗi phút, giống cơ chế đồng bộ Odoo.

## 3. Mục tiêu, không phải mục tiêu, phản mục tiêu

**Mục tiêu:**
- Mỗi người nhận một DM theo giờ, ngày và múi giờ của riêng mình.
- Nội dung đúng phân quyền hiện có.
- Có link mở thẳng trang việc.
- Tin nhắn dùng ngôn ngữ của người nhận.
- Admin cấu hình bot một lần và có nút gửi thử.

**Không phải mục tiêu:**
- Thông báo tức thì theo từng sự kiện.
- Gửi vào kênh chung, dạng incoming webhook.
- Thao tác ngay trong Slack (nút Đạt hay Duyệt). Mọi thao tác vẫn làm trên web.
- Email và Telegram trong đợt này. Chỉ chuẩn bị lớp kênh để cắm thêm sau.
- Slash command và Slack OAuth app phân phối công khai.

**Phản mục tiêu** (có chạy cũng tính là thất bại):
- Lộ việc riêng tư, hoặc việc của người không do mình quản lý trực tiếp.
- Gửi trùng nhiều tin trong một ngày, hoặc dội tin khiến người ta tắt bot.
- Gửi tin rỗng.
- Lộ bot token.
- Slack lỗi làm sập server.

## 4. Cách làm đã chọn và các cách đã cân nhắc

| Cách | Kết luận |
|---|---|
| **1. Bộ hẹn giờ trong server**, kiểm tra mỗi phút, có bảng chống gửi trùng | **Chọn.** Không thêm dịch vụ, dùng lại mẫu bộ hẹn giờ trong `instrumentation-node.ts` của Odoo. Advisory lock là phần mới, vì bộ hẹn giờ Odoo không có. |
| 2. Cron bên ngoài gọi vào một endpoint | Bỏ. Thêm bước cài đặt dễ quên, và thêm một endpoint phải bảo vệ. |
| 3. Hàng đợi job (pg-boss…) | Bỏ. Quá nặng cho khoảng 20 người và chỉ một loại job. |

Về phía Slack:
- **Chọn:** bot token gửi DM.
- **Bỏ:** incoming webhook vào một kênh, vì sẽ phá phân quyền theo quản lý trực tiếp.

## 5. Cấu hình Slack (admin)

**Trang:** Quản trị → tab **Slack**, làm theo mẫu tab Odoo.

**Bot token:**
- Admin dán bot token (`xoxb-…`) của một Slack app nội bộ do admin tự tạo.
- Quyền cần có: `chat:write` và `users:read.email`.
- Trang có hướng dẫn tạo app ngắn gọn, bằng cả `en` và `vi`.
- Token được **mã hóa AES-256-GCM** bằng `SETTINGS_ENCRYPTION_KEY`, như API key Odoo. Thiếu khóa thì tab Slack bị tắt, kèm thông báo rõ ràng.
- Token không bao giờ được trả về giao diện, giao diện chỉ hiện "đã lưu".

**Công tắc bật/tắt toàn hệ thống.** Mặc định là **tắt**, cho tới khi admin bật.

**Nút "Kiểm tra kết nối":**
- Gọi `auth.test`.
- Trả về tên workspace và tên bot, hoặc lỗi đã dịch.

**Nút "Gửi thử cho tôi":** dựng bản tóm tắt thật của chính admin và gửi DM cho admin. Nếu bản tóm tắt rỗng, vẫn gửi kèm dòng "không có gì cần chú ý (tin thử)".
- Tin thử **không ghi vào `digest_deliveries`**, nên không chặn bản tóm tắt thật trong ngày và không làm lệch mốc "kể từ lần gửi trước". Kết quả chỉ hiện ngay trên trang *(quyết định của tôi)*.

**Giá trị mặc định cho người dùng:**
- Bật hay tắt, mặc định **bật**.
- Giờ gửi, mặc định `08:30`.
- Các ngày, mặc định thứ 2 đến thứ 6.
- Múi giờ, mặc định là biến `DEFAULT_TIMEZONE`, nếu không có thì `Asia/Ho_Chi_Minh`.

**Bảng "Ghép tài khoản Slack":**
- Liệt kê những người dùng đang hoạt động mà **không có email**, hoặc email **không tìm thấy trong Slack**.
- Có nút "Ghép lại".

**Lịch sử gửi:** 50 lần gửi gần nhất. Mỗi dòng gồm người nhận, ngày, trạng thái và lỗi đã dịch.

**Giới hạn và log:**
- Mỗi lần gọi Slack giới hạn 10 giây.
- Thông báo lỗi và log không được chứa token.

## 6. Ghép người dùng với Slack

- **Ghép theo email:** gọi `users.lookupByEmail(email)` với email của AgentSync, chuẩn hóa bằng `trim().toLowerCase()`. Kết quả lưu vào `users.slackUserId`.
- **Khi nào ghép:**
  - Lần gửi đầu tiên.
  - Khi email của người dùng thay đổi. Khi đó `slackUserId` bị xóa và ghép lại ở lần gửi sau.
  - Khi admin bấm "Ghép lại".
- **Khi không ghép được:**
  - Lỗi `users_not_found`: ghi lần gửi là `failed`, lý do `slackUserNotFound`, và người đó hiện trong bảng "Ghép tài khoản".
  - Không có email: ghi lý do `noEmail`.
- **Khi đã lưu `slackUserId` mà gửi lỗi:** nếu lỗi là `user_not_found`, `channel_not_found` hoặc `is_archived`, xóa `slackUserId` và để lần sau ghép lại.

## 7. Thiết lập cá nhân

**Nơi chỉnh:** trang **Cài đặt** cá nhân (`/settings`) có thêm thẻ **"Tóm tắt Slack"**.

**Các trường:**
- **Bật hay tắt.**
- **Giờ gửi:** `HH:MM`, bước 15 phút *(quyết định của tôi: để chọn bằng dropdown cho đơn giản)*.
- **Các ngày trong tuần:** chọn nhiều ngày. Phải có ít nhất một ngày nếu đang bật, nếu không thì báo lỗi `VALIDATION`.
- **Múi giờ:** danh sách IANA, có ô tìm kiếm.

**Cách lưu:**
- Bảng `users` thêm các cột cho phép null: `digestEnabled`, `digestTime`, `digestDays` (mảng số `1..7`, với `1` là thứ 2), `digestTimezone`.
- **Null nghĩa là theo mặc định của công ty**, nên khi admin đổi mặc định thì những ai chưa tự chỉnh sẽ theo luôn.
- Thẻ cài đặt hiện giá trị đang có hiệu lực, có ghi chú "(mặc định công ty)", và có nút "Dùng mặc định".

**Trạng thái của thẻ:**
- Slack chưa được admin bật: thẻ vẫn hiện nhưng có dòng "Admin chưa bật Slack" và các ô bị khóa.
- Người dùng chưa ghép được với Slack: hiện cảnh báo kèm lý do.

**Kiểm tra dữ liệu:** giờ, ngày và múi giờ phải hợp lệ, nếu không thì ném `VALIDATION` có kèm `field`.

## 8. Nội dung bản tóm tắt

**Một người nhận một tin nhắn duy nhất, gồm hai phần.** Phần nào trống thì ẩn. **Cả hai trống thì không gửi**, và lần đó được ghi `skipped_empty`.

### 8.1 Phần "Cần bạn xử lý"

Dành cho người có cấp dưới trực tiếp.
- Nguồn dữ liệu là đúng hàm `needsAttention(db, actor)` đang dùng cho trang chủ, nên phân quyền và việc riêng tư được lọc giống hệt nhau.
- **Bỏ các mục `ownerIsMe: true`** (việc của chính người nhận mà `needsAttention` cũng trả về). Các mục này thuộc §8.2, để không hiện hai lần *(quyết định của tôi)*.
- Các mục được nhóm như sau:
  - **"Chờ bạn duyệt":** `pending_confirmation`, `awaiting_review`, `checkpoint_pending`, `question_for_me`.
  - **"Có vấn đề":** `blocked`, `overdue`, `stale`, `changes_requested`, `paused_or_cancelled`.
- Mỗi mục có tên member, tên việc kèm link, và chi tiết lấy từ cùng nguồn mà trang chủ dùng để dịch.
- Mỗi nhóm hiện tối đa 10 mục. Phần còn lại hiện dòng "… và N mục khác", kèm link về trang chủ.
- Cuối phần này có một dòng tổng hợp team: số việc đang làm, số việc xong kể từ lần gửi trước, và số việc mới tạo kể từ lần gửi trước. Chỉ tính việc của cấp dưới trực tiếp, không tính việc riêng tư.

### 8.2 Phần "Việc của bạn"

Gồm phản hồi trên các việc của chính người nhận:
- **Bước bị "Chưa đạt":** lấy từ `rejectedCheckpoints`, kèm ghi chú của quản lý.
- **Việc bị yêu cầu sửa,** kèm phản hồi.
- **Câu hỏi quản lý gửi cho bạn mà bạn chưa trả lời** *(quyết định của tôi: member thường cũng phải biết điều này)*.
- **Câu hỏi đã được trả lời** kể từ lần gửi trước.
- **Việc quá hạn,** hoặc tới hạn trong 2 ngày tới.
- **Bước đang chờ quản lý duyệt:** chỉ là một dòng đếm, để member biết việc còn đang chờ.

Phần này có cả việc riêng tư của chính người nhận, vì tin nhắn chỉ gửi cho họ.

### 8.3 Hình thức

- **Định dạng:** Slack Block Kit gồm header, các section và context. Có kèm `text` dự phòng cho thông báo đẩy.
- **Link:** dạng `{APP_URL}/tasks/{id}`. Nếu `APP_URL` chưa đặt thì tab Slack hiện cảnh báo, và không cho bật Slack.
- **Ngôn ngữ và ngày tháng:** dùng `locale` của người nhận, nếu không có thì `DEFAULT_LOCALE`. Ngày tháng định dạng theo múi giờ của người nhận.
- **Chuỗi chữ:** mọi chuỗi đều nằm trong `messages/{en,vi}.json`, và test chặn chuỗi cứng vẫn phải pass.
- **Tách phần dựng tin:** viết một hàm thuần `buildDigest(data, locale, tz) → { text, blocks }` để test dễ. Một hàm khác `collectDigestData(db, user, since, now)` lấy dữ liệu.

**"Kể từ lần gửi trước"** là thời điểm của lần gửi `sent` gần nhất. Lần đầu tiên thì tính 24 giờ trước.

## 9. Lịch gửi và chống gửi trùng

**Bộ hẹn giờ:**
- `instrumentation-node.ts` có thêm một bộ hẹn giờ 60 giây, chạy cùng mẫu với Odoo: có `unref`, nuốt mọi lỗi, và không chạy khi `NODE_ENV=test`.
- Mỗi lần chạy giữ **advisory lock** riêng, khác khóa của Odoo, để không có hai lần chạy chồng nhau.

**Hàm `runDigestsIfDue(db, now, transport)`** xử lý như sau:
1. Thoát nếu Slack bị tắt, hoặc thiếu token hay `APP_URL`.
2. Lấy mọi người dùng **đang hoạt động** (chưa bị vô hiệu hóa) mà thiết lập hiệu lực đang bật.
3. Một người được coi là **đến hạn** khi đủ ba điều kiện:
   - hôm nay theo múi giờ của họ thuộc các ngày đã chọn;
   - giờ hiện tại theo múi giờ của họ đã bằng hoặc qua giờ gửi;
   - **chưa có** dòng `digest_deliveries` cho `(userId, localDate)`, trừ dòng `failed` còn lượt thử lại.
4. Với người đến hạn: thu thập dữ liệu, dựng tin, rồi gửi qua transport. Gửi lần lượt từng người.
5. Ghi kết quả vào bảng.

**Gửi bù:** nếu server tắt đúng giờ gửi, lần chạy đầu tiên sau khi bật lại vẫn gửi, **nhưng chỉ trong cùng ngày** theo múi giờ của người nhận. Sang ngày hôm sau thì không gửi bù ngày cũ.

**Bảng `digest_deliveries`:**
- Các cột: `id`, `userId`, `localDate` (date), `channel` (`'slack'`), `status`, `attempts`, `error`, `createdAt`, `sentAt`.
- `status` nhận một trong các giá trị `sent`, `skipped_empty`, `failed`.
- Có ràng buộc **unique `(userId, localDate, channel)`**. Mỗi lần chạy giành dòng bằng `INSERT … ON CONFLICT DO NOTHING`, nên dù có hai tiến trình cũng không gửi trùng.

**Thử lại khi lỗi:**
- Dòng `failed` được thử lại ở các lần chạy sau, **tối đa 3 lần**, mỗi lần cách nhau ít nhất 5 phút.
- Riêng lỗi ghép tài khoản (`slackUserNotFound`, `noEmail`) thì không thử lại trong ngày.

**Giới hạn tốc độ:**
- Slack trả `429` thì tôn trọng `Retry-After`. Phần còn lại của lần chạy này dừng lại và để phút sau chạy tiếp.
- Với khoảng 20 người thì gần như không bao giờ chạm giới hạn.

## 10. Lớp kênh, để mở rộng sau

```ts
interface DigestTransport {
  channel: 'slack';               // sau này: 'email' | 'telegram'
  resolveRecipient(user): Promise<string | { error: ErrorKey }>;
  send(recipient: string, msg: { text: string; blocks?: unknown }): Promise<void>;
}
```

- Slack là bản cài đặt đầu tiên, gọi `fetch` thẳng tới `https://slack.com/api/*`, không thêm SDK *(quyết định của tôi)*.
- Test dùng một **server Slack giả lập** chạy bằng `node:http`, giống cách test Odoo, nên không gọi Slack thật. URL gốc của Slack được ghi đè bằng biến môi trường chỉ dùng trong test.

## 11. Phân quyền và bảo mật

- **Cấu hình Slack:** chỉ admin được xem và sửa, phân quyền nằm trong `src/server`.
- **Thiết lập cá nhân:** chỉ chính người đó sửa được. Admin không sửa thiết lập của người khác *(quyết định của tôi)*.
- **Nội dung tin nhắn đúng phân quyền web:** phần quản lý chỉ lấy cấp dưới trực tiếp, không kế thừa, và không có việc riêng tư của người khác.
- **Dữ liệu ra ngoài:** nội dung tin (tên việc, lý do bị vướng, ghi chú) sẽ đi ra Slack, là dịch vụ bên ngoài. Tab Slack ghi rõ điều này trước khi admin bật. Mặc định toàn hệ thống là tắt.
- **Token và thông tin cá nhân** không được ghi vào log. Lỗi Slack chỉ lưu **mã lỗi** (ví dụ `invalid_auth`), không lưu nội dung phản hồi.

## 12. Ràng buộc chung

- Dùng bộ component và quy tắc i18n hiện có: `DomainError(code, key, params)`, key nằm ở namespace `errors`, `params.field` để hiện lỗi dưới ô nhập.
- Mọi thao tác ghi chạy trong transaction.
- **Docker và tài liệu:**
  - Thêm `DEFAULT_TIMEZONE` vào `.env.example` và `docker-compose.prod.yml`.
  - README cả hai ngôn ngữ ghi rằng tính năng cần `APP_URL` và `SETTINGS_ENCRYPTION_KEY`.
  - Thêm tài liệu `docs/slack-setup.md` và `docs/slack-setup.vi.md`, hướng dẫn tạo Slack app và các quyền cần cấp.
- **Test:**
  - Vitest cho:
    - `buildDigest`;
    - logic đến hạn, với các trường hợp múi giờ, ngày trong tuần, gửi bù cùng ngày và không gửi bù ngày cũ;
    - chống gửi trùng;
    - thử lại khi lỗi;
    - ghép tài khoản;
    - phân quyền nội dung (việc riêng tư, quản lý cũ, quản lý của quản lý).
  - Playwright cho:
    - tab Slack của admin, với server giả lập;
    - thẻ thiết lập cá nhân;
    - không cuộn ngang ở 375px, cả `vi` lẫn `en`.

## 13. Để lại cho người làm

- Bố cục chi tiết của Block Kit, trong khuôn khổ §8.
- Cách tổ chức file trong `src/server/digest/`.
- Thư viện múi giờ: ưu tiên `Intl` có sẵn, không thêm thư viện nếu không cần.
