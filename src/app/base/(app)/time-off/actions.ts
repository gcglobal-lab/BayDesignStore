'use server';

import { revalidatePath } from 'next/cache';
import { differenceInCalendarDays } from 'date-fns';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireAdmin, requireEmployee, requireManager, requireViewer, type Viewer } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { leaveBalance } from '@/lib/base/leave';
import { getSettings } from '@/lib/base/settings';
import { addDaysYmd, isHm, isYmd, todayYmd } from '@/lib/base/time';
import { fmtDays, HOURS_PER_DAY, PAID_LEAVE_TYPES, timeOffTypeLabel } from '@/lib/base/types';

const requestSchema = z
  .object({
    type: z.enum(['vacation', 'pto', 'sick', 'unpaid']),
    reason: z.enum(['vacation', 'personal', 'sick', 'family', 'other']),
    starts_on: z.string().refine(isYmd, 'Pick a start date.'),
    ends_on: z.string().refine(isYmd, 'Pick an end date.'),
    all_day: z.boolean(),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.ends_on < v.starts_on) ctx.addIssue({ code: 'custom', message: 'The end date is before the start date.' });
    const span = differenceInCalendarDays(new Date(v.ends_on), new Date(v.starts_on)) + 1;
    if (span > 62) ctx.addIssue({ code: 'custom', message: 'Requests can cover at most two months — split longer leave into several requests.' });
    if (!v.all_day) {
      if (v.starts_on !== v.ends_on) ctx.addIssue({ code: 'custom', message: 'Part-day time off must start and end on the same day.' });
      if (!isHm(v.start_time) || !isHm(v.end_time) || v.end_time! <= v.start_time!) ctx.addIssue({ code: 'custom', message: 'Enter a start and end time (end after start).' });
    }
  });

function parseRequest(formData: FormData) {
  return requestSchema.safeParse({
    type: formData.get('type'),
    reason: formData.get('reason'),
    starts_on: formData.get('starts_on'),
    ends_on: formData.get('all_day') === 'on' ? formData.get('ends_on') : formData.get('starts_on'),
    all_day: formData.get('all_day') === 'on',
    start_time: formData.get('start_time') || undefined,
    end_time: formData.get('end_time') || undefined,
    note: formData.get('note') || undefined,
  });
}

function hoursFor(v: z.infer<typeof requestSchema>) {
  if (!v.all_day) {
    const [sh, sm] = v.start_time!.split(':').map(Number);
    const [eh, em] = v.end_time!.split(':').map(Number);
    return Math.round(((eh * 60 + em - sh * 60 - sm) / 60) * 100) / 100;
  }
  return (differenceInCalendarDays(new Date(v.ends_on), new Date(v.starts_on)) + 1) * HOURS_PER_DAY;
}

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? 'Check the form and try again.';

/** Vacation and PTO come out of the paid-leave allowance for the year the leave starts in. */
async function paidLeaveProblem(employeeId: string, v: z.infer<typeof requestSchema>, who: 'you' | 'they'): Promise<string | null> {
  if (!PAID_LEAVE_TYPES.includes(v.type)) return null;
  const year = Number(v.starts_on.slice(0, 4));
  const balance = await leaveBalance(employeeId, year);
  const days = hoursFor(v) / HOURS_PER_DAY;
  if (days <= balance.remaining + 0.001) return null;
  const has = who === 'you' ? 'You have' : 'They have';
  if (balance.remaining <= 0) {
    return `${has} no paid leave left for ${year}. Choose sick leave or normal (unpaid) leave instead${who === 'they' ? ', or raise their allowance first' : ''}.`;
  }
  return `${has} ${fmtDays(balance.remaining)} of paid leave left for ${year}, but this ${timeOffTypeLabel[v.type].toLowerCase()} is ${fmtDays(days)}.`;
}

