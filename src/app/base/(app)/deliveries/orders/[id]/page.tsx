import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Ban, CalendarClock, CheckCircle2, ExternalLink, KanbanSquare, LocateFixed, Mail, MapPin, MapPinOff, Navigation, Pencil, Phone, RotateCcw, Trash2, UserRound, Wrench } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import { SubmitButton } from '@/components/base/forms';
import { Card } from '@/components/base/ui';
import { CopyLink, OrderNoteForm } from '@/components/deliveries/Forms';
import FollowupForm from '@/components/deliveries/FollowupForm';
import OrderForm from '@/components/deliveries/OrderForm';
import RouteMap from '@/components/deliveries/RouteMap';
import { requireDeliveries } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { fmtDate, fmtTime } from '@/lib/base/time';
import { getCrews, getDepot, getDlSettings, orderFormOptions, siteOrigin } from '@/lib/deliveries/data';
import { followupLabel, followupTone, fmtWindow, fullAddress, mapsLink, serviceLabel, statusLabel, statusTone, type Order, type OrderItem, type OrderStatus } from '@/lib/deliveries/types';
import { money } from '@/lib/crm/types';
import { deleteOrder, relocateOrder, setOrderStatus } from '../actions';

export const metadata: Metadata = { title: 'Delivery order' };

