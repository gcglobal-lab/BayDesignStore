'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { requireCrm, type Viewer } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { CacheKeys, invalidate } from '@/lib/base/memo';
import { runAutomations } from '@/lib/crm/automations';
import { canEditRecord, getCrmSetup, logCrm } from '@/lib/crm/data';
import { money, type Deal } from '@/lib/crm/types';

const optText = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().catch(null);
const optUuid = z.string().uuid().nullable().catch(null);

const dealSchema = z.object({
  title: z.string().trim().min(1, 'Give the deal a name.').max(160),
  pipeline_id: z.string().uuid('Choose a pipeline.'),
  stage_id: z.string().uuid('Choose a stage.'),
  value: z.coerce.number().min(0, 'Value can’t be negative.').max(99_999_999).catch(0),
  contact_id: optUuid,
  company_id: optUuid,
  owner_id: optUuid,
  expected_close: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  priority: z.enum(['low', 'normal', 'high']).catch('normal'),
  source: optText(80),
  tags: z.string().max(400).transform((s) => [...new Set(s.split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 12)).catch([]),
  notes: optText(5000),
  new_contact_name: optText(160),
  new_contact_email: optText(254),
  new_contact_phone: optText(40),
});

const read = (fd: FormData) =>
  dealSchema.safeParse({
    ...Object.fromEntries(['title', 'pipeline_id', 'stage_id', 'value', 'source', 'tags', 'notes', 'priority', 'new_contact_name', 'new_contact_email', 'new_contact_phone'].map((k) => [k, fd.get(k) ?? ''])),
    contact_id: fd.get('contact_id') || null,
    company_id: fd.get('company_id') || null,
    owner_id: fd.get('owner_id') || null,
    expected_close: fd.get('expected_close') || null,
  });

/** A contact typed straight into the deal form ("Jane Smith"), reusing one with the same email. */
async function inlineContact(viewer: Viewer, v: z.infer<typeof dealSchema>, ownerId: string | null): Promise<string | null> {
  if (v.contact_id || !v.new_contact_name) return v.contact_id;
  if (v.new_contact_email) {
    const { data } = await db().from('crm_contacts').select('id').ilike('email', v.new_contact_email).limit(1).maybeSingle();
    if (data) return data.id;
  }
  const [first, ...rest] = v.new_contact_name.split(/\s+/);
  const { data } = await db()
    .from('crm_contacts')
    .insert({ first_name: first, last_name: rest.join(' '), email: v.new_contact_email?.toLowerCase() ?? null, phone: v.new_contact_phone, company_id: v.company_id, owner_id: ownerId, lifecycle: 'prospect', source: v.source, created_by: viewer.employeeId })
    .select('id')
    .single();
  return data?.id ?? null;
}

async function stageOk(pipelineId: string, stageId: string) {
  const { pipelines } = await getCrmSetup();
  const stage = pipelines.find((p) => p.id === pipelineId)?.stages.find((s) => s.id === stageId);
  return stage ?? null;
}

const after = () => {
  invalidate(CacheKeys.crmBadges);
  revalidatePath('/base', 'layout');
};

export async function createDeal(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm();
  const parsed = read(fd);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the deal.');
  const v = parsed.data;
  const stage = await stageOk(v.pipeline_id, v.stage_id);
  if (!stage) return fail('Choose a stage in that pipeline.');
  const owner = v.owner_id ?? viewer.employeeId;
  const contactId = await inlineContact(viewer, v, owner);
  let companyId = v.company_id;
  if (!companyId && contactId) {
    const { data } = await db().from('crm_contacts').select('company_id').eq('id', contactId).maybeSingle();
    companyId = data?.company_id ?? null;
  }
  const { data: deal, error } = await db()
    .from('crm_deals')
    .insert({
      title: v.title,
      pipeline_id: v.pipeline_id,
      stage_id: v.stage_id,
      value: v.value,
      contact_id: contactId,
      company_id: companyId,
      owner_id: owner,
      expected_close: v.expected_close,
      priority: v.priority,
      source: v.source,
      tags: v.tags,
      notes: v.notes,
      position: -Date.now() / 1000,
      created_by: viewer.employeeId,
    })
    .select('id, owner_id, contact_id, company_id, tags')
    .single();
  if (error || !deal) return fail('Couldn’t create the deal. Please try again.');
  if (contactId) await db().from('crm_contacts').update({ lifecycle: 'prospect' }).eq('id', contactId).eq('lifecycle', 'lead');
  await logCrm(viewer, `created the deal “${v.title}” (${money(v.value)}) in ${stage.name}`, { deal_id: deal.id, contact_id: contactId, company_id: companyId }, 'crm.deal_create');
  await runAutomations('deal_created', { deal, actorId: viewer.employeeId });
  after();
  redirect(`/base/crm/deals/${deal.id}`);
}

export async function updateDeal(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm();
  const id = z.string().uuid().safeParse(fd.get('id'));
  const parsed = read(fd);
  if (!id.success) return fail('Deal not found.');
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the deal.');
  const { data: before } = await db().from('crm_deals').select('*').eq('id', id.data).maybeSingle<Deal>();
  if (!before) return fail('Deal not found.');
  if (!canEditRecord(viewer, before.owner_id)) return fail('Only the owner or a Workflow manager can edit this deal.');
  const v = parsed.data;
  const stage = await stageOk(v.pipeline_id, v.stage_id);
  if (!stage) return fail('Choose a stage in that pipeline.');
  const contactId = await inlineContact(viewer, v, v.owner_id ?? before.owner_id);
  const update = {
    title: v.title,
    pipeline_id: v.pipeline_id,
    stage_id: v.stage_id,
    value: v.value,
    contact_id: contactId,
    company_id: v.company_id,
    owner_id: viewer.crm === 'manager' || !before.owner_id ? v.owner_id : before.owner_id,
    expected_close: v.expected_close,
    priority: v.priority,
    source: v.source,
    tags: v.tags,
    notes: v.notes,
    ...(v.stage_id !== before.stage_id ? { stage_changed_at: new Date().toISOString() } : {}),
  };
  const { error } = await db().from('crm_deals').update(update).eq('id', id.data);
  if (error) return fail('Couldn’t save the deal. Please try again.');
  const changes: string[] = [];
  if (Number(before.value) !== v.value) changes.push(`value ${money(before.value)} → ${money(v.value)}`);
  if (before.stage_id !== v.stage_id) changes.push(`stage → ${stage.name}`);
  if (before.owner_id !== update.owner_id) changes.push('owner');
  if (before.expected_close !== v.expected_close) changes.push('close date');
  if (before.title !== v.title) changes.push('name');
  await logCrm(viewer, `updated the deal${changes.length ? `: ${changes.join(', ')}` : ''}`, { deal_id: id.data, contact_id: contactId }, 'crm.deal_update');
  if (before.stage_id !== v.stage_id) await runAutomations('deal_stage_changed', { deal: { id: id.data, owner_id: update.owner_id, contact_id: contactId, company_id: v.company_id, tags: v.tags }, stageId: v.stage_id, actorId: viewer.employeeId });
  after();
  return done('Deal saved.');
}

/** Drag-and-drop on the board: put a deal in a stage (and at a position inside that column). */
export async function moveDeal(id: string, stageId: string, position: number): Promise<ActionResult> {
  const viewer = await requireCrm();
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(stageId).success || !Number.isFinite(position)) return fail('Invalid move.');
  const { data: deal } = await db().from('crm_deals').select('id, title, pipeline_id, stage_id, owner_id, contact_id, company_id, tags, status').eq('id', id).maybeSingle();
  if (!deal) return fail('Deal not found.');
  if (!canEditRecord(viewer, deal.owner_id)) return fail('Only the owner or a Workflow manager can move this deal.');
  const stage = await stageOk(deal.pipeline_id, stageId);
  if (!stage) return fail('That stage isn’t in this pipeline.');
  const changed = deal.stage_id !== stageId;
  await db()
    .from('crm_deals')
    .update({ stage_id: stageId, position, ...(changed ? { stage_changed_at: new Date().toISOString() } : {}) })
    .eq('id', id);
  if (changed) {
    await logCrm(viewer, `moved “${deal.title}” to ${stage.name}`, { deal_id: id, contact_id: deal.contact_id }, 'crm.deal_move');
    await runAutomations('deal_stage_changed', { deal, stageId, actorId: viewer.employeeId });
  }
  after();
  return done();
}

