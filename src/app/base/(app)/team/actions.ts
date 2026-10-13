'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireManager, type Viewer } from '@/lib/base/auth';
import { db, isUniqueViolation } from '@/lib/base/db';
import { checkPasswordStrength, generateTemporaryPassword, hashPassword } from '@/lib/base/password';
import { isYmd } from '@/lib/base/time';
import type { AccessLevel } from '@/lib/base/token';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable();

const profileSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required.').max(80),
  last_name: z.string().trim().max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'That email address doesn’t look right.'),
  phone: optionalText(40),
  login_id: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,64}$/, 'Login ID: 3–64 characters, letters, numbers, dots, dashes or underscores.'),
  access_level: z.enum(['employee', 'manager', 'admin']),
  location_id: z.string().uuid().nullable(),
  title: optionalText(80),
  is_contractor: z.boolean(),
  birthday: z.string().refine(isYmd).nullable(),
  hire_date: z.string().refine(isYmd).nullable(),
  role_ids: z.array(z.string().uuid()).max(30),
  primary_role_id: z.string().uuid().nullable(),
});

function readProfile(formData: FormData) {
  const str = (k: string) => (formData.get(k) as string | null) ?? '';
  const orNull = (k: string) => (str(k) === '' ? null : str(k));
  return profileSchema.safeParse({
    first_name: str('first_name'),
    last_name: str('last_name'),
    email: str('email'),
    phone: str('phone'),
    login_id: str('login_id'),
    access_level: str('access_level') || 'employee',
    location_id: orNull('location_id'),
    title: str('title'),
    is_contractor: formData.get('is_contractor') === 'on',
    birthday: orNull('birthday'),
    hire_date: orNull('hire_date'),
    role_ids: formData.getAll('role_ids').map(String),
    primary_role_id: orNull('primary_role_id'),
  });
}

/** Managers look after employees; only admins can create or change managers and admins. */
function canManage(viewer: Viewer, targetLevel: AccessLevel) {
  return viewer.level === 'admin' || targetLevel === 'employee';
}

async function saveRoles(employeeId: string, roleIds: string[], primary: string | null) {
  await db().from('employee_roles').delete().eq('employee_id', employeeId);
  if (roleIds.length) {
    await db()
      .from('employee_roles')
      .insert(roleIds.map((role_id) => ({ employee_id: employeeId, role_id, is_primary: role_id === (primary ?? roleIds[0]) })));
  }
}

const uniqueMessage = 'That login ID or email is already used by someone else.';
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? 'Check the form and try again.';

export async function createEmployee(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireManager();
  const parsed = readProfile(formData);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { role_ids, primary_role_id, ...profile } = parsed.data;
  if (!canManage(viewer, profile.access_level)) return fail('Only an admin can add managers or admins.');

  const choice = formData.get('password_mode');
  let password: string | null = null;
  if (choice === 'custom') {
    password = String(formData.get('password') ?? '');
    const weak = checkPasswordStrength(password, profile.login_id);
    if (weak) return fail(weak);
  } else if (choice !== 'later') {
    password = generateTemporaryPassword();
  }

  const res = await db()
    .from('employees')
    .insert({
      ...profile,
      password_hash: password ? await hashPassword(password) : null,
      status: password ? 'active' : 'pending',
      must_change_password: true,
    })
    .select('id')
    .single();
  if (isUniqueViolation(res)) return fail(uniqueMessage);
  if (res.error) return fail('Couldn’t add this team member. Please try again.');

  await saveRoles(res.data.id, role_ids, primary_role_id);
  const wage = Number(formData.get('wage_amount'));
  if (formData.get('wage_amount') && Number.isFinite(wage) && wage >= 0 && wage < 1_000_000) {
    await db().from('employee_wages').insert({ employee_id: res.data.id, amount: wage, wage_type: formData.get('wage_type') === 'salary' ? 'salary' : 'hourly', created_by: viewer.employeeId });
  }
  await audit(viewer, 'employee.create', 'employees', res.data.id, { access_level: profile.access_level });
  revalidatePath('/base', 'layout');

  return done(
    password
      ? `${profile.first_name} can now sign in with login ID “${profile.login_id}”. They’ll choose their own password the first time.`
      : `${profile.first_name} was added. Set a password when they’re ready to sign in.`,
    { id: res.data.id, ...(password && choice !== 'custom' ? { password } : {}) },
  );
}

async function loadTarget(id: unknown) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return null;
  const { data } = await db().from('employees').select('id, first_name, login_id, access_level, status').eq('id', parsed.data).maybeSingle();
  return data as { id: string; first_name: string; login_id: string; access_level: AccessLevel; status: string } | null;
}

