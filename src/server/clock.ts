export const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Ho_Chi_Minh, no DST
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole Mon-Fri days elapsed between two instants, measured in Vietnam time.
 * Only time that falls on Mon-Fri (VN) counts; the total is floored to whole days.
 */
export function businessDaysBetween(from: Date, to: Date): number {
  const start = from.getTime() + VN_OFFSET_MS;
  const end = to.getTime() + VN_OFFSET_MS;
  if (end <= start) return 0;
  let total = 0;
  let dayStart = Math.floor(start / DAY_MS) * DAY_MS;
  for (; dayStart < end; dayStart += DAY_MS) {
    const dow = new Date(dayStart).getUTCDay(); // shifted clock: UTC fields == VN fields
    if (dow === 0 || dow === 6) continue;
    total += Math.min(end, dayStart + DAY_MS) - Math.max(start, dayStart);
  }
  return Math.floor(total / DAY_MS);
}

export function isWithinHours(start: Date, now: Date, hours: number): boolean {
  return now.getTime() - start.getTime() <= hours * 60 * 60 * 1000;
}

/** Calendar date ('YYYY-MM-DD') in Asia/Ho_Chi_Minh for the given instant. */
export function vnDateString(now: Date): string {
  return new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Strict YYYY-MM-DD that is a real calendar date. */
export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export const BAD_DATE = 'Ngày không hợp lệ, dùng định dạng YYYY-MM-DD.';
