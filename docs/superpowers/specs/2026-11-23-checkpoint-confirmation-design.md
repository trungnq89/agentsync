# AgentSync — Xác nhận checkpoint

*Ngày: 2026-11-23 · Trạng thái: chờ duyệt · Nền tảng: `main` (106f2ea)*

## 1. Mục đích

Hiện nay agent **tự kết luận** một bước trong plan đã xong rồi báo lên. Ở chế độ gửi `auto`, không ai xác nhận. Ở chế độ `review`, member chỉ duyệt *nội dung* bản cập nhật, không có bước xác nhận riêng "bước này đã đạt".

Tính năng này bắt **mỗi checkpoint (bước trong plan) phải được một người xác nhận** trước khi tính là xong. **Quản lý trực tiếp quyết định ai xác nhận.**

## 2. Quyết định của người dùng

- **Cấu hình theo từng member.** Không có cấu hình theo việc hay theo bước.
- **Chỉ có hai lựa chọn:** `member` (member tự xác nhận) và `manager` (quản lý trực tiếp duyệt). Không có người thứ ba, nên giữ nguyên quy tắc phân quyền theo quản lý trực tiếp.
- **Mặc định là `member`.** Quản lý trực tiếp đổi được khi cần.
- **Cách xây:** server nắm trạng thái xác nhận của từng bước, không chỉ dựa vào skill.

## 3. Mục tiêu / Không phải mục tiêu / Phản mục tiêu

**Mục tiêu**
- **Chế độ `member`:** agent bắt buộc phải hỏi member "Bước X đạt chưa?" trước khi báo bước xong. Server từ chối báo bước xong nếu thiếu xác nhận của member.
- **Chế độ `manager`:** bước được báo sẽ chờ quản lý duyệt. Quản lý duyệt Đạt hoặc Chưa đạt (kèm ghi chú), trên web hoặc qua MCP.
- **Tiến độ (%), hook checkpoint và nhắc kết thúc việc** chỉ tính các bước đã được xác nhận.
- **Board hiển thị ai đã xác nhận bước, và lúc nào.**

**Không phải mục tiêu**
- Không có người duyệt thứ ba, không duyệt nhiều cấp.
- Không cấu hình riêng theo việc hay theo bước.
- Không đổi luồng xác nhận plan lúc đầu, không đổi luồng review tóm tắt giải pháp lúc cuối.

**Phản mục tiêu**
- Quản lý bị ngập trong yêu cầu duyệt mà không có cách xử lý nhanh.
- Lệch số liệu: bước chờ duyệt bị tính là xong ở chỗ này nhưng chưa xong ở chỗ khác.
- Lộ việc riêng tư hoặc mở quyền xem cho người không phải quản lý trực tiếp.

## 4. Dữ liệu

- **`users.checkpointConfirmer`:** nhận `member` hoặc `manager`, mặc định `member`, thêm qua migration. Chỉ **quản lý trực tiếp hiện tại** của người đó được đổi. Admin không đổi được *(quyết định của tôi: đây là quyết định quản lý, không phải quản trị tài khoản)*.
- **Trạng thái bước trong `planVersions.steps`:** thêm `pending_approval`, bên cạnh `todo`, `doing`, `done`. Mỗi bước thêm các trường tùy chọn:
  - `confirmedBy`: `member` hoặc `manager`;
  - `confirmedById`;
  - `confirmedAt`.
- **Bảng mới `checkpoint_reviews`:**
  - các cột: id, taskId, stepTitle, decision (`approved` / `rejected`), note, reviewerId, createdAt, consumedAt;
  - `rejected` bắt buộc có ghi chú;
  - lưu lịch sử duyệt và phản hồi cho member.

## 5. Luồng

**Người xác nhận hiệu lực của một việc:**
- Lấy theo `checkpointConfirmer` **hiện tại** của chủ việc.
- **Ngoại lệ:** nếu việc là riêng tư, hoặc chủ việc không có quản lý, thì luôn là `member` *(quyết định của tôi: không có ai khác để duyệt)*.