export async function updateEmployee(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireManager();
  const target = await loadTarget(formData.get('id'));
  if (!target) return fail('Team member not found.');
  const parsed = readProfile(formData);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { role_ids, primary_role_id, ...profile } = parsed.data;

  const self = target.id === viewer.employeeId;
  if (!self && !canManage(viewer, target.access_level)) return fail('Only an admin can edit managers and admins.');
  if (!canManage(viewer, profile.access_level) && profile.access_level !== target.access_level) return fail('Only an admin can change access levels.');
  if (self && profile.access_level !== target.access_level) return fail('You can’t change your own access level.');

  const levelChanged = profile.access_level !== target.access_level;
  const loginChanged = profile.login_id !== target.login_id;
  const update: Record<string, unknown> = { ...profile };
  // A new access level or login ID takes effect everywhere at once.
  if (levelChanged || loginChanged) {
    const { data } = await db().from('employees').select('session_version').eq('id', target.id).single();
    update.session_version = (data?.session_version ?? 1) + 1;
  }
  const res = await db().from('employees').update(update).eq('id', target.id);
  if (isUniqueViolation(res)) return fail(uniqueMessage);
  if (res.error) return fail('Couldn’t save changes. Please try again.');

  await saveRoles(target.id, role_ids, primary_role_id);
  await audit(viewer, 'employee.update', 'employees', target.id, levelChanged ? { access_level: profile.access_level } : undefined);
  revalidatePath('/base', 'layout');
  return done('Changes saved.');
}

export async function setEmployeePassword(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireManager();
  const target = await loadTarget(formData.get('id'));
  if (!target) return fail('Team member not found.');
  if (target.id === viewer.employeeId) return fail('Change your own password from Account & Password.');
  if (!canManage(viewer, target.access_level)) return fail('Only an admin can reset a manager’s or admin’s password.');
  if (target.status === 'terminated') return fail('Reactivate this person before setting a password.');

  const custom = String(formData.get('password') ?? '');
  const password = custom || generateTemporaryPassword();
  if (custom) {
    const weak = checkPasswordStrength(custom, target.login_id);
    if (weak) return fail(weak);
  }
  const { data } = await db().from('employees').select('session_version').eq('id', target.id).single();
  const { error } = await db()
    .from('employees')
    .update({
      password_hash: await hashPassword(password),
      must_change_password: true,
      status: 'active',
      session_version: (data?.session_version ?? 1) + 1, // signs them out of every device
    })
    .eq('id', target.id);
  if (error) return fail('Couldn’t set the password. Please try again.');
  await audit(viewer, 'employee.password_reset', 'employees', target.id);
  revalidatePath(`/base/team/${target.id}`);
  return done(
    `Password set. Share it with ${target.first_name} privately — they’ll be asked to choose their own when they sign in.`,
    custom ? {} : { password },
  );
}

export async function setEmployeeStatus(formData: FormData) {
  const viewer = await requireManager();
  const target = await loadTarget(formData.get('id'));
  const status = formData.get('status');
  if (!target || (status !== 'terminated' && status !== 'active')) return;
  if (target.id === viewer.employeeId || !canManage(viewer, target.access_level)) return;

  const { data } = await db().from('employees').select('session_version, password_hash').eq('id', target.id).single();
  await db()
    .from('employees')
    .update({
      status: status === 'active' && !data?.password_hash ? 'pending' : status,
      terminated_at: status === 'terminated' ? new Date().toISOString() : null,
      session_version: (data?.session_version ?? 1) + 1,
    })
    .eq('id', target.id);
  if (status === 'terminated') {
    // Close any open time card and drop future shifts back into open shifts.
    const now = new Date().toISOString();
    await db().from('time_entries').update({ clock_out_at: now, notes: 'Closed automatically on termination' }).eq('employee_id', target.id).is('clock_out_at', null);
    await db().from('shifts').update({ employee_id: null }).eq('employee_id', target.id).gt('starts_at', now);
  }
  await audit(viewer, status === 'terminated' ? 'employee.terminate' : 'employee.reactivate', 'employees', target.id);
  revalidatePath('/base', 'layout');
}

export async function signOutEverywhere(formData: FormData) {
  const viewer = await requireManager();
  const target = await loadTarget(formData.get('id'));
  if (!target || !canManage(viewer, target.access_level)) return;
  const { data } = await db().from('employees').select('session_version').eq('id', target.id).single();
  await db().from('employees').update({ session_version: (data?.session_version ?? 1) + 1 }).eq('id', target.id);
  await audit(viewer, 'employee.sign_out_everywhere', 'employees', target.id);
  revalidatePath(`/base/team/${target.id}`);
}

export async function setWage(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireManager();
  const target = await loadTarget(formData.get('id'));
  if (!target) return fail('Team member not found.');
  // Nobody but an admin sets their own pay; managers set employees' pay.
  if (viewer.level !== 'admin' && (target.id === viewer.employeeId || !canManage(viewer, target.access_level))) return fail('Only an admin can change a manager’s wage.');
  const parsed = z
    .object({
      amount: z.coerce.number().min(0, 'Enter a wage of 0 or more.').max(999_999),
      wage_type: z.enum(['hourly', 'salary']),
      effective_from: z.string().refine(isYmd, 'Pick the date this wage starts.'),
    })
    .safeParse({ amount: formData.get('amount'), wage_type: formData.get('wage_type'), effective_from: formData.get('effective_from') });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { error } = await db().from('employee_wages').insert({ employee_id: target.id, ...parsed.data, created_by: viewer.employeeId });
  if (error) return fail('Couldn’t save the wage.');
  await audit(viewer, 'employee.wage', 'employees', target.id, { amount: parsed.data.amount, wage_type: parsed.data.wage_type });
  revalidatePath('/base', 'layout');
  return done('Wage saved.');
}
