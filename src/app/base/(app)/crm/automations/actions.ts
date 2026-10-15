'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireCrm } from '@/lib/base/auth';
import { db } from '@/lib/base/db';

const schema = z.object({
  name: z.string().trim().min(1, 'Name the automation.').max(120),
  trigger: z.enum(['lead_created', 'deal_created', 'deal_stage_changed', 'deal_won', 'deal_lost', 'quote_accepted']),
  stage_id: z.string().uuid().nullable().catch(null),
  action: z.enum(['create_task', 'assign_owner', 'add_tag', 'set_priority']),
  task_type: z.enum(['task', 'call', 'meeting', 'email']).catch('task'),
  task_subject: z.string().trim().max(200).transform((v) => v || null),
  task_due_days: z.coerce.number().int().min(0).max(365).catch(1),
  assignee_id: z.string().uuid().nullable().catch(null),
  value: z.string().trim().max(80).transform((v) => v || null),
});

/** Workflow managers: add or edit a "when … then …" rule. */
export async function saveAutomation(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm({ manager: true });
  const parsed = schema.safeParse({
    name: fd.get('name'),
    trigger: fd.get('trigger'),
    stage_id: fd.get('stage_id') || null,
    action: fd.get('action'),
    task_type: fd.get('task_type'),
    task_subject: fd.get('task_subject') ?? '',
    task_due_days: fd.get('task_due_days') || 1,
    assignee_id: fd.get('assignee_id') || null,
    value: fd.get('value') ?? '',
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the automation.');
  const v = parsed.data;
  if (v.action === 'create_task' && !v.task_subject) return fail('What should the activity be called?');
  if (v.action === 'assign_owner' && !v.assignee_id) return fail('Choose who to assign.');
  if ((v.action === 'add_tag' || v.action === 'set_priority') && !v.value) return fail(v.action === 'add_tag' ? 'Enter the tag.' : 'Choose the priority.');
  if ((v.action === 'add_tag' || v.action === 'set_priority') && v.trigger === 'lead_created') return fail('Tags and priority apply to deals — pick a deal trigger.');
  const row = { ...v, stage_id: v.trigger === 'deal_stage_changed' ? v.stage_id : null };
  const id = fd.get('id');
  const res = typeof id === 'string' && id ? await db().from('crm_automations').update(row).eq('id', id) : await db().from('crm_automations').insert(row);
  if (res.error) return fail('Couldn’t save the automation.');
  await audit(viewer, 'crm.automation', 'crm_automations', typeof id === 'string' ? id : null, { text: `${id ? 'updated' : 'added'} the automation “${v.name}”` });
  revalidatePath('/base/crm/automations');
  return done('Automation saved.');
}

export async function toggleAutomation(fd: FormData) {
  const viewer = await requireCrm({ manager: true });
  const id = z.string().uuid().safeParse(fd.get('id'));
  if (!id.success) return;
  const active = fd.get('active') === 'true';
  const { data } = await db().from('crm_automations').update({ active }).eq('id', id.data).select('name').maybeSingle();
  await audit(viewer, 'crm.automation', 'crm_automations', id.data, { text: `${active ? 'turned on' : 'paused'} the automation “${data?.name ?? ''}”` });
  revalidatePath('/base/crm/automations');
}

export async function deleteAutomation(fd: FormData) {
  const viewer = await requireCrm({ manager: true });
  const id = z.string().uuid().safeParse(fd.get('id'));
  if (!id.success) return;
  const { data } = await db().from('crm_automations').select('name').eq('id', id.data).maybeSingle();
  await db().from('crm_automations').delete().eq('id', id.data);
  await audit(viewer, 'crm.automation', 'crm_automations', id.data, { text: `deleted the automation “${data?.name ?? ''}”` });
  revalidatePath('/base/crm/automations');
}
