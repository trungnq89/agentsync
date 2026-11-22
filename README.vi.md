English: [README.md](README.md)

# AgentSync

Ứng dụng self-host để quản lý xem tiến độ công việc của team, còn agent AI (Claude Code, Codex) của từng thành viên tự đồng bộ plan và tiến độ qua MCP.

## Kiến trúc

- Một ứng dụng Next.js 16 (App Router) + Postgres 16, chạy bằng Docker Compose.
- Toàn bộ nghiệp vụ là hàm thuần trong `src/server/` (nhận `db, actor, input`), mọi kiểm tra quyền đi qua `src/server/authz.ts`.
- Web (RSC + server actions, tiếng Việt và tiếng Anh) và MCP (`POST /api/mcp`, Streamable HTTP, xác thực bằng token `ags_...`) chỉ là lớp mỏng gọi vào đó.
- Schema và migration bằng Drizzle (`src/db/schema.ts`, thư mục `drizzle/`).
- Gói skill cho agent nằm ở `plugins/agentsync` (Claude Code + Codex).

## Ngôn ngữ và giao diện

- **Ngôn ngữ:** giao diện web và nội dung MCP hỗ trợ `en` và `vi`. Đặt mặc định cho cả hệ thống bằng biến môi trường `DEFAULT_LOCALE` (`en` hoặc `vi`, mặc định `en`). Giá trị không hợp lệ sẽ dùng `en` và ghi một cảnh báo. Mỗi người dùng tự chọn ngôn ngữ trong giao diện và lựa chọn đó được ưu tiên hơn mặc định. Trên web thứ tự là: lựa chọn đã lưu của người dùng, cookie `locale`, `Accept-Language` của trình duyệt, rồi `DEFAULT_LOCALE`. Với MCP: lựa chọn đã lưu của chủ token, rồi `DEFAULT_LOCALE`.
- **Theme:** `system` (theo hệ điều hành, mặc định), `light` (sáng) hoặc `dark` (tối). Mỗi người tự chọn bằng nút chuyển theme; lựa chọn được lưu theo người dùng và áp dụng trên mọi thiết bị sau khi đăng nhập. Không có cấu hình theme chung cho cả hệ thống.

## Chạy khi phát triển

```bash
cp .env.example .env          # sửa DB_PORT và các DATABASE_URL* nếu cổng 5432 đã bị chiếm
pnpm install
docker compose up -d db       # Postgres (kèm hai DB test: agentsync_test, agentsync_e2e)
pnpm db:migrate
SEED_ADMIN_PASSWORD='mat-khau-dai-hon-12-ky-tu' pnpm seed:admin --username admin
pnpm dev                      # http://localhost:3000
```

Kiểm tra: `pnpm vitest run`, `pnpm playwright test`, `pnpm typecheck`, `pnpm lint`.

## Triển khai (Docker Compose)

```bash
export POSTGRES_PASSWORD='doi-mat-khau-nay'        # chỉ dùng chữ, số, - và _ (được ghép vào DATABASE_URL)
export APP_URL='https://agentsync.example.com'   # địa chỉ công khai, hiện trong hướng dẫn cấu hình MCP
export DEFAULT_LOCALE=vi                         # tùy chọn: en | vi (mặc định en)
docker compose -f docker-compose.prod.yml up -d --build
```

- Container `app` tự chạy migration khi khởi động rồi mới start server. Cổng db không mở ra ngoài; dữ liệu nằm trong volume `pgdata`.
- Bắt buộc: `POSTGRES_PASSWORD`. Tùy chọn: `APP_URL`, `APP_PORT` (mặc định 3000), `ALLOWED_ORIGINS`, `DEFAULT_LOCALE`, `SETTINGS_ENCRYPTION_KEY` (đồng bộ Odoo). Không cần `SESSION_SECRET` (phiên đăng nhập là id ngẫu nhiên lưu trong DB).
- HTTPS rất nên dùng. Cookie phiên có cờ `Secure` khi `APP_URL` bắt đầu bằng `https://`; đặt `COOKIE_SECURE=false` chỉ để thử nội bộ qua HTTP thuần (nếu không, trình duyệt sẽ không giữ cookie và đăng nhập bị lặp), hoặc `COOKIE_SECURE=true` để ép bật.
- Không có dịch vụ ngoài lúc chạy: không CDN, không analytics, font Inter được đóng gói sẵn trong bản build.
- Đặt sau reverse proxy (nginx, Caddy, ...): cấp HTTPS ở proxy và chuyển tiếp tới cổng app. Nếu proxy đổi header `Host` so với `Origin` của trình duyệt, server actions sẽ bị từ chối; khi đó đặt `ALLOWED_ORIGINS` (các host cách nhau bằng dấu phẩy, ví dụ `agentsync.example.com`). Biến này được nhúng lúc build: đổi giá trị thì phải chạy lại `docker compose -f docker-compose.prod.yml up -d --build`.
- Container chạy bằng user `node` (không phải root) và có healthcheck. Nếu `app` cứ khởi động lại liên tục, xem log: `docker compose -f docker-compose.prod.yml logs app`.

