export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = 'theme';

export function isTheme(x: unknown): x is Theme {
  return typeof x === 'string' && (THEMES as readonly string[]).includes(x);
}

/** Inline script run before first paint: sets the `dark` class from the `theme` cookie. */
export const themeInitScript = `(function(){try{var m=document.cookie.match(/(?:^|; )theme=([^;]*)/);var t=m?decodeURIComponent(m[1]):'system';var d=t==='dark'||((t!=='light')&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;
