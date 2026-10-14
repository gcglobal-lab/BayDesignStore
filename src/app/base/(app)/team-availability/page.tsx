import type { Metadata } from 'next';
import { ChevronDown } from 'lucide-react';
import { SubmitButton } from '@/components/base/forms';
import { Avatar, PageHeader } from '@/components/base/ui';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import WeekJump from '@/components/base/WeekJump';
import { requireManager } from '@/lib/base/auth';
import { availabilityOn, fmtSlotTime, listAvailability, type Slot } from '@/lib/base/availability';
import { listEmployees } from '@/lib/base/queries';
import { getSettings } from '@/lib/base/settings';
import { addDaysYmd, fmtDate, isYmd, isoWeekday, todayYmd, weekDays, weekStartYmd } from '@/lib/base/time';
import { fullName } from '@/lib/base/types';
import { reviewAvailability } from './actions';

export const metadata: Metadata = { title: 'Team Availability' };

const KIND_STYLE = {
  preferred: 'bg-[#EEE8F8] text-[#2E1F4D]',
  available: 'bg-emerald-50 text-emerald-900',
  unavailable: 'bg-red-50 text-red-800',
} as const;
const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function SlotChip({ slot }: { slot: Slot }) {
  return (
    <div className={`flex h-full flex-col justify-center rounded-sm px-2 py-2 text-center leading-tight ${KIND_STYLE[slot.kind]}`}>
      <p className="text-[0.88rem] font-semibold capitalize">{slot.kind}</p>
      <p className="mt-0.5 text-[0.74rem] font-semibold">{slot.all_day ? 'All day' : `${fmtSlotTime(slot.start_time)} – ${fmtSlotTime(slot.end_time)}`}</p>
    </div>
  );
}

export default async function TeamAvailabilityPage({ searchParams }: PageProps<'/base/team-availability'>) {
  await requireManager();
  const sp = await searchParams;
  const settings = await getSettings();
  const zone = settings.timezone;
  const today = todayYmd(zone);
  const thisWeek = weekStartYmd(today, zone, settings.week_start);
  const week = typeof sp.week === 'string' && isYmd(sp.week) ? weekStartYmd(sp.week, zone, settings.week_start) : thisWeek;
  const days = weekDays(week, zone);

  const [employees, requests] = await Promise.all([listEmployees(), listAvailability()]);

  return (
    <>
      <PageHeader
        plain
        title="Team Availability"
        actions={
          <>
            {week !== thisWeek && <Link href={`/base/team-availability?week=${thisWeek}`} className="rounded-xl bg-linen px-4 py-2.5 text-sm font-semibold ring-1 ring-inset ring-stone hover:bg-sand">This week</Link>}
            <WeekJump label={`${fmtDate(week, zone, 'MMM d, yyyy')} - ${fmtDate(days[6], zone, 'MMM d, yyyy')}`} value={week} href="/base/team-availability" zone={zone} weekStart={settings.week_start} />
            <Link href={`/base/team-availability?week=${addDaysYmd(week, -7, zone)}`} className="rounded-xl p-2.5 hover:bg-white" aria-label="Previous week"><ChevronLeft size={20} /></Link>
            <Link href={`/base/team-availability?week=${addDaysYmd(week, 7, zone)}`} className="rounded-xl p-2.5 hover:bg-white" aria-label="Next week"><ChevronRight size={20} /></Link>
          </>
        }
      />
      <div className="b-card overflow-x-auto !rounded-xl p-3">
        <table className="w-full min-w-[980px] table-fixed border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-60 border border-[#D9D4B8] bg-white px-3 py-2.5" />
              {days.map((d) => (
                <th key={d} className="border border-[#D9D4B8] bg-white px-2 py-2.5 text-center text-[0.92rem] font-semibold text-ink">
                  {fmtDate(d, zone, 'EEEE')}
                  <span className="block text-[0.7rem] font-normal text-muted">{fmtDate(d, zone, 'MMM d')}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const pending = requests.find((r) => r.employee_id === e.id && r.status === 'pending');
              return (
                <tr key={e.id} className="align-top">
                  <td className="border border-[#D9D4B8] px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={fullName(e)} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{fullName(e)}</p>
                        {pending && (
                          <details className="group mt-1">
                            <summary className="flex cursor-pointer list-none items-center gap-1 text-[0.85rem] font-semibold text-violet-700">
                              <ChevronDown size={14} className="transition-transform group-open:rotate-180" fill="currentColor" /> View Requests
                            </summary>
                            <div className="mt-2 space-y-1 rounded-xl bg-linen p-2.5 text-xs">
                              <p className="text-muted">From {fmtDate(pending.effective_from, zone, 'MMM d, yyyy')}</p>
                              {pending.slots.length === 0 && <p>Available any time</p>}
                              {[...pending.slots].sort((a, b) => a.weekday - b.weekday).map((s, i) => (
                                <p key={i}>
                                  <span className="font-medium">{DAY_NAMES[s.weekday]}</span> · <span className="capitalize">{s.kind}</span> {s.all_day ? 'all day' : `${fmtSlotTime(s.start_time)}–${fmtSlotTime(s.end_time)}`}
                                </p>
                              ))}
                              {pending.note && <p className="italic text-muted">“{pending.note}”</p>}
                              <div className="flex gap-1.5 pt-1.5">
                                <form action={reviewAvailability}>
                                  <input type="hidden" name="id" value={pending.id} />
                                  <input type="hidden" name="decision" value="approved" />
                                  <SubmitButton className="b-btn-primary b-btn-sm">Approve</SubmitButton>
                                </form>
                                <form action={reviewAvailability}>
                                  <input type="hidden" name="id" value={pending.id} />
                                  <input type="hidden" name="decision" value="denied" />
                                  <SubmitButton className="b-btn-ghost b-btn-sm">Deny</SubmitButton>
                                </form>
                              </div>
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  </td>
                  {days.map((d) => {
                    const slots = availabilityOn(requests, e.id, d)?.slots.filter((s) => s.weekday === isoWeekday(d, zone)) ?? [];
                    return (
                      <td key={d} className="h-[4.2rem] border border-[#D9D4B8] p-1 align-middle">
                        <div className="flex h-full flex-col gap-1">{slots.map((s, i) => <SlotChip key={i} slot={s} />)}</div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
