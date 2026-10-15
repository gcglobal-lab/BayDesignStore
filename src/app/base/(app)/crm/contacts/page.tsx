import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Contact as ContactIcon, Download, Plus, Search, Upload } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import { Avatar, Card, EmptyState, PageHeader } from '@/components/base/ui';
import { ContactForm, ImportContactsForm } from '@/components/crm/RecordForms';
import { requireCrm } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { fmtDate } from '@/lib/base/time';
import { getCrmPeople, getCrmSetup, labelsFor, pickerOptions, searchTerm } from '@/lib/crm/data';
import { contactName, lifecycleLabel, lifecycleTone, type Contact, type Lifecycle } from '@/lib/crm/types';
import Select from '@/components/ui/Select';

export const metadata: Metadata = { title: 'Contacts' };
const PAGE = 50;

export default async function ContactsPage({ searchParams }: PageProps<'/base/crm/contacts'>) {
  const viewer = await requireCrm();
  const sp = await searchParams;
  const q = searchTerm(sp.q);
  const stage = typeof sp.stage === 'string' && sp.stage in lifecycleLabel ? (sp.stage as Lifecycle) : null;
  const owner = typeof sp.owner === 'string' ? sp.owner : '';
  const tag = searchTerm(sp.tag);
  const page = Math.max(0, Number(sp.page) || 0);
  const [{ settings }, people, { timezone: zone }, pickers] = await Promise.all([getCrmSetup(), getCrmPeople(), getSettings(), pickerOptions()]);

  let query = db().from('crm_contacts').select('*', { count: 'exact' }).order('updated_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,city.ilike.%${q}%`);
  if (stage) query = query.eq('lifecycle', stage);
  if (owner === 'me' && viewer.employeeId) query = query.eq('owner_id', viewer.employeeId);
  else if (/^[0-9a-f-]{36}$/.test(owner)) query = query.eq('owner_id', owner);
  if (tag) query = query.contains('tags', [tag]);
  const res = await query;
  const contacts = must<Contact[]>(res, 'load contacts');
  const total = res.count ?? contacts.length;
  const companies = await labelsFor('crm_companies', contacts.map((c) => c.company_id));
  const params = (patch: Record<string, string | number>) => `/base/crm/contacts?${new URLSearchParams({ ...(q ? { q } : {}), ...(stage ? { stage } : {}), ...(owner ? { owner } : {}), ...(tag ? { tag } : {}), ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, String(v)])) })}`;

  return (
    <>
      <PageHeader
        plain
        title="Contacts"
        description={`${total} ${total === 1 ? 'person' : 'people'} — customers, prospects, designers and partners.`}
        actions={
          <>
            <a href={`/base/crm/export?type=contacts${stage ? `&stage=${stage}` : ''}`} className="b-btn-ghost"><Download size={15} /> Export</a>
            <Dialog trigger={<><Upload size={15} /> Import</>} triggerClassName="b-btn-ghost" title="Import contacts from CSV">
              <ImportContactsForm />
            </Dialog>
            <Dialog trigger={<><Plus size={15} /> New contact</>} triggerClassName="b-btn-brass" title="New contact" wide>
              <ContactForm owners={people.owners} companies={pickers.companies} sources={settings.lead_sources} me={viewer.employeeId} />
            </Dialog>
          </>
        }
      />

      <form className="mb-5 flex flex-wrap items-center gap-2" action="/base/crm/contacts">
        <label className="relative min-w-[14rem] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={q} placeholder="Search name, email, phone, city…" className="b-input !py-2 pl-9" />
        </label>
        <Select name="stage" defaultValue={stage ?? ''} className="b-input !w-auto !py-2">
          <option value="">All stages</option>
          {(Object.keys(lifecycleLabel) as Lifecycle[]).map((k) => <option key={k} value={k}>{lifecycleLabel[k]}</option>)}
        </Select>
        <Select people name="owner" defaultValue={owner} className="b-input !w-auto !py-2">
          <option value="">Any owner</option>
          {viewer.employeeId && <option value="me">Mine</option>}
          {people.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        <input name="tag" defaultValue={tag} placeholder="Tag" className="b-input !w-28 !py-2" />
        <button type="submit" className="b-btn-ghost">Filter</button>
      </form>

      <Card pad={false}>
        {contacts.length === 0 ? (
          <EmptyState icon={<ContactIcon size={20} />} title="No contacts found.">Add one, import a CSV, or convert a lead.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="b-table">
              <thead><tr><th>Name</th><th>Stage</th><th>Email / phone</th><th>Company</th><th>Owner</th><th>Last activity</th></tr></thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/base/crm/contacts/${c.id}`} className="flex items-center gap-2.5 font-medium hover:text-brass-dark">
                        <Avatar name={contactName(c)} size="sm" /> {contactName(c)}
                      </Link>
                      {c.tags.length > 0 && <p className="ml-10 mt-0.5 text-[0.68rem] text-muted">{c.tags.join(' · ')}</p>}
                    </td>
                    <td><span className={lifecycleTone[c.lifecycle]}>{lifecycleLabel[c.lifecycle]}</span></td>
                    <td className="text-muted">
                      {c.email && <a href={`mailto:${c.email}`} className="block hover:text-brass-dark">{c.email}</a>}
                      {c.phone && <a href={`tel:${c.phone}`} className="block hover:text-brass-dark">{c.phone}</a>}
                    </td>
                    <td>{c.company_id ? <Link href={`/base/crm/companies/${c.company_id}`} className="hover:text-brass-dark">{companies.get(c.company_id)}</Link> : <span className="text-muted">—</span>}</td>
                    <td>{c.owner_id ? people.names.get(c.owner_id) : <span className="text-muted">—</span>}</td>
                    <td className="text-muted">{c.last_activity_at ? fmtDate(new Date(c.last_activity_at), zone, 'MMM d, yyyy') : 'Never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {total > PAGE && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>{page * PAGE + 1}–{Math.min(total, page * PAGE + PAGE)} of {total}</span>
          <span className="flex gap-2">
            {page > 0 && <Link href={params({ page: page - 1 })} className="b-btn-ghost b-btn-sm"><ChevronLeft size={14} /> Previous</Link>}
            {(page + 1) * PAGE < total && <Link href={params({ page: page + 1 })} className="b-btn-ghost b-btn-sm">Next <ChevronRight size={14} /></Link>}
          </span>
        </div>
      )}
    </>
  );
}
