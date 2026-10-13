import type { CompanySettings } from './settings';

/** Overtime minutes given a day's and a week's worked minutes — whichever rule gives more (FLSA weekly, optional daily). */
export function overtimeMinutes(dayMinutes: number, weekMinutes: number, settings: Pick<CompanySettings, 'daily_overtime_hours' | 'weekly_overtime_hours'>) {
  const daily = settings.daily_overtime_hours == null ? 0 : Math.max(0, dayMinutes - settings.daily_overtime_hours * 60);
  const weekly = settings.weekly_overtime_hours == null ? 0 : Math.max(0, weekMinutes - settings.weekly_overtime_hours * 60);
  return Math.max(daily, weekly);
}
