'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireCrm } from '@/lib/base/auth';
import { db } from '@/lib/base/db';

const isEmail = (v: string) => /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(v);
const email = (label: string) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .refine((v) => v === '' || isEmail(v), `The ${label} doesn’t look right.`);
/** One or more addresses, separated by commas, semicolons or spaces — stored as "a@x.com, b@y.com". */
const emailList = (label: string) =>
  z
    .string()
    .max(1000)
    .transform((s) => [...new Set(s.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))])
    .refine((list) => list.every(isEmail), `One of the ${label} addresses doesn’t look right.`)
    .transform((list) => (list.length ? list.join(', ') : null));

const vendorSchema = z.object({
  name: z.string().trim().min(1, 'Enter the vendor’s name.').max(160),
  vendor_number: z.string().trim().min(1, 'Enter the vendor number.').max(60),
  email: email('email').refine((v) => v !== '', 'Enter the vendor’s email.'),
  cc: emailList('CC'),
  bcc: emailList('BCC'),
  address: z.string().trim().min(1, 'Enter the vendor’s address.').max(400),
  contact_email: email('contact person’s email').transform((v) => (v === '' ? null : v)),
});

const read = (fd: FormData) => vendorSchema.safeParse(Object.fromEntries(['name', 'vendor_number', 'email', 'cc', 'bcc', 'address', 'contact_email'].map((k) => [k, String(fd.get(k) ?? '')])));

async function numberTaken(vendorNumber: string, exceptId?: string) {
  let q = db().from('crm_vendors').select('id').ilike('vendor_number', vendorNumber.replace(/[%_]/g, '\\$&')).limit(1);
  if (exceptId) q = q.neq('id', exceptId);
  return Boolean((await q.maybeSingle()).data);
}

export async function createVendor(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm();
  const parsed = read(fd);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the vendor.');
  if (await numberTaken(parsed.data.vendor_number)) return fail(`Vendor number ${parsed.data.vendor_number} is already used.`);
  const { data, error } = await db().from('crm_vendors').insert({ ...parsed.data, created_by: viewer.employeeId }).select('id').single();
  if (error || !data) return fail('Couldn’t save the vendor.');
  await audit(viewer, 'crm.vendor_create', 'crm_vendors', data.id, { text: `added the vendor ${parsed.data.name}` });
  revalidatePath('/base/crm/vendors');
  return done('Vendor added.');
}

export async function updateVendor(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm();
  const id = z.string().uuid().safeParse(fd.get('id'));
  if (!id.success) return fail('Vendor not found.');
  const parsed = read(fd);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the vendor.');
  if (await numberTaken(parsed.data.vendor_number, id.data)) return fail(`Vendor number ${parsed.data.vendor_number} is already used.`);
  const { data, error } = await db().from('crm_vendors').update(parsed.data).eq('id', id.data).select('id').maybeSingle();
  if (error) return fail('Couldn’t save the vendor.');
  if (!data) return fail('Vendor not found.');
  await audit(viewer, 'crm.vendor_update', 'crm_vendors', id.data, { text: `updated the vendor ${parsed.data.name}` });
  revalidatePath('/base/crm/vendors');
  return done('Vendor saved.');
}

export async function deleteVendor(fd: FormData) {
  const viewer = await requireCrm();
  const id = z.string().uuid().safeParse(fd.get('id'));
  if (!id.success) return;
  const { data } = await db().from('crm_vendors').delete().eq('id', id.data).select('name').maybeSingle();
  if (data) await audit(viewer, 'crm.vendor_delete', 'crm_vendors', id.data, { text: `deleted the vendor ${data.name}` });
  revalidatePath('/base/crm/vendors');
}
