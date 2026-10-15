/** Deliveries (dispatch) records, labels and route maths. Safe to import from client components. */

export type OrderStatus = 'unscheduled' | 'scheduled' | 'en_route' | 'arrived' | 'delivered' | 'failed' | 'cancelled';
export type ServiceType = 'delivery' | 'delivery_install' | 'white_glove' | 'pickup' | 'return' | 'service_call';
export type RouteStatus = 'planned' | 'dispatched' | 'in_progress' | 'completed';

export type OrderItem = { id?: string; description: string; sku: string | null; quantity: number; assembly: boolean; delivered?: boolean; notes: string | null };

export type Order = {
  id: string;
  number: number;
  service_type: ServiceType;
  status: OrderStatus;
  customer_name: string;
  phone: string | null;
  email: string | null;
  address1: string;
  address2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  lat: number | null;
  lng: number | null;
  contact_id: string | null;
  deal_id: string | null;
  scheduled_date: string | null;
  window_start: string | null;
  window_end: string | null;
  route_id: string | null;
  stop_order: number | null;
  eta: string | null;
  duration_min: number;
  priority: 'low' | 'normal' | 'high';
  instructions: string | null;
  internal_notes: string | null;
  balance_due: number;
  tracking_token: string;
  arrived_at: string | null;
  completed_at: string | null;
  failed_reason: string | null;
  recipient_name: string | null;
  driver_notes: string | null;
  created_at: string;
};

export type Route = {
  id: string;
  route_date: string;
  name: string;
  truck_id: string | null;
  driver_id: string | null;
  helper_id: string | null;
  status: RouteStatus;
  start_time: string;
  notes: string | null;
  distance_miles: number | null;
  started_at: string | null;
  completed_at: string | null;
};

export type Truck = { id: string; name: string; plate: string | null; capacity_stops: number; color: string; notes: string | null; active: boolean };

export type DlSettings = {
  depot_name: string;
  depot_address: string;
  depot_lat: number | null;
  depot_lng: number | null;
  default_start: string;
  window_hours: number;
  avg_speed_mph: number;
  failure_reasons: string[];
  tracking_message: string;
};

export const statusLabel: Record<OrderStatus, string> = {
  unscheduled: 'Unscheduled',
  scheduled: 'Scheduled',
  en_route: 'On the way',
  arrived: 'Arrived',
  delivered: 'Delivered',
  failed: 'Not delivered',
  cancelled: 'Cancelled',
};
export const statusTone: Record<OrderStatus, string> = {
  unscheduled: 'b-badge-amber',
  scheduled: 'b-badge-blue',
  en_route: 'b-badge bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/15',
  arrived: 'b-badge bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/15',
  delivered: 'b-badge-green',
  failed: 'b-badge-red',
  cancelled: 'b-badge-gray',
};
export const serviceLabel: Record<ServiceType, string> = {
  delivery: 'Delivery',
  delivery_install: 'Delivery + install',
  white_glove: 'White glove',
  pickup: 'Pickup',
  return: 'Return',
  service_call: 'Service call',
};
export const routeStatusLabel: Record<RouteStatus, string> = { planned: 'Planned', dispatched: 'Dispatched', in_progress: 'On the road', completed: 'Completed' };
export const routeStatusTone: Record<RouteStatus, string> = { planned: 'b-badge-gray', dispatched: 'b-badge-blue', in_progress: 'b-badge-amber', completed: 'b-badge-green' };

/** Stops that still need the truck to go there. */
export const isOpenStop = (s: OrderStatus) => s === 'scheduled' || s === 'en_route' || s === 'arrived';
export const isDone = (s: OrderStatus) => s === 'delivered' || s === 'failed' || s === 'cancelled';

