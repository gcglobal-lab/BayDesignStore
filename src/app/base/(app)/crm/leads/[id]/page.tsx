import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRightCircle, Ban, Building2, Hand, Mail, Pencil, Phone, PhoneCall, Trash2, UserRound } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import { SubmitButton } from '@/components/base/forms';
import { Avatar, Card } from '@/components/base/ui';
import ActivityComposer from '@/components/crm/ActivityComposer';
import { ConvertLeadForm, LeadForm } from '@/components/crm/LeadForms';
import Timeline from '@/components/crm/Timeline';
import { requireCrm } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { fmtDate, fmtTime, todayYmd } from '@/lib/base/time';
import { canEditRecord, getCrmPeople, getCrmSetup } from '@/lib/crm/data';
import { leadStatusLabel, leadStatusTone, money, type Activity, type Lead } from '@/lib/crm/types';
import { deleteLead, setLeadStatus } from '../actions';

export const metadata: Metadata = { title: 'Lead' };

function StatusButton({ id, status, children, className = 'b-btn-ghost b-btn-sm', reason }: { id: string; status: string; children: React.ReactNode; className?: string; reason?: boolean }) {
  return (
    <form action={setLeadStatus} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      {reason && <input name="reason" className="b-input !w-44 !py-1.5" placeholder="Reason (optional)" maxLength={200} />}
      <SubmitButton className={className}>{children}</SubmitButton>
    </form>
  );
}

export default async function LeadPage({ params }: PageProps<'/base/crm/leads/[id]'>) {
  const viewer = await requireCrm();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const lead = must<Lead | null>(await db().from('crm_leads').select('*').eq('id', id).maybeSingle(), 'load the lead');
  if (!lead) notFound();
  const [{ pipelines, settings }, people, { timezone: zone }, acts, templates] = await Promise.all([
    getCrmSetup(),
    getCrmPeople(),
    getSettings(),
    db().from('crm_activities').select('*').eq('lead_id', id).order('created_at', { ascending: false }).limit(200),
    db().from('crm_email_templates').select('id, name, subject, body').order('name'),
  ]);
  const editable = canEditRecord(viewer, lead.owner_id);
  const open = lead.status !== 'converted' && lead.status !== 'disqualified';

  return (
    <>
      <Link href="/base/crm/leads" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> Leads</Link>
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <Avatar name={lead.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.9rem] font-semibold leading-tight tracking-tight">{lead.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className={leadStatusTone[lead.status]}>{leadStatusLabel[lead.status]}</span>
            <span>{lead.title}</span>
            {lead.estimated_value ? <span className="font-semibold text-ink">{money(lead.estimated_value)}</span> : null}
            <span className="inline-flex items-center gap-1"><UserRound size={13} /> {lead.owner_id ? people.names.get(lead.owner_id) : 'Unassigned'}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lead.status === 'converted' && lead.deal_id && <Link href={`/base/crm/deals/${lead.deal_id}`} className="b-btn-brass"><ArrowRightCircle size={15} /> Open the deal</Link>}
          {open && editable && (
            <Dialog trigger={<><ArrowRightCircle size={15} /> Convert to deal</>} triggerClassName="b-btn-brass" title="Convert to a deal" description="Creates the contact and a deal in the pipeline.">
              <ConvertLeadForm lead={lead} pipelines={pipelines} />
            </Dialog>
          )}
          {!lead.owner_id && viewer.employeeId && <StatusButton id={lead.id} status="claim" className="b-btn-ghost"><Hand size={14} /> Take it</StatusButton>}
          {editable && (
            <Dialog trigger={<><Pencil size={14} /> Edit</>} triggerClassName="b-btn-ghost" title="Edit lead" wide>
              <LeadForm owners={people.owners} sources={settings.lead_sources} me={viewer.employeeId} lead={lead} />
            </Dialog>
          )}
          {viewer.crm === 'manager' && (
            <form action={deleteLead}>
              <input type="hidden" name="id" value={lead.id} />
              <SubmitButton className="b-btn-quiet" confirm="Delete this lead and its notes?"><Trash2 size={14} /></SubmitButton>
            </form>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {lead.message && (
            <Card title="Their message">
              <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed">{lead.message}</p>
              <p className="mt-3 text-xs text-muted">{lead.source ?? 'Lead'} · {fmtDate(new Date(lead.created_at), zone, 'EEE, MMM d, yyyy')} at {fmtTime(lead.created_at, zone)}</p>
            </Card>
          )}
          <ActivityComposer
            links={{ lead_id: lead.id, contact_id: lead.contact_id }}
            owners={people.owners}
            me={{ id: viewer.employeeId, name: viewer.name }}
            today={todayYmd(zone)}
            templates={must(templates, 'load templates')}
            recipient={{ email: lead.email, first_name: lead.name.split(' ')[0], name: lead.name }}
          />
          <Card title="Timeline">
            <Timeline items={must<Activity[]>(acts, 'load the timeline')} zone={zone} names={people.names} canDeleteAll={viewer.crm === 'manager'} me={viewer.employeeId} />
          </Card>
        </div>
        <aside className="space-y-5">
          <Card title="Contact">
            <div className="space-y-2 text-sm">
              {lead.email && <a href={`mailto:${lead.email}`} className="flex items-center gap-2 hover:text-brass-dark"><Mail size={14} className="text-muted" /> {lead.email}</a>}
              {lead.phone && <a href={`tel:${lead.phone}`} className="flex items-center gap-2 hover:text-brass-dark"><Phone size={14} className="text-muted" /> {lead.phone}</a>}
              {lead.company_name && <p className="flex items-center gap-2"><Building2 size={14} className="text-muted" /> {lead.company_name}</p>}
              {lead.contact_id && <Link href={`/base/crm/contacts/${lead.contact_id}`} className="inline-flex items-center gap-1 text-brass-dark">Existing contact →</Link>}
              {lead.inquiry_id && <p className="text-xs text-muted">Also in Time ▸ Website (managers).</p>}
            </div>
          </Card>
          {open && editable && (
            <Card title="Progress">
              <div className="space-y-3">
                {lead.status === 'new' && <StatusButton id={lead.id} status="contacted"><PhoneCall size={13} /> Mark as contacted</StatusButton>}
                {lead.status !== 'qualified' && <StatusButton id={lead.id} status="qualified">Mark as qualified</StatusButton>}
                <div className="border-t border-stone/50 pt-3">
                  <StatusButton id={lead.id} status="disqualified" reason className="b-btn-danger b-btn-sm"><Ban size={13} /> Disqualify</StatusButton>
                </div>
              </div>
            </Card>
          )}
          {lead.status === 'disqualified' && editable && (
            <Card title="Disqualified">
              <p className="mb-3 text-sm text-muted">{lead.disqualify_reason}</p>
              <StatusButton id={lead.id} status="new">Re-open lead</StatusButton>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
