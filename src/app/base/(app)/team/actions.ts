'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { diff } from '@/lib/base/activity';
import { audit } from '@/lib/base/audit';
import { requireAdmin, requireManager, type Viewer } from '@/lib/base/auth';
import { db, isUniqueViolation } from '@/lib/base/db';
import { invalidateTeam } from '@/lib/base/memo';
import { checkPasswordStrength, generateTemporaryPassword, hashPassword } from '@/lib/base/password';
import { listLocations, listRoles } from '@/lib/base/queries';
import { isYmd } from '@/lib/base/time';
import type { AccessLevel } from '@/lib/base/token';
import { sealPassword } from '@/lib/base/vault';

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
  // Not on the employee form any more: the store is assigned from the roster / profile.
  location_id: z.string().uuid().nullable().optional(),
  title: optionalText(80).optional(),
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
    location_id: formData.has('location_id') ? orNull('location_id') : undefined,
    title: formData.has('title') ? str('title') : undefined,
    is_contractor: formData.get('is_contractor') === 'on',
    birthday: orNull('birthday'),
    hire_date: orNull('hire_date'),
    role_ids: [...new Set(formData.getAll('role_ids').map(String))],
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
      .insert(roleIds.map((role_id) => ({ employee_id: employeeId, role_id, is_primary: role_id === (primary && roleIds.includes(primary) ? primary : roleIds[0]) })));
  }
}

/** What a password column update looks like: hash to sign in, sealed copy for the admin. */
async function passwordColumns(password: string) {
  return { password_hash: await hashPassword(password), password_secret: sealPassword(password), must_change_password: false };
}

/** The password typed (or generated) on a form, or null when left empty. */
function readPassword(formData: FormData): { password: string | null } | { error: string } {
  const raw = formData.get('password');
  if (raw === null || String(raw) === '') return { password: null };
  const password = String(raw);
  const weak = checkPasswordStrength(password);
  return weak ? { error: weak } : { password };
}

const uniqueMessage = 'That login ID or email is already used by someone else.';
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? 'Check the form and try again.';

function afterTeamChange(id?: string) {
  invalidateTeam();
  revalidatePath('/base', 'layout');
  if (id) revalidatePath(`/base/team/${id}`);
}

