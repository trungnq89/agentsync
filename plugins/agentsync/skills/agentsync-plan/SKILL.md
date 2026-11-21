---
name: agentsync-plan
description: Use when a member wants to draft a plan or create a task in AgentSync after discussing work with their manager (e.g. "lập plan cho việc X, hạn thứ 6", "tạo việc mới"). Creates the task with its plan so the manager can confirm it.
---

# Lập plan và tạo việc trên AgentSync

Dùng khi member vừa thảo luận với quản lý và muốn lập plan hoặc tạo việc mới.

## Các bước

1. Hỏi những gì còn thiếu, chỉ hỏi phần chưa rõ:
   - Kết quả đã thống nhất với quản lý (`agreedOutcome`).
   - Hạn thống nhất (`agreedDueDate`) và ngày bắt đầu (`startDate`).
   - Việc này có riêng tư không (`isPrivate`).
2. Đoán `mode`: đang trong repo git thì `project`, ngược lại `executive`. Nói rõ lựa chọn cho member để họ sửa nếu cần.
3. Soạn plan 3–8 bước (`steps`), mỗi bước một dòng ngắn, kiểm tra được.
4. Gọi `get_my_settings`.
   - Nếu `sendMode` là `review`: hiện bản nháp (tên việc, mode, kết quả, hạn, các bước) và CHỜ member đồng ý. Chưa đồng ý thì không gọi `create_task`.
   - Nếu `sendMode` là `auto`: gửi luôn, rồi báo lại những gì đã gửi.
5. Gọi `create_task` với `cwdHint` là thư mục hiện tại và `repoRef.branch` là branch hiện tại (nếu có repo git).
6. Báo member: việc đã tạo và đang ở trạng thái "Chờ xác nhận" để quản lý xác nhận.

## Quy tắc

- Ngày luôn dạng YYYY-MM-DD (ví dụ 2026-11-27). Đổi "thứ 6", "tuần sau" thành ngày cụ thể và nói lại cho member xác nhận.
- Không gửi code, secret, hay dữ liệu khách hàng. Chỉ gửi tên bước và tóm tắt.
- Nếu tool trả lỗi, đọc thông báo lỗi cho member, không tự thử lại âm thầm.
