'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from '@/lib/base/audit';
import { requireManager } from '@/lib/base/auth';
import { db } from '@/lib/base/db';

export async function reviewAvailability(formData: FormData) {
  const viewer = await requireManager();
  const parsed = z.object({ id: z.string().uuid(), decision: z.enum(['approved', 'denied']) }).safeParse({ id: formData.get('id'), decision: formData.get('decision') });
  if (!parsed.success) return;
  const { data: req } = await db().from('availability_requests').select('employee_id, status').eq('id', parsed.data.id).maybeSingle();
  if (!req || req.status !== 'pending') return;
  if (req.employee_id === viewer.employeeId && viewer.level !== 'admin') return;

  await db()
    .from('availability_requests')
    .update({ status: parsed.data.decision, reviewed_by: viewer.employeeId, reviewed_at: new Date().toISOString() })
    .eq('id', parsed.data.id)
    .eq('status', 'pending');
  await audit(viewer, `availability.${parsed.data.decision}`, 'availability_requests', parsed.data.id);
  revalidatePath('/base', 'layout');
}
