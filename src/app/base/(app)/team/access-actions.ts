'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireAdmin } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { invalidateTeam } from '@/lib/base/memo';
import { crmRoleLabel, deliveriesRoleLabel } from '@/lib/portal/apps';

const schema = z.object({
  id: z.string().uuid(),
  crm_role: z.enum(['none', 'user', 'manager']),
  deliveries_role: z.enum(['none', 'driver', 'dispatcher']),
});

/** Admins only: who can open Workflow and Deliveries (Time is for everyone). */
export async function setAppAccess(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireAdmin();
  const parsed = schema.safeParse({ id: formData.get('id'), crm_role: formData.get('crm_role'), deliveries_role: formData.get('deliveries_role') });
  if (!parsed.success) return fail('Choose an access level for both apps.');
  const { id, crm_role, deliveries_role } = parsed.data;
  const { data: before } = await db().from('employees').select('first_name, last_name, access_level, crm_role, deliveries_role').eq('id', id).maybeSingle();
  if (!before) return fail('Team member not found.');
  if (before.access_level === 'admin') return fail('Admins always have full access to every app.');
  const { error } = await db().from('employees').update({ crm_role, deliveries_role }).eq('id', id);
  if (error) return fail('Couldn’t save the access. Please try again.');
  invalidateTeam();
  await audit(viewer, 'employee.app_access', 'employees', id, {
    subject: `${before.first_name} ${before.last_name}`.trim(),
    changes: [
      ...(before.crm_role !== crm_role ? [{ field: 'Workflow', from: crmRoleLabel[before.crm_role as keyof typeof crmRoleLabel], to: crmRoleLabel[crm_role] }] : []),
      ...(before.deliveries_role !== deliveries_role ? [{ field: 'Deliveries', from: deliveriesRoleLabel[before.deliveries_role as keyof typeof deliveriesRoleLabel], to: deliveriesRoleLabel[deliveries_role] }] : []),
    ],
  });
  revalidatePath('/base', 'layout');
  return done('Saved.');
}
