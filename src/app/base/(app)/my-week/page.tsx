import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeftRight, CalendarCheck2, CalendarRange, CalendarX2, Clock3, Hand, MapPin, Palmtree, Plane, Thermometer } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import { SubmitButton } from '@/components/base/forms';
import TimeClock, { type ClockState } from '@/components/base/TimeClock';
import LiveDuration from '@/components/base/LiveDuration';
import PaidLeaveSummary from '@/components/base/PaidLeaveSummary';
import TimeOffForm, { type PaidLeft } from '@/components/base/TimeOffForm';
import { leaveBalance } from '@/lib/base/leave';
import { Card, EmptyState, PageHeader, Stat, StatusBadge } from '@/components/base/ui';
import WeekNav from '@/components/base/WeekNav';
import { requireEmployee } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getEmployee, getOpenEntry, listEntries, listLocations, listRoles, workedMinutes } from '@/lib/base/queries';
import { getSettings } from '@/lib/base/settings';
import {
  addDaysYmd, dayRangeIso, fmtDate, fmtDateRange, fmtDuration, fmtTime, isYmd, minutesBetween, todayYmd, weekStartYmd, type Ymd,
} from '@/lib/base/time';
import { fmtDays, fullName, timeOffReasonLabel, timeOffTypeLabel, workTypeOf, workTypes, type Shift, type TimeOffRequest } from '@/lib/base/types';
import { cancelShiftRequest, offerShift, requestOpenShift, takeShift } from './actions';
import { cancelTimeOff } from '../time-off/actions';

export const metadata: Metadata = { title: 'My Week' };

type ShiftRequestRow = {
  id: string;
  type: 'pickup' | 'cover';
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  requester_id: string;
  claimant_id: string | null;
  note: string | null;
  created_at: string;
  shift: Shift | null;
  requester: { first_name: string; last_name: string } | null;
};

const paidMinutes = (s: Shift) => Math.max(0, minutesBetween(s.starts_at, s.ends_at) - s.break_minutes);

