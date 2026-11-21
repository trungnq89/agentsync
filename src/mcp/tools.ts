import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Db } from '@/db/client';
import type { User } from '@/db/schema';
import type { Locale } from '@/i18n/config';
import { serverTranslator } from '@/i18n/translator';
import { isValidIsoDate } from '@/server/clock';
import { DomainError, translateError } from '@/server/errors';
import {
  answerQuestion, askQuestion, getPendingFeedback, postUpdate, resolveQuestion, reviewSolution, submitSolutionSummary,
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
  /** Language of the token owner; all tool output is rendered in it. */
  locale: Locale;
  now?: () => Date;
}

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
  title: z.string().describe('Step title'),
  status: z.enum(['todo', 'doing', 'done']).describe('Step status'),
});
const isoDate = z.string().refine(isValidIsoDate, 'Invalid date, use the YYYY-MM-DD format.');
const taskId = z.string().describe('Task ID (from list_my_tasks)');
const questionId = z.string().describe('Question ID');

export function registerTools(server: McpServer, ctx: ToolCtx): void {
  const { db, locale } = ctx;
  const t = serverTranslator(locale);
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
        if (e instanceof DomainError) {
          const message = translateError(e, locale);
          const hint = e.code === 'NOT_FOUND' && !message.includes('list_my_tasks')
            ? ` ${t('errors.notFoundHint')}` : '';
          return errorReply(message + hint);
        }
        console.error(`[mcp] tool ${name} failed`, e);
        return errorReply(t('errors.systemError'));
      }
    }) as never);
  }

  const done = (markdown: string, data: unknown) => ({ markdown, data });

  // ------------------------------------------------------------ member
  tool('list_my_tasks', 'List your tasks (open ones; include finished tasks with includeDone).',
    { includeDone: z.boolean().optional().describe('Include done/cancelled tasks') },
    async ({ includeDone }, actor) => {
      const list = await listMyTasks(db, actor, { includeDone }, now());
      return done(formatTaskList(t, list), list);
    });

  tool('create_task', 'Create a new task with a plan, pending manager confirmation.',
    {
      title: z.string().describe('Task title'),
      mode: z.enum(['executive', 'project']).describe('executive = no code, project = involves code'),
      agreedOutcome: z.string().describe('Agreed outcome'),
      startDate: isoDate.describe('Start date, YYYY-MM-DD'),
      agreedDueDate: isoDate.describe('Agreed due date, YYYY-MM-DD'),
      steps: z.array(z.string()).describe('Plan steps'),
      isPrivate: z.boolean().optional().describe('Private task, visible only to you'),
      repoRef: z.object({ repo: z.string().optional(), branch: z.string().optional() }).optional(),
      cwdHint: z.string().optional().describe('Suggested working directory'),
    },
    async (input, actor) => {
      const task = await createTask(db, actor, input, now());
      return done(t('mcp.taskCreated', { title: task.title, id: task.id }), task);
    });

  tool('update_progress', 'Post a progress update on one of your tasks.',
    {
      taskId,
      body: z.string().describe('Update text'),
      stepsCompleted: z.array(z.string()).optional().describe('Titles of the steps just completed'),
      progressPct: z.number().int().min(0).max(100).optional().describe('Progress 0-100'),
      expectedEndDate: isoDate.optional().describe('New expected end date, YYYY-MM-DD'),
      source: z.enum(['auto', 'reviewed']).describe('auto = sent by the agent, reviewed = approved by the user'),
      evidence: z.object({
        branch: z.string().optional(), commits: z.number().optional(), prUrl: z.string().optional(),
      }).optional(),
    },
    async ({ taskId: id, ...input }, actor) => {
      const u = await postUpdate(db, actor, id, input, now());
      return done(t('mcp.updateSent'), u);
    });

  tool('revise_plan', 'Revise the plan of a task.',
    {
      taskId,
      steps: z.array(planStep).describe('All steps of the new plan'),
      reason: z.string().optional().describe('Reason for revising the plan'),
      expectedEndDate: isoDate.optional().describe('New expected end date, YYYY-MM-DD'),
    },
    async ({ taskId: id, ...input }, actor) => {
      const task = await changePlan(db, actor, id, input, now());
      return done(t('mcp.planUpdated'), task);
    });

  tool('set_task_status', 'Change the task status: complete, pause, resume or cancel.',
    {
      taskId,
      action: z.enum(['complete', 'pause', 'resume', 'cancel']),
      reason: z.string().optional().describe('Reason (required for pause/cancel)'),
    },
    async ({ taskId: id, action, reason }, actor) => {
      const task = await setTaskStatus(db, actor, id, action, reason, now());
      return done(t('mcp.statusNow', { status: t(`status.${task.status}`) }), task);
    });

  tool('make_task_public', 'Make a private task public so your manager can see it.',
    { taskId },
    async ({ taskId: id }, actor) => {
      const task = await makePublic(db, actor, id, now());
      return done(t('mcp.madePublic'), task);
    });

  tool('report_blocker', 'Report a blocker to your manager.',
    { taskId, body: z.string().describe('Blocker description') },
    async ({ taskId: id, body }, actor) => {
      const q = await askQuestion(db, actor, id, body, { isBlocker: true }, now());
      return done(t('mcp.blockerReported'), q);
    });

  tool('ask_manager', 'Ask your manager a question (not a blocker).',
    { taskId, body: z.string().describe('Question text') },
    async ({ taskId: id, body }, actor) => {
      const q = await askQuestion(db, actor, id, body, { isBlocker: false }, now());
      return done(t('mcp.questionSent'), q);
    });

  tool('answer_question', 'Answer a question from your manager.',
    { questionId, answer: z.string().describe('Answer') },
    async ({ questionId: id, answer }, actor) => {
      const q = await answerQuestion(db, actor, id, answer, now());
      return done(t('mcp.answered'), q);
    });

  tool('resolve_question', 'Mark a question you asked as resolved (after reading the answer).',
    { questionId },
    async ({ questionId: id }, actor) => {
      const q = await resolveQuestion(db, actor, id);
      return done(t('mcp.resolved'), q);
    });

  tool('submit_solution_summary', 'Submit a solution summary (project-mode tasks) for review.',
    {
      taskId,
      problem: z.string(), solution: z.string(), rejectedAlternatives: z.string(),
      keyChanges: z.string(), risks: z.string(), testing: z.string(),
      prUrl: z.string().optional(),
    },
    async ({ taskId: id, ...input }, actor) => {
      const s = await submitSolutionSummary(db, actor, id, input, now());
      return done(t('mcp.summarySubmitted'), s);
    });

  tool('get_pending_feedback', 'Show pending feedback: plan change requests, questions, answers, review results.',
    {},
    async (_a, actor) => {
      const f = await getPendingFeedback(db, actor);
      const lines = [`## ${t('mcp.feedbackHeading')}`];
      for (const c of f.changesRequested) lines.push(t('mcp.feedbackChanges', { title: c.title, id: c.taskId, note: c.note }));
      for (const q of f.questionsForMe) lines.push(t('mcp.feedbackQuestion', { title: q.title, id: q.questionId, body: q.body }));
      for (const a of f.answersToMyQuestions) lines.push(t('mcp.feedbackAnswer', { title: a.title, body: a.body, answer: a.answer }));
      for (const rv of f.reviewResults) {
        lines.push(
          t('mcp.feedbackReview', { title: rv.title, verdict: t(`verdict.${rv.verdict}`) }) +
            (rv.note ? t('mcp.feedbackReviewNote', { note: rv.note }) : ''),
        );
      }
      return done(lines.length === 1 ? t('mcp.feedbackNone') : lines.join('\n'), f);
    });

  tool('get_my_settings', 'Show your settings, including sendMode (auto = send automatically, review = review before sending).',
    {},
    async (_a, actor) => {
      const data = { sendMode: actor.sendMode, displayName: actor.displayName, level: actor.level };
      return done(t('mcp.settingsLine', { name: actor.displayName, level: t(`level.${actor.level}`), mode: t(`sendMode.${actor.sendMode}`) }), data);
    });

  // ------------------------------------------------------------ manager
  tool('team_overview', 'Team overview: you and your direct reports.', {},
    async (_a, actor) => {
      const o = await teamOverview(db, actor, now());
      return done(formatOverview(t, o), o);
    });

  tool('needs_attention', 'Items that need the manager\'s attention.', {},
    async (_a, actor) => {
      const items = await needsAttention(db, actor, now());
      return done(formatAttention(t, items), items);
    });

  tool('task_detail', 'Task details: plan, updates, questions.',
    { taskId },
    async ({ taskId: id }, actor) => {
      const d = await taskDetail(db, actor, id, now());
      return done(formatTaskDetail(t, d), d);
    });

  tool('weekly_digest', 'Weekly digest of your direct reports.', {},
    async (_a, actor) => {
      const d = await weeklyDigest(db, actor, now());
      return done(formatDigest(t, d), d);
    });

  tool('confirm_task', 'Confirm the plan of a task.',
    { taskId },
    async ({ taskId: id }, actor) => {
      const task = await confirmTask(db, actor, id, now());
      return done(t('mcp.confirmed'), task);
    });

  tool('request_changes', 'Ask the member to revise the plan.',
    { taskId, note: z.string().describe('Note describing what to change') },
    async ({ taskId: id, note }, actor) => {
      const task = await requestChanges(db, actor, id, note, now());
      return done(t('mcp.changesRequested'), task);
    });

  tool('answer_blocker', 'Answer a member\'s blocker or question.',
    { questionId, answer: z.string().describe('Answer') },
    async ({ questionId: id, answer }, actor) => {
      const q = await answerQuestion(db, actor, id, answer, now());
      return done(t('mcp.answered'), q);
    });

  tool('ask_question', 'Ask a member a question about their task.',
    { taskId, body: z.string().describe('Question text') },
    async ({ taskId: id, body }, actor) => {
      const q = await askQuestion(db, actor, id, body, { isBlocker: false }, now());
      return done(t('mcp.questionSent'), q);
    });

  tool('review_solution', 'Review a solution summary: approved or changes_needed. note is required when verdict is changes_needed.',
    {
      taskId,
      verdict: z.enum(['approved', 'changes_needed']),
      note: z.string().optional().describe('Required when verdict is changes_needed'),
    },
    async ({ taskId: id, verdict, note }, actor) => {
      const task = await reviewSolution(db, actor, id, verdict, note, now());
      return done(t('mcp.reviewResult', { verdict: t(`verdict.${verdict}`) }), task);
    });
}
