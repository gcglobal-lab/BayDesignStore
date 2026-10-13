import { differenceInCalendarDays } from 'date-fns';
import { addDaysYmd, isYmd, payPeriodStartYmd, type Ymd } from './time';

export type RangePreset = { key: string; label: string; from: Ymd; to: Ymd };

/** Longest range a timesheet view or download may cover. */
export const MAX_RANGE_DAYS = 366 * 3;

/** Quick date ranges for the timesheet filter, in the store's timezone. */
export function rangePresets(today: Ymd, zone: string, payAnchor: Ymd, payDays: number): RangePreset[] {
  const back = (n: number) => addDaysYmd(today, -n, zone);
  const thisMonth = `${today.slice(0, 7)}-01`;
  const lastMonthEnd = addDaysYmd(thisMonth, -1, zone);
  const year = Number(today.slice(0, 4));
  const period = payPeriodStartYmd(today, payAnchor, payDays, zone);
  const lastPeriod = addDaysYmd(period, -payDays, zone);
  return [
    { key: 'today', label: 'Today', from: today, to: today },
    { key: 'yesterday', label: 'Yesterday', from: back(1), to: back(1) },
    { key: '7d', label: 'Last 7 days', from: back(6), to: today },
    { key: '15d', label: 'Last 15 days', from: back(14), to: today },
    { key: '30d', label: 'Last 30 days', from: back(29), to: today },
    { key: 'period', label: 'This pay period', from: period, to: addDaysYmd(period, payDays - 1, zone) },
    { key: 'last-period', label: 'Last pay period', from: lastPeriod, to: addDaysYmd(period, -1, zone) },
    { key: 'month', label: 'This month', from: thisMonth, to: today },
    { key: 'last-month', label: 'Last month', from: `${lastMonthEnd.slice(0, 7)}-01`, to: lastMonthEnd },
    { key: 'year', label: `This year (${year})`, from: `${year}-01-01`, to: today },
    { key: 'last-year', label: `Last year (${year - 1})`, from: `${year - 1}-01-01`, to: `${year - 1}-12-31` },
  ];
}

/** A valid from/to pair from query parameters, or an error message. */
export function parseRange(from: unknown, to: unknown): { from: Ymd; to: Ymd } | { error: string } {
  if (!isYmd(from) || !isYmd(to)) return { error: 'Pick a start and end date.' };
  if (to < from) return { error: 'The end date is before the start date.' };
  if (differenceInCalendarDays(new Date(to), new Date(from)) + 1 > MAX_RANGE_DAYS) return { error: 'Pick a range of three years or less.' };
  return { from, to };
}
