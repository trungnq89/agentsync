# AgentSync — Hook cập nhật theo checkpoint

*Ngày: 2026-11-21 · Trạng thái: chờ duyệt · Nền tảng: AgentSync `main` (690ae63)*

## 1. Mục đích và lý do

Hiện nay việc báo cáo tiến độ phụ thuộc hoàn toàn vào việc agent *tự nhớ* gọi skill. Khi agent quên, quản lý không thấy gì, và mục tiêu "không phải hỏi member" thất bại.

Tính năng này thêm một **hook chạy sau mỗi lượt trả lời** của agent. Hook đảm bảo cập nhật được gửi **theo checkpoint**: mỗi bước trong plan là một checkpoint. Hook không gửi theo từng lượt hay từng lần chạy. Khi mọi checkpoint đã xong, việc được coi là **cơ bản hoàn thành** và hook nhắc agent làm thủ tục kết thúc.

Agent mục tiêu: **Claude Code, Codex, Antigravity**.

## 2. Mục tiêu / Không phải mục tiêu / Phản mục tiêu

**Mục tiêu**
- Cuối mỗi lượt, nếu phiên đã gắn với một việc và vừa có checkpoint mới hoàn thành mà server chưa ghi nhận, hook **chặn một lần** và nhắc agent gửi `update_progress` cho đúng các bước đó, kèm một đoạn tóm tắt ngắn.
- Khi mọi bước trong plan đã xong trên server mà việc vẫn đang làm, hook **nhắc một lần** làm thủ tục kết thúc:
  - mode `project`: `submit_solution_summary`, rồi `set_task_status complete`;
  - mode `executive`: `set_task_status complete`.
- Lượt không có checkpoint mới thì hook im lặng, không tốn thêm lượt nào của agent.
- Dùng chung một script hook cho cả ba agent.

**Không phải mục tiêu**
- Không dùng model AI để đoán checkpoint (cách C đã loại).
- Không dùng hook `SessionEnd`: hook này không bắt agent làm việc được.
- Không đổi giao diện board, không thêm tool MCP mới.

**Phản mục tiêu**
- Hook làm phiền: chặn lặp lại, hoặc chặn ở lượt không có gì mới.
- Hook làm hỏng hay treo phiên làm việc của member khi mất mạng, sai token hoặc server lỗi.
- Hook tự gửi dữ liệu thay agent. Tóm tắt luôn do agent viết, và chế độ "duyệt trước khi gửi" vẫn được tôn trọng.

## 3. Các cách đã cân nhắc

| Cách | Được | Mất | Kết luận |
|---|---|---|---|
| **A. Agent in dấu checkpoint, hook đối chiếu với server** | Rẻ, chắc chắn, test được, chạy được trên cả ba agent | Dựa vào agent in dấu. Việc in dấu rất nhỏ và được nhắc mỗi lượt | **Đã chọn** |
| B. Tool `mark_checkpoint` trên server, hook hỏi server | Trạng thái nằm trên server | Agent vẫn phải nhớ gọi tool. Mỗi lượt phải gọi mạng, phức tạp hơn | Loại |
| C. Model nhỏ phán đoán sau mỗi lượt | Không cần agent đánh dấu | Tốn chi phí mỗi lượt, kết quả không ổn định. Codex và Antigravity không hỗ trợ | Loại |

## 4. Cách hoạt động (cách A)

### 4.1 Dấu hiệu agent in ra (cập nhật skill)

Skill `agentsync-session` và `agentsync-plan` dặn agent in **đúng định dạng**, mỗi dấu một dòng riêng, chữ cố định bằng tiếng Anh dù agent đang trả lời member bằng ngôn ngữ nào:
- Khi đã xác định việc đang làm, hoặc vừa tạo việc mới: `AGENTSYNC-TASK: <taskId>`
- Khi vừa hoàn thành một bước của plan: `AGENTSYNC-CHECKPOINT: <tên bước, đúng nguyên văn trong plan>`

Agent có thể in nhiều dấu checkpoint trong cùng một lượt.

### 4.2 Hook sau mỗi lượt (`Stop`)

