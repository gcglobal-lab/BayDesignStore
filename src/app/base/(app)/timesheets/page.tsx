import type { Metadata } from 'next';
import Link from 'next/link';
import { Clock3, MapPin, Pencil, Plus } from 'lucide-react';
import AutoRefresh from '@/components/base/AutoRefresh';
import LiveDuration from '@/components/base/LiveDuration';
import TimesheetFilter from '@/components/base/TimesheetFilter';
import { MAX_RANGE_DAYS, parseRange, rangePresets } from '@/lib/base/timesheetRange';
import { Dialog } from '@/components/base/Dialog';
import PunchMap, { type MapStore } from '@/components/base/map/PunchMap';
import { punchPoints, storePoints } from '@/lib/base/mapPoints';
import TimeCardForm from '@/components/base/TimeCardForm';
import { Avatar, Card, EmptyState, PageHeader } from '@/components/base/ui';
import WeekNav from '@/components/base/WeekNav';
import { isManager, requireViewer } from '@/lib/base/auth';
import { fmtDistance, mapLink } from '@/lib/base/geo';
import { entryIssues, summarizeHours } from '@/lib/base/payroll';
import { breakMinutes, listEmployees, listEntries, listLocations, workedMinutes } from '@/lib/base/queries';
import { getSettings } from '@/lib/base/settings';
import { addDaysYmd, dayRangeIso, fmtDate, fmtDuration, fmtTime, isYmd, payPeriodStartYmd, toYmd, todayYmd } from '@/lib/base/time';
import { fullName, type TimeEntry } from '@/lib/base/types';

export const metadata: Metadata = { title: 'Timesheets' };

/** Still adding up: punched in, not punched out, and not on an unpaid meal break. */
const isAccruing = (e: TimeEntry) => !e.clock_out_at && !e.breaks.some((b) => !b.ended_at && b.type === 'meal');

const hm = (iso: string, zone: string) => new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

