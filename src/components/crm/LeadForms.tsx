'use client';

import { useState } from 'react';
import { convertLead, createLead, updateLead } from '@/app/base/(app)/crm/leads/actions';
import { ActionForm, Field, SubmitButton } from '@/components/base/forms';
import type { Lead, Person, Pipeline } from '@/lib/crm/types';
import Select from '@/components/ui/Select';

export function LeadForm({ owners, sources, me, lead }: { owners: Person[]; sources: string[]; me: string | null; lead?: Lead }) {
  return (
    <ActionForm action={lead ? updateLead : createLead} className="space-y-4">
      {lead && <input type="hidden" name="id" value={lead.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="l-name"><input id="l-name" name="name" className="b-input" required maxLength={160} defaultValue={lead?.name} /></Field>
        <Field label="Company (optional)" htmlFor="l-co"><input id="l-co" name="company_name" className="b-input" maxLength={160} defaultValue={lead?.company_name ?? ''} /></Field>
        <Field label="Email" htmlFor="l-email"><input id="l-email" name="email" type="email" className="b-input" maxLength={254} defaultValue={lead?.email ?? ''} /></Field>
        <Field label="Phone" htmlFor="l-phone"><input id="l-phone" name="phone" type="tel" className="b-input" maxLength={40} defaultValue={lead?.phone ?? ''} /></Field>
        <Field label="Source" htmlFor="l-source">
          <Select id="l-source" name="source" className="b-input" defaultValue={lead?.source ?? 'Walk-in'}>
            {[...new Set([...sources, ...(lead?.source ? [lead.source] : [])])].map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Estimated value (USD)" htmlFor="l-value"><input id="l-value" name="estimated_value" type="number" min={0} className="b-input" defaultValue={lead?.estimated_value ?? ''} /></Field>
      </div>
      <Field label="Title" htmlFor="l-title" hint="Optional — e.g. “Dining set for new condo”."><input id="l-title" name="title" className="b-input" maxLength={160} defaultValue={lead?.title ?? ''} /></Field>
      <Field label="Owner" htmlFor="l-owner">
        <Select people id="l-owner" name="owner_id" className="b-input" defaultValue={lead ? (lead.owner_id ?? '') : (me ?? '')}>
          <option value="">— Unassigned —</option>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
      </Field>
      <Field label="What are they looking for?" htmlFor="l-msg"><textarea id="l-msg" name="message" className="b-input min-h-[90px]" maxLength={5000} defaultValue={lead?.message ?? ''} /></Field>
      <div className="flex justify-end"><SubmitButton className="b-btn-brass">{lead ? 'Save lead' : 'Add lead'}</SubmitButton></div>
    </ActionForm>
  );
}

export function ConvertLeadForm({ lead, pipelines }: { lead: Lead; pipelines: Pipeline[] }) {
  const [pipelineId, setPipelineId] = useState(pipelines.find((p) => p.is_default)?.id ?? pipelines[0]?.id);
  const stages = pipelines.find((p) => p.id === pipelineId)?.stages ?? [];
  return (
    <ActionForm action={convertLead} className="space-y-4">
      <input type="hidden" name="id" value={lead.id} />
      <Field label="Deal name" htmlFor="c-title"><input id="c-title" name="deal_title" className="b-input" required maxLength={160} defaultValue={lead.title} /></Field>
      <Field label="Value (USD)" htmlFor="c-value"><input id="c-value" name="value" type="number" min={0} className="b-input" defaultValue={lead.estimated_value ?? ''} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Pipeline" htmlFor="c-pipe">
          <Select id="c-pipe" name="pipeline_id" className="b-input" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Stage" htmlFor="c-stage">
          <Select id="c-stage" name="stage_id" className="b-input" key={pipelineId} defaultValue={stages[1]?.id ?? stages[0]?.id}>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      </div>
      {lead.company_name && (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="create_company" className="b-check" defaultChecked /> Also add “{lead.company_name}” as a company</label>
      )}
      <p className="text-xs text-muted">{lead.contact_id ? 'The deal is linked to the existing contact.' : 'A contact is created from the lead’s name, email and phone.'} Notes and to-dos move to the deal.</p>
      <div className="flex justify-end"><SubmitButton className="b-btn-brass">Convert to deal</SubmitButton></div>
    </ActionForm>
  );
}
