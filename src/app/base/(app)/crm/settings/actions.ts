'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireCrm } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { invalidateCrmSetup } from '@/lib/crm/data';

const refresh = () => {
  invalidateCrmSetup();
  revalidatePath('/base', 'layout');
};
const lines = (v: FormDataEntryValue | null, max = 40) => [...new Set(String(v ?? '').split(/\r?\n/).map((s) => s.trim().slice(0, 80)).filter(Boolean))].slice(0, max);

export async function savePipeline(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm({ manager: true });
  const name = z.string().trim().min(1, 'Name the pipeline.').max(80).safeParse(fd.get('name'));
  if (!name.success) return fail(name.error.issues[0].message);
  const id = fd.get('id');
  if (typeof id === 'string' && id) {
    await db().from('crm_pipelines').update({ name: name.data }).eq('id', id);
  } else {
    const { count } = await db().from('crm_pipelines').select('id', { count: 'exact', head: true });
    const { data, error } = await db().from('crm_pipelines').insert({ name: name.data, position: count ?? 0, is_default: !count }).select('id').single();
    if (error || !data) return fail('Couldn’t add the pipeline.');
    await db().from('crm_stages').insert(
      [['New', '#0EA5E9', 10], ['In progress', '#6366F1', 40], ['Proposal', '#EC4899', 70], ['Closing', '#10B981', 90]].map(([n, c, p], i) => ({ pipeline_id: data.id, name: n, color: c, probability: p, position: i })),
    );
  }
  await audit(viewer, 'crm.settings', 'crm_pipelines', typeof id === 'string' ? id : null, { text: `${id ? 'renamed' : 'added'} the pipeline “${name.data}”` });
  refresh();
  return done('Pipeline saved.');
}

export async function setDefaultPipeline(fd: FormData) {
  await requireCrm({ manager: true });
  const id = z.string().uuid().safeParse(fd.get('id'));
  if (!id.success) return;
  await db().from('crm_pipelines').update({ is_default: false }).neq('id', id.data);
  await db().from('crm_pipelines').update({ is_default: true }).eq('id', id.data);
  refresh();
}

export async function deletePipeline(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm({ manager: true });
  const id = z.string().uuid().safeParse(fd.get('id'));
  if (!id.success) return fail('Pipeline not found.');
  const { count } = await db().from('crm_deals').select('id', { count: 'exact', head: true }).eq('pipeline_id', id.data);
  if (count) return fail(`It still has ${count} deal${count === 1 ? '' : 's'} — move or delete them first.`);
  const { count: total } = await db().from('crm_pipelines').select('id', { count: 'exact', head: true });
  if ((total ?? 0) <= 1) return fail('You need at least one pipeline.');
  const { data } = await db().from('crm_pipelines').delete().eq('id', id.data).select('name, is_default').maybeSingle();
  if (data?.is_default) {
    const { data: first } = await db().from('crm_pipelines').select('id').order('position').limit(1).maybeSingle();
    if (first) await db().from('crm_pipelines').update({ is_default: true }).eq('id', first.id);
  }
  await audit(viewer, 'crm.settings', 'crm_pipelines', id.data, { text: `deleted the pipeline “${data?.name ?? ''}”` });
  refresh();
  return done('Pipeline deleted.');
}

const stageSchema = z.object({
  pipeline_id: z.string().uuid(),
  name: z.string().trim().min(1, 'Name the stage.').max(60),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).catch('#6366F1'),
  probability: z.coerce.number().int().min(0).max(100).catch(10),
  rot_days: z.coerce.number().int().min(1).max(365).nullable().catch(null),
});

export async function saveStage(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm({ manager: true });
  const parsed = stageSchema.safeParse({ pipeline_id: fd.get('pipeline_id'), name: fd.get('name'), color: fd.get('color'), probability: fd.get('probability'), rot_days: fd.get('rot_days') || null });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the stage.');
  const id = fd.get('id');
  if (typeof id === 'string' && id) {
    const { pipeline_id: _p, ...rest } = parsed.data;
    void _p;
    await db().from('crm_stages').update(rest).eq('id', id);
  } else {
    const { count } = await db().from('crm_stages').select('id', { count: 'exact', head: true }).eq('pipeline_id', parsed.data.pipeline_id);
    await db().from('crm_stages').insert({ ...parsed.data, position: count ?? 0 });
  }
  await audit(viewer, 'crm.settings', 'crm_stages', typeof id === 'string' ? id : null, { text: `${id ? 'updated' : 'added'} the stage “${parsed.data.name}”` });
  refresh();
  return done('Stage saved.');
}

