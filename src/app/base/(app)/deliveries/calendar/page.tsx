import type { Metadata } from 'next';
import Link from 'next/link';
import { addMonths, format } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, PageHeader } from '@/components/base/ui';
import { requireDeliveries } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { addDaysYmd, fmtDate, todayYmd, weekDays, weekStartYmd, zonedMidnight } from '@/lib/base/time';

export const metadata: Metadata = { title: 'Delivery calendar' };

/** How full each day is: booked stops against the trucks' daily capacity. */
export default async function DeliveryCalendarPage({ searchParams }: PageProps<'/base/deliveries/calendar'>) {
  await requireDeliveries({ dispatcher: true });
  const sp = await searchParams;
  const settings = await getSettings();
  const zone = settings.timezone;
  const today = todayYmd(zone);
  const month = typeof sp.month === 'string' && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const first = weekStartYmd(`${month}-01`, zone, settings.week_start);
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const start = addDaysYmd(first, w * 7, zone);
    if (w > 3 && start.slice(0, 7) !== month) break;
    weeks.push(weekDays(start, zone));
  }
  const last = weeks[weeks.length - 1][6];
  const [ordersRes, trucksRes] = await Promise.all([
    db().from('dl_orders').select('scheduled_date, status, service_type').gte('scheduled_date', first).lte('scheduled_date', last).neq('status', 'cancelled'),
    db().from('dl_trucks').select('capacity_stops').eq('active', true),
  ]);
  const orders = must<{ scheduled_date: string; status: string; service_type: string }[]>(ordersRes, 'load orders');
  const capacity = must<{ capacity_stops: number }[]>(trucksRes, 'load trucks').reduce((s, t) => s + t.capacity_stops, 0);
  const byDay = new Map<string, { total: number; done: number; failed: number }>();
  for (const o of orders) {
    const d = byDay.get(o.scheduled_date) ?? { total: 0, done: 0, failed: 0 };
    d.total++;
    if (o.status === 'delivered') d.done++;
    if (o.status === 'failed') d.failed++;
    byDay.set(o.scheduled_date, d);
  }
  const shift = (n: number) => format(addMonths(zonedMidnight(`${month}-01`, zone), n), 'yyyy-MM');

  return (
    <>
      <PageHeader plain title="Calendar" description={capacity ? `Fleet capacity: ${capacity} stops a day (active trucks). Click a day to plan it.` : 'Add trucks with a daily stop capacity to see how full each day is.'} />
      <Card
        title={fmtDate(`${month}-01`, zone, 'MMMM yyyy')}
        actions={
          <span className="flex gap-1">
            <Link className="b-btn-ghost b-btn-sm" href={`/base/deliveries/calendar?month=${shift(-1)}`}><ChevronLeft size={14} /></Link>
            <Link className="b-btn-ghost b-btn-sm" href="/base/deliveries/calendar">Today</Link>
            <Link className="b-btn-ghost b-btn-sm" href={`/base/deliveries/calendar?month=${shift(1)}`}><ChevronRight size={14} /></Link>
          </span>
        }
        pad={false}
      >
        <div className="overflow-x-auto">
          <div className="grid min-w-[700px] grid-cols-7 border-t border-stone/50">
            {weeks[0].map((d) => <div key={d} className="border-b border-stone/50 bg-linen/60 px-2 py-1.5 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">{fmtDate(d, zone, 'EEE')}</div>)}
            {weeks.flat().map((d) => {
              const s = byDay.get(d);
              const load = capacity && s ? s.total / capacity : 0;
              const other = d.slice(0, 7) !== month;
              return (
                <Link key={d} href={`/base/deliveries/dispatch?date=${d}`} className={`min-h-[96px] border-b border-r border-stone/40 p-2 transition-colors hover:bg-brass/5 ${other ? 'bg-linen/40' : ''}`}>
                  <p className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${d === today ? 'bg-brass font-semibold text-white' : other ? 'text-muted/60' : 'text-muted'}`}>{Number(d.slice(8))}</p>
                  {s && (
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">{s.total} stop{s.total === 1 ? '' : 's'}</p>
                      {capacity > 0 && (
                        <div className="h-1.5 overflow-hidden rounded-full bg-sand">
                          <div className={`h-full rounded-full ${load > 1 ? 'bg-red-500' : load > 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, load * 100)}%` }} />
                        </div>
                      )}
                      {(s.done > 0 || s.failed > 0) && <p className="text-[0.65rem] text-muted">{s.done} done{s.failed ? ` · ${s.failed} failed` : ''}</p>}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </Card>
    </>
  );
}
