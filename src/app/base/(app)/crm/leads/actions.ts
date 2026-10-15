'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { requireCrm } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { CacheKeys, invalidate } from '@/lib/base/memo';
import { runAutomations } from '@/lib/crm/automations';
import { canEditRecord, getCrmSetup, logCrm } from '@/lib/crm/data';
import { money, type Lead } from '@/lib/crm/types';

const optText = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().catch(null);

const leadSchema = z.object({
  name: z.string().trim().min(1, 'Enter the person’s name.').max(160),
  title: optText(160),
  email: z.string().trim().toLowerCase().max(254).transform((v) => (v === '' ? null : v)).nullable().refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'That email doesn’t look right.'),
  phone: optText(40),
  company_name: optText(160),
  message: optText(5000),
  source: optText(80),
  estimated_value: z.coerce.number().min(0).max(99_999_999).nullable().catch(null),
  owner_id: z.string().uuid().nullable().catch(null),
});

const refresh = () => {
  invalidate(CacheKeys.crmBadges);
  revalidatePath('/base', 'layout');
};

const read = (fd: FormData) =>
  leadSchema.safeParse({
    ...Object.fromEntries(['name', 'title', 'email', 'phone', 'company_name', 'message', 'source'].map((k) => [k, fd.get(k) ?? ''])),
    estimated_value: fd.get('estimated_value') || null,
    owner_id: fd.get('owner_id') || null,
  });

export async function createLead(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm();
  const parsed = read(fd);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the lead.');
  const v = parsed.data;
  const { data: contact } = v.email ? await db().from('crm_contacts').select('id').ilike('email', v.email).limit(1).maybeSingle() : { data: null };
  const { data: lead, error } = await db()
    .from('crm_leads')
    .insert({ ...v, title: v.title ?? `${v.source ?? 'New lead'} — ${v.name}`, owner_id: v.owner_id ?? viewer.employeeId, contact_id: contact?.id ?? null, created_by: viewer.employeeId })
    .select('id, owner_id')
    .single();
  if (error || !lead) return fail('Couldn’t save the lead. Please try again.');
  await logCrm(viewer, `added the lead ${v.name}${v.source ? ` (${v.source})` : ''}`, { lead_id: lead.id }, 'crm.lead_create');
  await runAutomations('lead_created', { lead, actorId: viewer.employeeId });
  refresh();
  redirect(`/base/crm/leads/${lead.id}`);
}

export async function updateLead(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm();
  const id = z.string().uuid().safeParse(fd.get('id'));
  const parsed = read(fd);
  if (!id.success) return fail('Lead not found.');
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the lead.');
  const { data: before } = await db().from('crm_leads').select('owner_id').eq('id', id.data).maybeSingle();
  if (!before) return fail('Lead not found.');
  if (!canEditRecord(viewer, before.owner_id)) return fail('Only the owner or a Workflow manager can edit this lead.');
  const v = parsed.data;
  const { error } = await db()
    .from('crm_leads')
    .update({ ...v, title: v.title ?? `${v.source ?? 'Lead'} — ${v.name}`, owner_id: viewer.crm === 'manager' || !before.owner_id ? v.owner_id : before.owner_id })
    .eq('id', id.data);
  if (error) return fail('Couldn’t save the lead.');
  await logCrm(viewer, 'updated the lead details', { lead_id: id.data }, 'crm.lead_update');
  refresh();
  return done('Lead saved.');
}

/** New → Contacted / back to New, Disqualified (with a reason), or claim it ("assign to me"). */
export async function setLeadStatus(fd: FormData) {
  const viewer = await requireCrm();
  const parsed = z
    .object({ id: z.string().uuid(), status: z.enum(['new', 'contacted', 'qualified', 'disqualified', 'claim']), reason: z.string().trim().max(200).optional() })
    .safeParse({ id: fd.get('id'), status: fd.get('status'), reason: fd.get('reason') ?? undefined });
  if (!parsed.success) return;
  const { id, status, reason } = parsed.data;
  const { data: lead } = await db().from('crm_leads').select('name, owner_id').eq('id', id).maybeSingle();
  if (!lead) return;
  if (status === 'claim') {
    if (lead.owner_id && viewer.crm !== 'manager') return;
    await db().from('crm_leads').update({ owner_id: viewer.employeeId }).eq('id', id);
    await logCrm(viewer, `took the lead ${lead.name}`, { lead_id: id }, 'crm.lead_claim');
  } else {
    if (!canEditRecord(viewer, lead.owner_id)) return;
    await db().from('crm_leads').update({ status, disqualify_reason: status === 'disqualified' ? (reason || 'Not a fit') : null }).eq('id', id);
    await logCrm(viewer, status === 'disqualified' ? `disqualified the lead ${lead.name} — ${reason || 'Not a fit'}` : `marked the lead ${lead.name} as ${status}`, { lead_id: id }, 'crm.lead_status');
  }
  refresh();
}

