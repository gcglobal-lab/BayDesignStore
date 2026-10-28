'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireAdmin } from '@/lib/base/auth';
import { db, isUniqueViolation } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { diff } from '@/lib/base/activity';
import { addDaysYmd, fmtDate, fmtTime, isHm, isYmd, zonedDateTime } from '@/lib/base/time';

const schema = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid('Choose a team member.'),
  date: z.string().refine(isYmd, 'Pick a date.'),
  clock_in: z.string().refine(isHm, 'Enter a punch-in time.'),
  clock_out: z.string().refine((v) => v === '' || isHm(v), 'Enter a valid punch-out time.'),
  meal_minutes: z.coerce.number().int().min(0).max(240),
  notes: z.string().trim().max(1000),
});

/** Add or correct a time card by hand. Every change is marked as edited and audited. */
export async function saveTimeCard(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireAdmin();
  const parsed = schema.safeParse({
    id: formData.get('id') || undefined,
    employee_id: formData.get('employee_id'),
    date: formData.get('date'),
    clock_in: formData.get('clock_in'),
    clock_out: formData.get('clock_out') ?? '',
    meal_minutes: formData.get('meal_minutes') || 0,
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the time card.');
  const v = parsed.data;
  const { timezone } = await getSettings();

  const clockIn = zonedDateTime(v.date, v.clock_in, timezone);
  let clockOut = v.clock_out ? zonedDateTime(v.date, v.clock_out, timezone) : null;
  if (clockOut && clockOut <= clockIn) clockOut = zonedDateTime(addDaysYmd(v.date, 1, timezone), v.clock_out, timezone);
  if (clockIn.getTime() > Date.now() + 60_000) return fail('Punch in can’t be in the future.');
  if (clockOut && clockOut.getTime() > Date.now() + 60_000) return fail('Punch out can’t be in the future.');
  if (clockOut && (clockOut.getTime() - clockIn.getTime()) / 3600_000 > 24) return fail('A time card can’t be longer than 24 hours.');
  if (clockOut && (clockOut.getTime() - clockIn.getTime()) / 60000 <= v.meal_minutes) return fail('The meal break is longer than the shift.');

  let overlap = db()
    .from('time_entries')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', v.employee_id)
    .lt('clock_in_at', clockOut?.toISOString() ?? '9999-12-31T00:00:00Z')
    .or(`clock_out_at.is.null,clock_out_at.gt."${clockIn.toISOString()}"`);
  if (v.id) overlap = overlap.neq('id', v.id);
  const { count } = await overlap;
  if (count) return fail('This overlaps another time card for the same person.');

  const before = v.id ? (await db().from('time_entries').select('clock_in_at, clock_out_at, notes').eq('id', v.id).maybeSingle()).data : null;
  const now = new Date().toISOString();
  const row = {
    employee_id: v.employee_id,
    clock_in_at: clockIn.toISOString(),
    clock_out_at: clockOut?.toISOString() ?? null,
    notes: v.notes || null,
    edited_by: viewer.employeeId,
    edited_at: now,
  };
  const res = v.id
    ? await db().from('time_entries').update(row).eq('id', v.id).select('id').single()
    : await db().from('time_entries').insert({ ...row, source: 'manual' }).select('id').single();
  if (isUniqueViolation(res)) return fail('This person already has an open time card. Close it first.');
  if (res.error) return fail('Couldn’t save the time card.');

  // Replace the recorded meal break with the minutes entered.
  if (formData.has('meal_minutes')) {
    await db().from('time_entry_breaks').delete().eq('time_entry_id', res.data.id).eq('type', 'meal');
    if (v.meal_minutes > 0) {
      const start = new Date(clockIn.getTime() + Math.max(0, ((clockOut?.getTime() ?? Date.now()) - clockIn.getTime()) / 2 - (v.meal_minutes * 60_000) / 2));
      await db()
        .from('time_entry_breaks')
        .insert({ time_entry_id: res.data.id, type: 'meal', started_at: start.toISOString(), ended_at: new Date(start.getTime() + v.meal_minutes * 60_000).toISOString() });
    }
  }

  const stamp = (iso: string | null | undefined) => (iso ? `${fmtDate(new Date(iso), timezone, 'MMM d')} ${fmtTime(iso, timezone)}` : null);
  const changes = before
    ? diff({ clock_in: stamp(before.clock_in_at), clock_out: stamp(before.clock_out_at), notes: before.notes }, { clock_in: stamp(row.clock_in_at), clock_out: stamp(row.clock_out_at), notes: row.notes })
    : undefined;
  await audit(viewer, v.id ? 'timecard.edit' : 'timecard.add', 'time_entries', res.data.id, { employee_id: v.employee_id, date: v.date, clock_in: stamp(row.clock_in_at), clock_out: stamp(row.clock_out_at), changes });
  revalidatePath('/base', 'layout');
  return done(v.id ? 'Time card updated.' : 'Time card added.');
}

export async function deleteTimeCard(formData: FormData) {
  const viewer = await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  const { data } = await db().from('time_entries').select('employee_id, clock_in_at, clock_out_at').eq('id', id.data).maybeSingle();
  await db().from('time_entries').delete().eq('id', id.data);
  await audit(viewer, 'timecard.delete', 'time_entries', id.data, data ?? undefined);
  revalidatePath('/base', 'layout');
}