Script `agentsync-hook` chạy sau mỗi lượt và làm theo thứ tự:
1. Đọc payload của hook: `session_id`, tin nhắn cuối của agent (`last_assistant_message` nếu có, nếu không thì đọc `transcript_path`), và cờ `stop_hook_active`.
2. Nếu `stop_hook_active = true`, tức hook vừa chặn ở lượt trước: **không chặn nữa**, thoát.
3. Quét các dấu trong tin nhắn cuối:
   - Dấu `AGENTSYNC-TASK` ghi nhận việc của phiên.
   - Dấu `AGENTSYNC-CHECKPOINT` được thêm vào danh sách "đã báo xong" của phiên.
4. Nếu phiên chưa gắn việc nào: thoát, im lặng.
5. **Chỉ gọi server** khi lượt này có dấu checkpoint mới, hoặc phiên còn một lời nhắc chưa được giải quyết. Server trả về plan hiện tại: trạng thái việc, mode, các bước và trạng thái từng bước.
6. Tính `pending` = các bước "đã báo xong" mà trên server vẫn chưa ở trạng thái `done`.
   - Nếu `pending` có bước mới mà hook **chưa từng nhắc**: chặn với lời nhắc cụ thể, gồm danh sách bước, cách gọi `update_progress` với `stepsCompleted` đúng tên bước, và lưu ý chế độ duyệt trước khi gửi. Ghi lại là đã nhắc các bước này.
   - Nếu `pending` rỗng, mọi bước trên server đã `done`, việc đang `in_progress` và **chưa nhắc kết thúc**: chặn một lần với lời nhắc làm thủ tục kết thúc theo mode. Ghi lại là đã nhắc.
   - Các trường hợp khác: thoát, im lặng.

Lời nhắc trả về agent viết bằng tiếng Anh. Skill đã dặn agent trả lời member theo ngôn ngữ của member.

### 4.3 Trạng thái trên máy member

Trạng thái lưu ở `~/.agentsync/state.json`, theo từng `session_id`:
- `taskId`
- các bước đã báo xong
- các bước đã nhắc
- đã nhắc kết thúc hay chưa
- thời điểm cập nhật

Session cũ hơn 7 ngày tự bị dọn. Ghi file theo kiểu atomic (ghi file tạm rồi đổi tên). File không chứa token hay nội dung code.

### 4.4 API mới trên server

`GET /api/agent/tasks/{id}/plan`, xác thực bằng Bearer token agent (cùng token với MCP).
- Chỉ **chủ việc** được gọi. Người khác, id sai hoặc việc không tồn tại nhận 404. Token sai nhận 401.
- Trả về: `{ id, status, mode, steps: [{ title, status }] }`. Không trả nội dung nào khác.
- Phân quyền và xác thực dùng lại `authenticateAgentToken` và `loadTaskForViewer` có sẵn.

### 4.5 An toàn khi lỗi

- **Mọi lỗi đều thoát im lặng** (exit 0, không chặn), gồm: thiếu `AGENTSYNC_URL`/`AGENTSYNC_TOKEN`, mất mạng, server lỗi, payload lạ, file trạng thái hỏng. Lỗi được ghi vào `~/.agentsync/hook.log` (tối đa khoảng 1 MB, cuộn vòng).
- Thời gian gọi server tối đa 3 giây.
- Tắt hook bằng biến môi trường `AGENTSYNC_HOOK=off`.

## 5. Đóng gói cho từng agent

- **Claude Code:** thêm `hooks/hooks.json` vào plugin `plugins/agentsync`. Sự kiện `Stop` chạy script qua `${CLAUDE_PLUGIN_ROOT}`. Biến `AGENTSYNC_URL`/`AGENTSYNC_TOKEN` dùng chung với cấu hình MCP.
- **Codex:** hướng dẫn thêm vào `~/.codex/hooks.json` (hoặc `[hooks]` trong `config.toml`) một hook `Stop` trỏ tới cùng script. Member phải duyệt hook trong `/hooks`. Builder kiểm tra payload `Stop` của Codex có tin nhắn cuối hay phải đọc transcript.
- **Antigravity:** builder **thử thực tế** xem hook `Stop` của Antigravity có chặn được để agent làm tiếp hay không.
  - Nếu được: đóng gói thành plugin Antigravity có `hooks.json` gọi cùng script.
  - Nếu không: ghi rõ trong tài liệu rằng Antigravity dựa vào skill. Có thể dùng `Stop` chỉ để ghi log, không chặn.
