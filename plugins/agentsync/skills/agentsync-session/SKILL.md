---
name: agentsync-session
description: Use when starting or resuming work on an existing AgentSync task, and when the member says they are done or ends the session. Checks pending feedback, identifies the current task, then reports progress, blockers or the solution summary.
---

# Phiên làm việc với AgentSync

## Quy tắc đầu tiên: chế độ gửi

Gọi `get_my_settings` để biết `sendMode`. Nếu `sendMode` là `review`, MỌI lần gửi từ phía member (`create_task`, `update_progress`, `revise_plan`, `report_blocker`, `ask_manager`, `answer_question`, `submit_solution_summary`, `set_task_status`) đều phải hiện bản nháp và CHỜ member đồng ý rồi mới gọi tool. Nếu là `auto` thì gửi luôn, sau đó báo lại nội dung đã gửi.

## Khi bắt đầu hoặc tiếp tục một việc

1. Gọi `get_pending_feedback` và nhắc member các mục đang chờ (yêu cầu sửa plan, câu hỏi, câu trả lời, kết quả review). Có câu hỏi dành cho member thì hỏi member rồi trả lời bằng `answer_question`.
2. Xác định việc đang làm: gọi `list_my_tasks` trước. Đối chiếu branch hiện tại (`git branch --show-current`) với `repoRef.branch`; nếu không khớp thì đối chiếu thư mục hiện tại với `cwdHint`. Nếu không có đúng một việc khớp, hỏi member chọn. Không bao giờ đoán từ tên việc.
3. Nếu quản lý yêu cầu sửa plan, soạn plan mới rồi gọi `revise_plan` (theo quy tắc `sendMode`).
4. Nếu kết quả review là `changes_needed`: sửa theo ghi chú, rồi chạy lại `submit_solution_summary` (gửi lại sẽ ghi đè bản cũ) và `set_task_status` với `action` là `complete`.

## Khi member nói xong hoặc kết thúc phiên

1. Tóm tắt trong 2–4 câu: đã làm gì, bước nào xong, phát hiện gì mới, có vướng mắc không. Đặt phần tóm tắt vào `body`.
2. Các bước vừa xong: điền vào `stepsCompleted`, dùng đúng tên bước như trong plan của việc (xem bằng `task_detail` nếu cần, không tự đặt tên khác).
3. Bằng chứng (`evidence`): `branch` từ `git branch --show-current`; `commits` là kết quả `git rev-list --count <base>..HEAD`, với `<base>` là kết quả `git merge-base HEAD origin/main` (thử `origin/master` nếu không có). Không xác định được base thì bỏ `commits`. Thêm `prUrl` nếu có PR.
4. Gọi `update_progress`: `source` là `reviewed` nếu member đã duyệt bản nháp, `auto` nếu `sendMode` là `auto`.
5. Có vướng mắc cần quản lý quyết định thì gọi `report_blocker`. Câu hỏi thường thì gọi `ask_manager`.

## Khi xong việc mode project

1. Soạn tóm tắt giải pháp gồm: `problem` (vấn đề), `solution` (giải pháp), `rejectedAlternatives` (phương án đã loại), `keyChanges` (thay đổi chính), `risks` (rủi ro), `testing` (kiểm thử), thêm `prUrl` nếu có.
2. Gọi `submit_solution_summary`, rồi `set_task_status` với `action` là `complete` (theo quy tắc `sendMode`: với `review` thì cho member duyệt trước).

## Quy tắc

- KHÔNG BAO GIỜ gửi nội dung code, secret (token, mật khẩu, khóa API), hay dữ liệu khách hàng lên server. Chỉ gửi bản tóm tắt bằng lời.
- Ngày luôn dạng YYYY-MM-DD.
- Việc không hợp lệ (của người khác, đã đóng, sai id) sẽ trả lỗi kèm gợi ý `list_my_tasks`: gọi tool đó, không tự bịa id.
