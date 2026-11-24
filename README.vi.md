English: [README.md](README.md)

# AgentSync

Đừng hỏi "tiến độ tới đâu rồi?" nữa. AgentSync là ứng dụng self-host để quản lý theo dõi công việc của cả team trên một bảng, còn agent AI (Claude Code, Codex, Antigravity) của từng thành viên tự lập plan, báo cáo tiến độ ở mỗi checkpoint và đặt câu hỏi qua MCP. Đây không phải danh sách việc cần làm hay bảng kanban: mọi người vẫn làm việc trong agent của mình, còn trạng thái đến từ chính báo cáo của agent.

![Trang chủ của quản lý: danh sách cần chú ý và các tầng nhân sự](docs/screenshots/vi/home-manager-light.png)

<table>
  <tr>
    <td><img src="docs/screenshots/vi/task-detail-project.png" alt="Việc chờ review kèm tóm tắt giải pháp"><br><sub>Việc code đã xong, chờ review, kèm tóm tắt giải pháp của agent.</sub></td>
    <td><img src="docs/screenshots/vi/person-timeline.png" alt="Timeline cá nhân"><br><sub>Timeline của một người: tiến độ và tình trạng từng việc.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/vi/home-dark.png" alt="Chế độ tối"><br><sub>Giao diện tối (sáng, tối hoặc theo hệ thống, tùy từng người).</sub></td>
    <td><img src="docs/screenshots/vi/mobile-home.png" alt="Trang chủ trên điện thoại" width="280"><br><sub>Dùng được trên điện thoại.</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/screenshots/vi/admin-odoo.png" alt="Cài đặt đồng bộ Odoo HR"><br><sub>Đồng bộ Odoo HR (tùy chọn) giữ tài khoản và sơ đồ tổ chức luôn cập nhật.</sub></td>
  </tr>
</table>

> **Trạng thái:** bản phát hành sớm. Plugin agent và hook checkpoint đã có kiểm thử tự động nhưng chưa chạy thử trên bản cài thật của Claude Code, Codex hay Antigravity. Đồng bộ Odoo mới chỉ được kiểm thử với Odoo giả lập. Nếu gặp lỗi, hãy tạo issue.

