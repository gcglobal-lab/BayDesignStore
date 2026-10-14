/**
 * Calendar maths on plain 'yyyy-MM-dd' strings. Everything is done in UTC so a date never
 * shifts by a day because of the viewer's timezone — the dates are the store's calendar days.
 */

export type Ymd = string;

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (y: number, m0: number, d: number): Ymd => {
  const t = new Date(Date.UTC(y, m0, d));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
export const isYmd = (s: unknown): s is Ymd => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
export const parts = (s: Ymd) => s.split('-').map(Number) as [number, number, number];
export const addDays = (s: Ymd, n: number): Ymd => {
  const [y, m, d] = parts(s);
  return ymd(y, m - 1, d + n);
};
export const monthKey = (s: Ymd) => s.slice(0, 7);
export const firstOfMonth = (y: number, m0: number): Ymd => ymd(y, m0, 1);
export const lastOfMonth = (y: number, m0: number): Ymd => ymd(y, m0 + 1, 0);
export const addMonths = (s: Ymd, n: number): Ymd => {
  const [y, m] = parts(s);
  return ymd(y, m - 1 + n, 1);
};
export const daysBetween = (a: Ymd, b: Ymd) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export function weekdayNames(weekStart: number) {
  return Array.from({ length: 7 }, (_, i) => WEEKDAYS[(weekStart + i) % 7]);
}

/** The 6×7 grid of days shown for a month (leading/trailing days from the neighbouring months). */
export function monthGrid(first: Ymd, weekStart: number): Ymd[] {
  const dow = new Date(`${first}T00:00:00Z`).getUTCDay();
  const start = addDays(first, -((dow - weekStart + 7) % 7));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function fmtYmd(s: Ymd | null | undefined, style: 'short' | 'long' | 'medium' = 'medium'): string {
  if (!s || !isYmd(s)) return '';
  const [y, m, d] = parts(s);
  const wd = WEEKDAYS[new Date(`${s}T00:00:00Z`).getUTCDay()];
  if (style === 'short') return `${MONTHS_SHORT[m - 1]} ${d}`;
  if (style === 'long') return `${wd}, ${MONTHS[m - 1]} ${d}, ${y}`;
  return `${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}

export function fmtRange(from: Ymd | null, to: Ymd | null): string {
  if (!from) return 'Pick dates';
  if (!to || to === from) return fmtYmd(from);
  const [fy, fm] = parts(from);
  const [ty, tm, td] = parts(to);
  if (fy === ty && fm === tm && from.endsWith('-01') && to === lastOfMonth(ty, tm - 1)) return `${MONTHS[fm - 1]} ${fy}`;
  if (fy === ty) return `${fmtYmd(from, 'short')} – ${MONTHS_SHORT[tm - 1]} ${td}, ${ty}`;
  return `${fmtYmd(from)} – ${fmtYmd(to)}`;
}

/** Today's date in a timezone, in the browser. */
export function todayIn(zone: string): Ymd {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
