'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from '@/lib/base/audit';
import { requireEmployee } from '@/lib/base/auth';
import { db } from '@/lib/base/db';

const id = z.string().uuid();

/** Ask for someone to cover one of my upcoming shifts. */
export async function offerShift(formData: FormData) {
  const viewer = await requireEmployee();
  const shiftId = id.safeParse(formData.get('id'));
  if (!shiftId.success) return;
  const { data: shift } = await db().from('shifts').select('employee_id, starts_at, published_at').eq('id', shiftId.data).maybeSingle();
  if (!shift || shift.employee_id !== viewer.employeeId || !shift.published_at || new Date(shift.starts_at) <= new Date()) return;
  const note = z.string().trim().max(500).safeParse(formData.get('note') ?? '');
  const { error } = await db().from('shift_requests').insert({ type: 'cover', shift_id: shiftId.data, requester_id: viewer.employeeId, note: note.success && note.data ? note.data : null });
  if (!error) await audit(viewer, 'shift.offer', 'shifts', shiftId.data);
  revalidatePath('/base', 'layout');
}

/** Ask to pick up an open (unassigned) shift. */
export async function requestOpenShift(formData: FormData) {
  const viewer = await requireEmployee();
  const shiftId = id.safeParse(formData.get('id'));
  if (!shiftId.success) return;
  const { data: shift } = await db().from('shifts').select('employee_id, starts_at, published_at').eq('id', shiftId.data).maybeSingle();
  if (!shift || shift.employee_id !== null || !shift.published_at || new Date(shift.starts_at) <= new Date()) return;
  const { error } = await db().from('shift_requests').insert({ type: 'pickup', shift_id: shiftId.data, requester_id: viewer.employeeId });
  if (!error) await audit(viewer, 'shift.request_open', 'shifts', shiftId.data);
  revalidatePath('/base', 'layout');
}

/** Offer to take a teammate's shift; a manager still has to approve the swap. */
export async function takeShift(formData: FormData) {
  const viewer = await requireEmployee();
  const requestId = id.safeParse(formData.get('id'));
  if (!requestId.success) return;
  const { data, error } = await db()
    .from('shift_requests')
    .update({ claimant_id: viewer.employeeId })
    .eq('id', requestId.data)
    .eq('type', 'cover')
    .eq('status', 'pending')
    .is('claimant_id', null)
    .neq('requester_id', viewer.employeeId)
    .select('id');
  if (!error && data?.length) await audit(viewer, 'shift.take', 'shift_requests', requestId.data);
  revalidatePath('/base', 'layout');
}

export async function cancelShiftRequest(formData: FormData) {
  const viewer = await requireEmployee();
  const requestId = id.safeParse(formData.get('id'));
  if (!requestId.success) return;
  await db().from('shift_requests').update({ status: 'cancelled' }).eq('id', requestId.data).eq('requester_id', viewer.employeeId).eq('status', 'pending');
  await audit(viewer, 'shift.request_cancel', 'shift_requests', requestId.data);
  revalidatePath('/base', 'layout');
}
