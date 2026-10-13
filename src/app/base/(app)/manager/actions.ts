'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireManager } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { isYmd, todayYmd } from '@/lib/base/time';

/** Approve or deny a shift pickup / cover request. Approving reassigns the shift. */
export async function decideShiftRequest(formData: FormData) {
  const viewer = await requireManager();
  const parsed = z.object({ id: z.string().uuid(), decision: z.enum(['approved', 'denied']) }).safeParse({ id: formData.get('id'), decision: formData.get('decision') });
  if (!parsed.success) return;
  const { data: req } = await db().from('shift_requests').select('id, type, status, shift_id, requester_id, claimant_id').eq('id', parsed.data.id).maybeSingle();
  if (!req || req.status !== 'pending') return;
  // Managers can't approve swaps they're part of; only an admin can.
  if (viewer.level !== 'admin' && (req.requester_id === viewer.employeeId || req.claimant_id === viewer.employeeId)) return;

  if (parsed.data.decision === 'approved') {
    const newOwner = req.type === 'pickup' ? req.requester_id : req.claimant_id;
    if (!newOwner) return; // a cover request needs a teammate before it can be approved
    // Only reassign if the shift is still where the request expects it.
    let update = db().from('shifts').update({ employee_id: newOwner }).eq('id', req.shift_id);
    update = req.type === 'pickup' ? update.is('employee_id', null) : update.eq('employee_id', req.requester_id);
    const { data: moved } = await update.select('id');
    if (!moved?.length) return;
  }
  await db()
    .from('shift_requests')
    .update({ status: parsed.data.decision, decided_by: viewer.employeeId, decided_at: new Date().toISOString() })
    .eq('id', req.id);
  await audit(viewer, `shift_request.${parsed.data.decision}`, 'shift_requests', req.id);
  revalidatePath('/base', 'layout');
}

const eventSchema = z
  .object({
    title: z.string().trim().min(1, 'Give the event a title.').max(120),
    description: z.string().trim().max(1000).optional(),
    starts_on: z.string().refine(isYmd, 'Pick a start date.'),
    ends_on: z.string().refine(isYmd, 'Pick an end date.'),
  })
  .refine((v) => v.ends_on >= v.starts_on, 'The end date is before the start date.');

export async function addEvent(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireManager();
  const parsed = eventSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') || undefined,
    starts_on: formData.get('starts_on'),
    ends_on: formData.get('ends_on') || formData.get('starts_on'),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the form.');
  const { error } = await db().from('events').insert({ ...parsed.data, created_by: viewer.employeeId });
  if (error) return fail('Couldn’t save the event.');
  await audit(viewer, 'event.create', 'events', null, { title: parsed.data.title });
  revalidatePath('/base', 'layout');
  return done('Event added.');
}

export async function deleteEvent(formData: FormData) {
  const viewer = await requireManager();
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  await db().from('events').delete().eq('id', id.data);
  await audit(viewer, 'event.delete', 'events', id.data);
  revalidatePath('/base', 'layout');
}

export async function addLogEntry(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireManager();
  const body = z.string().trim().min(1, 'Write a note first.').max(2000).safeParse(formData.get('body'));
  if (!body.success) return fail(body.error.issues[0]?.message ?? 'Write a note first.');
  const { timezone } = await getSettings();
  const { error } = await db().from('manager_log').insert({ log_date: todayYmd(timezone), body: body.data, author_id: viewer.employeeId, author_name: viewer.name });
  if (error) return fail('Couldn’t save the note.');
  revalidatePath('/base/manager');
  return done('Added to the log.');
}
