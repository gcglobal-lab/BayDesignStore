import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Building2, Globe, KanbanSquare, Mail, MapPin, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import { SubmitButton } from '@/components/base/forms';
import { Avatar, Card } from '@/components/base/ui';
import ActivityComposer from '@/components/crm/ActivityComposer';
import DealForm from '@/components/crm/DealForm';
import { CompanyForm, ContactForm } from '@/components/crm/RecordForms';
import Timeline from '@/components/crm/Timeline';
import { requireCrm } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { todayYmd } from '@/lib/base/time';
import { canEditRecord, getCrmPeople, getCrmSetup, pickerOptions } from '@/lib/crm/data';
import { contactName, lifecycleLabel, lifecycleTone, money, type Activity, type Company, type Contact, type Deal } from '@/lib/crm/types';
import { deleteCompany } from '../actions';

export const metadata: Metadata = { title: 'Company' };

export default async function CompanyPage({ params }: PageProps<'/base/crm/companies/[id]'>) {
  const viewer = await requireCrm();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const company = must<Company | null>(await db().from('crm_companies').select('*').eq('id', id).maybeSingle(), 'load the company');
  if (!company) notFound();
  const [{ pipelines, settings }, people, { timezone: zone }, pickers, acts, contactsRes, dealsRes] = await Promise.all([
    getCrmSetup(),
    getCrmPeople(),
    getSettings(),
    pickerOptions(),
    db().from('crm_activities').select('*').eq('company_id', id).order('created_at', { ascending: false }).limit(300),
    db().from('crm_contacts').select('*').eq('company_id', id).order('first_name'),
    db().from('crm_deals').select('*').eq('company_id', id).order('created_at', { ascending: false }),
  ]);
  const contacts = must<Contact[]>(contactsRes, 'load contacts');
  const deals = must<Deal[]>(dealsRes, 'load deals');
  const editable = canEditRecord(viewer, company.owner_id);
  const address = [company.address1, [company.city, company.state, company.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  return (
    <>
      <Link href="/base/crm/companies" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> Companies</Link>
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brass/15 text-brass-dark"><Building2 size={26} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.9rem] font-semibold leading-tight tracking-tight">{company.name}</h1>
          <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted">
            {company.industry && <span>{company.industry}</span>}
            <span>{contacts.length} people</span>
            <span>{money(deals.filter((d) => d.status === 'won').reduce((s, d) => s + Number(d.value), 0))} won</span>
            <span>Owner: {company.owner_id ? people.names.get(company.owner_id) : 'Unassigned'}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && (
            <Dialog trigger={<><Pencil size={14} /> Edit</>} triggerClassName="b-btn-ghost" title="Edit company" wide>
              <CompanyForm owners={people.owners} me={viewer.employeeId} company={company} />
            </Dialog>
          )}
          {viewer.crm === 'manager' && (
            <form action={deleteCompany}>
              <input type="hidden" name="id" value={company.id} />
              <SubmitButton className="b-btn-quiet" confirm={`Delete ${company.name}? People and deals stay, without a company.`}><Trash2 size={14} /></SubmitButton>
            </form>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <ActivityComposer links={{ company_id: company.id }} owners={people.owners} me={{ id: viewer.employeeId, name: viewer.name }} today={todayYmd(zone)} />
          <Card title="Timeline">
            <Timeline items={must<Activity[]>(acts, 'load the timeline')} zone={zone} names={people.names} canDeleteAll={viewer.crm === 'manager'} me={viewer.employeeId} />
          </Card>
        </div>
        <aside className="space-y-5">
          <Card title="Details">
            <div className="space-y-2.5 text-sm">
              {company.phone && <a href={`tel:${company.phone}`} className="flex items-center gap-2 hover:text-brass-dark"><Phone size={14} className="text-muted" /> {company.phone}</a>}
              {company.email && <a href={`mailto:${company.email}`} className="flex items-center gap-2 hover:text-brass-dark"><Mail size={14} className="text-muted" /> {company.email}</a>}
              {company.website && <a href={company.website.startsWith('http') ? company.website : `https://${company.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-brass-dark"><Globe size={14} className="text-muted" /> {company.website}</a>}
              {address && <p className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 text-muted" /> {address}</p>}
              {company.notes && <p className="whitespace-pre-wrap rounded-xl bg-linen px-3 py-2">{company.notes}</p>}
            </div>
          </Card>
          <Card
            title="People"
            actions={
              <Dialog trigger={<><Plus size={13} /> Person</>} triggerClassName="b-btn-ghost b-btn-sm" title={`Add someone at ${company.name}`} wide>
                <ContactForm owners={people.owners} companies={pickers.companies} sources={settings.lead_sources} me={viewer.employeeId} defaultCompany={company.id} />
              </Dialog>
            }
          >
            {contacts.length === 0 ? (
              <p className="text-sm text-muted">Nobody yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {contacts.map((c) => (
                  <li key={c.id} className="flex items-center gap-2.5">
                    <Avatar name={contactName(c)} size="sm" />
                    <Link href={`/base/crm/contacts/${c.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-brass-dark">{contactName(c)}{c.title ? <span className="font-normal text-muted"> · {c.title}</span> : null}</Link>
                    <span className={lifecycleTone[c.lifecycle]}>{lifecycleLabel[c.lifecycle]}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card
            title="Deals"
            actions={
              <Dialog trigger={<><Plus size={13} /> Deal</>} triggerClassName="b-btn-ghost b-btn-sm" title={`New deal with ${company.name}`} wide>
                <DealForm pipelines={pipelines} owners={people.owners} contacts={pickers.contacts} companies={pickers.companies} sources={settings.lead_sources} tags={settings.deal_tags} me={viewer.employeeId} defaults={{ company_id: company.id, title: `${company.name} — ` }} />
              </Dialog>
            }
          >
            {deals.length === 0 ? (
              <p className="text-sm text-muted">No deals yet.</p>
            ) : (
              <ul className="space-y-2">
                {deals.map((d) => (
                  <li key={d.id}>
                    <Link href={`/base/crm/deals/${d.id}`} className="flex items-center gap-2 text-sm hover:text-brass-dark">
                      <KanbanSquare size={14} className="text-muted" /><span className="flex-1 truncate">{d.title}</span><span className="font-medium">{money(d.value)}</span>
                      <span className={`${d.status === 'won' ? 'b-badge-green' : d.status === 'lost' ? 'b-badge-red' : 'b-badge-blue'} capitalize`}>{d.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
