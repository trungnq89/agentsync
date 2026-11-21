import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Db } from '@/db/client';
import type { User } from '@/db/schema';
import { DomainError } from '@/server/errors';
import { levelLabel } from '@/server/labels';
import {
  answerQuestion, askQuestion, getPendingFeedback, postUpdate, reviewSolution, submitSolutionSummary,
} from '@/server/tasks/activity';
import {
  changePlan, confirmTask, createTask, makePublic, requestChanges, setTaskStatus,
} from '@/server/tasks/service';
import {
  listMyTasks, needsAttention, taskDetail, teamOverview, weeklyDigest,
} from '@/server/tasks/queries';
import {
  formatAttention, formatDigest, formatOverview, formatTaskDetail, formatTaskList,
} from './format';

export interface ToolCtx {
  db: Db;
  getActor: () => User;
  now?: () => Date;
}

const GENERIC_ERROR = 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.';

const reply = (markdown: string, data: unknown) => ({
  content: [
    { type: 'text' as const, text: markdown },
    { type: 'text' as const, text: JSON.stringify(data) },
  ],
});

const errorReply = (message: string) => ({
  isError: true as const,
  content: [{ type: 'text' as const, text: message }],
});

const planStep = z.object({
  title: z.string().describe('Tên bước'),
  status: z.enum(['todo', 'doing', 'done']).describe('Trạng thái bước'),
});
const taskId = z.string().describe('ID của việc (lấy từ list_my_tasks)');
const questionId = z.string().describe('ID của câu hỏi');