/**
 * Qualify a lead into a deal: creates (or reuses) the contact and, if given, a company, then
 * a deal in the chosen pipeline stage. The lead's timeline moves along with it.
 */
export async function convertLead(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm();
  const parsed = z
    .object({
      id: z.string().uuid(),
      deal_title: z.string().trim().min(1, 'Name the deal.').max(160),
      value: z.coerce.number().min(0).max(99_999_999).catch(0),
      pipeline_id: z.string().uuid(),
      stage_id: z.string().uuid(),
      create_company: z.boolean(),
    })
    .safeParse({
      id: fd.get('id'),
      deal_title: fd.get('deal_title'),
      value: fd.get('value') || 0,
      pipeline_id: fd.get('pipeline_id'),
      stage_id: fd.get('stage_id'),
      create_company: fd.get('create_company') === 'on',
    });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the form.');
  const v = parsed.data;
  const { data: lead } = await db().from('crm_leads').select('*').eq('id', v.id).maybeSingle<Lead>();
  if (!lead) return fail('Lead not found.');
  if (lead.status === 'converted' && lead.deal_id) redirect(`/base/crm/deals/${lead.deal_id}`);
  if (!canEditRecord(viewer, lead.owner_id)) return fail('Only the owner or a Workflow manager can convert this lead.');
  const { pipelines } = await getCrmSetup();
  const stage = pipelines.find((p) => p.id === v.pipeline_id)?.stages.find((s) => s.id === v.stage_id);
  if (!stage) return fail('Choose a stage in that pipeline.');
  const owner = lead.owner_id ?? viewer.employeeId;

  let companyId: string | null = null;
  if (v.create_company && lead.company_name) {
    const { data: existing } = await db().from('crm_companies').select('id').ilike('name', lead.company_name).limit(1).maybeSingle();
    companyId = existing?.id ?? (await db().from('crm_companies').insert({ name: lead.company_name, owner_id: owner, created_by: viewer.employeeId }).select('id').single()).data?.id ?? null;
  }
  let contactId = lead.contact_id;
  if (!contactId) {
    const [first, ...rest] = lead.name.split(/\s+/);
    const { data } = await db()
      .from('crm_contacts')
      .insert({ first_name: first, last_name: rest.join(' '), email: lead.email, phone: lead.phone, company_id: companyId, lifecycle: 'prospect', source: lead.source, owner_id: owner, created_by: viewer.employeeId })
      .select('id')
      .single();
    contactId = data?.id ?? null;
  } else {
    await db().from('crm_contacts').update({ lifecycle: 'prospect' }).eq('id', contactId).eq('lifecycle', 'lead');
  }
  const { data: deal, error } = await db()
    .from('crm_deals')
    .insert({ title: v.deal_title, pipeline_id: v.pipeline_id, stage_id: v.stage_id, value: v.value, contact_id: contactId, company_id: companyId, owner_id: owner, source: lead.source, notes: lead.message?.slice(0, 5000) ?? null, position: -Date.now() / 1000, created_by: viewer.employeeId })
    .select('id, owner_id, contact_id, company_id, tags')
    .single();
  if (error || !deal) return fail('Couldn’t create the deal. Please try again.');
  await db().from('crm_leads').update({ status: 'converted', deal_id: deal.id, contact_id: contactId }).eq('id', lead.id);
  // Bring the lead's notes and to-dos along.
  await db().from('crm_activities').update({ deal_id: deal.id, contact_id: contactId }).eq('lead_id', lead.id);
  await logCrm(viewer, `converted the lead ${lead.name} into the deal “${v.deal_title}” (${money(v.value)})`, { lead_id: lead.id, deal_id: deal.id, contact_id: contactId }, 'crm.lead_convert');
  await runAutomations('deal_created', { deal, actorId: viewer.employeeId });
  refresh();
  redirect(`/base/crm/deals/${deal.id}`);
}

export async function deleteLead(fd: FormData) {
  const viewer = await requireCrm({ manager: true });
  const id = z.string().uuid().safeParse(fd.get('id'));
  if (!id.success) return;
  const { data } = await db().from('crm_leads').select('name').eq('id', id.data).maybeSingle();
  if (!data) return;
  await db().from('crm_leads').delete().eq('id', id.data);
  await logCrm(viewer, `deleted the lead ${data.name}`, {}, 'crm.lead_delete');
  refresh();
  redirect('/base/crm/leads');
}
