import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarX2, Check, ChevronRight, Plane, Settings, X } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import { SubmitButton } from '@/components/base/forms';
import { DefaultPaidLeaveForm, LeaveAllowanceAllForm, LeaveAllowanceForm } from '@/components/base/LeaveForms';
import TimeOffForm, { type PaidLeft } from '@/components/base/TimeOffForm';
import { Avatar, Card, EmptyState, PageHeader, StatusBadge } from '@/components/base/ui';
import { isManager, requireViewer } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { leaveBalanceYears, leaveBalances } from '@/lib/base/leave';
import PaidLeaveSummary from '@/components/base/PaidLeaveSummary';
import { listEmployees } from '@/lib/base/queries';
import { getSettings } from '@/lib/base/settings';
import { fmtDateRange, todayYmd } from '@/lib/base/time';
import { fmtDays, fullName, timeOffReasonLabel, timeOffTypeLabel, type TimeOffRequest, type TimeOffType } from '@/lib/base/types';
import { cancelTimeOff, reviewTimeOff } from './actions';
import Select from '@/components/ui/Select';

export const metadata: Metadata = { title: 'Time Off' };

const LEAVE_TYPES: TimeOffType[] = ['vacation', 'pto', 'sick', 'unpaid'];

const detail = (t: TimeOffRequest) =>
  `${timeOffTypeLabel[t.type]} | ${timeOffReasonLabel[t.reason]}${t.all_day ? '' : ` · ${t.start_time?.slice(0, 5)}–${t.end_time?.slice(0, 5)}`}`;

