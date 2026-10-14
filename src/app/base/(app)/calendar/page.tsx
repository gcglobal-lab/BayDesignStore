import type { Metadata } from 'next';
import AutoRefresh from '@/components/base/AutoRefresh';
import LeaveCalendar, { calendarRange, monthStart, type AttendanceItem, type LeaveItem } from '@/components/base/LeaveCalendar';
import { PageHeader } from '@/components/base/ui';
import { requireManager } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { listEmployees, listEntries, workedMinutes } from '@/lib/base/queries';
import { getSettings } from '@/lib/base/settings';
import { dayRangeIso, fmtDuration, fmtShortTime, fmtTime, toYmd, todayYmd } from '@/lib/base/time';
import { fullName, type TimeEntry } from '@/lib/base/types';

export const metadata: Metadata = { title: 'Calendar View' };

/** Month calendar of the team: who punched in each day (first in → last out) and who is off. */
export default async function CalendarPage({ searchParams }: PageProps<'/base/calendar'>) {
  await requireManager();
  const { cal } = await searchParams;
  const settings = await getSettings();
  const zone = settings.timezone;
  const today = todayYmd(zone);
  const first = monthStart(cal, today);
  const range = calendarRange(first, zone, settings.week_start);
  const now = Date.now();

  const [employees, leaveRes, entries] = await Promise.all([
    listEmployees(true),
    db()
      .from('time_off_requests')
      .select('id, employee_id, type, starts_on, ends_on, status, all_day, start_time, end_time')
      .in('status', ['approved', 'pending'])
      .lte('starts_on', range.end)
      .gte('ends_on', range.start)
      .order('starts_on'),
    listEntries(dayRangeIso(range.start, zone)[0], dayRangeIso(range.end, zone)[1]),
  ]);
  const nameOf = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? fullName(e) : 'Former team member';
  };
  const leave: LeaveItem[] = must<Omit<LeaveItem, 'name'>[]>(leaveRes, 'load the leave calendar').map((l) => ({ ...l, name: nameOf(l.employee_id) }));

  // One chip per person per day — first in → last out, punch count, worked time.
  const byKey = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    const key = `${e.employee_id}|${toYmd(new Date(e.clock_in_at), zone)}`;
    byKey.set(key, [...(byKey.get(key) ?? []), e]);
  }
  const attendance: AttendanceItem[] = [...byKey.entries()].map(([key, list]) => {
    const [employeeId, day] = key.split('|');
    const sorted = [...list].sort((a, b) => a.clock_in_at.localeCompare(b.clock_in_at));
    const last = sorted[sorted.length - 1];
    const open = !last.clock_out_at;
    return {
      key,
      day,
      name: nameOf(employeeId),
      span: `${fmtShortTime(sorted[0].clock_in_at, zone)}–${open ? 'now' : fmtShortTime(last.clock_out_at!, zone)}`,
      punches: sorted.length,
      worked: fmtDuration(sorted.reduce((s, e) => s + workedMinutes(e, now), 0)),
      open,
      detail: sorted.map((e) => `${fmtTime(e.clock_in_at, zone)} – ${e.clock_out_at ? fmtTime(e.clock_out_at, zone) : 'now'}`).join(', '),
    };
  });

  return (
    <>
      <AutoRefresh seconds={60} />
      <PageHeader plain title="Calendar View" description="The whole month at a glance: who worked each day and who is off. Tap a day to see everyone." />
      <LeaveCalendar first={first} today={today} zone={zone} weekStart={settings.week_start} leave={leave} attendance={attendance} hrefFor={(month) => `/base/calendar?cal=${month}`} />
    </>
  );
}
