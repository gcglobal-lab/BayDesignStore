import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, Plus, Search } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import { Card, EmptyState, PageHeader } from '@/components/base/ui';
import { CompanyForm } from '@/components/crm/RecordForms';
import { requireCrm } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getCrmPeople, searchTerm } from '@/lib/crm/data';
import { money, type Company } from '@/lib/crm/types';

export const metadata: Metadata = { title: 'Companies' };

export default async function CompaniesPage({ searchParams }: PageProps<'/base/crm/companies'>) {
  const viewer = await requireCrm();
  const sp = await searchParams;
  const q = searchTerm(sp.q);
  const people = await getCrmPeople();
  let query = db().from('crm_companies').select('*').order('name').limit(500);
  if (q) query = query.or(`name.ilike.%${q}%,industry.ilike.%${q}%,city.ilike.%${q}%`);
  const companies = must<Company[]>(await query, 'load companies');
  const ids = companies.map((c) => c.id);
  const [contactsRes, dealsRes] = ids.length
    ? await Promise.all([
        db().from('crm_contacts').select('company_id').in('company_id', ids),
        db().from('crm_deals').select('company_id, value, status').in('company_id', ids),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  const people_ = new Map<string, number>();
  for (const r of must<{ company_id: string }[]>(contactsRes, 'count contacts')) people_.set(r.company_id, (people_.get(r.company_id) ?? 0) + 1);
  const won = new Map<string, number>();
  const open = new Map<string, number>();
  for (const d of must<{ company_id: string; value: number; status: string }[]>(dealsRes, 'load deals')) {
    const m = d.status === 'won' ? won : d.status === 'open' ? open : null;
    m?.set(d.company_id, (m.get(d.company_id) ?? 0) + Number(d.value));
  }

  return (
    <>
      <PageHeader
        plain
        title="Companies"
        description="Design firms, builders, hotels, condo associations and business customers."
        actions={
          <Dialog trigger={<><Plus size={15} /> New company</>} triggerClassName="b-btn-brass" title="New company" wide>
            <CompanyForm owners={people.owners} me={viewer.employeeId} />
          </Dialog>
        }
      />
      <form className="mb-5 flex gap-2" action="/base/crm/companies">
        <label className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={q} placeholder="Search companies…" className="b-input !py-2 pl-9" />
        </label>
        <button type="submit" className="b-btn-ghost">Search</button>
      </form>
      <Card pad={false}>
        {companies.length === 0 ? (
          <EmptyState icon={<Building2 size={20} />} title="No companies yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="b-table">
              <thead><tr><th>Company</th><th>Type</th><th>City</th><th>People</th><th>Open deals</th><th>Won</th><th>Owner</th></tr></thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td><Link href={`/base/crm/companies/${c.id}`} className="flex items-center gap-2 font-medium hover:text-brass-dark"><Building2 size={15} className="text-muted" /> {c.name}</Link></td>
                    <td className="text-muted">{c.industry ?? '—'}</td>
                    <td className="text-muted">{c.city ?? '—'}</td>
                    <td>{people_.get(c.id) ?? 0}</td>
                    <td>{money(open.get(c.id) ?? 0)}</td>
                    <td className="font-medium">{money(won.get(c.id) ?? 0)}</td>
                    <td>{c.owner_id ? people.names.get(c.owner_id) : <span className="text-muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
