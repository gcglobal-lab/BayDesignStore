import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { CalendarDays, CalendarPlus, Cake, Check, ChevronDown, ClipboardList, Expand, MapPin, NotebookPen, Trash2, UserX, X } from 'lucide-react';
import AutoRefresh from '@/components/base/AutoRefresh';
import { Dialog } from '@/components/base/Dialog';
import EventForm from '@/components/base/EventForm';
import LiveDuration from '@/components/base/LiveDuration';
import PunchTimeline from '@/components/base/PunchTimeline';
import { SubmitButton } from '@/components/base/forms';
import ManagerLogForm from '@/components/base/ManagerLogForm';
import { Avatar, EmptyState } from '@/components/base/ui';
import { requireManager } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { fmtDistance, mapLink } from '@/lib/base/geo';
import { overtimeMinutes } from '@/lib/base/overtime';
import { entryIssues } from '@/lib/base/payroll';
import { listEmployees, listEntries, listRoles, workedMinutes } from '@/lib/base/queries';
import { getSettings } from '@/lib/base/settings';
import { addDaysYmd, dayRangeIso, fmtDate, fmtDateRange, fmtDuration, fmtShortTime, fmtTime, payPeriodStartYmd, toYmd, todayYmd, weekDays, weekStartYmd } from '@/lib/base/time';
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
  /** When this person sorts on the timeline (first punch, or shift start). */
  at: string;
};

