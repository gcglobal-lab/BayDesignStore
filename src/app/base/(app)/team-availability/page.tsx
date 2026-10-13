import type { Metadata } from 'next';
import { ChevronDown } from 'lucide-react';
import { SubmitButton } from '@/components/base/forms';
import { Avatar, PageHeader } from '@/components/base/ui';
import WeekNav from '@/components/base/WeekNav';
import { requireManager } from '@/lib/base/auth';
import { availabilityOn, fmtSlotTime, listAvailability, type Slot } from '@/lib/base/availability';
import { listEmployees } from '@/lib/base/queries';
import { getSettings } from '@/lib/base/settings';
import { addDaysYmd, fmtDate, isYmd, isoWeekday, todayYmd, weekDays, weekStartYmd } from '@/lib/base/time';
import { fullName } from '@/lib/base/types';
import { reviewAvailability } from './actions';

export const metadata: Metadata = { title: 'Team Availability' };

const KIND_STYLE = {
  preferred: 'bg-[#EFE8F6] text-[#4F3A6B]',
  available: 'bg-emerald-50 text-emerald-800',
  unavailable: 'bg-red-50 text-red-700',
} as const;
const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function SlotChip({ slot }: { slot: Slot }) {
  return (
    <div className={`rounded-lg px-2 py-1.5 text-center text-[0.7rem] leading-tight ${KIND_STYLE[slot.kind]}`}>
      <p className="font-semibold capitalize">{slot.kind}</p>
      <p>{slot.all_day ? 'All day' : `${fmtSlotTime(slot.start_time)} – ${fmtSlotTime(slot.end_time)}`}</p>
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
        eyebrow="Shifts"
        title="Team Availability"
        actions={
          <WeekNav
            basePath="/base/team-availability"
            label={`${fmtDate(week, zone, 'MMM d')} – ${fmtDate(days[6], zone, 'MMM d, yyyy')}`}
            prev={addDaysYmd(week, -7, zone)}
            next={addDaysYmd(week, 7, zone)}
            today={week !== thisWeek ? thisWeek : undefined}
          />
        }
      />
      <div className="b-card overflow-x-auto">
        <table className="b-table min-w-[960px] table-fixed">
          <thead>
            <tr>
              <th className="w-56">Team member</th>
              {days.map((d) => <th key={d} className="text-center">{fmtDate(d, zone, 'EEEE')}<span className="block font-normal normal-case tracking-normal">{fmtDate(d, zone, 'MMM d')}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const pending = requests.find((r) => r.employee_id === e.id && r.status === 'pending');
              return (
                <tr key={e.id} className="align-top">
                  <td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={fullName(e)} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{fullName(e)}</p>
                        {pending && (
                          <details className="group mt-1">
                            <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-brass-dark">
                              <ChevronDown size={12} className="transition-transform group-open:rotate-180" /> View request
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
                      <td key={d} className="space-y-1 !px-2">
                        {slots.map((s, i) => <SlotChip key={i} slot={s} />)}
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
