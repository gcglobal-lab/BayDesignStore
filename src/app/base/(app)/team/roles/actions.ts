'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireManager } from '@/lib/base/auth';
import { db, isUniqueViolation } from '@/lib/base/db';
import { invalidateTeam } from '@/lib/base/memo';

function refresh() {
  invalidateTeam();
  revalidatePath('/base', 'layout');
}

const uuidOrNull = z
  .string()
  .transform((v) => (v === '' ? null : v))
  .pipe(z.string().uuid().nullable());

export async function createRole(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireManager();
  const parsed = z
    .object({
      name: z.string().trim().min(1, 'Type a role name.').max(60),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour.'),
      department_id: uuidOrNull,
      work_type: z.enum(['showroom', 'designer', 'warehouse', 'driver']),
    })
    .safeParse({ name: formData.get('name'), color: formData.get('color'), department_id: formData.get('department_id') ?? '', work_type: formData.get('work_type') || 'showroom' });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the form.');
  const res = await db().from('job_roles').insert(parsed.data).select('id, name, color').single();
  if (isUniqueViolation(res)) return fail('A role with that name already exists.');
  if (res.error) return fail('Couldn’t create the role.');
  await audit(viewer, 'role.create', 'job_roles', res.data.id, { name: parsed.data.name });
  refresh();
  return done(`“${parsed.data.name}” created.`, { id: res.data.id, name: res.data.name, color: res.data.color });
}

export async function updateRole(formData: FormData) {
  const viewer = await requireManager();
  const parsed = z
    .object({
      id: z.string().uuid(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      department_id: uuidOrNull,
      work_type: z.enum(['showroom', 'designer', 'warehouse', 'driver']),
    })
    .safeParse({ id: formData.get('id'), color: formData.get('color'), department_id: formData.get('department_id') ?? '', work_type: formData.get('work_type') ?? 'showroom' });
  if (!parsed.success) return;
  const { id, ...update } = parsed.data;
  const { data } = await db().from('job_roles').update(update).eq('id', id).select('name').maybeSingle();
  await audit(viewer, 'role.update', 'job_roles', id, { name: data?.name, ...update });
  refresh();
}

export async function deleteRole(formData: FormData) {
  const viewer = await requireManager();
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  const { data } = await db().from('job_roles').delete().eq('id', id.data).select('name').maybeSingle();
  await audit(viewer, 'role.delete', 'job_roles', id.data, { name: data?.name });
  refresh();
}

export async function createDepartment(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireManager();
  const name = z.string().trim().min(1, 'Type a department name.').max(80).safeParse(formData.get('name'));
  if (!name.success) return fail(name.error.issues[0]?.message ?? 'Type a department name.');
  const res = await db().from('departments').insert({ name: name.data });
  if (isUniqueViolation(res)) return fail('That department already exists.');
  if (res.error) return fail('Couldn’t create the department.');
  await audit(viewer, 'department.create', 'departments', null, { name: name.data });
  refresh();
  return done(`“${name.data}” created.`);
}

export async function deleteDepartment(formData: FormData) {
  const viewer = await requireManager();
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  await db().from('departments').delete().eq('id', id.data);
  await audit(viewer, 'department.delete', 'departments', id.data);
  refresh();
}

export async function setDepartmentManager(formData: FormData) {
  const viewer = await requireManager();
  const parsed = z
    .object({ department_id: z.string().uuid(), employee_id: z.string().uuid(), op: z.enum(['add', 'remove']) })
    .safeParse({ department_id: formData.get('department_id'), employee_id: formData.get('employee_id'), op: formData.get('op') });
  if (!parsed.success) return;
  const { department_id, employee_id, op } = parsed.data;
  if (op === 'add') await db().from('department_managers').upsert({ department_id, employee_id });
  else await db().from('department_managers').delete().eq('department_id', department_id).eq('employee_id', employee_id);
  await audit(viewer, `department.manager_${op}`, 'departments', department_id, { employee_id });
  refresh();
}
