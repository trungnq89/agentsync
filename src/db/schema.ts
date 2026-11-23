import { sql } from 'drizzle-orm';
import {
  pgTable, pgEnum, uuid, text, boolean, integer, date, jsonb, timestamp, unique, check, uniqueIndex, type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const userLevel = pgEnum('user_level', ['director', 'manager', 'leader', 'member']);
export const taskMode = pgEnum('task_mode', ['executive', 'project']);
export const taskStatus = pgEnum('task_status', [
  'pending_confirmation', 'changes_requested', 'in_progress', 'paused',
  'done', 'awaiting_review', 'closed', 'cancelled',
]);
export const sendMode = pgEnum('send_mode', ['auto', 'review']);
export const blockerStatus = pgEnum('blocker_status', ['open', 'answered', 'resolved']);
export const questionDirection = pgEnum('question_direction', ['member_to_manager', 'manager_to_member']);
export const reviewVerdict = pgEnum('review_verdict', ['approved', 'changes_needed']);
export const planChangeKind = pgEnum('plan_change_kind', ['initial', 'edit', 'revision']);
export const updateSource = pgEnum('update_source', ['auto', 'reviewed']);

export type PlanStep = {
  title: string;
  status: 'todo' | 'doing' | 'pending_approval' | 'done';
  confirmedBy?: 'member' | 'manager';
  confirmedById?: string;
  confirmedAt?: string; // ISO
};

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts('created_at').notNull().defaultNow();

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  passwordHash: text('password_hash').notNull(),
  level: userLevel('level').notNull().default('member'),
  managerId: uuid('manager_id').references((): AnyPgColumn => users.id),
  isAdmin: boolean('is_admin').notNull().default(false),
  sendMode: sendMode('send_mode').notNull().default('review'),
  locale: text('locale'),
  theme: text('theme').notNull().default('system'),
  disabledAt: ts('disabled_at'),
  email: text('email'),
  odooEmployeeId: integer('odoo_employee_id').unique(),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  source: text('source').notNull().default('local'),
  checkpointConfirmer: text('checkpoint_confirmer').notNull().default('member'),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`),
  check('users_source_check', sql`${t.source} in ('local','odoo')`),
  check('users_locale_check', sql`${t.locale} in ('en','vi')`),
  check('users_checkpoint_confirmer_check', sql`${t.checkpointConfirmer} in ('member','manager')`),
  check('users_theme_check', sql`${t.theme} in ('system','light','dark')`),
]);

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  expiresAt: ts('expires_at').notNull(),
});

export const agentTokens = pgTable('agent_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  label: text('label').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  prefix: text('prefix').notNull(),
  createdAt: createdAt(),
  lastUsedAt: ts('last_used_at'),
  revokedAt: ts('revoked_at'),
});

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id),
  confirmerIdAtCreation: uuid('confirmer_id_at_creation').references(() => users.id),
  title: text('title').notNull(),
  mode: taskMode('mode').notNull(),
  status: taskStatus('status').notNull().default('pending_confirmation'),
  isPrivate: boolean('is_private').notNull().default(false),
  agreedOutcome: text('agreed_outcome').notNull(),
  startDate: date('start_date').notNull(),
  agreedDueDate: date('agreed_due_date').notNull(),
  expectedEndDate: date('expected_end_date').notNull(),
  progressOverride: integer('progress_override'),
  repoRef: jsonb('repo_ref').$type<{ repo?: string; branch?: string }>(),
  cwdHint: text('cwd_hint'),
  createdAt: createdAt(),
  confirmedAt: ts('confirmed_at'),
  completedAt: ts('completed_at'),
  statusChangedAt: ts('status_changed_at').notNull().defaultNow(),
  statusReason: text('status_reason'),
});

export const planVersions = pgTable('plan_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id),
  version: integer('version').notNull(),
  kind: planChangeKind('kind').notNull(),
  reason: text('reason'),
  steps: jsonb('steps').$type<PlanStep[]>().notNull(),
  createdAt: createdAt(),
}, (t) => [unique('plan_versions_task_version_uq').on(t.taskId, t.version)]);

export const checkpointReviews = pgTable('checkpoint_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id),
  stepTitle: text('step_title').notNull(),
  decision: text('decision').notNull(),
  note: text('note'),
  reviewerId: uuid('reviewer_id').notNull().references(() => users.id),
  createdAt: createdAt(),
  consumedAt: ts('consumed_at'),
}, (t) => [
  check('checkpoint_reviews_decision_check', sql`${t.decision} in ('approved','rejected')`),
]);

export const updates = pgTable('updates', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id),
  authorId: uuid('author_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  stepsCompleted: jsonb('steps_completed').$type<string[]>().notNull().default([]),
  source: updateSource('source').notNull(),
  evidence: jsonb('evidence').$type<{ branch?: string; commits?: number; prUrl?: string }>(),
  createdAt: createdAt(),
  editedAt: ts('edited_at'),
});

export const questions = pgTable('questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id),
  authorId: uuid('author_id').notNull().references(() => users.id),
  direction: questionDirection('direction').notNull(),
  body: text('body').notNull(),
  isBlocker: boolean('is_blocker').notNull().default(false),
  status: blockerStatus('status').notNull().default('open'),
  answer: text('answer'),
  answeredById: uuid('answered_by_id').references(() => users.id),
  answeredAt: ts('answered_at'),
  createdAt: createdAt(),
  editedAt: ts('edited_at'),
});

export const solutionSummaries = pgTable('solution_summaries', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().unique().references(() => tasks.id),
  problem: text('problem').notNull(),
  solution: text('solution').notNull(),
  rejectedAlternatives: text('rejected_alternatives').notNull(),
  keyChanges: text('key_changes').notNull(),
  risks: text('risks').notNull(),
  testing: text('testing').notNull(),
  prUrl: text('pr_url'),
  createdAt: createdAt(),
});

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id),
  reviewerId: uuid('reviewer_id').notNull().references(() => users.id),
  verdict: reviewVerdict('verdict').notNull(),
  note: text('note'),
  createdAt: createdAt(),
});

export const managerFeedback = pgTable('manager_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id),
  authorId: uuid('author_id').notNull().references(() => users.id),
  kind: text('kind', { enum: ['changes_requested'] }).notNull(),
  note: text('note').notNull(),
  createdAt: createdAt(),
  consumedAt: ts('consumed_at'),
});

export const appSettings = pgTable('app_settings', {
  id: integer('id').primaryKey().default(1),
  staleBusinessDays: integer('stale_business_days').notNull().default(3),
}, (t) => [check('app_settings_singleton', sql`${t.id} = 1`)]);

export type TitleMapping = { pattern: string; level: 'director' | 'manager' | 'leader' | 'member' };

export const odooSettings = pgTable('odoo_settings', {
  id: integer('id').primaryKey().default(1),
  url: text('url'),
  database: text('database'),
  login: text('login'),
  apiKeyEnc: text('api_key_enc'),
  mode: text('mode').notNull().default('review'),
  scheduleHours: integer('schedule_hours').notNull().default(0),
  titleMappingEnabled: boolean('title_mapping_enabled').notNull().default(false),
  titleMappings: jsonb('title_mappings').$type<TitleMapping[]>().notNull().default([]),
}, (t) => [
  check('odoo_settings_singleton', sql`${t.id} = 1`),
  check('odoo_settings_mode_check', sql`${t.mode} in ('full','incremental','review')`),
  check('odoo_settings_schedule_check', sql`${t.scheduleHours} in (0,1,6,24)`),
]);

export type OdooRunCounts = Record<string, number>;

export const odooSyncRuns = pgTable('odoo_sync_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  mode: text('mode').notNull(),
  trigger: text('trigger').notNull(),
  actorId: uuid('actor_id').references(() => users.id),
  startedAt: ts('started_at').notNull().defaultNow(),
  finishedAt: ts('finished_at'),
  status: text('status').notNull(),
  counts: jsonb('counts').$type<OdooRunCounts>().notNull().default({}),
  preview: jsonb('preview').$type<unknown>(),
  errorKey: text('error_key'),
}, (t) => [
  check('odoo_sync_runs_mode_check', sql`${t.mode} in ('full','incremental','review')`),
  check('odoo_sync_runs_trigger_check', sql`${t.trigger} in ('manual','schedule')`),
  check('odoo_sync_runs_status_check', sql`${t.status} in ('running','previewed','applied','failed')`),
]);

export const pendingCredentials = pgTable('pending_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  runId: uuid('run_id').notNull().references(() => odooSyncRuns.id),
  secretEnc: text('secret_enc').notNull(),
  createdAt: createdAt(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type AgentToken = typeof agentTokens.$inferSelect;
