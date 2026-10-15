import 'server-only';
import { db } from '@/lib/base/db';
import { CacheKeys, invalidate } from '@/lib/base/memo';

export type Trigger = 'lead_created' | 'deal_created' | 'deal_stage_changed' | 'deal_won' | 'deal_lost' | 'quote_accepted';

export const triggerLabel: Record<Trigger, string> = {
  lead_created: 'A new lead arrives',
  deal_created: 'A deal is created',
  deal_stage_changed: 'A deal moves to a stage',
  deal_won: 'A deal is won',
  deal_lost: 'A deal is lost',
  quote_accepted: 'A quote is accepted',
};
export const actionLabel = {
  create_task: 'Create an activity',
  assign_owner: 'Assign the owner',
  add_tag: 'Add a tag (deals)',
  set_priority: 'Set priority (deals)',
} as const;

type Rule = {
  id: string;
  name: string;
  stage_id: string | null;
  action: keyof typeof actionLabel;
  task_type: 'task' | 'call' | 'meeting' | 'email' | null;
  task_subject: string | null;
  task_due_days: number | null;
  assignee_id: string | null;
  value: string | null;
  run_count: number;
};

type Context = {
  deal?: { id: string; owner_id: string | null; contact_id: string | null; company_id: string | null; tags: string[] } | null;
  lead?: { id: string; owner_id: string | null } | null;
  stageId?: string;
  actorId?: string | null;
};

/**
 * Runs every active rule for an event. Rules never block the change that triggered them:
 * a failing rule is logged and skipped.
 */
export async function runAutomations(trigger: Trigger, ctx: Context): Promise<string[]> {
  const ran: string[] = [];
  try {
    const { data } = await db()
      .from('crm_automations')
      .select('id, name, stage_id, action, task_type, task_subject, task_due_days, assignee_id, value, run_count')
      .eq('trigger', trigger)
      .eq('active', true);
    const rules = ((data ?? []) as Rule[]).filter((r) => trigger !== 'deal_stage_changed' || !r.stage_id || r.stage_id === ctx.stageId);
    for (const r of rules) {
      try {
        await apply(r, ctx);
        ran.push(r.name);
        await db().from('crm_automations').update({ run_count: r.run_count + 1, last_run_at: new Date().toISOString() }).eq('id', r.id);
      } catch (err) {
        console.error('[crm] automation failed', r.name, err);
      }
    }
  } catch (err) {
    console.error('[crm] automations could not load', err);
  }
  if (ran.length) invalidate(CacheKeys.crmBadges);
  return ran;
}

async function apply(r: Rule, ctx: Context) {
  const owner = ctx.deal?.owner_id ?? ctx.lead?.owner_id ?? null;
  switch (r.action) {
    case 'create_task': {
      const due = new Date(Date.now() + (r.task_due_days ?? 1) * 86_400_000);
      due.setUTCHours(14, 0, 0, 0); // 10am in Naples
      await db().from('crm_activities').insert({
        type: r.task_type ?? 'task',
        subject: r.task_subject || r.name,
        due_at: due.toISOString(),
        assignee_id: r.assignee_id ?? owner ?? ctx.actorId ?? null,
        deal_id: ctx.deal?.id ?? null,
        contact_id: ctx.deal?.contact_id ?? null,
        company_id: ctx.deal?.company_id ?? null,
        lead_id: ctx.lead?.id ?? null,
        author_name: `Automation: ${r.name}`.slice(0, 120),
      });
      return;
    }
    case 'assign_owner':
      if (!r.assignee_id) return;
      if (ctx.deal) await db().from('crm_deals').update({ owner_id: r.assignee_id }).eq('id', ctx.deal.id);
      if (ctx.lead) await db().from('crm_leads').update({ owner_id: r.assignee_id }).eq('id', ctx.lead.id);
      return;
    case 'add_tag':
      if (ctx.deal && r.value && !ctx.deal.tags.includes(r.value)) {
        await db().from('crm_deals').update({ tags: [...ctx.deal.tags, r.value] }).eq('id', ctx.deal.id);
      }
      return;
    case 'set_priority':
      if (ctx.deal && (r.value === 'low' || r.value === 'normal' || r.value === 'high')) await db().from('crm_deals').update({ priority: r.value }).eq('id', ctx.deal.id);
      return;
  }
}
