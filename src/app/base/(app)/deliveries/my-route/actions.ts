'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { requireDeliveries, type Viewer } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { logCrm } from '@/lib/crm/data';
import { logEvent } from '@/lib/deliveries/data';

const uuid = z.string().uuid();
const coord = (fd: FormData) => {
  const lat = Number(fd.get('lat'));
  const lng = Number(fd.get('lng'));
  return fd.get('lat') && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
};
const refresh = () => revalidatePath('/base', 'layout');

/** The driver or helper on the route — or a dispatcher/admin acting for them. */
async function canWorkRoute(viewer: Viewer, routeId: string | null) {
  if (viewer.deliveries === 'dispatcher') return true;
  if (!routeId || !viewer.employeeId) return false;
  const { data } = await db().from('dl_routes').select('driver_id, helper_id').eq('id', routeId).maybeSingle();
  return data?.driver_id === viewer.employeeId || data?.helper_id === viewer.employeeId;
}

async function finishRouteIfDone(routeId: string) {
  const { count } = await db().from('dl_orders').select('id', { count: 'exact', head: true }).eq('route_id', routeId).in('status', ['scheduled', 'en_route', 'arrived']);
  if (!count) await db().from('dl_routes').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', routeId).neq('status', 'completed');
}

export async function startRoute(fd: FormData) {
  const viewer = await requireDeliveries();
  const id = uuid.safeParse(fd.get('id'));
  if (!id.success || !(await canWorkRoute(viewer, id.data))) return;
  await db().from('dl_routes').update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('id', id.data).in('status', ['planned', 'dispatched']);
  refresh();
}

/** On my way / Arrived for one stop. "On my way" is what the customer's tracking page shows. */
export async function stopProgress(fd: FormData) {
  const viewer = await requireDeliveries();
  const id = uuid.safeParse(fd.get('id'));
  const status = fd.get('status') === 'arrived' ? 'arrived' : 'en_route';
  if (!id.success) return;
  const { data: o } = await db().from('dl_orders').select('id, number, route_id, status').eq('id', id.data).maybeSingle();
  if (!o || !(await canWorkRoute(viewer, o.route_id)) || !['scheduled', 'en_route', 'arrived'].includes(o.status)) return;
  await db().from('dl_orders').update({ status, ...(status === 'arrived' ? { arrived_at: new Date().toISOString() } : {}) }).eq('id', o.id);
  if (o.route_id) await db().from('dl_routes').update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('id', o.route_id).in('status', ['planned', 'dispatched']);
  await logEvent(viewer, o, status, null, coord(fd));
  refresh();
}

/** Delivered, with proof: who received it, a signature and/or photos, notes. */
export async function completeStop(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireDeliveries();
  const id = uuid.safeParse(fd.get('id'));
  if (!id.success) return fail('Stop not found.');
  const { data: o } = await db().from('dl_orders').select('id, number, route_id, status, deal_id, contact_id').eq('id', id.data).maybeSingle();
  if (!o || !(await canWorkRoute(viewer, o.route_id))) return fail('This stop isn’t on your route.');
  if (o.status === 'delivered') return done('Already marked delivered.');
  const recipient = String(fd.get('recipient_name') ?? '').trim().slice(0, 120);
  const notes = String(fd.get('driver_notes') ?? '').trim().slice(0, 2000);
  const signature = String(fd.get('signature') ?? '');
  const photos = fd.getAll('photo').map(String).filter((p) => p.startsWith('data:image/'));
  if (!recipient && !signature.startsWith('data:image/')) return fail('Add who received it, or get a signature.');
  const proofs = [
    ...(signature.startsWith('data:image/') ? [{ kind: 'signature', data_url: signature }] : []),
    ...photos.slice(0, 4).map((p) => ({ kind: 'photo', data_url: p })),
  ].filter((p) => p.data_url.length <= 1_500_000);
  if (proofs.length) {
    const { error } = await db().from('dl_proofs').insert(proofs.map((p) => ({ ...p, order_id: o.id, created_by: viewer.employeeId })));
    if (error) return fail('Couldn’t save the signature/photos — try a smaller photo.');
  }
  const deliveredItems = fd.getAll('item').map(String).filter((x) => uuid.safeParse(x).success);
  if (deliveredItems.length) await db().from('dl_order_items').update({ delivered: true }).in('id', deliveredItems).eq('order_id', o.id);
  await db()
    .from('dl_orders')
    .update({ status: 'delivered', completed_at: new Date().toISOString(), recipient_name: recipient || null, driver_notes: notes || null, failed_reason: null })
    .eq('id', o.id);
  await logEvent(viewer, o, 'delivered', recipient ? `Received by ${recipient}` : null, coord(fd));
  if (o.deal_id || o.contact_id) await logCrm(viewer, `delivered order #${o.number}${recipient ? ` — received by ${recipient}` : ''}`, { deal_id: o.deal_id, contact_id: o.contact_id }, 'crm.delivery');
  if (o.route_id) await finishRouteIfDone(o.route_id);
  refresh();
  return done('Delivered ✔');
}

export async function failStop(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireDeliveries();
  const id = uuid.safeParse(fd.get('id'));
  const reason = String(fd.get('reason') ?? '').trim().slice(0, 200);
  if (!id.success) return fail('Stop not found.');
  if (!reason) return fail('Choose what went wrong.');
  const { data: o } = await db().from('dl_orders').select('id, number, route_id, deal_id, contact_id').eq('id', id.data).maybeSingle();
  if (!o || !(await canWorkRoute(viewer, o.route_id))) return fail('This stop isn’t on your route.');
  const notes = String(fd.get('driver_notes') ?? '').trim().slice(0, 2000);
  const photos = fd.getAll('photo').map(String).filter((p) => p.startsWith('data:image/') && p.length <= 1_500_000).slice(0, 4);
  if (photos.length) await db().from('dl_proofs').insert(photos.map((p) => ({ kind: 'photo', data_url: p, order_id: o.id, created_by: viewer.employeeId })));
  await db().from('dl_orders').update({ status: 'failed', failed_reason: reason, driver_notes: notes || null, completed_at: new Date().toISOString() }).eq('id', o.id);
  await logEvent(viewer, o, 'failed', reason, coord(fd));
  if (o.deal_id || o.contact_id) await logCrm(viewer, `couldn’t deliver order #${o.number} — ${reason}`, { deal_id: o.deal_id, contact_id: o.contact_id }, 'crm.delivery');
  if (o.route_id) await finishRouteIfDone(o.route_id);
  refresh();
  return done('Marked as not delivered. The dispatcher will reschedule it.');
}
