'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from '@/lib/base/audit';
import { requireManager } from '@/lib/base/auth';
import { db } from '@/lib/base/db';

/** Mark a website inquiry new / read / replied / archived. */
export async function setInquiryStatus(formData: FormData) {
  const viewer = await requireManager();
  const parsed = z
    .object({ id: z.string().uuid(), status: z.enum(['new', 'read', 'replied', 'archived']) })
    .safeParse({ id: formData.get('id'), status: formData.get('status') });
  if (!parsed.success) return;
  await db()
    .from('inquiries')
    .update({ status: parsed.data.status, handled_by: viewer.employeeId, handled_at: new Date().toISOString() })
    .eq('id', parsed.data.id);
  await audit(viewer, `inquiry.${parsed.data.status}`, 'inquiries', parsed.data.id);
  revalidatePath('/base', 'layout');
}
