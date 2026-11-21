# AgentSync

Ứng dụng self-host để quản lý xem tiến độ công việc của team, còn agent AI (Claude Code, Codex) của từng thành viên tự đồng bộ plan và tiến độ qua MCP.

## Kiến trúc

- Một ứng dụng Next.js 16 (App Router) + Postgres 16, chạy bằng Docker Compose.
- Toàn bộ nghiệp vụ là hàm thuần trong `src/server/` (nhận `db, actor, input`), mọi kiểm tra quyền đi qua `src/server/authz.ts`.
- Web (RSC + server actions, tiếng Việt) và MCP (`POST /api/mcp`, Streamable HTTP, xác thực bằng token `ags_...`) chỉ là lớp mỏng gọi vào đó.
- Schema và migration bằng Drizzle (`src/db/schema.ts`, thư mục `drizzle/`).
- Gói skill cho agent nằm ở `plugins/agentsync` (Claude Code + Codex).

## Chạy khi phát triển

```bash
cp .env.example .env          # sửa DB_PORT và các DATABASE_URL* nếu cổng 5432 đã bị chiếm
pnpm install
docker compose up -d db       # Postgres (kèm hai DB test: agentsync_test, agentsync_e2e)
pnpm db:migrate
pnpm seed:admin --username admin --password 'mat-khau-dai-hon-12-ky-tu'
pnpm dev                      # http://localhost:3000
```

Kiểm tra: `pnpm vitest run`, `pnpm playwright test`, `pnpm typecheck`, `pnpm lint`.

## Triển khai (Docker Compose)

```bash
export POSTGRES_PASSWORD='doi-mat-khau-nay'        # chỉ dùng chữ, số, - và _ (được ghép vào DATABASE_URL)
export APP_URL='https://agentsync.example.com'   # địa chỉ công khai, hiện trong hướng dẫn cấu hình MCP
docker compose -f docker-compose.prod.yml up -d --build
```

- Container `app` tự chạy migration khi khởi động rồi mới start server. Cổng db không mở ra ngoài; dữ liệu nằm trong volume `pgdata`.
- Bắt buộc: `POSTGRES_PASSWORD`. Tùy chọn: `APP_URL`, `APP_PORT` (mặc định 3000), `ALLOWED_ORIGINS`. Không cần `SESSION_SECRET` (phiên đăng nhập là id ngẫu nhiên lưu trong DB).
- Không có dịch vụ ngoài lúc chạy: không CDN, không analytics, dùng font hệ thống.
- Đặt sau reverse proxy (nginx, Caddy, ...): cấp HTTPS ở proxy và chuyển tiếp tới cổng app. Nếu proxy đổi header `Host` so với `Origin` của trình duyệt, server actions sẽ bị từ chối; khi đó đặt `ALLOWED_ORIGINS` (các host cách nhau bằng dấu phẩy, ví dụ `agentsync.example.com`). Biến này được nhúng lúc build: đổi giá trị thì phải chạy lại `docker compose -f docker-compose.prod.yml up -d --build`.
- Container chạy bằng user `node` (không phải root) và có healthcheck. Nếu `app` cứ khởi động lại liên tục, xem log: `docker compose -f docker-compose.prod.yml logs app`.

## Tạo admin đầu tiên

```bash
docker compose -f docker-compose.prod.yml exec app \
  sh -c 'cd /tools && node_modules/.bin/tsx scripts/seed-admin.ts --username admin --password "mat-khau-dai-hon-12-ky-tu"'
```

Đăng nhập web bằng tài khoản này, vào **Quản trị** để tạo người dùng và gán quản lý, mỗi người vào **Cài đặt** để tạo token agent.

## Kiểm tra khói MCP

Chạy từ bản checkout trên máy host sau `pnpm install`. Script tạo một việc thật, nên dùng tài khoản member tạm (throwaway), không dùng tài khoản thật.

```bash
AGENTSYNC_URL=http://localhost:3000 AGENTSYNC_TOKEN=ags_... pnpm smoke:mcp
```

Tạo một việc mới (tên có timestamp), gửi cập nhật, đọc phản hồi, liệt kê việc; in `SMOKE OK` nếu không có lỗi, thoát mã khác 0 nếu có `isError`.

## Cài cho agent

Xem [docs/install-agent.md](docs/install-agent.md).
