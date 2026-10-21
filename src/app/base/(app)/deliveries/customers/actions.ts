'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { requireDeliveries } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { logCrm } from '@/lib/crm/data';

const optText = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().catch(null);

const customerSchema = z.object({
  name: z.string().trim().min(1, 'Enter the customer’s name.').max(160),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'That email doesn’t look right.'),
  phone: optText(40),
  address1: optText(200),
});

/** Add a customer straight from Deliveries — saved to Workflow contacts, so both apps share one list. */
export async function createCustomer(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireDeliveries({ dispatcher: true });
  const parsed = customerSchema.safeParse(
    Object.fromEntries(['name', 'email', 'phone', 'address1'].map((k) => [k, fd.get(k) ?? ''])),
  );
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the customer.');
  const { name, ...rest } = parsed.data;
  const [first, ...last] = name.split(/\s+/);
  const v = { ...rest, first_name: first.slice(0, 80), last_name: last.join(' ').slice(0, 80) };
  if (v.email) {
    const { data: dupe } = await db().from('crm_contacts').select('first_name, last_name').ilike('email', v.email).limit(1).maybeSingle();
    if (dupe) return fail(`${`${dupe.first_name} ${dupe.last_name}`.trim()} already has that email — pick them on the order instead.`);
  }
  const { data, error } = await db()
    .from('crm_contacts')
    .insert({ ...v, lifecycle: 'customer', source: 'Delivery', owner_id: viewer.employeeId, created_by: viewer.employeeId })
    .select('id')
    .single();
  if (error || !data) return fail('Couldn’t save the customer.');
  await logCrm(viewer, `added the customer ${name}`,{ contact_id: data.id }, 'crm.contact_create');
  revalidatePath('/base', 'layout');
  return done('Customer added.');
}
