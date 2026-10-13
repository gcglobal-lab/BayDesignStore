'use server';

import { revalidatePath } from 'next/cache';
import { addDays } from 'date-fns';
import { tz } from '@date-fns/tz';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireManager } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { addDaysYmd, dayRangeIso, isHm, isYmd, zonedDateTime } from '@/lib/base/time';

const shiftSchema = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid().nullable(),
  date: z.string().refine(isYmd, 'Pick a date.'),
  start: z.string().refine(isHm, 'Enter a start time.'),
  end: z.string().refine(isHm, 'Enter an end time.'),
  role_id: z.string().uuid().nullable(),
  location_id: z.string().uuid().nullable(),
  break_minutes: z.coerce.number().int().min(0).max(240),
  notes: z.string().trim().max(500).nullable(),
  publish: z.boolean(),
});

export async function saveShift(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireManager();
  const orNull = (k: string) => {
    const v = formData.get(k);
    return v === null || v === '' ? null : String(v);
  };
  const parsed = shiftSchema.safeParse({
    id: orNull('id') ?? undefined,
    employee_id: orNull('employee_id'),
    date: formData.get('date'),
    start: formData.get('start'),
    end: formData.get('end'),
    role_id: orNull('role_id'),
    location_id: orNull('location_id'),
    break_minutes: formData.get('break_minutes') || 0,
    notes: orNull('notes'),
    publish: formData.get('publish') === 'on',
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the shift details.');
  const v = parsed.data;
  const { timezone } = await getSettings();

  const startsAt = zonedDateTime(v.date, v.start, timezone);
  // An end time at or before the start means the shift runs past midnight.
  let endsAt = zonedDateTime(v.date, v.end, timezone);
  if (endsAt <= startsAt) endsAt = zonedDateTime(addDaysYmd(v.date, 1, timezone), v.end, timezone);
  if ((endsAt.getTime() - startsAt.getTime()) / 60000 <= v.break_minutes) return fail('The break is longer than the shift.');

  if (v.employee_id) {
    let overlap = db()
      .from('shifts')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', v.employee_id)
      .lt('starts_at', endsAt.toISOString())
      .gt('ends_at', startsAt.toISOString());
    if (v.id) overlap = overlap.neq('id', v.id);
    const { count } = await overlap;
    if (count) return fail('This person already has a shift that overlaps those times.');
  }

  const row = {
    employee_id: v.employee_id,
    role_id: v.role_id,
    location_id: v.location_id,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    break_minutes: v.break_minutes,
    notes: v.notes,
    ...(v.publish ? { published_at: new Date().toISOString() } : {}),
  };
  const res = v.id
    ? await db().from('shifts').update(row).eq('id', v.id).select('id').single()
    : await db().from('shifts').insert({ ...row, created_by: viewer.employeeId }).select('id').single();
  if (res.error) return fail('Couldn’t save the shift. Please try again.');

  await audit(viewer, v.id ? 'shift.update' : 'shift.create', 'shifts', res.data.id);
  revalidatePath('/base', 'layout');
  return done(v.id ? 'Shift updated.' : v.publish ? 'Shift added and published.' : 'Shift added as a draft — publish when the week is ready.');
}

export async function deleteShift(formData: FormData) {
  const viewer = await requireManager();
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  await db().from('shifts').delete().eq('id', id.data);
  await audit(viewer, 'shift.delete', 'shifts', id.data);
  revalidatePath('/base', 'layout');
}

async function weekRange(formData: FormData) {
  const week = formData.get('week');
  if (!isYmd(week)) return null;
  const { timezone } = await getSettings();
  const [start] = dayRangeIso(week, timezone);
  const [, end] = dayRangeIso(addDaysYmd(week, 6, timezone), timezone);
  return { start, end, timezone };
}

/** Make every draft shift in the week visible to the team. */
export async function publishWeek(formData: FormData) {
  const viewer = await requireManager();
  const range = await weekRange(formData);
  if (!range) return;
  const { data } = await db()
    .from('shifts')
    .update({ published_at: new Date().toISOString() })
    .is('published_at', null)
    .gte('starts_at', range.start)
    .lt('starts_at', range.end)
    .select('id');
  await audit(viewer, 'schedule.publish', 'shifts', null, { count: data?.length ?? 0, from: range.start });
  revalidatePath('/base', 'layout');
}

/** Copy last week's shifts into this week as drafts (skipping anyone who already has shifts this week). */
export async function copyPreviousWeek(formData: FormData) {
  const viewer = await requireManager();
  const range = await weekRange(formData);
  if (!range) return;
  // Wall-clock times stay the same across a daylight-saving change.
  const shiftWeek = (iso: string, days: number) => addDays(new Date(iso), days, { in: tz(range.timezone) }).toISOString();
  const prevStart = shiftWeek(range.start, -7);
  const [{ data: previous }, { data: existing }] = await Promise.all([
    db().from('shifts').select('employee_id, role_id, location_id, starts_at, ends_at, break_minutes, notes').gte('starts_at', prevStart).lt('starts_at', range.start),
    db().from('shifts').select('employee_id').gte('starts_at', range.start).lt('starts_at', range.end),
  ]);
  const busy = new Set((existing ?? []).map((s) => s.employee_id));
  const copies = (previous ?? [])
    .filter((s) => !s.employee_id || !busy.has(s.employee_id))
    .map((s) => ({
      ...s,
      starts_at: shiftWeek(s.starts_at, 7),
      ends_at: shiftWeek(s.ends_at, 7),
      created_by: viewer.employeeId,
    }));
  if (copies.length) await db().from('shifts').insert(copies);
  await audit(viewer, 'schedule.copy_week', 'shifts', null, { count: copies.length, to: range.start });
  revalidatePath('/base', 'layout');
}
