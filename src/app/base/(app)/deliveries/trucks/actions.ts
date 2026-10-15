'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireDeliveries } from '@/lib/base/auth';
import { db } from '@/lib/base/db';

const schema = z.object({
  name: z.string().trim().min(1, 'Name the truck.').max(80),
  plate: z.string().trim().max(20).transform((v) => v || null),
  capacity_stops: z.coerce.number().int().min(1).max(60).catch(10),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).catch('#6366F1'),
  notes: z.string().trim().max(1000).transform((v) => v || null),
  active: z.boolean(),
});

export async function saveTruck(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireDeliveries({ dispatcher: true });
  const id = fd.get('id');
  const parsed = schema.safeParse({ name: fd.get('name'), plate: fd.get('plate') ?? '', capacity_stops: fd.get('capacity_stops'), color: fd.get('color'), notes: fd.get('notes') ?? '', active: fd.get('active') === 'on' || !id });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the truck.');
  const res = typeof id === 'string' && id ? await db().from('dl_trucks').update(parsed.data).eq('id', id) : await db().from('dl_trucks').insert(parsed.data);
  if (res.error) return fail('Couldn’t save the truck.');
  await audit(viewer, 'delivery.truck', 'dl_trucks', typeof id === 'string' ? id : null, { text: `${id ? 'updated' : 'added'} the truck ${parsed.data.name}` });
  revalidatePath('/base/deliveries', 'layout');
  return done('Truck saved.');
}

export async function deleteTruck(fd: FormData) {
  const viewer = await requireDeliveries({ dispatcher: true });
  const id = z.string().uuid().safeParse(fd.get('id'));
  if (!id.success) return;
  const { data } = await db().from('dl_trucks').delete().eq('id', id.data).select('name').maybeSingle();
  await audit(viewer, 'delivery.truck', 'dl_trucks', id.data, { text: `removed the truck ${data?.name ?? ''}` });
  revalidatePath('/base/deliveries', 'layout');
}
