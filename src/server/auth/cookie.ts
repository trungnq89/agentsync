/** Secure flag for the session cookie: COOKIE_SECURE ('true'/'false') wins, else APP_URL's scheme. */
export function cookieSecure(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.COOKIE_SECURE?.trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return (env.APP_URL ?? '').startsWith('https://');
}
