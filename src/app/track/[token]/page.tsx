import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CheckCircle2, Clock, MapPin, PackageX, Phone, Truck } from 'lucide-react';
import { LogoMark } from '@/components/Logo';
import AutoRefresh from '@/components/base/AutoRefresh';
import { db } from '@/lib/base/db';
import { isDbConfigured } from '@/lib/base/env';
import { getSettings } from '@/lib/base/settings';
import { fmtDate, fmtTime } from '@/lib/base/time';
import { getDlSettings } from '@/lib/deliveries/data';
import { fmtWindow, serviceLabel, type OrderStatus, type ServiceType } from '@/lib/deliveries/types';

export const metadata: Metadata = { title: 'Track your delivery | Bay Design Store', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'en_route', label: 'On the way' },
  { key: 'arrived', label: 'Arrived' },
  { key: 'delivered', label: 'Delivered' },
];

/**
 * The customer's tracking page (link from the dispatcher). Public, but only reachable with the
 * order's random 32-character token, and it shows only what the customer needs: no names of
 * other customers, no addresses of other stops.
 */
export default async function TrackPage({ params }: PageProps<'/track/[token]'>) {
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token) || !isDbConfigured()) notFound();
  const { data: o } = await db()
    .from('dl_orders')
    .select('id, number, status, service_type, customer_name, city, scheduled_date, window_start, window_end, eta, route_id, stop_order, completed_at, recipient_name')
    .eq('tracking_token', token)
    .maybeSingle();
  if (!o) notFound();
  const [{ timezone: zone }, settings] = await Promise.all([getSettings(), getDlSettings()]);
  let ahead: number | null = null;
  if (o.route_id && o.stop_order && (o.status === 'scheduled' || o.status === 'en_route')) {
    const { count } = await db().from('dl_orders').select('id', { count: 'exact', head: true }).eq('route_id', o.route_id).lt('stop_order', o.stop_order).in('status', ['scheduled', 'en_route', 'arrived']);
    ahead = count ?? 0;
  }
  const status = o.status as OrderStatus;
  const stepIdx = STEPS.findIndex((s) => s.key === status);

  return (
    <main className="min-h-screen bg-[#F3F4FB] px-4 py-10 text-[#17173A]">
      <AutoRefresh seconds={60} />
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark className="h-10 w-10" />
          <div><p className="font-brand text-lg tracking-[0.06em]">BAY DESIGN STORE</p><p className="text-xs text-[#646A87]">Delivery tracking</p></div>
        </div>
        <section className="rounded-3xl bg-white p-6 shadow-[0_20px_50px_-30px_rgba(23,23,58,0.45)] ring-1 ring-[#DDE0EF]">
          <p className="text-sm text-[#646A87]">Hi {o.customer_name.split(' ')[0]} — order #{o.number} · {serviceLabel[o.service_type as ServiceType]}</p>
          {status === 'delivered' ? (
            <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold text-emerald-700"><CheckCircle2 /> Delivered</h1>
          ) : status === 'failed' ? (
            <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold text-red-700"><PackageX /> We couldn’t complete it today</h1>
          ) : status === 'cancelled' ? (
            <h1 className="mt-2 text-2xl font-semibold">This delivery was cancelled</h1>
          ) : status === 'unscheduled' || !o.scheduled_date ? (
            <h1 className="mt-2 text-2xl font-semibold">We’ll be in touch to schedule it</h1>
          ) : (
            <>
              <h1 className="mt-2 text-2xl font-semibold">{status === 'en_route' ? 'Our team is on the way!' : status === 'arrived' ? 'Our team has arrived' : fmtDate(o.scheduled_date, zone, 'EEEE, MMMM d')}</h1>
              <p className="mt-1 flex items-center gap-2 text-[#646A87]"><Clock size={15} /> {fmtWindow(o.window_start, o.window_end)}{o.eta && status !== 'arrived' ? ` · estimated arrival ${fmtTime(o.eta, zone)}` : ''}</p>
              {ahead !== null && <p className="mt-1 flex items-center gap-2 text-[#646A87]"><Truck size={15} /> {ahead === 0 ? 'You’re the next stop.' : `${ahead} stop${ahead === 1 ? '' : 's'} before yours.`}</p>}
            </>
          )}
          {status === 'delivered' && o.completed_at && <p className="mt-1 text-[#646A87]">{fmtDate(new Date(o.completed_at), zone, 'EEE, MMM d')} at {fmtTime(o.completed_at, zone)}{o.recipient_name ? ` · received by ${o.recipient_name}` : ''}</p>}
          {status === 'failed' && <p className="mt-1 text-[#646A87]">We’ll call you to set a new date. You can also reach us at (239) 649-0906.</p>}

          {stepIdx >= 0 && (
            <ol className="mt-6 grid grid-cols-4 gap-1">
              {STEPS.map((s, i) => (
                <li key={s.key} className="text-center">
                  <div className={`h-1.5 rounded-full ${i <= stepIdx ? 'bg-gradient-to-r from-[#6366F1] to-[#7C3AED]' : 'bg-[#E8EAFA]'}`} />
                  <p className={`mt-1.5 text-[0.7rem] font-semibold ${i <= stepIdx ? 'text-[#4F46E5]' : 'text-[#9aa0c2]'}`}>{s.label}</p>
                </li>
              ))}
            </ol>
          )}
          {settings.tracking_message && status !== 'delivered' && <p className="mt-6 rounded-2xl bg-[#F3F4FB] px-4 py-3 text-sm">{settings.tracking_message}</p>}
          {o.city && <p className="mt-4 flex items-center gap-2 text-xs text-[#646A87]"><MapPin size={13} /> Delivering to {o.city}</p>}
        </section>
        <a href="tel:+12396490906" className="mt-5 flex items-center justify-center gap-2 rounded-full bg-[#17173A] px-5 py-3 text-sm font-semibold text-white"><Phone size={15} /> Call Bay Design Store</a>
        <p className="mt-4 text-center text-xs text-[#646A87]">This page updates by itself.</p>
      </div>
    </main>
  );
}
