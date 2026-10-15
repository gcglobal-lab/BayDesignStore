'use client';

import { useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { createOrder, updateOrder } from '@/app/base/(app)/deliveries/orders/actions';
import { ActionForm, Field, SubmitButton } from '@/components/base/forms';
import { serviceLabel, type Order, type OrderItem, type ServiceType } from '@/lib/deliveries/types';
import Select from '@/components/ui/Select';

export type ContactOption = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
};

const blank = (): OrderItem => ({ description: '', sku: null, quantity: 1, assembly: false, notes: null });

export default function OrderForm({
  order,
  items: initialItems,
  contacts,
  deals,
  defaults,
  windowHours,
}: {
  order?: Order;
  items?: OrderItem[];
  contacts: ContactOption[];
  deals: { id: string; name: string }[];
  defaults?: Partial<Pick<Order, 'contact_id' | 'deal_id' | 'scheduled_date'>> & { items?: OrderItem[] };
  windowHours: number;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [items, setItems] = useState<OrderItem[]>(initialItems?.length ? initialItems : defaults?.items?.length ? defaults.items : [blank()]);
  const patch = (i: number, p: Partial<OrderItem>) => setItems((l) => l.map((it, j) => (j === i ? { ...it, ...p } : it)));
  const initialContact = contacts.find((c) => c.id === (order?.contact_id ?? defaults?.contact_id));
  const v = (k: keyof Order) => (order ? ((order[k] as string | null) ?? '') : '');

  const fill = (id: string) => {
    const c = contacts.find((x) => x.id === id);
    const f = form.current;
    if (!c || !f) return;
    const set = (name: string, value: string | null) => {
      const el = f.elements.namedItem(name) as HTMLInputElement | null;
      if (el && value) el.value = value;
    };
    set('customer_name', c.name);
    set('phone', c.phone);
    set('email', c.email);
    set('address1', c.address1);
    set('address2', c.address2);
    set('city', c.city);
    set('state', c.state);
    set('postal_code', c.postal_code);
  };

  return (
    <div ref={(el) => { form.current = el?.querySelector('form') ?? null; }}>
      <ActionForm action={order ? updateOrder : createOrder} className="space-y-5">
        {order && <input type="hidden" name="id" value={order.id} />}
        <input type="hidden" name="items" value={JSON.stringify(items.filter((i) => i.description.trim()))} />

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Customer from Workflow (optional)" htmlFor="o-contact" hint="Fills in the name, phone and address.">
            <Select id="o-contact" name="contact_id" className="b-input" defaultValue={initialContact?.id ?? ''} onChange={(e) => fill(e.target.value)}>
              <option value="">— Not linked —</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` · ${c.city}` : ''}</option>)}
            </Select>
          </Field>
          <Field label="Deal (optional)" htmlFor="o-deal">
            <Select id="o-deal" name="deal_id" className="b-input" defaultValue={order?.deal_id ?? defaults?.deal_id ?? ''}>
              <option value="">— None —</option>
              {deals.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
        </div>

        <fieldset className="grid gap-3 rounded-2xl border border-stone/60 p-4 md:grid-cols-6">
          <legend className="b-label px-1">Customer & address</legend>
          <input name="customer_name" className="b-input md:col-span-3" required maxLength={160} placeholder="Customer name" defaultValue={v('customer_name') || initialContact?.name || ''} aria-label="Customer name" />
          <input name="phone" type="tel" className="b-input md:col-span-3" maxLength={40} placeholder="Phone (the driver calls ahead)" defaultValue={v('phone') || initialContact?.phone || ''} aria-label="Phone" />
          <input name="email" type="email" className="b-input md:col-span-6" maxLength={254} placeholder="Email (for the tracking link)" defaultValue={v('email') || initialContact?.email || ''} aria-label="Email" />
          <input name="address1" className="b-input md:col-span-6" required maxLength={200} placeholder="Street address" defaultValue={v('address1') || initialContact?.address1 || ''} aria-label="Street address" />
          <input name="address2" className="b-input md:col-span-6" maxLength={200} placeholder="Apt / unit / gate code / building" defaultValue={v('address2') || initialContact?.address2 || ''} aria-label="Address line 2" />
          <input name="city" className="b-input md:col-span-3" maxLength={80} placeholder="City" defaultValue={v('city') || initialContact?.city || 'Naples'} aria-label="City" />
          <input name="state" className="b-input md:col-span-1" maxLength={40} placeholder="State" defaultValue={v('state') || initialContact?.state || 'FL'} aria-label="State" />
          <input name="postal_code" className="b-input md:col-span-2" maxLength={20} placeholder="Zip" defaultValue={v('postal_code') || initialContact?.postal_code || ''} aria-label="Zip code" />
        </fieldset>

        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Service" htmlFor="o-type">
            <Select id="o-type" name="service_type" className="b-input" defaultValue={order?.service_type ?? 'delivery'}>
              {(Object.keys(serviceLabel) as ServiceType[]).map((k) => <option key={k} value={k}>{serviceLabel[k]}</option>)}
            </Select>
          </Field>
          <Field label="Date" htmlFor="o-date" hint="Leave empty to schedule later.">
            <input id="o-date" name="scheduled_date" type="date" className="b-input" defaultValue={order?.scheduled_date ?? defaults?.scheduled_date ?? ''} />
          </Field>
          <Field label="Window from" htmlFor="o-ws">
            <input
              id="o-ws"
              name="window_start"
              type="time"
              className="b-input"
              defaultValue={order?.window_start?.slice(0, 5) ?? ''}
              onChange={(e) => {
                const end = form.current?.elements.namedItem('window_end') as HTMLInputElement | null;
                if (end && !end.value && e.target.value) {
                  const [h, m] = e.target.value.split(':').map(Number);
                  end.value = `${String(Math.min(23, h + windowHours)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                }
              }}
            />
          </Field>
          <Field label="to" htmlFor="o-we">
            <input id="o-we" name="window_end" type="time" className="b-input" defaultValue={order?.window_end?.slice(0, 5) ?? ''} />
          </Field>
          <Field label="Time at the stop (min)" htmlFor="o-dur">
            <input id="o-dur" name="duration_min" type="number" min={5} max={480} className="b-input" defaultValue={order?.duration_min ?? 30} />
          </Field>
          <Field label="Priority" htmlFor="o-pri">
            <Select id="o-pri" name="priority" className="b-input" defaultValue={order?.priority ?? 'normal'}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </Select>
          </Field>
          <Field label="Balance to collect ($)" htmlFor="o-bal">
            <input id="o-bal" name="balance_due" type="number" min={0} step="0.01" className="b-input" defaultValue={order?.balance_due ?? 0} />
          </Field>
        </div>

        <div className="rounded-2xl border border-stone/60">
          <p className="b-label border-b border-stone/50 px-4 py-2.5">Items on the truck</p>
          <ul className="divide-y divide-stone/40">
            {items.map((it, i) => (
              <li key={i} className="grid gap-2 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_110px_70px_auto_auto] sm:items-center">
                <input aria-label="Item" className="b-input !py-1.5" value={it.description} maxLength={200} onChange={(e) => patch(i, { description: e.target.value })} placeholder="e.g. Sectional sofa — 3 pieces" />
                <input aria-label="SKU" className="b-input !py-1.5" value={it.sku ?? ''} maxLength={60} onChange={(e) => patch(i, { sku: e.target.value || null })} placeholder="SKU" />
                <input aria-label="Quantity" type="number" min={1} max={999} className="b-input !py-1.5" value={it.quantity} onChange={(e) => patch(i, { quantity: Number(e.target.value) || 1 })} />
                <label className="flex items-center gap-1.5 whitespace-nowrap text-xs"><input type="checkbox" className="b-check" checked={it.assembly} onChange={(e) => patch(i, { assembly: e.target.checked })} /> Assembly</label>
                <button type="button" className="justify-self-end rounded p-1.5 text-muted hover:text-red-600" aria-label="Remove item" onClick={() => setItems((l) => (l.length > 1 ? l.filter((_, j) => j !== i) : [blank()]))}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
          <div className="border-t border-stone/50 p-2"><button type="button" className="b-btn-quiet b-btn-sm" onClick={() => setItems((l) => [...l, blank()])}><Plus size={13} /> Add item</button></div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Instructions for the driver" htmlFor="o-ins" hint="Shown on the driver’s phone.">
            <textarea id="o-ins" name="instructions" className="b-input min-h-[80px]" maxLength={2000} defaultValue={order?.instructions ?? ''} placeholder="Gate code, elevator, call 30 min before, remove old sofa…" />
          </Field>
          <Field label="Internal notes" htmlFor="o-int" hint="Only the office sees these.">
            <textarea id="o-int" name="internal_notes" className="b-input min-h-[80px]" maxLength={2000} defaultValue={order?.internal_notes ?? ''} />
          </Field>
        </div>
        <div className="flex justify-end"><SubmitButton className="b-btn-brass" pendingLabel="Saving & finding on the map…">{order ? 'Save order' : 'Create order'}</SubmitButton></div>
      </ActionForm>
    </div>
  );
}