export async function createEmployee(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  // Adding and removing people is admin only; managers run everything else.
  const viewer = await requireAdmin();
  const parsed = readProfile(formData);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { role_ids, primary_role_id, ...profile } = parsed.data;
  if (!canManage(viewer, profile.access_level)) return fail('Only an admin can add managers or admins.');

  // Passwords are an admin's job; a manager adds the person and an admin gives them a password.
  const pw = viewer.level === 'admin' ? readPassword(formData) : { password: null };
  if ('error' in pw) return fail(pw.error);

  const res = await db()
    .from('employees')
    .insert({
      ...profile,
      ...(pw.password ? await passwordColumns(pw.password) : { must_change_password: false }),
      status: pw.password ? 'active' : 'pending',
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
  await audit(viewer, 'employee.create', 'employees', res.data.id, { access_level: profile.access_level, subject: `${profile.first_name} ${profile.last_name}`.trim() });
  afterTeamChange();

  const who = profile.access_level === 'manager' ? 'Manager' : profile.access_level === 'admin' ? 'Admin' : 'Employee';
  return done(
    pw.password
      ? `${who} added. ${profile.first_name} signs in with login ID “${profile.login_id}” and the password below.`
      : `${who} added. ${viewer.level === 'admin' ? 'Set a password' : 'An admin needs to set a password'} before ${profile.first_name} can sign in.`,
    { id: res.data.id, ...(pw.password ? { password: pw.password, login: profile.login_id } : {}) },
  );
}

type Target = { id: string; first_name: string; last_name: string; login_id: string; access_level: AccessLevel; status: string; session_version: number };

async function loadTarget(id: unknown): Promise<Target | null> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return null;
  const { data } = await db().from('employees').select('id, first_name, last_name, login_id, access_level, status, session_version').eq('id', parsed.data).maybeSingle();
  return data as Target | null;
}

const nameOf = (t: Pick<Target, 'first_name' | 'last_name'>) => `${t.first_name} ${t.last_name}`.trim();

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

  // Admins can change the password from the same form.
  const pw = viewer.level === 'admin' ? readPassword(formData) : { password: null };
  if ('error' in pw) return fail(pw.error);

  const { data: before } = await db()
    .from('employees')
    .select('first_name, last_name, email, phone, login_id, access_level, location_id, title, is_contractor, birthday, hire_date, employee_roles(role_id)')
    .eq('id', target.id)
    .single();

  const levelChanged = profile.access_level !== target.access_level;
  const loginChanged = profile.login_id !== target.login_id;
  // Fields the form didn't send (store, title) keep their saved values.
  const update: Record<string, unknown> = Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== undefined));
  if (pw.password) Object.assign(update, await passwordColumns(pw.password), { status: target.status === 'terminated' ? 'terminated' : 'active' });
  // A new access level, login ID or password takes effect everywhere at once.
  if (levelChanged || loginChanged || pw.password) update.session_version = target.session_version + 1;
  const res = await db().from('employees').update(update).eq('id', target.id);
  if (isUniqueViolation(res)) return fail(uniqueMessage);
  if (res.error) return fail('Couldn’t save changes. Please try again.');
  await saveRoles(target.id, role_ids, primary_role_id);

  const [roles, locations] = await Promise.all([listRoles(), listLocations()]);
  const roleNames = (ids: string[]) => ids.map((id) => roles.find((r) => r.id === id)?.name ?? 'Unknown role');
  const locName = (id: unknown) => locations.find((l) => l.id === id)?.name ?? null;
  const changes = diff(
    before ? { ...before, location_id: locName(before.location_id), roles: roleNames((before.employee_roles as { role_id: string }[]).map((r) => r.role_id)) } : null,
    { ...before, ...update, location_id: locName(update.location_id ?? before?.location_id), roles: roleNames(role_ids) },
    ['first_name', 'last_name', 'email', 'phone', 'login_id', 'access_level', 'location_id', 'title', 'is_contractor', 'birthday', 'hire_date', 'roles'],
  );
  if (pw.password) changes.push({ field: 'password', from: '••••', to: 'new password' });
  await audit(viewer, 'employee.update', 'employees', target.id, { changes, subject: nameOf({ first_name: profile.first_name, last_name: profile.last_name }) });
  afterTeamChange(target.id);
  return done(changes.length ? `Saved: ${changes.length} change${changes.length === 1 ? '' : 's'}.` : 'Nothing changed.', pw.password ? { password: pw.password, login: profile.login_id } : undefined);
}

/** Admin only: set (or generate) a team member's password. Signs them out everywhere. */
export async function setEmployeePassword(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireAdmin();
  const target = await loadTarget(formData.get('id'));
  if (!target) return fail('Team member not found.');
  if (target.status === 'terminated') return fail('Reactivate this person before setting a password.');
  const typed = readPassword(formData);
  if ('error' in typed) return fail(typed.error);
  const password = typed.password ?? generateTemporaryPassword();

  const { error } = await db()
    .from('employees')
    .update({ ...(await passwordColumns(password)), status: 'active', session_version: target.session_version + 1 })
    .eq('id', target.id);
  if (error) return fail('Couldn’t set the password. Please try again.');
  await audit(viewer, 'employee.password_set', 'employees', target.id, { subject: nameOf(target) });
  afterTeamChange(target.id);
  return done(`Password saved. ${target.first_name} signs in with login ID “${target.login_id}”.`, { password, login: target.login_id });
}

/** Admin only: remove a password. The person can't sign in until a new one is set. */
export async function deleteEmployeePassword(formData: FormData) {
  const viewer = await requireAdmin();
  const target = await loadTarget(formData.get('id'));
  if (!target) return;
  await db()
    .from('employees')
    .update({ password_hash: null, password_secret: null, status: target.status === 'terminated' ? 'terminated' : 'pending', session_version: target.session_version + 1 })
    .eq('id', target.id);
  await audit(viewer, 'employee.password_delete', 'employees', target.id, { subject: nameOf(target) });
  afterTeamChange(target.id);
}