export default async function MyWeekPage({ searchParams }: PageProps<'/base/my-week'>) {
  const viewer = await requireEmployee();
  const sp = await searchParams;
  const settings = await getSettings();
  const zone = settings.timezone;
  const today = todayYmd(zone);
  const thisWeek = weekStartYmd(today, zone, settings.week_start);
  const week: Ymd = typeof sp.week === 'string' && isYmd(sp.week) ? weekStartYmd(sp.week, zone, settings.week_start) : thisWeek;
  const weekEnd = addDaysYmd(week, 6, zone);
  const lastWeek = addDaysYmd(week, -7, zone);
  const scheduleTab = sp.tab === 'open' ? 'open' : 'mine';
  const requestTab = sp.req === 'yours' ? 'yours' : 'incoming';

  const [weekStartIso] = dayRangeIso(week, zone);
  const [, weekEndIso] = dayRangeIso(weekEnd, zone);
  const [lastWeekStartIso] = dayRangeIso(lastWeek, zone);
  const nowIso = new Date().toISOString();

  const thisYear = Number(today.slice(0, 4));
  const [me, roles, locations, openEntry, myShifts, openShifts, requests, timeOff, entries, paidBalance, paidBalanceNext] = await Promise.all([
    getEmployee(viewer.employeeId),
    listRoles(),
    listLocations(),
    getOpenEntry(viewer.employeeId),
    db().from('shifts').select('*').eq('employee_id', viewer.employeeId).not('published_at', 'is', null).gte('starts_at', lastWeekStartIso).lt('starts_at', weekEndIso).order('starts_at'),
    db().from('shifts').select('*').is('employee_id', null).not('published_at', 'is', null).gte('starts_at', nowIso).order('starts_at').limit(20),
    db()
      .from('shift_requests')
      .select('id, type, status, requester_id, claimant_id, note, created_at, shift:shifts(*), requester:employees!shift_requests_requester_id_fkey(first_name, last_name)')
      .or(`requester_id.eq.${viewer.employeeId},claimant_id.eq.${viewer.employeeId},and(type.eq.cover,status.eq.pending,claimant_id.is.null)`)
      .order('created_at', { ascending: false })
      .limit(40),
    db().from('time_off_requests').select('*').eq('employee_id', viewer.employeeId).in('status', ['pending', 'approved']).gte('ends_on', today).order('starts_on').limit(10),
    listEntries(weekStartIso, weekEndIso, viewer.employeeId),
    leaveBalance(viewer.employeeId, thisYear),
    leaveBalance(viewer.employeeId, thisYear + 1),
  ]);
  const paidLeft: PaidLeft = { me: { [thisYear]: paidBalance.remaining, [thisYear + 1]: paidBalanceNext.remaining } };
  const noPaidLeave = paidBalance.remaining <= 0;

  const shifts = must<Shift[]>(myShifts, 'load your shifts');
  const thisWeekShifts = shifts.filter((s) => s.starts_at >= weekStartIso);
  const lastWeekShifts = shifts.filter((s) => s.starts_at < weekStartIso);
  const open = must<Shift[]>(openShifts, 'load open shifts');
  const allRequests = must<ShiftRequestRow[]>(requests, 'load shift requests').filter((r) => r.shift);
  const myTimeOff = must<TimeOffRequest[]>(timeOff, 'load time off');

  const roleOf = (id: string | null) => roles.find((r) => r.id === id);
  const scheduled = thisWeekShifts.reduce((s, x) => s + paidMinutes(x), 0);
  const scheduledLast = lastWeekShifts.reduce((s, x) => s + paidMinutes(x), 0);
  const now = Date.now();
  const worked = entries.reduce((s, e) => s + workedMinutes(e, now), 0);
  const workedRunning = entries.filter((e) => !e.clock_out_at && !e.breaks.some((b) => !b.ended_at && b.type === 'meal')).length;
  const hourly = me?.wage?.wage_type === 'hourly' ? me.wage.amount : null;
  const money = (minutes: number) => (hourly == null ? '—' : `$${((minutes / 60) * hourly).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  const pendingFor = new Set(allRequests.filter((r) => r.status === 'pending' && r.requester_id === viewer.employeeId).map((r) => r.shift!.id));
  const incoming = allRequests.filter((r) => r.requester_id !== viewer.employeeId && r.status === 'pending' && new Date(r.shift!.starts_at) > new Date());
  const yours = allRequests.filter((r) => r.requester_id === viewer.employeeId);

  const nextShift = shifts.find((s) => new Date(s.ends_at) > new Date());
  const location = openEntry?.location_id ? locations.find((l) => l.id === openEntry.location_id) : null;
  const workType = workTypeOf(me);
  const kind = workTypes[workType];
  const clockState: ClockState = {
    clockInAt: openEntry?.clock_in_at ?? null,
    mealBreaks: (openEntry?.breaks ?? []).filter((b) => b.type === 'meal').map((b) => ({ startedAt: b.started_at, endedAt: b.ended_at })),
    onBreak: (() => {
      const b = openEntry?.breaks.find((x) => !x.ended_at);
      return b ? { type: b.type, startedAt: b.started_at } : null;
    })(),
    clockInPlace:
      openEntry && openEntry.clock_in_lat != null && openEntry.clock_in_lng != null
        ? {
            lat: openEntry.clock_in_lat,
            lng: openEntry.clock_in_lng,
            accuracy: openEntry.clock_in_accuracy_m == null ? null : Math.round(openEntry.clock_in_accuracy_m),
            atStore: openEntry.clock_in_in_geofence === true,
            place: openEntry.clock_in_place ?? location?.name ?? null,
          }
        : null,
    clockInNote: openEntry?.clock_in_note ?? null,
  };

  const tabHref = (params: Record<string, string>) => `/base/my-week?${new URLSearchParams({ week, tab: scheduleTab, req: requestTab, ...params }).toString()}`;

  return (
    <>
      <PageHeader
        eyebrow={fmtDate(today, zone, 'EEEE, MMMM d')}
        title={`Welcome back, ${viewer.firstName}`}
        actions={
          <WeekNav
            basePath="/base/my-week"
            label={`${fmtDate(week, zone, 'MMM d')} – ${fmtDate(weekEnd, zone, 'MMM d, yyyy')}`}
            prev={lastWeek}
            next={addDaysYmd(week, 7, zone)}
            today={week !== thisWeek ? thisWeek : undefined}
            extra={{ tab: scheduleTab, req: requestTab }}
          />
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <TimeClock
            state={clockState}
            timezone={zone}
            requireLocation={settings.require_location}
            kind={{ clockTitle: kind.clockTitle, note: kind.note }}
            nextShiftLabel={nextShift ? `${fmtDate(new Date(nextShift.starts_at), zone, 'EEE, MMM d')} · ${fmtTime(nextShift.starts_at, zone)} – ${fmtTime(nextShift.ends_at, zone)}` : null}
          />

          <Card
            pad={false}
            title={
              <div className="b-segment">
                <Link href={tabHref({ tab: 'mine' })} aria-current={scheduleTab === 'mine' ? 'page' : undefined}>My Schedule</Link>
                <Link href={tabHref({ tab: 'open' })} aria-current={scheduleTab === 'open' ? 'page' : undefined}>Open Shifts{open.length ? ` (${open.length})` : ''}</Link>
              </div>
            }
          >
            {scheduleTab === 'mine' ? (
              thisWeekShifts.length === 0 ? (
                <EmptyState icon={<CalendarCheck2 size={20} />} title="You don’t have any scheduled shifts this week.">
                  <Link href="/base/availability" className="b-btn-brass b-btn-sm mt-3">Update your availability</Link>
                </EmptyState>
              ) : (
                <ul className="divide-y divide-stone/40">
                  {thisWeekShifts.map((s) => {
                    const role = roleOf(s.role_id);
                    const future = new Date(s.starts_at) > new Date();
                    return (
                      <li key={s.id} className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6">
                        <div className="w-14 text-center">
                          <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-brass">{fmtDate(new Date(s.starts_at), zone, 'EEE')}</p>
                          <p className="font-display text-2xl font-semibold leading-none">{fmtDate(new Date(s.starts_at), zone, 'd')}</p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{fmtTime(s.starts_at, zone)} – {fmtTime(s.ends_at, zone)}</p>
                          <p className="text-xs text-muted">
                            {role && <span className="mr-2 inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: role.color }} />{role.name}</span>}
                            {fmtDuration(paidMinutes(s))}{s.notes ? ` · ${s.notes}` : ''}
                          </p>
                        </div>
                        {future && (pendingFor.has(s.id) ? (
                          <span className="b-badge-amber">Cover requested</span>
                        ) : (
                          <form action={offerShift}>
                            <input type="hidden" name="id" value={s.id} />
                            <SubmitButton className="b-btn-ghost b-btn-sm" confirm="Ask your teammates to cover this shift?"><ArrowLeftRight size={13} /> Find cover</SubmitButton>
                          </form>
                        ))}
                      </li>
                    );
                  })}
                </ul>
              )
            ) : open.length === 0 ? (
              <EmptyState icon={<Hand size={20} />} title="No open shifts right now." />
            ) : (
              <ul className="divide-y divide-stone/40">
                {open.map((s) => {
                  const role = roleOf(s.role_id);
                  return (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                      <div>
                        <p className="font-medium">{fmtDate(new Date(s.starts_at), zone, 'EEE, MMM d')} · {fmtTime(s.starts_at, zone)} – {fmtTime(s.ends_at, zone)}</p>
                        <p className="text-xs text-muted">{role?.name ?? 'Any role'}</p>
                      </div>
                      {pendingFor.has(s.id) ? (
                        <span className="b-badge-amber">Requested</span>
                      ) : (
                        <form action={requestOpenShift}>
                          <input type="hidden" name="id" value={s.id} />
                          <SubmitButton className="b-btn-brass b-btn-sm">Request shift</SubmitButton>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card
            pad={false}
            title={
              <div className="b-segment">
                <Link href={tabHref({ req: 'incoming' })} aria-current={requestTab === 'incoming' ? 'page' : undefined}>Incoming Requests{incoming.length ? ` (${incoming.length})` : ''}</Link>
                <Link href={tabHref({ req: 'yours' })} aria-current={requestTab === 'yours' ? 'page' : undefined}>Your Requests</Link>
              </div>
            }
          >
            {requestTab === 'incoming' ? (
              incoming.length === 0 ? (
                <EmptyState icon={<ArrowLeftRight size={20} />} title="You haven’t received any shift trades." />
              ) : (
                <ul className="divide-y divide-stone/40">
                  {incoming.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                      <div>
                        <p className="font-medium">{r.requester ? fullName(r.requester) : 'A teammate'} needs cover</p>
                        <p className="text-xs text-muted">
                          {fmtDate(new Date(r.shift!.starts_at), zone, 'EEE, MMM d')} · {fmtTime(r.shift!.starts_at, zone)} – {fmtTime(r.shift!.ends_at, zone)}
                          {r.note ? ` · “${r.note}”` : ''}
                        </p>
                      </div>
                      {r.claimant_id === viewer.employeeId ? (
                        <span className="b-badge-blue">Waiting for manager</span>
                      ) : (
                        <form action={takeShift}>
                          <input type="hidden" name="id" value={r.id} />
                          <SubmitButton className="b-btn-brass b-btn-sm" confirm="Offer to take this shift? A manager will confirm.">Take shift</SubmitButton>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )
            ) : yours.length === 0 ? (
              <EmptyState icon={<ArrowLeftRight size={20} />} title="You haven’t made any shift requests." />
            ) : (
              <ul className="divide-y divide-stone/40">
                {yours.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                    <div>
                      <p className="font-medium">{r.type === 'cover' ? 'Cover for my shift' : 'Pick up open shift'}</p>
                      <p className="text-xs text-muted">{fmtDate(new Date(r.shift!.starts_at), zone, 'EEE, MMM d')} · {fmtTime(r.shift!.starts_at, zone)} – {fmtTime(r.shift!.ends_at, zone)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.status} />
                      {r.status === 'pending' && (
                        <form action={cancelShiftRequest}>
                          <input type="hidden" name="id" value={r.id} />
                          <SubmitButton className="b-btn-quiet b-btn-sm">Withdraw</SubmitButton>
                        </form>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card title="Quick actions" actions={<span className="b-badge-gray">{kind.label}</span>}>
            <div className="grid gap-2">
              {noPaidLeave ? (
                <span className="b-btn-ghost w-full !justify-start cursor-not-allowed opacity-60" aria-disabled="true">
                  <Palmtree size={15} /> No paid leave left for {thisYear}
                </span>
              ) : (
                <Dialog trigger={<><Palmtree size={15} /> Apply for paid leave · {fmtDays(paidBalance.remaining)} left</>} triggerClassName="b-btn-brass w-full !justify-start" title="Apply for paid leave" description="Your manager will be asked to approve it.">
                  <TimeOffForm today={today} defaultType="vacation" paidLeft={paidLeft} />
                </Dialog>
              )}
              <Dialog trigger={<><Thermometer size={15} /> Call in sick</>} triggerClassName="b-btn-ghost w-full !justify-start" title="Sick leave" description="Let your manager know you can’t come in.">
                <TimeOffForm today={today} defaultType="sick" paidLeft={paidLeft} />
              </Dialog>
              <Dialog trigger={<><Plane size={15} /> Other leave</>} triggerClassName="b-btn-ghost w-full !justify-start" title="Request leave" description="Your manager will be asked to approve it.">
                <TimeOffForm today={today} defaultType={noPaidLeave ? 'unpaid' : 'vacation'} paidLeft={paidLeft} />
              </Dialog>
              <Link href="/base/availability" className="b-btn-ghost w-full !justify-start"><CalendarRange size={15} /> Update my availability</Link>
              <Link href="/base/timesheets" className="b-btn-ghost w-full !justify-start"><Clock3 size={15} /> My timesheet</Link>
            </div>
          </Card>

          <PaidLeaveSummary balance={paidBalance} actions={<Link href="/base/time-off" className="text-xs font-medium text-brass-dark hover:underline">Details</Link>} />

          <Card title={kind.visitsTitle}>
            {entries.length === 0 ? (
              <EmptyState icon={<MapPin size={20} />} title="No punch-ins this week yet." />
            ) : (
              <ul className="-my-2 divide-y divide-stone/40">
                {entries.map((e) => (
                  <li key={e.id} className="py-3">
                    <p className="text-sm font-medium">{e.clock_in_place ?? 'Location not recorded'}</p>
                    <p className="text-xs text-muted">
                      {fmtDate(new Date(e.clock_in_at), zone, 'EEE, MMM d')} · {fmtTime(e.clock_in_at, zone)}
                      {e.clock_out_at ? ` – ${fmtTime(e.clock_out_at, zone)}` : ' · on the clock'}
                    </p>
                    {e.clock_in_note && <p className="mt-0.5 text-xs text-ink">{e.clock_in_note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Your Week">
            <Stat label="Scheduled" value={fmtDuration(scheduled)} hint={`vs ${fmtDuration(scheduledLast)} last week · HH:MM`} />
            <Stat label="Scheduled est. wages" value={money(scheduled)} hint={`vs ${money(scheduledLast)} last week`} />
            <Stat label="Worked so far" value={<LiveDuration minutes={worked} running={workedRunning} serverNow={now} />} hint="This week · HH:MM" />
          </Card>

          <Card
            title="Upcoming Time Off"
            actions={
              <Dialog trigger={<><Plane size={14} /> Request</>} triggerClassName="b-btn-brass b-btn-sm" title="Request time off" description="Your manager will be asked to approve it.">
                <TimeOffForm today={today} defaultType={noPaidLeave ? 'unpaid' : 'vacation'} paidLeft={paidLeft} />
              </Dialog>
            }
          >
            {myTimeOff.length === 0 ? (
              <EmptyState icon={<CalendarX2 size={20} />} title="You don’t have any upcoming time off." />
            ) : (
              <ul className="-my-2 divide-y divide-stone/40">
                {myTimeOff.map((t) => (
                  <li key={t.id} className="flex items-start justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium">{fmtDateRange(t.starts_on, t.ends_on, zone)}</p>
                      <p className="text-xs text-muted">{timeOffTypeLabel[t.type]} · {timeOffReasonLabel[t.reason]}{!t.all_day && t.start_time ? ` · ${t.start_time.slice(0, 5)}–${t.end_time?.slice(0, 5)}` : ''}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <StatusBadge status={t.status} />
                      <form action={cancelTimeOff}>
                        <input type="hidden" name="id" value={t.id} />
                        <SubmitButton className="text-[0.7rem] text-muted underline-offset-2 hover:text-ink hover:underline" confirm="Cancel this time off?">Cancel</SubmitButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}

