import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { audit } from '@/lib/base/audit';
import type { Viewer } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { CacheKeys, invalidate, memo } from '@/lib/base/memo';
import { listEmployees, listLocations } from '@/lib/base/queries';
import { getSettings } from '@/lib/base/settings';
import { zonedDateTime } from '@/lib/base/time';
import { fullName } from '@/lib/base/types';
import type { Person } from '@/lib/crm/types';
import { planEtas, statusLabel, type DlSettings, type Order, type OrderStatus, type Route } from './types';

const DEFAULTS: DlSettings = {
  depot_name: 'Warehouse',
  depot_address: '',
  depot_lat: null,
  depot_lng: null,
  default_start: '08:00',
  window_hours: 3,
  avg_speed_mph: 28,
  failure_reasons: ['Customer not home', 'Wrong address', 'Item damaged', 'Did not fit / access issue', 'Customer refused', 'Other'],
  tracking_message: '',
};

export const getDlSettings = cache(
  (): Promise<DlSettings> =>
    memo(CacheKeys.dlSettings, 30_000, async () => {
      const row = must<DlSettings | null>(await db().from('dl_settings').select('*').eq('id', 1).maybeSingle(), 'load delivery settings');
      return { ...DEFAULTS, ...(row ?? {}), default_start: (row?.default_start ?? DEFAULTS.default_start).slice(0, 5) };
    }),
);
export const invalidateDlSettings = () => invalidate(CacheKeys.dlSettings);

/** Where trucks start: the depot set in Deliveries ▸ Settings, else the first store with a map location. */
export const getDepot = cache(async (): Promise<{ name: string; lat: number; lng: number } | null> => {
  const s = await getDlSettings();
  if (s.depot_lat != null && s.depot_lng != null) return { name: s.depot_name, lat: s.depot_lat, lng: s.depot_lng };
  const stores = (await listLocations()).filter((l) => l.latitude != null && l.longitude != null);
  const warehouse = stores.find((l) => /warehouse/i.test(l.name)) ?? stores[0];
  return warehouse ? { name: warehouse.name, lat: warehouse.latitude!, lng: warehouse.longitude! } : null;
});

/** People who can drive / help on a route, and everyone's names. */
export const getCrews = cache(async (): Promise<{ drivers: Person[]; names: Map<string, string> }> => {
  const all = await listEmployees(true);
  return {
    names: new Map(all.map((e) => [e.id, fullName(e)])),
    drivers: all.filter((e) => e.status !== 'terminated' && (e.deliveries_role !== 'none' || e.access_level === 'admin')).map((e) => ({ id: e.id, name: fullName(e) })),
  };
});

/** Street address → map location via OpenStreetMap (free, no key). Null if it can't be found. */
export async function geocode(a: { address1: string; city: string | null; state: string | null; postal_code: string | null }): Promise<{ lat: number; lng: number } | null> {
  const tries = [
    new URLSearchParams({ street: a.address1, ...(a.city ? { city: a.city } : {}), ...(a.state ? { state: a.state } : {}), ...(a.postal_code ? { postalcode: a.postal_code } : {}) }),
    new URLSearchParams({ q: [a.address1, a.city, a.state, a.postal_code].filter(Boolean).join(', ') }),
  ];
  for (const p of tries) {
    try {
      p.set('format', 'jsonv2');
      p.set('limit', '1');
      p.set('countrycodes', 'us');
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${p}`, {
        headers: { 'User-Agent': 'BayDesignEmployeePortal/1.0 (Bay Design Store deliveries)', 'Accept-Language': 'en-US' },
        signal: AbortSignal.timeout(4000),
        cache: 'no-store',
      });
      if (!res.ok) continue;
      const [hit] = (await res.json()) as { lat: string; lon: string }[];
      if (hit) return { lat: Number(hit.lat), lng: Number(hit.lon) };
    } catch {
      // try the next form of the address
    }
  }
  return null;
}

/** One line in an order's history (also what the customer's tracking page shows). */
export async function logEvent(viewer: Pick<Viewer, 'employeeId' | 'name'> | null, order: Pick<Order, 'id' | 'number'>, status: OrderStatus | 'note' | 'created' | 'updated', note?: string | null, where?: { lat: number; lng: number } | null) {
  await db()
    .from('dl_events')
    .insert({ order_id: order.id, status, note: note?.slice(0, 500) ?? null, actor_id: viewer?.employeeId ?? null, actor_label: viewer?.name ?? null, lat: where?.lat ?? null, lng: where?.lng ?? null });
  if (viewer) {
    const text = status === 'created' ? `created delivery order #${order.number}` : status === 'updated' ? `updated delivery order #${order.number}` : status === 'note' ? `noted on order #${order.number}: ${note ?? ''}` : `marked order #${order.number} ${statusLabel[status as OrderStatus].toLowerCase()}${note ? ` — ${note}` : ''}`;
    await audit(viewer, `delivery.${status}`, 'dl_orders', order.id, { text: text.slice(0, 300) });
  }
}

/** Re-computes stop arrival times and the route's mileage after any change to its stops. */
export async function recomputeRoute(routeId: string) {
  const [{ data: route }, { data: stops }, settings, depot, { timezone }] = await Promise.all([
    db().from('dl_routes').select('id, route_date, start_time').eq('id', routeId).maybeSingle<Pick<Route, 'id' | 'route_date' | 'start_time'>>(),
    db().from('dl_orders').select('id, lat, lng, window_start, duration_min, stop_order, status').eq('route_id', routeId).neq('status', 'cancelled').order('stop_order', { nullsFirst: false }),
    getDlSettings(),
    getDepot(),
    getSettings(),
  ]);
  if (!route || !stops) return;
  const startMs = zonedDateTime(route.route_date, route.start_time.slice(0, 5), timezone).getTime();
  const plan = planEtas(depot, startMs, stops, settings.avg_speed_mph, (s) => (s.window_start ? zonedDateTime(route.route_date, s.window_start.slice(0, 5), timezone).getTime() : null));
  await Promise.all(stops.map((s, i) => db().from('dl_orders').update({ stop_order: i + 1, eta: new Date(plan.eta[i]).toISOString() }).eq('id', s.id)));
  await db().from('dl_routes').update({ distance_miles: plan.miles }).eq('id', routeId);
}

/** The public origin (https://…) for tracking links. */
export async function siteOrigin() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'baydesignstore.com';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** Workflow customers (with addresses) and deals for the order form's pickers. */
export async function orderFormOptions() {
  const [contacts, deals] = await Promise.all([
    db().from('crm_contacts').select('id, first_name, last_name, email, phone, address1, address2, city, state, postal_code').order('updated_at', { ascending: false }).limit(800),
    db().from('crm_deals').select('id, title, status').order('updated_at', { ascending: false }).limit(300),
  ]);
  return {
    contacts: must<{ id: string; first_name: string; last_name: string; email: string | null; phone: string | null; address1: string | null; address2: string | null; city: string | null; state: string | null; postal_code: string | null }[]>(contacts, 'load customers').map(
      ({ first_name, last_name, ...c }) => ({ ...c, name: `${first_name} ${last_name}`.trim() }),
    ),
    deals: must<{ id: string; title: string; status: string }[]>(deals, 'load deals').map((d) => ({ id: d.id, name: `${d.title}${d.status !== 'open' ? ` (${d.status})` : ''}` })),
  };
}
