# Checkpoint Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hook `Stop` chạy sau mỗi lượt của agent (Claude Code, Codex, và Antigravity nếu hỗ trợ), nhắc agent gửi cập nhật **theo checkpoint** (từng bước của plan) và nhắc thủ tục kết thúc khi đủ mọi bước.

**Architecture:**
- **Dấu của agent:** agent in `AGENTSYNC-TASK:` và `AGENTSYNC-CHECKPOINT:` theo hướng dẫn trong skill.
- **Script hook:** một file Node không phụ thuộc thư viện ngoài (`plugins/agentsync/hooks/agentsync-hook.mjs`). Script quét dấu trong lượt vừa xong và hỏi server qua một API mới chỉ dành cho chủ việc (`GET /api/agent/tasks/{id}/plan`). Từ đó nó quyết định chặn một lần hay im lặng.
- **Tách logic:** phần quyết định là các hàm thuần, có unit test. Phần đọc/ghi và gọi mạng nằm riêng, và mọi lỗi ở phần này đều thoát im lặng.

**Tech Stack:** Next 16 route handler, Node ≥ 20 (`fetch`, `AbortSignal.timeout`), Vitest, `node:http` để dựng server giả trong test tích hợp.

**Spec:** `docs/superpowers/specs/2026-11-21-checkpoint-hook-design.md` (đọc cả mục 6b).

## Global Constraints

- **Định dạng dấu**, mỗi dấu một dòng riêng, chữ cố định tiếng Anh: `AGENTSYNC-TASK: <taskId>` và `AGENTSYNC-CHECKPOINT: <tên bước nguyên văn>`.
- **So khớp tên bước:** so chính xác sau khi `trim()`. Tên bước không có trong plan thì bỏ qua.
- **Trạng thái cho phép nhắc cập nhật:** `pending_confirmation`, `in_progress`, `changes_requested`.
- **Điều kiện nhắc kết thúc:** việc đang `in_progress` và mọi bước đều `done`. Nhắc một lần cho mỗi giá trị `statusChangedAt`.
- **`stop_hook_active = true`:** vẫn ghi nhận dấu nhưng không bao giờ chặn.
- **Gom bước khi nhắc:** chỉ chặn khi có bước *mới* chưa từng nhắc. Lời nhắc liệt kê *mọi* bước còn chờ, kể cả bước đã nhắc trước đó.
- **Khi nào gọi server:** chỉ khi phiên đã gắn việc và lượt này có dấu checkpoint mới, hoặc phiên đang còn `outstanding`.
- **Mọi lỗi đều thoát im lặng:** exit 0, không in gì ra stdout. Các lỗi gồm env thiếu, mạng, HTTP khác 200, JSON lạ, file trạng thái hỏng.
  - Gọi server tối đa **3 giây**.
  - Ghi log vào `~/.agentsync/hook.log`, cuộn vòng khi vượt khoảng 1 MB.
- **Biến môi trường:**
  - `AGENTSYNC_HOOK=off` tắt hook.
  - `AGENTSYNC_URL` và `AGENTSYNC_TOKEN` là bắt buộc.
  - `AGENTSYNC_STATE_DIR` (mặc định `~/.agentsync`) dùng để test.
- **File trạng thái:** `<stateDir>/state.json`, ghi atomic (ghi file tạm rồi rename). Session cũ hơn 7 ngày bị dọn. Không lưu token, không lưu nội dung code.
- **API mới** `GET /api/agent/tasks/{id}/plan`:
  - xác thực Bearer bằng `authenticateAgentToken`;
  - chỉ chủ việc được đọc; ai khác, id sai hoặc không tồn tại nhận 404; token sai nhận 401;
  - trả `{ id, status, mode, statusChangedAt (ISO), steps: [{ title, status }] }`, không thêm trường nào khác.
- **Lời nhắc gửi agent viết bằng tiếng Anh.** Lời nhắc phải nhắc agent: chế độ duyệt trước khi gửi vẫn áp dụng (hiện bản nháp cho member trước).
- **Commit:** trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, làm trên nhánh `feat/checkpoint-hook`.

## Review Focus

