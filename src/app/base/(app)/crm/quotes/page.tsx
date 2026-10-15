import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, Plus } from 'lucide-react';
import { Card, EmptyState, PageHeader } from '@/components/base/ui';
import { requireCrm } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { fmtDate } from '@/lib/base/time';
import { getCrmPeople, labelsFor } from '@/lib/crm/data';
import { money, quoteStatusLabel, quoteStatusTone, quoteTotals, type Quote, type QuoteStatus } from '@/lib/crm/types';

export const metadata: Metadata = { title: 'Quotes' };

type Row = Quote & { items: { quantity: number; unit_price: number; discount_pct: number }[] };

export default async function QuotesPage({ searchParams }: PageProps<'/base/crm/quotes'>) {
  await requireCrm();
  const sp = await searchParams;
  const status = typeof sp.status === 'string' && sp.status in quoteStatusLabel ? (sp.status as QuoteStatus) : null;
  const [people, { timezone: zone }] = await Promise.all([getCrmPeople(), getSettings()]);
  let query = db().from('crm_quotes').select('*, items:crm_quote_items(quantity, unit_price, discount_pct)').order('created_at', { ascending: false }).limit(300);
  if (status) query = query.eq('status', status);
  const quotes = must<Row[]>(await query, 'load quotes');
  const contacts = await labelsFor('crm_contacts', quotes.map((q) => q.contact_id));
  const totalOf = (q: Row) => quoteTotals(q.items.map((i) => ({ quantity: Number(i.quantity), unit_price: Number(i.unit_price), discount_pct: Number(i.discount_pct) })), { discount_pct: Number(q.discount_pct), tax_pct: Number(q.tax_pct), delivery_fee: Number(q.delivery_fee) }).total;
  const sum = (s: QuoteStatus) => quotes.filter((q) => q.status === s).reduce((t, q) => t + totalOf(q), 0);

  return (
    <>
      <PageHeader
        plain
        title="Quotes"
        description="Proposals with line items, discounts, tax and delivery — print or save as PDF to send."
        actions={<Link href="/base/crm/quotes/new" className="b-btn-brass"><Plus size={15} /> New quote</Link>}
      />
      {!status && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {(['draft', 'sent', 'accepted', 'declined'] as const).map((s) => (
            <Link key={s} href={`/base/crm/quotes?status=${s}`} className="b-card px-4 py-3 hover:ring-2 hover:ring-brass/30">
              <p className="text-xs text-muted">{quoteStatusLabel[s]}</p>
              <p className="text-xl font-semibold">{money(sum(s))}</p>
            </Link>
          ))}
        </div>
      )}
      <div className="b-segment mb-5 flex-wrap">
        <Link href="/base/crm/quotes" aria-current={!status ? 'page' : undefined}>All</Link>
        {(Object.keys(quoteStatusLabel) as QuoteStatus[]).map((s) => <Link key={s} href={`/base/crm/quotes?status=${s}`} aria-current={status === s ? 'page' : undefined}>{quoteStatusLabel[s]}</Link>)}
      </div>
      <Card pad={false}>
        {quotes.length === 0 ? (
          <EmptyState icon={<FileText size={20} />} title="No quotes yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="b-table">
              <thead><tr><th>#</th><th>Quote</th><th>Customer</th><th>Status</th><th className="text-right">Total</th><th>Owner</th><th>Created</th></tr></thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id}>
                    <td className="font-mono text-xs text-muted">{q.number}</td>
                    <td><Link href={`/base/crm/quotes/${q.id}`} className="font-medium hover:text-brass-dark">{q.title}</Link></td>
                    <td>{q.contact_id ? contacts.get(q.contact_id) : <span className="text-muted">—</span>}</td>
                    <td><span className={quoteStatusTone[q.status]}>{quoteStatusLabel[q.status]}</span></td>
                    <td className="text-right font-medium">{money(totalOf(q), true)}</td>
                    <td>{q.owner_id ? people.names.get(q.owner_id) : '—'}</td>
                    <td className="text-muted">{fmtDate(new Date(q.created_at), zone, 'MMM d, yyyy')}</td>
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
