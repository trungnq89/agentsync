import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf8');

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return '';
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

function tokens(mode: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block(mode === 'dark' ? '.dark' : ':root').matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const NAMES = ['background', 'foreground', 'surface', 'surface-muted', 'muted-foreground', 'border', 'input', 'ring',
  'primary', 'primary-foreground',
  ...['success', 'warning', 'danger', 'info'].flatMap((k) => [k, `${k}-soft`, `${k}-foreground`])];

describe('design tokens', () => {
  it.each(['light', 'dark'])('%s: defines every required token', (mode) => {
    const v = tokens(mode);
    for (const n of NAMES) expect(v[n], `${mode} --${n}`).toBeDefined();
  });

  it.each(['light', 'dark'])('%s: AA contrast for required pairs', (mode) => {
    const v = tokens(mode);
    for (const [fg, bg] of [['foreground', 'background'], ['muted-foreground', 'background'], ['foreground', 'surface'],
      ['muted-foreground', 'surface'], ['muted-foreground', 'surface-muted'],
      ['primary-foreground', 'primary'], ['success-foreground', 'success-soft'], ['warning-foreground', 'warning-soft'],
      ['danger-foreground', 'danger-soft'], ['info-foreground', 'info-soft']]) {
      expect(contrast(v[fg], v[bg]), `${mode} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(['light', 'dark'])('%s: timeline track outlines reach 3:1 against the background', (mode) => {
    const v = tokens(mode);
    // Tracks are outlined (ring-1) with these tokens, see BAR in app/_components/Timeline.tsx.
    for (const ring of ['muted-foreground', 'primary', 'success', 'warning', 'danger', 'info']) {
      expect(contrast(v[ring], v.background), `${mode} ${ring} on background`).toBeGreaterThanOrEqual(3);
    }
    // The today line is foreground with a 1px background halo, so over a danger bar the halo must separate it.
    expect(contrast(v.background, v.danger), `${mode} today-line halo on danger bar`).toBeGreaterThanOrEqual(3);
  });

  it('primary is indigo per spec', () => {
    expect(tokens('light').primary.toLowerCase()).toBe('#4f46e5');
    expect(tokens('dark').primary.toLowerCase()).toBe('#818cf8');
  });

  it('uses class-based dark variant and no prefers-color-scheme block', () => {
    expect(css).toContain('@custom-variant dark (&:where(.dark, .dark *));');
    expect(css).not.toContain('prefers-color-scheme');
  });
});
