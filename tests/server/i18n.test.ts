import { afterEach, describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { NAMESPACES } from '@/i18n/config';
import { parseAcceptLanguage, resolveLocale } from '@/i18n/resolve';
import { serverTranslator } from '@/i18n/translator';

function flatKeys(o: unknown, prefix = ''): string[] {
  if (o === null || typeof o !== 'object') return [prefix];
  return Object.entries(o as Record<string, unknown>)
    .flatMap(([k, v]) => flatKeys(v, prefix ? `${prefix}.${k}` : k))
    .sort();
}

describe('i18n', () => {
  const original = process.env.DEFAULT_LOCALE;
  afterEach(() => {
    if (original === undefined) delete process.env.DEFAULT_LOCALE;
    else process.env.DEFAULT_LOCALE = original;
  });

  it('resolveLocale order', () => {
    delete process.env.DEFAULT_LOCALE;
    expect(resolveLocale({ user: 'vi', cookie: 'en', acceptLanguage: 'en' })).toBe('vi');
    expect(resolveLocale({ cookie: 'en', acceptLanguage: 'vi' })).toBe('en');
    expect(resolveLocale({ acceptLanguage: 'fr;q=1, vi-VN;q=0.8' })).toBe('vi');
    process.env.DEFAULT_LOCALE = 'vi';
    expect(resolveLocale({})).toBe('vi');
    process.env.DEFAULT_LOCALE = 'fr';
    expect(resolveLocale({ cookie: 'xx' })).toBe('en');
    process.env.DEFAULT_LOCALE = '';
    expect(resolveLocale({ cookie: 'EN-us' })).toBe('en');
  });

  it('parseAcceptLanguage handles weights and junk', () => {
    expect(parseAcceptLanguage(null)).toBeNull();
    expect(parseAcceptLanguage('fr')).toBeNull();
    expect(parseAcceptLanguage('en;q=0.5, vi;q=0.9')).toBe('vi');
  });

  it('message catalogs have identical key sets', () => {
    expect(flatKeys(vi)).toEqual(flatKeys(en));
  });

  it('catalogs contain every required namespace', () => {
    for (const ns of NAMESPACES) {
      expect(en).toHaveProperty(ns);
      expect(vi).toHaveProperty(ns);
    }
  });

  it('serverTranslator translates', () => {
    expect(serverTranslator('vi', 'theme')('dark')).not.toBe(serverTranslator('en', 'theme')('dark'));
  });
});
