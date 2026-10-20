'use client';

import { useMemo, useRef, useState } from 'react';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import { createOrder, updateOrder } from '@/app/base/(app)/deliveries/orders/actions';
import { ActionForm, Field, SubmitButton } from '@/components/base/forms';
import { serviceLabel, type Order, type OrderItem, type ServiceType } from '@/lib/deliveries/types';
import Select from '@/components/ui/Select';
import { Popover } from '@/components/ui/Popover';

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

  // Customer picker: type to filter Workflow customers, pick one, add a new one, or leave a one-off name.
  const nameInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(v('customer_name') || initialContact?.name || '');
  const [contactId, setContactId] = useState(order?.contact_id ?? defaults?.contact_id ?? '');
  const [isNew, setIsNew] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const linked = contacts.find((c) => c.id === contactId);
  const matches = useMemo(() => {
    const q = name.trim().toLowerCase();
    const hit = q ? contacts.filter((c) => [c.name, c.phone, c.email, c.city].some((x) => x?.toLowerCase().includes(q))) : contacts;
    return hit.slice(0, 50);
  }, [contacts, name]);

  const fill = (id: string) => {
    const c = contacts.find((x) => x.id === id);
    const f = form.current;
    if (!c || !f) return;
    const set = (name: string, value: string | null) => {
      const el = f.elements.namedItem(name) as HTMLInputElement | null;
      if (el && value) el.value = value;
    };
    set('phone', c.phone);
    set('email', c.email);
    set('address1', c.address1);
    set('address2', c.address2);
    set('city', c.city);
    set('state', c.state);
    set('postal_code', c.postal_code);
  };

  const pickContact = (c: ContactOption) => {
    setName(c.name);
    setContactId(c.id);
    setIsNew(false);
    setOpen(false);
    fill(c.id);
  };
  const addNew = () => {
    setContactId('');
    setIsNew(true);
    setOpen(false);
    const next = name.trim() ? form.current?.elements.namedItem('phone') : nameInput.current;
    (next as HTMLInputElement | null)?.focus();
  };
  // Row 0 is "Add new customer"; rows 1… are the matches.
  const onNameKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((i) => Math.min(matches.length, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      if (active === 0) addNew();
      else pickContact(matches[active - 1]);
    } else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div ref={(el) => { form.current = el?.querySelector('form') ?? null; }}>
      <ActionForm action={order ? updateOrder : createOrder} className="space-y-5">
        {order && <input type="hidden" name="id" value={order.id} />}
        <input type="hidden" name="items" value={JSON.stringify(items.filter((i) => i.description.trim()))} />

        <input type="hidden" name="contact_id" value={contactId} />
        <input type="hidden" name="new_customer" value={isNew && !contactId ? '1' : ''} />

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Deal (optional)" htmlFor="o-deal">
            <Select id="o-deal" name="deal_id" className="b-input" defaultValue={order?.deal_id ?? defaults?.deal_id ?? ''}>
              <option value="">— None —</option>
              {deals.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
        </div>

        <fieldset className="grid gap-3 rounded-2xl border border-stone/60 p-4 md:grid-cols-6">
          <legend className="b-label px-1">Customer & address</legend>
          <div className="md:col-span-3">
            <input
              ref={nameInput}
              name="customer_name"
              className="b-input"
              required
              maxLength={160}
              autoComplete="off"
              placeholder="Customer name — type to search"
              aria-label="Customer name"
              role="combobox"
              aria-expanded={open}
              value={name}
              onClick={() => setOpen(true)}
              onChange={(e) => {
                setName(e.target.value);
                if (linked && e.target.value !== linked.name) setContactId('');
                setActive(0);
                setOpen(true);
              }}
              onKeyDown={onNameKey}
            />
            <p className="mt-1 text-xs text-muted">
              {linked ? <>Linked to <span className="font-semibold text-ink">{linked.name}</span> in Workflow</> : contactId ? 'Linked to a Workflow customer' : isNew ? 'New customer — added to Workflow when you save' : 'One-off delivery — not linked to a customer'}
            </p>
            <Popover anchor={nameInput} open={open} onClose={() => setOpen(false)} matchWidth width={260}>
              <ul role="listbox" className="space-y-0.5">
                <li>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active === 0}
                    onMouseEnter={() => setActive(0)}
                    onClick={addNew}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-brass-dark transition-colors ${active === 0 ? 'bg-brass/10' : ''}`}
                  >
                    <UserPlus size={14} className="flex-none" />
                    <span className="min-w-0 flex-1 truncate">{name.trim() ? `Add “${name.trim()}” as a new customer` : 'Add new customer'}</span>
                  </button>
                </li>
                {matches.length > 0 && <li className="px-2.5 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-wider text-muted">Customers</li>}
                {matches.map((c, i) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active === i + 1}
                      onMouseEnter={() => setActive(i + 1)}
                      onClick={() => pickContact(c)}
                      className={`flex w-full flex-col rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${active === i + 1 ? 'bg-brass/10' : ''} ${c.id === contactId ? 'font-semibold text-brass-dark' : 'text-ink'}`}
                    >
                      <span className="truncate">{c.name}</span>
                      {(c.city || c.phone) && <span className="truncate text-xs font-normal text-muted">{[c.city, c.phone].filter(Boolean).join(' · ')}</span>}
                    </button>
                  </li>
                ))}
                {matches.length === 0 && name.trim() && <li className="px-2.5 py-2 text-xs text-muted">No customers match “{name.trim()}”</li>}
              </ul>
            </Popover>
          </div>
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
