import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const SCAN_DIRS = ['app', 'components', 'src/server', 'src/mcp'];
const SKIP_DIRS = new Set(['node_modules', 'tests', 'messages', '.next']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const files = SCAN_DIRS.flatMap((d) => walk(join(root, d)));
const rel = (f: string) => relative(root, f);

// JSX text nodes that may legitimately be literal. Each entry needs a reason.
const JSX_TEXT_ALLOWLIST: Record<string, string> = {
  AgentSync: 'product brand name, identical in every language',
};

describe('hardcoded strings guard', () => {
  it('no Vietnamese diacritics in app/, components/, src/server, src/mcp', () => {
    const bad = files.filter((f) => /[À-ỹ]/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(bad).toEqual([]);
  });

  it('no literal JSX text nodes outside the allowlist', () => {
    const bad: string[] = [];
    for (const f of files.filter((x) => x.endsWith('.tsx'))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/>\s*([A-Za-zÀ-ỹ][^<{>]*)</g)) {
        const text = m[1].trim();
        const before = src[(m.index ?? 0) - 1];
        if (before === '=' || before === '-') continue; // arrow function `=>`, `->`
        if (JSX_TEXT_ALLOWLIST[text]) continue;
        // Skip generics/comparisons in plain TS: require a closing-tag-like context on the same text.
        if (/[;(){}=]/.test(text)) continue;
        bad.push(`${rel(f)}: "${text}"`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('SKILL.md bodies are English', () => {
    const dir = join(root, 'plugins/agentsync/skills');
    for (const s of readdirSync(dir)) {
      expect(/[À-ỹ]/.test(readFileSync(join(dir, s, 'SKILL.md'), 'utf8')), `${s} contains Vietnamese`).toBe(false);
    }
  });

  it('README cross-links', () => {
    const first = (p: string) => readFileSync(join(root, p), 'utf8').split('\n')[0];
    expect(first('README.md')).toContain('README.vi.md');
    expect(first('README.vi.md')).toContain('README.md');
    expect(first('docs/install-agent.md')).toContain('install-agent.vi.md');
    expect(first('docs/install-agent.vi.md')).toContain('install-agent.md');
  });
});
