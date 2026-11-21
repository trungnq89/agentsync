import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from '@/mcp/tools';
import { testDb } from '../helpers/db';

const root = join(process.cwd(), 'plugins/agentsync');
const skills = ['agentsync-plan', 'agentsync-session', 'agentsync-manager'];
const skillPath = (s: string) => join(root, 'skills', s, 'SKILL.md');

// Collect registered tool names and input field names from the real registerTools.
function registered() {
  const tools = new Set<string>();
  const fields = new Set<string>();
  const stub = {
    registerTool(name: string, cfg: { inputSchema?: Record<string, unknown> }) {
      tools.add(name);
      for (const k of Object.keys(cfg.inputSchema ?? {})) fields.add(k);
    },
  } as unknown as McpServer;
  registerTools(stub, { db: testDb, locale: 'en', getActor: () => { throw new Error('unused'); } });
  return { tools, fields };
}

const NON_TOOL_SNAKE = new Set(['changes_needed', 'in_progress']); // enum values, not tools
const EXTRA_FIELDS = new Set(['sendMode']); // output field of get_my_settings

function frontmatter(md: string): Record<string, string> {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return {};
  return Object.fromEntries(
    m[1].split('\n').map((l) => l.match(/^([a-z-]+):\s*(.+)$/)).filter(Boolean).map((x) => [x![1], x![2]]),
  );
}

describe('agent plugin files', () => {
  it('each SKILL.md has name and description frontmatter', () => {
    for (const s of skills) {
      expect(existsSync(skillPath(s)), `${s} missing`).toBe(true);
      const fm = frontmatter(readFileSync(skillPath(s), 'utf8'));
      expect(fm.name).toBe(s);
      expect(fm.description?.length ?? 0).toBeGreaterThan(20);
    }
  });

  it('every tool and field named in skills exists in registerTools', () => {
    const { tools, fields } = registered();
    for (const s of skills) {
      const md = readFileSync(skillPath(s), 'utf8');
      for (const [, tok] of md.matchAll(/`([A-Za-z_.]+)`/g)) {
        for (const part of tok.split('.')) {
          if (/^[a-z]+(_[a-z]+)+$/.test(part) && !NON_TOOL_SNAKE.has(part)) {
            expect(tools.has(part), `${s}: unknown tool \`${part}\``).toBe(true);
          } else if (/^[a-z]+([A-Z][a-z]+)+$/.test(part)) {
            expect(fields.has(part) || EXTRA_FIELDS.has(part), `${s}: unknown field \`${part}\``).toBe(true);
          }
        }
      }
    }
  });

  it('skills reference the key tools and sendMode review rule', () => {
    const read = (s: string) => readFileSync(skillPath(s), 'utf8');
    for (const t of ['get_my_settings', 'create_task']) expect(read('agentsync-plan')).toContain(`\`${t}\``);
    for (const t of ['get_pending_feedback', 'list_my_tasks', 'update_progress', 'report_blocker', 'submit_solution_summary', 'set_task_status'])
      expect(read('agentsync-session')).toContain(`\`${t}\``);
    for (const t of ['team_overview', 'needs_attention', 'confirm_task', 'request_changes', 'review_solution'])
      expect(read('agentsync-manager')).toContain(`\`${t}\``);
    expect(read('agentsync-session')).toContain('sendMode');
  });

  it('.mcp.json and plugin.json are valid and point at the MCP endpoint', () => {
    const mcp = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8'));
    const srv = mcp.mcpServers.agentsync;
    expect(srv.type).toBe('http');
    expect(srv.url).toBe('${AGENTSYNC_URL}/api/mcp');
    expect(srv.headers.Authorization).toBe('Bearer ${AGENTSYNC_TOKEN}');
    const manifest = JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8'));
    expect(manifest.name).toBe('agentsync');
  });

  it('codex README and install guide exist', () => {
    expect(existsSync(join(root, 'codex/README.md'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'docs/install-agent.md'))).toBe(true);
  });

  it('Claude Code hooks.json runs a Stop hook pointing at the real script', () => {
    const cfg = JSON.parse(readFileSync(join(root, 'hooks/hooks.json'), 'utf8'));
    const h = cfg.hooks.Stop[0].hooks[0];
    expect(h.type).toBe('command');
    expect(h.timeout).toBe(10);
    expect(h.command).toContain('${CLAUDE_PLUGIN_ROOT}/hooks/agentsync-hook.mjs');
    expect(h.command).toContain('--agent claude');
    expect(existsSync(join(root, 'hooks/agentsync-hook.mjs'))).toBe(true);
  });

  it('Antigravity hook template points at the real script and is marked untested', () => {
    const cfg = JSON.parse(readFileSync(join(root, 'antigravity/hooks.json'), 'utf8'));
    const text = JSON.stringify(cfg);
    expect(text).toContain('agentsync-hook.mjs');
    expect(text).toContain('--agent antigravity');
    expect(existsSync(join(root, 'hooks/agentsync-hook.mjs'))).toBe(true);
    expect(readFileSync(join(root, 'antigravity/README.md'), 'utf8')).toMatch(/not tested/i);
  });

  it('member skills print the AGENTSYNC markers', () => {
    const read = (s: string) => readFileSync(skillPath(s), 'utf8');
    expect(read('agentsync-plan')).toContain('AGENTSYNC-TASK:');
    expect(read('agentsync-session')).toContain('AGENTSYNC-TASK:');
    expect(read('agentsync-session')).toContain('AGENTSYNC-CHECKPOINT:');
  });

  it('codex README documents the Stop hook', () => {
    const md = readFileSync(join(root, 'codex/README.md'), 'utf8');
    expect(md).toContain('hooks.json');
    expect(md).toContain('/hooks');
    expect(md).toContain('AGENTSYNC_URL');
  });

  it('install docs have the Checkpoint hook section in both languages', () => {
    const en = readFileSync(join(process.cwd(), 'docs/install-agent.md'), 'utf8');
    const vi = readFileSync(join(process.cwd(), 'docs/install-agent.vi.md'), 'utf8');
    for (const [md, h] of [[en, '## 5. Checkpoint hook'], [vi, '## 5. Checkpoint hook']] as const) {
      expect(md).toContain(h);
      expect(md).toContain('AGENTSYNC_HOOK=off');
      expect(md).toContain('Node');
      expect(md).toContain('~/.agentsync');
      expect(md).toContain('Antigravity');
    }
  });
});
