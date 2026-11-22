# AgentSync — Đồng bộ sơ đồ tổ chức từ Odoo HR

*Ngày: 2026-11-22 · Trạng thái: người dùng yêu cầu "làm luôn", các chi tiết ghi "(quyết định của tôi)" là do tôi tự chốt · Nền tảng: `main` (998dd1b)*

## 1. Mục đích

Công ty đã quản lý nhân sự và quan hệ "ai quản lý ai" trong Odoo HR. AgentSync dựa vào `managerId` để phân quyền xem báo cáo, nhưng hiện admin phải nhập tay. Tính năng này lấy nhân viên và quan hệ quản lý từ Odoo về AgentSync. Admin có **ba chế độ** để chọn cách áp dụng thay đổi.

## 2. Quyết định của người dùng

- **Ba chế độ:**
  1. **Đồng bộ mới:** lấy toàn bộ từ Odoo và ghi đè cấu trúc. Tài khoản admin của AgentSync vẫn được giữ, kể cả khi admin bên Odoo là một người khác.
  2. **Chỉ lấy thay đổi mới:** tự động, không can thiệp các thành viên đang có.
  3. **Đồng bộ có duyệt:** liệt kê thay đổi, admin tự quyết áp dụng thay đổi nào.
- **Tài khoản mới tạo từ Odoo** đăng nhập bằng **email và mật khẩu do AgentSync cấp**.
- **Ánh xạ chức danh sang cấp** (Director/Manager/Leader/Thành viên) **bật hoặc tắt được**.

## 3. Mục tiêu / Không phải mục tiêu / Phản mục tiêu

**Mục tiêu:** ba chế độ trên; ghép nhân viên với tài khoản theo email; cấp mật khẩu tạm; bắt đổi mật khẩu ở lần đăng nhập đầu; ghi nhật ký mỗi lần đồng bộ.

**Không phải mục tiêu:**
- Không làm đăng nhập bằng tài khoản Odoo (SSO).
- Không ghi dữ liệu ngược lại Odoo.
- Không đồng bộ phòng ban hay ảnh đại diện.
- Không gửi email.

**Phản mục tiêu:**
- Một lần đồng bộ làm mất quyền admin, hoặc khóa người đang dùng.
- Ghi đè cả công ty mà admin không được thấy trước.
- Lộ mật khẩu tạm hoặc API key của Odoo.
- Vòng lặp quản lý từ dữ liệu Odoo làm hỏng phân quyền.

## 4. Kết nối Odoo

- **Giao thức:** JSON-RPC `POST {url}/jsonrpc`.
  - Bước 1 `common.authenticate(db, login, apiKey, {})` trả về `uid`.
  - Bước 2 `object.execute_kw(db, uid, apiKey, 'hr.employee', 'search_read', [[]], { fields: ['id','name','work_email','parent_id','job_title','job_id','active'], context: { active_test: false } })`.
  - Chạy được với Odoo 14 đến 19 *(quyết định của tôi)*.
  - Mã kết nối đặt sau một interface `OdooClient`, để sau này đổi sang API JSON-2 của Odoo 19 trở lên mà không phải sửa chỗ khác.
- **Cấu hình** (admin nhập ở Quản trị → Odoo): URL, database, login, API key. API key được **mã hóa AES-256-GCM** bằng khóa từ biến môi trường `SETTINGS_ENCRYPTION_KEY` (32 byte, dạng base64). Thiếu biến này thì phần Odoo bị tắt kèm thông báo rõ ràng. API key không bao giờ được trả về giao diện, chỉ hiện "đã lưu".
- Có nút **"Kiểm tra kết nối"**. Kết quả trả về số nhân viên hoặc lỗi đã dịch.
- Mỗi lần gọi Odoo giới hạn thời gian 20 giây. Thông báo lỗi không được chứa API key.

## 5. Ghép và tính thay đổi

