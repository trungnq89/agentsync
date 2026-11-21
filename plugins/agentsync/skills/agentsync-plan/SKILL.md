---
name: agentsync-plan
description: Use when a member wants to draft a plan or create a task in AgentSync after discussing work with their manager (e.g. "lập plan cho việc X, hạn thứ 6", "tạo việc mới"). Creates the task with its plan so the manager can confirm it.
---

# Lập plan và tạo việc trên AgentSync

Dùng khi member vừa thảo luận với quản lý và muốn lập plan hoặc tạo việc mới.

## Quy tắc đầu tiên: chế độ gửi

Gọi `get_my_settings` để biết `sendMode`. Nếu `sendMode` là `review`, MỌI lần gửi từ phía member (`create_task`, `update_progress`, `revise_plan`, `report_blocker`, `ask_manager`, `submit_solution_summary`, `set_task_status`) đều phải hiện bản nháp và CHỜ member đồng ý rồi mới gọi tool. Nếu là `auto` thì gửi luôn, sau đó báo lại nội dung đã gửi.

## Các bước

1. Hỏi những gì còn thiếu, chỉ hỏi phần chưa rõ:
   - Tên việc (`title`): lấy từ lời member, nếu chưa có thì đề xuất một tên ngắn và hỏi xác nhận.
   - Kết quả đã thống nhất với quản lý (`agreedOutcome`).
   - Ngày bắt đầu (`startDate`) và hạn thống nhất (`agreedDueDate`).
   - Việc này có riêng tư không (`isPrivate`).
2. Đoán `mode`: đang trong repo git thì `project`, ngược lại `executive`. Nói rõ lựa chọn cho member để họ sửa nếu cần.
3. Soạn plan 3–8 bước (`steps`), mỗi bước một dòng ngắn, kiểm tra được.
4. Gọi `get_my_settings`.
   - `review`: hiện bản nháp (tên việc, mode, kết quả, ngày, các bước) và CHỜ member đồng ý. Chưa đồng ý thì không gọi `create_task`.
   - `auto`: chuyển thẳng sang bước 5.
5. Gọi `create_task` với `cwdHint` là đường dẫn tuyệt đối của thư mục hiện tại và `repoRef.branch` là branch hiện tại (`git branch --show-current`, nếu có repo git).
6. Báo member: việc đã tạo và đang ở trạng thái "Chờ xác nhận" để quản lý xác nhận.

## Quy tắc

- Ngày luôn dạng YYYY-MM-DD (ví dụ 2026-11-27). Đổi "thứ 6", "tuần sau" thành ngày cụ thể và nói lại cho member xác nhận.
- Không gửi code, secret, hay dữ liệu khách hàng. Chỉ gửi tên bước và tóm tắt.
- Nếu tool trả lỗi, đọc thông báo lỗi cho member, không tự thử lại âm thầm.
