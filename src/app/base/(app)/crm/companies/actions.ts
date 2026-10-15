'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { requireCrm } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { canEditRecord, logCrm } from '@/lib/crm/data';

const optText = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().catch(null);
const schema = z.object({
  name: z.string().trim().min(1, 'Company name is required.').max(160),
  industry: optText(80),
  website: optText(200),
  phone: optText(40),
  email: optText(254),
  address1: optText(200),
  city: optText(80),
  state: optText(40),
  postal_code: optText(20),
  notes: optText(5000),
  owner_id: z.string().uuid().nullable().catch(null),
});
const read = (fd: FormData) =>
  schema.safeParse({
    ...Object.fromEntries(['name', 'industry', 'website', 'phone', 'email', 'address1', 'city', 'state', 'postal_code', 'notes'].map((k) => [k, fd.get(k) ?? ''])),
    owner_id: fd.get('owner_id') || null,
  });

export async function createCompany(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm();
  const parsed = read(fd);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the company.');
  const { data: dupe } = await db().from('crm_companies').select('id').ilike('name', parsed.data.name).limit(1).maybeSingle();
  if (dupe) return fail('A company with that name already exists.');
  const { data, error } = await db()
    .from('crm_companies')
    .insert({ ...parsed.data, owner_id: parsed.data.owner_id ?? viewer.employeeId, created_by: viewer.employeeId })
    .select('id')
    .single();
  if (error || !data) return fail('Couldn’t save the company.');
  await logCrm(viewer, `added the company ${parsed.data.name}`, { company_id: data.id }, 'crm.company_create');
  revalidatePath('/base', 'layout');
  redirect(`/base/crm/companies/${data.id}`);
}

export async function updateCompany(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm();
  const id = z.string().uuid().safeParse(fd.get('id'));
  const parsed = read(fd);
  if (!id.success) return fail('Company not found.');
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the company.');
  const { data: before } = await db().from('crm_companies').select('owner_id').eq('id', id.data).maybeSingle();
  if (!before) return fail('Company not found.');
  if (!canEditRecord(viewer, before.owner_id)) return fail('Only the owner or a Workflow manager can edit this company.');
  const { error } = await db()
    .from('crm_companies')
    .update({ ...parsed.data, owner_id: viewer.crm === 'manager' || !before.owner_id ? parsed.data.owner_id : before.owner_id })
    .eq('id', id.data);
  if (error) return fail('Couldn’t save the company.');
  await logCrm(viewer, 'updated the company details', { company_id: id.data }, 'crm.company_update');
  revalidatePath('/base', 'layout');
  return done('Company saved.');
}

export async function deleteCompany(fd: FormData) {
  const viewer = await requireCrm({ manager: true });
  const id = z.string().uuid().safeParse(fd.get('id'));
  if (!id.success) return;
  const { data } = await db().from('crm_companies').select('name').eq('id', id.data).maybeSingle();
  if (!data) return;
  await db().from('crm_companies').delete().eq('id', id.data);
  await logCrm(viewer, `deleted the company ${data.name}`, {}, 'crm.company_delete');
  revalidatePath('/base', 'layout');
  redirect('/base/crm/companies');
}