export const fullAddress = (o: Pick<Order, 'address1' | 'address2' | 'city' | 'state' | 'postal_code'>) =>
  [o.address1, o.address2, [o.city, [o.state, o.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(', ');

export const mapsLink = (o: Pick<Order, 'address1' | 'address2' | 'city' | 'state' | 'postal_code' | 'lat' | 'lng'>) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(o.lat != null && o.lng != null ? `${o.lat},${o.lng}` : fullAddress(o))}`;

/** "9:00 am" from "09:00:00". */
export function fmtClock(t: string | null | undefined) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
export const fmtWindow = (a: string | null, b: string | null) => (a && b ? `${fmtClock(a)} – ${fmtClock(b)}` : a ? `after ${fmtClock(a)}` : b ? `before ${fmtClock(b)}` : 'Any time');

// ------------------------------------------------------------------ routing --

type Pt = { lat: number; lng: number };
/** Straight-line miles between two points. */
export function miles(a: Pt, b: Pt) {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
/** Roads are longer than a straight line; ~1.3× is typical around Naples. */
export const roadMiles = (a: Pt, b: Pt) => miles(a, b) * 1.3;

/**
 * Best stop order from the depot: time windows first (earlier windows go earlier), then the
 * shortest drive — nearest-neighbour, improved with 2-opt. Stops without a map location go last.
 */
export function optimizeStops<T extends { id: string; lat: number | null; lng: number | null; window_start: string | null; priority?: string }>(depot: Pt | null, stops: T[]): T[] {
  const located = stops.filter((s): s is T & Pt => s.lat != null && s.lng != null);
  const rest = stops.filter((s) => s.lat == null || s.lng == null);
  if (located.length < 2 || !depot) return [...located, ...rest];
  // Group by window start (morning windows before afternoon ones), optimise each group.
  const groups = new Map<string, (T & Pt)[]>();
  for (const s of located) {
    const k = s.window_start ?? '99:99';
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const ordered: (T & Pt)[] = [];
  let from: Pt = depot;
  for (const k of [...groups.keys()].sort()) {
    let pending = groups.get(k)!;
    const path: (T & Pt)[] = [];
    while (pending.length) {
      let best = 0;
      for (let i = 1; i < pending.length; i++) if (miles(from, pending[i]) < miles(from, pending[best])) best = i;
      from = pending[best];
      path.push(pending[best]);
      pending = pending.filter((_, i) => i !== best);
    }
    // 2-opt within the group
    const start = ordered.length ? ordered[ordered.length - 1] : depot;
    const len = (p: Pt[]) => p.reduce((sum, q, i) => sum + miles(i ? p[i - 1] : start, q), 0);
    let improved = true;
    let route = path;
    for (let pass = 0; improved && pass < 30; pass++) {
      improved = false;
      for (let i = 0; i < route.length - 1; i++) {
        for (let j = i + 1; j < route.length; j++) {
          const next = [...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)];
          if (len(next) + 1e-9 < len(route)) {
            route = next;
            improved = true;
          }
        }
      }
    }
    ordered.push(...route);
    from = route[route.length - 1] ?? from;
  }
  return [...ordered, ...rest];
}

/**
 * Arrival time for each stop given the start time, the drive between stops and the time spent
 * at each one. Arriving before a window opens means waiting for it.
 */
export function planEtas<T extends { lat: number | null; lng: number | null; window_start: string | null; duration_min: number }>(
  depot: Pt | null,
  startMs: number,
  stops: T[],
  mph: number,
  windowStartMs: (s: T) => number | null,
): { eta: number[]; miles: number } {
  let t = startMs;
  let at: Pt | null = depot;
  let total = 0;
  const eta: number[] = [];
  for (const s of stops) {
    const here = s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : null;
    const d = at && here ? roadMiles(at, here) : 0;
    total += d;
    t += here && at ? (d / mph) * 3_600_000 : 15 * 60_000;
    const opens = windowStartMs(s);
    if (opens && t < opens) t = opens;
    eta.push(t);
    t += s.duration_min * 60_000;
    at = here ?? at;
  }
  if (at && depot) total += roadMiles(at, depot);
  return { eta, miles: Math.round(total * 10) / 10 };
}
