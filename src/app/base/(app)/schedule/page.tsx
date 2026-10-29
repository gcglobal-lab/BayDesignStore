import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Copy, Send } from 'lucide-react';
import { SubmitButton } from '@/components/base/forms';
import ScheduleGrid, { type GridDay, type GridEvent, type GridFrequent, type GridPunch, type GridRequest, type GridRow, type GridShift, type GridTimeOff } from '@/components/base/ScheduleGrid';
import { PageHeader } from '@/components/base/ui';
import WeekJump from '@/components/base/WeekJump';
import { isManager, requireViewer } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { listEmployees, listEntries, listLocations, listRoles, workedMinutes } from '@/lib/base/queries';
import { getSettings } from '@/lib/base/settings';
import { addDaysYmd, dayRangeIso, fmtDate, fmtShortTime, isYmd, minutesBetween, toYmd, todayYmd, weekDays, weekStartYmd } from '@/lib/base/time';
import { fullName, type Shift, type TimeEntry, type TimeOffRequest } from '@/lib/base/types';
import { copyPreviousWeek, publishWeek } from './actions';
import Select from '@/components/ui/Select';

export const metadata: Metadata = { title: 'Schedule' };

const hm = (iso: string, zone: string) => new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

export default async function SchedulePage({ searchParams }: PageProps<'/base/schedule'>) {
  const viewer = await requireViewer();
  const manager = isManager(viewer);
  const sp = await searchParams;
  const settings = await getSettings();
  const zone = settings.timezone;
  const today = todayYmd(zone);
  const thisWeek = weekStartYmd(today, zone, settings.week_start);
  const week = typeof sp.week === 'string' && isYmd(sp.week) ? weekStartYmd(sp.week, zone, settings.week_start) : thisWeek;
  const roleFilter = typeof sp.role === 'string' ? sp.role : '';
  const ymds = weekDays(week, zone);
  const [weekStart] = dayRangeIso(week, zone);
  const [, weekEnd] = dayRangeIso(ymds[6], zone);

  // Punch in/out details on the grid are for admins only; managers just need to know a shift has a time card.
  const admin = viewer.level === 'admin';
  let shiftQuery = db().from('shifts').select('*').gte('starts_at', weekStart).lt('starts_at', weekEnd).order('starts_at');
  if (!manager) shiftQuery = shiftQuery.not('published_at', 'is', null); // drafts are for managers only
  const [employees, roles, locations, shiftsRes, timeOffRes, eventsRes, entries, historyRes] = await Promise.all([
    listEmployees(),
    listRoles(),
    listLocations(),
    shiftQuery,
    db().from('time_off_requests').select('*').eq('status', 'approved').lte('starts_on', ymds[6]).gte('ends_on', week),
    db().from('events').select('id, title, starts_on, ends_on').lte('starts_on', ymds[6]).gte('ends_on', week),
    manager ? listEntries(weekStart, weekEnd) : Promise.resolve([] as TimeEntry[]),
    // The last eight weeks, for the "Frequent for …" suggestions when adding a shift.
    manager
      ? db().from('shifts').select('employee_id, role_id, starts_at, ends_at').not('employee_id', 'is', null).gte('starts_at', dayRangeIso(addDaysYmd(week, -56, zone), zone)[0]).lt('starts_at', weekStart)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const shifts = must<Shift[]>(shiftsRes, 'load shifts');
  const timeOff = must<TimeOffRequest[]>(timeOffRes, 'load time off');
  const events = must<{ id: string; title: string; starts_on: string; ends_on: string }[]>(eventsRes, 'load events');
  const history = must<Pick<Shift, 'employee_id' | 'role_id' | 'starts_at' | 'ends_at'>[]>(historyRes, 'load past shifts');
  const requests = manager && shifts.length
    ? must<{ id: string; type: 'pickup' | 'cover'; shift_id: string; requester_id: string; claimant_id: string | null; note: string | null }[]>(
        await db().from('shift_requests').select('id, type, shift_id, requester_id, claimant_id, note').eq('status', 'pending').in('shift_id', shifts.map((s) => s.id)),
        'load shift requests',
      )
    : [];

  const roleById = new Map(roles.map((r) => [r.id, r]));
  const nameById = new Map(employees.map((e) => [e.id, fullName(e)]));
  const now = Date.now();
  const entryDate = (e: TimeEntry) => toYmd(new Date(e.clock_in_at), zone);
  const punchedFor = (s: Shift) => entries.filter((e) => e.shift_id === s.id || (!e.shift_id && e.employee_id === s.employee_id && entryDate(e) === toYmd(new Date(s.starts_at), zone)));
  const gridShifts: GridShift[] = shifts
    .filter((s) => !roleFilter || s.role_id === roleFilter)
    .map((s) => {
      const role = s.role_id ? roleById.get(s.role_id) : undefined;
      return {
        locked: entries.some((e) => e.shift_id === s.id),
        // Admin view: a published shift that started (past the grace period) with nobody punched in.
        noShow: admin && Boolean(s.employee_id && s.published_at) && now > new Date(s.starts_at).getTime() + settings.late_grace_minutes * 60_000 && punchedFor(s).length === 0,
        id: s.id,
        employeeId: s.employee_id,
        date: toYmd(new Date(s.starts_at), zone),
        start: hm(s.starts_at, zone),
        end: hm(s.ends_at, zone),
        label: `${fmtShortTime(s.starts_at, zone)}–${fmtShortTime(s.ends_at, zone)}`,
        roleId: s.role_id,
        roleName: role?.name ?? null,
        color: role?.color ?? '#6F675D',
        published: Boolean(s.published_at),
        breakMinutes: s.break_minutes,
        notes: s.notes,
        locationId: s.location_id,
      };
    });

  const gridTimeOff: GridTimeOff[] = timeOff.flatMap((t) =>
    ymds
      .filter((d) => d >= t.starts_on && d <= t.ends_on)
      .map((d) => ({ id: `${t.id}-${d}`, employeeId: t.employee_id, date: d, label: t.all_day ? 'All day' : `${t.start_time?.slice(0, 5)}–${t.end_time?.slice(0, 5)}` })),
  );
  const gridEvents: GridEvent[] = events.map((e) => ({ id: e.id, title: e.title, dates: ymds.filter((d) => d >= e.starts_on && d <= e.ends_on) }));

  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  const gridPunches: GridPunch[] = admin
    ? entries.map((e) => {
        const shift = e.shift_id ? shiftById.get(e.shift_id) : undefined;
        const late = shift ? Math.round(minutesBetween(shift.starts_at, e.clock_in_at)) : 0;
        return {
          id: e.id,
          employeeId: e.employee_id,
          date: entryDate(e),
          shiftId: e.shift_id,
          clockIn: fmtShortTime(e.clock_in_at, zone),
          clockOut: e.clock_out_at ? fmtShortTime(e.clock_out_at, zone) : null,
          inPlace: e.clock_in_place,
          outPlace: e.clock_out_place,
          workedMinutes: workedMinutes(e, now),
          lateMinutes: late > settings.late_grace_minutes ? late : null,
          manual: e.source === 'manual',
          note: [e.clock_in_note, e.notes].filter(Boolean).join(' · ') || null,
        };
      })
    : [];

  // Each person's most common start–end–role over the last eight weeks (at most two).
  const frequent: Record<string, GridFrequent[]> = {};
  const tally = new Map<string, Map<string, { f: GridFrequent; n: number }>>();
  for (const s of history) {
    if (!s.employee_id) continue;
    const start = hm(s.starts_at, zone);
    const end = hm(s.ends_at, zone);
    const key = `${start}|${end}|${s.role_id ?? ''}`;
    const mine = tally.get(s.employee_id) ?? new Map();
    tally.set(s.employee_id, mine);
    const hit = mine.get(key);
    if (hit) hit.n++;
    else mine.set(key, { n: 1, f: { start, end, roleId: s.role_id, label: `${fmtShortTime(s.starts_at, zone)}–${fmtShortTime(s.ends_at, zone)}` } });
  }
  for (const [id, mine] of tally) frequent[id] = [...mine.values()].filter((x) => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 2).map((x) => x.f);

  const gridRequests: GridRequest[] = requests.map((r) => ({
    id: r.id,
    shiftId: r.shift_id,
    type: r.type,
    requester: nameById.get(r.requester_id) ?? 'Someone',
    claimant: r.claimant_id ? (nameById.get(r.claimant_id) ?? null) : null,
    note: r.note,
  }));

  let rowEmployees = roleFilter ? employees.filter((e) => e.roles.some((r) => r.id === roleFilter) || shifts.some((s) => s.employee_id === e.id && s.role_id === roleFilter)) : employees;
  // Employees see their own row first.
  if (!manager) rowEmployees = [...rowEmployees.filter((e) => e.id === viewer.employeeId), ...rowEmployees.filter((e) => e.id !== viewer.employeeId)];
  const rows: GridRow[] = rowEmployees.map((e) => ({
    id: e.id,
    name: fullName(e),
    firstName: e.first_name,
    lastName: e.last_name,
    role: e.roles[0]?.name ?? null,
    locationId: e.location_id,
    highlight: e.id === viewer.employeeId,
    hours: shifts.filter((s) => s.employee_id === e.id).reduce((sum, s) => sum + Math.max(0, minutesBetween(s.starts_at, s.ends_at) - s.break_minutes), 0) / 60,
  }));
  const days: GridDay[] = ymds.map((d) => ({ ymd: d, weekday: fmtDate(d, zone, 'EEE'), day: fmtDate(d, zone, 'd'), isToday: d === today }));
  const drafts = shifts.filter((s) => !s.published_at).length;
  const totalHours = rows.reduce((s, r) => s + r.hours, 0);

  const weekHref = (w: string) => `/base/schedule?${new URLSearchParams({ week: w, ...(roleFilter ? { role: roleFilter } : {}) }).toString()}`;

  return (
    <>
      <PageHeader
        plain
        title="Schedule"
        description={manager ? `${totalHours.toFixed(1)} scheduled hours this week${drafts ? ` · ${drafts} draft shift${drafts === 1 ? '' : 's'} not yet visible to the team` : ''}` : 'The published schedule for the whole team.'}
      />

      {/* Toolbar, like Homebase: Today · date range · arrows … filters · publish */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {week !== thisWeek ? <Link href={weekHref(thisWeek)} className="rounded-xl bg-linen px-4 py-2.5 text-[0.95rem] font-semibold text-ink ring-1 ring-inset ring-stone transition-colors hover:bg-sand">Today</Link> : <span className="rounded-xl bg-linen px-4 py-2.5 text-[0.95rem] font-semibold text-muted ring-1 ring-inset ring-stone">Today</span>}
        {/* The week and its arrows stay on one line on a phone. */}
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <WeekJump label={`${fmtDate(week, zone, 'MMM d')} – ${fmtDate(ymds[6], zone, 'MMM d, yyyy')}`} value={week} href="/base/schedule" extra={roleFilter ? { role: roleFilter } : {}} zone={zone} weekStart={settings.week_start} />
          <Link href={weekHref(addDaysYmd(week, -7, zone))} className="flex-none rounded-xl p-2.5 text-ink hover:bg-white" aria-label="Previous week"><ChevronLeft size={20} /></Link>
          <Link href={weekHref(addDaysYmd(week, 7, zone))} className="flex-none rounded-xl p-2.5 text-ink hover:bg-white" aria-label="Next week"><ChevronRight size={20} /></Link>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <form className="flex items-center">
            <input type="hidden" name="week" value={week} />
            <Select name="role" defaultValue={roleFilter} className="b-input !w-auto !rounded-xl !bg-linen !py-2.5 font-semibold" aria-label="Filter by role">
              <option value="">Filters: all roles</option>
              {roles.map((r) => <option key={r.id} value={r.id}>Role: {r.name}</option>)}
            </Select>
            <button type="submit" className="b-btn-ghost b-btn-sm ml-1.5">Apply</button>
          </form>
          {manager && (
            <>
              <form action={copyPreviousWeek}>
                <input type="hidden" name="week" value={week} />
                <SubmitButton className="b-btn-ghost" confirm="Copy last week’s shifts into this week as drafts? People who already have shifts this week are skipped."><Copy size={15} /> Copy last week</SubmitButton>
              </form>
              <form action={publishWeek}>
                <input type="hidden" name="week" value={week} />
                <SubmitButton className="b-btn-brass" confirm={drafts ? `Publish ${drafts} shift${drafts === 1 ? '' : 's'}? The team will see them right away.` : undefined}>
                  <Send size={15} /> Publish ({drafts})
                </SubmitButton>
              </form>
            </>
          )}
        </div>
      </div>
      {manager && (
        <p className="mb-3 hidden text-xs text-muted md:block">
          Click an empty cell to add a shift or time off, or a shift to open it. Dashed shifts are drafts{admin ? (week < thisWeek ? '; punch in and out times show under each shift — click one for the full report' : '; a green “Punched” or red “No punch-in” marks each day — click it for the punch in / out report') : ' — once published, only an admin can change them'}. The eye hides someone from your view.
        </p>
      )}

      <ScheduleGrid
        days={days}
        rows={rows}
        shifts={gridShifts}
        timeOff={gridTimeOff}
        events={gridEvents}
        roles={roles}
        locations={locations.filter((l) => l.is_active)}
        punches={gridPunches}
        frequent={frequent}
        requests={gridRequests}
        canEdit={manager}
        isAdmin={admin}
        // Earlier weeks show the punch times in the grid; this week (still changing) opens them in a popup.
        inlinePunches={week < thisWeek}
        defaultLocationId={locations[0]?.id ?? null}
        zone={zone}
        weekStart={settings.week_start}
      />
    </>
  );
}
