import type { Metadata } from 'next';
import Link from 'next/link';
import { Download, Globe, Hand, Inbox, Mail, MessageCircle, Phone, Plus, Search } from 'lucide-react';
import AutoRefresh from '@/components/base/AutoRefresh';
import { Dialog } from '@/components/base/Dialog';
import { SubmitButton } from '@/components/base/forms';
import { Avatar, Card, EmptyState, PageHeader } from '@/components/base/ui';
import { LeadForm } from '@/components/crm/LeadForms';
import { requireCrm } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { fmtDate, fmtTime } from '@/lib/base/time';
import { getCrmPeople, getCrmSetup, searchTerm } from '@/lib/crm/data';
import { leadStatusLabel, leadStatusTone, money, type Lead, type LeadStatus } from '@/lib/crm/types';
import { setLeadStatus } from './actions';
import Select from '@/components/ui/Select';

export const metadata: Metadata = { title: 'Leads' };

const TABS = [
  { key: 'new', label: 'New', statuses: ['new'] },
  { key: 'working', label: 'Working', statuses: ['contacted', 'qualified'] },
  { key: 'open', label: 'All open', statuses: ['new', 'contacted', 'qualified'] },
  { key: 'converted', label: 'Converted', statuses: ['converted'] },
  { key: 'disqualified', label: 'Disqualified', statuses: ['disqualified'] },
] as const satisfies readonly { key: string; label: string; statuses: readonly LeadStatus[] }[];

/** The leads inbox: website form & chat requests, walk-ins and calls, before they become deals. */
export default async function LeadsPage({ searchParams }: PageProps<'/base/crm/leads'>) {
  const viewer = await requireCrm();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const q = searchTerm(sp.q);
  const mine = sp.owner === 'me';
  const [{ settings }, people, { timezone: zone }] = await Promise.all([getCrmSetup(), getCrmPeople(), getSettings()]);

  let query = db().from('crm_leads').select('*').in('status', tab.statuses).order('created_at', { ascending: false }).limit(300);
  if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,title.ilike.%${q}%,company_name.ilike.%${q}%,phone.ilike.%${q}%`);
  if (mine && viewer.employeeId) query = query.eq('owner_id', viewer.employeeId);
  const [leads, counts] = await Promise.all([
    query.then((r) => must<Lead[]>(r, 'load leads')),
    Promise.all(
      TABS.map(async (t) => {
        const { count } = await db().from('crm_leads').select('id', { count: 'exact', head: true }).in('status', t.statuses);
        return [t.key, count ?? 0] as const;
      }),
    ).then((x) => Object.fromEntries(x) as Record<string, number>),
  ]);

  return (
    <>
      <AutoRefresh seconds={45} />
      <PageHeader
        plain
        title="Leads"
        description="New requests land here first — from the website’s contact form and chat, plus walk-ins and calls you add. Qualify the good ones into deals."
        actions={
          <>
            <a href="/base/crm/export?type=leads" className="b-btn-ghost"><Download size={15} /> Export</a>
            <Dialog trigger={<><Plus size={15} /> New lead</>} triggerClassName="b-btn-brass" title="New lead" wide>
              <LeadForm owners={people.owners} sources={settings.lead_sources} me={viewer.employeeId} />
            </Dialog>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="b-segment flex-wrap">
          {TABS.map((t) => (
            <Link key={t.key} href={`/base/crm/leads?tab=${t.key}${mine ? '&owner=me' : ''}`} aria-current={t.key === tab.key ? 'page' : undefined}>
              {t.label}
              <span className={`ml-1.5 rounded-full px-1.5 py-px text-[0.68rem] ${t.key === 'new' && counts.new ? 'bg-brass text-white' : 'bg-sand text-muted'}`}>{counts[t.key]}</span>
            </Link>
          ))}
        </div>
        <form className="flex flex-1 flex-wrap items-center gap-2" action="/base/crm/leads">
          <input type="hidden" name="tab" value={tab.key} />
          <Select people name="owner" defaultValue={mine ? 'me' : ''} className="b-input !w-auto !py-2">
            <option value="">Everyone’s leads</option>
            <option value="me">My leads</option>
          </Select>
          <label className="relative min-w-[12rem] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={q} placeholder="Search name, email, phone…" className="b-input !py-2 pl-9" />
          </label>
          <button type="submit" className="b-btn-ghost">Search</button>
        </form>
      </div>

      {leads.length === 0 ? (
        <Card><EmptyState icon={<Inbox size={20} />} title={tab.key === 'new' ? 'No new leads — you’re all caught up.' : 'Nothing here.'} /></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {leads.map((l) => (
            <article key={l.id} className={`b-card flex flex-col p-4 ${l.status === 'new' ? 'ring-2 ring-brass/30' : ''}`}>
              <div className="flex items-start gap-3">
                <Avatar name={l.name} />
                <div className="min-w-0 flex-1">
                  <Link href={`/base/crm/leads/${l.id}`} className="block truncate font-semibold hover:text-brass-dark">{l.name}{l.company_name ? <span className="font-normal text-muted"> · {l.company_name}</span> : null}</Link>
                  <p className="truncate text-sm text-muted">{l.title}</p>
                </div>
                <span className={leadStatusTone[l.status]}>{leadStatusLabel[l.status]}</span>
              </div>
              {l.message && <p className="mt-3 line-clamp-2 text-sm text-ink/80">{l.message}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1">{l.source === 'Website chat' ? <MessageCircle size={12} /> : l.source === 'Website form' ? <Globe size={12} /> : null}{l.source ?? 'Lead'}</span>
                <span>{fmtDate(new Date(l.created_at), zone, 'MMM d')} · {fmtTime(l.created_at, zone)}</span>
                {l.estimated_value ? <span className="font-medium text-ink">{money(l.estimated_value)}</span> : null}
                <span>{l.owner_id ? people.names.get(l.owner_id) : <span className="text-amber-700">Unassigned</span>}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone/50 pt-3">
                {l.email && <a href={`mailto:${l.email}`} className="b-btn-ghost b-btn-sm"><Mail size={13} /> Email</a>}
                {l.phone && <a href={`tel:${l.phone}`} className="b-btn-ghost b-btn-sm"><Phone size={13} /> Call</a>}
                {!l.owner_id && viewer.employeeId && (
                  <form action={setLeadStatus}>
                    <input type="hidden" name="id" value={l.id} />
                    <input type="hidden" name="status" value="claim" />
                    <SubmitButton className="b-btn-ghost b-btn-sm"><Hand size={13} /> Take it</SubmitButton>
                  </form>
                )}
                <Link href={`/base/crm/leads/${l.id}`} className="b-btn-brass b-btn-sm ml-auto">{l.status === 'converted' ? 'View' : 'Open'}</Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
