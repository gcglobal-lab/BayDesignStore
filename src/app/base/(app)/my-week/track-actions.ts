'use server';

import { after } from 'next/server';
import { z } from 'zod';
import { requireEmployee } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { PING_RETENTION_DAYS } from '@/lib/base/trail';

const pingSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    accuracy: z.number().finite().min(0).max(100_000),
    speed: z.number().finite().min(0).max(200).nullable(),
    ageMs: z.number().finite().min(-5_000).max(10 * 60_000),
  }),
  z.object({ status: z.enum(['denied', 'unavailable']) }),
]);

export type LocationPing = z.infer<typeof pingSchema>;

/**
 * One reading from a phone that is on the clock. Off the clock nothing is saved, and
 * `tracking: false` tells the phone to stop sending.
 */
export async function trackLocation(input: LocationPing): Promise<{ tracking: boolean }> {
  const viewer = await requireEmployee();
  const parsed = pingSchema.safeParse(input);
  if (!parsed.success) return { tracking: true };
  const ping = parsed.data;

  const { data: entry } = await db().from('time_entries').select('id').eq('employee_id', viewer.employeeId).is('clock_out_at', null).maybeSingle();
  if (!entry) return { tracking: false };

  const now = Date.now();
  const { error } = await db()
    .from('location_pings')
    .insert(
      ping.status === 'ok'
        ? {
            time_entry_id: entry.id,
            employee_id: viewer.employeeId,
            recorded_at: new Date(now - Math.max(0, ping.ageMs)).toISOString(),
            status: 'ok',
            lat: ping.lat,
            lng: ping.lng,
            accuracy_m: Math.round(ping.accuracy),
            speed_mps: ping.speed,
          }
        : { time_entry_id: entry.id, employee_id: viewer.employeeId, recorded_at: new Date(now).toISOString(), status: ping.status },
    );
  if (error) console.error('[track] saving a reading failed', error.message);

  // Now and then, clear out readings past the retention window.
  if (Math.random() < 0.01) {
    after(async () => {
      const cutoff = new Date(now - PING_RETENTION_DAYS * 86_400_000).toISOString();
      const { error: purgeError } = await db().from('location_pings').delete().lt('created_at', cutoff);
      if (purgeError) console.error('[track] clearing old readings failed', purgeError.message);
    });
  }
  return { tracking: true };
}