1. **Server chậm hoặc mất mạng:** hook phải thoát trong khoảng 3 giây, không chặn, không in gì. Test ở Task 3, dùng server giả trả lời trễ 5 giây.
2. **Agent trích dẫn ví dụ dấu**, ví dụ in nguyên `AGENTSYNC-CHECKPOINT: <step title>` từ hướng dẫn: tên không có trong plan nên bị bỏ qua, không chặn. Test ở Task 2.
3. **Việc đang chờ review, tạm dừng hoặc đã đóng:** im lặng. Test ở Task 2.
4. **Token của người khác hoặc việc của người khác:** API trả 404 và hook im lặng, không lộ gì. Test ở Task 1 và Task 3.
5. **Payload hook thiếu `transcript_path`** hoặc transcript không đọc được: dùng `last_assistant_message`. Nếu cũng không có thì im lặng. Test ở Task 3.

---

### Task 1: API plan cho chủ việc

**Files:**
- Create: `app/api/agent/tasks/[id]/plan/route.ts`
- Modify: `src/server/tasks/queries.ts`, thêm `getOwnTaskPlan`
- Test: `tests/server/agent-plan-route.test.ts`, `tests/server/queries.test.ts` (thêm case)

**Interfaces:**
- Produces:
  - `getOwnTaskPlan(db, actor: Actor, taskId: string): Promise<{ id: string; status: TaskStatus; mode: TaskMode; statusChangedAt: string; steps: { title: string; status: 'todo'|'doing'|'done' }[] }>`
    - Dùng `loadTaskForViewer`. Nếu `task.ownerId !== actor.id` thì ném `NOT_FOUND`.
    - Plan là phiên bản hiện tại, lấy qua `currentPlan` trong `src/server/tasks/internal.ts`.
  - Route `GET` theo mẫu của `app/api/mcp/route.ts`:
    - Bearer sai trả 401 `{error:'unauthorized'}`.
    - `NOT_FOUND` trả 404 `{error:'not_found'}`.
    - Lỗi khác trả 500 `{error:'server_error'}` và ghi `console.error`.
    - Header `Cache-Control: no-store`.

- [ ] **Step 1:** Tạo nhánh `git checkout -b feat/checkpoint-hook`.
- [ ] **Step 2: Viết test thất bại.**
  - `owner gets plan with exact keys`: so `Object.keys` với `['id','status','mode','statusChangedAt','steps']` và kiểm tra `steps[0]` có dạng `{title,status}`.
  - `manager of owner gets 404`.
  - `private task of other user 404`.
  - `non-uuid id 404`.
  - `bad token 401`.
  - `revoked token 401`.
- [ ] **Step 3:** Chạy `pnpm vitest run tests/server/agent-plan-route.test.ts`. Kỳ vọng: FAIL.
- [ ] **Step 4:** Cài đặt. Đảm bảo `proxy.ts` không chặn `/api/agent/*`: matcher hiện đã bỏ qua `/api/`, chỉ cần kiểm tra lại.
- [ ] **Step 5:** Chạy lại để thấy PASS, sau đó chạy toàn bộ vitest, typecheck và lint.
- [ ] **Step 6:** Commit `feat(api): owner-only task plan endpoint for agent hooks`.

---

### Task 2: Logic quyết định của hook (hàm thuần)

**Files:**
- Create: `plugins/agentsync/hooks/agentsync-hook.mjs`. Task này chỉ viết phần hàm thuần, export ra ngoài. Hàm `main` để Task 3 viết.
- Test: `tests/hooks/hook-logic.test.ts` (bổ sung pattern `tests/**/*.test.ts` vào vitest config nếu chưa có)

