import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { users, type User } from '@/db/schema';
import { DomainError } from '../errors';

export type SlackMessage = { text: string; blocks?: unknown[] };

// Whole-token / workspace problems: Task 4 stops the run on these instead of failing each user.
const AUTH_ERRORS = new Set([
  'invalid_auth', 'not_authed', 'account_inactive', 'token_revoked', 'token_expired', 'missing_scope',
  'not_allowed_token_type', 'no_permission', 'team_access_not_granted', 'access_denied', 'ekm_access_denied',
  'messages_tab_disabled', 'org_login_required',
]);
const RATE_LIMITED = new Set(['ratelimited', 'rate_limited', 'message_limit_exceeded']);
const RECIPIENT_GONE = new Set(['user_not_found', 'channel_not_found', 'is_archived']);

/** Error params carry only Slack's own error code (never the token or message text). */
function slackError(code: string, retryAfter?: number): DomainError {
  const safe = code.replace(/[^a-z0-9_]/gi, '').slice(0, 64) || 'unknown';
  if (AUTH_ERRORS.has(code)) return new DomainError('VALIDATION', 'slackAuthFailed', { code: safe });
  if (code === 'users_not_found') return new DomainError('VALIDATION', 'slackUserNotFound', { code: safe });
  if (RECIPIENT_GONE.has(code)) return new DomainError('VALIDATION', 'slackRecipientGone', { code: safe });
  if (RATE_LIMITED.has(code)) return new DomainError('VALIDATION', 'slackRateLimited', { code: safe, retryAfter: retryAfter ?? 60 });
  return new DomainError('VALIDATION', 'slackUnavailable', { code: safe });
}

export function createSlackClient(
  token: string,
  baseUrl: string = process.env.SLACK_API_BASE ?? 'https://slack.com/api',
  opts: { timeoutMs?: number } = {},
) {
  const timeoutMs = opts.timeoutMs ?? 10000;
  const root = baseUrl.trim().replace(/\/+$/, '');

  async function call(method: string, payload: Record<string, unknown>, form = false): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await fetch(`${root}/${method}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json; charset=utf-8',
        },
        body: form ? new URLSearchParams(payload as Record<string, string>).toString() : JSON.stringify(payload),
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw slackError('request_failed');
    }
    if (res.status === 429) {
      const ra = Number(res.headers.get('retry-after'));
      throw slackError('ratelimited', Number.isFinite(ra) && ra > 0 ? ra : undefined);
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw slackError(res.ok ? 'bad_response' : `http_${res.status}`);
    }
    const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    if (!res.ok) throw slackError(typeof d.error === 'string' ? d.error : `http_${res.status}`);
    if (d.ok !== true) throw slackError(typeof d.error === 'string' ? d.error : 'unknown');
    return d;
  }

  return {
    async authTest(): Promise<{ team: string; botName: string }> {
      const d = await call('auth.test', {});
      return { team: String(d.team ?? ''), botName: String(d.user ?? '') };
    },
    async lookupByEmail(email: string): Promise<string> {
      const d = await call('users.lookupByEmail', { email }, true);
      const id = (d.user as { id?: unknown } | undefined)?.id;
      if (typeof id !== 'string' || !id) throw slackError('bad_response');
      return id;
    },
    async postMessage(channel: string, msg: SlackMessage): Promise<void> {
      await call('chat.postMessage', { channel, text: msg.text, ...(msg.blocks ? { blocks: msg.blocks } : {}) });
    },
  };
}

export type SlackClient = ReturnType<typeof createSlackClient>;

type RecipientUser = Pick<User, 'id' | 'email' | 'slackUserId'>;

export interface DigestTransport {
  channel: 'slack';
  /** Cached slackUserId, else lookup by email and cache. Throws noEmail | slackUserNotFound. */
  resolveRecipient(db: Db, user: RecipientUser): Promise<string>;
  /** Resolves, posts, and on slackRecipientGone clears the cached id (only if unchanged) before rethrowing. */
  send(db: Db, user: RecipientUser, msg: SlackMessage): Promise<void>;
}

export function slackTransport(client: SlackClient): DigestTransport {
  async function resolveRecipient(db: Db, user: RecipientUser): Promise<string> {
    if (user.slackUserId) return user.slackUserId;
    const email = user.email?.trim().toLowerCase();
    if (!email) throw new DomainError('VALIDATION', 'noEmail');
    const id = await client.lookupByEmail(email);
    await db.update(users).set({ slackUserId: id }).where(eq(users.id, user.id));
    return id;
  }
  return {
    channel: 'slack',
    resolveRecipient,
    async send(db, user, msg) {
      const recipient = await resolveRecipient(db, user);
      try {
        await client.postMessage(recipient, msg);
      } catch (e) {
        if (e instanceof DomainError && e.key === 'slackRecipientGone') {
          await db.update(users).set({ slackUserId: null }).where(and(eq(users.id, user.id), eq(users.slackUserId, recipient)));
        }
        throw e;
      }
    },
  };
}
