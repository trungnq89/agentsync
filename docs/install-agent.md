# Cài AgentSync cho agent của bạn

Mất khoảng 5 phút. Bạn cần: địa chỉ AgentSync của công ty (ví dụ `https://agentsync.example.com`) và tài khoản đăng nhập được.

## 0. Lấy thư mục plugin

Thư mục `plugins/agentsync` nằm trong mã nguồn AgentSync. Xin admin đường dẫn tải về: `<LINK_DO_ADMIN_CUNG_CAP>`. Hai cách:

- Clone: `git clone <LINK_DO_ADMIN_CUNG_CAP> ~/agentsync`, thư mục plugin là `~/agentsync/plugins/agentsync`.
- Hoặc tải file zip từ link, giải nén vào `~/agentsync`.

Các ví dụ dưới đây giả định plugin ở `/Users/ten-ban/agentsync/plugins/agentsync` (macOS). Thay `ten-ban` bằng tên tài khoản của bạn (chạy `echo $HOME` để xem), và dùng đường dẫn tuyệt đối đầy đủ.

## 1. Lấy token

1. Đăng nhập AgentSync, vào trang **Cài đặt**.
2. Tạo token agent mới. Token dạng `ags_...`, chỉ hiện một lần: copy ngay.
3. Thêm hai dòng vào `~/.zshrc`, rồi mở terminal mới:

```bash
export AGENTSYNC_URL="https://agentsync.example.com"   # không có dấu / ở cuối
export AGENTSYNC_TOKEN="ags_..."
```

Không dán token vào chat hay commit vào repo.

Lưu ý: biến trong `~/.zshrc` chỉ có hiệu lực với chương trình khởi động từ terminal. Ứng dụng desktop mở bằng cách bấm icon (Claude Desktop, Codex app) sẽ KHÔNG thấy chúng. Cách xử lý: mở ứng dụng từ terminal (ví dụ `open -a "Claude"` sau khi đã `export`), hoặc dùng bản CLI (`claude`, `codex`) trong terminal. Chưa kiểm tra cách đặt biến cố định cho ứng dụng desktop; nếu cần, hỏi admin.

## 2. Claude Code

Cách chính: nạp plugin bằng `--plugin-dir` (dùng đường dẫn tuyệt đối) mỗi lần khởi động từ terminal, để có biến môi trường:

```bash
claude --plugin-dir /Users/ten-ban/agentsync/plugins/agentsync
```

Kiểm tra: gõ `/mcp`, thấy server AgentSync đã kết nối. Tên có thể hiện là `agentsync` hoặc `plugin:agentsync:agentsync`.

Cách thay thế (chưa kiểm tra thủ công): không dùng `--plugin-dir`, copy từng skill vào thư mục skill cá nhân và thêm MCP server bằng lệnh:

```bash
mkdir -p ~/.claude/skills
cp -R /Users/ten-ban/agentsync/plugins/agentsync/skills/* ~/.claude/skills/
claude mcp add --transport http agentsync https://agentsync.example.com/api/mcp --header "Authorization: Bearer $AGENTSYNC_TOKEN"
```

## 3. Codex

Xem `plugins/agentsync/codex/README.md`. Tóm tắt: copy `/Users/ten-ban/agentsync/plugins/agentsync/skills/*` vào `~/.agents/skills/`, thêm vào `~/.codex/config.toml`:

```toml
[mcp_servers.agentsync]
url = "https://agentsync.example.com/api/mcp"
bearer_token_env_var = "AGENTSYNC_TOKEN"
```

## 4. Dùng

- Sau buổi thảo luận với quản lý: nói "lập plan cho việc thêm API X, hạn thứ 6". Việc xuất hiện "Chờ xác nhận" trên web của quản lý.
- Đầu phiên làm việc: agent nhắc phản hồi đang chờ và nhận ra việc đang làm.
- Cuối phiên: nói "xong rồi", agent tóm tắt và gửi cập nhật.
- Chế độ gửi mặc định là `review`: agent cho bạn duyệt trước mọi lần gửi. Đổi sang `auto` ở trang Cài đặt.
- Agent chỉ gửi bản tóm tắt, không gửi code, secret hay dữ liệu khách hàng.

## Đã kiểm tra

Đã làm:
- Test tự động (`tests/server/plugin-files.test.ts`): frontmatter của skill; mọi tên tool và tên trường nhắc trong skill đều khớp với `registerTools`; `.mcp.json` là JSON hợp lệ.
- Đọc tài liệu Claude Code (bố cục plugin, `.mcp.json`, `--plugin-dir`) và tài liệu Codex (khóa `url`, `bearer_token_env_var`, cờ `--url`, thư mục skill) khi viết.

Chưa làm (chờ người dùng thực hiện):
- Cài thật và chạy từ đầu đến cuối trong Claude Code và Codex (cài plugin, nói "lập plan cho việc thêm API X, hạn thứ 6", thấy việc "Chờ xác nhận" trên web quản lý).
- Chưa chạy thử với Codex. Chưa chạy `claude plugin validate`. Chưa kiểm tra việc mở rộng `${VAR}` trong header của `.mcp.json` trên máy thật.
