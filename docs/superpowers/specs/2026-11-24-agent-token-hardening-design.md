# AgentSync — Siết bảo mật token của agent

*Ngày: 2026-11-24. Người dùng đã duyệt đề xuất ("Làm theo đề xuất"): làm điểm 2, 3, 4 và phần ghi lịch sử của điểm 1 trong bản rà soát xác thực. Các chi tiết ghi "(quyết định của tôi)" là do tôi tự chốt.*

## 1. Mục đích

Hiện tại token `ags_…` của agent có đúng quyền của người dùng trên web, không bao giờ hết hạn, và có thể bị gửi đi dưới dạng chữ thường qua HTTP. Khi mở cho cả team khoảng 20 người, cần hạn chế thiệt hại nếu một token bị lộ, hoặc nếu agent tự làm thao tác của quản lý.

**Không phải mục tiêu:**
- giới hạn số lần thử đăng nhập web;
- ghi IP hoặc thiết bị đã dùng token;
- lưu token vào keychain;
- OAuth cho MCP.

## 2. Các thay đổi

### 2.1 Phạm vi token (điểm 2)

- **Có hai phạm vi:**
  - **`member`:** chỉ làm việc của chính mình. Mặc định là phạm vi này.
  - **`manager`:** thêm các thao tác quản lý cấp dưới trực tiếp.
- **Cột mới `agent_tokens.scope`:** CHECK giá trị trong `member` hoặc `manager`. Phạm vi chọn lúc tạo token và không đổi được sau đó, muốn đổi thì tạo token mới.
- **Chỉ người đang có ít nhất một cấp dưới trực tiếp mới tạo được token `manager`.** Người không có cấp dưới chỉ thấy lựa chọn `member` *(quyết định của tôi)*.
- **Các tool MCP cần phạm vi `manager`:**
  - Mọi tool đọc hoặc ghi dữ liệu không thuộc chủ token.
  - Ví dụ: `confirm_task`, `review_solution`, `review_checkpoint`, `set_checkpoint_confirmer`, `needs_attention`, `team_overview`, `person_timeline`, `weekly_digest`, và việc hỏi member một câu hỏi.
  - Một tool vừa phục vụ việc của mình vừa phục vụ việc của người khác (ví dụ `task_detail`): với token `member`, tool chỉ trả kết quả khi việc thuộc chủ token, việc của người khác thì trả NOT_FOUND.
  - Danh sách chính xác do người làm đối chiếu với `src/mcp/tools.ts`.
- **Token `member` gọi tool cần `manager`:**
  - Tool vẫn hiện trong danh sách nhưng trả về `isError`, kèm thông báo đã dịch: "Token này chỉ có quyền member. Tạo token quản lý ở Cài đặt nếu cần."
  - Phạm vi được kiểm tra ở hai chỗ:
    - ở tầng MCP (`registerTools`);
    - bằng một actor mang `tokenScope`, để các hàm trong `src/server` cũng chặn được khi bị gọi vòng qua.
- **Token cũ** (tạo trước khi có thay đổi này) được migration gán `scope = 'manager'` để không làm hỏng các cài đặt đang chạy. Giao diện gắn nhãn "token cũ, toàn quyền" cho các token này *(quyết định của tôi)*.
- **Người dùng mất hết cấp dưới:** token `manager` vẫn còn, nhưng các thao tác quản lý đã trả NOT_FOUND như hiện nay.

### 2.2 Hạn dùng token (điểm 3)

- **Cột mới `agent_tokens.expiresAt`**, không được để trống.
- **Khi tạo token,** người dùng chọn hạn 30, 90 hoặc 180 ngày. Mặc định là **90 ngày** *(quyết định của tôi)*. Không có lựa chọn "không bao giờ hết hạn".
- **Token cũ** được migration đặt `expiresAt = now() + 90 ngày`.
- **Token quá hạn** khi xác thực bị trả 401, cùng một kiểu như token đã thu hồi.
- **Nhắc trước khi hết hạn:**
  - **Trang Cài đặt:** token có nhãn "hết hạn sau N ngày", chuyển màu cảnh báo khi còn 7 ngày hoặc ít hơn. Token đã hết hạn có nhãn "đã hết hạn".
  - **`get_my_settings`:** trả thêm hạn của token đang dùng.
  - **Slack digest:** phần "Việc của bạn" thêm dòng "Token agent `<nhãn>` hết hạn vào {ngày}" khi còn 7 ngày hoặc ít hơn (chưa thu hồi, chưa hết hạn). Dòng này tính là nội dung có giá trị, nên tin vẫn được gửi.
- **Gia hạn:** không có. Muốn tiếp tục thì tạo token mới rồi thu hồi token cũ.

### 2.3 Cảnh báo HTTP (điểm 4)

- **Trang Cài đặt, trong thẻ Token:** nếu `APP_URL` bắt đầu bằng `http://` và máy chủ không phải `localhost`, `127.0.0.1` hay `::1`, hiện cảnh báo: token sẽ được gửi đi không mã hóa, nên đặt AgentSync sau HTTPS.
- **README (cả hai ngôn ngữ) và `docs/install-agent*.md`:**
  - Thêm mục ngắn "HTTPS", gồm ví dụ reverse proxy Caddy, giữ trong khoảng 5 dòng.
  - Ghi chú rằng biến môi trường `AGENTSYNC_TOKEN` nằm dạng chữ thường trong file cấu hình shell. Gợi ý `chmod 600` cho file chứa token.

### 2.4 Ghi nguồn xác nhận (phần của điểm 1)

- **Bước của plan có thêm trường `confirmedVia: 'agent' | 'web'`,** đặt cùng lúc với `confirmedBy`:
  - Member xác nhận qua `update_progress` → `agent`.
  - Quản lý duyệt trên web → `web`.
  - Quản lý duyệt qua tool `review_checkpoint` → `agent`.
- **Giao diện chi tiết việc hiện rõ nguồn xác nhận:**
  - "✓ Minh xác nhận (qua agent)"
  - "✓ Quản lý duyệt (trên web)"
  - "✓ Quản lý duyệt (qua agent)"
- **Các bước đã xác nhận từ trước** không có trường này, nên không hiện nguồn.

## 3. Ràng buộc

- Mọi chuỗi có cả en và vi, và test chặn chuỗi cứng phải pass.
- Phân quyền đặt trong `src/server`. Mọi thao tác ghi chạy trong transaction.
- Test bắt buộc:
  - token `member` gọi `review_checkpoint` → isError, và không có gì bị đổi;
  - token hết hạn → 401 ở cả `/api/mcp` lẫn API plan;
  - token cũ sau migration vẫn dùng được với tool quản lý;
  - người không có cấp dưới không tạo được token `manager`;
  - có cảnh báo HTTP khi `APP_URL` là `http://` tới một máy khác `localhost`, không có cảnh báo khi là `http://localhost`;
  - `confirmedVia` được đặt đúng cho cả ba đường xác nhận.
- Hook không cần đổi, vì API plan chỉ trả việc của chủ token và hoạt động với cả hai phạm vi.