- **Script:** viết bằng Node, một file không phụ thuộc thư viện ngoài, nằm trong `plugins/agentsync/hooks/`. Cả ba agent đều cần Node trên máy member, và tài liệu cài đặt ghi rõ yêu cầu này.

## 6. Ràng buộc

- Giữ nguyên mọi ràng buộc của giai đoạn 1 và đợt i18n: phân quyền chủ việc, không lộ việc của người khác, i18n.
- Phần quyết định của hook (phân tích dấu, tính pending, quyết định nhắc gì) là **hàm thuần**, có unit test. Phần đọc/ghi và gọi mạng tách riêng.
- Có test cho API mới: chủ việc nhận plan; người khác, id sai và việc riêng tư của người khác nhận 404; token sai nhận 401.
- Có test chạy script thật với payload giả lập và server thử: lượt không có dấu thì im lặng; có checkpoint mới thì chặn một lần; lượt sau `stop_hook_active` thì không chặn; đủ bước thì nhắc kết thúc một lần; server lỗi thì im lặng.
- Tài liệu `docs/install-agent.md` (và bản `.vi.md`) có thêm mục bật hook cho từng agent.

## 6b. Các quyết định chi tiết (quyết định của tôi, sau vòng đọc thử)

1. **Quét dấu trên toàn bộ lượt, không chỉ tin nhắn cuối.** Agent thường in dấu checkpoint giữa lượt rồi mới gọi tool tiếp. Vì vậy hook quét *mọi tin nhắn của agent kể từ tin nhắn gần nhất của member*, đọc qua `transcript_path` trên Claude Code và Codex, và chỉ dùng `last_assistant_message` khi không đọc được transcript. Dấu vẫn được **ghi nhận cả khi `stop_hook_active = true`**: trường hợp này chỉ không chặn, chứ không bỏ qua dấu.
2. **Nhắc kết thúc theo từng vòng, không phải một lần cho cả phiên.** Một việc có thể bị review "Cần sửa" rồi quay về `in_progress`, trong khi mọi bước vẫn `done`. API vì thế trả thêm `statusChangedAt`. Hook ghi nhận đã nhắc kết thúc ứng với giá trị `statusChangedAt` nào. Khi việc quay lại `in_progress` với `statusChangedAt` mới, hook nhắc lại một lần để agent gửi lại tóm tắt và đánh dấu xong.
3. **Mỗi checkpoint là một cập nhật, đúng ý người dùng.** Ở chế độ "duyệt trước khi gửi", mỗi checkpoint tạo một bản nháp chờ member duyệt. Đây là lựa chọn của chính member khi bật chế độ này.
   - Skill dặn agent tự gửi cập nhật ngay khi xong một bước. Hook chỉ là lưới an toàn khi agent quên.
   - Bước đã nhắc mà member từ chối hoặc hoãn sẽ **được nhắc lại cùng lần nhắc kế tiếp** (khi có checkpoint mới), gộp chung trong một lời nhắc. Hook không chặn lại riêng cho bước đó.
4. **Chỉ nhắc cập nhật khi trạng thái việc cho phép.** Nhắc khi việc ở `pending_confirmation`, `in_progress` hoặc `changes_requested`. Không nhắc khi việc ở `paused`, `awaiting_review` hoặc đã kết thúc (`done`, `closed`, `cancelled`). Nhắc kết thúc chỉ khi việc đang `in_progress`.
5. **Antigravity không chặn việc phát hành.** Nếu không có Antigravity để thử thật, phần Antigravity gồm:
   - một mẫu `hooks.json` gọi cùng script, ghi rõ "chưa kiểm tra thực tế";
   - tài liệu ghi rằng nếu `Stop` không chặn được thì Antigravity dựa vào skill.
6. **Codex dùng biến môi trường giống Claude Code.** Member dùng Codex đặt `AGENTSYNC_URL` và `AGENTSYNC_TOKEN` (token đã dùng cho `bearer_token_env_var`). Tài liệu Codex được cập nhật cho phù hợp. Hook không đọc `config.toml` của Codex.

## 7. Để builder quyết định

- Đường dẫn file và tên hàm cụ thể. Định dạng chi tiết của file trạng thái.
- Cách so khớp tên bước: đề xuất so chính xác sau khi bỏ khoảng trắng thừa ở đầu và cuối.
- Câu chữ cụ thể của lời nhắc gửi agent.