/** Won / lost / re-open. Winning makes the contact a customer. */
export async function setDealStatus(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm();
  const parsed = z
    .object({ id: z.string().uuid(), status: z.enum(['open', 'won', 'lost']), lost_reason: z.string().trim().max(200).optional() })
    .safeParse({ id: fd.get('id'), status: fd.get('status'), lost_reason: fd.get('lost_reason') ?? undefined });
  if (!parsed.success) return fail('Invalid request.');
  const { id, status, lost_reason } = parsed.data;
  const { data: deal } = await db().from('crm_deals').select('id, title, value, owner_id, contact_id, company_id, tags').eq('id', id).maybeSingle();
  if (!deal) return fail('Deal not found.');
  if (!canEditRecord(viewer, deal.owner_id)) return fail('Only the owner or a Workflow manager can close this deal.');
  if (status === 'lost' && !lost_reason) return fail('Choose why the deal was lost.');
  await db()
    .from('crm_deals')
    .update({ status, lost_reason: status === 'lost' ? lost_reason : null, closed_at: status === 'open' ? null : new Date().toISOString() })
    .eq('id', id);
  if (status === 'won' && deal.contact_id) await db().from('crm_contacts').update({ lifecycle: 'customer' }).eq('id', deal.contact_id).in('lifecycle', ['lead', 'prospect', 'past_customer']);
  const text = status === 'won' ? `won “${deal.title}” (${money(deal.value)}) 🎉` : status === 'lost' ? `marked “${deal.title}” as lost — ${lost_reason}` : `re-opened “${deal.title}”`;
  await logCrm(viewer, text, { deal_id: id, contact_id: deal.contact_id }, `crm.deal_${status}`);
  if (status !== 'open') await runAutomations(status === 'won' ? 'deal_won' : 'deal_lost', { deal, actorId: viewer.employeeId });
  after();
  return done(status === 'won' ? 'Deal won — congratulations!' : status === 'lost' ? 'Deal marked as lost.' : 'Deal re-opened.');
}

export async function deleteDeal(fd: FormData) {
  const viewer = await requireCrm({ manager: true });
  const id = z.string().uuid().safeParse(fd.get('id'));
  if (!id.success) return;
  const { data } = await db().from('crm_deals').select('title').eq('id', id.data).maybeSingle();
  if (!data) return;
  await db().from('crm_deals').delete().eq('id', id.data);
  await logCrm(viewer, `deleted the deal “${data.title}”`, {}, 'crm.deal_delete');
  after();
  redirect('/base/crm/deals');
}
