import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Check, Copy, Printer, Send, Trash2, X } from 'lucide-react';
import { SubmitButton } from '@/components/base/forms';
import { Card } from '@/components/base/ui';
import QuoteEditor from '@/components/crm/QuoteEditor';
import { requireCrm } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { fmtDate } from '@/lib/base/time';
import { canEditRecord, getCrmPeople, quoteEditorOptions } from '@/lib/crm/data';
import { money, quoteStatusLabel, quoteStatusTone, quoteTotals, type Quote, type QuoteItem } from '@/lib/crm/types';
import { deleteQuote, duplicateQuote, setQuoteStatus } from '../actions';

export const metadata: Metadata = { title: 'Quote' };

function StatusBtn({ id, status, children, className }: { id: string; status: string; children: React.ReactNode; className: string }) {
  return (
    <form action={setQuoteStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton className={className}>{children}</SubmitButton>
    </form>
  );
}

export default async function QuotePage({ params }: PageProps<'/base/crm/quotes/[id]'>) {
  const viewer = await requireCrm();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const quote = must<(Quote & { items: (QuoteItem & { position: number })[] }) | null>(
    await db().from('crm_quotes').select('*, items:crm_quote_items(id, product_id, description, quantity, unit_price, discount_pct, position)').eq('id', id).maybeSingle(),
    'load the quote',
  );
  if (!quote) notFound();
  const [opts, people, { timezone: zone }] = await Promise.all([quoteEditorOptions(), getCrmPeople(), getSettings()]);
  const items = quote.items.sort((a, b) => a.position - b.position).map((i) => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price), discount_pct: Number(i.discount_pct) }));
  const q = { ...quote, discount_pct: Number(quote.discount_pct), tax_pct: Number(quote.tax_pct), delivery_fee: Number(quote.delivery_fee) };
  const total = quoteTotals(items, q).total;
  const editable = canEditRecord(viewer, quote.owner_id);
  const locked = quote.status === 'accepted' || quote.status === 'declined';

  return (
    <>
      <Link href={quote.deal_id ? `/base/crm/deals/${quote.deal_id}` : '/base/crm/quotes'} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> {quote.deal_id ? 'Deal' : 'Quotes'}</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-muted">Quote #{quote.number}</p>
          <h1 className="text-[1.9rem] font-semibold leading-tight tracking-tight">{quote.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted">
            <span className={quoteStatusTone[quote.status]}>{quoteStatusLabel[quote.status]}</span>
            <span className="text-lg font-semibold text-ink">{money(total, true)}</span>
            <span>by {quote.owner_id ? people.names.get(quote.owner_id) : '—'}</span>
            {quote.sent_at && <span>sent {fmtDate(new Date(quote.sent_at), zone, 'MMM d')}</span>}
            {quote.decided_at && <span>{quote.status} {fmtDate(new Date(quote.decided_at), zone, 'MMM d')}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/base/crm/quotes/${quote.id}/print`} className="b-btn-ghost" target="_blank"><Printer size={14} /> Print / PDF</Link>
          {editable && quote.status === 'draft' && <StatusBtn id={quote.id} status="sent" className="b-btn-brass"><Send size={14} /> Mark as sent</StatusBtn>}
          {editable && (quote.status === 'sent' || quote.status === 'expired') && (
            <>
              <StatusBtn id={quote.id} status="accepted" className="b-btn inline-flex bg-emerald-600 text-white hover:bg-emerald-700"><Check size={14} /> Accepted</StatusBtn>
              <StatusBtn id={quote.id} status="declined" className="b-btn-danger"><X size={14} /> Declined</StatusBtn>
            </>
          )}
          {editable && locked && <StatusBtn id={quote.id} status="draft" className="b-btn-ghost">Back to draft</StatusBtn>}
          <form action={duplicateQuote}>
            <input type="hidden" name="id" value={quote.id} />
            <SubmitButton className="b-btn-ghost"><Copy size={14} /> Duplicate</SubmitButton>
          </form>
          {viewer.crm === 'manager' && (
            <form action={deleteQuote}>
              <input type="hidden" name="id" value={quote.id} />
              <SubmitButton className="b-btn-quiet" confirm="Delete this quote?"><Trash2 size={14} /></SubmitButton>
            </form>
          )}
        </div>
      </div>
      {locked && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">This quote is {quote.status}. Move it back to draft to change it, or duplicate it for a revised version.</p>}
      <Card>
        <QuoteEditor {...opts} quote={q} items={items} readOnly={!editable || locked} />
      </Card>
    </>
  );
}
