English: [slack-setup.md](slack-setup.md)

# Cài đặt tóm tắt qua Slack

Tính năng này gửi cho mỗi người một tin nhắn riêng hằng ngày, liệt kê những việc cần họ chú ý. Tính năng tắt cho tới khi admin bật. Mất khoảng 10 phút. Bạn cần: quyền quản trị workspace Slack (hoặc một admin duyệt được app), tài khoản admin AgentSync, và đã đặt `APP_URL` cùng `SETTINGS_ENCRYPTION_KEY` trên máy chủ.

> **Quyền riêng tư:** bản tóm tắt có tên việc, lý do bị vướng và ghi chú lấy từ AgentSync. Khi bật Slack, nội dung này được gửi sang Slack, một dịch vụ bên ngoài. Chỉ bật khi công ty cho phép.

## 1. Đặt biến trên máy chủ

- `APP_URL`: địa chỉ công khai của AgentSync (ví dụ `https://agentsync.example.com`). Bản tóm tắt dùng nó để tạo liên kết tới việc. Thiếu biến này thì không bật được Slack.
- `SETTINGS_ENCRYPTION_KEY`: tạo bằng `openssl rand -base64 32`. Bot token được lưu mã hóa bằng khóa này. Thiếu khóa thì tab Slack bị khóa. Nếu mất hoặc đổi khóa, hãy dán lại token.
- `DEFAULT_TIMEZONE` (tùy chọn): múi giờ IANA dùng cho tới khi admin hoặc người dùng chọn múi khác. Mặc định `Asia/Ho_Chi_Minh`.

Khởi động lại ứng dụng sau khi đổi.

## 2. Tạo Slack app nội bộ

1. Mở <https://api.slack.com/apps>, chọn **Create New App** > **From scratch**.
2. Đặt tên (ví dụ `AgentSync`) và chọn workspace của bạn.
3. Mở **OAuth & Permissions**, trong **Bot Token Scopes** thêm:
   - `chat:write` (gửi tin nhắn riêng),
   - `users:read` và `users:read.email` (tìm từng người theo email AgentSync; Slack cần cả hai).
4. Mở **App Home**, trong **Show Tabs** hãy bật **Messages Tab** (ô "Allow users to send Slash commands and messages from the messages tab" có thể để tắt). Nếu thiếu, Slack từ chối tin nhắn riêng (`messages_tab_disabled`).
5. Chọn **Install to Workspace** và đồng ý.
6. Sao chép **Bot User OAuth Token**. Token bắt đầu bằng `xoxb-`.

App không cần được thêm vào kênh nào: nó chỉ gửi tin nhắn riêng.

## 3. Kết nối trong AgentSync

1. Đăng nhập bằng admin và mở **Quản trị > Slack**.
2. Dán token vào ô **Bot token** và bấm **Lưu token**. Token được lưu mã hóa và không hiện lại.
3. Bấm **Kiểm tra kết nối**. Bạn sẽ thấy tên workspace và tên bot.
4. Chỉnh **Mặc định của công ty** (bật hay tắt, giờ gửi theo bước 15 phút, các ngày, múi giờ) rồi lưu.
5. Bấm **Gửi thử cho tôi**. Bạn sẽ nhận một tin nhắn riêng có ghi chú là tin thử. Tin thử không tính là bản tóm tắt của hôm nay.
6. Đọc thông báo về dữ liệu rời khỏi AgentSync, rồi bấm **Bật**.

## 4. Cách ghép người dùng

Mỗi người được ghép với Slack theo email của tài khoản AgentSync (không phân biệt hoa thường và bỏ khoảng trắng hai đầu). Hãy bảo đảm email của mọi người dùng trùng với email họ dùng trên Slack. Người chưa có email, hoặc có email mà Slack không biết, hiện trong bảng **Chưa ghép Slack**; hãy sửa email ở **Quản trị > Người dùng** rồi bấm **Ghép lại**. Khi đổi email, hệ thống tự ghép lại.

Mỗi người tự chỉnh bản tóm tắt của mình ở **Cài đặt > Tóm tắt Slack** (bật hay tắt, giờ, ngày, múi giờ), hoặc bấm **Dùng mặc định** để theo lại mặc định của công ty.

## Xử lý sự cố

- Mục **Lỗi gần nhất** ở tab Slack hiện vấn đề mới nhất. Lỗi "Slack từ chối bot token" nghĩa là token sai, đã bị thu hồi hoặc thiếu quyền: hãy cài lại app và lưu token mới. Sau lỗi này việc gửi tạm dừng một lúc (tab hiện "tạm dừng đến"), và lưu token mới sẽ xóa trạng thái đó.
- `messages_tab_disabled` trong lịch sử: vào App Home > Show Tabs > bật **Messages Tab**, rồi bấm **Ghép lại** hoặc chờ lần gửi sau.
- `missing_scope` trong lịch sử: bot thiếu quyền. Thêm `chat:write`, `users:read` và `users:read.email` trong OAuth & Permissions, cài lại app và lưu token mới.
- **Slack giới hạn tần suất**: việc gửi tự tạm dừng rồi tự chạy lại.
- Không có gì để báo thì không gửi (lịch sử ghi là bỏ qua).
- Lịch sử gửi ở tab liệt kê 50 lần gửi gần nhất kèm mã lỗi của Slack trong ngoặc (ví dụ `missing_scope`), không bao giờ có nội dung tin hay token.
