import Link from 'next/link';
import { ChevronLeft, ChevronRight, Palmtree } from 'lucide-react';
import { addDaysYmd, fmtDate, fmtDateRange, weekStartYmd, type Ymd } from '@/lib/base/time';
import { timeOffTypeLabel, type TimeOffRequest, type TimeOffType } from '@/lib/base/types';
import { Dialog } from './Dialog';
import { Avatar, Card } from './ui';

export type LeaveItem = Pick<TimeOffRequest, 'id' | 'employee_id' | 'type' | 'starts_on' | 'ends_on' | 'status' | 'all_day' | 'start_time' | 'end_time'> & { name: string };

/** One person's punches on one day, already formatted (first in → last out). */
export type AttendanceItem = { key: string; day: Ymd; name: string; span: string; punches: number; worked: string; open: boolean; detail: string };

const tone: Record<TimeOffType, string> = {
  vacation: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  pto: 'bg-sky-100 text-sky-900 border-sky-200',
  sick: 'bg-red-100 text-red-900 border-red-200',
  unpaid: 'bg-sand text-ink border-stone',
};
const dot: Record<TimeOffType, string> = { vacation: 'bg-emerald-500', pto: 'bg-sky-500', sick: 'bg-red-500', unpaid: 'bg-muted' };

/** How many name chips fit in a day box before the rest become avatars. */
const CHIPS = 3;

/**
 * One day box. However many people worked or are off, it stays the same size: counts at
 * the top, up to three name chips (always at least one for leave when there is some), then
 * a row of initials for everyone else. Only spans inside, as it can sit in a <button>.
 */