/** An employee asks for time off — it waits for a manager. */
export async function requestTimeOff(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireEmployee();
  const parsed = parseRequest(formData);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  const { timezone } = await getSettings();
  if (v.starts_on < addDaysYmd(todayYmd(timezone), -14, timezone)) return fail('Requests can’t start more than two weeks in the past. Ask a manager to add it.');
  const problem = await paidLeaveProblem(viewer.employeeId, v, 'you');
  if (problem) return fail(problem);

  const { data, error } = await db()
    .from('time_off_requests')
    .insert({
      employee_id: viewer.employeeId,
      type: v.type,
      reason: v.reason,
      starts_on: v.starts_on,
      ends_on: v.ends_on,
      all_day: v.all_day,
      start_time: v.all_day ? null : v.start_time,
      end_time: v.all_day ? null : v.end_time,
      hours: hoursFor(v),
      note: v.note ?? null,
      created_by: viewer.employeeId,
    })
    .select('id')
    .single();
  if (error) return fail('Couldn’t send your request. Please try again.');
  await audit(viewer, 'time_off.request', 'time_off_requests', data.id);
  revalidatePath('/base', 'layout');
  return done('Request sent — your manager will review it.');
}

/** A manager records time off for someone (approved straight away). */
export async function addTimeOff(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireManager();
  const employeeId = z.string().uuid().safeParse(formData.get('employee_id'));
  if (!employeeId.success) return fail('Choose a team member.');
  const parsed = parseRequest(formData);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  const problem = await paidLeaveProblem(employeeId.data, v, 'they');
  if (problem) return fail(problem);

  const { data, error } = await db()
    .from('time_off_requests')
    .insert({
      employee_id: employeeId.data,
      type: v.type,
      reason: v.reason,
      starts_on: v.starts_on,
      ends_on: v.ends_on,
      all_day: v.all_day,
      start_time: v.all_day ? null : v.start_time,
      end_time: v.all_day ? null : v.end_time,
      hours: hoursFor(v),
      note: v.note ?? null,
      status: 'approved',
      reviewed_by: viewer.employeeId,
      reviewed_at: new Date().toISOString(),
      created_by: viewer.employeeId,
    })
    .select('id')
    .single();
  if (error) return fail('Couldn’t add the time off. Please try again.');
  await audit(viewer, 'time_off.add', 'time_off_requests', data.id, { employee_id: employeeId.data });
  revalidatePath('/base', 'layout');
  return done('Time off added.');
}

const reviewSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(['approved', 'denied']),
  manager_note: z.string().trim().max(1000).optional(),
});

export async function reviewTimeOff(formData: FormData) {
  const viewer = await requireManager();
  const parsed = reviewSchema.safeParse({ id: formData.get('id'), decision: formData.get('decision'), manager_note: formData.get('manager_note') || undefined });
  if (!parsed.success) return;
  const { data: request } = await db().from('time_off_requests').select('employee_id, status').eq('id', parsed.data.id).maybeSingle();
  if (!request || request.status !== 'pending') return;
  // Managers can't approve their own requests; only an admin can.
  if (request.employee_id === viewer.employeeId && viewer.level !== 'admin') return;

  await db()
    .from('time_off_requests')
    .update({ status: parsed.data.decision, manager_note: parsed.data.manager_note ?? null, reviewed_by: viewer.employeeId, reviewed_at: new Date().toISOString() })
    .eq('id', parsed.data.id)
    .eq('status', 'pending');
  await audit(viewer, `time_off.${parsed.data.decision}`, 'time_off_requests', parsed.data.id);
  revalidatePath('/base', 'layout');
}

/** People can withdraw their own request; managers can cancel anyone's. */
export async function cancelTimeOff(formData: FormData) {
  const viewer = await requireViewer();
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  const { data: request } = await db().from('time_off_requests').select('employee_id, status').eq('id', id.data).maybeSingle();
  if (!request || request.status === 'cancelled' || request.status === 'denied') return;
  const manager = viewer.level !== 'employee';
  if (!manager && request.employee_id !== viewer.employeeId) return;

  await db().from('time_off_requests').update({ status: 'cancelled' }).eq('id', id.data);
  await audit(viewer, 'time_off.cancel', 'time_off_requests', id.data);
  revalidatePath('/base', 'layout');
}

