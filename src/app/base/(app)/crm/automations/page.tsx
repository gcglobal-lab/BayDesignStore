import type { Metadata } from 'next';
import { Pause, Pencil, Play, Plus, Trash2, Zap } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import { SubmitButton } from '@/components/base/forms';
import { Card, EmptyState, PageHeader } from '@/components/base/ui';
import AutomationForm, { type AutomationValues } from '@/components/crm/AutomationForm';
import { requireCrm } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { fmtDate } from '@/lib/base/time';
import { actionLabel, triggerLabel } from '@/lib/crm/automations';
import { getCrmPeople, getCrmSetup } from '@/lib/crm/data';
import { deleteAutomation, toggleAutomation } from './actions';

export const metadata: Metadata = { title: 'Automations' };

type Rule = AutomationValues & { active: boolean; run_count: number; last_run_at: string | null };

export default async function AutomationsPage() {
  await requireCrm({ manager: true });
  const [{ pipelines }, people, { timezone: zone }, res] = await Promise.all([
    getCrmSetup(),
    getCrmPeople(),
    getSettings(),
    db().from('crm_automations').select('*').order('created_at'),
  ]);
  const rules = must<Rule[]>(res, 'load automations');
  const stageName = new Map(pipelines.flatMap((p) => p.stages.map((s) => [s.id, `${s.name} (${p.name})`] as const)));
  const describe = (r: Rule) => {
    const then =
      r.action === 'create_task'
        ? `create a ${r.task_type === 'task' ? 'to-do' : r.task_type} “${r.task_subject}” due in ${r.task_due_days ?? 1} day(s) for ${r.assignee_id ? people.names.get(r.assignee_id) : 'the owner'}`
        : r.action === 'assign_owner'
          ? `assign it to ${r.assignee_id ? people.names.get(r.assignee_id) : '—'}`
          : r.action === 'add_tag'
            ? `add the tag “${r.value}”`
            : `set priority to ${r.value}`;
    return (
      <>
        <b>When</b> {triggerLabel[r.trigger].toLowerCase()}{r.trigger === 'deal_stage_changed' && r.stage_id ? ` “${stageName.get(r.stage_id) ?? 'a stage'}”` : ''}, <b>then</b> {then}.
      </>
    );
  };

  return (
    <>
      <PageHeader
        plain
        title="Automations"
        description="Let Workflow do the busywork: create follow-ups, assign owners and tag deals automatically when things happen."
        actions={
          <Dialog trigger={<><Plus size={15} /> New automation</>} triggerClassName="b-btn-brass" title="New automation" wide>
            <AutomationForm pipelines={pipelines} owners={people.owners} />
          </Dialog>
        }
      />
      {rules.length === 0 ? (
        <Card><EmptyState icon={<Zap size={20} />} title="No automations yet." /></Card>
      ) : (
        <div className="space-y-3">
          {rules.map((r) => (
            <article key={r.id} className={`b-card flex flex-wrap items-center gap-4 p-4 ${r.active ? '' : 'opacity-60'}`}>
              <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${r.active ? 'bg-amber-500/15 text-amber-700' : 'bg-sand text-muted'}`}><Zap size={18} /></span>
              <div className="min-w-[14rem] flex-1">
                <p className="font-semibold">{r.name} {!r.active && <span className="b-badge-gray ml-1">Paused</span>}</p>
                <p className="text-sm text-muted">{describe(r)}</p>
                <p className="mt-0.5 text-[0.7rem] text-muted">{actionLabel[r.action]} · ran {r.run_count} time{r.run_count === 1 ? '' : 's'}{r.last_run_at ? ` · last ${fmtDate(new Date(r.last_run_at), zone, 'MMM d')}` : ''}</p>
              </div>
              <div className="flex items-center gap-1">
                <form action={toggleAutomation}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="active" value={String(!r.active)} />
                  <SubmitButton className="b-btn-ghost b-btn-sm">{r.active ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Turn on</>}</SubmitButton>
                </form>
                <Dialog trigger={<Pencil size={14} />} triggerClassName="b-btn-quiet b-btn-sm" title="Edit automation" wide>
                  <AutomationForm pipelines={pipelines} owners={people.owners} rule={r} />
                </Dialog>
                <form action={deleteAutomation}>
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton className="b-btn-quiet b-btn-sm" confirm={`Delete “${r.name}”?`}><Trash2 size={14} /></SubmitButton>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
