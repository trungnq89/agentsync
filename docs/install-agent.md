# Cài AgentSync cho agent của bạn

Mất khoảng 5 phút. Bạn cần: địa chỉ AgentSync của công ty (ví dụ `https://agentsync.example.com`) và tài khoản đã đăng nhập được.

## 1. Lấy token

1. Đăng nhập AgentSync, vào trang **Cài đặt**.
2. Tạo token agent mới. Token có dạng `ags_...` và chỉ hiện một lần: copy ngay.
3. Đặt hai biến môi trường (thêm vào `~/.zshrc` hoặc tương đương, rồi mở terminal mới):

```bash
export AGENTSYNC_URL="https://agentsync.example.com"   # không có dấu / ở cuối
export AGENTSYNC_TOKEN="ags_..."
```

Không dán token vào chat hay commit vào repo.

## 2. Claude Code

Plugin nằm ở thư mục `plugins/agentsync` của repo AgentSync (gồm 3 skill và cấu hình MCP đọc `AGENTSYNC_URL`, `AGENTSYNC_TOKEN`).

Dùng thử một phiên, không cần cài:

```bash
claude --plugin-dir ./plugins/agentsync
```

Kiểm tra: chạy `claude plugin validate ./plugins/agentsync`, rồi trong phiên chạy `/mcp` và thấy server `plugin:agentsync:agentsync` đã kết nối.

Dùng lâu dài: đưa thư mục này vào một marketplace của nhóm rồi `/plugin install agentsync@<tên-marketplace>`, hoặc copy `plugins/agentsync` vào `~/.claude/skills/agentsync` (thư mục có `.claude-plugin/plugin.json` ở đó tự tải mỗi phiên).

## 3. Codex

Xem `plugins/agentsync/codex/README.md`. Tóm tắt: copy `plugins/agentsync/skills/*` vào `~/.agents/skills/`, thêm vào `~/.codex/config.toml`:

```toml
[mcp_servers.agentsync]
url = "https://agentsync.example.com/api/mcp"
bearer_token_env_var = "AGENTSYNC_TOKEN"
```

## 4. Dùng

- Sau buổi thảo luận với quản lý: nói "lập plan cho việc thêm API X, hạn thứ 6". Việc xuất hiện "Chờ xác nhận" trên web của quản lý.
- Đầu phiên làm việc: agent nhắc phản hồi đang chờ và nhận ra việc đang làm.
- Cuối phiên: nói "xong rồi", agent tóm tắt và gửi cập nhật.
- Chế độ gửi mặc định là `review` (agent cho bạn duyệt trước khi gửi); đổi sang `auto` ở trang Cài đặt.
- Agent chỉ gửi bản tóm tắt, không gửi code, secret hay dữ liệu khách hàng.

## Đã kiểm tra

- Đã kiểm tra bằng test tự động (`tests/server/plugin-files.test.ts`): frontmatter của skill, mọi tên tool/trường được nhắc trong skill đều khớp tool đã đăng ký trong `registerTools`, `.mcp.json` hợp lệ.
- Cú pháp Claude Code và Codex đối chiếu với tài liệu chính thức hiện hành.
- CHƯA kiểm tra thủ công từ đầu đến cuối trong Claude Code và Codex (cài plugin, nói "lập plan cho việc thêm API X, hạn thứ 6", thấy việc "Chờ xác nhận" trên web quản lý). Việc này chờ người dùng thực hiện. Codex chưa được kiểm tra.
