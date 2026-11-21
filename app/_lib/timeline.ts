export const DAY_MS = 86_400_000;
export const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);

export interface Axis { min: number; max: number; span: number }

/** Axis from min(startDate)-3d to max(expectedEndDate)+7d (end inclusive), always containing today. */
export function computeAxis(
  tasks: { startDate: string; expectedEndDate: string }[],
  todayStr: string,
): Axis {
  const today = dayMs(todayStr);
  const min = Math.min(today, ...tasks.map((t) => dayMs(t.startDate))) - 3 * DAY_MS;
  const max = Math.max(today, ...tasks.map((t) => dayMs(t.expectedEndDate) + DAY_MS)) + 7 * DAY_MS;
  return { min, max, span: max - min };
}

/** Position of a date on the axis as a percentage, clamped to 0-100. */
export function position(dateStr: string, axis: Axis): number {
  const p = ((dayMs(dateStr) - axis.min) / axis.span) * 100;
  return Math.min(100, Math.max(0, p));
}

/** Bar geometry; the end day is inclusive so a one-day task still has width. */
export function barSpan(startDate: string, expectedEndDate: string, axis: Axis): { left: number; width: number } {
  const left = position(startDate, axis);
  const end = Math.min(100, ((dayMs(expectedEndDate) + DAY_MS - axis.min) / axis.span) * 100);
  return { left, width: Math.max(0, end - left) };
}
