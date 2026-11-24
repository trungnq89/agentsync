const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** True when `url` is plain http:// to a non-local host, so tokens would travel unencrypted. */
export function isInsecureAppUrl(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!/^http:\/\//i.test(trimmed)) return false;
  try {
    return !LOCAL_HOSTS.has(new URL(trimmed).hostname.toLowerCase());
  } catch {
    return false;
  }
}
