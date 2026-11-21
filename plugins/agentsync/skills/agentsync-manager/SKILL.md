---
name: agentsync-manager
description: Use when a manager asks about team status, which tasks need attention, the weekly digest, or wants to confirm a plan, request changes, ask or answer a question, or review a solution summary in AgentSync.
---

# Quản lý: theo dõi và phản hồi qua AgentSync

Dùng các tool dành cho quản lý. Trả lời ngắn gọn ở mức tổng hợp; chỉ đi sâu khi quản lý hỏi.

## Chọn tool theo câu hỏi

- Tình hình team: `team_overview`.
- Việc nào cần chú ý: `needs_attention`.
- Tổng kết tuần: `weekly_digest`.
- Chi tiết một việc (plan, cập nhật, câu hỏi): `task_detail` với `taskId`.

## Hành động

- Xác nhận plan: `confirm_task`.
- Plan chưa ổn: `request_changes` với `note` nói rõ cần sửa gì.
- Hỏi member: `ask_question`.
- Trả lời vướng mắc hoặc câu hỏi của member: `answer_blocker` với `questionId` và `answer`.
- Review tóm tắt giải pháp: `review_solution` với `verdict` là `approved` hoặc `changes_needed`. `note` là bắt buộc khi `changes_needed`.

## Quy tắc

- Trước khi xác nhận, yêu cầu sửa hoặc review, nói lại ngắn gọn bạn sắp làm gì và chờ quản lý đồng ý, trừ khi họ đã ra lệnh rõ.
- Chỉ thấy việc của chính quản lý và báo cáo trực tiếp. Không thấy việc nào thì nói đúng như vậy, không đoán.
- Ngày luôn dạng YYYY-MM-DD. Không đưa code, secret hay dữ liệu khách hàng vào câu trả lời hay ghi chú.