export function registerTools(server: McpServer, ctx: ToolCtx): void {
  const { db } = ctx;
  const now = () => ctx.now?.() ?? new Date();

  function tool<S extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: S,
    run: (args: z.infer<z.ZodObject<S>>, actor: User) => Promise<{ markdown: string; data: unknown }>,
  ) {
    server.registerTool(name, { description, inputSchema: shape }, (async (args: z.infer<z.ZodObject<S>>) => {
      try {
        const { markdown, data } = await run(args, ctx.getActor());
        return reply(markdown, data);
      } catch (e) {
        if (e instanceof DomainError) return errorReply(e.message);
        console.error(`[mcp] tool ${name} failed`, e);
        return errorReply(GENERIC_ERROR);
      }
    }) as never);
  }

  const done = (markdown: string, data: unknown) => ({ markdown, data });

  // ------------------------------------------------------------ member
  tool('list_my_tasks', 'Liệt kê các việc của bạn (đang làm; thêm việc đã xong nếu includeDone).',
    { includeDone: z.boolean().optional().describe('Gồm cả việc đã xong/đã hủy') },
    async ({ includeDone }, actor) => {
      const list = await listMyTasks(db, actor, { includeDone }, now());
      return done(formatTaskList(list), list);
    });

  tool('create_task', 'Tạo việc mới kèm plan để chờ quản lý xác nhận.',
    {
      title: z.string().describe('Tên việc'),
      mode: z.enum(['executive', 'project']).describe('executive = không code, project = có code'),
      agreedOutcome: z.string().describe('Kết quả đã thống nhất'),
      startDate: z.string().describe('Ngày bắt đầu YYYY-MM-DD'),
      agreedDueDate: z.string().describe('Hạn thống nhất YYYY-MM-DD'),
      steps: z.array(z.string()).describe('Các bước của plan'),
      isPrivate: z.boolean().optional().describe('Việc riêng tư, chỉ bạn thấy'),
      repoRef: z.object({ repo: z.string().optional(), branch: z.string().optional() }).optional(),
      cwdHint: z.string().optional().describe('Thư mục làm việc gợi ý'),
    },
    async (input, actor) => {
      const t = await createTask(db, actor, input, now());
      return done(`Đã tạo việc **${t.title}** (id: ${t.id}).`, t);
    });

  tool('update_progress', 'Gửi cập nhật tiến độ cho một việc của bạn.',
    {
      taskId,
      body: z.string().describe('Nội dung cập nhật'),
      stepsCompleted: z.array(z.string()).optional().describe('Tên các bước vừa xong'),
      progressPct: z.number().optional().describe('Tiến độ 0-100'),
      expectedEndDate: z.string().optional().describe('Ngày dự kiến mới YYYY-MM-DD'),
      source: z.enum(['auto', 'reviewed']).describe('auto = agent tự gửi, reviewed = người dùng đã duyệt'),
      evidence: z.object({
        branch: z.string().optional(), commits: z.number().optional(), prUrl: z.string().optional(),
      }).optional(),
    },
    async ({ taskId: id, ...input }, actor) => {
      const u = await postUpdate(db, actor, id, input, now());
      return done('Đã gửi cập nhật.', u);
    });

  tool('revise_plan', 'Sửa plan của một việc.',
    {
      taskId,
      steps: z.array(planStep).describe('Toàn bộ các bước của plan mới'),
      reason: z.string().optional().describe('Lý do sửa plan'),
      expectedEndDate: z.string().optional().describe('Ngày dự kiến mới YYYY-MM-DD'),
    },
    async ({ taskId: id, ...input }, actor) => {
      const t = await changePlan(db, actor, id, input, now());
      return done('Đã cập nhật plan.', t);
    });

  tool('set_task_status', 'Đổi trạng thái việc: complete, pause, resume hoặc cancel.',
    {
      taskId,
      action: z.enum(['complete', 'pause', 'resume', 'cancel']),
      reason: z.string().optional().describe('Lý do (bắt buộc với pause/cancel)'),
    },
    async ({ taskId: id, action, reason }, actor) => {
      const t = await setTaskStatus(db, actor, id, action, reason, now());
      return done(`Việc giờ ở trạng thái: ${t.status}.`, t);
    });

  tool('make_task_public', 'Chuyển việc riêng tư thành công khai để quản lý thấy.',
    { taskId },
    async ({ taskId: id }, actor) => {
      const t = await makePublic(db, actor, id, now());
      return done('Đã công khai việc.', t);
    });

  tool('report_blocker', 'Báo vướng mắc (blocker) cho quản lý.',
    { taskId, body: z.string().describe('Nội dung vướng mắc') },
    async ({ taskId: id, body }, actor) => {
      const q = await askQuestion(db, actor, id, body, { isBlocker: true }, now());
      return done('Đã báo vướng mắc.', q);
    });

  tool('ask_manager', 'Hỏi quản lý một câu hỏi (không phải blocker).',
    { taskId, body: z.string().describe('Nội dung câu hỏi') },
    async ({ taskId: id, body }, actor) => {
      const q = await askQuestion(db, actor, id, body, { isBlocker: false }, now());
      return done('Đã gửi câu hỏi.', q);
    });

  tool('answer_question', 'Trả lời câu hỏi của quản lý.',
    { questionId, answer: z.string().describe('Câu trả lời') },
    async ({ questionId: id, answer }, actor) => {
      const q = await answerQuestion(db, actor, id, answer, now());
      return done('Đã trả lời.', q);
    });

  tool('submit_solution_summary', 'Nộp tóm tắt giải pháp (việc mode project) để chờ review.',
    {
      taskId,
      problem: z.string(), solution: z.string(), rejectedAlternatives: z.string(),
      keyChanges: z.string(), risks: z.string(), testing: z.string(),
      prUrl: z.string().optional(),
    },
    async ({ taskId: id, ...input }, actor) => {
      const s = await submitSolutionSummary(db, actor, id, input, now());
      return done('Đã nộp tóm tắt giải pháp.', s);
    });

  tool('get_pending_feedback', 'Xem phản hồi đang chờ: yêu cầu sửa plan, câu hỏi, câu trả lời, kết quả review.',
    {},
    async (_a, actor) => {
      const f = await getPendingFeedback(db, actor);
      const lines = ['## Phản hồi đang chờ'];
      for (const c of f.changesRequested) lines.push(`- Cần sửa plan **${c.title}** (id: ${c.taskId}): ${c.note}`);
      for (const q of f.questionsForMe) lines.push(`- Câu hỏi cho bạn ở **${q.title}** (câu hỏi id: ${q.questionId}): ${q.body}`);
      for (const a of f.answersToMyQuestions) lines.push(`- Trả lời cho **${a.title}**: ${a.body} → ${a.answer}`);
      for (const r of f.reviewResults) lines.push(`- Review **${r.title}**: ${r.verdict}${r.note ? ` — ${r.note}` : ''}`);
      return done(lines.length === 1 ? 'Không có phản hồi nào đang chờ.' : lines.join('\n'), f);
    });

  tool('get_my_settings', 'Xem cài đặt của bạn, gồm sendMode (auto = tự gửi, review = duyệt trước khi gửi).',
    {},
    async (_a, actor) => {
      const data = { sendMode: actor.sendMode, displayName: actor.displayName, level: actor.level };
      return done(`${actor.displayName} (${levelLabel(actor.level)}) — chế độ gửi: ${actor.sendMode}.`, data);
    });

  // ------------------------------------------------------------ manager
  tool('team_overview', 'Tổng quan nhóm: bạn và các báo cáo trực tiếp.', {},
    async (_a, actor) => {
      const o = await teamOverview(db, actor, now());
      return done(formatOverview(o), o);
    });

  tool('needs_attention', 'Các mục cần quản lý chú ý.', {},
    async (_a, actor) => {
      const items = await needsAttention(db, actor, now());
      return done(formatAttention(items), items);
    });

  tool('task_detail', 'Chi tiết một việc: plan, cập nhật, câu hỏi.',
    { taskId },
    async ({ taskId: id }, actor) => {
      const d = await taskDetail(db, actor, id, now());
      return done(formatTaskDetail(d), d);
    });

  tool('weekly_digest', 'Tổng kết tuần của các báo cáo trực tiếp.', {},
    async (_a, actor) => {
      const d = await weeklyDigest(db, actor, now());
      return done(formatDigest(d), d);
    });

  tool('confirm_task', 'Xác nhận plan của một việc.',
    { taskId },
    async ({ taskId: id }, actor) => {
      const t = await confirmTask(db, actor, id, now());
      return done('Đã xác nhận.', t);
    });

  tool('request_changes', 'Yêu cầu member sửa plan.',
    { taskId, note: z.string().describe('Ghi chú cần sửa gì') },
    async ({ taskId: id, note }, actor) => {
      const t = await requestChanges(db, actor, id, note, now());
      return done('Đã yêu cầu sửa plan.', t);
    });

  tool('answer_blocker', 'Trả lời vướng mắc/câu hỏi của member.',
    { questionId, answer: z.string().describe('Câu trả lời') },
    async ({ questionId: id, answer }, actor) => {
      const q = await answerQuestion(db, actor, id, answer, now());
      return done('Đã trả lời.', q);
    });

  tool('ask_question', 'Hỏi member một câu hỏi về việc của họ.',
    { taskId, body: z.string().describe('Nội dung câu hỏi') },
    async ({ taskId: id, body }, actor) => {
      const q = await askQuestion(db, actor, id, body, { isBlocker: false }, now());
      return done('Đã gửi câu hỏi.', q);
    });

  tool('review_solution', 'Review tóm tắt giải pháp: approved hoặc changes_needed.',
    {
      taskId,
      verdict: z.enum(['approved', 'changes_needed']),
      note: z.string().optional(),
    },
    async ({ taskId: id, verdict, note }, actor) => {
      const t = await reviewSolution(db, actor, id, verdict, note, now());
      return done('Đã review.', t);
    });
}