function DayCell({ d, isToday, inMonth, past, worked, off }: { d: Ymd; isToday: boolean; inMonth: boolean; past: boolean; worked: AttendanceItem[]; off: LeaveItem[] }) {
  const leaveChips = off.slice(0, off.length ? Math.max(1, CHIPS - worked.length) : 0);
  const workChips = worked.slice(0, CHIPS - leaveChips.length);
  const rest = [...worked.slice(workChips.length).map((a) => ({ key: a.key, name: a.name })), ...off.slice(leaveChips.length).map((l) => ({ key: l.id, name: l.name }))];
  const onClock = worked.filter((a) => a.open).length;

  return (
    <span className="flex min-h-[4.5rem] flex-col gap-1 p-1 sm:min-h-[8.25rem] sm:p-1.5">
      <span className="flex items-center justify-between gap-1">
        <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs ${isToday ? 'bg-brass font-semibold text-white' : inMonth && !past ? 'text-ink' : 'text-muted'}`}>
          {Number(d.slice(8))}
        </span>
        <span className="flex flex-wrap justify-end gap-0.5">
          {worked.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brass/15 px-1.5 py-px text-[0.6rem] font-semibold text-brass-dark" title={`${worked.length} punched in`}>
              <span className={`h-1.5 w-1.5 rounded-full ${onClock ? 'animate-pulse bg-emerald-500' : 'bg-brass'}`} />
              {worked.length}
              <span className="hidden xl:inline">in</span>
            </span>
          )}
          {off.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-px text-[0.6rem] font-semibold text-emerald-800" title={`${off.length} off`}>
              {off.length}
              <span className="hidden xl:inline">off</span>
            </span>
          )}
        </span>
      </span>

      <span className="hidden flex-col gap-0.5 sm:flex">
        {workChips.map((a) => (
          <span key={a.key} className="block rounded border border-brass/25 bg-gradient-to-r from-brass/10 to-[#7C3AED]/10 px-1.5 py-0.5 text-[0.64rem] leading-tight text-ink">
            <span className="flex items-center gap-1 font-semibold">
              <span className={`h-1.5 w-1.5 flex-none rounded-full ${a.open ? 'animate-pulse bg-emerald-500' : 'bg-brass'}`} />
              <span className="truncate">{a.name.split(' ')[0]}</span>
              {a.punches > 1 && <span className="ml-auto flex-none rounded bg-amber-100 px-1 text-[0.58rem] text-amber-800">×{a.punches}</span>}
            </span>
            <span className="block truncate text-[0.6rem] text-muted">{a.span}</span>
          </span>
        ))}
        {leaveChips.map((l) => (
          <span key={l.id} className={`block truncate rounded border px-1.5 py-0.5 text-[0.64rem] font-medium leading-tight ${tone[l.type]} ${l.status === 'pending' ? '!border-dashed !border-amber-600 bg-white' : ''}`}>
            {l.name.split(' ')[0]} · {timeOffTypeLabel[l.type].replace(' (unpaid)', '')}
          </span>
        ))}
      </span>

      {rest.length > 0 && (
        <span className="mt-auto hidden items-center sm:flex">
          {rest.slice(0, 4).map((p) => (
            <span key={p.key} className="-ml-1 first:ml-0 rounded-full ring-2 ring-white">
              <Avatar name={p.name} size="xs" />
            </span>
          ))}
          <span className="ml-1 text-[0.62rem] font-semibold text-brass-dark">+{rest.length} more</span>
        </span>
      )}
    </span>
  );
}

/** Everyone for one day, in the pop-up: who punched in (first → last punch, worked) and who is off. */
function DayDetail({ worked, off }: { worked: AttendanceItem[]; off: LeaveItem[] }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <span className="h-2 w-2 rounded-full bg-brass" /> Punched in <span className="font-normal text-muted">({worked.length})</span>
        </h3>
        {worked.length === 0 ? (
          <p className="text-sm text-muted">Nobody punched in.</p>
        ) : (
          <ul className="divide-y divide-stone/40 overflow-hidden rounded-2xl border border-stone/60 bg-white">
            {worked.map((a) => (
              <li key={a.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <Avatar name={a.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{a.name}</span>
                  <span className="block text-xs text-muted">{a.detail}</span>
                </span>
                {a.open && <span className="b-badge-green">On the clock</span>}
                {a.punches > 1 && <span className="b-badge-amber">{a.punches} punches</span>}
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">{a.worked}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Off <span className="font-normal text-muted">({off.length})</span>
        </h3>
        {off.length === 0 ? (
          <p className="text-sm text-muted">Nobody is off.</p>
        ) : (
          <ul className="divide-y divide-stone/40 overflow-hidden rounded-2xl border border-stone/60 bg-white">
            {off.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <Avatar name={l.name} size="sm" />
                <span className="min-w-0 flex-1 font-medium">{l.name}</span>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone[l.type]}`}>{timeOffTypeLabel[l.type]}</span>
                {!l.all_day && l.start_time && <span className="text-xs text-muted">{l.start_time.slice(0, 5)}–{l.end_time?.slice(0, 5)}</span>}
                {l.status === 'pending' && <span className="b-badge-amber">Waiting for approval</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** First day (yyyy-MM-01) of a 'yyyy-MM' month, or of the month containing `today`. */
export function monthStart(param: unknown, today: Ymd): Ymd {
  return typeof param === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(param) ? `${param}-01` : `${today.slice(0, 7)}-01`;
}

/** The days shown for a month: whole weeks from the week containing the 1st to the week containing the last day. */
export function calendarRange(first: Ymd, zone: string, weekStart: number): { start: Ymd; end: Ymd; last: Ymd } {
  const start = weekStartYmd(first, zone, weekStart);
  let last = first;
  while (addDaysYmd(last, 1, zone).slice(0, 7) === first.slice(0, 7)) last = addDaysYmd(last, 1, zone);
  return { start, end: addDaysYmd(weekStartYmd(last, zone, weekStart), 6, zone), last };
}

/**
 * Month calendar of the team: who was punched in each day (name, first in → last out) and
 * who is off — approved leave solid, requests waiting for approval outlined.
 * Server-rendered; months change through `?cal=yyyy-MM`.
 */
export default function LeaveCalendar({
  first,
  today,
  zone,
  weekStart,
  leave,
  attendance = [],
  hrefFor,
}: {
  first: Ymd;
  today: Ymd;
  zone: string;
  weekStart: number;
  leave: LeaveItem[];
  attendance?: AttendanceItem[];
  hrefFor: (month: string) => string;
}) {
  const workedOn = (d: Ymd) => attendance.filter((a) => a.day === d).sort((a, b) => a.name.localeCompare(b.name));
  const workingToday = workedOn(today);
  const { start, end, last } = calendarRange(first, zone, weekStart);
  const days: Ymd[] = [];
  for (let d = start; d <= end; d = addDaysYmd(d, 1, zone)) days.push(d);
  const month = first.slice(0, 7);
  const prev = addDaysYmd(first, -1, zone).slice(0, 7);
  const next = addDaysYmd(last, 1, zone).slice(0, 7);
  const onDay = (d: Ymd) => leave.filter((l) => l.starts_on <= d && l.ends_on >= d);
  const offToday = onDay(today).filter((l) => l.status === 'approved');
  const upcoming = leave.filter((l) => l.ends_on >= today && l.starts_on.slice(0, 7) <= month && l.ends_on.slice(0, 7) >= month);

  return (
    <Card
      pad={false}
      title={<h2 className="b-h2 flex items-center gap-2"><Palmtree size={18} className="text-brass" /> Team calendar</h2>}
      actions={
        <div className="flex items-center gap-1">
          <Link href={hrefFor(prev)} className="b-btn-quiet !p-2" aria-label="Previous month"><ChevronLeft size={16} /></Link>
          <span className="min-w-[8.5rem] text-center text-sm font-medium">{fmtDate(first, zone, 'MMMM yyyy')}</span>
          <Link href={hrefFor(next)} className="b-btn-quiet !p-2" aria-label="Next month"><ChevronRight size={16} /></Link>
          {month !== today.slice(0, 7) && <Link href={hrefFor(today.slice(0, 7))} className="b-btn-ghost b-btn-sm ml-1">Today</Link>}
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-stone/50 px-5 py-3 text-xs text-muted sm:px-6">
        <span className="font-medium text-ink">
          {workingToday.length ? `Worked today: ${workingToday.length}` : 'Nobody has punched in today.'}
          <span className="mx-2 text-stone">|</span>
          {offToday.length ? `Off today: ${offToday.map((l) => l.name).join(', ')}` : 'Nobody is off today.'}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brass" /> Punched in</span>
        <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${dot.vacation}`} /> Vacation</span>
        <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${dot.pto}`} /> Paid time off</span>
        <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${dot.sick}`} /> Sick</span>
        <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${dot.unpaid}`} /> Unpaid</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-amber-600" /> Waiting for approval</span>
      </div>

      <div className="grid grid-cols-7 border-b border-stone/50 text-center text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
        {days.slice(0, 7).map((d) => <div key={d} className="py-2">{fmtDate(d, zone, 'EEE')}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const off = onDay(d);
          const worked = workedOn(d);
          const inMonth = d.slice(0, 7) === month;
          const isToday = d === today;
          const busy = worked.length + off.length > 0;
          const cellClass = `border-b border-r border-stone/40 [&:nth-child(7n)]:border-r-0 ${inMonth ? '' : 'bg-linen/50'} ${isToday ? 'bg-brass/[0.06] ring-1 ring-inset ring-brass/40' : ''}`;
          const inner = <DayCell d={d} isToday={isToday} inMonth={inMonth} past={d < today} worked={worked} off={off} />;
          // A busy day opens a list of everyone: who punched in (with times) and who is off.
          return busy ? (
            <div key={d} className={cellClass}>
              <Dialog
                trigger={inner}
                triggerClassName="block h-full w-full text-left transition-colors hover:bg-brass/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brass/60"
                title={fmtDate(d, zone, 'EEEE, MMMM d, yyyy')}
                description={`${worked.length} punched in · ${off.length} off`}
                wide
              >
                <DayDetail worked={worked} off={off} />
              </Dialog>
            </div>
          ) : (
            <div key={d} className={cellClass}>{inner}</div>
          );
        })}
      </div>

      <div className="px-5 py-4 sm:px-6">
        <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">Upcoming this month</p>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted">No leave coming up in {fmtDate(first, zone, 'MMMM')}.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((l) => (
              <li key={l.id} className="flex items-center gap-2.5 text-sm">
                <span className={`h-2.5 w-2.5 flex-none rounded-full ${dot[l.type]}`} />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{l.name}</span>
                  <span className="text-muted"> · {fmtDateRange(l.starts_on, l.ends_on, zone)} · {timeOffTypeLabel[l.type]}</span>
                </span>
                {l.status === 'pending' && <span className="b-badge-amber">Pending</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
