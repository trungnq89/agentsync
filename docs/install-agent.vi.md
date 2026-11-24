English: [install-agent.md](install-agent.md)

# Cài AgentSync cho agent của bạn

Mất khoảng 5 phút. Bạn cần: địa chỉ AgentSync của công ty (ví dụ `https://agentsync.example.com`) và tài khoản đăng nhập được.

## 0. Lấy thư mục plugin

Thư mục `plugins/agentsync` nằm trong mã nguồn AgentSync. Xin admin đường dẫn tải về: `<LINK_DO_ADMIN_CUNG_CAP>`. Hai cách:

- Clone: `git clone https://github.com/trungnq89/agentsync.git ~/agentsync` (hoặc `git clone <LINK_DO_ADMIN_CUNG_CAP> ~/agentsync` nếu dùng bản fork riêng), thư mục plugin là `~/agentsync/plugins/agentsync`.
- Hoặc tải file zip từ link, giải nén vào `~/agentsync`.

Các ví dụ dưới đây giả định plugin ở `/Users/ten-ban/agentsync/plugins/agentsync` (macOS). Thay `ten-ban` bằng tên tài khoản của bạn (chạy `echo $HOME` để xem), và dùng đường dẫn tuyệt đối đầy đủ.

## 1. Lấy token

1. Đăng nhập AgentSync, vào trang **Cài đặt**. Tại đây bạn cũng chọn được ngôn ngữ (en/vi) và theme (system/light/dark).
2. Tạo token agent mới. Token dạng `ags_...`, chỉ hiện một lần: copy ngay.
3. Ghi hai dòng vào `~/.agentsync-env`, giới hạn quyền để chỉ bạn đọc được, rồi nạp file này từ `~/.zshrc`:

```bash
# ~/.agentsync-env
export AGENTSYNC_URL="https://agentsync.example.com"   # không có dấu / ở cuối
export AGENTSYNC_TOKEN="ags_..."
```

```bash
chmod 600 ~/.agentsync-env
echo '[ -f ~/.agentsync-env ] && source ~/.agentsync-env' >> ~/.zshrc
```

Sau đó mở terminal mới. Không dán token vào chat hay commit vào repo.

**Phạm vi token.** Token `member` (mặc định) chỉ xem và cập nhật việc của chính bạn. Token `manager` còn duyệt và trả lời thay cho cấp dưới trực tiếp (tổng quan đội, xác nhận, yêu cầu sửa, duyệt checkpoint). Trang Cài đặt chỉ cho chọn `manager` khi bạn có cấp dưới trực tiếp. Không đổi được phạm vi sau khi tạo; cần phạm vi khác thì tạo token mới.

**Token cũ.** Token tạo trước khi có phạm vi được gắn nhãn "Token cũ, toàn quyền" trong Cài đặt: chúng hoạt động như token `manager` và hết hạn sau 90 ngày kể từ lúc nâng cấp. Hãy thay bằng token có phạm vi trước thời điểm đó.

**Hạn dùng.** Mỗi token hết hạn sau 30, 90 (mặc định) hoặc 180 ngày, chọn khi tạo. Token hết hạn hoạt động như token đã thu hồi (HTTP 401). Hãy tạo token mới trong Cài đặt rồi cập nhật `AGENTSYNC_TOKEN`. AgentSync nhắc các token sắp hết hạn trong 7 ngày trong tóm tắt Slack của bạn.

Nếu tài khoản của bạn đang dùng mật khẩu tạm, máy chủ từ chối token agent (HTTP 401) cho tới khi bạn đăng nhập AgentSync và đổi mật khẩu trong Cài đặt.

Lưu ý: biến nạp từ `~/.zshrc` (qua `~/.agentsync-env`) chỉ có hiệu lực với chương trình khởi động từ terminal. Ứng dụng desktop mở bằng cách bấm icon (Claude Desktop, Codex app) sẽ KHÔNG thấy chúng. Cách xử lý: mở ứng dụng từ terminal (ví dụ `open -a "Claude"` sau khi đã `export`), hoặc dùng bản CLI (`claude`, `codex`) trong terminal. Chưa kiểm tra cách đặt biến cố định cho ứng dụng desktop; nếu cần, hỏi admin.

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

Cách thay thế này không kèm checkpoint hook (mục 5). Dùng `--plugin-dir` để có hook.

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
- Agent luôn trả lời bạn bằng ngôn ngữ bạn đang dùng. Nội dung agent đọc từ AgentSync theo ngôn ngữ bạn chọn trong Cài đặt (hoặc ngôn ngữ mặc định của hệ thống).
- Agent chỉ gửi bản tóm tắt, không gửi code, secret hay dữ liệu khách hàng.
- Bước đã xong phải được xác nhận mới được tính. Mặc định (người xác nhận là `member`) agent tóm tắt việc đã làm và hỏi bạn "Bước X đã đạt chưa?" trước khi báo; chỉ khi bạn đồng ý bước mới thành xong. Nếu quản lý chọn tự duyệt bước của bạn (người xác nhận là `manager`), agent gửi bước đi chờ duyệt và báo bạn là đang chờ. Bước bị quản lý "Chưa đạt" quay về "đang làm" kèm ghi chú, agent nhắc ở đầu phiên sau. Tiến độ chỉ tính bước đã xác nhận, và việc chỉ hoàn thành khi mọi bước đã xong. Quản lý duyệt bằng `review_checkpoint` (một bước hoặc mọi bước đang chờ của một việc) và chọn người xác nhận cho nhân sự trực tiếp bằng `set_checkpoint_confirmer`.