Ảnh chụp dùng dữ liệu demo được tạo sẵn (xem [Dùng thử với dữ liệu demo](#dùng-thử-với-dữ-liệu-demo)).

## Tính năng

- **Bảng cho quản lý:** nhân sự chia theo cấp, danh sách "cần chú ý" (chờ xác nhận, checkpoint chờ duyệt, chờ review, đang kẹt, trễ hạn, lâu không cập nhật) và timeline từng người.
- **Plan do agent viết, quản lý xác nhận:** agent của thành viên soạn plan; quản lý trực tiếp xác nhận hoặc yêu cầu sửa. Các thay đổi plan sau đó được lưu thành các bản điều chỉnh.
- **Xác nhận checkpoint:** một bước chỉ được tính là xong khi đã được xác nhận: thành viên tự xác nhận (agent hỏi họ) hoặc quản lý trực tiếp duyệt, và quản lý chọn cách nào cho từng người. Tiến độ % là số bước đã xác nhận chia tổng số bước.
- **Hook Stop (checkpoint):** sau mỗi lượt của agent, hook nhắc agent báo cáo các bước đã xong. Hỗ trợ Claude Code, Codex và Antigravity (chưa thử trên bản cài thật).
- **MCP cho thành viên và quản lý:** agent của thành viên đồng bộ plan, tiến độ và câu hỏi; agent của quản lý đọc được bảng và gửi phản hồi.
- **Review giải pháp cho việc code:** hoàn thành việc dạng project sẽ gửi tóm tắt giải pháp (vấn đề, giải pháp, phương án đã loại, rủi ro, kiểm thử, link PR) cho quản lý review.
- **Phân quyền theo quản lý trực tiếp và việc riêng tư:** chỉ quản lý trực tiếp mới thấy việc của một người; một việc có thể để riêng tư cho chủ sở hữu.
- **Tiếng Việt và tiếng Anh, giao diện sáng và tối:** mỗi người tự chọn.
- **Đồng bộ nhân sự Odoo HR (tùy chọn):** đồng bộ chỉ đọc tài khoản và sơ đồ tổ chức từ Odoo HR.
- **Tóm tắt Slack hằng ngày (tùy chọn, mặc định tắt):** mỗi người nhận một tin nhắn riêng về những việc cần chú ý. Cần `APP_URL` và `SETTINGS_ENCRYPTION_KEY`; tên việc và ghi chú được gửi sang Slack. Cài đặt: [docs/slack-setup.vi.md](docs/slack-setup.vi.md).
- **Self-host bằng Docker:** một ứng dụng cộng Postgres; không cần dịch vụ ngoài lúc chạy, trừ khi bạn bật tích hợp Odoo hoặc Slack (tùy chọn).

## Bắt đầu nhanh (Docker)

1. Clone repository rồi vào thư mục: `git clone https://github.com/trungnq89/agentsync.git && cd agentsync` (hoặc đường dẫn admin cấp cho bản fork riêng).
2. Tạo file môi trường và điền giá trị:

   ```bash
   cp .env.example .env
   ```

   Đặt tối thiểu các giá trị sau trong `.env` (các mục dành cho phát triển trong file có thể để nguyên):

   - `POSTGRES_PASSWORD`: chỉ dùng chữ, số, `-` và `_` (được ghép vào URL cơ sở dữ liệu).
   - `APP_URL`: địa chỉ công khai, ví dụ `https://agentsync.example.com` (hiện trong hướng dẫn cấu hình MCP).
   - `SETTINGS_ENCRYPTION_KEY`: tạo bằng `openssl rand -base64 32` (cần cho đồng bộ Odoo và tóm tắt Slack; hãy giữ cẩn thận).
   - `DEFAULT_LOCALE`: `en` hoặc `vi`.
   - `COOKIE_SECURE`: để trống khi `APP_URL` là `https://`. Chỉ khi thử nội bộ qua `http://` thuần mới đặt `COOKIE_SECURE=false`, nếu không trình duyệt sẽ không giữ cookie và đăng nhập bị lặp.

3. Khởi động:

   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

4. Tạo admin đầu tiên (xem [Tạo admin đầu tiên](#tạo-admin-đầu-tiên)).
5. Mở ứng dụng (http://localhost:3000 hoặc `APP_URL` của bạn), đăng nhập, vào **Quản trị** để tạo người dùng và gán quản lý cho từng người.
6. Mỗi người vào **Cài đặt** và tạo token agent.
7. Cài plugin và kết nối agent: [docs/install-agent.vi.md](docs/install-agent.vi.md).

Container `app` tự chạy migration mỗi lần khởi động; dữ liệu nằm trong volume `pgdata`. Nếu `app` cứ khởi động lại liên tục, xem log: `docker compose -f docker-compose.prod.yml logs app`. Nếu không bật tích hợp Odoo hoặc Slack (tùy chọn), không có dịch vụ ngoài lúc chạy: không CDN, không analytics, font Inter được đóng gói sẵn.

## Dùng thử với dữ liệu demo

Bạn có thể xem một bảng đầy dữ liệu mà không đụng tới cơ sở dữ liệu thật. Script seed từ chối chạy trên mọi cơ sở dữ liệu có tên không phải `agentsync_demo` hoặc không kết thúc bằng `_demo` hay `-demo`.

```bash
cp .env.example .env
docker compose up -d --wait db                              # Postgres khi phát triển (cổng DB_PORT, mặc định 5432)
docker compose exec db createdb -U agentsync agentsync_demo
pnpm install
export DATABASE_URL=postgres://agentsync:agentsync@localhost:5432/agentsync_demo   # dùng đúng DB_PORT của bạn
pnpm db:migrate
pnpm seed:demo --lang vi --reset                           # hoặc --lang en
pnpm dev                                                   # http://localhost:3000
```

Đăng nhập bằng `linh.tran` (quản lý) hoặc `quan.nguyen` (giám đốc và admin) với mật khẩu demo chung `demo-password-123`. Mật khẩu này chỉ dành cho dữ liệu demo. Ảnh chụp trong README được tạo từ dữ liệu này bằng `pnpm screenshots --lang en|vi` khi ứng dụng chạy ở cổng 3200.

## Kết nối agent

Mỗi người dùng tạo token agent trong **Cài đặt** và cài plugin từ `plugins/agentsync` (skill, cấu hình MCP và hook checkpoint). Hướng dẫn từng bước cho Claude Code, Codex và Antigravity: [docs/install-agent.vi.md](docs/install-agent.vi.md) ([English](docs/install-agent.md)).

## Hook checkpoint

Hook `Stop` (tùy chọn) chạy sau mỗi lượt của agent. Khi agent in ra `AGENTSYNC-CHECKPOINT: <tên bước>` cho một bước mà AgentSync chưa ghi nhận là đã báo (xong hoặc đang chờ duyệt), hook nhắc agent gửi cập nhật tiến độ (chế độ gửi của bạn vẫn áp dụng: ở chế độ `review` bạn xem bản nháp trước). Đây là lớp bảo hiểm bên cạnh các skill vốn đã yêu cầu agent báo cáo từng bước. Chi tiết: mục 5 trong [docs/install-agent.vi.md](docs/install-agent.vi.md).

## Nâng cấp

1. `git pull`, rồi build lại và khởi động lại AgentSync (cơ sở dữ liệu tự migrate khi khởi động).
2. Claude Code dùng `--plugin-dir` sẽ lấy plugin mới (0.2.0) từ thư mục vừa pull. Với Codex và cách cài thay thế, hãy chép lại các skill từ `plugins/agentsync/skills`, nếu không agent vẫn dùng skill cũ và không hỏi xác nhận đúng cách.
3. Tiến độ % giờ là số bước đã xác nhận chia tổng số bước. Giá trị tiến độ nhập tay bị bỏ qua, nên một số việc có thể hiện phần trăm khác.
4. Việc đang thực hiện cần xác nhận hết các bước mới hoàn thành được. Hãy báo từng bước còn lại (thành viên xác nhận, hoặc quản lý duyệt) trước.

## Tóm tắt Slack

Quản trị > **Slack** bật việc gửi mỗi người một tin nhắn riêng hằng ngày về những việc cần chú ý. Tính năng tắt cho tới khi admin nhập bot token và bật. Mỗi người tự chọn giờ, ngày và múi giờ trong Cài đặt. Tên việc, lý do bị vướng và ghi chú được gửi sang Slack. Cài đặt đầy đủ (tạo Slack app, quyền `chat:write`, `users:read`, `users:read.email`, và bật Messages Tab trong App Home): [docs/slack-setup.vi.md](docs/slack-setup.vi.md) ([English](docs/slack-setup.md)).

## Đồng bộ nhân sự Odoo

Quản trị > **Odoo** giữ tài khoản và sơ đồ tổ chức của AgentSync khớp với danh sách nhân viên trong Odoo HR. Ứng dụng chỉ đọc từ Odoo, không bao giờ ghi.

**Thiết lập**

1. Tạo khóa mã hóa cho API key được lưu và truyền cho ứng dụng qua biến môi trường: `openssl rand -base64 32` (đặt vào `.env` là `SETTINGS_ENCRYPTION_KEY`, hoặc export trước khi chạy `docker compose -f docker-compose.prod.yml up -d`). Thiếu khóa thì trang Odoo bị khóa. Hãy giữ khóa cẩn thận: mất hoặc đổi khóa thì phải nhập lại API key.
2. Trong Odoo, tạo một người dùng riêng chỉ có quyền đọc Nhân viên, rồi tạo API key cho người dùng đó (Tùy chọn > Bảo mật tài khoản > Khóa API mới). **Người dùng này phải có quyền truy cập tất cả các công ty** cần đồng bộ: Odoo chỉ trả nhân viên của công ty hiện tại của người dùng, nên nếu chỉ chọn một công ty thì nhân viên của các công ty khác sẽ không được đồng bộ.
3. Trong Quản trị > Odoo nhập địa chỉ Odoo, cơ sở dữ liệu, tài khoản và API key, lưu, rồi bấm **Kiểm tra kết nối** (hiện số nhân viên tìm thấy).
4. Tài khoản đã có được ghép với nhân viên Odoo theo email công việc: trước tiên hãy điền email cho mọi tài khoản hiện có trong Quản trị (tài khoản chưa có email mà tên đăng nhập là email công việc cũng được ghép). Sau đó chạy xem trước ở chế độ **Duyệt từng thay đổi** và áp dụng những gì bạn chấp nhận. Chỉ sau đó mới chuyển sang Incremental hoặc Toàn bộ; chế độ Incremental không chạy cho tới khi có ít nhất một tài khoản liên kết với Odoo, nên không tạo trùng người đã có.

**Các chế độ** (đặt ở thẻ "Chế độ và lịch chạy")

- **Duyệt từng thay đổi** (mặc định): Xem trước, tick các thay đổi muốn làm rồi Áp dụng.
- **Toàn bộ**: Xem trước rồi Áp dụng mọi thay đổi. Chế độ này ghi đè tên, quản lý và cấp của các tài khoản đã liên kết bằng dữ liệu Odoo và vô hiệu hóa tài khoản không còn hoạt động trong Odoo. Tài khoản admin không bao giờ bị vô hiệu hóa và giữ nguyên quyền admin; tài khoản local không khớp ai trong Odoo thì không bị đụng tới.
- **Chỉ thêm người mới (incremental)**: chỉ tạo tài khoản cho nhân viên mới, chạy theo lịch 1, 6 hoặc 24 giờ (hoặc tắt), có thêm nút **Chạy ngay**. Bộ lập lịch chạy ngay trong tiến trình máy chủ ứng dụng (không cần cron); chỉ chạy khi ứng dụng đang hoạt động. Chế độ này cũng liên kết tài khoản đã có với nhân viên theo email. Người dùng đã bị vô hiệu hóa rồi được tuyển lại trong Odoo vẫn giữ trạng thái vô hiệu hóa: hãy bật lại thủ công.

**Tài khoản và mật khẩu.** Tài khoản mới dùng email công việc làm tên đăng nhập và có mật khẩu tạm 16 ký tự. Mật khẩu hiện một lần sau khi áp dụng (sao chép hoặc tải CSV); với lần chạy theo lịch, mật khẩu được lưu mã hóa ở mục "Mật khẩu chờ xem" cho tới khi bạn xem, rồi bị xóa. Người dùng có mật khẩu tạm đăng nhập bằng email, nhưng bị chuyển tới Cài đặt và phải đổi mật khẩu trước khi dùng bất kỳ trang nào khác.

**Chức danh.** Có thể ánh xạ chức danh Odoo sang cấp (dòng khớp đầu tiên thắng, không khớp thì là thành viên). Khi tắt ánh xạ, người mới là thành viên và cấp hiện có được giữ nguyên.

## Ngôn ngữ và giao diện

- **Ngôn ngữ:** giao diện web và nội dung MCP hỗ trợ `en` và `vi`. Đặt mặc định cho cả hệ thống bằng biến môi trường `DEFAULT_LOCALE` (`en` hoặc `vi`, mặc định `en`). Giá trị không hợp lệ sẽ dùng `en` và ghi một cảnh báo. Mỗi người dùng tự chọn ngôn ngữ trong giao diện và lựa chọn đó được ưu tiên hơn mặc định. Trên web thứ tự là: lựa chọn đã lưu của người dùng, cookie `locale`, `Accept-Language` của trình duyệt, rồi `DEFAULT_LOCALE`. Với MCP: lựa chọn đã lưu của chủ token, rồi `DEFAULT_LOCALE`.
- **Theme:** `system` (theo hệ điều hành, mặc định), `light` (sáng) hoặc `dark` (tối). Mỗi người tự chọn bằng nút chuyển theme; lựa chọn được lưu theo người dùng và áp dụng trên mọi thiết bị sau khi đăng nhập. Không có cấu hình theme chung cho cả hệ thống.

## Tham chiếu cấu hình

| Biến | Dùng bởi | Mô tả |
| --- | --- | --- |
| `DATABASE_URL` | ứng dụng, script | Chuỗi kết nối Postgres. Trong `docker-compose.prod.yml` được ghép từ `POSTGRES_PASSWORD`; khi phát triển lấy từ `.env`. |
| `POSTGRES_PASSWORD` | compose production | Bắt buộc. Mật khẩu Postgres đi kèm (chữ, số, `-`, `_`). |
| `APP_URL` | ứng dụng | Địa chỉ công khai; hiện trong hướng dẫn MCP, dùng cho liên kết trong tóm tắt Slack (bắt buộc để bật Slack) và quyết định cờ `Secure` mặc định của cookie. Mặc định `http://localhost:3000`. |
| `APP_PORT` | compose production | Cổng trên máy host của ứng dụng. Mặc định `3000`. |
| `DEFAULT_LOCALE` | ứng dụng, MCP | Ngôn ngữ mặc định cho cả hệ thống: `en` hoặc `vi` (mặc định `en`). |
| `COOKIE_SECURE` | ứng dụng | `true` hoặc `false`. Mặc định: bật khi `APP_URL` bắt đầu bằng `https://`. |
| `ALLOWED_ORIGINS` | lúc build | Các host (cách nhau bằng dấu phẩy) được gọi Server Actions khi đứng sau proxy đổi `Host`. Đổi giá trị thì phải build lại. |
| `SETTINGS_ENCRYPTION_KEY` | ứng dụng | 32 byte, base64. Mã hóa API key Odoo và bot token Slack đã lưu. Thiếu khóa thì trang Odoo và Slack bị khóa. |
| `DEFAULT_TIMEZONE` | ứng dụng | Múi giờ IANA dùng cho tóm tắt Slack cho tới khi có người chọn múi khác. Mặc định `Asia/Ho_Chi_Minh`. |
| `SLACK_DOCS_BASE_URL` | ứng dụng | Tùy chọn. Địa chỉ gốc của thư mục tài liệu đã đăng (ví dụ thư mục `docs/` của bản fork); tab Slack dẫn tới hướng dẫn cài đặt ở đó. Nếu không đặt, tab chỉ ghi đường dẫn tệp. |
| `SLACK_API_BASE` | ứng dụng (kiểm thử) | Ghi đè địa chỉ API Slack. Chỉ dùng cho kiểm thử đầu cuối. |
| `DB_PORT` | compose phát triển | Cổng trên máy host của Postgres khi phát triển. Mặc định `5432`. |

## Tạo admin đầu tiên

```bash
docker compose -f docker-compose.prod.yml exec -e SEED_ADMIN_PASSWORD='mat-khau-dai-hon-12-ky-tu' app \
  sh -c 'cd /tools && node_modules/.bin/tsx scripts/seed-admin.ts --username admin'
```

Nếu không đặt `SEED_ADMIN_PASSWORD`, script sẽ hỏi mật khẩu ở stdin. Cờ `--password` vẫn dùng được nhưng không khuyến khích (mật khẩu lộ trong lịch sử shell và danh sách tiến trình).

Đăng nhập web bằng tài khoản này, vào **Quản trị** để tạo người dùng và gán quản lý, mỗi người vào **Cài đặt** để tạo token agent.

## Phát triển

```bash
cp .env.example .env          # sửa DB_PORT và các DATABASE_URL* nếu cổng 5432 đã bị chiếm
pnpm install
docker compose up -d db       # Postgres (kèm hai DB test: agentsync_test, agentsync_e2e)
pnpm db:migrate
SEED_ADMIN_PASSWORD='mat-khau-dai-hon-12-ky-tu' pnpm seed:admin --username admin
pnpm dev                      # http://localhost:3000
```

Test dùng các cơ sở dữ liệu trong `DATABASE_URL_TEST` và `DATABASE_URL_E2E` của `.env` (được script khởi tạo của compose tạo sẵn). Kiểm tra: `pnpm test` (vitest), `pnpm e2e` (Playwright), `pnpm typecheck`, `pnpm lint`.

Kiểm tra khói MCP (tạo một việc thật, nên dùng tài khoản member tạm):

```bash
AGENTSYNC_URL=http://localhost:3000 AGENTSYNC_TOKEN=ags_... pnpm smoke:mcp
```

In `SMOKE OK` nếu thành công, thoát mã khác 0 nếu có lỗi.

## Kiến trúc

- Một ứng dụng Next.js 16 (App Router) + Postgres 16, chạy bằng Docker Compose.
- Toàn bộ nghiệp vụ là hàm thuần trong `src/server/` (nhận `db, actor, input`), mọi kiểm tra quyền đi qua `src/server/authz.ts`.
- Web (RSC + server actions, tiếng Việt và tiếng Anh) và MCP (`POST /api/mcp`, Streamable HTTP, xác thực bằng token `ags_...`) chỉ là lớp mỏng gọi vào đó.
- Schema và migration bằng Drizzle (`src/db/schema.ts`, thư mục `drizzle/`).
- Gói skill cho agent nằm ở `plugins/agentsync` (Claude Code, Codex và một mẫu cho Antigravity).

## HTTPS

Token agent và cookie phiên không được đi qua HTTP thường. Hãy đặt AgentSync sau reverse proxy có TLS và đặt `APP_URL` là địa chỉ `https://`. Với Caddy (tự cấp chứng chỉ), một `Caddyfile` là đủ:

```
agentsync.example.com {
    encode gzip
    reverse_proxy localhost:3000
}
```

Nếu `APP_URL` là `http://` trên máy không phải cục bộ, trang Cài đặt hiện cảnh báo phía trên phần token agent.

## Lưu ý bảo mật

- Dùng HTTPS khi chạy thật (reverse proxy như nginx hoặc Caddy là đủ). Cookie phiên có cờ `Secure` khi `APP_URL` bắt đầu bằng `https://`.
- Đứng sau proxy làm đổi `Host` thì đặt `ALLOWED_ORIGINS` (lúc build).
- Không commit `.env` (đã nằm trong .gitignore). Token agent (`ags_...`) chỉ hiện một lần; không dán vào chat hay commit.
- Giữ bí mật và sao lưu `SETTINGS_ENCRYPTION_KEY`: thiếu khóa thì không đọc lại được API key Odoo đã lưu.
- Container chạy bằng user `node` (không phải root). Cổng cơ sở dữ liệu không mở ra ngoài trong compose production.

## Giấy phép

MIT — xem [LICENSE](LICENSE).