**Khi agent báo bước xong** (`postUpdate` với `stepsCompleted`):
- **Hiệu lực là `member`:** request phải có `memberConfirmed: true` (trường mới). Thiếu thì trả về `VALIDATION`, key `checkpointConfirmationRequired`, và không ghi gì. Có thì bước chuyển sang `done`, ghi `confirmedBy='member'`.
- **Hiệu lực là `manager`:** bước chuyển sang `pending_approval`. Trường `memberConfirmed` bị bỏ qua.
- **Bước đã `done`:** không đổi gì.

**Quản lý duyệt** (`reviewCheckpoint(db, actor, taskId, stepTitle, decision, note?)`):
- Chỉ quản lý trực tiếp hiện tại được duyệt, và bước phải đang `pending_approval`.
- **Đạt:** bước chuyển sang `done`, ghi `confirmedBy='manager'`.
- **Chưa đạt:** bước quay lại `doing`, ghi note. Note xuất hiện trong `getPendingFeedback().rejectedCheckpoints` của member cho tới khi member báo lại bước đó.

**Đổi cấu hình khi đang có bước chờ duyệt:**
- Các bước đang `pending_approval` **vẫn chờ**. Quản lý vẫn duyệt được, kể cả khi người đó đã được chuyển sang `member`.
- Riêng bước đang chờ duyệt mà member báo lại sau khi đã chuyển sang `member`, kèm `memberConfirmed`, thì được tính là `done`.
- *(Quyết định của tôi: không tự động chuyển bước, để không mất dấu vết.)*

**Đổi quản lý:** quản lý mới thừa hưởng các bước đang chờ duyệt.

**Đổi plan** (`changePlan`): các bước giữ tên thì giữ nguyên trạng thái, kể cả `pending_approval`.

**Đánh dấu xong việc** (`setTaskStatus complete`): mọi bước phải `done`. Còn bước `pending_approval` hay `todo`/`doing` thì trả về `VALIDATION`, key `stepsNotConfirmed` *(quyết định của tôi)*.

**Tiến độ %:** chỉ đếm bước `done`. Bước `pending_approval` hiện riêng, dạng "2 bước chờ duyệt".

## 6. Hook checkpoint

- API `GET /api/agent/tasks/{id}/plan` trả thêm trạng thái `pending_approval`.
- Hook coi `pending_approval` là **đã báo**, nên không nhắc agent gửi lại. Nhắc kết thúc chỉ khi **mọi** bước đã `done`.
- Bước bị Chưa đạt quay về `doing`. Nếu agent in lại dấu checkpoint cho bước đó, hook nhắc như bước mới.

## 7. Skill

`agentsync-session` thêm các hướng dẫn sau:
1. **Lấy người xác nhận:** gọi `get_my_settings` để đọc `checkpointConfirmer`, giá trị trả về đã xét ngoại lệ ở mục 5 theo từng việc. Có thể thêm `checkpointConfirmer` vào kết quả `list_my_tasks` hoặc `task_detail` cho từng việc *(builder chọn cách gọn nhất, miễn agent biết người xác nhận hiệu lực của việc đang làm)*.
2. **Khi là `member`:** sau khi xong một bước, agent tóm tắt những gì đã làm và hỏi member "Bước X đã đạt chưa?". Member đồng ý thì in dấu checkpoint rồi gọi `update_progress` với `memberConfirmed: true`. Member chưa đồng ý thì tiếp tục làm, chưa in dấu.
3. **Khi là `manager`:** in dấu và báo như hiện nay, rồi nói với member: "Bước X đã gửi quản lý duyệt."
4. **Đầu phiên:** đọc `rejectedCheckpoints` trong `get_pending_feedback` và nhắc member các bước bị trả về cùng ghi chú.
5. Chế độ gửi `review` vẫn áp dụng như cũ cho nội dung bản cập nhật.

## 8. Giao diện

- **Trang một người (`/people/[id]`)**, chỉ quản lý trực tiếp thấy: có mục "Người xác nhận checkpoint" với hai lựa chọn "Thành viên tự xác nhận" / "Tôi (quản lý) duyệt". Lưu bằng `ActionForm` và có toast.
- **Trang chủ, mục "Cần anh chú ý":** loại mới `checkpoint_pending`, ví dụ "Minh · API refund: 2 bước chờ duyệt". Có link tới việc.
- **Chi tiết việc, phần Plan:**
  - Bước `pending_approval` có badge "Chờ duyệt".
  - Quản lý có nút **Đạt** và **Chưa đạt**. "Chưa đạt" mở hộp thoại bắt buộc nhập ghi chú.
  - Bước đã `done` hiện "✓ Minh xác nhận" hoặc "✓ Quản lý duyệt" kèm thời gian.
  - Khi đang có bước chờ duyệt, plan tự mở ra thay vì thu gọn.
