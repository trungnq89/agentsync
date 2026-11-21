import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { DomainError, translateError } from '@/server/errors';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}
const root = process.cwd();

describe('DomainError keys', () => {
  it('every DomainError key used in src/server and app exists in both catalogs', () => {
    const files = [...walk(join(root, 'src/server')), ...walk(join(root, 'app'))];
    const keys = new Set<string>();
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/new DomainError\(\s*'[A-Z_]+',\s*'([A-Za-z]+)'/g)) keys.add(m[1]);
    }
    expect(keys.size).toBeGreaterThan(40);
    for (const k of [...keys, 'notFoundHint']) {
      expect(en.errors, k).toHaveProperty(k);
      expect(vi.errors, k).toHaveProperty(k);
    }
  });

  it('no Vietnamese diacritics remain in src/server or src/mcp', () => {
    const files = [...walk(join(root, 'src/server')), ...walk(join(root, 'src/mcp'))];
    const bad = files.filter((f) => /[À-ỹ]/.test(readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });

  it('exposes key, params and message=key', () => {
    const e = new DomainError('NOT_FOUND', 'notFoundTask', { a: 1 });
    expect(e.key).toBe('notFoundTask');
    expect(e.message).toBe('notFoundTask');
    expect(e.params).toEqual({ a: 1 });
  });

  it('translateError vi vs en', () => {
    const e = new DomainError('NOT_FOUND', 'notFoundUser');
    expect(translateError(e, 'vi')).toContain('Không tìm thấy');
    expect(translateError(e, 'en')).toContain('not found');
  });

  it('translateError translates status and action ids', () => {
    const e = new DomainError('INVALID_TRANSITION', 'invalidTransition', { action: 'complete', status: 'paused' });
    expect(translateError(e, 'vi')).toContain('Hoàn thành');
    expect(translateError(e, 'vi')).toContain('Tạm dừng');
    expect(translateError(e, 'en')).toContain('Complete');
    expect(translateError(e, 'en')).toContain('Paused');
  });
});