- **Ghép theo email**, chuẩn hóa `trim().toLowerCase()`:
  - Lấy `work_email` của nhân viên Odoo so với `users.email` của AgentSync.
  - Lần đầu ghép xong thì lưu `users.odooEmployeeId` để các lần sau ghép theo id.
  - Nhân viên Odoo không có email: bỏ qua và ghi vào mục "bỏ qua" của bản xem trước *(quyết định của tôi)*.
- **Các loại thay đổi**, tính bằng một hàm thuần `computeOdooDiff(odooEmployees, users, options)`:
  - `create`: nhân viên đang hoạt động, chưa có tài khoản.
  - `updateManager`: lấy `parent_id` của nhân viên, tìm nhân viên quản lý, rồi tìm tài khoản của người đó (có sẵn hoặc sắp được tạo).
  - `updateName`.
  - `updateLevel`: chỉ khi bật ánh xạ chức danh.
  - `disable`: tài khoản đã gắn với Odoo mà nhân viên tương ứng `active = false` hoặc không còn trong Odoo.
  - `skip`: kèm lý do (không có email, email trùng, quản lý tạo thành vòng lặp…).
- **Các luật an toàn** *(quyết định của tôi)*:
  - **Không bao giờ vô hiệu hóa hoặc gỡ quyền admin** của một tài khoản admin AgentSync. Admin không có trong Odoo vẫn được giữ, đúng yêu cầu của người dùng.
  - Tài khoản AgentSync tạo tay, không có email khớp với Odoo, sẽ không bị đụng tới ở bất kỳ chế độ nào. Riêng chế độ 1 liệt kê các tài khoản này dưới dạng thông tin, không vô hiệu hóa.
  - Quan hệ quản lý tạo thành vòng lặp thì bỏ qua cả nhóm đó và báo lỗi trong bản xem trước. Các quy tắc chống vòng lặp sẵn có trong `org.ts` được dùng lại.
  - Quản lý trỏ tới một nhân viên không có tài khoản (vì không có email) thì quản lý của người đó để trống, kèm cảnh báo.

## 6. Ba chế độ

| Chế độ | Kích hoạt | Áp dụng gì |
|---|---|---|
| **1. Đồng bộ mới** (`full`) | Admin bấm. Luôn hiện **bản xem trước**, rồi bấm "Áp dụng tất cả" *(quyết định của tôi)* | Mọi `create`, `updateManager`, `updateName`, `updateLevel` (khi bật), `disable` |
| **2. Chỉ thay đổi mới** (`incremental`) | **Tự động theo lịch** (admin chọn mỗi 1, 6 hoặc 24 giờ, hoặc tắt), và có nút chạy ngay | Chỉ `create`, gồm cả gán quản lý và cấp cho người mới tạo. Không đụng người đang có |
| **3. Có duyệt** (`review`) | Admin bấm | Bản xem trước có ô tick từng thay đổi, admin áp dụng những thay đổi đã chọn |

- **Lịch tự động:** chạy trong tiến trình server qua `instrumentation.ts` của Next (hàm `register` khởi động bộ hẹn giờ). Mỗi lần chạy giữ khóa trong DB (advisory lock của Postgres), để không có hai lần đồng bộ chạy chồng nhau *(quyết định của tôi)*.
- Chế độ mặc định khi mới cấu hình là **review**.

## 7. Ánh xạ chức danh

- Có công tắc bật/tắt và bảng ánh xạ do admin nhập. Mỗi dòng gồm chuỗi chức danh, so khớp không phân biệt hoa thường và theo kiểu "chứa", rồi gán cấp `director`, `manager`, `leader` hoặc `member`. Lấy dòng **đầu tiên khớp**, theo thứ tự admin sắp xếp.
- **Khi bật:** người mới được gán cấp theo bảng, không khớp dòng nào thì là `member`. Ở chế độ 1 và 3, người đang có cũng nhận thay đổi `updateLevel`.
- **Khi tắt:** người mới mặc định là `member`, và cấp của người đang có không bị đổi.
- Nguồn chức danh: `job_title`, nếu trống thì dùng tên của `job_id`.

