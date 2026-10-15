import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LogoMark } from '@/components/Logo';
import PrintButton from '@/components/base/PrintButton';
import { requireCrm } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { fmtDate } from '@/lib/base/time';
import { getCrmPeople } from '@/lib/crm/data';
import { contactName, money, quoteStatusLabel, quoteTotals, type Quote, type QuoteItem } from '@/lib/crm/types';

export const metadata: Metadata = { title: 'Quote' };

/** A clean, printable quote (Print → Save as PDF to email it). Always light. */
export default async function QuotePrintPage({ params }: PageProps<'/base/crm/quotes/[id]/print'>) {
  await requireCrm();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const quote = must<(Quote & { items: (QuoteItem & { position: number })[] }) | null>(
    await db().from('crm_quotes').select('*, items:crm_quote_items(description, quantity, unit_price, discount_pct, position)').eq('id', id).maybeSingle(),
    'load the quote',
  );
  if (!quote) notFound();
  const [settings, people, contact, company] = await Promise.all([
    getSettings(),
    getCrmPeople(),
    quote.contact_id ? db().from('crm_contacts').select('first_name, last_name, email, phone, address1, address2, city, state, postal_code').eq('id', quote.contact_id).maybeSingle().then((r) => r.data) : null,
    quote.company_id ? db().from('crm_companies').select('name').eq('id', quote.company_id).maybeSingle().then((r) => r.data) : null,
  ]);
  const zone = settings.timezone;
  const items = quote.items.sort((a, b) => a.position - b.position).map((i) => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price), discount_pct: Number(i.discount_pct) }));
  const t = quoteTotals(items, { discount_pct: Number(quote.discount_pct), tax_pct: Number(quote.tax_pct), delivery_fee: Number(quote.delivery_fee) });

  return (
    <div data-theme="light" className="mx-auto max-w-[820px] text-ink">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <p className="text-sm text-muted">Use Print, then “Save as PDF”, to email it.</p>
        <PrintButton />
      </div>
      <article className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-stone/60 print:rounded-none print:p-0 print:shadow-none print:ring-0 sm:p-12">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-stone/60 pb-6">
          <div className="flex items-center gap-3">
            <LogoMark className="h-12 w-12" />
            <div>
              <p className="font-brand text-xl tracking-[0.06em]">BAY DESIGN STORE</p>
              <p className="text-xs text-muted">326 13th Avenue South, Naples, FL 34102 · (239) 649-0906</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold">Quote #{quote.number}</p>
            <p className="text-sm text-muted">{fmtDate(new Date(quote.created_at), zone, 'MMMM d, yyyy')}</p>
            {quote.valid_until && <p className="text-sm text-muted">Valid until {fmtDate(quote.valid_until, zone, 'MMMM d, yyyy')}</p>}
            {quote.status !== 'draft' && <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-brass-dark">{quoteStatusLabel[quote.status]}</p>}
          </div>
        </header>
        <section className="grid gap-6 py-6 sm:grid-cols-2">
          <div>
            <p className="b-eyebrow mb-1">Prepared for</p>
            {contact && <p className="font-semibold">{contactName(contact)}</p>}
            {company && <p>{company.name}</p>}
            {contact?.address1 && <p className="text-sm text-muted">{[contact.address1, contact.address2].filter(Boolean).join(', ')}<br />{[contact.city, contact.state, contact.postal_code].filter(Boolean).join(' ')}</p>}
            {contact?.email && <p className="text-sm text-muted">{contact.email}</p>}
            {contact?.phone && <p className="text-sm text-muted">{contact.phone}</p>}
          </div>
          <div className="sm:text-right">
            <p className="b-eyebrow mb-1">Your designer</p>
            <p className="font-semibold">{quote.owner_id ? people.names.get(quote.owner_id) : 'Bay Design Store'}</p>
            <p className="text-sm text-muted">{quote.title}</p>
          </div>
        </section>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-ink/80 text-left text-xs uppercase tracking-wider text-muted">
              <th className="py-2">Item</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Price</th><th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, n) => (
              <tr key={n} className="border-b border-stone/50">
                <td className="py-2.5 pr-3">{i.description}{i.discount_pct > 0 && <span className="ml-1 text-xs text-emerald-700">({i.discount_pct}% off)</span>}</td>
                <td className="py-2.5 text-right">{i.quantity}</td>
                <td className="py-2.5 text-right">{money(i.unit_price, true)}</td>
                <td className="py-2.5 text-right font-medium">{money(i.quantity * i.unit_price * (1 - i.discount_pct / 100), true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted">Subtotal</span><span>{money(t.lines, true)}</span></div>
          {t.discount > 0 && <div className="flex justify-between"><span className="text-muted">Discount ({Number(quote.discount_pct)}%)</span><span>−{money(t.discount, true)}</span></div>}
          <div className="flex justify-between"><span className="text-muted">Sales tax ({Number(quote.tax_pct)}%)</span><span>{money(t.tax, true)}</span></div>
          {Number(quote.delivery_fee) > 0 && <div className="flex justify-between"><span className="text-muted">Delivery & installation</span><span>{money(quote.delivery_fee, true)}</span></div>}
          <div className="flex justify-between border-t-2 border-ink/80 pt-2 text-lg font-semibold"><span>Total</span><span>{money(t.total, true)}</span></div>
        </div>
        {quote.notes && <section className="mt-8"><p className="b-eyebrow mb-1">Notes</p><p className="whitespace-pre-wrap text-sm">{quote.notes}</p></section>}
        {quote.terms && <section className="mt-6"><p className="b-eyebrow mb-1">Terms</p><p className="whitespace-pre-wrap text-xs text-muted">{quote.terms}</p></section>}
        <footer className="mt-10 grid gap-8 border-t border-stone/60 pt-6 text-sm sm:grid-cols-2">
          <div><div className="h-10 border-b border-ink/40" /><p className="mt-1 text-xs text-muted">Customer signature &amp; date</p></div>
          <p className="text-xs text-muted sm:text-right">Thank you for choosing Bay Design Store.<br />baydesignstore.com</p>
        </footer>
      </article>
    </div>
  );
}
