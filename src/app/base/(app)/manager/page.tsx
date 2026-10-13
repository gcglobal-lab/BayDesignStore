import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarPlus, Cake, CalendarDays, CheckCircle2, Clock3, MapPin, NotebookPen, Trash2, UserX } from 'lucide-react';
import AutoRefresh from '@/components/base/AutoRefresh';
import { Dialog } from '@/components/base/Dialog';
import EventForm from '@/components/base/EventForm';
import LiveDuration from '@/components/base/LiveDuration';
import PunchTimeline from '@/components/base/PunchTimeline';
import LeaveCalendar, { calendarRange, monthStart, type AttendanceItem, type LeaveItem } from '@/components/base/LeaveCalendar';
import { SubmitButton } from '@/components/base/forms';
import ManagerLogForm from '@/components/base/ManagerLogForm';
import { Avatar, Card, EmptyState, PageHeader } from '@/components/base/ui';
import { requireManager } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { fmtDistance, mapLink } from '@/lib/base/geo';
import { overtimeMinutes } from '@/lib/base/overtime';
import { listEmployees, listEntries, listRoles, workedMinutes } from '@/lib/base/queries';
import { getSettings } from '@/lib/base/settings';
import { addDaysYmd, dayRangeIso, fmtDate, fmtDateRange, fmtDuration, fmtShortTime, fmtTime, toYmd, todayYmd, weekDays, weekStartYmd } from '@/lib/base/time';
import { fullName, timeOffTypeLabel, type Shift, type TimeEntry, type TimeOffRequest } from '@/lib/base/types';
import { reviewTimeOff } from '../time-off/actions';
import { reviewAvailability } from '../team-availability/actions';
import { decideShiftRequest, deleteEvent } from './actions';

export const metadata: Metadata = { title: 'Manager View' };

type Row = {
  employeeId: string;
  name: string;
  roleName: string | null;
  roleColor: string | null;
  shift: Shift | null;
  entries: TimeEntry[];
  state: 'on' | 'break' | 'late' | 'no-show' | 'upcoming' | 'done';
  minutes: number;
  /** 1 while on the clock and not on an unpaid meal break — the time keeps counting on screen. */
  running: number;
  overtime: number;
};

