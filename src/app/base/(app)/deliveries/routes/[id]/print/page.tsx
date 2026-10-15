import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LogoMark } from '@/components/Logo';
import PrintButton from '@/components/base/PrintButton';
import { requireDeliveries } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { fmtDate, fmtTime } from '@/lib/base/time';
import { money } from '@/lib/crm/types';
import { getCrews } from '@/lib/deliveries/data';
import { fmtClock, fmtWindow, fullAddress, serviceLabel, type Order, type Route } from '@/lib/deliveries/types';

export const metadata: Metadata = { title: 'Route sheet' };

/** Printable route sheet / manifest for the crew (with signature lines as a paper backup). */
export default async function RouteSheetPage({ params }: PageProps<'/base/deliveries/routes/[id]/print'>) {
  await requireDeliveries({ dispatcher: true });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const route = must<(Route & { truck: { name: string; plate: string | null } | null }) | null>(await db().from('dl_routes').select('*, truck:dl_trucks(name, plate)').eq('id', id).maybeSingle(), 'load the route');
  if (!route) notFound();
  const [stopsRes, crews, { timezone: zone }] = await Promise.all([db().from('dl_orders').select('*, items:dl_order_items(description, quantity, assembly, position)').eq('route_id', id).neq('status', 'cancelled').order('stop_order'), getCrews(), getSettings()]);
  const stops = must<(Order & { items: { description: string; quantity: number; assembly: boolean; position: number }[] })[]>(stopsRes, 'load stops');

  return (
    <div data-theme="light" className="mx-auto max-w-[860px] text-ink">
      <div className="mb-4 flex items-center justify-between print:hidden"><p className="text-sm text-muted">Print for the truck, or save as PDF.</p><PrintButton /></div>
      <article className="rounded-2xl bg-white p-8 ring-1 ring-stone/60 print:rounded-none print:p-0 print:ring-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink/80 pb-4">
          <div className="flex items-center gap-3"><LogoMark className="h-10 w-10" /><div><p className="font-brand text-lg tracking-[0.06em]">BAY DESIGN STORE</p><p className="text-xs text-muted">Route sheet</p></div></div>
          <div className="text-right text-sm">
            <p className="text-xl font-semibold">{route.name}</p>
            <p>{fmtDate(route.route_date, zone, 'EEEE, MMMM d, yyyy')} · leave {fmtClock(route.start_time)}</p>
            <p className="text-muted">{route.truck ? `${route.truck.name}${route.truck.plate ? ` (${route.truck.plate})` : ''}` : 'No truck'} · Driver: {route.driver_id ? crews.names.get(route.driver_id) : '—'}{route.helper_id ? ` · Helper: ${crews.names.get(route.helper_id)}` : ''}</p>
            <p className="text-muted">{stops.length} stops{route.distance_miles ? ` · ~${Math.round(Number(route.distance_miles))} mi` : ''}</p>
          </div>
        </header>
        {route.notes && <p className="mt-3 rounded-lg bg-linen px-3 py-2 text-sm">{route.notes}</p>}
        <ol className="mt-4 space-y-4">
          {stops.map((s) => (
            <li key={s.id} className="break-inside-avoid rounded-xl border border-stone/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-base font-semibold">{s.stop_order}. {s.customer_name} <span className="text-xs font-normal text-muted">#{s.number} · {serviceLabel[s.service_type]}</span></p>
                <p className="text-right text-sm"><b>{s.eta ? `ETA ${fmtTime(s.eta, zone)}` : ''}</b><br /><span className="text-muted">{fmtWindow(s.window_start, s.window_end)}</span></p>
              </div>
              <p className="text-sm">{fullAddress(s)}{s.phone ? ` · ${s.phone}` : ''}</p>
              {s.instructions && <p className="mt-1 text-sm font-medium">⚠ {s.instructions}</p>}
              {Number(s.balance_due) > 0 && <p className="mt-1 text-sm font-semibold">Collect {money(s.balance_due, true)}</p>}
              <ul className="mt-2 text-sm">{s.items.sort((a, b) => a.position - b.position).map((i, n) => <li key={n}>☐ {i.quantity}× {i.description}{i.assembly ? ' (assemble)' : ''}</li>)}</ul>
              <div className="mt-3 grid grid-cols-2 gap-6 text-xs text-muted"><div className="border-b border-ink/40 pb-5">Received by</div><div className="border-b border-ink/40 pb-5">Signature</div></div>
            </li>
          ))}
        </ol>
      </article>
    </div>
  );
}
