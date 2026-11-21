# AgentSync — Thiết kế

*Ngày: 2026-11-21 · Trạng thái: chờ duyệt*

## 1. Mục đích và lý do

Quản lý trong một tổ chức khoảng 20 người hiện phải hỏi trực tiếp từng member ba câu: **tiến độ đến đâu, bao giờ xong, có vướng mắc gì**. Member hiện đã dùng agent (Claude Code, Codex) để lập kế hoạch và làm việc. AgentSync biến chính các phiên làm việc đó thành báo cáo: khi member lập plan hoặc làm tiếp một việc, agent tự tổng hợp và đẩy lên một board. Quản lý đọc board, hoặc để agent của mình đọc qua MCP, thay vì hỏi.

Đây **không phải** todo list hay Kanban. Đây là một **kênh báo cáo thụ động**: member không nhập liệu, quản lý chỉ đọc và xác nhận.

## 2. Mục tiêu / Không phải mục tiêu / Phản mục tiêu

**Mục tiêu**
- Quản lý trả lời được ba câu hỏi trên trong vài giây mà không cần hỏi member.
- Member gần như không tốn công thêm: agent lo việc tạo việc, lập plan và cập nhật.
- Hai mode:
  - **Mode 1, không code:** chỉ báo tiến độ và kết quả.
  - **Mode 2, có code:** thêm "Tóm tắt giải pháp" khi xong để leader review.
- Hai dạng báo cáo: **web** cho người đọc, **MCP** cho agent của quản lý đọc.
- Self-host.

**Không phải mục tiêu**
- Không làm công cụ giao việc hay quản lý dự án chi tiết (không kéo thả thẻ, không sprint, không ước lượng story point).
- Không chấm công, không đo năng suất theo giờ.
- Không thay Odoo hay hệ thống HR.

**Phản mục tiêu** (vẫn chạy nhưng coi là thất bại)
- Giao diện rối, quản lý cấp cao phải bấm nhiều lớp mới thấy tình hình. **UI phải đơn giản và mặc định ở mức tổng hợp.**
- Member cảm thấy bị giám sát rồi tìm cách né (tắt skill, báo cáo cho có). Member phải kiểm soát được những gì được gửi lên.
- Báo cáo "tô hồng" không có căn cứ. Mode 2 phải kèm bằng chứng từ repo.

## 3. Người dùng và phân quyền

- Có ba cấp hiển thị: **Director → Manager → Leader**, theo bản vẽ của người dùng. Ai cũng có thể là member (người làm việc) và là quản lý (người đọc).
- **Phân quyền theo quan hệ quản lý trực tiếp, không kế thừa.** A xem được báo cáo của B khi và chỉ khi A là quản lý trực tiếp của B. Director không xem được việc của một Leader nếu không quản lý trực tiếp Leader đó. Ai cũng xem được việc của chính mình.
- Quy tắc này áp dụng giống hệt cho web và cho MCP.
- **Tầng hiển thị lấy theo chức danh** (trường `level` do admin đặt), không theo vị trí trong cây. Người không thuộc ba cấp trên được xếp vào tầng thứ tư **"Thành viên"**. Vì không kế thừa, Director thường chỉ thấy tầng Manager. Bức tranh tổng hợp cấp dưới đến từ chính các việc và báo cáo của Manager. Bản vẽ ba tầng chỉ hiện đủ khi một người quản lý trực tiếp nhiều cấp. *(Quyết định của tôi.)*
- **Khi đổi quản lý:** quyền xem và quyền xác nhận/review luôn theo `manager_id` **hiện tại**. Quản lý mới thấy toàn bộ việc đang mở và lịch sử. Quản lý cũ mất quyền xem. Người xác nhận lưu trong Task chỉ là thông tin lịch sử. *(Quyết định của tôi.)*
- **Người không có quản lý** (ví dụ Director cao nhất): việc được tự xác nhận và không cần review. Việc vẫn hiển thị cho chính người đó. *(Quyết định của tôi.)*
- **Quản lý vắng mặt hoặc ủy quyền:** ngoài phạm vi giai đoạn 1. Việc chờ xác nhận sẽ cứ chờ, member vẫn làm và gửi cập nhật bình thường.
- Có một vai trò **Admin** (cấu hình hệ thống, quản lý tài khoản và sơ đồ tổ chức). Admin **không** được tự động xem báo cáo của mọi người. *(Quyết định của tôi, để giữ đúng tinh thần "không kế thừa". Đổi được nếu người dùng muốn.)*

## 4. Vòng đời một việc

