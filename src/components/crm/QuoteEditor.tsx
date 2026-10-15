'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { saveQuote } from '@/app/base/(app)/crm/quotes/actions';
import { saveProduct } from '@/app/base/(app)/crm/products/actions';
import { ActionForm, Field, SubmitButton } from '@/components/base/forms';
import { money, quoteTotals, type Product, type Quote, type QuoteItem } from '@/lib/crm/types';

type Option = { id: string; name: string };
const blank = (): QuoteItem => ({ product_id: null, description: '', quantity: 1, unit_price: 0, discount_pct: 0 });

/** Line-item editor with live totals. Used for new quotes and for editing drafts. */
export default function QuoteEditor({
  quote,
  items: initialItems,
  products,
  deals,
  contacts,
  companies,
  defaults,
  readOnly = false,
}: {
  quote?: Quote;
  items?: QuoteItem[];
  products: Product[];
  deals: Option[];
  contacts: Option[];
  companies: Option[];
  defaults?: { deal_id?: string; contact_id?: string; title?: string; terms?: string; tax_pct?: number };
  readOnly?: boolean;
}) {
  const [items, setItems] = useState<QuoteItem[]>(initialItems?.length ? initialItems : [blank()]);
  const [discount, setDiscount] = useState(quote?.discount_pct ?? 0);
  const [tax, setTax] = useState(quote?.tax_pct ?? defaults?.tax_pct ?? 6);
  const [fee, setFee] = useState(quote?.delivery_fee ?? 0);
  const totals = useMemo(() => quoteTotals(items, { discount_pct: discount, tax_pct: tax, delivery_fee: fee }), [items, discount, tax, fee]);
  const patch = (i: number, p: Partial<QuoteItem>) => setItems((list) => list.map((it, j) => (j === i ? { ...it, ...p } : it)));
  const valid = items.filter((i) => i.description.trim() && i.quantity > 0);

  return (
    <ActionForm action={saveQuote} className="space-y-5">
      {quote && <input type="hidden" name="id" value={quote.id} />}
      <input type="hidden" name="items" value={JSON.stringify(valid)} />
      <fieldset disabled={readOnly} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Quote title" htmlFor="q-title" className="md:col-span-2">
            <input id="q-title" name="title" className="b-input" required maxLength={160} defaultValue={quote?.title ?? defaults?.title ?? ''} placeholder="e.g. Living room — sofa, chairs and rug" />
          </Field>
          <Field label="Deal" htmlFor="q-deal">
            <select id="q-deal" name="deal_id" className="b-input" defaultValue={quote?.deal_id ?? defaults?.deal_id ?? ''}>
              <option value="">— None —</option>
              {deals.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Contact" htmlFor="q-contact">
            <select id="q-contact" name="contact_id" className="b-input" defaultValue={quote?.contact_id ?? defaults?.contact_id ?? ''}>
              <option value="">— From the deal —</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Company" htmlFor="q-company">
            <select id="q-company" name="company_id" className="b-input" defaultValue={quote?.company_id ?? ''}>
              <option value="">— From the deal —</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Valid until" htmlFor="q-valid">
            <input id="q-valid" name="valid_until" type="date" className="b-input" defaultValue={quote?.valid_until ?? ''} />
          </Field>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-stone/60">
          <table className="b-table min-w-[720px]">
            <thead>
              <tr><th className="w-[38%]">Item</th><th>Qty</th><th>Unit price</th><th>Disc. %</th><th className="text-right">Amount</th><th /></tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td className="space-y-1.5">
                    <select
                      aria-label="Pick from catalogue"
                      className="b-input !py-1.5 text-xs"
                      value={it.product_id ?? ''}
                      onChange={(e) => {
                        const p = products.find((x) => x.id === e.target.value);
                        patch(i, p ? { product_id: p.id, description: p.name + (p.sku ? ` (${p.sku})` : ''), unit_price: Number(p.unit_price) } : { product_id: null });
                      }}
                    >
                      <option value="">Custom item…</option>
                      {products.filter((p) => p.active || p.id === it.product_id).map((p) => <option key={p.id} value={p.id}>{p.name} · {money(p.unit_price)}</option>)}
                    </select>
                    <input aria-label="Description" className="b-input !py-1.5" value={it.description} maxLength={300} onChange={(e) => patch(i, { description: e.target.value })} placeholder="Description" />
                  </td>
                  <td><input aria-label="Quantity" type="number" min={0.01} step="any" className="b-input !w-20 !py-1.5" value={it.quantity} onChange={(e) => patch(i, { quantity: Number(e.target.value) })} /></td>
                  <td><input aria-label="Unit price" type="number" min={0} step="0.01" className="b-input !w-28 !py-1.5" value={it.unit_price} onChange={(e) => patch(i, { unit_price: Number(e.target.value) })} /></td>
                  <td><input aria-label="Discount percent" type="number" min={0} max={100} step="any" className="b-input !w-20 !py-1.5" value={it.discount_pct} onChange={(e) => patch(i, { discount_pct: Number(e.target.value) })} /></td>
                  <td className="text-right font-medium">{money(it.quantity * it.unit_price * (1 - it.discount_pct / 100), true)}</td>
                  <td>
                    <button type="button" className="rounded p-1.5 text-muted hover:text-red-600" aria-label="Remove line" onClick={() => setItems((l) => (l.length > 1 ? l.filter((_, j) => j !== i) : [blank()]))}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!readOnly && (
            <div className="border-t border-stone/50 p-2">
              <button type="button" className="b-btn-quiet b-btn-sm" onClick={() => setItems((l) => [...l, blank()])}><Plus size={13} /> Add line</button>
            </div>
          )}
        </div>

        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <Field label="Notes to the customer" htmlFor="q-notes"><textarea id="q-notes" name="notes" className="b-input min-h-[70px]" maxLength={5000} defaultValue={quote?.notes ?? ''} placeholder="Fabric, finish and lead-time details…" /></Field>
            <Field label="Terms" htmlFor="q-terms"><textarea id="q-terms" name="terms" className="b-input min-h-[70px]" maxLength={5000} defaultValue={quote?.terms ?? defaults?.terms ?? ''} /></Field>
          </div>
          <div className="space-y-2 rounded-2xl bg-linen/70 p-4 text-sm">
            <div className="flex justify-between"><span className="text-muted">Items</span><span>{money(totals.lines, true)}</span></div>
            <label className="flex items-center justify-between gap-2"><span className="text-muted">Discount %</span><input name="discount_pct" type="number" min={0} max={100} step="any" className="b-input !w-24 !py-1 text-right" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></label>
            {totals.discount > 0 && <div className="flex justify-between text-emerald-700"><span>Discount</span><span>−{money(totals.discount, true)}</span></div>}
            <label className="flex items-center justify-between gap-2"><span className="text-muted">Sales tax %</span><input name="tax_pct" type="number" min={0} max={30} step="any" className="b-input !w-24 !py-1 text-right" value={tax} onChange={(e) => setTax(Number(e.target.value))} /></label>
            <div className="flex justify-between"><span className="text-muted">Tax</span><span>{money(totals.tax, true)}</span></div>
            <label className="flex items-center justify-between gap-2"><span className="text-muted">Delivery & install</span><input name="delivery_fee" type="number" min={0} step="0.01" className="b-input !w-24 !py-1 text-right" value={fee} onChange={(e) => setFee(Number(e.target.value))} /></label>
            <div className="flex justify-between border-t border-stone/60 pt-2 text-base font-semibold"><span>Total</span><span>{money(totals.total, true)}</span></div>
          </div>
        </div>
      </fieldset>
      {!readOnly && <div className="flex justify-end"><SubmitButton className="b-btn-brass">{quote ? 'Save quote' : 'Create quote'}</SubmitButton></div>}
    </ActionForm>
  );
}