## Tạo admin đầu tiên

```bash
docker compose -f docker-compose.prod.yml exec -e SEED_ADMIN_PASSWORD='mat-khau-dai-hon-12-ky-tu' app \
  sh -c 'cd /tools && node_modules/.bin/tsx scripts/seed-admin.ts --username admin'
```

Nếu không đặt `SEED_ADMIN_PASSWORD`, script sẽ hỏi mật khẩu ở stdin. Cờ `--password` vẫn dùng được nhưng không khuyến khích (mật khẩu lộ trong lịch sử shell và danh sách tiến trình).

Đăng nhập web bằng tài khoản này, vào **Quản trị** để tạo người dùng và gán quản lý, mỗi người vào **Cài đặt** để tạo token agent.

## Đồng bộ nhân sự Odoo

Quản trị > **Odoo** giữ tài khoản và sơ đồ tổ chức của AgentSync khớp với danh sách nhân viên trong Odoo HR. Ứng dụng chỉ đọc từ Odoo, không bao giờ ghi.

**Thiết lập**

1. Tạo khóa mã hóa cho API key được lưu và truyền cho ứng dụng qua biến môi trường: `openssl rand -base64 32` (đặt vào `.env` là `SETTINGS_ENCRYPTION_KEY`, hoặc export trước khi chạy `docker compose -f docker-compose.prod.yml up -d`). Thiếu khóa thì trang Odoo bị khóa. Hãy giữ khóa cẩn thận: mất hoặc đổi khóa thì phải nhập lại API key.
2. Trong Odoo, tạo một người dùng riêng chỉ có quyền đọc Nhân viên, rồi tạo API key cho người dùng đó (Tùy chọn > Bảo mật tài khoản > Khóa API mới). **Người dùng này phải có quyền truy cập tất cả các công ty** cần đồng bộ: Odoo chỉ trả nhân viên của công ty hiện tại của người dùng, nên nếu chỉ chọn một công ty thì nhân viên của các công ty khác sẽ không được đồng bộ.
3. Trong Quản trị > Odoo nhập địa chỉ Odoo, cơ sở dữ liệu, tài khoản và API key, lưu, rồi bấm **Kiểm tra kết nối** (hiện số nhân viên tìm thấy).

**Các chế độ** (đặt ở thẻ "Chế độ và lịch chạy")

- **Duyệt từng thay đổi** (mặc định): Xem trước, tick các thay đổi muốn làm rồi Áp dụng.
- **Toàn bộ**: Xem trước rồi Áp dụng mọi thay đổi. Chế độ này ghi đè tên, quản lý và cấp của các tài khoản đã liên kết bằng dữ liệu Odoo và vô hiệu hóa tài khoản không còn hoạt động trong Odoo. Tài khoản admin không bao giờ bị vô hiệu hóa và giữ nguyên quyền admin; tài khoản local không khớp ai trong Odoo thì không bị đụng tới.
- **Chỉ thêm người mới (incremental)**: chỉ tạo tài khoản cho nhân viên mới, chạy theo lịch 1, 6 hoặc 24 giờ (hoặc tắt), có thêm nút **Chạy ngay**. Bộ lập lịch chạy ngay trong tiến trình máy chủ ứng dụng (không cần cron); chỉ chạy khi ứng dụng đang hoạt động.

**Tài khoản và mật khẩu.** Tài khoản mới dùng email công việc làm tên đăng nhập và có mật khẩu tạm 16 ký tự. Mật khẩu hiện một lần sau khi áp dụng (sao chép hoặc tải CSV); với lần chạy theo lịch, mật khẩu được lưu mã hóa ở mục "Mật khẩu chờ xem" cho tới khi bạn xem, rồi bị xóa. Người dùng có mật khẩu tạm đăng nhập bằng email, nhưng bị chuyển tới Cài đặt và phải đổi mật khẩu trước khi dùng bất kỳ trang nào khác.

**Chức danh.** Có thể ánh xạ chức danh Odoo sang cấp (dòng khớp đầu tiên thắng, không khớp thì là thành viên). Khi tắt ánh xạ, người mới là thành viên và cấp hiện có được giữ nguyên.

## Kiểm tra khói MCP

Chạy từ bản checkout trên máy host sau `pnpm install`. Script tạo một việc thật, nên dùng tài khoản member tạm (throwaway), không dùng tài khoản thật.

```bash
AGENTSYNC_URL=http://localhost:3000 AGENTSYNC_TOKEN=ags_... pnpm smoke:mcp
```

Tạo một việc mới (tên có timestamp), gửi cập nhật, đọc phản hồi, liệt kê việc; in `SMOKE OK` nếu không có lỗi, thoát mã khác 0 nếu có `isError`.

## Cài cho agent

Xem [docs/install-agent.vi.md](docs/install-agent.vi.md).