/** Move a stage left/right in its pipeline. */
export async function moveStage(fd: FormData) {
  await requireCrm({ manager: true });
  const id = z.string().uuid().safeParse(fd.get('id'));
  const dir = fd.get('dir') === 'up' ? -1 : 1;
  if (!id.success) return;
  const { data: stage } = await db().from('crm_stages').select('pipeline_id').eq('id', id.data).maybeSingle();
  if (!stage) return;
  const { data: list } = await db().from('crm_stages').select('id, position').eq('pipeline_id', stage.pipeline_id).order('position');
  const order = (list ?? []).map((s) => s.id);
  const i = order.indexOf(id.data);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  await Promise.all(order.map((sid, pos) => db().from('crm_stages').update({ position: pos }).eq('id', sid)));
  refresh();
}

/** Delete a stage, moving its deals to another stage of the same pipeline. */
export async function deleteStage(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm({ manager: true });
  const id = z.string().uuid().safeParse(fd.get('id'));
  if (!id.success) return fail('Stage not found.');
  const { data: stage } = await db().from('crm_stages').select('pipeline_id, name').eq('id', id.data).maybeSingle();
  if (!stage) return fail('Stage not found.');
  const { data: others } = await db().from('crm_stages').select('id').eq('pipeline_id', stage.pipeline_id).neq('id', id.data).order('position');
  if (!others?.length) return fail('A pipeline needs at least one stage.');
  const target = (fd.get('move_to') as string) || others[0].id;
  if (!others.some((o) => o.id === target)) return fail('Choose a stage in the same pipeline.');
  await db().from('crm_deals').update({ stage_id: target }).eq('stage_id', id.data);
  await db().from('crm_automations').delete().eq('stage_id', id.data);
  await db().from('crm_stages').delete().eq('id', id.data);
  await audit(viewer, 'crm.settings', 'crm_stages', id.data, { text: `deleted the stage “${stage.name}”` });
  refresh();
  return done('Stage deleted.');
}

export async function saveLists(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm({ manager: true });
  const lead_sources = lines(fd.get('lead_sources'));
  const lost_reasons = lines(fd.get('lost_reasons'));
  const deal_tags = lines(fd.get('deal_tags'));
  if (!lead_sources.length || !lost_reasons.length) return fail('Keep at least one source and one lost reason.');
  await db().from('crm_settings').update({ lead_sources, lost_reasons, deal_tags }).eq('id', 1);
  await audit(viewer, 'crm.settings', 'crm_settings', null, { text: 'updated the Workflow lists (sources, lost reasons, tags)' });
  refresh();
  return done('Lists saved.');
}

export async function saveGeneral(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm({ manager: true });
  const owner = z.string().uuid().nullable().catch(null).parse(fd.get('default_owner_id') || null);
  const terms = String(fd.get('quote_terms') ?? '').trim().slice(0, 5000);
  await db().from('crm_settings').update({ default_owner_id: owner, quote_terms: terms }).eq('id', 1);
  await audit(viewer, 'crm.settings', 'crm_settings', null, { text: 'updated lead routing and quote terms' });
  refresh();
  return done('Saved.');
}

export async function saveTemplate(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm({ manager: true });
  const parsed = z
    .object({ name: z.string().trim().min(1).max(120), subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(5000) })
    .safeParse({ name: fd.get('name'), subject: fd.get('subject'), body: fd.get('body') });
  if (!parsed.success) return fail('Fill in the name, subject and message.');
  const id = fd.get('id');
  const res = typeof id === 'string' && id ? await db().from('crm_email_templates').update(parsed.data).eq('id', id) : await db().from('crm_email_templates').insert(parsed.data);
  if (res.error) return fail('Couldn’t save the template.');
  await audit(viewer, 'crm.settings', 'crm_email_templates', null, { text: `saved the email template “${parsed.data.name}”` });
  revalidatePath('/base/crm/settings');
  return done('Template saved.');
}

export async function deleteTemplate(fd: FormData) {
  await requireCrm({ manager: true });
  const id = z.string().uuid().safeParse(fd.get('id'));
  if (id.success) await db().from('crm_email_templates').delete().eq('id', id.data);
  revalidatePath('/base/crm/settings');
}
