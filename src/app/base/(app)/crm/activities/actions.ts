'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireCrm } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { CacheKeys, invalidate } from '@/lib/base/memo';
import { getSettings } from '@/lib/base/settings';
import { isHm, isYmd, zonedDateTime } from '@/lib/base/time';
import { touchContact } from '@/lib/crm/data';
import { activityTypeLabel } from '@/lib/crm/types';

const uuid = z.string().uuid().nullable().catch(null);
const schema = z.object({
  type: z.enum(['task', 'call', 'meeting', 'email', 'note']),
  subject: z.string().trim().max(200),
  body: z.string().trim().max(5000),
  due_date: z.string().optional(),
  due_time: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high']).catch('normal'),
  outcome: z.string().trim().max(200).optional(),
  assignee_id: uuid,
  logged: z.boolean(),
  contact_id: uuid,
  company_id: uuid,
  deal_id: uuid,
  lead_id: uuid,
});

const field = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' && v !== '' ? v : null;
};

/**
 * Adds a note, or a to-do / call / meeting / email. "logged" ones already happened (a call you
 * just made); the rest are scheduled and show up in Activities until they're marked done.
 */
export async function createActivity(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm();
  const parsed = schema.safeParse({
    type: fd.get('type'),
    subject: fd.get('subject') ?? '',
    body: fd.get('body') ?? '',
    due_date: field(fd, 'due_date') ?? undefined,
    due_time: field(fd, 'due_time') ?? undefined,
    priority: fd.get('priority'),
    outcome: field(fd, 'outcome') ?? undefined,
    assignee_id: field(fd, 'assignee_id'),
    logged: fd.get('logged') === 'on' || fd.get('type') === 'note',
    contact_id: field(fd, 'contact_id'),
    company_id: field(fd, 'company_id'),
    deal_id: field(fd, 'deal_id'),
    lead_id: field(fd, 'lead_id'),
  });
  if (!parsed.success) return fail('Please check the activity and try again.');
  const v = parsed.data;
  if (v.type === 'note' && !v.body) return fail('Write the note first.');
  const subject = v.subject || (v.type === 'note' ? v.body.split('\n')[0].slice(0, 120) : '');
  if (!subject) return fail('Give the activity a short title.');

  let dueAt: string | null = null;
  if (!v.logged && v.due_date) {
    if (!isYmd(v.due_date)) return fail('Pick a valid due date.');
    const { timezone } = await getSettings();
    dueAt = zonedDateTime(v.due_date, v.due_time && isHm(v.due_time) ? v.due_time : '09:00', timezone).toISOString();
  }
  const now = new Date().toISOString();
  const { error } = await db()
    .from('crm_activities')
    .insert({
      type: v.type,
      subject,
      body: v.body || null,
      due_at: v.logged ? now : dueAt,
      done: v.logged,
      done_at: v.logged ? now : null,
      priority: v.priority,
      outcome: v.outcome || null,
      assignee_id: v.logged ? viewer.employeeId : (v.assignee_id ?? viewer.employeeId),
      contact_id: v.contact_id,
      company_id: v.company_id,
      deal_id: v.deal_id,
      lead_id: v.lead_id,
      created_by: viewer.employeeId,
      author_name: viewer.name,
    });
  if (error) return fail('Couldn’t save the activity. Please try again.');
  await touchContact(v.contact_id);
  if (v.lead_id && v.logged && v.type !== 'note') await db().from('crm_leads').update({ status: 'contacted' }).eq('id', v.lead_id).eq('status', 'new');
  invalidate(CacheKeys.crmBadges);
  await audit(viewer, 'crm.activity', 'crm_activities', null, {
    text: v.logged ? `logged ${v.type === 'note' ? 'a note' : `a ${activityTypeLabel[v.type].toLowerCase()}`}: ${subject}` : `scheduled a ${activityTypeLabel[v.type].toLowerCase()}: ${subject}`,
  });
  revalidatePath('/base', 'layout');
  return done(v.type === 'note' ? 'Note added.' : v.logged ? 'Logged.' : 'Scheduled.');
}

/** Tick an activity done (or re-open it). */
export async function toggleActivity(fd: FormData) {
  const viewer = await requireCrm();
  const id = z.string().uuid().safeParse(fd.get('id'));
  if (!id.success) return;
  const isDone = fd.get('done') === 'true';
  const { data } = await db().from('crm_activities').select('subject, contact_id, assignee_id').eq('id', id.data).maybeSingle();
  if (!data) return;
  await db().from('crm_activities').update({ done: isDone, done_at: isDone ? new Date().toISOString() : null }).eq('id', id.data);
  if (isDone) await touchContact(data.contact_id);
  invalidate(CacheKeys.crmBadges);
  await audit(viewer, 'crm.activity_done', 'crm_activities', id.data, { text: `${isDone ? 'completed' : 're-opened'} “${data.subject}”` });
  revalidatePath('/base', 'layout');
}

/** Move a scheduled activity to another day (keeps the time of day). */
export async function rescheduleActivity(fd: FormData) {
  await requireCrm();
  const id = z.string().uuid().safeParse(fd.get('id'));
  const days = Number(fd.get('days'));
  if (!id.success || !Number.isInteger(days) || Math.abs(days) > 60) return;
  const { data } = await db().from('crm_activities').select('due_at').eq('id', id.data).maybeSingle();
  const base = data?.due_at ? new Date(data.due_at) : new Date();
  const next = new Date(Math.max(base.getTime(), Date.now() - 86_400_000) + days * 86_400_000);
  await db().from('crm_activities').update({ due_at: next.toISOString() }).eq('id', id.data);
  invalidate(CacheKeys.crmBadges);
  revalidatePath('/base', 'layout');
}

/** Authors can delete their own notes/activities; Workflow managers can delete any. History lines stay. */
export async function deleteActivity(fd: FormData) {
  const viewer = await requireCrm();
  const id = z.string().uuid().safeParse(fd.get('id'));
  if (!id.success) return;
  const { data } = await db().from('crm_activities').select('type, subject, created_by').eq('id', id.data).maybeSingle();
  if (!data || data.type === 'log') return;
  if (viewer.crm !== 'manager' && data.created_by !== viewer.employeeId) return;
  await db().from('crm_activities').delete().eq('id', id.data);
  invalidate(CacheKeys.crmBadges);
  await audit(viewer, 'crm.activity_delete', 'crm_activities', id.data, { text: `deleted “${data.subject}”` });
  revalidatePath('/base', 'layout');
}
