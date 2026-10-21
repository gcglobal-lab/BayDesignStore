import type { Metadata } from 'next';
import Link from 'next/link';
import { MapPinOff, PackageCheck, Plus, Search } from 'lucide-react';
import AutoRefresh from '@/components/base/AutoRefresh';
import { Card, EmptyState, PageHeader } from '@/components/base/ui';
import { requireDeliveries } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { fmtDate, fmtTime, todayYmd } from '@/lib/base/time';
import { searchTerm } from '@/lib/crm/data';
import { fmtWindow, serviceLabel, statusLabel, statusTone, type Order, type OrderStatus } from '@/lib/deliveries/types';

export const metadata: Metadata = { title: 'Delivery orders' };

const TABS: { key: string; label: string }[] = [
  { key: 'unscheduled', label: 'To schedule' },
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'problems', label: 'Not delivered' },
  { key: 'done', label: 'Delivered' },
  { key: 'all', label: 'All' },
];

export default async function OrdersPage({ searchParams }: PageProps<'/base/deliveries/orders'>) {
  await requireDeliveries({ dispatcher: true });
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? 'upcoming';
  const q = searchTerm(sp.q);
  const { timezone: zone } = await getSettings();
  const today = todayYmd(zone);

  let query = db().from('dl_orders').select('*, items:dl_order_items(id), route:dl_routes(name)').limit(500);
  if (tab === 'unscheduled') query = query.eq('status', 'unscheduled').order('created_at');
  else if (tab === 'today') query = query.eq('scheduled_date', today).neq('status', 'cancelled').order('stop_order', { nullsFirst: false });
  else if (tab === 'upcoming') query = query.gte('scheduled_date', today).in('status', ['scheduled', 'en_route', 'arrived']).order('scheduled_date').order('stop_order', { nullsFirst: false });
  else if (tab === 'problems') query = query.eq('status', 'failed').order('completed_at', { ascending: false });
  else if (tab === 'done') query = query.eq('status', 'delivered').order('completed_at', { ascending: false });
  else query = query.order('created_at', { ascending: false });
  if (q) query = query.or(`customer_name.ilike.%${q}%,address1.ilike.%${q}%,city.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
  // The list and the tab counts are fetched at the same time.
  const [ordersRes, countPairs] = await Promise.all([
    query,
    Promise.all(
      (
        [
          ['unscheduled', db().from('dl_orders').select('id', { count: 'exact', head: true }).eq('status', 'unscheduled')],
          ['today', db().from('dl_orders').select('id', { count: 'exact', head: true }).eq('scheduled_date', today).neq('status', 'cancelled')],
          ['problems', db().from('dl_orders').select('id', { count: 'exact', head: true }).eq('status', 'failed')],
        ] as const
      ).map(async ([k, p]) => [k, (await p).count ?? 0] as const),
    ),
  ]);
  const orders = must<(Order & { items: { id: string }[]; route: { name: string } | null })[]>(ordersRes, 'load orders');
  const counts = Object.fromEntries(countPairs) as Record<string, number>;

  return (
    <>
      <AutoRefresh seconds={60} />
      <PageHeader plain title="Orders" description="Every delivery, pickup, return and service call — schedule them, put them on routes, and track them to the door." actions={<Link href="/base/deliveries/orders/new" className="b-btn-brass"><Plus size={15} /> New order</Link>} />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="b-segment flex-wrap">
          {TABS.map((t) => (
            <Link key={t.key} href={`/base/deliveries/orders?tab=${t.key}`} aria-current={t.key === tab ? 'page' : undefined}>
              {t.label}
              {counts[t.key] !== undefined && <span className={`ml-1.5 rounded-full px-1.5 py-px text-[0.68rem] ${t.key === 'problems' && counts.problems ? 'bg-red-500 text-white' : t.key === 'unscheduled' && counts.unscheduled ? 'bg-amber-500 text-white' : 'bg-sand text-muted'}`}>{counts[t.key]}</span>}
            </Link>
          ))}
        </div>
        <form className="flex flex-1 gap-2" action="/base/deliveries/orders">
          <input type="hidden" name="tab" value={tab} />
          <label className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={q} placeholder="Search customer, address, phone…" className="b-input !py-2 pl-9" />
          </label>
          <button className="b-btn-ghost" type="submit">Search</button>
        </form>
      </div>
      <Card pad={false}>
        {orders.length === 0 ? (
          <EmptyState icon={<PackageCheck size={20} />} title="No orders here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="b-table">
              <thead><tr><th>#</th><th>Customer</th><th>Service</th><th>Date & window</th><th>Route</th><th>Status</th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="font-mono text-xs text-muted">{o.number}</td>
                    <td>
                      <Link href={`/base/deliveries/orders/${o.id}`} className="font-medium hover:text-brass-dark">{o.customer_name}</Link>
                      <p className="flex items-center gap-1 text-xs text-muted">{o.lat == null && <MapPinOff size={11} className="text-amber-600" aria-label="Not found on the map" />}{o.address1}{o.city ? `, ${o.city}` : ''}</p>
                    </td>
                    <td className="text-muted">{serviceLabel[o.service_type]} · {o.items.length} item{o.items.length === 1 ? '' : 's'}</td>
                    <td>
                      {o.scheduled_date ? <>{fmtDate(o.scheduled_date, zone, 'EEE, MMM d')}<p className="text-xs text-muted">{fmtWindow(o.window_start, o.window_end)}{o.eta ? ` · ETA ${fmtTime(o.eta, zone)}` : ''}</p></> : <span className="text-amber-700">Not scheduled</span>}
                    </td>
                    <td>{o.route ? <span>{o.route.name}{o.stop_order ? <span className="text-xs text-muted"> · stop {o.stop_order}</span> : null}</span> : <span className="text-muted">—</span>}</td>
                    <td><span className={statusTone[o.status as OrderStatus]}>{statusLabel[o.status as OrderStatus]}</span>{o.failed_reason && <p className="text-xs text-red-700">{o.failed_reason}</p>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