- **Thẻ người (PersonCard):** badge "N chờ duyệt", dùng tone info.
- Mọi chữ có cả `en` và `vi`. Màu chỉ dùng token. Không cuộn ngang ở 375px.

## 9. MCP

- **Phía member:**
  - `update_progress` thêm `memberConfirmed?: boolean`.
  - `get_my_settings` trả thêm `checkpointConfirmer`.
  - `get_pending_feedback` trả thêm `rejectedCheckpoints`.
- **Phía quản lý:**
  - `needs_attention` có thêm loại `checkpoint_pending`.
  - Tool mới `review_checkpoint({ taskId, stepTitle, decision: 'approved'|'rejected', note? })`.
  - `set_checkpoint_confirmer({ userId, confirmer })` chỉ cho quản lý trực tiếp *(quyết định của tôi: agent của quản lý cấu hình được, như mọi thao tác khác trên web)*.

## 10. Ràng buộc

- Giữ nguyên toàn bộ quy tắc phân quyền: chỉ quản lý trực tiếp hiện tại; việc riêng tư chỉ chủ việc thấy; NOT_FOUND cho người không được xem.
- Mọi thao tác ghi chạy trong transaction có khóa dòng của việc (`forUpdate`), như hiện tại.
- Migration an toàn với dữ liệu cũ: user cũ có `checkpointConfirmer = 'member'`, các bước cũ giữ nguyên trạng thái.
- Test chặn chuỗi cứng và test chuỗi hai ngôn ngữ vẫn phải pass.

## 10b. Quyết định thêm sau vòng đọc thử (quyết định của tôi)

1. **Server nắm hoàn toàn trạng thái bước.**
   - `changePlan` / `revise_plan` **bỏ qua** trạng thái `done` và `pending_approval` do agent gửi lên. Bước giữ nguyên tên thì giữ trạng thái đã lưu. Bước mới, hoặc bước đổi tên, bắt đầu từ `todo`.
   - Một bước đã xác nhận mà bị đổi tên phải được xác nhận lại.
   - Agent chỉ được tự đặt `todo` hoặc `doing`. Bước chỉ có thể thành `done` qua luồng xác nhận ở §5.
   - Schema MCP `planStep` chỉ nhận `todo` và `doing`.
2. **`progressPct` do agent gửi không còn tác dụng** đối với tiến độ hiển thị. Tiến độ luôn bằng số bước `done` chia tổng số bước, ở mọi màn hình và trong MCP. Trường này vẫn được nhận để không làm hỏng agent cũ, nhưng bị bỏ qua.
3. **Quy tắc "đánh dấu xong việc chỉ khi mọi bước đã `done`"** áp dụng cho mọi việc, kể cả executive, riêng tư và việc không có quản lý, tính từ khi phát hành.
   - Việc đã ở `awaiting_review`, `done` hoặc `closed` không bị ảnh hưởng.
   - Việc đang làm dở mà còn bước chưa xác nhận thì agent báo lại các bước đó, theo đúng luồng xác nhận.
4. **Chống quá tải cho quản lý.** Ngoài nút duyệt từng bước, quản lý có **"Duyệt tất cả bước chờ"** cho từng việc. Trên web là một nút có hộp xác nhận. Qua MCP, gọi `review_checkpoint` không kèm `stepTitle` thì áp dụng cho mọi bước đang chờ của việc đó. "Chưa đạt" vẫn chỉ làm theo từng bước, vì bắt buộc có ghi chú.
5. **`checkpointConfirmer` thuộc về member.** Khi đổi quản lý, thiết lập được giữ nguyên. Quản lý mới nhìn thấy và đổi được.

## 11. Để builder quyết định

- Tên hàm và cách hiển thị chi tiết.
- Câu chữ cụ thể của skill và giao diện.
- Cách đưa người xác nhận hiệu lực của từng việc tới agent (mục 7.1).
