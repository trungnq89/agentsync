import type { Locale } from '@/i18n/config';
import { serverTranslator } from '@/i18n/translator';
import { attentionDetail } from '@/i18n/attention';
import type { DigestData } from './collect';
import { isDigestEmpty } from './collect';

const MAX_ITEMS = 10;
const MAX_TITLE = 150;
const MAX_NOTE = 200;
/** Slack allows 3000 characters per section; stay clear of it. */
const SECTION_LIMIT = 2900;
const MAX_BLOCKS = 50;

/** Slack mrkdwn control characters; user text must not be able to form links or mentions. */
export function escapeMrkdwn(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Collapse whitespace, cut to `max` characters, then escape. */
function clip(raw: string, max: number): string {
  const flat = raw.replace(/\s+/g, ' ').trim().normalize('NFC');
  const graphemes = Array.from(SEGMENTER.segment(flat), (x) => x.segment);
  const cut = graphemes.length > max ? `${graphemes.slice(0, max - 1).join('')}…` : flat;
  return escapeMrkdwn(cut);
}

type BuildOpts = { locale: Locale; timezone: string; appUrl: string; now: Date; test?: boolean };
type Block = { type: string; [k: string]: unknown };

export function buildDigest(d: DigestData, opts: BuildOpts): { text: string; blocks: unknown[] } {
  const t = serverTranslator(opts.locale, 'digest');
  const ta = serverTranslator(opts.locale, 'attention');
  const base = opts.appUrl.replace(/\/+$/, '');
  const link = (taskId: string, title: string) => `<${base}/tasks/${taskId}|${clip(title, MAX_TITLE)}>`;
  const dateStr = new Intl.DateTimeFormat(opts.locale, { timeZone: opts.timezone, dateStyle: 'medium' }).format(opts.now);
  const fmtDue = (iso: string) =>
    new Intl.DateTimeFormat(opts.locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const header = t('header', { date: dateStr });

  const blocks: Block[] = [{ type: 'header', text: { type: 'plain_text', text: header.slice(0, 150) } }];
  const section = (lines: string[]) => {
    // Split into chunks so no section exceeds Slack's text limit.
    let cur: string[] = [];
    let len = 0;
    for (const line of lines) {
      if (cur.length > 0 && len + line.length + 1 > SECTION_LIMIT) {
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: cur.join('\n') } });
        cur = []; len = 0;
      }
      cur.push(line); len += line.length + 1;
    }
    if (cur.length > 0) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: cur.join('\n') } });
  };
  const group = (title: string, rows: string[]) => {
    if (rows.length === 0) return;
    const shown = rows.slice(0, MAX_ITEMS).map((r) => `• ${r}`);
    const lines = [`*${title}*`, ...shown];
    if (rows.length > MAX_ITEMS) lines.push(`<${base}/|${t('more', { count: rows.length - MAX_ITEMS })}>`);
    section(lines);
  };

  if (opts.test) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: t('testNotice') }] });
    if (isDigestEmpty(d)) section([t('nothing')]);
  }

  const { manager: mg, mine } = d;
  const attn = (i: DigestData['manager']['awaiting'][number]) => {
    const detail = clip(attentionDetail(ta as never, i), MAX_NOTE);
    return `${link(i.taskId, i.taskTitle)} — ${clip(i.ownerName, 60)}: ${ta(i.kind)}${detail ? ` (${detail})` : ''}`;
  };
  if (mg.awaiting.length + mg.problems.length > 0 || mg.team) {
    group(t('awaiting'), mg.awaiting.map(attn));
    group(t('problems'), mg.problems.map(attn));
    if (mg.team) section([t('team', mg.team)]);
  }

  const mineBlocksStart = blocks.length;
  group(t('rejected'), mine.rejected.map((r) => `${link(r.taskId, r.title)} — ${clip(r.stepTitle, 80)}${r.note ? `: ${clip(r.note, MAX_NOTE)}` : ''}`));
  group(t('changesRequested'), mine.changesRequested.map((c) => `${link(c.taskId, c.title)}${c.note ? ` — ${clip(c.note, MAX_NOTE)}` : ''}`));
  group(t('questions'), mine.questionsForMe.map((q) => `${link(q.taskId, q.title)} — ${clip(q.body, MAX_NOTE)}`));
  group(t('answers'), mine.answers.map((a) => `${link(a.taskId, a.title)} — ${clip(a.answer, MAX_NOTE)}`));
  group(t('dueSoon'), mine.dueSoon.map((x) => `${link(x.taskId, x.title)} — ${x.overdue ? t('overdue', { date: fmtDue(x.dueDate) }) : t('due', { date: fmtDue(x.dueDate) })}`));
  if (mine.pendingApprovalSteps > 0) section([t('pendingSteps', { count: mine.pendingApprovalSteps })]);
  if (blocks.length > mineBlocksStart) blocks.splice(mineBlocksStart, 0, { type: 'divider' });

  // Safety net: never exceed Slack's block limit.
  if (blocks.length > MAX_BLOCKS) blocks.length = MAX_BLOCKS;

  const count = mg.awaiting.length + mg.problems.length + mine.rejected.length + mine.changesRequested.length +
    mine.questionsForMe.length + mine.answers.length + mine.dueSoon.length;
  return { text: `${header} — ${t('summary', { count })}`, blocks };
}
