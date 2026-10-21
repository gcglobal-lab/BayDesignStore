import type { Metadata } from 'next';
import { DatePicker } from '@/components/base/calendar/Calendar';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, MapPinOff, Pencil, Plus, Printer, Route as RouteIcon, Send, Trash2, Undo2, Wand2, X } from 'lucide-react';
import AutoRefresh from '@/components/base/AutoRefresh';
import { Dialog } from '@/components/base/Dialog';
import { SubmitButton } from '@/components/base/forms';
import { Card, EmptyState, PageHeader } from '@/components/base/ui';
import { AutoPlanButton, RouteForm } from '@/components/deliveries/Forms';
import RouteMap, { type MapRoute, type MapStop } from '@/components/deliveries/RouteMap';
import { requireDeliveries } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { addDaysYmd, fmtDate, fmtTime, isYmd, todayYmd, zonedDateTime } from '@/lib/base/time';
import { getCrews, getDepot, getDlSettings } from '@/lib/deliveries/data';
import { fmtClock, fmtWindow, isDone, routeStatusLabel, routeStatusTone, serviceLabel, statusLabel, statusTone, type Order, type Route, type Truck } from '@/lib/deliveries/types';
import { assignToRoute, deleteRoute, dispatchRoute, moveStop, optimizeRoute, removeFromRoute } from './actions';
import Select from '@/components/ui/Select';

export const metadata: Metadata = { title: 'Dispatch board' };

const Hidden = ({ name, value }: { name: string; value: string }) => <input type="hidden" name={name} value={value} />;

