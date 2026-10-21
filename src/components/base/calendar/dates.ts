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
export function weekdayNames(weekStart: number) {
  return Array.from({ length: 7 }, (_, i) => WEEKDAYS[(weekStart + i) % 7]);
}

/** The 6×7 grid of days shown for a month (leading/trailing days from the neighbouring months). */
export function monthGrid(first: Ymd, weekStart: number): Ymd[] {
  const dow = new Date(`${first}T00:00:00Z`).getUTCDay();
  const start = addDays(first, -((dow - weekStart + 7) % 7));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function fmtYmd(s: Ymd | null | undefined, style: 'short' | 'long' | 'medium' | 'weekday' = 'medium'): string {
  if (!s || !isYmd(s)) return '';
  const [y, m, d] = parts(s);
  const wd = WEEKDAYS[new Date(`${s}T00:00:00Z`).getUTCDay()];
  if (style === 'short') return `${MONTHS_SHORT[m - 1]} ${d}`;
  if (style === 'long') return `${wd}, ${MONTHS[m - 1]} ${d}, ${y}`;
  if (style === 'weekday') return `${wd}, ${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
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

/** 10/22/2026 — the format the date fields show while you type. */
export function fmtNumeric(s: Ymd | null | undefined): string {
  if (!s || !isYmd(s)) return '';
  const [y, m, d] = parts(s);
  return `${pad(m)}/${pad(d)}/${y}`;
}

const MONTH_NAMES = MONTHS.map((m) => m.toLowerCase());
const monthFromName = (word: string) => (word.length >= 3 ? MONTH_NAMES.findIndex((m) => m.startsWith(word)) + 1 : 0);

/**
 * Reads a date someone typed: 10/22/2026, 10/22/26, 10-22-2026, 10.22.2026, 10/22 (this year),
 * 10222026, 2026-10-22, Oct 22, October 22 2026, 22 Oct 2026, Thu Oct 22 2026, today, tomorrow,
 * yesterday, +3 / -3 (days), +2w (weeks). Month-first like the rest of the US site. Returns
 * yyyy-MM-dd, or null when it isn't a real date (e.g. 02/30/2026).
 */
export function parseTypedDate(input: string, today: Ymd): Ymd | null {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s*/, '')
    .replace(/(\d)(st|nd|rd|th)\b/g, '$1')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  if (s === 'today' || s === 'now') return today;
  if (s === 'tomorrow' || s === 'tmrw' || s === 'tmr') return addDays(today, 1);
  if (s === 'yesterday') return addDays(today, -1);

  const [ty] = parts(today);
  const fullYear = (y: string | undefined) => {
    if (y === undefined) return ty;
    if (y.length === 4) return Number(y);
    // Two digits: the nearest year that isn't more than 20 years ahead (26 → 2026, 95 → 1995).
    const n = 2000 + Number(y);
    return n > ty + 20 ? n - 100 : n;
  };
  const build = (y: number, m: number, d: number): Ymd | null => {
    if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const out = ymd(y, m - 1, d);
    return out === `${y}-${pad(m)}-${pad(d)}` ? out : null; // rejects 02/30, 04/31…
  };

  let m = s.match(/^([+-])\s?(\d{1,4})\s?(d|days?|w|weeks?)?$/);
  if (m) {
    const n = Number(m[2]) * (m[1] === '-' ? -1 : 1) * (m[3]?.startsWith('w') ? 7 : 1);
    return addDays(today, n);
  }
  m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return build(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[-/. ](\d{1,2})(?:[-/. ](\d{2}|\d{4}))?$/);
  if (m) return build(fullYear(m[3]), Number(m[1]), Number(m[2]));
  m = s.match(/^(\d{2})(\d{2})(\d{4}|\d{2})$/);
  if (m) return build(fullYear(m[3]), Number(m[1]), Number(m[2]));
  m = s.match(/^([a-z]{3,9})\.? (\d{1,2})(?: (\d{2}|\d{4}))?$/);
  if (m && monthFromName(m[1])) return build(fullYear(m[3]), monthFromName(m[1]), Number(m[2]));
  m = s.match(/^(\d{1,2}) ([a-z]{3,9})\.?(?: (\d{2}|\d{4}))?$/);
  if (m && monthFromName(m[2])) return build(fullYear(m[3]), monthFromName(m[2]), Number(m[1]));
  m = s.match(/^([a-z]{3,9})\.? (\d{4})$/);
  if (m && monthFromName(m[1])) return build(Number(m[2]), monthFromName(m[1]), 1);
  return null;
}
