import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, EmptyState, PageHeader } from '@/components/base/ui';
import { requireDeliveries } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { addDaysYmd, fmtDate, isYmd, todayYmd, zonedDateTime } from '@/lib/base/time';
import { getCrews } from '@/lib/deliveries/data';
import { serviceLabel, type ServiceType } from '@/lib/deliveries/types';

export const metadata: Metadata = { title: 'Delivery reports' };

type Row = { id: string; status: string; service_type: ServiceType; scheduled_date: string; window_end: string | null; completed_at: string | null; failed_reason: string | null; route: { driver_id: string | null; distance_miles: number | null } | null };

export default async function DeliveryReportsPage({ searchParams }: PageProps<'/base/deliveries/reports'>) {
  await requireDeliveries({ dispatcher: true });
  const sp = await searchParams;
  const [{ timezone: zone }, crews] = await Promise.all([getSettings(), getCrews()]);
  const today = todayYmd(zone);
  const presets: Record<string, [string, number]> = { week: ['Last 7 days', 6], month: ['Last 30 days', 29], quarter: ['Last 90 days', 89] };
  const preset = typeof sp.range === 'string' && sp.range in presets ? sp.range : isYmd(sp.from) && isYmd(sp.to) ? 'custom' : 'month';
  const from = preset === 'custom' ? (sp.from as string) : addDaysYmd(today, -presets[preset][1], zone);
  const to = preset === 'custom' ? (sp.to as string) : today;

  const [ordersRes, routesRes] = await Promise.all([
    db().from('dl_orders').select('id, status, service_type, scheduled_date, window_end, completed_at, failed_reason, route:dl_routes(driver_id, distance_miles)').gte('scheduled_date', from).lte('scheduled_date', to).neq('status', 'cancelled').limit(20000),
    db().from('dl_routes').select('id, driver_id, distance_miles, route_date').gte('route_date', from).lte('route_date', to),
  ]);
  const orders = must<Row[]>(ordersRes, 'load orders');
  const routes = must<{ id: string; driver_id: string | null; distance_miles: number | null; route_date: string }[]>(routesRes, 'load routes');
  const delivered = orders.filter((o) => o.status === 'delivered');
  const failed = orders.filter((o) => o.status === 'failed');
  const onTime = (o: Row) => !o.window_end || !o.completed_at || new Date(o.completed_at).getTime() <= zonedDateTime(o.scheduled_date, o.window_end.slice(0, 5), zone).getTime() + 15 * 60_000;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

  const drivers = new Map<string, { stops: number; delivered: number; failed: number; onTime: number; routes: number; miles: number }>();
  const d = (id: string) => drivers.get(id) ?? (drivers.set(id, { stops: 0, delivered: 0, failed: 0, onTime: 0, routes: 0, miles: 0 }), drivers.get(id)!);
  for (const o of orders) {
    const id = o.route?.driver_id;
    if (!id) continue;
    const x = d(id);
    x.stops++;
    if (o.status === 'delivered') {
      x.delivered++;
      if (onTime(o)) x.onTime++;
    }
    if (o.status === 'failed') x.failed++;
  }
  for (const r of routes) if (r.driver_id) {
    const x = d(r.driver_id);
    x.routes++;
    x.miles += Number(r.distance_miles ?? 0);
  }
  const reasons = new Map<string, number>();
  failed.forEach((o) => reasons.set(o.failed_reason ?? 'Other', (reasons.get(o.failed_reason ?? 'Other') ?? 0) + 1));
  const services = new Map<string, number>();
  orders.forEach((o) => services.set(o.service_type, (services.get(o.service_type) ?? 0) + 1));
  const perDay = new Map<string, number>();
  for (let x = from; x <= to && perDay.size < 120; x = addDaysYmd(x, 1, zone)) perDay.set(x, 0);
  delivered.forEach((o) => perDay.set(o.scheduled_date, (perDay.get(o.scheduled_date) ?? 0) + 1));
  const maxDay = Math.max(1, ...perDay.values());

  return (
    <>
      <PageHeader plain title="Reports" description={`${fmtDate(from, zone, 'MMM d, yyyy')} – ${fmtDate(to, zone, 'MMM d, yyyy')}`} />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="b-segment">{Object.entries(presets).map(([k, [label]]) => <Link key={k} href={`/base/deliveries/reports?range=${k}`} aria-current={preset === k ? 'page' : undefined}>{label}</Link>)}</div>
        <form action="/base/deliveries/reports" className="flex flex-wrap items-center gap-2">
          <input type="date" name="from" defaultValue={from} className="b-input !w-auto !py-2" />
          <span className="text-muted">to</span>
          <input type="date" name="to" defaultValue={to} className="b-input !w-auto !py-2" />
          <button className="b-btn-ghost" type="submit">Apply</button>
        </form>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Stops', String(orders.length), `${routes.length} routes`],
          ['Delivered', String(delivered.length), `${pct(delivered.length, delivered.length + failed.length)} first-try success`],
          ['On time', pct(delivered.filter(onTime).length, delivered.length), 'within the window (+15 min)'],
          ['Not delivered', String(failed.length), 'needs a new date'],
          ['Miles (est.)', String(Math.round(routes.reduce((s, r) => s + Number(r.distance_miles ?? 0), 0))), 'planned route distance'],
        ].map(([k, v, h]) => (
          <div key={k} className="b-card px-4 py-3"><p className="text-xs text-muted">{k}</p><p className="text-2xl font-semibold tracking-tight">{v}</p><p className="text-[0.7rem] text-muted">{h}</p></div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Delivered per day" className="xl:col-span-2">
          {delivered.length === 0 ? <EmptyState title="No deliveries in this period." /> : (
            <div className="flex h-40 items-end gap-0.5">
              {[...perDay.entries()].map(([day, n]) => (
                <div key={day} className="flex flex-1 flex-col items-center" title={`${fmtDate(day, zone, 'EEE, MMM d')}: ${n}`}>
                  <div className="w-full rounded-t bg-gradient-to-t from-emerald-500 to-teal-300" style={{ height: `${Math.max(2, (n / maxDay) * 100)}%` }} />
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Drivers" className="xl:col-span-2" pad={false}>
          {drivers.size === 0 ? <EmptyState title="No routes with drivers in this period." /> : (
            <div className="overflow-x-auto">
              <table className="b-table">
                <thead><tr><th>Driver</th><th>Routes</th><th>Stops</th><th>Delivered</th><th>Not delivered</th><th>On time</th><th>Miles (est.)</th></tr></thead>
                <tbody>
                  {[...drivers.entries()].sort((a, b) => b[1].delivered - a[1].delivered).map(([id, x]) => (
                    <tr key={id}><td className="font-medium">{crews.names.get(id) ?? '—'}</td><td>{x.routes}</td><td>{x.stops}</td><td>{x.delivered}</td><td>{x.failed}</td><td>{pct(x.onTime, x.delivered)}</td><td>{Math.round(x.miles)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Why deliveries failed">
          {reasons.size === 0 ? <EmptyState title="No failed deliveries. 🎉" /> : (
            <ul className="space-y-2 text-sm">{[...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => <li key={r} className="flex justify-between"><span>{r}</span><b>{n}</b></li>)}</ul>
          )}
        </Card>
        <Card title="By service">
          {services.size === 0 ? <EmptyState title="Nothing yet." /> : (
            <ul className="space-y-2 text-sm">{[...services.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => <li key={s} className="flex justify-between"><span>{serviceLabel[s as ServiceType]}</span><b>{n}</b></li>)}</ul>
          )}
        </Card>
      </div>
    </>
  );
}
