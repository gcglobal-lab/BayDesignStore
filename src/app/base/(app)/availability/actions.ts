'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireEmployee } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { isHm, isYmd, todayYmd } from '@/lib/base/time';

const slotSchema = z
  .object({
    weekday: z.number().int().min(1).max(7),
    kind: z.enum(['available', 'preferred', 'unavailable']),
    all_day: z.boolean(),
    start_time: z.string().nullable(),
    end_time: z.string().nullable(),
  })
  .refine((s) => s.all_day || (isHm(s.start_time) && isHm(s.end_time) && s.end_time! > s.start_time!), 'Each time range needs an end after its start.');

const schema = z.object({
  effective_from: z.string().refine(isYmd, 'Pick the date this availability starts.'),
  note: z.string().trim().max(500).optional(),
  slots: z.array(slotSchema).max(60, 'That’s a lot of time ranges — keep it to 60 or fewer.'),
});

/** Submit new weekly availability; a manager approves it before it shows as current. */
export async function submitAvailability(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireEmployee();
  let slots: unknown;
  try {
    slots = JSON.parse(String(formData.get('slots') ?? '[]'));
  } catch {
    return fail('Something went wrong reading your availability. Please try again.');
  }
  const parsed = schema.safeParse({ effective_from: formData.get('effective_from'), note: formData.get('note') || undefined, slots });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check your availability and try again.');
  const { timezone } = await getSettings();
  if (parsed.data.effective_from < todayYmd(timezone)) return fail('Availability can’t start in the past.');

  // A new submission replaces any earlier one still waiting for review.
  await db().from('availability_requests').update({ status: 'cancelled' }).eq('employee_id', viewer.employeeId).eq('status', 'pending');
  const { data, error } = await db()
    .from('availability_requests')
    .insert({ employee_id: viewer.employeeId, effective_from: parsed.data.effective_from, note: parsed.data.note ?? null })
    .select('id')
    .single();
  if (error) return fail('Couldn’t save your availability. Please try again.');
  if (parsed.data.slots.length) {
    const { error: slotError } = await db()
      .from('availability_slots')
      .insert(parsed.data.slots.map((s) => ({ ...s, request_id: data.id, start_time: s.all_day ? null : s.start_time, end_time: s.all_day ? null : s.end_time })));
    if (slotError) {
      await db().from('availability_requests').delete().eq('id', data.id);
      return fail('Couldn’t save your availability. Please try again.');
    }
  }
  await audit(viewer, 'availability.submit', 'availability_requests', data.id);
  revalidatePath('/base', 'layout');
  return done('Sent to your manager for approval.');
}