// ------------------------------------------------------- paid leave balances --

const daysSchema = z.coerce.number({ message: 'Enter a number of days.' }).min(0, 'Days can’t be negative.').max(365, 'That’s more than a year.').multipleOf(0.25, 'Use whole, half or quarter days.');
const yearSchema = z.coerce.number().int().min(2000).max(2100);

/** Same rule as wages: admins can change anyone; managers only employees, never themselves. */
async function canManageLeaveOf(viewer: Viewer, employeeId: string) {
  if (viewer.level === 'admin') return true;
  if (employeeId === viewer.employeeId) return false;
  const { data } = await db().from('employees').select('access_level').eq('id', employeeId).maybeSingle();
  return data?.access_level === 'employee';
}

/** Set one person's paid-leave days for a year (e.g. what they have left of 2026). */
export async function setLeaveAllowance(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireManager();
  const parsed = z
    .object({ employee_id: z.string().uuid(), year: yearSchema, paid_days: daysSchema })
    .safeParse({ employee_id: formData.get('employee_id'), year: formData.get('year'), paid_days: formData.get('paid_days') });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if (!(await canManageLeaveOf(viewer, parsed.data.employee_id))) return fail('Only an admin can change this person’s paid leave.');

  const { error } = await db()
    .from('leave_allowances')
    .upsert({ ...parsed.data, updated_by: viewer.employeeId, updated_at: new Date().toISOString() }, { onConflict: 'employee_id,year' });
  if (error) return fail('Couldn’t save the paid leave. Please try again.');
  await audit(viewer, 'leave.allowance_set', 'employees', parsed.data.employee_id, { year: parsed.data.year, paid_days: parsed.data.paid_days });
  revalidatePath('/base', 'layout');
  return done(`Saved — ${fmtDays(parsed.data.paid_days)} of paid leave for ${parsed.data.year}.`);
}

/** Admin: give every active person the same paid-leave days for a year. */
export async function setAllLeaveAllowances(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireAdmin();
  const parsed = z.object({ year: yearSchema, paid_days: daysSchema }).safeParse({ year: formData.get('year'), paid_days: formData.get('paid_days') });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { data: people, error: peopleError } = await db().from('employees').select('id').neq('status', 'terminated');
  if (peopleError) return fail('Couldn’t load the team.');
  const now = new Date().toISOString();
  const { error } = await db()
    .from('leave_allowances')
    .upsert(people.map((p) => ({ employee_id: p.id, ...parsed.data, updated_by: viewer.employeeId, updated_at: now })), { onConflict: 'employee_id,year' });
  if (error) return fail('Couldn’t save the paid leave. Please try again.');
  await audit(viewer, 'leave.allowance_set_all', undefined, undefined, { ...parsed.data, people: people.length });
  revalidatePath('/base', 'layout');
  return done(`Everyone now has ${fmtDays(parsed.data.paid_days)} of paid leave for ${parsed.data.year}.`);
}

/** Admin: the fixed paid-leave days per year for anyone without their own allowance (e.g. from the new year). */
export async function setDefaultPaidLeave(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireAdmin();
  const days = daysSchema.safeParse(formData.get('paid_days'));
  if (!days.success) return fail(firstIssue(days.error));
  const { error } = await db().from('company_settings').update({ paid_leave_days_per_year: days.data }).eq('id', 1);
  if (error) return fail('Couldn’t save the setting.');
  await audit(viewer, 'leave.default_set', 'company_settings', null, { paid_days: days.data });
  revalidatePath('/base', 'layout');
  return done(`Saved — ${fmtDays(days.data)} of paid leave per year.`);
}
