const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Ho_Chi_Minh, no DST
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
