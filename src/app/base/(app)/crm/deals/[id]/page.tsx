import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Building2, CalendarDays, FileText, Mail, Pencil, Phone, Plus, Tag, Trash2, Truck, UserRound } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import { SubmitButton } from '@/components/base/forms';
import { Avatar, Card } from '@/components/base/ui';
import ActivityComposer from '@/components/crm/ActivityComposer';
import { DealStatusButtons, StageBar } from '@/components/crm/DealControls';
import DealForm from '@/components/crm/DealForm';
import Timeline from '@/components/crm/Timeline';
import { requireCrm } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { fmtDate, todayYmd } from '@/lib/base/time';
import { canEditRecord, getCrmPeople, getCrmSetup, pickerOptions } from '@/lib/crm/data';
import { contactName, daysSince, money, quoteStatusLabel, quoteStatusTone, type Activity, type Company, type Contact, type Deal, type Quote } from '@/lib/crm/types';
import { deleteDeal } from '../actions';

export const metadata: Metadata = { title: 'Deal' };

export default async function DealPage({ params }: PageProps<'/base/crm/deals/[id]'>) {
  const viewer = await requireCrm();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const deal = must<Deal | null>(await db().from('crm_deals').select('*').eq('id', id).maybeSingle(), 'load the deal');
  if (!deal) notFound();

  const [{ pipelines, settings }, people, { timezone: zone }, pickers, acts, contactRes, companyRes, quotesRes, ordersRes, templatesRes] = await Promise.all([
    getCrmSetup(),
    getCrmPeople(),
    getSettings(),
    pickerOptions(),
    db().from('crm_activities').select('*').eq('deal_id', id).order('created_at', { ascending: false }).limit(300),
    deal.contact_id ? db().from('crm_contacts').select('*').eq('id', deal.contact_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    deal.company_id ? db().from('crm_companies').select('*').eq('id', deal.company_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    db().from('crm_quotes').select('id, number, title, status, created_at').eq('deal_id', id).order('created_at', { ascending: false }),
    db().from('dl_orders').select('id, number, status, scheduled_date').eq('deal_id', id).order('created_at', { ascending: false }),
    db().from('crm_email_templates').select('id, name, subject, body').order('name'),
  ]);
  const contact = must<Contact | null>(contactRes, 'load the contact');
  const company = must<Company | null>(companyRes, 'load the company');
  const quotes = must<Pick<Quote, 'id' | 'number' | 'title' | 'status' | 'created_at'>[]>(quotesRes, 'load quotes');
  const orders = must<{ id: string; number: number; status: string; scheduled_date: string | null }[]>(ordersRes, 'load deliveries');
  const pipeline = pipelines.find((p) => p.id === deal.pipeline_id);
  const stage = pipeline?.stages.find((s) => s.id === deal.stage_id);
  const editable = canEditRecord(viewer, deal.owner_id);
  const weighted = (Number(deal.value) * (stage?.probability ?? 0)) / 100;

  return (
    <>
      <Link href={`/base/crm/deals?pipeline=${deal.pipeline_id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> {pipeline?.name ?? 'Deals'}</Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[1.9rem] font-semibold leading-tight tracking-tight text-ink">{deal.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="text-lg font-semibold text-ink">{money(deal.value)}</span>
            <span title="Value × stage probability">{money(weighted)} weighted</span>
            <span className={`${deal.status === 'won' ? 'b-badge-green' : deal.status === 'lost' ? 'b-badge-red' : 'b-badge-blue'} capitalize`}>{deal.status}{deal.status === 'lost' && deal.lost_reason ? ` · ${deal.lost_reason}` : ''}</span>
            {deal.priority === 'high' && <span className="b-badge-red">High priority</span>}
            <span className="inline-flex items-center gap-1"><UserRound size={13} /> {deal.owner_id ? people.names.get(deal.owner_id) : 'Unassigned'}</span>
            {deal.status === 'open' && <span>{daysSince(deal.stage_changed_at)} days in this stage</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DealStatusButtons id={deal.id} status={deal.status} lostReasons={settings.lost_reasons} disabled={!editable} />
          {editable && (
            <Dialog trigger={<><Pencil size={14} /> Edit</>} triggerClassName="b-btn-ghost" title="Edit deal" wide>
              <DealForm pipelines={pipelines} owners={people.owners} contacts={pickers.contacts} companies={pickers.companies} sources={settings.lead_sources} tags={settings.deal_tags} me={viewer.employeeId} deal={deal} />
            </Dialog>
          )}
          {viewer.crm === 'manager' && (
            <form action={deleteDeal}>
              <input type="hidden" name="id" value={deal.id} />
              <SubmitButton className="b-btn-quiet" confirm="Delete this deal and its timeline? This can’t be undone."><Trash2 size={14} /></SubmitButton>
            </form>
          )}
        </div>
      </div>

      {pipeline && deal.status === 'open' && (
        <div className="mb-6">
          <StageBar dealId={deal.id} stages={pipeline.stages} current={deal.stage_id} disabled={!editable} />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <ActivityComposer
            links={{ deal_id: deal.id, contact_id: deal.contact_id, company_id: deal.company_id }}
            owners={people.owners}
            me={{ id: viewer.employeeId, name: viewer.name }}
            today={todayYmd(zone)}
            templates={must(templatesRes, 'load email templates')}
            recipient={contact ? { email: contact.email, first_name: contact.first_name, name: contactName(contact) } : null}
            dealTitle={deal.title}
          />
          <Card title="Timeline">
            <Timeline items={must<Activity[]>(acts, 'load the timeline')} zone={zone} names={people.names} canDeleteAll={viewer.crm === 'manager'} me={viewer.employeeId} />
          </Card>
        </div>

        <aside className="space-y-5">
          <Card title="Details">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">Pipeline</dt><dd className="text-right">{pipeline?.name} · {stage?.name}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Expected close</dt><dd className="inline-flex items-center gap-1"><CalendarDays size={13} /> {deal.expected_close ? fmtDate(deal.expected_close, zone, 'MMM d, yyyy') : '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Source</dt><dd>{deal.source ?? '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Created</dt><dd>{fmtDate(new Date(deal.created_at), zone, 'MMM d, yyyy')}</dd></div>
              {deal.closed_at && <div className="flex justify-between gap-3"><dt className="text-muted">Closed</dt><dd>{fmtDate(new Date(deal.closed_at), zone, 'MMM d, yyyy')}</dd></div>}
              {deal.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1"><Tag size={13} className="text-muted" />{deal.tags.map((t) => <span key={t} className="rounded-full bg-sand px-2 py-0.5 text-xs">{t}</span>)}</div>
              )}
              {deal.notes && <p className="whitespace-pre-wrap rounded-xl bg-linen px-3 py-2 text-ink/90">{deal.notes}</p>}
            </dl>
          </Card>

          <Card title="People">
            {contact ? (
              <div className="flex items-start gap-3">
                <Avatar name={contactName(contact)} />
                <div className="min-w-0 text-sm">
                  <Link href={`/base/crm/contacts/${contact.id}`} className="font-semibold hover:text-brass-dark">{contactName(contact)}</Link>
                  {contact.title && <p className="text-xs text-muted">{contact.title}</p>}
                  {contact.email && <a href={`mailto:${contact.email}`} className="mt-1 flex items-center gap-1.5 truncate text-muted hover:text-brass-dark"><Mail size={13} /> {contact.email}</a>}
                  {contact.phone && <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-muted hover:text-brass-dark"><Phone size={13} /> {contact.phone}</a>}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">No contact linked.</p>
            )}
            {company && (
              <Link href={`/base/crm/companies/${company.id}`} className="mt-4 flex items-center gap-2 border-t border-stone/50 pt-3 text-sm font-medium hover:text-brass-dark"><Building2 size={15} className="text-muted" /> {company.name}</Link>
            )}
          </Card>

          <Card title="Quotes" actions={<Link href={`/base/crm/quotes/new?deal=${deal.id}`} className="b-btn-ghost b-btn-sm"><Plus size={13} /> Quote</Link>}>
            {quotes.length === 0 ? (
              <p className="text-sm text-muted">No quotes yet.</p>
            ) : (
              <ul className="space-y-2">
                {quotes.map((q) => (
                  <li key={q.id}>
                    <Link href={`/base/crm/quotes/${q.id}`} className="flex items-center gap-2 text-sm hover:text-brass-dark">
                      <FileText size={14} className="text-muted" /> <span className="flex-1 truncate">#{q.number} · {q.title}</span>
                      <span className={quoteStatusTone[q.status]}>{quoteStatusLabel[q.status]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {viewer.deliveries === 'dispatcher' && (
            <Card title="Deliveries" actions={<Link href={`/base/deliveries/orders/new?deal=${deal.id}`} className="b-btn-ghost b-btn-sm"><Plus size={13} /> Delivery</Link>}>
              {orders.length === 0 ? (
                <p className="text-sm text-muted">No deliveries scheduled.</p>
              ) : (
                <ul className="space-y-2">
                  {orders.map((o) => (
                    <li key={o.id}>
                      <Link href={`/base/deliveries/orders/${o.id}`} className="flex items-center gap-2 text-sm hover:text-brass-dark">
                        <Truck size={14} className="text-muted" /> <span className="flex-1">Order #{o.number}{o.scheduled_date ? ` · ${fmtDate(o.scheduled_date, zone, 'MMM d')}` : ''}</span>
                        <span className="b-badge-gray capitalize">{o.status.replace('_', ' ')}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
