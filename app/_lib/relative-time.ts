import { VN_OFFSET_MS } from '@/server/clock';

const MIN = 60_000;
const HOUR = 60 * MIN;

const vnDay = (d: Date) => Math.floor((d.getTime() + VN_OFFSET_MS) / (24 * HOUR));

/** Vietnamese relative time: "vừa xong", "5 phút trước", "2 giờ trước", "hôm qua", "3 ngày trước". */
export function relativeTime(date: Date, now: Date = new Date()): string {
  const diff = now.getTime() - date.getTime();
  if (diff < MIN) return 'vừa xong';
  if (diff < HOUR) return `${Math.floor(diff / MIN)} phút trước`;
  if (diff < 24 * HOUR) return `${Math.floor(diff / HOUR)} giờ trước`;
  const days = vnDay(now) - vnDay(date);
  return days <= 1 ? 'hôm qua' : `${days} ngày trước`;
}
