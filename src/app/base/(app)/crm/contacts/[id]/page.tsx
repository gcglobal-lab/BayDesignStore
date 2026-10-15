import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Ban, Building2, FileText, KanbanSquare, Mail, MapPin, Pencil, Phone, Plus, Trash2, Truck, UserRound } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import { SubmitButton } from '@/components/base/forms';
import { Avatar, Card } from '@/components/base/ui';
import ActivityComposer from '@/components/crm/ActivityComposer';
import DealForm from '@/components/crm/DealForm';
import { ContactForm } from '@/components/crm/RecordForms';
import Timeline from '@/components/crm/Timeline';
import { requireCrm } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { fmtDate, todayYmd } from '@/lib/base/time';
import { canEditRecord, getCrmPeople, getCrmSetup, pickerOptions } from '@/lib/crm/data';
import { contactName, lifecycleLabel, lifecycleTone, money, quoteStatusLabel, quoteStatusTone, type Activity, type Contact, type Deal, type Quote } from '@/lib/crm/types';
import { deleteContact } from '../actions';

export const metadata: Metadata = { title: 'Contact' };

export default async function ContactPage({ params }: PageProps<'/base/crm/contacts/[id]'>) {
  const viewer = await requireCrm();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const contact = must<Contact | null>(await db().from('crm_contacts').select('*').eq('id', id).maybeSingle(), 'load the contact');
  if (!contact) notFound();
  const [{ pipelines, settings }, people, { timezone: zone }, pickers, acts, dealsRes, quotesRes, ordersRes, companyRes, templates] = await Promise.all([
    getCrmSetup(),
    getCrmPeople(),
    getSettings(),
    pickerOptions(),
    db().from('crm_activities').select('*').eq('contact_id', id).order('created_at', { ascending: false }).limit(300),
    db().from('crm_deals').select('*').eq('contact_id', id).order('created_at', { ascending: false }),
    db().from('crm_quotes').select('id, number, title, status, created_at').eq('contact_id', id).order('created_at', { ascending: false }),
    db().from('dl_orders').select('id, number, status, scheduled_date').eq('contact_id', id).order('created_at', { ascending: false }),
    contact.company_id ? db().from('crm_companies').select('id, name').eq('id', contact.company_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    db().from('crm_email_templates').select('id, name, subject, body').order('name'),
  ]);
  const deals = must<Deal[]>(dealsRes, 'load deals');
  const quotes = must<Pick<Quote, 'id' | 'number' | 'title' | 'status' | 'created_at'>[]>(quotesRes, 'load quotes');
  const orders = must<{ id: string; number: number; status: string; scheduled_date: string | null }[]>(ordersRes, 'load deliveries');
  const company = must<{ id: string; name: string } | null>(companyRes, 'load the company');
  const activities = must<Activity[]>(acts, 'load the timeline');
  const name = contactName(contact);
  const editable = canEditRecord(viewer, contact.owner_id);
  const won = deals.filter((d) => d.status === 'won').reduce((s, d) => s + Number(d.value), 0);
  const openValue = deals.filter((d) => d.status === 'open').reduce((s, d) => s + Number(d.value), 0);
  const dealTitles = new Map(deals.map((d) => [d.id, d.title]));
  const context = new Map(activities.filter((a) => a.deal_id && dealTitles.has(a.deal_id)).map((a) => [a.id, { href: `/base/crm/deals/${a.deal_id}`, label: dealTitles.get(a.deal_id!)! }]));
  const address = [contact.address1, contact.address2, [contact.city, contact.state, contact.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  return (
    <>
      <Link href="/base/crm/contacts" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> Contacts</Link>
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <Avatar name={name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.9rem] font-semibold leading-tight tracking-tight">{name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className={lifecycleTone[contact.lifecycle]}>{lifecycleLabel[contact.lifecycle]}</span>
            {contact.title && <span>{contact.title}</span>}
            {company && <Link href={`/base/crm/companies/${company.id}`} className="inline-flex items-center gap-1 hover:text-brass-dark"><Building2 size={13} /> {company.name}</Link>}
            <span className="inline-flex items-center gap-1"><UserRound size={13} /> {contact.owner_id ? people.names.get(contact.owner_id) : 'Unassigned'}</span>
            {contact.do_not_contact && <span className="b-badge-red"><Ban size={11} /> Do not contact</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {contact.email && <a href={`mailto:${contact.email}`} className="b-btn-ghost"><Mail size={14} /> Email</a>}
          {contact.phone && <a href={`tel:${contact.phone}`} className="b-btn-ghost"><Phone size={14} /> Call</a>}
          {editable && (
            <Dialog trigger={<><Pencil size={14} /> Edit</>} triggerClassName="b-btn-ghost" title="Edit contact" wide>
              <ContactForm owners={people.owners} companies={pickers.companies} sources={settings.lead_sources} me={viewer.employeeId} contact={contact} />
            </Dialog>
          )}
          {viewer.crm === 'manager' && (
            <form action={deleteContact}>
              <input type="hidden" name="id" value={contact.id} />
              <SubmitButton className="b-btn-quiet" confirm={`Delete ${name} and their notes? Deals stay, without a contact.`}><Trash2 size={14} /></SubmitButton>
            </form>
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Won', money(won)],
          ['Open deals', money(openValue)],
          ['Deals', String(deals.length)],
          ['Last activity', contact.last_activity_at ? fmtDate(new Date(contact.last_activity_at), zone, 'MMM d') : 'Never'],
        ].map(([k, v]) => (
          <div key={k} className="b-card px-4 py-3">
            <p className="text-xs text-muted">{k}</p>
            <p className="text-xl font-semibold">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <ActivityComposer
            links={{ contact_id: contact.id, company_id: contact.company_id }}
            owners={people.owners}
            me={{ id: viewer.employeeId, name: viewer.name }}
            today={todayYmd(zone)}
            templates={must(templates, 'load templates')}
            recipient={{ email: contact.do_not_contact ? null : contact.email, first_name: contact.first_name, name }}
          />
          <Card title="Timeline">
            <Timeline items={activities} zone={zone} names={people.names} canDeleteAll={viewer.crm === 'manager'} me={viewer.employeeId} context={context} />
          </Card>
        </div>
        <aside className="space-y-5">
          <Card title="Details">
            <dl className="space-y-2.5 text-sm">
              {contact.email && <div className="flex items-center gap-2"><Mail size={14} className="text-muted" /><a href={`mailto:${contact.email}`} className="truncate hover:text-brass-dark">{contact.email}</a></div>}
              {contact.phone && <div className="flex items-center gap-2"><Phone size={14} className="text-muted" /><a href={`tel:${contact.phone}`} className="hover:text-brass-dark">{contact.phone}</a></div>}
              {address && <div className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 flex-none text-muted" /><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer" className="hover:text-brass-dark">{address}</a></div>}
              <div className="flex justify-between"><dt className="text-muted">Source</dt><dd>{contact.source ?? '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Added</dt><dd>{fmtDate(new Date(contact.created_at), zone, 'MMM d, yyyy')}</dd></div>
              {contact.tags.length > 0 && <div className="flex flex-wrap gap-1 pt-1">{contact.tags.map((t) => <Link key={t} href={`/base/crm/contacts?tag=${encodeURIComponent(t)}`} className="rounded-full bg-sand px-2 py-0.5 text-xs hover:text-brass-dark">{t}</Link>)}</div>}
              {contact.notes && <p className="whitespace-pre-wrap rounded-xl bg-linen px-3 py-2">{contact.notes}</p>}
            </dl>
          </Card>
          <Card
            title="Deals"
            actions={
              <Dialog trigger={<><Plus size={13} /> Deal</>} triggerClassName="b-btn-ghost b-btn-sm" title={`New deal for ${name}`} wide>
                <DealForm pipelines={pipelines} owners={people.owners} contacts={pickers.contacts} companies={pickers.companies} sources={settings.lead_sources} tags={settings.deal_tags} me={viewer.employeeId} defaults={{ contact_id: contact.id, company_id: contact.company_id ?? undefined, title: `${name} — `, source: contact.source ?? undefined }} />
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
                      <KanbanSquare size={14} className="text-muted" /> <span className="flex-1 truncate">{d.title}</span>
                      <span className="font-medium">{money(d.value)}</span>
                      <span className={`${d.status === 'won' ? 'b-badge-green' : d.status === 'lost' ? 'b-badge-red' : 'b-badge-blue'} capitalize`}>{d.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Quotes" actions={<Link href={`/base/crm/quotes/new?contact=${contact.id}`} className="b-btn-ghost b-btn-sm"><Plus size={13} /> Quote</Link>}>
            {quotes.length === 0 ? (
              <p className="text-sm text-muted">No quotes yet.</p>
            ) : (
              <ul className="space-y-2">
                {quotes.map((q) => (
                  <li key={q.id}><Link href={`/base/crm/quotes/${q.id}`} className="flex items-center gap-2 text-sm hover:text-brass-dark"><FileText size={14} className="text-muted" /><span className="flex-1 truncate">#{q.number} · {q.title}</span><span className={quoteStatusTone[q.status]}>{quoteStatusLabel[q.status]}</span></Link></li>
                ))}
              </ul>
            )}
          </Card>
          {(orders.length > 0 || viewer.deliveries === 'dispatcher') && (
            <Card title="Deliveries" actions={viewer.deliveries === 'dispatcher' ? <Link href={`/base/deliveries/orders/new?contact=${contact.id}`} className="b-btn-ghost b-btn-sm"><Plus size={13} /> Delivery</Link> : undefined}>
              {orders.length === 0 ? (
                <p className="text-sm text-muted">No deliveries yet.</p>
              ) : (
                <ul className="space-y-2">
                  {orders.map((o) => (
                    <li key={o.id} className="flex items-center gap-2 text-sm">
                      <Truck size={14} className="text-muted" />
                      {viewer.deliveries === 'dispatcher' ? <Link href={`/base/deliveries/orders/${o.id}`} className="flex-1 hover:text-brass-dark">Order #{o.number}</Link> : <span className="flex-1">Order #{o.number}</span>}
                      <span className="text-muted">{o.scheduled_date ? fmtDate(o.scheduled_date, zone, 'MMM d') : ''}</span>
                      <span className="b-badge-gray capitalize">{o.status.replace('_', ' ')}</span>
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
