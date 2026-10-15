'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireDeliveries } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { logCrm } from '@/lib/crm/data';
import { geocode, logEvent, recomputeRoute } from '@/lib/deliveries/data';
import type { Order } from '@/lib/deliveries/types';

const optText = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().catch(null);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().catch(null);

const orderSchema = z.object({
  customer_name: z.string().trim().min(1, 'Enter the customer’s name.').max(160),
  phone: optText(40),
  email: optText(254),
  address1: z.string().trim().min(1, 'Enter the delivery address.').max(200),
  address2: optText(200),
  city: optText(80),
  state: optText(40),
  postal_code: optText(20),
  service_type: z.enum(['delivery', 'delivery_install', 'white_glove', 'pickup', 'return', 'service_call']).catch('delivery'),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  window_start: time,
  window_end: time,
  duration_min: z.coerce.number().int().min(5).max(480).catch(30),
  priority: z.enum(['low', 'normal', 'high']).catch('normal'),
  instructions: optText(2000),
  internal_notes: optText(2000),
  balance_due: z.coerce.number().min(0).max(9_999_999).catch(0),
  contact_id: z.string().uuid().nullable().catch(null),
  deal_id: z.string().uuid().nullable().catch(null),
  items: z
    .array(z.object({ description: z.string().trim().min(1).max(200), sku: optText(60), quantity: z.coerce.number().int().min(1).max(999).catch(1), assembly: z.boolean().catch(false), notes: optText(500) }))
    .max(100),
});

function parse(fd: FormData) {
  let items: unknown = [];
  try {
    items = JSON.parse(String(fd.get('items') ?? '[]'));
  } catch {
    items = [];
  }
  return orderSchema.safeParse({
    ...Object.fromEntries(['customer_name', 'phone', 'email', 'address1', 'address2', 'city', 'state', 'postal_code', 'service_type', 'priority', 'instructions', 'internal_notes'].map((k) => [k, fd.get(k) ?? ''])),
    scheduled_date: fd.get('scheduled_date') || null,
    window_start: fd.get('window_start') || null,
    window_end: fd.get('window_end') || null,
    duration_min: fd.get('duration_min') || 30,
    balance_due: fd.get('balance_due') || 0,
    contact_id: fd.get('contact_id') || null,
    deal_id: fd.get('deal_id') || null,
    items,
  });
}

const refresh = () => revalidatePath('/base', 'layout');

async function saveItems(orderId: string, items: z.infer<typeof orderSchema>['items']) {
  await db().from('dl_order_items').delete().eq('order_id', orderId);
  if (items.length) await db().from('dl_order_items').insert(items.map((it, i) => ({ ...it, order_id: orderId, position: i })));
}

export async function createOrder(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireDeliveries({ dispatcher: true });
  const parsed = parse(fd);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the order.');
  const { items, ...v } = parsed.data;
  if (v.window_start && v.window_end && v.window_end <= v.window_start) return fail('The time window must end after it starts.');
  const where = await geocode(v);
  const { data, error } = await db()
    .from('dl_orders')
    .insert({ ...v, lat: where?.lat ?? null, lng: where?.lng ?? null, status: v.scheduled_date ? 'scheduled' : 'unscheduled', created_by: viewer.employeeId })
    .select('id, number')
    .single();
  if (error || !data) return fail('Couldn’t create the order.');
  await saveItems(data.id, items);
  await logEvent(viewer, data, 'created', where ? null : 'Address not found on the map — check it before routing.');
  if (v.deal_id || v.contact_id) await logCrm(viewer, `created delivery order #${data.number}${v.scheduled_date ? ` for ${v.scheduled_date}` : ''}`, { deal_id: v.deal_id, contact_id: v.contact_id }, 'crm.delivery');
  refresh();
  redirect(`/base/deliveries/orders/${data.id}`);
}

export async function updateOrder(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireDeliveries({ dispatcher: true });
  const id = z.string().uuid().safeParse(fd.get('id'));
  const parsed = parse(fd);
  if (!id.success) return fail('Order not found.');
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the order.');
  const { data: before } = await db().from('dl_orders').select('*').eq('id', id.data).maybeSingle<Order>();
  if (!before) return fail('Order not found.');
  const { items, ...v } = parsed.data;
  if (v.window_start && v.window_end && v.window_end <= v.window_start) return fail('The time window must end after it starts.');
  const moved = before.address1 !== v.address1 || before.city !== v.city || before.postal_code !== v.postal_code || before.lat == null;
  const where = moved ? await geocode(v) : { lat: before.lat!, lng: before.lng! };
  const dateChanged = before.scheduled_date !== v.scheduled_date;
  const status = before.status === 'unscheduled' || before.status === 'scheduled' ? (v.scheduled_date ? 'scheduled' : 'unscheduled') : before.status;
  const { error } = await db()
    .from('dl_orders')
    .update({ ...v, lat: where?.lat ?? null, lng: where?.lng ?? null, status, ...(dateChanged ? { route_id: null, stop_order: null, eta: null } : {}) })
    .eq('id', id.data);
  if (error) return fail('Couldn’t save the order.');
  await saveItems(id.data, items);
  if (before.route_id) await recomputeRoute(before.route_id);
  await logEvent(viewer, before, 'updated', dateChanged ? `Rescheduled to ${v.scheduled_date ?? 'no date'}` : moved && !where ? 'Address not found on the map' : null);
  refresh();
  return done(dateChanged && before.route_id ? 'Saved — the new date took it off its route.' : 'Order saved.');
}

