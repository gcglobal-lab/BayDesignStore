'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireDeliveries } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { geocode, invalidateDlSettings } from '@/lib/deliveries/data';

export async function saveDlSettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireDeliveries({ dispatcher: true });
  const parsed = z
    .object({
      depot_name: z.string().trim().min(1).max(80),
      depot_address: z.string().trim().max(250),
      default_start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      window_hours: z.coerce.number().int().min(1).max(12),
      avg_speed_mph: z.coerce.number().int().min(5).max(70),
      failure_reasons: z.string().max(3000),
      tracking_message: z.string().trim().max(500),
    })
    .safeParse(Object.fromEntries(['depot_name', 'depot_address', 'default_start', 'window_hours', 'avg_speed_mph', 'failure_reasons', 'tracking_message'].map((k) => [k, fd.get(k) ?? ''])));
  if (!parsed.success) return fail('Please check the settings.');
  const v = parsed.data;
  const reasons = [...new Set(v.failure_reasons.split(/\r?\n/).map((s) => s.trim().slice(0, 80)).filter(Boolean))].slice(0, 30);
  if (!reasons.length) return fail('Keep at least one reason a delivery can fail.');
  const { data: before } = await db().from('dl_settings').select('depot_address, depot_lat').eq('id', 1).maybeSingle();
  let where: { lat: number; lng: number } | null | undefined;
  if (v.depot_address && (v.depot_address !== before?.depot_address || before?.depot_lat == null)) {
    where = await geocode({ address1: v.depot_address, city: null, state: null, postal_code: null });
    if (!where) return fail('Couldn’t find that warehouse address on the map — check it (street, city, state, zip).');
  }
  await db()
    .from('dl_settings')
    .update({ ...v, failure_reasons: reasons, ...(where ? { depot_lat: where.lat, depot_lng: where.lng } : {}), ...(!v.depot_address ? { depot_lat: null, depot_lng: null } : {}) })
    .eq('id', 1);
  invalidateDlSettings();
  await audit(viewer, 'delivery.settings', 'dl_settings', null, { text: 'updated the Deliveries settings' });
  revalidatePath('/base', 'layout');
  return done('Settings saved.');
}
