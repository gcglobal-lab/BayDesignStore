'use server';

import { revalidatePath } from 'next/cache';
import { addDays } from 'date-fns';
import { tz } from '@date-fns/tz';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireManager, type Viewer } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { diff } from '@/lib/base/activity';
import { addDaysYmd, dayRangeIso, fmtDate, fmtTime, isHm, isYmd, zonedDateTime } from '@/lib/base/time';

const shiftSchema = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid().nullable(),
  // "Apply to": one shift per picked day. An edit moves the shift to exactly one day.
  dates: z.array(z.string().refine(isYmd, 'Pick a date.')).min(1, 'Pick at least one day.').max(7),
  start: z.string().refine(isHm, 'Enter a start time.'),
  end: z.string().refine(isHm, 'Enter an end time.'),
  role_id: z.string().uuid().nullable(),
  location_id: z.string().uuid().nullable(),
  break_minutes: z.coerce.number().int().min(0).max(240),
  notes: z.string().trim().max(500).nullable(),
  publish: z.boolean(),
});

/**
 * Managers build the schedule; once a shift is published only an admin can change or delete it.
 * Nobody changes a shift someone has already punched in for — fix the time card instead.
 */
async function changeProblem(viewer: Viewer, id: string): Promise<string | null> {
  const [{ data: shift }, { count }] = await Promise.all([
    db().from('shifts').select('published_at').eq('id', id).maybeSingle(),
    db().from('time_entries').select('id', { count: 'exact', head: true }).eq('shift_id', id),
  ]);
  if (!shift) return 'That shift no longer exists.';
  if (count) return 'Shifts with existing time cards can’t be edited.';
  if (shift.published_at && viewer.level !== 'admin') return 'Only an admin can change a published shift.';
  return null;
}

export async function saveShift(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireManager();
  const orNull = (k: string) => {
    const v = formData.get(k);
    return v === null || v === '' ? null : String(v);
  };
  const parsed = shiftSchema.safeParse({
    id: orNull('id') ?? undefined,
    employee_id: orNull('employee_id'),
    dates: [...new Set(formData.getAll('date').map(String))],
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
  if (v.id && v.dates.length !== 1) return fail('Pick the one day this shift is on.');
  if (v.id) {
    const problem = await changeProblem(viewer, v.id);
    if (problem) return fail(problem);
  }
  const { timezone } = await getSettings();

  const rows = [];
  for (const date of v.dates.sort()) {
    const startsAt = zonedDateTime(date, v.start, timezone);
    // An end time at or before the start means the shift runs past midnight.
    let endsAt = zonedDateTime(date, v.end, timezone);
    if (endsAt <= startsAt) endsAt = zonedDateTime(addDaysYmd(date, 1, timezone), v.end, timezone);
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
      if (count) return fail(`This person already has a shift that overlaps those times on ${fmtDate(date, timezone, 'EEE, MMM d')}.`);
    }

    rows.push({
      date,
      row: {
        employee_id: v.employee_id,
        role_id: v.role_id,
        location_id: v.location_id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        break_minutes: v.break_minutes,
        notes: v.notes,
        ...(v.publish ? { published_at: new Date().toISOString() } : {}),
      },
    });
  }

  const when = (iso: string | null | undefined) => (iso ? `${fmtDate(new Date(iso), timezone, 'MMM d')} ${fmtTime(iso, timezone)}` : null);
  if (v.id) {
    const { date, row } = rows[0];
    const before = (await db().from('shifts').select('employee_id, role_id, starts_at, ends_at, break_minutes, notes, published_at').eq('id', v.id).maybeSingle()).data;
    const res = await db().from('shifts').update(row).eq('id', v.id).select('id').single();
    if (res.error) return fail('Couldn’t save the shift. Please try again.');
    const changes = before
      ? diff(
          { starts_at: when(before.starts_at), ends_at: when(before.ends_at), break_minutes: before.break_minutes, notes: before.notes, published: Boolean(before.published_at) },
          { starts_at: when(row.starts_at), ends_at: when(row.ends_at), break_minutes: row.break_minutes, notes: row.notes, published: Boolean(before.published_at) || v.publish },
        )
      : undefined;
    await audit(viewer, 'shift.update', 'shifts', res.data.id, { employee_id: v.employee_id ?? undefined, when: fmtDate(date, timezone, 'EEE, MMM d'), changes });
    revalidatePath('/base', 'layout');
    return done('Shift updated.');
  }

  const res = await db()
    .from('shifts')
    .insert(rows.map((r) => ({ ...r.row, created_by: viewer.employeeId })))
    .select('id');
  if (res.error) return fail('Couldn’t save the shift. Please try again.');
  for (const [i, { date }] of rows.entries()) {
    const id = res.data[i]?.id;
    if (id) await audit(viewer, 'shift.create', 'shifts', id, { employee_id: v.employee_id ?? undefined, when: fmtDate(date, timezone, 'EEE, MMM d') });
  }
  revalidatePath('/base', 'layout');
  const what = rows.length === 1 ? 'Shift' : `${rows.length} shifts`;
  return done(v.publish ? `${what} added and published.` : `${what} added as ${rows.length === 1 ? 'a draft' : 'drafts'} — publish when the week is ready.`);
}

export async function deleteShift(formData: FormData): Promise<ActionResult> {
  const viewer = await requireManager();
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return fail('That shift no longer exists.');
  const problem = await changeProblem(viewer, id.data);
  if (problem) return fail(problem);
  const { data: gone } = await db().from('shifts').delete().eq('id', id.data).select('employee_id, starts_at').maybeSingle();
  await audit(viewer, 'shift.delete', 'shifts', id.data, gone?.employee_id ? { employee_id: gone.employee_id, starts_at: gone.starts_at } : undefined);
  revalidatePath('/base', 'layout');
  return done('Shift deleted.');
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