/** Dispatcher override of the status (e.g. delivered by phone confirmation, reschedule a failed one). */
export async function setOrderStatus(fd: FormData) {
  const viewer = await requireDeliveries({ dispatcher: true });
  const parsed = z
    .object({ id: z.string().uuid(), status: z.enum(['unscheduled', 'scheduled', 'delivered', 'failed', 'cancelled']), note: z.string().trim().max(300).optional() })
    .safeParse({ id: fd.get('id'), status: fd.get('status'), note: fd.get('note') || undefined });
  if (!parsed.success) return;
  const { id, status, note } = parsed.data;
  const { data: o } = await db().from('dl_orders').select('id, number, route_id, scheduled_date').eq('id', id).maybeSingle();
  if (!o) return;
  const reset = status === 'unscheduled' || status === 'cancelled';
  await db()
    .from('dl_orders')
    .update({
      status: status === 'scheduled' && !o.scheduled_date ? 'unscheduled' : status,
      ...(reset ? { route_id: null, stop_order: null, eta: null, ...(status === 'unscheduled' ? { scheduled_date: null } : {}) } : {}),
      ...(status === 'delivered' || status === 'failed' ? { completed_at: new Date().toISOString(), failed_reason: status === 'failed' ? (note ?? 'Other') : null } : {}),
      ...(status === 'scheduled' ? { failed_reason: null, completed_at: null, arrived_at: null } : {}),
    })
    .eq('id', id);
  if (reset && o.route_id) await recomputeRoute(o.route_id);
  await logEvent(viewer, o, status, note ?? null);
  refresh();
}

/** Try finding the address on the map again (after fixing it, or if the lookup was down). */
export async function relocateOrder(fd: FormData) {
  await requireDeliveries({ dispatcher: true });
  const id = z.string().uuid().safeParse(fd.get('id'));
  if (!id.success) return;
  const { data: o } = await db().from('dl_orders').select('address1, city, state, postal_code, route_id').eq('id', id.data).maybeSingle();
  if (!o) return;
  const where = await geocode(o);
  if (where) await db().from('dl_orders').update(where).eq('id', id.data);
  if (where && o.route_id) await recomputeRoute(o.route_id);
  refresh();
}

export async function addOrderNote(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireDeliveries();
  const id = z.string().uuid().safeParse(fd.get('id'));
  const note = z.string().trim().min(1).max(500).safeParse(fd.get('note'));
  if (!id.success || !note.success) return fail('Write a note first.');
  const { data: o } = await db().from('dl_orders').select('id, number').eq('id', id.data).maybeSingle();
  if (!o) return fail('Order not found.');
  await logEvent(viewer, o, 'note', note.data);
  refresh();
  return done('Note added.');
}

export async function deleteOrder(fd: FormData) {
  const viewer = await requireDeliveries({ dispatcher: true });
  const id = z.string().uuid().safeParse(fd.get('id'));
  if (!id.success) return;
  const { data: o } = await db().from('dl_orders').select('id, number, route_id').eq('id', id.data).maybeSingle();
  if (!o) return;
  await db().from('dl_orders').delete().eq('id', id.data);
  if (o.route_id) await recomputeRoute(o.route_id);
  await audit(viewer, 'delivery.delete', 'dl_orders', o.id, { text: `deleted delivery order #${o.number}` });
  refresh();
  redirect('/base/deliveries/orders');
}

/** Post-delivery: the office records its follow-up (thank-you call, fixing an issue). */
export async function setFollowup(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireDeliveries({ dispatcher: true });
  const parsed = z
    .object({ id: z.string().uuid(), followup_status: z.enum(['pending', 'done', 'issue']), followup_note: z.string().trim().max(2000) })
    .safeParse({ id: fd.get('id'), followup_status: fd.get('followup_status'), followup_note: fd.get('followup_note') ?? '' });
  if (!parsed.success) return fail('Please check the follow-up.');
  const { id, followup_status, followup_note } = parsed.data;
  const { data: o } = await db().from('dl_orders').select('id, number').eq('id', id).maybeSingle();
  if (!o) return fail('Order not found.');
  await db()
    .from('dl_orders')
    .update({ followup_status, followup_note: followup_note || null, followup_at: new Date().toISOString(), followup_by: viewer.employeeId })
    .eq('id', id);
  await logEvent(viewer, o, 'note', `Follow-up: ${followup_status === 'done' ? 'done' : followup_status === 'issue' ? 'issue to resolve' : 'to do'}${followup_note ? ` — ${followup_note}` : ''}`);
  refresh();
  return done('Follow-up saved.');
}