export default async function TimeOffPage({ searchParams }: PageProps<'/base/time-off'>) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const settings = await getSettings();
  const zone = settings.timezone;
  const today = todayYmd(zone);
  const manager = isManager(viewer);
  const thisYear = Number(today.slice(0, 4));

  if (!manager) return <EmployeeTimeOff employeeId={viewer.employeeId!} zone={zone} today={today} />;

  const year = typeof sp.year === 'string' && /^\d{4}$/.test(sp.year) ? Number(sp.year) : thisYear;
  const category: TimeOffType = LEAVE_TYPES.includes(sp.type as TimeOffType) ? (sp.type as TimeOffType) : 'vacation';
  const showHistory = sp.history === '1';
  const showTerminated = sp.terminated === '1';

  const [employees, pendingRes, upcomingRes, yearRes, historyRes, balances, balancesNow, balancesNext] = await Promise.all([
    listEmployees(true),
    db().from('time_off_requests').select('*').eq('status', 'pending').order('starts_on'),
    db().from('time_off_requests').select('*').eq('status', 'approved').gte('ends_on', today).order('starts_on').limit(50),
    db().from('time_off_requests').select('employee_id, type, reason, hours').eq('status', 'approved').gte('starts_on', `${year}-01-01`).lte('starts_on', `${year}-12-31`),
    showHistory ? db().from('time_off_requests').select('*').in('status', ['approved', 'denied', 'cancelled']).order('created_at', { ascending: false }).limit(50) : Promise.resolve({ data: [], error: null }),
    leaveBalances(year),
    leaveBalances(thisYear),
    leaveBalances(thisYear + 1),
  ]);
  const pending = must<TimeOffRequest[]>(pendingRes, 'load requests');
  const upcoming = must<TimeOffRequest[]>(upcomingRes, 'load upcoming time off');
  const approvedYear = must<Pick<TimeOffRequest, 'employee_id' | 'type' | 'reason' | 'hours'>[]>(yearRes, 'load approved hours');
  const history = must<TimeOffRequest[]>(historyRes, 'load history');

  // People with no allowance row and no paid leave yet get the company default.
  const fallback = (y: number) => ({ year: y, allowance: settings.paid_leave_days_per_year, isDefault: true, used: 0, pending: 0, remaining: settings.paid_leave_days_per_year });
  const balanceOf = (id: string) => balances.get(id) ?? fallback(year);
  // Same rule as wages: admins can change anyone; managers only employees, never themselves.
  const canEditLeave = (e: { id: string; access_level: string }) => viewer.level === 'admin' || (e.access_level === 'employee' && e.id !== viewer.employeeId);
  const active = employees.filter((e) => e.status !== 'terminated');
  const paidLeft: PaidLeft = Object.fromEntries(
    active.map((e) => [
      e.id,
      { [thisYear]: (balancesNow.get(e.id) ?? fallback(thisYear)).remaining, [thisYear + 1]: (balancesNext.get(e.id) ?? fallback(thisYear + 1)).remaining },
    ]),
  );

  const nameOf = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? fullName(e) : 'Former team member';
  };
  const visibleEmployees = employees.filter((e) => showTerminated || e.status !== 'terminated');
  const hoursRows = visibleEmployees.map((e) => {
    const mine = approvedYear.filter((t) => t.employee_id === e.id && t.type === category);
    const byReason = new Map<string, number>();
    for (const t of mine) byReason.set(timeOffReasonLabel[t.reason], (byReason.get(timeOffReasonLabel[t.reason]) ?? 0) + Number(t.hours));
    return { e, byReason: [...byReason.entries()] };
  });
  const q = (params: Record<string, string>) => `/base/time-off?${new URLSearchParams({ year: String(year), type: category, ...(showTerminated ? { terminated: '1' } : {}), ...params }).toString()}`;

  return (
    <>
      <PageHeader
        plain
        title="Time off"
        actions={
          <>
            {viewer.level === 'admin' && <Link href="/base/settings?section=time-off" className="rounded-xl p-2.5 text-ink hover:bg-white" aria-label="Time off settings" title="Time off settings"><Settings size={21} /></Link>}
            <Dialog trigger="Add time off" triggerClassName="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2.5 text-[0.95rem] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(124,58,237,0.9)] hover:brightness-110" title="Add time off" description="Recorded as approved straight away.">
              <TimeOffForm today={today} employees={active.map((e) => ({ id: e.id, name: fullName(e) }))} paidLeft={paidLeft} />
            </Dialog>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight">Requests ({pending.length})</h2>
              <Link href={q({ history: showHistory ? '0' : '1' })} className="text-[0.95rem] font-semibold text-violet-700 underline decoration-2 underline-offset-4 hover:text-violet-900">{showHistory ? 'Hide history' : 'View history'}</Link>
            </div>
          <div className="b-card overflow-hidden !rounded-xl">
            {pending.length === 0 ? (
              <EmptyState icon={<CalendarX2 size={20} />} title="No requests" />
            ) : (
              <div className="overflow-x-auto">
                <table className="b-table b-table-plain min-w-[640px]">
                  <thead><tr><th>Name</th><th>Category</th><th>Dates</th><th>Total hours</th><th /></tr></thead>
                  <tbody>
                    {pending.map((t) => (
                      <tr key={t.id}>
                        <td><span className="flex items-center gap-2"><Avatar name={nameOf(t.employee_id)} size="sm" />{nameOf(t.employee_id)}</span>{t.note && <p className="mt-1 max-w-xs text-xs italic text-muted">“{t.note}”</p>}</td>
                        <td className="text-sm">{detail(t)}</td>
                        <td className="whitespace-nowrap">{fmtDateRange(t.starts_on, t.ends_on, zone)}</td>
                        <td>{Number(t.hours)}</td>
                        <td>
                          {t.employee_id === viewer.employeeId && viewer.level !== 'admin' ? (
                            <span className="text-xs text-muted">Another manager must review</span>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <form action={reviewTimeOff}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="decision" value="approved" /><SubmitButton className="flex h-10 w-10 items-center justify-center rounded-lg border border-stone bg-white text-emerald-600 shadow-sm transition-colors hover:border-emerald-400 hover:bg-emerald-50"><Check size={22} strokeWidth={2.5} /><span className="sr-only">Approve</span></SubmitButton></form>
                              <form action={reviewTimeOff}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="decision" value="denied" /><SubmitButton className="flex h-10 w-10 items-center justify-center rounded-lg border border-stone bg-white text-red-600 shadow-sm transition-colors hover:border-red-400 hover:bg-red-50"><X size={22} strokeWidth={2.5} /><span className="sr-only">Deny</span></SubmitButton></form>
                              <ChevronRight size={18} className="text-muted" />
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {showHistory && (
              <div className="border-t border-stone/50">
                <p className="px-6 pt-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted">History (last 50)</p>
                <ul className="divide-y divide-stone/40">
                  {history.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 text-sm">
                      <span><span className="font-medium">{nameOf(t.employee_id)}</span> <span className="text-muted">· {fmtDateRange(t.starts_on, t.ends_on, zone)} · {detail(t)}</span></span>
                      <StatusBadge status={t.status} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <form className="flex items-center gap-2">
                <h2 className="text-xl font-semibold tracking-tight">Hours approved:</h2>
                <input type="hidden" name="type" value={category} />
                {showTerminated && <input type="hidden" name="terminated" value="1" />}
                <Select name="year" defaultValue={year} className="b-input !w-auto !rounded-xl !py-2 font-semibold" aria-label="Year">
                  {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
                </Select>
                <button type="submit" className="b-btn-ghost b-btn-sm">Go</button>
              </form>
              <div className="flex flex-wrap gap-1.5">
                {LEAVE_TYPES.map((t) => (
                  <Link key={t} href={q({ type: t })} aria-current={category === t ? 'page' : undefined} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${category === t ? 'bg-[#3B0764] text-white' : 'border border-stone bg-white text-muted hover:text-ink'}`}>
                    {timeOffTypeLabel[t]}
                  </Link>
                ))}
              </div>
            </div>
          <div className="b-card overflow-hidden !rounded-xl">
            <div className="max-h-[420px] overflow-y-auto">
              <table className="b-table">
                <thead className="sticky top-0 bg-white"><tr><th>Name</th><th>{timeOffTypeLabel[category]}</th><th className="text-right">Hours approved</th></tr></thead>
                <tbody>
                  {hoursRows.map(({ e, byReason }) => (
                    <tr key={e.id}>
                      <td><span className="flex items-center gap-2"><Avatar name={fullName(e)} size="sm" />{fullName(e)}</span></td>
                      <td className="text-sm text-muted">{byReason.length ? byReason.map(([r]) => <span key={r} className="block">{r}</span>) : '—'}</td>
                      <td className="text-right">{byReason.length ? byReason.map(([r, h]) => <span key={r} className="block">{h}</span>) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
            <Link href={q({ terminated: showTerminated ? '' : '1' })} className="mt-3 inline-flex items-center gap-2.5 text-sm font-medium text-ink">
              <span className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${showTerminated ? 'bg-violet-600' : 'bg-stone'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${showTerminated ? 'translate-x-[22px]' : 'translate-x-0.5'}`} /></span>
              Show terminated employees
            </Link>
          </section>

          <Card
            pad={false}
            title={<h2 id="balances" className="b-h2">Paid leave balances · {year}</h2>}
            actions={<span className="hidden text-xs text-muted sm:block">Vacation + paid time off · 1 day = 8 hrs</span>}
          >
            <div className="overflow-x-auto">
              <table className="b-table min-w-[720px]">
                <thead>
                  <tr><th>Name</th><th>Days for {year}</th><th className="text-right">Taken</th><th className="text-right">Waiting approval</th><th className="text-right">Left</th></tr>
                </thead>
                <tbody>
                  {visibleEmployees.map((e) => {
                    const b = balanceOf(e.id);
                    return (
                      <tr key={e.id}>
                        <td><span className="flex items-center gap-2"><Avatar name={fullName(e)} size="sm" />{fullName(e)}</span></td>
                        <td>
                          {canEditLeave(e) ? (
                            <LeaveAllowanceForm employeeId={e.id} year={year} value={b.allowance} compact />
                          ) : (
                            <span>{fmtDays(b.allowance)}</span>
                          )}
                          {b.isDefault && <span className="mt-0.5 block text-[0.68rem] text-muted">Company default</span>}
                        </td>
                        <td className="text-right tabular-nums">{fmtDays(b.used)}</td>
                        <td className="text-right tabular-nums text-muted">{b.pending ? fmtDays(b.pending) : '—'}</td>
                        <td className="text-right">
                          <span className={b.remaining <= 0 ? 'b-badge-red' : b.remaining < 2 ? 'b-badge-amber' : 'b-badge-green'}>{b.remaining <= 0 ? 'None left' : fmtDays(b.remaining)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <aside className="space-y-6">
          <section>
          <h2 className="mb-3 text-xl font-semibold tracking-tight">Upcoming time off ({upcoming.length})</h2>
          <div className="b-card overflow-hidden !rounded-xl">
            {upcoming.length === 0 ? (
              <p className="px-6 py-5 text-sm text-muted">Nothing scheduled.</p>
            ) : (
              <ul className="max-h-[440px] overflow-y-auto px-2 py-2">
                {upcoming.map((t) => (
                  <li key={t.id} className="flex items-start justify-between gap-3 rounded-xl px-4 py-3 hover:bg-linen/70">
                    <div>
                      <p className="text-[0.95rem] font-semibold">{nameOf(t.employee_id)}</p>
                      <p className="mt-1 text-sm text-muted">{detail(t)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="whitespace-nowrap text-sm font-medium">{fmtDateRange(t.starts_on, t.ends_on, zone)}</span>
                      <form action={cancelTimeOff}>
                        <input type="hidden" name="id" value={t.id} />
                        <SubmitButton className="text-[0.7rem] text-muted hover:text-red-600" confirm="Cancel this approved time off?">Cancel</SubmitButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          </section>

          <Card title="Paid leave">
            <div className="space-y-5 text-sm">
              <p className="text-muted">
                <span className="font-medium text-ink">Vacation</span> and <span className="font-medium text-ink">paid time off</span> come out of each person’s paid-leave days. When someone reaches 0, they can only choose sick leave or normal (unpaid) leave.
              </p>
              <div>
                <p className="mb-1.5 font-medium">Every year (from {thisYear + 1})</p>
                {viewer.level === 'admin' ? <DefaultPaidLeaveForm value={settings.paid_leave_days_per_year} /> : <p>{fmtDays(settings.paid_leave_days_per_year)} per year</p>}
                <p className="mt-1 text-xs text-muted">Anyone without their own number for a year gets this.</p>
              </div>
              {viewer.level === 'admin' && (
                <div className="border-t border-stone/50 pt-4">
                  <p className="mb-1.5 font-medium">This year ({thisYear})</p>
                  <LeaveAllowanceAllForm year={thisYear} />
                  <p className="mt-1 text-xs text-muted">Or set each person’s days left in the balances table — e.g. what they still have for the rest of {thisYear}.</p>
                </div>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}

async function EmployeeTimeOff({ employeeId, zone, today }: { employeeId: string; zone: string; today: string }) {
  const year = Number(today.slice(0, 4));
  const [requestsRes, balances] = await Promise.all([
    db().from('time_off_requests').select('*').eq('employee_id', employeeId).order('starts_on', { ascending: false }).limit(50),
    leaveBalanceYears(employeeId, [year, year + 1]),
  ]);
  const balance = balances.get(year)!;
  const nextBalance = balances.get(year + 1)!;
  const requests = must<TimeOffRequest[]>(requestsRes, 'load your time off');
  const upcoming = requests.filter((t) => t.ends_on >= today && (t.status === 'pending' || t.status === 'approved')).reverse();
  const past = requests.filter((t) => !upcoming.includes(t));
  const paidLeft: PaidLeft = { me: { [year]: balance.remaining, [year + 1]: nextBalance.remaining } };

  const list = (items: TimeOffRequest[], cancellable: boolean) => (
    <ul className="divide-y divide-stone/40">
      {items.map((t) => (
        <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <div>
            <p className="font-medium">{fmtDateRange(t.starts_on, t.ends_on, zone)}</p>
            <p className="text-xs text-muted">{detail(t)} · {Number(t.hours)} hrs</p>
            {t.manager_note && <p className="mt-1 text-xs italic text-muted">Manager: “{t.manager_note}”</p>}
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={t.status} />
            {cancellable && (
              <form action={cancelTimeOff}>
                <input type="hidden" name="id" value={t.id} />
                <SubmitButton className="b-btn-quiet b-btn-sm" confirm="Cancel this time off?">Cancel</SubmitButton>
              </form>
            )}
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <PageHeader
        plain
        title="Time off"
        actions={
          <Dialog trigger={<><Plane size={15} /> Request time off</>} triggerClassName="b-btn-brass" title="Request time off" description="Your manager will be asked to approve it.">
            <TimeOffForm today={today} paidLeft={paidLeft} />
          </Dialog>
        }
      />
      <div className="space-y-6">
        <PaidLeaveSummary balance={balance} />
        <Card title="Upcoming" pad={false}>{upcoming.length ? list(upcoming, true) : <EmptyState icon={<CalendarX2 size={20} />} title="You do not have any upcoming time off." />}</Card>
        {past.length > 0 && <Card title="History" pad={false}>{list(past, false)}</Card>}
      </div>
    </>
  );
}