/** Admin only: give everyone on the roster who has no password a generated one. */
export async function generateMissingPasswords(): Promise<ActionResult> {
  const viewer = await requireAdmin();
  const { data, error } = await db().from('employees').select('id, session_version').is('password_hash', null).neq('status', 'terminated');
  if (error) return fail('Couldn’t load the roster.');
  for (const e of data ?? []) {
    await db()
      .from('employees')
      .update({ ...(await passwordColumns(generateTemporaryPassword())), status: 'active', session_version: e.session_version + 1 })
      .eq('id', e.id);
  }
  await audit(viewer, 'employee.passwords_generated', 'employees', null, { count: data?.length ?? 0 });
  afterTeamChange();
  return done(data?.length ? `Created passwords for ${data.length} team member${data.length === 1 ? '' : 's'}. They’re shown in the Password column.` : 'Everyone already has a password.');
}

export async function setEmployeeStatus(formData: FormData) {
  const viewer = await requireAdmin();
  const target = await loadTarget(formData.get('id'));
  const status = formData.get('status');
  if (!target || (status !== 'terminated' && status !== 'active')) return;
  if (target.id === viewer.employeeId || !canManage(viewer, target.access_level)) return;

  const { data } = await db().from('employees').select('password_hash').eq('id', target.id).single();
  await db()
    .from('employees')
    .update({
      status: status === 'active' && !data?.password_hash ? 'pending' : status,
      terminated_at: status === 'terminated' ? new Date().toISOString() : null,
      session_version: target.session_version + 1,
    })
    .eq('id', target.id);
  if (status === 'terminated') {
    // Close any open time card and drop future shifts back into open shifts.
    const now = new Date().toISOString();
    await db().from('time_entries').update({ clock_out_at: now, notes: 'Closed automatically on termination' }).eq('employee_id', target.id).is('clock_out_at', null);
    await db().from('shifts').update({ employee_id: null }).eq('employee_id', target.id).gt('starts_at', now);
  }
  await audit(viewer, status === 'terminated' ? 'employee.terminate' : 'employee.reactivate', 'employees', target.id, { subject: nameOf(target) });
  afterTeamChange(target.id);
}

export async function signOutEverywhere(formData: FormData) {
  const viewer = await requireManager();
  const target = await loadTarget(formData.get('id'));
  if (!target || !canManage(viewer, target.access_level)) return;
  await db().from('employees').update({ session_version: target.session_version + 1 }).eq('id', target.id);
  await audit(viewer, 'employee.sign_out_everywhere', 'employees', target.id, { subject: nameOf(target) });
  afterTeamChange(target.id);
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
  await audit(viewer, 'employee.wage', 'employees', target.id, { amount: parsed.data.amount, wage_type: parsed.data.wage_type, subject: nameOf(target) });
  afterTeamChange(target.id);
  return done('Wage saved.');
}

/** Managers: which store someone works at (Uptown / Downtown). Stays until it's changed again. */
export async function assignStore(formData: FormData) {
  const viewer = await requireManager();
  const target = await loadTarget(formData.get('id'));
  if (!target || !canManage(viewer, target.access_level)) return;
  const raw = String(formData.get('location_id') ?? '');
  const locationId = raw === '' ? null : z.string().uuid().safeParse(raw).success ? raw : undefined;
  if (locationId === undefined) return;
  const { data: before } = await db().from('employees').select('location_id').eq('id', target.id).single();
  await db().from('employees').update({ location_id: locationId }).eq('id', target.id);
  const locations = await listLocations();
  const name = (id: string | null | undefined) => locations.find((l) => l.id === id)?.name ?? 'No store';
  await audit(viewer, 'employee.update', 'employees', target.id, { subject: nameOf(target), changes: [{ field: 'location_id', from: name(before?.location_id), to: name(locationId) }] });
  afterTeamChange(target.id);
}
