'use client';

import { useState } from 'react';
import { saveAutomation } from '@/app/base/(app)/crm/automations/actions';
import { ActionForm, Field, SubmitButton } from '@/components/base/forms';
import type { Person, Pipeline } from '@/lib/crm/types';
import Select from '@/components/ui/Select';

const TRIGGERS = {
  lead_created: 'A new lead arrives',
  deal_created: 'A deal is created',
  deal_stage_changed: 'A deal moves to a stage',
  deal_won: 'A deal is won',
  deal_lost: 'A deal is lost',
  quote_accepted: 'A quote is accepted',
} as const;
const ACTIONS = { create_task: 'Create an activity', assign_owner: 'Assign the owner', add_tag: 'Add a tag', set_priority: 'Set priority' } as const;

export type AutomationValues = {
  id: string;
  name: string;
  trigger: keyof typeof TRIGGERS;
  stage_id: string | null;
  action: keyof typeof ACTIONS;
  task_type: string | null;
  task_subject: string | null;
  task_due_days: number | null;
  assignee_id: string | null;
  value: string | null;
};

export default function AutomationForm({ pipelines, owners, rule }: { pipelines: Pipeline[]; owners: Person[]; rule?: AutomationValues }) {
  const [trigger, setTrigger] = useState<keyof typeof TRIGGERS>(rule?.trigger ?? 'deal_stage_changed');
  const [action, setAction] = useState<keyof typeof ACTIONS>(rule?.action ?? 'create_task');
  return (
    <ActionForm action={saveAutomation} resetOnSuccess={!rule} className="space-y-4">
      {rule && <input type="hidden" name="id" value={rule.id} />}
      <Field label="Name" htmlFor="a-name"><input id="a-name" name="name" className="b-input" required maxLength={120} defaultValue={rule?.name} placeholder="e.g. Follow up after the showroom visit" /></Field>
      <div className="rounded-2xl border border-stone/60 p-4">
        <p className="b-eyebrow mb-2">When</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select name="trigger" className="b-input" value={trigger} onChange={(e) => setTrigger(e.target.value as keyof typeof TRIGGERS)}>
            {Object.entries(TRIGGERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          {trigger === 'deal_stage_changed' && (
            <Select name="stage_id" className="b-input" defaultValue={rule?.stage_id ?? ''} required>
              <option value="" disabled>Which stage?</option>
              {pipelines.map((p) => (
                <optgroup key={p.id} label={p.name}>
                  {p.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </optgroup>
              ))}
            </Select>
          )}
        </div>
      </div>
      <div className="rounded-2xl border border-stone/60 p-4">
        <p className="b-eyebrow mb-2">Then</p>
        <Select name="action" className="b-input mb-3" value={action} onChange={(e) => setAction(e.target.value as keyof typeof ACTIONS)}>
          {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        {action === 'create_task' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Select name="task_type" className="b-input" defaultValue={rule?.task_type ?? 'task'}>
              <option value="task">To-do</option>
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
            </Select>
            <input name="task_subject" className="b-input" maxLength={200} defaultValue={rule?.task_subject ?? ''} placeholder="e.g. Send thank-you note" />
            <label className="flex items-center gap-2 text-sm">Due in <input name="task_due_days" type="number" min={0} max={365} className="b-input !w-20" defaultValue={rule?.task_due_days ?? 1} /> day(s)</label>
            <Select people name="assignee_id" className="b-input" defaultValue={rule?.assignee_id ?? ''}>
              <option value="">Assign to the record owner</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </div>
        )}
        {action === 'assign_owner' && (
          <Select people name="assignee_id" className="b-input" defaultValue={rule?.assignee_id ?? ''} required>
            <option value="" disabled>Who?</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        )}
        {action === 'add_tag' && <input name="value" className="b-input" maxLength={80} defaultValue={rule?.value ?? ''} placeholder="Tag, e.g. VIP" required />}
        {action === 'set_priority' && (
          <Select name="value" className="b-input" defaultValue={rule?.value ?? 'high'}>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </Select>
        )}
      </div>
      <div className="flex justify-end"><SubmitButton className="b-btn-brass">{rule ? 'Save' : 'Add automation'}</SubmitButton></div>
    </ActionForm>
  );
}