**Interfaces:**
- Produces (export từ `agentsync-hook.mjs`, kèm chú thích JSDoc kiểu):
  - `parseMarkers(text: string) → { taskIds: string[]; checkpoints: string[] }`. Regex đa dòng:
    - `^\s*AGENTSYNC-TASK:\s*(\S+)\s*$`
    - `^\s*AGENTSYNC-CHECKPOINT:\s*(.+?)\s*$`
  - `turnAssistantTexts(transcript: string) → string[]`: transcript dạng JSONL của Claude Code. Trả nội dung text của mọi tin nhắn assistant **kể từ tin nhắn user thật gần nhất**. Tin nhắn user chỉ chứa `tool_result` không tính là tin nhắn user thật. Dòng hỏng thì bỏ qua.
  - `applyTurn(session: Session, markers) → { session: Session; newCheckpoints: string[] }`: dấu task cuối cùng thắng. Đổi sang task khác thì reset `claimed`, `reminded`, `completionRemindedAt` và `outstanding`.
  - `decide(session: Session, plan: Plan | null, opts: { stopHookActive: boolean }) → { session: Session; action: { type: 'none' } | { type: 'remindSteps'; steps: string[] } | { type: 'remindComplete'; mode: 'project'|'executive' } }`, theo Global Constraints.
    - Khi `plan === null`: trả `none` và giữ nguyên session.
    - Khi trả `none` do không còn gì để làm: đặt `outstanding = false`.
    - Khi chặn: đặt `outstanding = true`.
  - `reasonFor(action) → string`: lời nhắc tiếng Anh. Với `remindSteps`, lời nhắc nêu cách gọi `update_progress` với `stepsCompleted` dùng **đúng** tên bước kèm danh sách bước, cùng câu: "If your send mode is review, show the member the draft and wait for approval first." Với `remindComplete`: mode `project` thì nêu `submit_solution_summary` rồi `set_task_status` với `complete`; mode `executive` thì chỉ `set_task_status` với `complete`.
  - Kiểu dữ liệu:
    - `Session = { taskId?: string; claimed: string[]; reminded: string[]; completionRemindedAt?: string; outstanding: boolean; updatedAt: string }`
    - `Plan = { id; status; mode; statusChangedAt; steps: {title,status}[] }`

- [ ] **Step 1: Viết test thất bại.** Tên test và kỳ vọng:
  - `parseMarkers finds multiple checkpoints and trims`
  - `parseMarkers ignores markers not at line start`: `"see AGENTSYNC-CHECKPOINT: x"` không được bắt.
  - `turnAssistantTexts returns assistant texts after last real user message, skipping tool_result-only user lines` (fixture JSONL viết trong test)
  - `decide: new checkpoint not done on server → remindSteps with that step; reminded updated; outstanding true`
  - `decide: placeholder title not in plan → none`
  - `decide: same pending step already reminded and no new one → none`
  - `decide: new checkpoint plus previously reminded pending → remindSteps lists both`
  - `decide: status awaiting_review/paused/done → none`
  - `decide: stopHookActive → none but claimed kept`
  - `decide: all steps done, in_progress, not reminded for this statusChangedAt → remindComplete(project)`
  - `decide: completion already reminded for same statusChangedAt → none; new statusChangedAt → remindComplete again`
  - `reasonFor remindSteps mentions update_progress, stepsCompleted, exact titles, review draft`
- [ ] **Step 2:** Chạy `pnpm vitest run tests/hooks/hook-logic.test.ts`. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt các hàm thuần, không import gì ngoài các module có sẵn của Node.
- [ ] **Step 4:** Chạy lại để thấy PASS, sau đó chạy toàn bộ vitest và lint. Thêm `plugins/**/*.mjs` vào ESLint nếu cần.
- [ ] **Step 5:** Commit `feat(hook): checkpoint decision logic`.

---

### Task 3: Phần chạy của hook (IO, mạng, đầu ra theo agent)

**Files:**
- Modify: `plugins/agentsync/hooks/agentsync-hook.mjs`, thêm `main()` và chỉ chạy khi file được gọi trực tiếp (so `import.meta.url` với `process.argv[1]`)
- Test: `tests/hooks/hook-run.test.ts`

