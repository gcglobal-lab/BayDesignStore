'use client';

import { useTransition } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { deletePipeline, deleteStage, saveGeneral, saveLists, savePipeline, saveStage, saveTemplate } from '@/app/base/(app)/crm/settings/actions';
import { setTheme } from '@/app/base/theme-actions';
import { ActionForm, Field, SubmitButton } from '@/components/base/forms';
import type { CrmSettings, Person, Stage } from '@/lib/crm/types';
import Select from '@/components/ui/Select';

/** Light / dark / match the device — applies to Workflow and Deliveries, on this device. */
export function AppearancePicker({ current }: { current: 'light' | 'dark' | 'system' }) {
  const [pending, start] = useTransition();
  const options = [
    { v: 'light', label: 'Light', icon: Sun, preview: 'bg-[#F3F4FB] ring-[#DDE0EF]', bar: 'bg-white' },
    { v: 'dark', label: 'Dark', icon: Moon, preview: 'bg-[#0C0E1B] ring-[#323758]', bar: 'bg-[#181B30]' },
    { v: 'system', label: 'Match my device', icon: Monitor, preview: 'bg-gradient-to-r from-[#F3F4FB] from-50% to-[#0C0E1B] to-50% ring-[#9aa0c2]', bar: 'bg-white/70' },
  ] as const;
  return (
    <div className={`grid gap-3 sm:grid-cols-3 ${pending ? 'opacity-70' : ''}`} role="radiogroup" aria-label="Appearance">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={current === o.v}
          onClick={() =>
            start(async () => {
              const fd = new FormData();
              fd.set('theme', o.v);
              await setTheme(fd);
            })
          }
          className={`rounded-2xl border p-3 text-left transition-all ${current === o.v ? 'border-brass ring-2 ring-brass/30' : 'border-stone/60 hover:border-brass/50'}`}
        >
          <div className={`mb-3 h-20 rounded-xl p-2 ring-1 ${o.preview}`}>
            <div className={`h-3 w-2/3 rounded ${o.bar}`} />
            <div className={`mt-2 h-8 rounded-lg ${o.bar}`} />
          </div>
          <span className="flex items-center gap-2 text-sm font-semibold"><o.icon size={15} /> {o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function PipelineForm({ id, name }: { id?: string; name?: string }) {
  return (
    <ActionForm action={savePipeline} resetOnSuccess={!id} className="flex flex-wrap items-start gap-2" showMessage>
      {id && <input type="hidden" name="id" value={id} />}
      <input name="name" className="b-input !w-64" required maxLength={80} defaultValue={name} placeholder="Pipeline name" />
      <SubmitButton className="b-btn-ghost">{id ? 'Rename' : 'Add pipeline'}</SubmitButton>
    </ActionForm>
  );
}

export function DeletePipelineForm({ id }: { id: string }) {
  return (
    <ActionForm action={deletePipeline} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <SubmitButton className="b-btn-quiet b-btn-sm text-red-600" confirm="Delete this pipeline?">Delete pipeline</SubmitButton>
    </ActionForm>
  );
}

export function StageForm({ pipelineId, stage }: { pipelineId: string; stage?: Stage }) {
  return (
    <ActionForm action={saveStage} resetOnSuccess={!stage} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_64px_96px_110px_auto] sm:items-center">
      {stage && <input type="hidden" name="id" value={stage.id} />}
      <input type="hidden" name="pipeline_id" value={pipelineId} />
      <input name="name" className="b-input !py-1.5" required maxLength={60} defaultValue={stage?.name} placeholder="New stage name" aria-label="Stage name" />
      <input name="color" type="color" className="h-9 w-full cursor-pointer rounded-lg border border-stone bg-surface" defaultValue={stage?.color ?? '#6366F1'} aria-label="Colour" />
      <label className="flex items-center gap-1 text-xs text-muted"><input name="probability" type="number" min={0} max={100} className="b-input !py-1.5" defaultValue={stage?.probability ?? 50} aria-label="Win probability" />%</label>
      <label className="flex items-center gap-1 text-xs text-muted" title="Flag deals idle longer than this"><input name="rot_days" type="number" min={1} max={365} className="b-input !py-1.5" defaultValue={stage?.rot_days ?? ''} placeholder="—" aria-label="Idle after days" />d idle</label>
      <SubmitButton className="b-btn-ghost b-btn-sm">{stage ? 'Save' : 'Add stage'}</SubmitButton>
    </ActionForm>
  );
}

export function DeleteStageForm({ stage, others }: { stage: Stage; others: Stage[] }) {
  return (
    <ActionForm action={deleteStage} className="flex flex-wrap items-center gap-2 text-xs">
      <input type="hidden" name="id" value={stage.id} />
      <span className="text-muted">Move its deals to</span>
      <Select name="move_to" className="b-input !w-auto !py-1 text-xs">
        {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </Select>
      <SubmitButton className="b-btn-quiet b-btn-sm text-red-600" confirm={`Delete the stage “${stage.name}”?`}>Delete stage</SubmitButton>
    </ActionForm>
  );
}

export function ListsForm({ settings }: { settings: CrmSettings }) {
  return (
    <ActionForm action={saveLists} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Lead sources (one per line)" htmlFor="s-sources"><textarea id="s-sources" name="lead_sources" className="b-input min-h-[200px]" defaultValue={settings.lead_sources.join('\n')} /></Field>
        <Field label="Lost reasons" htmlFor="s-lost"><textarea id="s-lost" name="lost_reasons" className="b-input min-h-[200px]" defaultValue={settings.lost_reasons.join('\n')} /></Field>
        <Field label="Suggested deal tags" htmlFor="s-tags"><textarea id="s-tags" name="deal_tags" className="b-input min-h-[200px]" defaultValue={settings.deal_tags.join('\n')} /></Field>
      </div>
      <div className="flex justify-end"><SubmitButton className="b-btn-brass">Save lists</SubmitButton></div>
    </ActionForm>
  );
}

export function GeneralForm({ settings, owners }: { settings: CrmSettings; owners: Person[] }) {
  return (
    <ActionForm action={saveGeneral} className="space-y-4">
      <Field label="New website leads go to" htmlFor="s-owner" hint="Who owns leads from the website form and chat. Automations can also assign them.">
        <Select people id="s-owner" name="default_owner_id" className="b-input" defaultValue={settings.default_owner_id ?? ''}>
          <option value="">Nobody — anyone can take them</option>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
      </Field>
      <Field label="Default quote terms" htmlFor="s-terms"><textarea id="s-terms" name="quote_terms" className="b-input min-h-[100px]" maxLength={5000} defaultValue={settings.quote_terms} /></Field>
      <div className="flex justify-end"><SubmitButton className="b-btn-brass">Save</SubmitButton></div>
    </ActionForm>
  );
}

export function TemplateForm({ template }: { template?: { id: string; name: string; subject: string; body: string } }) {
  return (
    <ActionForm action={saveTemplate} resetOnSuccess={!template} className="space-y-3">
      {template && <input type="hidden" name="id" value={template.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="name" className="b-input" required maxLength={120} defaultValue={template?.name} placeholder="Template name" aria-label="Template name" />
        <input name="subject" className="b-input" required maxLength={200} defaultValue={template?.subject} placeholder="Subject" aria-label="Subject" />
      </div>
      <textarea name="body" className="b-input min-h-[120px]" required maxLength={5000} defaultValue={template?.body} placeholder={'Hi {{first_name}},\n\n…\n\n{{my_name}}'} aria-label="Message" />
      <p className="text-xs text-muted">Placeholders: {'{{first_name}}'}, {'{{name}}'}, {'{{my_name}}'}, {'{{deal}}'}</p>
      <div className="flex justify-end"><SubmitButton className="b-btn-ghost">{template ? 'Save template' : 'Add template'}</SubmitButton></div>
    </ActionForm>
  );
}
