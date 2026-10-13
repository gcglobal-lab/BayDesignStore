import { workedMinutes } from './queries';
import type { CompanySettings } from './settings';
import { toYmd, weekStartYmd } from './time';
import type { TimeEntry } from './types';

/**
 * Regular vs overtime minutes for one person's time cards. Overtime per week is the
 * larger of: minutes over the weekly limit, or the sum of minutes over the daily limit.
 * Cards are attributed to the day (and week) they started on.
 */
export function summarizeHours(entries: TimeEntry[], settings: CompanySettings, now = Date.now()) {
  const byWeek = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const day = toYmd(new Date(e.clock_in_at), settings.timezone);
    const week = weekStartYmd(day, settings.timezone, settings.week_start);
    const days = byWeek.get(week) ?? new Map<string, number>();
    days.set(day, (days.get(day) ?? 0) + workedMinutes(e, now));
    byWeek.set(week, days);
  }
  let total = 0;
  let overtime = 0;
  for (const days of byWeek.values()) {
    const weekTotal = [...days.values()].reduce((a, b) => a + b, 0);
    const weekly = settings.weekly_overtime_hours == null ? 0 : Math.max(0, weekTotal - settings.weekly_overtime_hours * 60);
    const daily = settings.daily_overtime_hours == null ? 0 : [...days.values()].reduce((s, m) => s + Math.max(0, m - settings.daily_overtime_hours! * 60), 0);
    total += weekTotal;
    overtime += Math.max(weekly, daily);
  }
  return { total, overtime, regular: total - overtime };
}

export type Issue = { label: string; tone: 'red' | 'amber' };

/** Things a manager should look at before approving payroll. */
export function entryIssues(e: TimeEntry, settings: CompanySettings, now = Date.now()): Issue[] {
  const issues: Issue[] = [];
  if (!e.clock_out_at && now - new Date(e.clock_in_at).getTime() > 14 * 3600_000) issues.push({ label: 'Missing punch out', tone: 'red' });
  // Off-site punch-ins aren't an issue (designers visit clients); the place is shown instead.
  if (e.source === 'web' && e.clock_in_lat == null && settings.require_location) issues.push({ label: 'No location', tone: 'amber' });
  if (e.source === 'manual' || e.edited_at) issues.push({ label: 'Edited by manager', tone: 'amber' });
  return issues;
}