function Place({ label, lat, lng, accuracy, inside, distance, place }: { label: string; lat: number | null; lng: number | null; accuracy: number | null; inside: boolean | null; distance: number | null; place: string | null }) {
  if (lat == null || lng == null) return <span className="text-xs text-muted">{label}: no location</span>;
  return (
    <a href={mapLink(lat, lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted hover:underline">
      <MapPin size={11} className={inside ? 'text-emerald-600' : 'text-brass'} />
      {label}: {place ?? (inside === true ? 'at a store' : inside === false ? `${fmtDistance(distance)} from a store` : 'recorded')}
      {accuracy != null && ` ±${Math.round(accuracy)} m`}
    </a>
  );
}

export default async function TimesheetsPage({ searchParams }: PageProps<'/base/timesheets'>) {
  const viewer = await requireViewer();
  const manager = isManager(viewer);
  // Adding or changing punch times is the admin's job; managers review.
  const admin = viewer.level === 'admin';
  const sp = await searchParams;
  const settings = await getSettings();
  const zone = settings.timezone;
  const today = todayYmd(zone);
  // Custom range (from the filter) > day (managers' default) > pay period (employees' default).
  const customRange = sp.view === 'range' ? parseRange(sp.from, sp.to) : null;
  const rangeError = customRange && 'error' in customRange ? customRange.error : null;
  const view: 'day' | 'period' | 'range' = customRange && !('error' in customRange) ? 'range' : manager && sp.view !== 'period' ? 'day' : 'period';

  const date = typeof sp.date === 'string' && isYmd(sp.date) ? sp.date : today;
  const periodStart = payPeriodStartYmd(date, settings.pay_period_anchor, settings.pay_period_days, zone);
  const periodEnd = addDaysYmd(periodStart, settings.pay_period_days - 1, zone);
  const [rangeFrom, rangeTo] =
    customRange && !('error' in customRange) ? [customRange.from, customRange.to] : view === 'day' ? [date, date] : [periodStart, periodEnd];
  const employeeFilter = manager ? (typeof sp.employee === 'string' && /^[0-9a-f-]{36}$/i.test(sp.employee) ? sp.employee : undefined) : viewer.employeeId!;

  const [employees, entries, locations] = await Promise.all([
    listEmployees(true),
    listEntries(dayRangeIso(rangeFrom, zone)[0], dayRangeIso(rangeTo, zone)[1], employeeFilter),
    listLocations(),
  ]);
  const stores = storePoints(locations);
  const nameOf = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? fullName(e) : 'Former team member';
  };
  const pickable = employees.filter((e) => e.status !== 'terminated').map((e) => ({ id: e.id, name: fullName(e) }));
  const segment = (v: 'day' | 'period') => `/base/timesheets?${new URLSearchParams({ view: v, date }).toString()}`;
  const rangeLabel = rangeFrom === rangeTo ? fmtDate(rangeFrom, zone, 'EEEE, MMM d, yyyy') : `${fmtDate(rangeFrom, zone, 'MMM d, yyyy')} – ${fmtDate(rangeTo, zone, 'MMM d, yyyy')}`;
  const who = employeeFilter && manager ? ` · ${nameOf(employeeFilter)}` : '';

  const header = (
    <>
      <PageHeader
        eyebrow="Time"
        title={manager ? 'Timesheets' : 'My Timesheet'}
        description={(view === 'period' ? `Pay period ${rangeLabel}` : rangeLabel) + who}
        actions={
          <>
            {manager && (
              <div className="b-segment">
                <Link href={segment('day')} aria-current={view === 'day' ? 'page' : undefined}>Day</Link>
                <Link href={segment('period')} aria-current={view === 'period' ? 'page' : undefined}>Pay period</Link>
                {view === 'range' && <span aria-current="page" className="rounded-full px-4 py-1.5 text-sm font-medium">Custom range</span>}
              </div>
            )}
            {view !== 'range' && (
              <WeekNav
                basePath="/base/timesheets"
                param="date"
                extra={{ view }}
                label={view === 'day' ? fmtDate(date, zone, 'EEE, MMM d, yyyy') : `${fmtDate(periodStart, zone, 'MMM d')} – ${fmtDate(periodEnd, zone, 'MMM d')}`}
                prev={view === 'day' ? addDaysYmd(date, -1, zone) : addDaysYmd(periodStart, -settings.pay_period_days, zone)}
                next={view === 'day' ? addDaysYmd(date, 1, zone) : addDaysYmd(periodStart, settings.pay_period_days, zone)}
                today={date !== today ? today : undefined}
              />
            )}
          </>
        }
      />
      {rangeError && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{rangeError}</p>}
      <TimesheetFilter
        presets={rangePresets(today, zone, settings.pay_period_anchor, settings.pay_period_days)}
        from={rangeFrom}
        to={rangeTo}
        employee={manager ? (employeeFilter ?? '') : undefined}
        employees={manager ? pickable : undefined}
        zone={zone}
        weekStart={settings.week_start}
        maxDays={MAX_RANGE_DAYS}
      />
    </>
  );

  // One section per person: a heading with their name and total, their time cards for the
  // filtered dates, then the next person — and the grand total for the period at the end.
  const now = Date.now();
  const byEmployee = new Map<string, TimeEntry[]>();
  for (const e of entries) byEmployee.set(e.employee_id, [...(byEmployee.get(e.employee_id) ?? []), e]);
  const groups = [...byEmployee.entries()]
    .map(([id, list]) => {
      const emp = employees.find((x) => x.id === id);
      const sum = summarizeHours(list, settings, now);
      const rate = emp?.wage?.wage_type === 'hourly' ? emp.wage.amount : null;
      const pay = rate == null ? null : (sum.regular / 60) * rate + (sum.overtime / 60) * rate * 1.5;
      return { id, name: nameOf(id), role: emp?.roles[0]?.name ?? null, list, sum, pay, running: list.filter(isAccruing).length };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const columns = admin ? 7 : 6;
  const emptyTitle = view === 'day' ? 'No time cards for this day.' : view === 'range' ? 'No time cards in this date range.' : 'No time cards in this pay period.';

  return (
    <>
      {/* New punches and punch-outs show up on their own; running times tick in between. */}
      <AutoRefresh seconds={30} />
      {header}
      <Card pad={false} className="overflow-hidden">
        {groups.length === 0 ? (
          <EmptyState icon={<Clock3 size={20} />} title={emptyTitle} />
        ) : (
          <div className="overflow-x-auto">
            <table className="b-table min-w-[980px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="!bg-sky-100/80 !text-sky-700">Punch in – out</th>
                  <th className="!bg-emerald-100/80 !text-emerald-700">Total worked</th>
                  <th className="!bg-amber-100/70 !text-amber-700">Meal breaks</th>
                  <th>Location</th>
                  <th>Issues</th>
                  {admin && <th />}
                </tr>
              </thead>
              {groups.map((g) => (
                <tbody key={g.id} className="border-b-[6px] border-ivory last:border-b-0">
                  <tr className="text-white">
                    <td colSpan={columns} className="!border-0 bg-gradient-to-r from-brass-dark via-[#7C3AED] to-[#C026D3] !py-3">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <span className="flex items-center gap-3">
                          <span className="rounded-full ring-2 ring-white/70"><Avatar name={g.name} size="sm" /></span>
                          <span className="font-display text-xl font-semibold leading-none">{g.name}</span>
                          {g.role && <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[0.7rem] font-medium uppercase tracking-wider">{g.role}</span>}
                          {g.running > 0 && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/90 px-2.5 py-0.5 text-[0.7rem] font-semibold">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> On the clock
                            </span>
                          )}
                        </span>
                        <span className="ml-auto flex flex-wrap items-center gap-2 text-sm">
                          <span className="rounded-full bg-white/15 px-3 py-1">{g.list.length} time card{g.list.length === 1 ? '' : 's'}</span>
                          {g.sum.overtime > 0 && <span className="rounded-full bg-red-600 px-3 py-1 font-medium">{fmtDuration(g.sum.overtime)} overtime</span>}
                          {manager && view !== 'day' && <span className="rounded-full bg-white/15 px-3 py-1">{g.pay == null ? 'No hourly wage' : `Est. pay $${g.pay.toFixed(2)}`}</span>}
                          <span className="rounded-full bg-white px-3.5 py-1 font-semibold text-ink shadow-sm">
                            Total worked <LiveDuration minutes={g.sum.total} running={g.running} serverNow={now} />
                          </span>
                        </span>
                      </div>
                    </td>
                  </tr>
                  {g.list.map((e, i) => <EntryRow key={e.id} e={e} name={g.name} zone={zone} settings={settings} employees={pickable} canEdit={admin} now={now} striped={i % 2 === 1} stores={stores} manager={manager} />)}
                </tbody>
              ))}
            </table>
          </div>
        )}
        {admin && (
          <div className="border-t border-stone/50 px-4 py-3">
            <Dialog trigger={<><Plus size={15} /> Add time card</>} triggerClassName="b-btn-quiet" title="Add time card" description="For someone who couldn’t punch in. Marked as manually added.">
              <TimeCardForm employees={pickable} date={view === 'day' ? date : rangeTo} />
            </Dialog>
          </div>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">
        Total worked = punch in to punch out, minus unpaid meal breaks (rest breaks are paid). Overtime over {settings.weekly_overtime_hours ?? '—'} hrs/week
        {settings.daily_overtime_hours ? ` or ${settings.daily_overtime_hours} hrs/day` : ''}, estimated at 1.5× the hourly wage.
      </p>
    </>
  );
}

function EntryRow({
  e,
  name,
  zone,
  settings,
  employees,
  canEdit,
  now,
  striped,
  stores,
  manager,
}: {
  e: TimeEntry;
  name: string;
  zone: string;
  settings: Awaited<ReturnType<typeof getSettings>>;
  employees: { id: string; name: string }[];
  canEdit: boolean;
  now: number;
  striped: boolean;
  stores: MapStore[];
  manager: boolean;
}) {
  const issues = entryIssues(e, settings, now);
  const meal = Math.round(breakMinutes(e, 'meal', now));
  const onMeal = e.breaks.some((b) => !b.ended_at && b.type === 'meal');
  return (
    <tr className={`${striped ? 'bg-ivory/70' : 'bg-white'} hover:bg-linen/70`}>
      <td className="whitespace-nowrap">
        <span className="block font-semibold text-ink">{fmtDate(new Date(e.clock_in_at), zone, 'EEE')}</span>
        <span className="text-xs text-muted">{fmtDate(new Date(e.clock_in_at), zone, 'MMM d, yyyy')}</span>
      </td>
      <td className="whitespace-nowrap bg-sky-50/70 text-sky-950">
        <span className="font-medium">{fmtTime(e.clock_in_at, zone)}</span>
        <span className="mx-1.5 text-sky-400">→</span>
        {e.clock_out_at ? (
          <span className="font-medium">{fmtTime(e.clock_out_at, zone)}</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> {onMeal ? 'on meal break' : 'on the clock'}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap bg-emerald-50/80 font-semibold text-emerald-900">
        <LiveDuration minutes={workedMinutes(e, now)} running={isAccruing(e) ? 1 : 0} serverNow={now} />
      </td>
      <td className="whitespace-nowrap bg-amber-50/60 text-amber-900">{fmtDuration(meal)}</td>
      <td className="space-y-0.5">
        <Place label="In" lat={e.clock_in_lat} lng={e.clock_in_lng} accuracy={e.clock_in_accuracy_m} inside={e.clock_in_in_geofence} distance={e.clock_in_distance_m} place={e.clock_in_place} />
        <br />
        {e.clock_out_at && <Place label="Out" lat={e.clock_out_lat} lng={e.clock_out_lng} accuracy={e.clock_out_accuracy_m} inside={e.clock_out_in_geofence} distance={e.clock_out_distance_m} place={e.clock_out_place} />}
        {e.clock_in_note && <p className="max-w-[220px] text-xs text-ink">{e.clock_in_note}</p>}
        {e.clock_in_lat != null && e.clock_in_lng != null && (
          <Dialog
            trigger={<><MapPin size={11} /> View map</>}
            triggerClassName="mt-1 inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[0.7rem] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200 hover:bg-violet-100"
            title={`${name} · ${fmtDate(new Date(e.clock_in_at), zone, 'EEE, MMM d')}`}
            description={`In ${fmtTime(e.clock_in_at, zone)}${e.clock_out_at ? ` · Out ${fmtTime(e.clock_out_at, zone)}` : ' · still on the clock'}`}
            wide
          >
            <PunchMap points={punchPoints([e], zone)} stores={stores} height={420} />
            {manager && (
              <Link href={`/base/live?${new URLSearchParams({ day: toYmd(new Date(e.clock_in_at), zone), entry: e.id })}`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-700 hover:underline">
                <MapPin size={14} /> See the full route for this shift
              </Link>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <PunchCard kind="in" time={fmtTime(e.clock_in_at, zone)} place={e.clock_in_place} accuracy={e.clock_in_accuracy_m} distance={e.clock_in_distance_m} inside={e.clock_in_in_geofence} />
              {e.clock_out_at ? (
                <PunchCard kind="out" time={fmtTime(e.clock_out_at, zone)} place={e.clock_out_place} accuracy={e.clock_out_accuracy_m} distance={e.clock_out_distance_m} inside={e.clock_out_in_geofence} />
              ) : (
                <div className="flex items-center justify-center rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/60 p-4 text-sm font-medium text-emerald-800">Still on the clock</div>
              )}
            </div>
          </Dialog>
        )}
      </td>
      <td>
        <div className="flex flex-wrap gap-1">
          {issues.map((i) => <span key={i.label} className={i.tone === 'red' ? 'b-badge-red' : 'b-badge-amber'}>{i.label}</span>)}
        </div>
        {e.notes && <p className="mt-1 max-w-[200px] text-xs italic text-muted">“{e.notes}”</p>}
      </td>
      {canEdit && <td className="text-right">
        <Dialog trigger={<Pencil size={14} />} triggerClassName="b-btn-quiet !p-2" title={`Edit time card · ${name}`}>
          <TimeCardForm
            employees={employees}
            date={toYmd(new Date(e.clock_in_at), zone)}
            values={{
              id: e.id,
              employee_id: e.employee_id,
              date: toYmd(new Date(e.clock_in_at), zone),
              clock_in: hm(e.clock_in_at, zone),
              clock_out: e.clock_out_at ? hm(e.clock_out_at, zone) : '',
              meal_minutes: meal,
              notes: e.notes ?? '',
            }}
          />
        </Dialog>
      </td>}
    </tr>
  );
}


function PunchCard({ kind, time, place, accuracy, distance, inside }: { kind: 'in' | 'out'; time: string; place: string | null; accuracy: number | null; distance: number | null; inside: boolean | null }) {
  const tone = kind === 'in' ? 'from-emerald-50 to-white ring-emerald-200 text-emerald-800' : 'from-rose-50 to-white ring-rose-200 text-rose-800';
  return (
    <div className={`rounded-2xl bg-gradient-to-br p-4 ring-1 ring-inset ${tone}`}>
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em]">{kind === 'in' ? 'Punch in' : 'Punch out'}</p>
      <p className="mt-1 text-xl font-semibold text-ink">{time}</p>
      <p className="mt-1 text-sm text-ink">{place ?? 'Location recorded'}</p>
      <p className="mt-1 text-xs text-muted">
        {inside === true ? 'At a store' : inside === false ? `${fmtDistance(distance)} from the nearest store` : 'No store nearby to compare'}
        {accuracy != null && ` · ±${Math.round(accuracy)} m`}
      </p>
    </div>
  );
}