export default async function DispatchPage({ searchParams }: PageProps<'/base/deliveries/dispatch'>) {
  await requireDeliveries({ dispatcher: true });
  const sp = await searchParams;
  const [{ timezone: zone }, settings, crews, depot] = await Promise.all([getSettings(), getDlSettings(), getCrews(), getDepot()]);
  const today = todayYmd(zone);
  const date = isYmd(sp.date) ? (sp.date as string) : today;

  const [routesRes, ordersRes, unschedRes, trucksRes] = await Promise.all([
    db().from('dl_routes').select('*').eq('route_date', date).order('created_at'),
    db().from('dl_orders').select('*').eq('scheduled_date', date).neq('status', 'cancelled').order('stop_order', { nullsFirst: false }),
    db().from('dl_orders').select('*').eq('status', 'unscheduled').order('created_at').limit(50),
    db().from('dl_trucks').select('*').order('name'),
  ]);
  const routes = must<Route[]>(routesRes, 'load routes');
  const orders = must<Order[]>(ordersRes, 'load orders');
  const unscheduled = must<Order[]>(unschedRes, 'load unscheduled orders');
  const trucks = must<Truck[]>(trucksRes, 'load trucks');
  const truckOf = new Map(trucks.map((t) => [t.id, t]));
  const loose = orders.filter((o) => !o.route_id && !isDone(o.status));
  const palette = ['#6366F1', '#EC4899', '#10B981', '#F59E0B', '#0EA5E9', '#8B5CF6', '#EF4444'];
  const colorOf = (r: Route, i: number) => (r.truck_id && truckOf.get(r.truck_id)?.color) || palette[i % palette.length];

  const mapRoutes: MapRoute[] = routes.map((r, i) => ({
    id: r.id,
    name: r.name,
    color: colorOf(r, i),
    stops: orders
      .filter((o) => o.route_id === r.id && o.lat != null && o.lng != null)
      .map((o) => ({ id: o.id, lat: o.lat!, lng: o.lng!, label: String(o.stop_order ?? ''), title: `${o.stop_order}. ${o.customer_name}`, detail: `${o.address1} · ${o.eta ? `ETA ${fmtTime(o.eta, zone)}` : fmtWindow(o.window_start, o.window_end)}`, done: o.status === 'delivered', failed: o.status === 'failed', href: `/base/deliveries/orders/${o.id}` })),
  }));
  const looseStops: MapStop[] = loose.filter((o) => o.lat != null).map((o) => ({ id: o.id, lat: o.lat!, lng: o.lng!, label: '', title: o.customer_name, detail: fmtWindow(o.window_start, o.window_end), href: `/base/deliveries/orders/${o.id}` }));
  const miles = routes.reduce((s, r) => s + Number(r.distance_miles ?? 0), 0);
  // Arriving after the customer's window closes.
  const late = (o: Order) => Boolean(o.eta && o.window_end && !isDone(o.status) && new Date(o.eta).getTime() > zonedDateTime(date, o.window_end.slice(0, 5), zone).getTime());
  const nav = (d: string) => `/base/deliveries/dispatch?date=${d}`;

  const AssignForm = ({ o }: { o: Order }) =>
    routes.length ? (
      <form action={assignToRoute} className="flex items-center gap-1.5">
        <Hidden name="order_id" value={o.id} />
        <Select name="route_id" className="b-input !w-auto !py-1 text-xs" aria-label="Route" defaultValue={routes[0].id}>
          {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        <SubmitButton className="b-btn-ghost b-btn-sm"><Plus size={12} /> Add</SubmitButton>
      </form>
    ) : null;

  return (
    <>
      <AutoRefresh seconds={45} />
      <PageHeader
        plain
        title="Dispatch board"
        description={`${fmtDate(date, zone, 'EEEE, MMMM d, yyyy')} · ${orders.length} stop${orders.length === 1 ? '' : 's'} · ${routes.length} route${routes.length === 1 ? '' : 's'}${miles ? ` · ~${Math.round(miles)} mi` : ''}`}
        actions={
          <>
            <Link href={`/base/deliveries/orders/new?date=${date}`} className="b-btn-ghost"><Plus size={15} /> Order</Link>
            <Dialog trigger={<><RouteIcon size={15} /> Add route</>} triggerClassName="b-btn-ghost" title={`New route — ${fmtDate(date, zone, 'EEE, MMM d')}`} wide>
              <RouteForm date={date} trucks={trucks} drivers={crews.drivers} defaultStart={settings.default_start} suggestedName={`Route ${routes.length + 1}`} />
            </Dialog>
            <AutoPlanButton date={date} />
          </>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={nav(addDaysYmd(date, -1, zone))} className="b-btn-ghost b-btn-sm" aria-label="Previous day"><ChevronLeft size={14} /></Link>
        <Link href={nav(today)} className="b-btn-ghost b-btn-sm">Today</Link>
        <Link href={nav(addDaysYmd(date, 1, zone))} className="b-btn-ghost b-btn-sm" aria-label="Next day"><ChevronRight size={14} /></Link>
        <form action="/base/deliveries/dispatch" className="flex items-center gap-2">
          <DatePicker name="date" defaultValue={date} compact className="w-48" aria-label="Day" />
          <button className="b-btn-ghost b-btn-sm" type="submit">Go</button>
        </form>
        {!depot && <span className="text-xs text-amber-700">Set the warehouse address in Deliveries ▸ Settings for accurate routes.</span>}
      </div>

      <div className="mb-6"><RouteMap routes={mapRoutes} loose={looseStops} depot={depot} height={380} /></div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title={`Not on a route (${loose.length})`} pad={false}>
            {loose.length === 0 ? (
              <EmptyState title="Every stop for this day is on a route." />
            ) : (
              <ul className="divide-y divide-stone/50">
                {loose.map((o) => (
                  <li key={o.id} className="space-y-1.5 px-4 py-3">
                    <Link href={`/base/deliveries/orders/${o.id}`} className="block text-sm font-medium hover:text-brass-dark">#{o.number} · {o.customer_name}</Link>
                    <p className="flex items-center gap-1 text-xs text-muted">{o.lat == null && <MapPinOff size={11} className="text-amber-600" />}{o.address1}{o.city ? `, ${o.city}` : ''} · {fmtWindow(o.window_start, o.window_end)}</p>
                    <AssignForm o={o} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={`To schedule (${unscheduled.length})`} pad={false}>
            {unscheduled.length === 0 ? (
              <EmptyState title="Nothing waiting for a date." />
            ) : (
              <ul className="divide-y divide-stone/50">
                {unscheduled.map((o) => (
                  <li key={o.id} className="space-y-1.5 px-4 py-3">
                    <Link href={`/base/deliveries/orders/${o.id}`} className="block text-sm font-medium hover:text-brass-dark">#{o.number} · {o.customer_name}</Link>
                    <p className="text-xs text-muted">{serviceLabel[o.service_type]} · {o.city ?? o.address1}</p>
                    <AssignForm o={o} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {routes.length === 0 && (
            <Card>
              <EmptyState icon={<RouteIcon size={20} />} title="No routes for this day yet.">Add a route for each truck going out, then add stops or use Auto-plan.</EmptyState>
            </Card>
          )}
          {routes.map((r, i) => {
            const stops = orders.filter((o) => o.route_id === r.id);
            const truck = r.truck_id ? truckOf.get(r.truck_id) : null;
            const doneCount = stops.filter((s) => isDone(s.status)).length;
            const over = truck && stops.length > truck.capacity_stops;
            return (
              <section key={r.id} className="b-card overflow-hidden">
                <header className="flex flex-wrap items-center gap-3 border-b border-stone/50 px-5 py-4" style={{ boxShadow: `inset 4px 0 0 ${colorOf(r, i)}` }}>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {r.name} <span className={routeStatusTone[r.status]}>{routeStatusLabel[r.status]}</span>
                      {over && <span className="b-badge-red">Over capacity ({stops.length}/{truck.capacity_stops})</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {truck ? `${truck.name}` : 'No truck'} · {r.driver_id ? crews.names.get(r.driver_id) : <span className="text-amber-700">no driver</span>}
                      {r.helper_id ? ` + ${crews.names.get(r.helper_id)}` : ''} · leaves {fmtClock(r.start_time)} · {stops.length} stop{stops.length === 1 ? '' : 's'}
                      {doneCount ? ` (${doneCount} done)` : ''}{r.distance_miles ? ` · ~${Math.round(Number(r.distance_miles))} mi` : ''}
                      {stops.length ? ` · back ~${fmtTime(new Date(new Date(stops[stops.length - 1].eta ?? Date.now()).getTime() + (stops[stops.length - 1].duration_min + 20) * 60_000), zone)}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {stops.length > 1 && r.status !== 'completed' && (
                      <form action={optimizeRoute}><Hidden name="id" value={r.id} /><SubmitButton className="b-btn-ghost b-btn-sm"><Wand2 size={13} /> Optimize</SubmitButton></form>
                    )}
                    {r.status === 'planned' && stops.length > 0 && (
                      <form action={dispatchRoute}><Hidden name="id" value={r.id} /><SubmitButton className="b-btn-brass b-btn-sm"><Send size={13} /> Dispatch</SubmitButton></form>
                    )}
                    {r.status === 'dispatched' && (
                      <form action={dispatchRoute}><Hidden name="id" value={r.id} /><Hidden name="status" value="planned" /><SubmitButton className="b-btn-quiet b-btn-sm"><Undo2 size={13} /> Un-dispatch</SubmitButton></form>
                    )}
                    <Link href={`/base/deliveries/routes/${r.id}/print`} target="_blank" className="b-btn-quiet b-btn-sm" title="Print route sheet"><Printer size={14} /></Link>
                    <Dialog trigger={<Pencil size={14} />} triggerClassName="b-btn-quiet b-btn-sm" title={`Edit ${r.name}`} wide>
                      <RouteForm date={date} trucks={trucks} drivers={crews.drivers} route={r} defaultStart={settings.default_start} />
                    </Dialog>
                    {r.status !== 'in_progress' && r.status !== 'completed' && (
                      <form action={deleteRoute}><Hidden name="id" value={r.id} /><SubmitButton className="b-btn-quiet b-btn-sm" confirm="Delete this route? Its stops go back to “Not on a route”."><Trash2 size={14} /></SubmitButton></form>
                    )}
                  </div>
                </header>
                {stops.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted">No stops yet — add orders from the left, or use Auto-plan day.</p>
                ) : (
                  <ol className="divide-y divide-stone/50">
                    {stops.map((o, n) => (
                      <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: o.status === 'delivered' ? '#059669' : o.status === 'failed' ? '#e11d48' : colorOf(r, i) }}>{o.stop_order ?? n + 1}</span>
                        <div className="min-w-[12rem] flex-1">
                          <Link href={`/base/deliveries/orders/${o.id}`} className="text-sm font-medium hover:text-brass-dark">{o.customer_name}</Link>
                          <p className="flex items-center gap-1 text-xs text-muted">{o.lat == null && <MapPinOff size={11} className="text-amber-600" aria-label="Not on the map" />}{o.address1}{o.city ? `, ${o.city}` : ''}</p>
                        </div>
                        <div className="text-right text-xs">
                          <p className="font-semibold">{o.eta ? `ETA ${fmtTime(o.eta, zone)}` : '—'}</p>
                          <p className={late(o) ? 'font-semibold text-red-700' : 'text-muted'}>{fmtWindow(o.window_start, o.window_end)}{late(o) ? ' · late' : ''}</p>
                        </div>
                        <span className={statusTone[o.status]}>{statusLabel[o.status]}</span>
                        {!isDone(o.status) && r.status !== 'completed' && (
                          <span className="flex items-center">
                            <form action={moveStop}><Hidden name="order_id" value={o.id} /><Hidden name="dir" value="up" /><button disabled={n === 0} className="rounded p-1 text-muted hover:text-ink disabled:opacity-30" aria-label="Move up"><ArrowUp size={14} /></button></form>
                            <form action={moveStop}><Hidden name="order_id" value={o.id} /><Hidden name="dir" value="down" /><button disabled={n === stops.length - 1} className="rounded p-1 text-muted hover:text-ink disabled:opacity-30" aria-label="Move down"><ArrowDown size={14} /></button></form>
                            {o.status === 'scheduled' && <form action={removeFromRoute}><Hidden name="order_id" value={o.id} /><button className="rounded p-1 text-muted hover:text-red-600" aria-label="Take off this route"><X size={14} /></button></form>}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
                {r.notes && <p className="border-t border-stone/50 px-5 py-2 text-xs text-muted">{r.notes}</p>}
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
