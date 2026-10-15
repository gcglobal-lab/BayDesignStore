import type { Metadata } from 'next';
import Link from 'next/link';
import { Banknote, ChevronLeft, ChevronRight, MapPin, Navigation, Phone, Play, Route as RouteIcon, Truck, Wrench } from 'lucide-react';
import AutoRefresh from '@/components/base/AutoRefresh';
import { SubmitButton } from '@/components/base/forms';
import { Card, EmptyState } from '@/components/base/ui';
import DriverStop from '@/components/deliveries/DriverStop';
import RouteMap from '@/components/deliveries/RouteMap';
import { requireDeliveries } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { addDaysYmd, fmtDate, fmtTime, isYmd, todayYmd } from '@/lib/base/time';
import { money } from '@/lib/crm/types';
import { getCrews, getDepot, getDlSettings } from '@/lib/deliveries/data';
import { fmtClock, fmtWindow, fullAddress, isDone, mapsLink, routeStatusLabel, routeStatusTone, serviceLabel, type Order, type Route } from '@/lib/deliveries/types';
import { startRoute } from './actions';

export const metadata: Metadata = { title: 'My route' };

/** The driver's day on their phone: stops in order, directions, call-ahead, proof of delivery. */
export default async function MyRoutePage({ searchParams }: PageProps<'/base/deliveries/my-route'>) {
  const viewer = await requireDeliveries();
  const sp = await searchParams;
  const [{ timezone: zone }, settings, crews, depot] = await Promise.all([getSettings(), getDlSettings(), getCrews(), getDepot()]);
  const today = todayYmd(zone);
  const date = isYmd(sp.date) ? (sp.date as string) : today;
  const me = viewer.employeeId;

  const routes = me
    ? must<(Route & { truck: { name: string; color: string } | null })[]>(
        await db().from('dl_routes').select('*, truck:dl_trucks(name, color)').eq('route_date', date).or(`driver_id.eq.${me},helper_id.eq.${me}`).neq('status', 'planned').order('start_time'),
        'load your routes',
      )
    : [];
  const ids = routes.map((r) => r.id);
  const stops = ids.length ? must<Order[]>(await db().from('dl_orders').select('*').in('route_id', ids).neq('status', 'cancelled').order('stop_order'), 'load your stops') : [];
  const items = stops.length ? must<{ id: string; order_id: string; description: string; quantity: number; assembly: boolean }[]>(await db().from('dl_order_items').select('id, order_id, description, quantity, assembly').in('order_id', stops.map((s) => s.id)).order('position'), 'load items') : [];
  const nav = (d: string) => `/base/deliveries/my-route?date=${d}`;

  return (
    <div className="mx-auto max-w-2xl">
      <AutoRefresh seconds={60} />
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <p className="b-eyebrow">My route</p>
          <h1 className="text-2xl font-semibold tracking-tight">{date === today ? 'Today' : fmtDate(date, zone, 'EEEE')} · {fmtDate(date, zone, 'MMM d')}</h1>
        </div>
        <div className="flex gap-1">
          <Link href={nav(addDaysYmd(date, -1, zone))} className="b-btn-ghost b-btn-sm" aria-label="Previous day"><ChevronLeft size={15} /></Link>
          {date !== today && <Link href={nav(today)} className="b-btn-ghost b-btn-sm">Today</Link>}
          <Link href={nav(addDaysYmd(date, 1, zone))} className="b-btn-ghost b-btn-sm" aria-label="Next day"><ChevronRight size={15} /></Link>
        </div>
      </div>

      {!me && <Card><EmptyState title="Only team members on the roster have routes.">Dispatchers see every route on the Dispatch board.</EmptyState></Card>}
      {me && routes.length === 0 && (
        <Card><EmptyState icon={<Truck size={20} />} title="No route for you on this day.">Routes show here once the dispatcher sends them out.</EmptyState></Card>
      )}

      {routes.map((r) => {
        const list = stops.filter((s) => s.route_id === r.id);
        const next = list.find((s) => !isDone(s.status));
        const done = list.filter((s) => isDone(s.status)).length;
        const role = r.driver_id === me ? 'Driver' : 'Helper';
        return (
          <section key={r.id} className="mb-8 space-y-4">
            <div className="b-card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl text-white" style={{ background: r.truck?.color ?? '#6366F1' }}><RouteIcon size={20} /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{r.name} <span className={`${routeStatusTone[r.status]} ml-1`}>{routeStatusLabel[r.status]}</span></p>
                  <p className="text-xs text-muted">
                    {role} · {r.truck?.name ?? 'No truck'} · leave {fmtClock(r.start_time)} · {done}/{list.length} done{r.distance_miles ? ` · ~${Math.round(Number(r.distance_miles))} mi` : ''}
                    {r.driver_id !== me && r.driver_id ? ` · driver ${crews.names.get(r.driver_id)}` : r.helper_id ? ` · helper ${crews.names.get(r.helper_id)}` : ''}
                  </p>
                </div>
                {r.status === 'dispatched' && (
                  <form action={startRoute}>
                    <input type="hidden" name="id" value={r.id} />
                    <SubmitButton className="b-btn-brass"><Play size={15} /> Start route</SubmitButton>
                  </form>
                )}
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-sand"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }} /></div>
              {r.notes && <p className="mt-3 rounded-xl bg-linen px-3 py-2 text-sm">{r.notes}</p>}
            </div>

            <RouteMap
              height={260}
              depot={depot}
              routes={[{ id: r.id, name: r.name, color: r.truck?.color ?? '#6366F1', stops: list.filter((s) => s.lat != null).map((s) => ({ id: s.id, lat: s.lat!, lng: s.lng!, label: String(s.stop_order ?? ''), title: `${s.stop_order}. ${s.customer_name}`, detail: s.address1, done: s.status === 'delivered', failed: s.status === 'failed' })) }]}
            />

            <ol className="space-y-3">
              {list.map((s) => {
                const its = items.filter((i) => i.order_id === s.id);
                const isNext = s.id === next?.id;
                return (
                  <li key={s.id} className={`b-card overflow-hidden ${isNext ? 'ring-2 ring-brass' : ''} ${isDone(s.status) ? 'opacity-75' : ''}`}>
                    <div className="flex items-start gap-3 border-b border-stone/50 px-4 py-3">
                      <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-full text-sm font-bold text-white ${s.status === 'delivered' ? 'bg-emerald-600' : s.status === 'failed' ? 'bg-red-600' : 'bg-brass'}`}>{s.stop_order}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{s.customer_name} {isNext && <span className="b-badge-blue ml-1">Next</span>}</p>
                        <p className="text-xs text-muted">{serviceLabel[s.service_type]} · {fmtWindow(s.window_start, s.window_end)}{s.eta ? ` · ETA ${fmtTime(s.eta, zone)}` : ''}</p>
                      </div>
                    </div>
                    <div className="space-y-3 px-4 py-3">
                      <p className="flex items-start gap-2 text-sm"><MapPin size={15} className="mt-0.5 flex-none text-muted" /> {fullAddress(s)}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <a href={mapsLink(s)} target="_blank" rel="noreferrer" className="b-btn-ghost !py-2.5"><Navigation size={15} /> Directions</a>
                        {s.phone ? <a href={`tel:${s.phone}`} className="b-btn-ghost !py-2.5"><Phone size={15} /> Call</a> : <span className="b-btn-ghost !py-2.5 opacity-50">No phone</span>}
                      </div>
                      {s.instructions && <p className="whitespace-pre-wrap rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{s.instructions}</p>}
                      {Number(s.balance_due) > 0 && <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"><Banknote size={15} /> Collect {money(s.balance_due, true)}</p>}
                      {its.length > 0 && (
                        <ul className="space-y-1 text-sm">
                          {its.map((i) => <li key={i.id} className="flex items-center gap-2"><span className="font-semibold">{i.quantity}×</span> {i.description} {i.assembly && <span className="b-badge-gray"><Wrench size={10} /> assemble</span>}</li>)}
                        </ul>
                      )}
                      {(r.status === 'in_progress' || r.status === 'dispatched' || isDone(s.status)) && <DriverStop id={s.id} status={s.status} items={its.map((i) => ({ id: i.id, description: i.description, quantity: i.quantity }))} reasons={settings.failure_reasons} />}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
