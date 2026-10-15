'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireDeliveries } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { getDepot, logEvent, recomputeRoute } from '@/lib/deliveries/data';
import { optimizeStops } from '@/lib/deliveries/types';

const uuid = z.string().uuid();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const refresh = () => revalidatePath('/base', 'layout');

const routeSchema = z.object({
  route_date: ymd,
  name: z.string().trim().min(1, 'Name the route.').max(80),
  truck_id: uuid.nullable().catch(null),
  driver_id: uuid.nullable().catch(null),
  helper_id: uuid.nullable().catch(null),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).catch('08:00'),
  notes: z.string().trim().max(1000).transform((v) => v || null),
});

export async function saveRoute(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireDeliveries({ dispatcher: true });
  const parsed = routeSchema.safeParse({
    route_date: fd.get('route_date'),
    name: fd.get('name'),
    truck_id: fd.get('truck_id') || null,
    driver_id: fd.get('driver_id') || null,
    helper_id: fd.get('helper_id') || null,
    start_time: fd.get('start_time'),
    notes: fd.get('notes') ?? '',
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the route.');
  const v = parsed.data;
  if (v.helper_id && v.helper_id === v.driver_id) return fail('The helper must be someone other than the driver.');
  const id = fd.get('id');
  if (typeof id === 'string' && id) {
    const { route_date: _d, ...rest } = v;
    void _d;
    await db().from('dl_routes').update(rest).eq('id', id);
    await recomputeRoute(id);
  } else {
    await db().from('dl_routes').insert(v);
  }
  await audit(viewer, 'delivery.route', 'dl_routes', typeof id === 'string' ? id : null, { text: `${id ? 'updated' : 'created'} the route “${v.name}” for ${v.route_date}` });
  refresh();
  return done(id ? 'Route saved.' : 'Route added.');
}

export async function deleteRoute(fd: FormData) {
  const viewer = await requireDeliveries({ dispatcher: true });
  const id = uuid.safeParse(fd.get('id'));
  if (!id.success) return;
  const { data } = await db().from('dl_routes').select('name, route_date').eq('id', id.data).maybeSingle();
  await db().from('dl_orders').update({ route_id: null, stop_order: null, eta: null }).eq('route_id', id.data).in('status', ['scheduled', 'unscheduled']);
  await db().from('dl_routes').delete().eq('id', id.data);
  await audit(viewer, 'delivery.route', 'dl_routes', id.data, { text: `deleted the route “${data?.name ?? ''}” (${data?.route_date ?? ''})` });
  refresh();
}

/** Put an order on a route (its date becomes the route's date) at the end of the stop list. */
export async function assignToRoute(fd: FormData) {
  const viewer = await requireDeliveries({ dispatcher: true });
  const orderId = uuid.safeParse(fd.get('order_id'));
  const routeId = uuid.safeParse(fd.get('route_id'));
  if (!orderId.success || !routeId.success) return;
  const [{ data: order }, { data: route }, { count }] = await Promise.all([
    db().from('dl_orders').select('id, number, route_id, status').eq('id', orderId.data).maybeSingle(),
    db().from('dl_routes').select('id, name, route_date').eq('id', routeId.data).maybeSingle(),
    db().from('dl_orders').select('id', { count: 'exact', head: true }).eq('route_id', routeId.data),
  ]);
  if (!order || !route || (order.status !== 'scheduled' && order.status !== 'unscheduled')) return;
  await db().from('dl_orders').update({ route_id: route.id, scheduled_date: route.route_date, stop_order: (count ?? 0) + 1, status: 'scheduled' }).eq('id', order.id);
  if (order.route_id && order.route_id !== route.id) await recomputeRoute(order.route_id);
  await recomputeRoute(route.id);
  await logEvent(viewer, order, 'scheduled', `Added to ${route.name} on ${route.route_date}`);
  refresh();
}

export async function removeFromRoute(fd: FormData) {
  await requireDeliveries({ dispatcher: true });
  const orderId = uuid.safeParse(fd.get('order_id'));
  if (!orderId.success) return;
  const { data: o } = await db().from('dl_orders').select('route_id').eq('id', orderId.data).maybeSingle();
  if (!o?.route_id) return;
  await db().from('dl_orders').update({ route_id: null, stop_order: null, eta: null }).eq('id', orderId.data);
  await recomputeRoute(o.route_id);
  refresh();
}

export async function moveStop(fd: FormData) {
  await requireDeliveries({ dispatcher: true });
  const orderId = uuid.safeParse(fd.get('order_id'));
  const dir = fd.get('dir') === 'up' ? -1 : 1;
  if (!orderId.success) return;
  const { data: o } = await db().from('dl_orders').select('route_id').eq('id', orderId.data).maybeSingle();
  if (!o?.route_id) return;
  const { data: stops } = await db().from('dl_orders').select('id').eq('route_id', o.route_id).order('stop_order', { nullsFirst: false });
  const ids = (stops ?? []).map((s) => s.id);
  const i = ids.indexOf(orderId.data);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await Promise.all(ids.map((id, n) => db().from('dl_orders').update({ stop_order: n + 1 }).eq('id', id)));
  await recomputeRoute(o.route_id);
  refresh();
}

/** Best stop order for a route (time windows first, then the shortest drive). Finished stops keep their place. */
export async function optimizeRoute(fd: FormData) {
  const viewer = await requireDeliveries({ dispatcher: true });
  const id = uuid.safeParse(fd.get('id'));
  if (!id.success) return;
  await optimize(id.data);
  await audit(viewer, 'delivery.route', 'dl_routes', id.data, { text: 'optimized a route' });
  refresh();
}

async function optimize(routeId: string) {
  const [{ data: stops }, depot] = await Promise.all([
    db().from('dl_orders').select('id, lat, lng, window_start, priority, status, stop_order').eq('route_id', routeId).order('stop_order', { nullsFirst: false }),
    getDepot(),
  ]);
  if (!stops?.length) return;
  const fixed = stops.filter((s) => s.status === 'delivered' || s.status === 'failed' || s.status === 'arrived');
  const open = stops.filter((s) => !fixed.includes(s));
  const last = [...fixed].reverse().find((s) => s.lat != null);
  const start = last ? { lat: last.lat!, lng: last.lng! } : depot;
  const order = [...fixed, ...optimizeStops(start, open)];
  await Promise.all(order.map((s, n) => db().from('dl_orders').update({ stop_order: n + 1 }).eq('id', s.id)));
  await recomputeRoute(routeId);
}

/**
 * Auto-plan a day: spreads that day's unassigned orders over its routes by area (a sweep
 * around the depot), filling each truck up to its stop capacity, then optimises every route.
 */
export async function autoPlanDay(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireDeliveries({ dispatcher: true });
  const day = ymd.safeParse(fd.get('date'));
  if (!day.success) return fail('Pick a day.');
  const [{ data: routes }, { data: orders }, depot] = await Promise.all([
    db().from('dl_routes').select('id, status, truck:dl_trucks(capacity_stops)').eq('route_date', day.data).in('status', ['planned', 'dispatched']).order('created_at'),
    db().from('dl_orders').select('id, number, lat, lng, window_start').eq('scheduled_date', day.data).is('route_id', null).eq('status', 'scheduled'),
    getDepot(),
  ]);
  if (!routes?.length) return fail('Add at least one route (truck + driver) for this day first.');
  if (!orders?.length) return done('Nothing to plan — every order for this day is already on a route.');
  if (!depot) return fail('Set the warehouse location in Deliveries ▸ Settings first.');
  const { data: loads } = await db().from('dl_orders').select('route_id').in('route_id', routes.map((r) => r.id));
  const used = new Map<string, number>();
  (loads ?? []).forEach((l) => used.set(l.route_id!, (used.get(l.route_id!) ?? 0) + 1));
  const capacity = routes.map((r) => ({ id: r.id, free: Math.max(0, ((r.truck as unknown as { capacity_stops: number } | null)?.capacity_stops ?? 10) - (used.get(r.id) ?? 0)) }));
  const angle = (o: { lat: number | null; lng: number | null }) => (o.lat == null ? 999 : Math.atan2(o.lat - depot.lat, o.lng! - depot.lng));
  const sorted = [...orders].sort((a, b) => angle(a) - angle(b));
  // Neighbouring orders (by direction from the depot) go on the same truck, an even share each,
  // never more than a truck's free stops; any overflow tops up trucks that still have room.
  const share = Math.ceil(sorted.length / capacity.length);
  const plan = new Map<string, typeof sorted>();
  let next = 0;
  for (const c of capacity) {
    const take = Math.min(c.free, share, sorted.length - next);
    plan.set(c.id, sorted.slice(next, next + take));
    c.free -= take;
    next += take;
  }
  for (const c of capacity) {
    while (c.free > 0 && next < sorted.length) {
      plan.get(c.id)!.push(sorted[next++]);
      c.free--;
    }
  }
  let placed = 0;
  for (const [routeId, list] of plan) {
    for (const o of list) {
      await db().from('dl_orders').update({ route_id: routeId, stop_order: 999 }).eq('id', o.id);
      placed++;
    }
  }
  for (const route of routes) await optimize(route.id);
  await audit(viewer, 'delivery.route', 'dl_routes', null, { text: `auto-planned ${placed} deliveries for ${day.data}` });
  refresh();
  return done(placed < orders.length ? `Planned ${placed} of ${orders.length}. The trucks are full — add a route or raise truck capacity for the rest.` : `Planned all ${placed} deliveries and optimised the routes.`);
}

/** Lock the plan and hand it to the drivers (they see it on My Route). */
export async function dispatchRoute(fd: FormData) {
  const viewer = await requireDeliveries({ dispatcher: true });
  const id = uuid.safeParse(fd.get('id'));
  if (!id.success) return;
  const status = fd.get('status') === 'planned' ? 'planned' : 'dispatched';
  const { data } = await db().from('dl_routes').update({ status }).eq('id', id.data).select('name, route_date').maybeSingle();
  await audit(viewer, 'delivery.route', 'dl_routes', id.data, { text: `${status === 'dispatched' ? 'dispatched' : 'un-dispatched'} the route “${data?.name ?? ''}” (${data?.route_date ?? ''})` });
  refresh();
}
