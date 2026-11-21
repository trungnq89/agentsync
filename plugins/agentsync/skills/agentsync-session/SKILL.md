---
name: agentsync-session
description: Use when starting or resuming work on an existing AgentSync task, and when the member says they are done or ends the session. Checks pending feedback, identifies the current task, then reports progress, blockers or the solution summary.
---

# Phiên làm việc với AgentSync

## Khi bắt đầu hoặc tiếp tục một việc

1. Gọi `get_pending_feedback` và nhắc member các mục đang chờ (yêu cầu sửa plan, câu hỏi, câu trả lời, kết quả review). Có câu hỏi dành cho member thì hỏi member rồi trả lời bằng `answer_question`.
2. Xác định việc đang làm, theo thứ tự:
   1. Branch hiện tại (`git branch --show-current`) khớp `repoRef.branch` của một việc.
   2. Thư mục hiện tại khớp `cwdHint`.
   3. Vẫn không xác định được thì gọi `list_my_tasks` và hỏi member chọn việc.
3. Nếu quản lý yêu cầu sửa plan, soạn plan mới rồi gọi `revise_plan` (theo quy tắc `sendMode` bên dưới).

## Khi member nói xong hoặc kết thúc phiên

1. Tóm tắt trong 2–4 câu: đã làm gì, bước nào xong, phát hiện gì mới, có vướng mắc không.
2. Đính kèm bằng chứng (`evidence`): `branch` lấy từ `git branch --show-current`, `commits` từ `git rev-list --count <base>..HEAD`, `prUrl` nếu có PR.
3. Gọi `get_my_settings` để biết `sendMode`.
   - `review`: hiện bản tóm tắt cho member, CHỜ member đồng ý hoặc sửa. Sau đó gọi `update_progress` với `source` là `reviewed`.
   - `auto`: gọi `update_progress` với `source` là `auto`, rồi báo lại nội dung đã gửi.
4. Có vướng mắc cần quản lý quyết định thì gọi `report_blocker`. Câu hỏi thường thì gọi `ask_manager`.

## Khi xong việc mode project

1. Soạn tóm tắt giải pháp gồm: `problem` (vấn đề), `solution` (giải pháp), `rejectedAlternatives` (phương án đã loại), `keyChanges` (thay đổi chính), `risks` (rủi ro), `testing` (kiểm thử), thêm `prUrl` nếu có.
2. Với `sendMode` là `review`, cho member duyệt bản tóm tắt trước.
3. Gọi `submit_solution_summary`, rồi `set_task_status` với `action` là `complete`.

## Quy tắc

- KHÔNG BAO GIỜ gửi nội dung code, secret (token, mật khẩu, khóa API), hay dữ liệu khách hàng lên server. Chỉ gửi bản tóm tắt bằng lời.
- Ngày luôn dạng YYYY-MM-DD.
- Việc không hợp lệ (của người khác, đã đóng, sai id) sẽ trả lỗi kèm gợi ý `list_my_tasks`: gọi tool đó, không tự bịa id.
