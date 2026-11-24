const DAY_MS = 86_400_000;

/** Days left (rounded up) until `expiresAt`, or null once it has passed. */
export function tokenDaysLeft(expiresAt: Date, now: Date = new Date()): number | null {
  const left = expiresAt.getTime() - now.getTime();
  return left <= 0 ? null : Math.ceil(left / DAY_MS);
}