```
Member thảo luận với quản lý → member nhờ agent "lập plan cho việc X"
  → agent tạo Việc + Plan → CHỜ XÁC NHẬN (gửi tới quản lý trực tiếp của member)
      → quản lý Xác nhận ─────────────────→ ĐANG LÀM
      → quản lý Yêu cầu sửa (kèm ghi chú) → agent đọc ở phiên sau, sửa, gửi lại
ĐANG LÀM ── các phiên làm việc: cập nhật tiến độ / vướng mắc / đổi plan
  → Mode 1: XONG
  → Mode 2: XONG – CHỜ REVIEW → quản lý "Đã review" → ĐÓNG  (hoặc "Cần sửa" → ĐANG LÀM)
Bất kỳ lúc nào: TẠM DỪNG / HỦY. Member tự chuyển trạng thái, không cần quản lý duyệt, kèm lý do bắt buộc.
  Việc chuyển trạng thái này hiện trong mục "Cần anh chú ý" của quản lý. (Quyết định của tôi.)
```

- **Việc do agent của member tạo. Quản lý chỉ xác nhận.** Board không có màn hình giao việc.
- **Người nhận báo cáo** được server xác định tự động từ sơ đồ tổ chức.
- **Mode gắn với từng việc, không theo chức danh.** Agent tự đoán (đang làm trong một repo git thì là mode 2), member sửa được.
- **Đổi plan** sau khi đã xác nhận: lưu thành phiên bản mới kèm lý do và hiển thị trên board. *(Quyết định của tôi: đổi plan không cần xác nhận lại. Riêng đổi hạn hoàn thành thì việc được đánh dấu "trễ" và hiện vào mục cần chú ý.)*

### 4.1 Sửa nội dung đã gửi và việc riêng tư

Quyết định của người dùng:
- **Mode 1 (quản lý cấp cao):** member được sửa plan bất kỳ lúc nào.
- **Mode 2 (team dự án):** plan bị khóa sau 24 giờ kể từ khi gửi. Sau thời điểm đó, muốn thay đổi thì phải tạo phiên bản plan mới kèm lý do (`revise_plan`).
- **Cho phép việc riêng tư.**

Quyết định của tôi:
- Sửa plan ở mode 1 vẫn lưu lịch sử phiên bản. Quản lý thấy được "plan đã sửa" và xem được bản trước.
- Cập nhật và vướng mắc (ở cả hai mode) được sửa trong 24 giờ, có nhãn "đã sửa", sau đó bị khóa. Không được xóa, trừ khi nằm trong việc riêng tư.
- **Việc riêng tư:**
  - Do member đánh dấu khi tạo, không qua bước xác nhận.
  - Quản lý không thấy, và việc này không được tính vào số liệu trên thẻ.
  - Không xuất hiện trong MCP của quản lý.
  - Member có thể chuyển một việc riêng tư thành công khai. Khi đó việc chuyển sang trạng thái CHỜ XÁC NHẬN như việc bình thường.
  - Không được chuyển ngược từ công khai sang riêng tư.

## 5. Mô hình dữ liệu (khái niệm)

- **User**: tên, avatar, cấp hiển thị (Director/Manager/Leader), `manager_id` (quản lý trực tiếp), vai trò admin.
- **Task**: tiêu đề, chủ sở hữu, người xác nhận (snapshot quản lý lúc tạo), mode, trạng thái, kết quả đã thống nhất, ngày bắt đầu, hạn đã thống nhất, ngày dự kiến xong hiện tại, % tiến độ, mức sức khỏe (đúng hạn / rủi ro / kẹt).
- **PlanVersion**: danh sách bước (tiêu đề, trạng thái), lý do thay đổi, thời điểm.
- **Update**: bản tóm tắt của một phiên làm việc, gồm nội dung, bước đã xong, nguồn gửi (tự động hay member đã duyệt), thời điểm, bằng chứng (mode 2: branch, commit, PR). **Giai đoạn 1 chỉ lưu những gì agent báo, server không tự kiểm tra với hệ thống git.** Việc kiểm tra (GitLab/GitHub/Gitea) để sang giai đoạn 2. *(Quyết định của tôi, người dùng chưa chọn.)*
- Task có thêm cờ `is_private`.
- **Blocker / Question**: nội dung, ai cần quyết, trạng thái (mở / đã trả lời / đã xong). Có hai chiều: member hỏi quản lý, hoặc quản lý hỏi member.
- **SolutionSummary** (chỉ mode 2): vấn đề, giải pháp, phương án đã loại, thay đổi chính, rủi ro, kiểm thử, liên kết PR. Có kết quả review: đã review hoặc cần sửa, kèm ghi chú.
- **AgentToken**: token cấp cho agent của mỗi user, thu hồi được.