## 8. Tài khoản, đăng nhập, mật khẩu tạm

- **Bảng `users` thêm các cột:**
  - `email`: unique, không phân biệt hoa thường, nullable
  - `odooEmployeeId`: nullable, unique
  - `mustChangePassword`: bool, mặc định false
  - `source`: `'local' | 'odoo'`, mặc định `local`
- **Tài khoản tạo từ Odoo:** `username` = email, `source = 'odoo'`, `mustChangePassword = true`. Mật khẩu tạm có 16 ký tự ngẫu nhiên, an toàn khi gõ tay.
- **Hiện mật khẩu tạm đúng một lần:** sau khi áp dụng, admin thấy danh sách email kèm mật khẩu tạm, có nút sao chép và nút tải CSV.
  - Với chế độ tự động, mật khẩu tạm lưu **đã mã hóa** trong bảng `pending_credentials`, hiện ở Quản trị cho tới khi admin mở xem, sau đó bị xóa.
  - Mật khẩu tạm không bao giờ được ghi vào log.
- **Đăng nhập:** ô đăng nhập nhận email hoặc username. Mọi thông báo lỗi vẫn giống nhau như hiện nay.
- **Bắt đổi mật khẩu:** người có `mustChangePassword = true` bị chuyển tới trang đổi mật khẩu cho tới khi đổi xong, trừ trang đăng xuất. Agent token của họ cũng không dùng được với MCP trong thời gian này *(quyết định của tôi: bắt đổi mật khẩu trước khi dùng)*.
- Admin có thể sửa email của người dùng ở form Quản trị.

## 9. Nhật ký

- Bảng `odoo_sync_runs` gồm: id, mode, trigger (`manual` hoặc `schedule`), người chạy (nếu có), thời điểm bắt đầu và kết thúc, trạng thái (`previewed`, `applied`, `failed`), số lượng theo từng loại thay đổi, lỗi (đã dịch, không chứa bí mật).
- Bản xem trước được lưu kèm run, để lúc áp dụng dùng **đúng những gì admin đã thấy**. Nếu dữ liệu đã đổi kể từ lúc xem trước, mọi thay đổi vẫn được kiểm tra lại trước khi áp dụng.
- Trang Quản trị → Odoo hiện 20 lần chạy gần nhất.

## 10. Giao diện (Quản trị → tab Odoo)

Dùng bộ component và quy tắc i18n hiện có. Nội dung trang gồm:
1. **Kết nối:** form cấu hình, nút "Kiểm tra kết nối".
2. **Chế độ và lịch:** chọn chế độ mặc định, lịch cho chế độ tự động.
3. **Ánh xạ chức danh:** công tắc bật/tắt, bảng các dòng có thêm/xóa/sắp xếp.
4. **Đồng bộ:** nút "Xem trước", rồi bảng thay đổi nhóm theo loại, có ô tick ở chế độ review, rồi "Áp dụng" (đi qua hộp xác nhận).
5. **Mật khẩu tạm chờ xem**, kèm nút sao chép và nút tải CSV.
6. **Lịch sử đồng bộ.**

Mọi chữ phải có trong cả `en` và `vi`, và test chặn chuỗi cứng vẫn phải pass.

## 11. Ràng buộc

- Mọi thao tác Odoo chỉ admin được làm. Phân quyền đặt trong `src/server`.
- Phân quyền theo quản lý trực tiếp không thay đổi.
- Test dùng một **server Odoo giả lập** bằng `node:http` (JSON-RPC), không gọi Odoo thật.
- Docker: thêm `SETTINGS_ENCRYPTION_KEY` vào `.env.example`, `docker-compose.prod.yml` và README (cả hai ngôn ngữ).
