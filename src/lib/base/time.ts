import { TZDate, tz } from '@date-fns/tz';
import { addDays, differenceInCalendarDays, format, startOfDay, startOfWeek } from 'date-fns';

/**
 * All scheduling happens in the store's timezone (Naples → America/New_York),
 * no matter where the server or the viewer's browser is. Timestamps are stored
 * in UTC; these helpers convert at the edges.
 */

export type Ymd = string; // 'yyyy-MM-dd' in the store's timezone

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isYmd = (s: unknown): s is Ymd => typeof s === 'string' && YMD.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
export const isHm = (s: unknown): s is string => typeof s === 'string' && HM.test(s);

export function toYmd(date: Date | number, zone: string): Ymd {
  return format(date, 'yyyy-MM-dd', { in: tz(zone) });
}

export function todayYmd(zone: string): Ymd {
  return toYmd(Date.now(), zone);
}

/** Midnight at the start of `ymd` in the store's timezone. */
export function zonedMidnight(ymd: Ymd, zone: string): TZDate {
  const [y, m, d] = ymd.split('-').map(Number);
  return new TZDate(y, m - 1, d, 0, 0, 0, zone);
}

/** A wall-clock date + time in the store's timezone, as an absolute instant. */
export function zonedDateTime(ymd: Ymd, hm: string, zone: string): TZDate {
  const [y, m, d] = ymd.split('-').map(Number);
  const [h, min] = hm.split(':').map(Number);
  return new TZDate(y, m - 1, d, h, min, 0, zone);
}

export function addDaysYmd(ymd: Ymd, days: number, zone: string): Ymd {
  return toYmd(addDays(zonedMidnight(ymd, zone), days), zone);
}

/** [start, end) of a local day as UTC ISO strings, for querying timestamptz columns. */
export function dayRangeIso(ymd: Ymd, zone: string): [string, string] {
  const start = zonedMidnight(ymd, zone);
  return [start.toISOString(), addDays(start, 1).toISOString()];
}

/** First day (yyyy-MM-dd) of the week containing `ymd`. weekStart: 0 = Sunday, 1 = Monday. */
export function weekStartYmd(ymd: Ymd, zone: string, weekStart: number): Ymd {
  return toYmd(startOfWeek(zonedMidnight(ymd, zone), { weekStartsOn: weekStart as 0 | 1 | 2 | 3 | 4 | 5 | 6, in: tz(zone) }), zone);
}

export function weekDays(startYmd: Ymd, zone: string): Ymd[] {
  return Array.from({ length: 7 }, (_, i) => addDaysYmd(startYmd, i, zone));
}

/** Start of the pay period that contains `ymd`, counting whole periods from the anchor date. */
export function payPeriodStartYmd(ymd: Ymd, anchor: Ymd, lengthDays: number, zone: string): Ymd {
  const diff = differenceInCalendarDays(zonedMidnight(ymd, zone), zonedMidnight(anchor, zone));
  const offset = Math.floor(diff / lengthDays) * lengthDays;
  return addDaysYmd(anchor, offset, zone);
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a local date. */
export function isoWeekday(ymd: Ymd, zone: string): number {
  return Number(format(zonedMidnight(ymd, zone), 'i', { in: tz(zone) }));
}

// ----------------------------------------------------------------- display --

export function fmtTime(date: Date | string, zone: string): string {
  return format(new Date(date), 'h:mm a', { in: tz(zone) }).toLowerCase();
}

/** "9am" / "12:30pm" — compact, for schedule chips. */
export function fmtShortTime(date: Date | string, zone: string): string {
  const d = new Date(date);
  const minutes = format(d, 'mm', { in: tz(zone) });
  return format(d, minutes === '00' ? 'ha' : 'h:mma', { in: tz(zone) }).toLowerCase();
}

export function fmtDate(ymdOrDate: Ymd | Date, zone: string, pattern = 'EEE, MMM d'): string {
  const d = typeof ymdOrDate === 'string' ? zonedMidnight(ymdOrDate, zone) : ymdOrDate;
  return format(d, pattern, { in: tz(zone) });
}

export function fmtDateRange(startYmd: Ymd, endYmd: Ymd, zone: string): string {
  if (startYmd === endYmd) return fmtDate(startYmd, zone, 'MMM d');
  return `${fmtDate(startYmd, zone, 'MMM d')} – ${fmtDate(endYmd, zone, 'MMM d')}`;
}

/** Worked time and other durations as HH:MM — 457 → "07:37", 14 → "00:14", 6000 → "100:00". */
export function fmtDuration(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Decimal hours (457 → "7.62") — only for the CSV export, where payroll software expects it. */
export const fmtHours = (minutes: number) => (Math.round((minutes / 60) * 100) / 100).toFixed(2);

export const minutesBetween = (a: Date | string, b: Date | string) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;

export { startOfDay };