export default async function ManagerView({ searchParams }: PageProps<'/base/manager'>) {
  await requireManager();
  const { tab } = await searchParams;
  const settings = await getSettings();
  const zone = settings.timezone;
  const today = todayYmd(zone);
  const [dayStart, dayEnd] = dayRangeIso(today, zone);
  const week = weekStartYmd(today, zone, settings.week_start);
  const [weekStartIso] = dayRangeIso(week, zone);
  const weekEnd = addDaysYmd(week, 6, zone);
  const periodStart = payPeriodStartYmd(today, settings.pay_period_anchor, settings.pay_period_days, zone);
  const periodEnd = addDaysYmd(periodStart, settings.pay_period_days - 1, zone);
  const now = Date.now();

  const [employees, roles, todaysShiftsRes, todayEntries, weekEntries, eventsRes, pendingTimeOffRes, shiftReqRes, availReqRes, logRes, periodEntries] = await Promise.all([
    listEmployees(),
    listRoles(),
    db().from('shifts').select('*').not('employee_id', 'is', null).gte('starts_at', dayStart).lt('starts_at', dayEnd).order('starts_at'),
    listEntries(dayStart, dayEnd),
    listEntries(weekStartIso, dayEnd),
    db().from('events').select('*').lte('starts_on', weekEnd).gte('ends_on', week).order('starts_on'),
    db().from('time_off_requests').select('*').eq('status', 'pending').order('starts_on'),
    db().from('shift_requests').select('id, type, requester_id, claimant_id, shift:shifts(starts_at, ends_at)').eq('status', 'pending').order('created_at'),
    db().from('availability_requests').select('id, employee_id, effective_from, created_at').eq('status', 'pending').order('created_at'),
    db().from('manager_log').select('*').order('created_at', { ascending: false }).limit(8),
    listEntries(dayRangeIso(periodStart, zone)[0], dayEnd),
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
  // One row per person who is scheduled or has punched in today.
  const people = new Set([...shifts.map((s) => s.employee_id!), ...todayEntries.map((e) => e.employee_id)]);
  const rows: Row[] = [...people].flatMap((id) => {
    const emp = employees.find((e) => e.id === id);
    if (!emp) return [];
    const shift = shifts.find((s) => s.employee_id === id) ?? null;
    const entries = todayEntries.filter((e) => e.employee_id === id).sort((a, b) => a.clock_in_at.localeCompare(b.clock_in_at));
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
    const at = entries[0]?.clock_in_at ?? shift?.starts_at ?? new Date(now).toISOString();
    return [{ employeeId: id, name: fullName(emp), roleName: role?.name ?? null, roleColor: role?.color ?? null, shift, entries, state, minutes: dayMinutes, running, overtime: overtimeMinutes(dayMinutes, weekMinutes, settings), at }];
  });
  rows.sort((a, b) => a.at.localeCompare(b.at));

  const completed = rows.filter((r) => r.state === 'done');
  const active = rows.filter((r) => r.state !== 'done');
  const showing = tab === 'completed' ? completed : active;
  const onClock = rows.filter((r) => r.state === 'on' || r.state === 'break').length;
  const flaggedToday = rows.filter((r) => r.state === 'late' || r.state === 'no-show').length;
  const paidMinutes = rows.reduce((s, r) => s + r.minutes, 0);
  const wages = rows.reduce((sum, r) => {
    const emp = employees.find((e) => e.id === r.employeeId);
    return emp?.wage?.wage_type === 'hourly' ? sum + (r.minutes / 60) * emp.wage.amount : sum;
  }, 0);

  // Time cards a manager should look at before payroll, in the current pay period.
  const flaggedCards = periodEntries.map((e) => ({ e, issues: entryIssues(e, settings, now) })).filter((x) => x.issues.length > 0);
  const shiftAsks = shiftRequests.filter((r) => r.shift && (r.type === 'pickup' || r.claimant_id));

  // Timeline: group by the hour people start.
  const byHour = new Map<string, Row[]>();
  for (const r of showing) {
    const hour = fmtShortTime(new Date(new Date(r.at).setMinutes(0, 0, 0)), zone).replace('am', ' am').replace('pm', ' pm');
    byHour.set(hour, [...(byHour.get(hour) ?? []), r]);
  }

  // Birthdays falling in this week (month-day match).
  const days = weekDays(week, zone);
  const birthdays = employees
    .filter((e) => e.birthday)
    .map((e) => ({ e, day: days.find((d) => d.slice(5) === e.birthday!.slice(5)) }))
    .filter((b) => b.day);

  return (
    <>
      <AutoRefresh seconds={30} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-6">
          {/* Stats strip */}
          <section className="b-card flex flex-wrap items-stretch gap-y-4 !rounded-xl px-5 py-5 sm:px-7">
            <div className="flex items-center pr-6 sm:border-r sm:border-stone/60">
              <p className="text-[1.65rem] font-semibold tracking-tight">{fmtDate(today, zone, 'EEE, MMM d')}</p>
            </div>
            <Stat label="Paid hours" value={(paidMinutes / 60).toFixed(2)} />
            <Stat label="Est. wages" value={wages > 0 ? `$${wages.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '$--'} />
            <Stat label="On the clock" value={String(onClock)} tone={onClock ? 'text-emerald-600' : undefined} />
            <Stat label="Late / no-show" value={String(flaggedToday)} tone={flaggedToday ? 'text-red-600' : undefined} />
          </section>

          {/* Who's working */}
          <section className="b-card !rounded-xl p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="grid flex-1 grid-cols-2 rounded-xl bg-linen p-1 text-center text-[0.95rem] font-semibold">
                <Link href="/base/manager" aria-current={tab !== 'completed' ? 'page' : undefined} className={`rounded-lg py-2 transition-colors ${tab !== 'completed' ? 'bg-white text-ink shadow-sm ring-1 ring-stone/70' : 'text-muted hover:text-ink'}`}>Upcoming ({active.length})</Link>
                <Link href="/base/manager?tab=completed" aria-current={tab === 'completed' ? 'page' : undefined} className={`rounded-lg py-2 transition-colors ${tab === 'completed' ? 'bg-white text-ink shadow-sm ring-1 ring-stone/70' : 'text-muted hover:text-ink'}`}>Completed ({completed.length})</Link>
              </div>
              <Link href="/base/timesheets" className="rounded-lg p-2 text-muted hover:bg-linen hover:text-ink" title="Open timesheets" aria-label="Open timesheets"><Expand size={18} /></Link>
            </div>
            <p className="mt-3 text-center text-xs text-muted">As of {fmtTime(new Date(now), zone)} (updates every 30 secs)</p>

            {showing.length === 0 ? (
              <EmptyState icon={<UserX size={20} />} title={tab === 'completed' ? 'Nobody has finished a shift yet today.' : 'Nobody is scheduled or punched in today.'} />
            ) : (
              <div className="mt-3 space-y-1">
                {[...byHour.entries()].map(([hour, list]) => (
                  <div key={hour} className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
                    <div className="relative pt-3 text-sm font-semibold text-ink">
                      {hour}
                      <span className="absolute right-0 top-[1.15rem] h-px w-4 bg-stone" />
                    </div>
                    <ul className="space-y-2.5 py-1.5">
                      {list.map((r) => <PersonCard key={r.employeeId} r={r} zone={zone} now={now} />)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          {/* Needs review */}
          <section className="b-card !rounded-xl p-5">
            <h2 className="border-b border-stone/60 pb-3 text-lg font-semibold">Needs Review</h2>
            <Review title={`Flagged Time Cards (${flaggedCards.length})`} open={false}>
              {flaggedCards.length === 0 ? (
                <p className="text-sm text-muted">Nothing flagged this pay period.</p>
              ) : (
                <ul className="space-y-2">
                  {flaggedCards.slice(0, 12).map(({ e, issues }) => (
                    <li key={e.id} className="text-sm">
                      <Link href={`/base/timesheets?${new URLSearchParams({ view: 'range', from: toYmd(new Date(e.clock_in_at), zone), to: toYmd(new Date(e.clock_in_at), zone), employee: e.employee_id }).toString()}`} className="font-medium hover:text-violet-700">
                        {nameOf(e.employee_id)}
                      </Link>
                      <span className="text-muted"> · {fmtDate(new Date(e.clock_in_at), zone, 'MMM d')} · </span>
                      {issues.map((i) => <span key={i.label} className={`mr-1 ${i.tone === 'red' ? 'b-badge-red' : 'b-badge-amber'}`}>{i.label}</span>)}
                    </li>
                  ))}
                  {flaggedCards.length > 12 && <li className="text-xs text-muted">+{flaggedCards.length - 12} more in Timesheets</li>}
                </ul>
              )}
            </Review>
            <Review title={`Time Off Requests (${pendingTimeOff.length})`} open={pendingTimeOff.length > 0}>
              {pendingTimeOff.length === 0 ? (
                <p className="text-sm text-muted">No requests waiting.</p>
              ) : (
                <ul className="space-y-3">
                  {pendingTimeOff.map((t) => (
                    <li key={t.id} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{nameOf(t.employee_id)}</p>
                        <p className="text-xs text-muted">{fmtDateRange(t.starts_on, t.ends_on, zone)} · {timeOffTypeLabel[t.type]} · {Number(t.hours)} hrs{t.note ? ` · “${t.note}”` : ''}</p>
                      </div>
                      <Decision action={reviewTimeOff} id={t.id} />
                    </li>
                  ))}
                </ul>
              )}
            </Review>
            {shiftAsks.length > 0 && (
              <Review title={`Shift Requests (${shiftAsks.length})`} open>
                <ul className="space-y-3">
                  {shiftAsks.map((r) => (
                    <li key={r.id} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{r.type === 'pickup' ? `${nameOf(r.requester_id)} wants an open shift` : `${nameOf(r.claimant_id)} covers ${nameOf(r.requester_id)}`}</p>
                        <p className="text-xs text-muted">{fmtDate(new Date(r.shift!.starts_at), zone)} · {fmtTime(r.shift!.starts_at, zone)} – {fmtTime(r.shift!.ends_at, zone)}</p>
                      </div>
                      <Decision action={decideShiftRequest} id={r.id} />
                    </li>
                  ))}
                </ul>
              </Review>
            )}
            {availabilityRequests.length > 0 && (
              <Review title={`Availability Requests (${availabilityRequests.length})`} open>
                <ul className="space-y-3">
                  {availabilityRequests.map((a) => (
                    <li key={a.id} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{nameOf(a.employee_id)}</p>
                        <p className="text-xs text-muted">From {fmtDate(a.effective_from, zone, 'MMM d, yyyy')} · <Link className="underline" href="/base/team-availability">review</Link></p>
                      </div>
                      <Decision action={reviewAvailability} id={a.id} />
                    </li>
                  ))}
                </ul>
              </Review>
            )}
          </section>

          {/* Upcoming this week */}
          <section className="b-card !rounded-xl p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Upcoming</h2>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-violet-700">This Week</span>
                <Dialog trigger={<><CalendarPlus size={14} /> Event</>} triggerClassName="b-btn-ghost b-btn-sm" title="Add an event" description="Shown on the schedule for everyone.">
                  <EventForm today={today} />
                </Dialog>
              </div>
            </div>
            <ul className="mt-4 space-y-2.5">
              <li className="flex items-center gap-3 rounded-xl border border-stone/70 px-4 py-3 text-sm">
                <ClipboardList size={17} className="flex-none text-muted" />
                <span>
                  <span className="font-semibold">{periodEnd === today ? 'Today:' : `${fmtDate(periodEnd, zone, 'EEE, MMM d')}:`}</span> Run payroll for {fmtDateRange(periodStart, periodEnd, zone)}
                  <Link href={`/base/reports?report=payroll&from=${periodStart}&to=${periodEnd}`} className="ml-1 font-medium text-violet-700 hover:underline">report</Link>
                </span>
              </li>
              {events.map((ev) => (
                <li key={ev.id} className="flex items-start gap-3 rounded-xl border border-stone/70 px-4 py-3">
                  <CalendarDays size={17} className="mt-0.5 flex-none text-sea" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{ev.title}</p>
                    <p className="text-xs text-muted">{fmtDateRange(ev.starts_on, ev.ends_on, zone)}{ev.description ? ` · ${ev.description}` : ''}</p>
                  </div>
                  <form action={deleteEvent}>
                    <input type="hidden" name="id" value={ev.id} />
                    <SubmitButton className="rounded-full p-1.5 text-muted hover:bg-red-50 hover:text-red-600" confirm="Delete this event?"><Trash2 size={14} /></SubmitButton>
                  </form>
                </li>
              ))}
              {birthdays.map(({ e, day }) => (
                <li key={e.id} className="flex items-center gap-3 rounded-xl border border-stone/70 px-4 py-3 text-sm">
                  <Cake size={17} className="flex-none text-pink-600" />
                  <span><span className="font-semibold">{fullName(e)}</span> <span className="text-muted">· birthday {fmtDate(day!, zone, 'EEE, MMM d')}</span></span>
                </li>
              ))}
            </ul>
          </section>

          <section className="b-card !rounded-xl p-5">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><NotebookPen size={18} className="text-brass" /> Manager log</h2>
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
          </section>
        </aside>
      </div>

    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-[7rem] flex-1 px-4 sm:px-5">
      <p className="whitespace-nowrap text-sm text-muted">{label}</p>
      <p className={`mt-1 text-[1.45rem] font-medium tabular-nums ${tone ?? 'text-ink'}`}>{value}</p>
    </div>
  );
}

function PersonCard({ r, zone, now }: { r: Row; zone: string; now: number }) {
  const first = r.entries[0];
  const last = r.entries[r.entries.length - 1];
  const ring = r.state === 'on' || r.state === 'break' ? 'ring-emerald-400' : r.state === 'late' || r.state === 'no-show' ? 'ring-red-400' : 'ring-stone';
  const clockIn = first ? `${fmtTime(first.clock_in_at, zone)} clock in` : null;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-stone/70 bg-white px-4 py-3 transition-shadow hover:shadow-md">
      <span className={`rounded-full ring-2 ring-offset-2 ${ring}`}><Avatar name={r.name} /></span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-[0.98rem] font-semibold">
          <Link href={`/base/team/${r.employeeId}`} className="hover:text-violet-700">{r.name}</Link>
          {r.roleName && (
            <span className="inline-flex items-center gap-1.5 text-sm font-normal text-muted">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.roleColor ?? '#6366F1' }} />
              {r.roleName}
            </span>
          )}
        </p>
        <p className="text-sm text-muted">
          {r.shift && <>{fmtTime(r.shift.starts_at, zone)} - {fmtTime(r.shift.ends_at, zone)}{clockIn ? ' · ' : ''}</>}
          {clockIn &&
            (r.state === 'done' ? (
              <>{clockIn} – {fmtTime(last.clock_out_at!, zone)} out ({fmtDuration(r.minutes)})</>
            ) : (
              <>{clockIn} (<LiveDuration minutes={r.minutes} running={r.running} serverNow={now} />)</>
            ))}
          {!first && r.state === 'upcoming' && ' · not punched in yet'}
        </p>
        {first?.clock_in_lat != null && first.clock_in_lng != null && (
          <a href={mapLink(first.clock_in_lat, first.clock_in_lng)} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-[0.72rem] text-muted hover:underline">
            <MapPin size={11} className={first.clock_in_in_geofence ? 'text-emerald-600' : 'text-brass'} />
            {first.clock_in_place ?? (first.clock_in_in_geofence === false ? `${fmtDistance(first.clock_in_distance_m)} from a store` : 'a store')}
            {first.clock_in_note && ` · ${first.clock_in_note}`}
          </a>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {r.state === 'on' && <span className="b-badge-green">On the clock</span>}
        {r.state === 'break' && <span className="b-badge-amber">On break</span>}
        {r.state === 'late' && <span className="b-badge-red">Late</span>}
        {r.state === 'no-show' && <span className="b-badge-red">No show</span>}
        {r.overtime > 0 && <span className="b-badge-red">{fmtDuration(r.overtime)} OT</span>}
      </div>
      <PunchTimeline entries={r.entries} zone={zone} now={now} />
    </li>
  );
}

function Review({ title, open, children }: { title: string; open: boolean; children: ReactNode }) {
  return (
    <details className="group border-b border-stone/60 last:border-0" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-[0.98rem] text-ink">
        {title}
        <ChevronDown size={18} className="text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

function Decision({ action, id }: { action: (fd: FormData) => Promise<void>; id: string }) {
  return (
    <div className="flex flex-none gap-1.5">
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="decision" value="approved" />
        <SubmitButton className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone bg-white text-emerald-600 hover:border-emerald-400 hover:bg-emerald-50"><Check size={17} strokeWidth={2.5} /><span className="sr-only">Approve</span></SubmitButton>
      </form>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="decision" value="denied" />
        <SubmitButton className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone bg-white text-red-600 hover:border-red-400 hover:bg-red-50"><X size={17} strokeWidth={2.5} /><span className="sr-only">Deny</span></SubmitButton>
      </form>
    </div>
  );
}
