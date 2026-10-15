'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireCrm } from '@/lib/base/auth';
import { db } from '@/lib/base/db';

const optText = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().catch(null);
const schema = z.object({
  name: z.string().trim().min(1, 'Name the product.').max(160),
  sku: optText(60),
  category: optText(80),
  description: optText(2000),
  unit_price: z.coerce.number().min(0, 'Price can’t be negative.').max(9_999_999),
  cost: z.coerce.number().min(0).max(9_999_999).nullable().catch(null),
  active: z.boolean(),
});

/** Add or edit a catalogue item (used on quotes). Anyone with Workflow access. */
export async function saveProduct(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm();
  const id = fd.get('id');
  const parsed = schema.safeParse({
    ...Object.fromEntries(['name', 'sku', 'category', 'description'].map((k) => [k, fd.get(k) ?? ''])),
    unit_price: fd.get('unit_price') || 0,
    cost: fd.get('cost') || null,
    active: fd.get('active') === 'on' || !id,
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the product.');
  const res = typeof id === 'string' && id
    ? await db().from('crm_products').update(parsed.data).eq('id', id)
    : await db().from('crm_products').insert(parsed.data);
  if (res.error) return fail('Couldn’t save the product.');
  await audit(viewer, 'crm.product', 'crm_products', typeof id === 'string' ? id : null, { text: `${id ? 'updated' : 'added'} the product ${parsed.data.name}` });
  revalidatePath('/base/crm/products');
  return done(id ? 'Product saved.' : 'Product added.');
}

export async function deleteProduct(fd: FormData) {
  const viewer = await requireCrm({ manager: true });
  const id = z.string().uuid().safeParse(fd.get('id'));
  if (!id.success) return;
  const { data } = await db().from('crm_products').select('name').eq('id', id.data).maybeSingle();
  await db().from('crm_products').delete().eq('id', id.data);
  await audit(viewer, 'crm.product_delete', 'crm_products', id.data, { text: `deleted the product ${data?.name ?? ''}` });
  revalidatePath('/base/crm/products');
}