function StatusBtn({ id, status, children, className = 'b-btn-ghost b-btn-sm', confirm }: { id: string; status: string; children: React.ReactNode; className?: string; confirm?: string }) {
  return (
    <form action={setOrderStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton className={className} confirm={confirm}>{children}</SubmitButton>
    </form>
  );
}

export default async function OrderPage({ params }: PageProps<'/base/deliveries/orders/[id]'>) {
  await requireDeliveries({ dispatcher: true });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const order = must<(Order & { route: { id: string; name: string; driver_id: string | null; route_date: string } | null }) | null>(
    await db().from('dl_orders').select('*, route:dl_routes(id, name, driver_id, route_date)').eq('id', id).maybeSingle(),
    'load the order',
  );
  if (!order) notFound();
  const [itemsRes, eventsRes, proofsRes, opts, settings, crews, depot, { timezone: zone }, origin, deal] = await Promise.all([
    db().from('dl_order_items').select('*').eq('order_id', id).order('position'),
    db().from('dl_events').select('*').eq('order_id', id).order('created_at', { ascending: false }),
    db().from('dl_proofs').select('id, kind, data_url, created_at').eq('order_id', id).order('created_at'),
    orderFormOptions(),
    getDlSettings(),
    getCrews(),
    getDepot(),
    getSettings(),
    siteOrigin(),
    order.deal_id ? db().from('crm_deals').select('id, title').eq('id', order.deal_id).maybeSingle().then((r) => r.data) : null,
  ]);
  const items = must<(OrderItem & { id: string })[]>(itemsRes, 'load items');
  const events = must<{ id: number; status: string; note: string | null; actor_label: string | null; created_at: string; lat: number | null; lng: number | null }[]>(eventsRes, 'load history');
  const proofs = must<{ id: string; kind: 'signature' | 'photo'; data_url: string; created_at: string }[]>(proofsRes, 'load proof of delivery');
  const trackUrl = `${origin}/track/${order.tracking_token}`;
  const status = order.status as OrderStatus;
  const mailBody = `Hi ${order.customer_name.split(' ')[0]},\n\nYour Bay Design Store ${serviceLabel[order.service_type].toLowerCase()} is scheduled${order.scheduled_date ? ` for ${fmtDate(order.scheduled_date, zone, 'EEEE, MMMM d')}` : ''}${order.window_start ? `, between ${fmtWindow(order.window_start, order.window_end)}` : ''}.\n\nFollow it live here: ${trackUrl}\n\nThank you,\nBay Design Store\n(239) 649-0906`;

  return (
    <>
      <Link href="/base/deliveries/orders" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> Orders</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-muted">Order #{order.number}</p>
          <h1 className="text-[1.9rem] font-semibold leading-tight tracking-tight">{order.customer_name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className={statusTone[status]}>{statusLabel[status]}</span>
            <span>{serviceLabel[order.service_type]}</span>
            {order.priority === 'high' && <span className="b-badge-red">High priority</span>}
            {order.scheduled_date && <span className="inline-flex items-center gap-1"><CalendarClock size={13} /> {fmtDate(order.scheduled_date, zone, 'EEE, MMM d')} · {fmtWindow(order.window_start, order.window_end)}</span>}
            {order.eta && <span>ETA {fmtTime(order.eta, zone)}</span>}
            {order.route && <Link href={`/base/deliveries/dispatch?date=${order.route.route_date}`} className="hover:text-brass-dark">{order.route.name} · stop {order.stop_order}</Link>}
          </p>
          {order.failed_reason && <p className="mt-2 text-sm text-red-700">Not delivered: {order.failed_reason}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Dialog trigger={<><Pencil size={14} /> Edit</>} triggerClassName="b-btn-ghost" title={`Edit order #${order.number}`} wide>
            <OrderForm order={order} items={items} contacts={opts.contacts} windowHours={settings.window_hours} />
          </Dialog>
          {(status === 'failed' || status === 'cancelled') && <StatusBtn id={order.id} status={order.scheduled_date ? 'scheduled' : 'unscheduled'} className="b-btn-brass"><RotateCcw size={14} /> Reschedule</StatusBtn>}
          {(status === 'scheduled' || status === 'en_route' || status === 'arrived') && <StatusBtn id={order.id} status="delivered" confirm="Mark as delivered without the driver’s proof?"><CheckCircle2 size={14} /> Mark delivered</StatusBtn>}
          {status !== 'cancelled' && status !== 'delivered' && <StatusBtn id={order.id} status="cancelled" confirm="Cancel this order? It comes off its route."><Ban size={14} /> Cancel</StatusBtn>}
          <form action={deleteOrder}>
            <input type="hidden" name="id" value={order.id} />
            <SubmitButton className="b-btn-quiet" confirm="Delete this order and its history?"><Trash2 size={14} /></SubmitButton>
          </form>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          {order.lat != null && order.lng != null ? (
            <RouteMap height={260} depot={depot} routes={[]} loose={[{ id: order.id, lat: order.lat, lng: order.lng, label: '', title: order.customer_name, detail: fullAddress(order) }]} />
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <MapPinOff size={16} /> This address wasn’t found on the map, so it can’t be placed on a route automatically. Check the address, then:
              <form action={relocateOrder}><input type="hidden" name="id" value={order.id} /><SubmitButton className="b-btn-ghost b-btn-sm"><LocateFixed size={13} /> Find it again</SubmitButton></form>
            </div>
          )}
          <Card title={`Items (${items.reduce((s, i) => s + i.quantity, 0)})`} pad={false}>
            {items.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">No items listed.</p>
            ) : (
              <ul className="divide-y divide-stone/50">
                {items.map((it) => (
                  <li key={it.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <span className="w-8 font-semibold">{it.quantity}×</span>
                    <span className="flex-1">{it.description}{it.sku && <span className="ml-2 font-mono text-xs text-muted">{it.sku}</span>}</span>
                    {it.assembly && <span className="b-badge-gray"><Wrench size={10} /> Assembly</span>}
                    {it.delivered && <span className="b-badge-green">Delivered</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {(proofs.length > 0 || order.recipient_name || order.driver_notes) && (
            <Card title="Proof of delivery">
              {order.recipient_name && <p className="mb-2 text-sm">Received by <b>{order.recipient_name}</b>{order.completed_at ? ` · ${fmtDate(new Date(order.completed_at), zone, 'MMM d')} ${fmtTime(order.completed_at, zone)}` : ''}</p>}
              {order.driver_notes && <p className="mb-3 whitespace-pre-wrap rounded-xl bg-linen px-3 py-2 text-sm">{order.driver_notes}</p>}
              <div className="flex flex-wrap gap-3">
                {proofs.map((p) => (
                  <a key={p.id} href={p.data_url} target="_blank" rel="noreferrer" className="block">
                    <img src={p.data_url} alt={p.kind === 'signature' ? 'Customer signature' : 'Delivery photo'} className={`rounded-xl ring-1 ring-stone ${p.kind === 'signature' ? 'h-24 bg-white p-1' : 'h-32 w-32 object-cover'}`} />
                  </a>
                ))}
              </div>
            </Card>
          )}
          <Card title="History">
            <div className="mb-4"><OrderNoteForm id={order.id} /></div>
            <ol className="relative space-y-3 border-l border-stone/70 pl-5">
              {events.map((e) => (
                <li key={e.id} className="relative text-sm">
                  <span className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full bg-brass ring-4 ring-surface" />
                  <p>
                    <b className="font-semibold">{e.status === 'note' ? 'Note' : e.status === 'feedback' ? 'Customer rating' : e.status === 'created' ? 'Order created' : e.status === 'updated' ? 'Updated' : (statusLabel[e.status as OrderStatus] ?? e.status)}</b>
                    {e.note && <span className="text-ink/80"> — {e.note}</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {e.actor_label ?? 'System'} · {fmtDate(new Date(e.created_at), zone, 'MMM d, yyyy')} {fmtTime(e.created_at, zone)}
                    {e.lat != null && <> · <a href={`https://www.google.com/maps?q=${e.lat},${e.lng}`} target="_blank" rel="noreferrer" className="hover:text-brass-dark">location</a></>}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <aside className="space-y-5">
          <Card title="Customer">
            <div className="space-y-2.5 text-sm">
              <p className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 flex-none text-muted" /> {fullAddress(order)}</p>
              <a href={mapsLink(order)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-brass-dark"><Navigation size={14} /> Directions</a>
              {order.phone && <a href={`tel:${order.phone}`} className="flex items-center gap-2 hover:text-brass-dark"><Phone size={14} className="text-muted" /> {order.phone}</a>}
              {order.email && <a href={`mailto:${order.email}`} className="flex items-center gap-2 hover:text-brass-dark"><Mail size={14} className="text-muted" /> {order.email}</a>}
              {order.contact_id && <Link href={`/base/crm/contacts/${order.contact_id}`} className="flex items-center gap-2 hover:text-brass-dark"><UserRound size={14} className="text-muted" /> Customer in Workflow</Link>}
              {deal && <Link href={`/base/crm/deals/${deal.id}`} className="flex items-center gap-2 hover:text-brass-dark"><KanbanSquare size={14} className="text-muted" /> {deal.title}</Link>}
              {Number(order.balance_due) > 0 && <p className="rounded-xl bg-amber-50 px-3 py-2 font-semibold text-amber-800">Collect {money(order.balance_due, true)} on delivery</p>}
            </div>
          </Card>
          <Card title="Customer tracking">
            <p className="mb-3 text-sm text-muted">A live page showing the date, window, arrival time and where the truck is in its stops. No sign-in needed.</p>
            <div className="flex flex-wrap gap-2">
              <CopyLink url={trackUrl} />
              <a href={trackUrl} target="_blank" rel="noreferrer" className="b-btn-ghost b-btn-sm"><ExternalLink size={13} /> Open</a>
              {order.email && <a href={`mailto:${order.email}?subject=${encodeURIComponent('Your Bay Design Store delivery')}&body=${encodeURIComponent(mailBody)}`} className="b-btn-brass b-btn-sm"><Mail size={13} /> Email it</a>}
            </div>
          </Card>
          {(status === 'delivered' || status === 'failed') && (
            <Card title="Post-delivery">
              {order.rating ? (
                <div className="mb-3">
                  <p className="text-lg text-amber-500">{'★'.repeat(order.rating)}<span className="text-stone">{'★'.repeat(5 - order.rating)}</span></p>
                  {order.feedback && <p className="mt-1 text-sm">“{order.feedback}”</p>}
                  {order.feedback_at && <p className="text-xs text-muted">Customer rating · {fmtDate(new Date(order.feedback_at), zone, 'MMM d')}</p>}
                </div>
              ) : (
                <p className="mb-3 text-sm text-muted">{status === 'delivered' ? 'The customer can rate the delivery on their tracking page.' : 'Call the customer to set a new date.'}</p>
              )}
              <p className="mb-2 flex items-center gap-2 text-sm">Follow-up: <span className={followupTone[order.followup_status]}>{followupLabel[order.followup_status]}</span></p>
              <FollowupForm id={order.id} status={order.followup_status} note={order.followup_note} />
            </Card>
          )}
          <Card title="Driver instructions">
            <p className="whitespace-pre-wrap text-sm">{order.instructions || <span className="text-muted">None.</span>}</p>
            {order.route?.driver_id && <p className="mt-3 text-xs text-muted">Driver: {crews.names.get(order.route.driver_id)}</p>}
          </Card>
          {order.internal_notes && <Card title="Internal notes"><p className="whitespace-pre-wrap text-sm">{order.internal_notes}</p></Card>}
        </aside>
      </div>
    </>
  );
}
