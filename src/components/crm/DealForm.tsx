'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { createDeal, updateDeal } from '@/app/base/(app)/crm/deals/actions';
import { ActionForm, Field, SubmitButton } from '@/components/base/forms';
import type { Deal, Person, Pipeline } from '@/lib/crm/types';

export type Option = { id: string; name: string; company_id?: string | null };

export default function DealForm({
  pipelines,
  owners,
  contacts,
  companies,
  sources,
  tags,
  me,
  deal,
  defaults,
}: {
  pipelines: Pipeline[];
  owners: Person[];
  contacts: Option[];
  companies: Option[];
  sources: string[];
  tags: string[];
  me: string | null;
  deal?: Deal;
  defaults?: { pipeline_id?: string; stage_id?: string; contact_id?: string; company_id?: string; title?: string; value?: number; source?: string };
}) {
  const initialPipeline = deal?.pipeline_id ?? defaults?.pipeline_id ?? pipelines.find((p) => p.is_default)?.id ?? pipelines[0]?.id;
  const [pipelineId, setPipelineId] = useState(initialPipeline ?? '');
  const stages = pipelines.find((p) => p.id === pipelineId)?.stages ?? [];
  const [stageId, setStageId] = useState(deal?.stage_id ?? defaults?.stage_id ?? stages[0]?.id ?? '');
  const [newContact, setNewContact] = useState(false);
  const [companyId, setCompanyId] = useState(deal?.company_id ?? defaults?.company_id ?? '');

  return (
    <ActionForm action={deal ? updateDeal : createDeal} className="space-y-4">
      {deal && <input type="hidden" name="id" value={deal.id} />}
      <Field label="Deal name" htmlFor="d-title">
        <input id="d-title" name="title" className="b-input" required maxLength={160} defaultValue={deal?.title ?? defaults?.title ?? ''} placeholder="e.g. Smith — living room sectional" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Value (USD)" htmlFor="d-value">
          <input id="d-value" name="value" type="number" min={0} step="1" className="b-input" defaultValue={deal?.value ?? defaults?.value ?? ''} placeholder="0" />
        </Field>
        <Field label="Expected close" htmlFor="d-close">
          <input id="d-close" name="expected_close" type="date" className="b-input" defaultValue={deal?.expected_close ?? ''} />
        </Field>
        <Field label="Pipeline" htmlFor="d-pipeline">
          <select
            id="d-pipeline"
            name="pipeline_id"
            className="b-input"
            value={pipelineId}
            onChange={(e) => {
              setPipelineId(e.target.value);
              setStageId(pipelines.find((p) => p.id === e.target.value)?.stages[0]?.id ?? '');
            }}
          >
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Stage" htmlFor="d-stage">
          <select id="d-stage" name="stage_id" className="b-input" value={stageId} onChange={(e) => setStageId(e.target.value)}>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.probability}%</option>)}
          </select>
        </Field>
      </div>

      <div className="rounded-2xl border border-stone/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="b-label !mb-0">Contact person</span>
          <button type="button" onClick={() => setNewContact(!newContact)} className="inline-flex items-center gap-1 text-xs font-semibold text-brass-dark">
            <UserPlus size={13} /> {newContact ? 'Pick an existing contact' : 'New contact'}
          </button>
        </div>
        {newContact ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <input name="new_contact_name" className="b-input" placeholder="Full name" required maxLength={160} />
            <input name="new_contact_email" type="email" className="b-input" placeholder="Email" maxLength={254} />
            <input name="new_contact_phone" className="b-input" placeholder="Phone" maxLength={40} />
          </div>
        ) : (
          <select
            name="contact_id"
            className="b-input"
            defaultValue={deal?.contact_id ?? defaults?.contact_id ?? ''}
            onChange={(e) => {
              const c = contacts.find((x) => x.id === e.target.value);
              if (c?.company_id && !companyId) setCompanyId(c.company_id);
            }}
          >
            <option value="">— None —</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company (optional)" htmlFor="d-company">
          <select id="d-company" name="company_id" className="b-input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">— None —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Owner" htmlFor="d-owner">
          <select id="d-owner" name="owner_id" className="b-input" defaultValue={deal ? (deal.owner_id ?? '') : (me ?? '')}>
            <option value="">— Unassigned —</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <Field label="Source" htmlFor="d-source">
          <select id="d-source" name="source" className="b-input" defaultValue={deal?.source ?? defaults?.source ?? ''}>
            <option value="">—</option>
            {[...new Set([...sources, ...(deal?.source ? [deal.source] : []), ...(defaults?.source ? [defaults.source] : [])])].map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Priority" htmlFor="d-priority">
          <select id="d-priority" name="priority" className="b-input" defaultValue={deal?.priority ?? 'normal'}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </Field>
      </div>
      <Field label="Tags" htmlFor="d-tags" hint={tags.length ? `Comma-separated. Suggestions: ${tags.join(', ')}` : 'Comma-separated'}>
        <input id="d-tags" name="tags" className="b-input" defaultValue={deal?.tags.join(', ') ?? ''} placeholder="VIP, Install needed" />
      </Field>
      <Field label="Notes" htmlFor="d-notes">
        <textarea id="d-notes" name="notes" className="b-input min-h-[80px]" maxLength={5000} defaultValue={deal?.notes ?? ''} placeholder="Rooms, style, budget, timing…" />
      </Field>
      <div className="flex justify-end">
        <SubmitButton className="b-btn-brass">{deal ? 'Save deal' : 'Create deal'}</SubmitButton>
      </div>
    </ActionForm>
  );
}