## 5. Checkpoint hook

Hook `Stop` tùy chọn chạy sau mỗi lượt của agent. Nếu agent đã in `AGENTSYNC-CHECKPOINT: <tên bước>` cho một bước mà AgentSync chưa ghi là đã báo (xong hoặc đang chờ duyệt), hook nhắc agent gửi `update_progress` (chế độ gửi của bạn vẫn áp dụng: ở chế độ `review` bạn xem bản nháp trước). Hook cũng nhắc một lần để kết thúc việc khi mọi bước đã xong. Đây chỉ là lưới an toàn: skill đã dặn agent báo từng bước ngay khi xong.

- Cần Node 20 trở lên trên máy bạn. Hook là một file không phụ thuộc thư viện: `plugins/agentsync/hooks/agentsync-hook.mjs`.
- Dùng cùng biến `AGENTSYNC_URL` (địa chỉ AgentSync, ví dụ `https://agentsync.example.com`) và `AGENTSYNC_TOKEN` như mục 1. Thiếu một trong hai thì hook không làm gì.
- Tắt hook bằng `AGENTSYNC_HOOK=off` trong môi trường.
- Trạng thái và log nằm trong `~/.agentsync` (`state.json`, `hook.log`). Không lưu token hay code. Hook chờ server tối đa 3 giây và không bao giờ làm hỏng lượt chạy.
- **Claude Code:** đã nằm trong plugin (`hooks/hooks.json`); `--plugin-dir` sẽ nạp nó. Chưa kiểm tra thủ công: lúc viết không có `claude`.
- **Codex:** thêm hook `Stop` vào `~/.codex/hooks.json` và duyệt trong `/hooks`. Xem `plugins/agentsync/codex/README.md`. Codex chỉ thấy dấu nằm trong tin nhắn cuối của lượt (hãy in dấu ở đó). Chưa chạy thử với Codex thật.
- **Antigravity:** có mẫu trong `plugins/agentsync/antigravity/` (xem README trong đó). **Chưa kiểm tra thực tế** trên bản cài thật, nên hiện Antigravity dựa vào skill.

## 6. Nâng cấp

1. `git pull`, rồi build lại và khởi động lại AgentSync (cơ sở dữ liệu tự migrate khi khởi động).
2. Claude Code dùng `--plugin-dir` sẽ lấy plugin mới (0.2.0) từ thư mục vừa pull. Với Codex và cách cài thay thế, hãy chép lại các skill từ `plugins/agentsync/skills`, nếu không agent vẫn dùng skill cũ và không hỏi xác nhận đúng cách.
3. Tiến độ % giờ là số bước đã xác nhận chia tổng số bước. Giá trị tiến độ nhập tay bị bỏ qua, nên một số việc có thể hiện phần trăm khác.
4. Việc đang thực hiện cần xác nhận hết các bước mới hoàn thành được. Hãy báo từng bước còn lại (thành viên xác nhận, hoặc quản lý duyệt) trước.

## Đã kiểm tra

Đã làm:
- Test tự động (`tests/server/plugin-files.test.ts`): frontmatter của skill; mọi tên tool và tên trường nhắc trong skill đều khớp với `registerTools`; `.mcp.json` là JSON hợp lệ.
- Test hook (`tests/hooks/`): phân tích dấu (gồm cả dấu bọc bằng backtick, gạch đầu dòng, trích dẫn, in đậm), logic quyết định, và chạy script thật với server giả (im lặng khi lỗi, giới hạn 3 giây, đầu ra của Codex và Antigravity).
- Đọc tài liệu hook của Claude Code (code.claude.com/docs/en/hooks), Codex (learn.chatgpt.com/docs/hooks.md) và Antigravity (antigravity.google/docs/build-plugins).
- Đọc tài liệu Claude Code (bố cục plugin, `.mcp.json`, `--plugin-dir`) và tài liệu Codex (khóa `url`, `bearer_token_env_var`, cờ `--url`, thư mục skill) khi viết.

Chưa làm (chờ người dùng thực hiện):
- Cài thật và chạy từ đầu đến cuối trong Claude Code và Codex (cài plugin, nói "lập plan cho việc thêm API X, hạn thứ 6", thấy việc "Chờ xác nhận" trên web quản lý).
- Chạy hook thật trên từng agent (Claude Code, Codex, Antigravity): thấy lời nhắc xuất hiện sau dấu checkpoint.
- Chưa chạy thử với Codex. Chưa chạy `claude plugin validate`. Chưa kiểm tra việc mở rộng `${VAR}` trong header của `.mcp.json` trên máy thật.