## 6. Giao diện web

Nguyên tắc: **đơn giản, mặc định ở mức tổng hợp, chi tiết chỉ hiện khi bấm vào.** Mockup tham khảo nằm trong `.superpowers/brainstorm/`.

**6.1 Trang chủ** (theo bản vẽ của người dùng)
- Trên cùng là mục **"Cần anh chú ý"**, gồm việc chờ xác nhận, chờ review, đang kẹt, trễ hạn, hoặc quá N ngày không có cập nhật. Mục này ẩn khi không có gì.
- Bên dưới là ba tầng **Director / Manager / Leader**. Mỗi người là một thẻ gồm:
  - avatar, tên;
  - "X việc xong · Y việc đang làm";
  - huy hiệu (đỏ: có việc kẹt, xanh: có việc chờ review);
  - "cập nhật lúc…".
- Chỉ hiển thị những người mà người xem quản lý trực tiếp, cộng với thẻ của chính người xem. Tầng nào không có ai thì ẩn.
- "Việc xong" tính trong một khoảng thời gian mặc định (đề xuất: 30 ngày gần nhất).

**6.2 Trang một người:** dòng thời gian các việc. Mỗi việc là một thanh từ ngày bắt đầu đến hạn, phần tô đậm là % tiến độ, có vạch "hôm nay", việc kẹt tô đỏ, việc xong tô xanh. Bấm vào thanh để mở chi tiết.

**6.3 Chi tiết việc**, theo thứ tự ưu tiên hiển thị:
1. Tiêu đề, trạng thái, % tiến độ, ngày dự kiến xong (có ghi nếu trễ), thời điểm cập nhật gần nhất.
2. Kết quả đã thống nhất.
3. Vướng mắc / cần quyết định, có ô để quản lý trả lời hoặc đặt câu hỏi.
4. *(Mode 2)* Tóm tắt giải pháp, nút "Đã review / Cần sửa", liên kết PR.
5. Plan: mặc định thu gọn thành một dòng "3/5 bước", bấm để mở. Có ghi chú khi plan đã đổi.
6. Diễn biến: mặc định hiển thị 3 mục gần nhất.

Với việc chờ xác nhận: nút **Xác nhận** và **Yêu cầu sửa** nằm ở đầu trang.

**6.4 Trang cá nhân / cài đặt:** quản lý token agent, chọn chế độ gửi (tự động hay duyệt trước khi gửi), đổi mật khẩu.

**6.5 Admin:** tài khoản, sơ đồ tổ chức (nhập tay hoặc đồng bộ từ Odoo), cấu hình ngưỡng "lâu không cập nhật".

## 7. Tích hợp agent

**7.1 MCP server** (remote, Streamable HTTP, xác thực bằng Bearer token của từng user), chạy cùng ứng dụng web.

*Công cụ cho member:*
- `list_my_tasks`
- `create_task`: tạo việc kèm plan, mode và hạn. Việc tạo ra ở trạng thái chờ xác nhận.
- `update_progress`: tóm tắt phiên làm việc, bước đã xong, % tiến độ, ngày dự kiến xong, bằng chứng.
- `revise_plan`: kèm lý do.
- `report_blocker` / `answer_question`
- `submit_solution_summary` (mode 2)
- `get_pending_feedback`: lấy ghi chú "yêu cầu sửa", câu hỏi của quản lý và kết quả review đang chờ member xử lý.

*Công cụ cho quản lý* (cùng phân quyền như web):
- `team_overview`
- `needs_attention`
- `task_detail`
- `weekly_digest`
- `confirm_task` / `request_changes`
- `answer_blocker` / `ask_question`
- `review_solution`

Định dạng trả về cho quản lý: Markdown ngắn gọn để agent đọc trực tiếp, kèm JSON có cấu trúc.

**7.2 Gói skill** (một bộ SKILL.md dùng chung cho Claude Code và Codex, cả hai đều đọc được định dạng này)
- **Lập plan:** sau khi member mô tả việc đã thảo luận, agent lập plan, cho member xem, rồi gọi `create_task`.
- **Bắt đầu phiên:** khi member làm tiếp một việc, agent gọi `get_pending_feedback` và nhắc member các câu hỏi hoặc yêu cầu sửa đang chờ.
- **Kết thúc phiên / xong việc:** tóm tắt, rồi gửi `update_progress`. Với mode 2 khi xong việc thì gửi thêm `submit_solution_summary`.
- **Chế độ gửi:** đọc cấu hình của member. Nếu member chọn "duyệt trước", agent hiển thị bản nháp và chờ member đồng ý trước khi gửi. Việc duyệt diễn ra **ngay trong phiên agent, phía máy member**. Server không lưu bản nháp, chỉ ghi nhận cờ "tự động" hay "đã duyệt" cho mỗi cập nhật. *(Quyết định của tôi.)*
- **Liên kết phiên với việc:** ưu tiên theo branch hoặc thư mục đã gắn với việc. Nếu không xác định được, agent hỏi member chọn trong `list_my_tasks`.