export function ProductForm({ product }: { product?: Product }) {
  return (
    <ActionForm action={saveProduct} resetOnSuccess={!product} className="space-y-4">
      {product && <input type="hidden" name="id" value={product.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="p-name" className="sm:col-span-2"><input id="p-name" name="name" className="b-input" required maxLength={160} defaultValue={product?.name} placeholder="e.g. Coastal linen sofa, 96in" /></Field>
        <Field label="SKU" htmlFor="p-sku"><input id="p-sku" name="sku" className="b-input" maxLength={60} defaultValue={product?.sku ?? ''} /></Field>
        <Field label="Category" htmlFor="p-cat"><input id="p-cat" name="category" className="b-input" maxLength={80} defaultValue={product?.category ?? ''} placeholder="Sofas, Dining, Lighting…" /></Field>
        <Field label="Price (USD)" htmlFor="p-price"><input id="p-price" name="unit_price" type="number" min={0} step="0.01" className="b-input" required defaultValue={product?.unit_price ?? ''} /></Field>
        <Field label="Cost (optional, for margin)" htmlFor="p-cost"><input id="p-cost" name="cost" type="number" min={0} step="0.01" className="b-input" defaultValue={product?.cost ?? ''} /></Field>
      </div>
      <Field label="Description" htmlFor="p-desc"><textarea id="p-desc" name="description" className="b-input min-h-[60px]" maxLength={2000} defaultValue={product?.description ?? ''} /></Field>
      {product && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" className="b-check" defaultChecked={product.active} /> Available on new quotes</label>}
      <div className="flex justify-end"><SubmitButton className="b-btn-brass">{product ? 'Save' : 'Add product'}</SubmitButton></div>
    </ActionForm>
  );
}