**Interfaces:**
- Consumes: các hàm ở Task 2 và API ở Task 1.
- Produces: CLI `node agentsync-hook.mjs --agent <claude|codex|antigravity>`.
  1. Đọc JSON từ stdin, gồm `session_id`, `transcript_path?`, `last_assistant_message?`, `stop_hook_active?`.
  2. Lấy text của lượt: đọc `turnAssistantTexts(transcript)` nếu đọc được, nếu không thì dùng `[last_assistant_message]`.
  3. Đọc state, gọi `applyTurn`.
  4. Nếu cần gọi server: `fetch(${AGENTSYNC_URL}/api/agent/tasks/${taskId}/plan)` với Bearer và `AbortSignal.timeout(3000)`, rồi gọi `decide`.
  5. Ghi state theo kiểu atomic.
  6. Đầu ra:
     - Nếu cần chặn: **Claude Code** in `{"decision":"block","reason":...}` ra stdout rồi exit 0. **Codex** dùng định dạng chặn hook `Stop` theo tài liệu Codex hiện hành (đọc https://learn.chatgpt.com/docs/hooks.md, ghi nguồn vào comment). **Antigravity** dùng định dạng tương tự nếu tài liệu có; nếu không, hiện thực giống Claude và ghi chú "chưa kiểm tra".
     - Nếu không chặn: không in gì, exit 0.
  7. `AGENTSYNC_HOOK=off` thì thoát ngay.

- [ ] **Step 1: Viết test thất bại.** Spawn `node plugins/agentsync/hooks/agentsync-hook.mjs --agent claude` với `AGENTSYNC_STATE_DIR` là thư mục tạm, kèm một server `node:http` giả lập API plan. Các case:
  - `no markers → no stdout, exit 0, no HTTP call` (đếm request trên server giả)
  - `task + new checkpoint → stdout JSON decision block mentioning the step`
  - `second run with stop_hook_active true → no stdout`
  - `after server shows all done (in_progress) → block reminding completion once; next run silent`
  - `server returns 404 → silent`
  - `server delays 5s → exits silently within 4.5s`
  - `missing AGENTSYNC_TOKEN → silent`
  - `AGENTSYNC_HOOK=off → silent, no HTTP`
  - `no transcript_path, last_assistant_message has markers → works`
  - `corrupted state.json → silent and state rewritten valid on next run`
  - `--agent codex block output matches the documented Codex Stop block format`
- [ ] **Step 2:** Chạy `pnpm vitest run tests/hooks/hook-run.test.ts`. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt. Log cuộn vòng: khi `hook.log` vượt 1 MB thì đổi tên thành `hook.log.1` rồi ghi file mới.
- [ ] **Step 4:** Chạy lại để thấy PASS, sau đó chạy toàn bộ vitest và lint.
- [ ] **Step 5:** Commit `feat(hook): stop hook runtime for claude/codex/antigravity`.

---

### Task 4: Đóng gói, skill và tài liệu

**Files:**
- Create:
  - `plugins/agentsync/hooks/hooks.json`: Claude Code plugin, hook `Stop` chạy `node ${CLAUDE_PLUGIN_ROOT}/hooks/agentsync-hook.mjs --agent claude`, timeout 10
  - `plugins/agentsync/antigravity/hooks.json` và `plugins/agentsync/antigravity/README.md`: mẫu hook, ghi rõ "chưa kiểm tra thực tế"
- Modify:
  - `plugins/agentsync/skills/agentsync-plan/SKILL.md`: sau khi `create_task` thành công, in `AGENTSYNC-TASK: <id>`
  - `plugins/agentsync/skills/agentsync-session/SKILL.md`: in `AGENTSYNC-TASK` khi xác định được việc, in `AGENTSYNC-CHECKPOINT` khi xong mỗi bước, và gửi `update_progress` ngay cho bước đó (hook chỉ là lưới an toàn)
  - `plugins/agentsync/codex/README.md`: hook `Stop` trong `~/.codex/hooks.json`, đặt `AGENTSYNC_URL`/`AGENTSYNC_TOKEN`, duyệt hook trong `/hooks`
  - `docs/install-agent.md` và `docs/install-agent.vi.md`: thêm mục "Checkpoint hook", gồm yêu cầu Node ≥ 20, cách bật/tắt (`AGENTSYNC_HOOK=off`), và tình trạng Antigravity
- Test: cập nhật `tests/server/plugin-files.test.ts`

- [ ] **Step 1: Viết test thất bại.**
  - `hooks.json` hợp lệ, có `Stop` trỏ tới script tồn tại.
  - Hai skill member chứa đúng chuỗi `AGENTSYNC-TASK:` và `AGENTSYNC-CHECKPOINT:`.
  - Mẫu hook của Antigravity trỏ tới script tồn tại.
  - Tài liệu cài đặt có mục hook ở cả hai ngôn ngữ, giữ đúng tiêu đề bạn chọn trong cả hai bản.
- [ ] **Step 2:** Chạy `pnpm vitest run tests/server/plugin-files.test.ts`. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt. Phần nội dung skill viết bằng tiếng Anh, theo chuẩn hiện có. Test chặn chuỗi cứng (`no-hardcoded-strings`) vẫn phải pass.
- [ ] **Step 4:** Chạy toàn bộ vitest, typecheck, lint và playwright, kỳ vọng tất cả PASS.
- [ ] **Step 5:** Kiểm tra thủ công nếu môi trường cho phép: chạy `claude --plugin-dir` với một repo thử để xem hook có nhắc không. Nếu không làm được, ghi rõ là chưa kiểm tra trong báo cáo và tài liệu.
- [ ] **Step 6:** Commit `feat(agent): package checkpoint hook, skill markers, docs`.