**7.3 Hook** (chỉ là phần bổ sung, không phải nền móng): với Claude Code, thêm hook khi kết thúc phiên để nhắc agent gửi cập nhật nếu phiên đó có làm việc trên một task mà chưa gửi. Hook của Codex chưa ổn định và phải cấu hình tay, nên chỉ hỗ trợ ở giai đoạn sau.

**7.4 Cài đặt cho member:** một plugin hoặc gói cài đặt cho mỗi agent, gồm skill và cấu hình MCP (URL + token). Có hướng dẫn một trang.

## 8. Đăng nhập và Odoo

- **Giai đoạn 1:** tài khoản username/password do admin tạo. Mật khẩu được băm.
- **Giai đoạn 2:** đăng nhập qua Odoo theo chuẩn OIDC. Odoo không có sẵn chức năng làm IdP. Có hai lựa chọn:
  - module thương mại `ekika_oauth2_provider_openid`;
  - đặt Keycloak ở giữa.
  
  Chọn cách nào sẽ quyết định ở giai đoạn 2. Phần đăng nhập phải thiết kế sao cho cắm thêm OIDC mà không phải viết lại.
- **Sơ đồ tổ chức:** có thể đồng bộ một chiều từ Odoo HR (`hr.employee.parent_id`) qua API của Odoo, chạy định kỳ. Nếu không có Odoo HR thì admin nhập tay.

## 9. Các cách đã cân nhắc

| Cách | Được | Mất | Kết luận |
|---|---|---|---|
| **A. Một ứng dụng riêng:** TypeScript/Next.js + Postgres. Web và MCP chạy trên cùng server. Docker Compose | Một dịch vụ duy nhất. Giao diện tự do. Không bị gắn vào Odoo | Tự làm phần tài khoản ở giai đoạn 1 | **Đã chọn** |
| B. Module bên trong Odoo + MCP server nhỏ bên cạnh | Có sẵn user và cây nhân sự | Giao diện OWL khó làm dòng thời gian. Bị gắn vào việc nâng cấp Odoo | Loại |
| C. Nhiều dịch vụ (API Python + MCP + SPA) | Linh hoạt | Quá nặng cho 20 người | Loại |
| Fork agent-track | Có sẵn MCP + skill | Chạy trên Cloudflare, không hợp self-host. Lấy agent làm trung tâm | Loại, chỉ tham khảo thiết kế công cụ MCP |
| Dựng trên Plane hoặc công cụ Kanban open source | Có sẵn nhiều tính năng | Đi ngược mục tiêu | Loại |

## 10. Ràng buộc

- Self-host trên hạ tầng nội bộ, triển khai bằng Docker Compose.
- Khoảng 20 user, không cần tính đến việc mở rộng lớn.
- Agent mục tiêu: Claude Code (chính) và Codex.
- Nội dung báo cáo là dữ liệu nội bộ, không gửi ra dịch vụ bên ngoài.

## 11. Để builder quyết định

- Thư viện UI và ORM, cách vẽ dòng thời gian.
- Lược đồ cơ sở dữ liệu chi tiết, tên và schema cụ thể của các công cụ MCP.
- Cách tính % tiến độ: agent báo trực tiếp, hay tính theo số bước đã xong. Đề xuất: tính theo số bước, agent được phép điều chỉnh.
- Ngưỡng mặc định cho "lâu không cập nhật". Đề xuất: 3 ngày làm việc.
- Thông báo ra ngoài (email, chat): **ngoài phạm vi giai đoạn 1.**

## 12. Thứ tự xây dựng đề xuất

1. Lõi gồm dữ liệu, đăng nhập, sơ đồ tổ chức, phân quyền, và MCP cho member (`create_task`, `update_progress`…).
2. Gói skill cho Claude Code, chạy thử với 2–3 người.
3. Web: trang chủ, trang một người, chi tiết việc, xác nhận và review.
4. MCP cho quản lý, gói skill cho Codex.
5. Giai đoạn 2: đăng nhập qua Odoo, đồng bộ Odoo HR, hook, kiểm tra bằng chứng với hệ thống git.