export default async function ManagerView({ searchParams }: PageProps<'/base/manager'>) {
  await requireManager();
  const { tab, cal } = await searchParams;
  const settings = await getSettings();
  const zone = settings.timezone;
  const today = todayYmd(zone);
  const calFirst = monthStart(cal, today);
  const calRange = calendarRange(calFirst, zone, settings.week_start);
  const [dayStart, dayEnd] = dayRangeIso(today, zone);
  const week = weekStartYmd(today, zone, settings.week_start);
  const [weekStartIso] = dayRangeIso(week, zone);
  const weekEnd = addDaysYmd(week, 6, zone);
  const now = Date.now();

  const [employees, roles, todaysShiftsRes, todayEntries, weekEntries, eventsRes, pendingTimeOffRes, shiftReqRes, availReqRes, logRes, leaveRes, calEntries] = await Promise.all([
    listEmployees(),
    listRoles(),
    db().from('shifts').select('*').not('employee_id', 'is', null).gte('starts_at', dayStart).lt('starts_at', dayEnd).order('starts_at'),
    listEntries(dayStart, dayEnd),
    listEntries(weekStartIso, dayEnd),
    db().from('events').select('*').lte('starts_on', weekEnd).gte('ends_on', week).order('starts_on'),
    db().from('time_off_requests').select('*').eq('status', 'pending').order('starts_on'),
    db()
      .from('shift_requests')
      .select('id, type, requester_id, claimant_id, shift:shifts(starts_at, ends_at)')
      .eq('status', 'pending')
      .order('created_at'),
    db().from('availability_requests').select('id, employee_id, effective_from, created_at').eq('status', 'pending').order('created_at'),
    db().from('manager_log').select('*').order('created_at', { ascending: false }).limit(8),
    db()
      .from('time_off_requests')
      .select('id, employee_id, type, starts_on, ends_on, status, all_day, start_time, end_time')
      .in('status', ['approved', 'pending'])
      .lte('starts_on', calRange.end)
      .gte('ends_on', calRange.start)
      .order('starts_on'),
    listEntries(dayRangeIso(calRange.start, zone)[0], dayRangeIso(calRange.end, zone)[1]),
  ]);

  const shifts = must<Shift[]>(todaysShiftsRes, 'load today’s shifts');
  const events = must<{ id: string; title: string; starts_on: string; ends_on: string; description: string | null }[]>(eventsRes, 'load events');
  const pendingTimeOff = must<TimeOffRequest[]>(pendingTimeOffRes, 'load time-off requests');
  const shiftRequests = must<{ id: string; type: 'pickup' | 'cover'; requester_id: string; claimant_id: string | null; shift: { starts_at: string; ends_at: string } | null }[]>(shiftReqRes, 'load shift requests');
  const availabilityRequests = must<{ id: string; employee_id: string; effective_from: string }[]>(availReqRes, 'load availability requests');
  const log = must<{ id: string; body: string; author_name: string; created_at: string }[]>(logRes, 'load the manager log');

  const nameOf = (id: string | null) => {
    const e = employees.find((x) => x.id === id);
    return e ? fullName(e) : 'Former team member';
  };
  const leave: LeaveItem[] = must<Omit<LeaveItem, 'name'>[]>(leaveRes, 'load the leave calendar').map((l) => ({ ...l, name: nameOf(l.employee_id) }));
  // Punches on the calendar: one chip per person per day — first in → last out, punch count, worked time.
  const attendanceByKey = new Map<string, TimeEntry[]>();
  for (const e of calEntries) {
    const key = `${e.employee_id}|${toYmd(new Date(e.clock_in_at), zone)}`;
    attendanceByKey.set(key, [...(attendanceByKey.get(key) ?? []), e]);
  }
  const attendance: AttendanceItem[] = [...attendanceByKey.entries()].map(([key, list]) => {
    const [employeeId, day] = key.split('|');
    const sorted = [...list].sort((a, b) => a.clock_in_at.localeCompare(b.clock_in_at));
    const lastCard = sorted[sorted.length - 1];
    const open = !lastCard.clock_out_at;
    const span = `${fmtShortTime(sorted[0].clock_in_at, zone)}–${open ? 'now' : fmtShortTime(lastCard.clock_out_at!, zone)}`;
    return {
      key,
      day,
      name: nameOf(employeeId),
      span,
      punches: sorted.length,
      worked: fmtDuration(sorted.reduce((s, e) => s + workedMinutes(e, now), 0)),
      open,
      detail: sorted.map((e) => `${fmtTime(e.clock_in_at, zone)} – ${e.clock_out_at ? fmtTime(e.clock_out_at, zone) : 'now'}`).join(', '),
    };
  });
  const calHref = (month: string) => `/base/manager?${new URLSearchParams({ ...(tab === 'completed' ? { tab } : {}), cal: month }).toString()}#leave`;

  // One row per person who is scheduled or has punched in today.
  const people = new Set([...shifts.map((s) => s.employee_id!), ...todayEntries.map((e) => e.employee_id)]);
  const rows: Row[] = [...people].flatMap((id) => {
    const emp = employees.find((e) => e.id === id);
    if (!emp) return [];
    const shift = shifts.find((s) => s.employee_id === id) ?? null;
    const entries = todayEntries.filter((e) => e.employee_id === id);
    const open = entries.find((e) => !e.clock_out_at);
    const dayMinutes = entries.reduce((s, e) => s + workedMinutes(e, now), 0);
    const weekMinutes = weekEntries.filter((e) => e.employee_id === id).reduce((s, e) => s + workedMinutes(e, now), 0);
    const role = roles.find((r) => r.id === shift?.role_id) ?? emp.roles[0] ?? null;

    let state: Row['state'];
    if (open) state = open.breaks.some((b) => !b.ended_at) ? 'break' : 'on';
    else if (entries.length) state = 'done';
    else if (shift && now > new Date(shift.starts_at).getTime() + settings.late_grace_minutes * 60_000) state = now > new Date(shift.ends_at).getTime() ? 'no-show' : 'late';
    else state = 'upcoming';

    const running = open && !open.breaks.some((b) => !b.ended_at && b.type === 'meal') ? 1 : 0;
    return [{ employeeId: id, name: fullName(emp), roleName: role?.name ?? null, roleColor: role?.color ?? null, shift, entries, state, minutes: dayMinutes, running, overtime: overtimeMinutes(dayMinutes, weekMinutes, settings) }];
  });
  const order: Record<Row['state'], number> = { late: 0, 'no-show': 1, on: 2, break: 3, upcoming: 4, done: 5 };
  rows.sort((a, b) => order[a.state] - order[b.state] || (a.entries[0]?.clock_in_at ?? a.shift?.starts_at ?? '').localeCompare(b.entries[0]?.clock_in_at ?? b.shift?.starts_at ?? ''));

  const completed = rows.filter((r) => r.state === 'done');
  const active = rows.filter((r) => r.state !== 'done');
  const showing = tab === 'completed' ? completed : active;
  const onClock = rows.filter((r) => r.state === 'on' || r.state === 'break').length;
  const flagged = rows.filter((r) => r.state === 'late' || r.state === 'no-show').length;
  const approvals = pendingTimeOff.length + shiftRequests.filter((r) => r.type === 'pickup' || r.claimant_id).length + availabilityRequests.length;

  // Birthdays falling in this week (month-day match).
  const days = weekDays(week, zone);
  const birthdays = employees
    .filter((e) => e.birthday)
    .map((e) => ({ e, day: days.find((d) => d.slice(5) === e.birthday!.slice(5)) }))
    .filter((b) => b.day);

  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader
        eyebrow={fmtDate(today, zone, 'EEEE, MMMM d')}
        title="Manager View"
        description="Who’s working today, live — times count up on screen and new punches appear within 30 seconds."
        actions={
          <Link href="/base/schedule" className="b-btn-ghost"><CalendarDays size={15} /> Open schedule</Link>
        }
      />

      <div className="mb-6 grid grid-cols-3 gap-3 sm:gap-4">
        <Kpi icon={<Clock3 size={18} />} label="On the clock" value={onClock} tone="green" />
        <Kpi icon={<AlertTriangle size={18} />} label="Late / no-show" value={flagged} tone={flagged ? 'red' : 'gray'} />
        <Kpi icon={<CheckCircle2 size={18} />} label="Waiting for approval" value={approvals} tone={approvals ? 'amber' : 'gray'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card
          pad={false}
          title={
            <div className="b-segment">
              <Link href="/base/manager" aria-current={tab !== 'completed' ? 'page' : undefined}>Today ({active.length})</Link>
              <Link href="/base/manager?tab=completed" aria-current={tab === 'completed' ? 'page' : undefined}>Completed ({completed.length})</Link>
            </div>
          }
          actions={<span className="hidden text-xs text-muted sm:block">As of {fmtTime(new Date(now), zone)}</span>}
        >
          {showing.length === 0 ? (
            <EmptyState icon={<UserX size={20} />} title={tab === 'completed' ? 'Nobody has finished a shift yet today.' : 'Nobody is scheduled or punched in today.'} />
          ) : (
            <ul className="divide-y divide-stone/40">
              {showing.map((r) => {
                const first = r.entries[0];
                const last = r.entries[r.entries.length - 1];
                return (
                  <li key={r.employeeId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 sm:px-6">
                    <div className="relative">
                      <Avatar name={r.name} />
                      {(r.state === 'no-show' || r.state === 'late') && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-red-500" />}
                      {(r.state === 'on' || r.state === 'break') && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 font-medium">
                        <Link href={`/base/team/${r.employeeId}`} className="hover:text-brass-dark">{r.name}</Link>
                        {r.roleName && (
                          <span className="inline-flex items-center gap-1 text-xs font-normal text-muted">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.roleColor ?? '#A8834F' }} />
                            {r.roleName}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted">
                        {r.shift && <>{fmtTime(r.shift.starts_at, zone)} – {fmtTime(r.shift.ends_at, zone)} · </>}
                        {first ? (
                          r.state === 'done'
                            ? <>{fmtTime(first.clock_in_at, zone)} – {fmtTime(last.clock_out_at!, zone)} ({fmtDuration(r.minutes)})</>
                            : <>{fmtTime(first.clock_in_at, zone)} punch in (<LiveDuration minutes={r.minutes} running={r.running} serverNow={now} />)</>
                        ) : r.state === 'upcoming' ? 'Not punched in yet' : null}
                      </p>
                      {first?.clock_in_lat != null && first.clock_in_lng != null && (
                        <a href={mapLink(first.clock_in_lat, first.clock_in_lng)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[0.7rem] text-muted hover:underline">
                          <MapPin size={11} className={first.clock_in_in_geofence ? 'text-emerald-600' : 'text-brass'} />
                          Punched in at {first.clock_in_place ?? (first.clock_in_in_geofence === false ? `${fmtDistance(first.clock_in_distance_m)} from a store` : 'a store')}
                          {first.clock_in_accuracy_m != null && ` · ±${Math.round(first.clock_in_accuracy_m)} m`}
                        </a>
                      )}
                      {first?.clock_in_note && <p className="text-[0.7rem] text-ink">{first.clock_in_note}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {r.state === 'on' && <span className="b-badge-green">On the clock</span>}
                      {r.state === 'break' && <span className="b-badge-amber">On break</span>}
                      {r.state === 'late' && <span className="b-badge-red">Late</span>}
                      {r.state === 'no-show' && <span className="b-badge-red">No show</span>}
                      {r.state === 'upcoming' && <span className="b-badge-gray">Scheduled</span>}
                      {r.overtime > 0 && <span className="b-badge-red">{fmtDuration(r.overtime)} overtime</span>}
                      {r.entries.length > 1 && <span className="b-badge-amber">{r.entries.length} punches</span>}
                    </div>
                    <PunchTimeline entries={r.entries} zone={zone} now={now} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <aside className="space-y-6">
          {approvals > 0 && (
            <Card title="Needs your approval" pad={false}>
              <ul className="divide-y divide-stone/40">
                {pendingTimeOff.map((t) => (
                  <li key={t.id} className="px-5 py-4">
                    <p className="text-sm font-medium">{nameOf(t.employee_id)} · time off</p>
                    <p className="text-xs text-muted">{fmtDateRange(t.starts_on, t.ends_on, zone)} · {timeOffTypeLabel[t.type]} · {t.hours} hrs{t.note ? ` · “${t.note}”` : ''}</p>
                    <Decision action={reviewTimeOff} id={t.id} approve="approved" deny="denied" />
                  </li>
                ))}
                {shiftRequests.filter((r) => r.shift && (r.type === 'pickup' || r.claimant_id)).map((r) => (
                  <li key={r.id} className="px-5 py-4">
                    <p className="text-sm font-medium">
                      {r.type === 'pickup' ? `${nameOf(r.requester_id)} wants an open shift` : `${nameOf(r.claimant_id)} covers ${nameOf(r.requester_id)}`}
                    </p>
                    <p className="text-xs text-muted">{fmtDate(new Date(r.shift!.starts_at), zone)} · {fmtTime(r.shift!.starts_at, zone)} – {fmtTime(r.shift!.ends_at, zone)}</p>
                    <Decision action={decideShiftRequest} id={r.id} approve="approved" deny="denied" />
                  </li>
                ))}
                {availabilityRequests.map((a) => (
                  <li key={a.id} className="px-5 py-4">
                    <p className="text-sm font-medium">{nameOf(a.employee_id)} · new availability</p>
                    <p className="text-xs text-muted">Effective {fmtDate(a.effective_from, zone, 'MMM d, yyyy')} · <Link className="underline" href="/base/team-availability">review</Link></p>
                    <Decision action={reviewAvailability} id={a.id} approve="approved" deny="denied" />
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card
            title="This week"
            actions={
              <Dialog trigger={<><CalendarPlus size={14} /> Event</>} triggerClassName="b-btn-ghost b-btn-sm" title="Add an event" description="Shown on the schedule for everyone.">
                <EventForm today={today} />
              </Dialog>
            }
          >
            {events.length === 0 && birthdays.length === 0 ? (
              <p className="text-sm text-muted">No events or birthdays this week.</p>
            ) : (
              <ul className="space-y-3">
                {events.map((ev) => (
                  <li key={ev.id} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-sand text-brass-dark"><CalendarDays size={15} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{ev.title}</p>
                      <p className="text-xs text-muted">{fmtDateRange(ev.starts_on, ev.ends_on, zone)}{ev.description ? ` · ${ev.description}` : ''}</p>
                    </div>
                    <form action={deleteEvent}>
                      <input type="hidden" name="id" value={ev.id} />
                      <SubmitButton className="rounded-full p-1.5 text-muted hover:bg-red-50 hover:text-red-600" confirm="Delete this event?"><Trash2 size={14} /></SubmitButton>
                    </form>
                  </li>
                ))}
                {birthdays.map(({ e, day }) => (
                  <li key={e.id} className="flex items-center gap-3">
                    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#F7E8EE] text-[#A3486B]"><Cake size={15} /></span>
                    <p className="text-sm"><span className="font-medium">{fullName(e)}</span> <span className="text-muted">· birthday {fmtDate(day!, zone, 'EEE, MMM d')}</span></p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={<h2 className="b-h2 flex items-center gap-2"><NotebookPen size={18} className="text-brass" /> Manager log</h2>}>
            <ManagerLogForm />
            {log.length > 0 && (
              <ul className="mt-4 space-y-3 border-t border-stone/50 pt-4">
                {log.map((l) => (
                  <li key={l.id}>
                    <p className="whitespace-pre-line text-sm">{l.body}</p>
                    <p className="mt-0.5 text-[0.7rem] text-muted">{l.author_name} · {fmtDate(new Date(l.created_at), zone, 'MMM d')} {fmtTime(l.created_at, zone)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>

      <section id="leave" className="mt-6 scroll-mt-6">
        <LeaveCalendar first={calFirst} today={today} zone={zone} weekStart={settings.week_start} leave={leave} attendance={attendance} hrefFor={calHref} />
      </section>
    </>
  );
}

function Kpi({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: 'green' | 'red' | 'amber' | 'gray' }) {
  const tones = { green: 'bg-emerald-50 text-emerald-700', red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-700', gray: 'bg-linen text-muted' };
  return (
    <div className="b-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
      <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-full ${tones[tone]}`}>{icon}</span>
      <div>
        <p className="font-display text-3xl font-semibold leading-none">{value}</p>
        <p className="mt-1 text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}

function Decision({ action, id, approve, deny }: { action: (fd: FormData) => Promise<void>; id: string; approve: string; deny: string }) {
  return (
    <div className="mt-2.5 flex gap-2">
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="decision" value={approve} />
        <SubmitButton className="b-btn-primary b-btn-sm">Approve</SubmitButton>
      </form>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="decision" value={deny} />
        <SubmitButton className="b-btn-ghost b-btn-sm">Deny</SubmitButton>
      </form>
    </div>
  );
}
