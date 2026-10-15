import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ListChecks, Mail, Palette, Settings2, Star, Workflow } from 'lucide-react';
import { SubmitButton } from '@/components/base/forms';
import { Card } from '@/components/base/ui';
import { AppearancePicker, DeletePipelineForm, DeleteStageForm, GeneralForm, ListsForm, PipelineForm, StageForm, TemplateForm } from '@/components/crm/SettingsForms';
import { requireCrm } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { deleteTemplate, moveStage, setDefaultPipeline } from './actions';
import { getCrmPeople, getCrmSetup } from '@/lib/crm/data';
import { readTheme } from '@/lib/portal/theme';
import SettingsLayout, { type SettingsSection } from '@/components/ui/SettingsLayout';

export const metadata: Metadata = { title: 'Workflow settings' };

type Section = 'appearance' | 'pipelines' | 'lists' | 'general' | 'templates';

export default async function CrmSettingsPage({ searchParams }: PageProps<'/base/crm/settings'>) {
  const viewer = await requireCrm();
  const manager = viewer.crm === 'manager';
  const sp = await searchParams;
  const nav: (SettingsSection & { key: Section; manager?: boolean })[] = [
    { key: 'appearance', label: 'Appearance', description: 'Light, dark or match your device', icon: <Palette size={18} />, tone: '#4A154B' },
    { key: 'pipelines', label: 'Pipelines & stages', description: 'Your sales steps and win chances', icon: <Workflow size={18} />, tone: '#1264A3', manager: true },
    { key: 'lists', label: 'Sources, reasons & tags', description: 'The choices people pick from', icon: <ListChecks size={18} />, tone: '#007A5A', manager: true },
    { key: 'general', label: 'Lead routing & quotes', description: 'Who gets new leads, quote terms', icon: <Settings2 size={18} />, tone: '#ECB22E', manager: true },
    { key: 'templates', label: 'Email templates', description: 'Ready-made messages with placeholders', icon: <Mail size={18} />, tone: '#E01E5A', manager: true },
  ];
  const allowed = nav.filter((n) => !n.manager || manager);
  const section: Section = allowed.find((n) => n.key === sp.section)?.key ?? 'appearance';
  const [{ pipelines, settings }, people, theme] = await Promise.all([getCrmSetup(), getCrmPeople(), readTheme()]);

  let panel: ReactNode = null;
  if (section === 'appearance') {
    panel = (
      <Card title="Appearance">
        <p className="mb-4 text-sm text-muted">Choose how Workflow and Deliveries look on this device. Time keeps its usual look; the menu bar is always dark.</p>
        <AppearancePicker current={theme} />
      </Card>
    );
  } else if (section === 'pipelines') {
    panel = (
      <div className="space-y-5">
        {pipelines.map((p) => (
          <Card
            key={p.id}
            title={<h2 className="b-h2 flex items-center gap-2">{p.name} {p.is_default && <span className="b-badge-green"><Star size={10} /> Default</span>}</h2>}
            actions={
              !p.is_default ? (
                <form action={setDefaultPipeline}>
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitButton className="b-btn-ghost b-btn-sm">Make default</SubmitButton>
                </form>
              ) : undefined
            }
          >
            <div className="mb-4"><PipelineForm id={p.id} name={p.name} /></div>
            <p className="mb-2 text-xs text-muted">Stages, left to right. Probability drives the weighted forecast; “idle” flags deals that sit too long.</p>
            <ul className="space-y-3">
              {p.stages.map((s, i) => (
                <li key={s.id} className="rounded-2xl border border-stone/60 p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex flex-col">
                      <form action={moveStage}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dir" value="up" /><button disabled={i === 0} className="rounded p-1 text-muted hover:text-ink disabled:opacity-30" aria-label="Move left"><ArrowUp size={13} /></button></form>
                      <form action={moveStage}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dir" value="down" /><button disabled={i === p.stages.length - 1} className="rounded p-1 text-muted hover:text-ink disabled:opacity-30" aria-label="Move right"><ArrowDown size={13} /></button></form>
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <StageForm pipelineId={p.id} stage={s} />
                      {p.stages.length > 1 && <DeleteStageForm stage={s} others={p.stages.filter((o) => o.id !== s.id)} />}
                    </div>
                  </div>
                </li>
              ))}
              <li className="rounded-2xl border border-dashed border-stone p-3"><StageForm pipelineId={p.id} /></li>
            </ul>
            {pipelines.length > 1 && <div className="mt-4 border-t border-stone/50 pt-3"><DeletePipelineForm id={p.id} /></div>}
          </Card>
        ))}
        <Card title="Add a pipeline">
          <p className="mb-3 text-sm text-muted">For a different sales process — e.g. trade/designer accounts or commercial projects. It starts with four stages you can rename.</p>
          <PipelineForm />
        </Card>
      </div>
    );
  } else if (section === 'lists') {
    panel = <Card title="Sources, reasons & tags"><ListsForm settings={settings} /></Card>;
  } else if (section === 'general') {
    panel = <Card title="Lead routing & quotes"><GeneralForm settings={settings} owners={people.owners} /></Card>;
  } else {
    const templates = must<{ id: string; name: string; subject: string; body: string }[]>(await db().from('crm_email_templates').select('id, name, subject, body').order('name'), 'load templates');
    panel = (
      <div className="space-y-5">
        {templates.map((t) => (
          <Card key={t.id} title={t.name} actions={<form action={deleteTemplate}><input type="hidden" name="id" value={t.id} /><SubmitButton className="b-btn-quiet b-btn-sm text-red-600" confirm="Delete this template?">Delete</SubmitButton></form>}>
            <TemplateForm template={t} />
          </Card>
        ))}
        <Card title="New template"><TemplateForm /></Card>
      </div>
    );
  }

  return (
    <SettingsLayout
      title="Workflow settings"
      subtitle="How Workflow looks and works for your team."
      base="/base/crm/settings"
      sections={allowed}
      active={section}
      footer={!manager ? 'Pipelines, lists and templates are managed by Workflow managers.' : undefined}
    >
      {panel}
    </SettingsLayout>
  );
}
