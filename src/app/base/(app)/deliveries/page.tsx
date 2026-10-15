import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Map as MapIcon, PackageX, Plus, Timer, Truck } from 'lucide-react';
import AutoRefresh from '@/components/base/AutoRefresh';
import { Card, EmptyState } from '@/components/base/ui';
import RouteMap, { type MapRoute } from '@/components/deliveries/RouteMap';
import { requireDeliveries } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { addDaysYmd, fmtDate, fmtTime, todayYmd, zonedDateTime, zonedMidnight } from '@/lib/base/time';
import { getCrews, getDepot } from '@/lib/deliveries/data';
import { isDone, routeStatusLabel, routeStatusTone, statusLabel, statusTone, type Order, type Route } from '@/lib/deliveries/types';

export const metadata: Metadata = { title: 'Deliveries' };

function Kpi({ icon: Icon, label, value, hint, tone, href }: { icon: typeof Truck; label: string; value: string; hint?: string; tone: string; href?: string }) {
  const body = (
    <div className="b-card flex h-full items-start gap-3 p-4">
      <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${tone}`}><Icon size={19} /></span>
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        {hint && <p className="text-[0.7rem] text-muted">{hint}</p>}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function DeliveriesDashboard() {
  await requireDeliveries({ dispatcher: true });
  const [{ timezone: zone }, crews, depot] = await Promise.all([getSettings(), getCrews(), getDepot()]);
  const today = todayYmd(zone);
  const since = zonedMidnight(addDaysYmd(today, -30, zone), zone).toISOString();
  const [ordersRes, routesRes, unschedRes, recentRes, weekRes] = await Promise.all([
    db().from('dl_orders').select('*').eq('scheduled_date', today).neq('status', 'cancelled').order('stop_order', { nullsFirst: false }),
    db().from('dl_routes').select('*, truck:dl_trucks(name, color)').eq('route_date', today).order('start_time'),
    db().from('dl_orders').select('id', { count: 'exact', head: true }).eq('status', 'unscheduled'),
    db().from('dl_orders').select('status, completed_at, window_end, scheduled_date').in('status', ['delivered', 'failed']).gte('completed_at', since).limit(5000),
    db().from('dl_orders').select('scheduled_date').gte('scheduled_date', today).lte('scheduled_date', addDaysYmd(today, 6, zone)).neq('status', 'cancelled'),
  ]);
  const orders = must<Order[]>(ordersRes, 'load today’s orders');
  const routes = must<(Route & { truck: { name: string; color: string } | null })[]>(routesRes, 'load routes');
  const recent = must<{ status: string; completed_at: string; window_end: string | null; scheduled_date: string | null }[]>(recentRes, 'load recent deliveries');
  const week = must<{ scheduled_date: string }[]>(weekRes, 'load this week');

  const delivered = orders.filter((o) => o.status === 'delivered').length;
  const failed = orders.filter((o) => o.status === 'failed').length;
  const onRoad = orders.filter((o) => o.status === 'en_route' || o.status === 'arrived').length;
  const unassigned = orders.filter((o) => !o.route_id && !isDone(o.status)).length;
  const onTime = recent.filter((o) => o.status === 'delivered' && o.window_end && o.scheduled_date);
  const onTimePct = onTime.length ? Math.round((onTime.filter((o) => new Date(o.completed_at).getTime() <= zonedDateTime(o.scheduled_date!, o.window_end!.slice(0, 5), zone).getTime() + 15 * 60_000).length / onTime.length) * 100) : null;
  const successPct = recent.length ? Math.round((recent.filter((o) => o.status === 'delivered').length / recent.length) * 100) : null;
  const palette = ['#6366F1', '#EC4899', '#10B981', '#F59E0B', '#0EA5E9'];
  const mapRoutes: MapRoute[] = routes.map((r, i) => ({
    id: r.id,
    name: r.name,
    color: r.truck?.color ?? palette[i % palette.length],
    stops: orders.filter((o) => o.route_id === r.id && o.lat != null).map((o) => ({ id: o.id, lat: o.lat!, lng: o.lng!, label: String(o.stop_order ?? ''), title: `${o.stop_order}. ${o.customer_name}`, detail: o.eta ? `ETA ${fmtTime(o.eta, zone)}` : undefined, done: o.status === 'delivered', failed: o.status === 'failed', href: `/base/deliveries/orders/${o.id}` })),
  }));
  const days = Array.from({ length: 7 }, (_, i) => addDaysYmd(today, i, zone));
  const perDay = new Map(days.map((d) => [d, week.filter((w) => w.scheduled_date === d).length]));
  const maxDay = Math.max(1, ...perDay.values());

  return (
    <>
      <AutoRefresh seconds={45} />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="b-eyebrow">Deliveries</p>
          <h1 className="text-[1.9rem] font-semibold tracking-tight">Today · {fmtDate(today, zone, 'EEEE, MMM d')}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/base/deliveries/orders/new" className="b-btn-ghost"><Plus size={15} /> New order</Link>
          <Link href="/base/deliveries/dispatch" className="b-btn-brass"><MapIcon size={15} /> Dispatch board</Link>
        </div>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={Truck} label="Stops today" value={String(orders.length)} hint={`${routes.length} route${routes.length === 1 ? '' : 's'}`} tone="bg-indigo-500/15 text-brass-dark" href="/base/deliveries/dispatch" />
        <Kpi icon={CheckCircle2} label="Delivered" value={`${delivered}/${orders.length}`} hint={onRoad ? `${onRoad} on the way` : undefined} tone="bg-emerald-500/15 text-emerald-700" />
        <Kpi icon={PackageX} label="Not delivered" value={String(failed)} tone="bg-red-500/15 text-red-700" href="/base/deliveries/orders?tab=problems" />
        <Kpi icon={AlertTriangle} label="Not on a route" value={String(unassigned)} hint="today" tone="bg-amber-500/15 text-amber-700" href="/base/deliveries/dispatch" />
        <Kpi icon={CalendarClock} label="To schedule" value={String(unschedRes.count ?? 0)} hint="orders without a date" tone="bg-sky-500/15 text-sky-700" href="/base/deliveries/orders?tab=unscheduled" />
        <Kpi icon={Timer} label="On time (30 days)" value={onTimePct === null ? '—' : `${onTimePct}%`} hint={successPct === null ? undefined : `${successPct}% delivered first try`} tone="bg-violet-500/15 text-violet-700" href="/base/deliveries/reports" />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2"><RouteMap routes={mapRoutes} depot={depot} height={420} /></div>
        <Card title="Routes today" pad={false}>
          {routes.length === 0 ? (
            <EmptyState icon={<Truck size={20} />} title="No routes today." />
          ) : (
            <ul className="divide-y divide-stone/50">
              {routes.map((r) => {
                const list = orders.filter((o) => o.route_id === r.id);
                const done = list.filter((o) => isDone(o.status)).length;
                const next = list.find((o) => !isDone(o.status));
                return (
                  <li key={r.id} className="px-4 py-3">
                    <p className="flex items-center gap-2 text-sm font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: r.truck?.color ?? '#6366F1' }} /> {r.name} <span className={routeStatusTone[r.status]}>{routeStatusLabel[r.status]}</span></p>
                    <p className="text-xs text-muted">{r.driver_id ? crews.names.get(r.driver_id) : 'No driver'} · {done}/{list.length} done{next ? ` · next: ${next.customer_name}${next.eta ? ` ${fmtTime(next.eta, zone)}` : ''}` : ''}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="Today’s stops" className="xl:col-span-2" pad={false}>
          {orders.length === 0 ? (
            <EmptyState title="Nothing scheduled today." />
          ) : (
            <ul className="divide-y divide-stone/50">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link href={`/base/deliveries/orders/${o.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-linen/60">
                    <span className="w-6 text-center text-xs font-bold text-muted">{o.stop_order ?? '–'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{o.customer_name}</span>
                      <span className="block truncate text-xs text-muted">{o.address1}{o.city ? `, ${o.city}` : ''}</span>
                    </span>
                    <span className="hidden text-xs text-muted sm:block"><Clock size={11} className="mr-1 inline" />{o.eta ? fmtTime(o.eta, zone) : '—'}</span>
                    <span className={statusTone[o.status]}>{statusLabel[o.status]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Next 7 days">
          <div className="flex h-36 items-end gap-2">
            {days.map((d) => (
              <Link key={d} href={`/base/deliveries/dispatch?date=${d}`} className="flex flex-1 flex-col items-center gap-1" title={`${perDay.get(d)} stops`}>
                <span className="text-[0.65rem] font-semibold text-muted">{perDay.get(d) || ''}</span>
                <div className="w-full rounded-t-lg bg-gradient-to-t from-brass to-brass-light" style={{ height: `${Math.max(3, ((perDay.get(d) ?? 0) / maxDay) * 100)}%` }} />
                <span className="text-[0.65rem] text-muted">{fmtDate(d, zone, 'EEE')}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
