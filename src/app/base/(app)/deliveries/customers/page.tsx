import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Plus, Search, UserRound } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import { Avatar, Card, EmptyState, PageHeader } from '@/components/base/ui';
import { CustomerForm } from '@/components/deliveries/Forms';
import { requireDeliveries } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { searchTerm } from '@/lib/crm/data';

export const metadata: Metadata = { title: 'Delivery customers' };
const PAGE = 50;

type Row = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; address1: string | null; city: string | null };

/** Customers for deliveries — the same list as Workflow contacts, so adding one here adds it there too. */
export default async function CustomersPage({ searchParams }: PageProps<'/base/deliveries/customers'>) {
  const viewer = await requireDeliveries({ dispatcher: true });
  const sp = await searchParams;
  const q = searchTerm(sp.q);
  const page = Math.max(0, Number(sp.page) || 0);

  let query = db()
    .from('crm_contacts')
    .select('id, first_name, last_name, email, phone, address1, city', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(page * PAGE, page * PAGE + PAGE - 1);
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,city.ilike.%${q}%,address1.ilike.%${q}%`);
  const res = await query;
  const customers = must<Row[]>(res, 'load customers');
  const total = res.count ?? customers.length;

  const { data: orderRows } = customers.length ? await db().from('dl_orders').select('contact_id').in('contact_id', customers.map((c) => c.id)) : { data: [] };
  const orders = new Map<string, number>();
  for (const o of orderRows ?? []) orders.set(o.contact_id, (orders.get(o.contact_id) ?? 0) + 1);

  const params = (p: number) => `/base/deliveries/customers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;
  const name = (c: Row) => `${c.first_name} ${c.last_name}`.trim();

  return (
    <>
      <PageHeader
        plain
        title="Customers"
        description={`${total} ${total === 1 ? 'customer' : 'customers'} — shared with Workflow contacts.`}
        actions={
          <Dialog trigger={<><Plus size={15} /> New customer</>} triggerClassName="b-btn-brass" title="New customer" wide>
            <CustomerForm />
          </Dialog>
        }
      />

      <form className="mb-5 flex flex-wrap items-center gap-2" action="/base/deliveries/customers">
        <label className="relative min-w-[14rem] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={q} placeholder="Search name, phone, email, address…" className="b-input !py-2 pl-9" />
        </label>
        <button type="submit" className="b-btn-ghost">Search</button>
      </form>

      <Card pad={false}>
        {customers.length === 0 ? (
          <EmptyState icon={<UserRound size={20} />} title={q ? `No customers match “${q}”.` : 'No customers yet.'}>Add one here, or from the customer box on a new order.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="b-table">
              <thead><tr><th>Name</th><th>Phone / email</th><th>Address</th><th>Orders</th><th /></tr></thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {viewer.crm !== 'none' ? (
                        <Link href={`/base/crm/contacts/${c.id}`} className="flex items-center gap-2.5 font-medium hover:text-brass-dark"><Avatar name={name(c)} size="sm" /> {name(c)}</Link>
                      ) : (
                        <span className="flex items-center gap-2.5 font-medium"><Avatar name={name(c)} size="sm" /> {name(c)}</span>
                      )}
                    </td>
                    <td className="text-muted">
                      {c.phone && <a href={`tel:${c.phone}`} className="block hover:text-brass-dark">{c.phone}</a>}
                      {c.email && <a href={`mailto:${c.email}`} className="block hover:text-brass-dark">{c.email}</a>}
                    </td>
                    <td className="text-muted">{[c.address1, c.city].filter(Boolean).join(', ') || '—'}</td>
                    <td>{orders.get(c.id) ? <Link href={`/base/deliveries/orders?tab=all&q=${encodeURIComponent(name(c))}`} className="hover:text-brass-dark">{orders.get(c.id)}</Link> : <span className="text-muted">0</span>}</td>
                    <td className="text-right"><Link href={`/base/deliveries/orders/new?contact=${c.id}`} className="b-btn-ghost b-btn-sm whitespace-nowrap"><Plus size={13} /> New order</Link></td>
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
            {page > 0 && <Link href={params(page - 1)} className="b-btn-ghost b-btn-sm"><ChevronLeft size={14} /> Previous</Link>}
            {(page + 1) * PAGE < total && <Link href={params(page + 1)} className="b-btn-ghost b-btn-sm">Next <ChevronRight size={14} /></Link>}
          </span>
        </div>
      )}
    </>
  );
}
