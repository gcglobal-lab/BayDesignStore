'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { AlertCircle, Check, Loader2, Search, Truck, Workflow } from 'lucide-react';
import { setAppAccess } from '@/app/base/(app)/team/access-actions';
import { Avatar } from '@/components/base/ui';
import { crmRoleLabel, deliveriesRoleLabel, type CrmRole, type DeliveriesRole } from '@/lib/portal/apps';

const CRM_OPTIONS: CrmRole[] = ['none', 'user', 'manager'];
const DL_OPTIONS: DeliveriesRole[] = ['none', 'driver', 'dispatcher'];
const short = (v: string, label: string) => (v === 'none' ? 'Off' : label);

/** A row of buttons (Off / User / Manager…) — the chosen one is filled in. */
function Choice<T extends string>({ value, options, labels, onPick, disabled, label }: { value: T; options: T[]; labels: Record<T, string>; onPick: (v: T) => void; disabled: boolean; label: string }) {
  return (
    <div className="inline-flex rounded-xl border border-stone/70 bg-linen p-0.5" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o === value;
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => !on && onPick(o)}
            className={`rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-colors ${
              on ? (o === 'none' ? 'bg-surface text-muted shadow-sm ring-1 ring-stone/60' : 'bg-gradient-to-r from-brass to-brass-dark text-white shadow-sm') : 'text-muted hover:text-ink'
            }`}
          >
            {short(o, labels[o])}
          </button>
        );
      })}
    </div>
  );
}

/** Workflow + Deliveries access for one person. Saves the moment a button is clicked. Admins only. */
export default function AppAccessForm({ id, crm, deliveries, stacked = false }: { id: string; crm: CrmRole; deliveries: DeliveriesRole; stacked?: boolean }) {
  const [value, setValue] = useState({ crm, deliveries });
  const [state, setState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();

  const save = (next: { crm: CrmRole; deliveries: DeliveriesRole }) => {
    const before = value;
    setValue(next);
    start(async () => {
      const fd = new FormData();
      fd.set('id', id);
      fd.set('crm_role', next.crm);
      fd.set('deliveries_role', next.deliveries);
      const res = await setAppAccess(null, fd);
      if (res?.ok) {
        setState('saved');
        window.setTimeout(() => setState('idle'), 1800);
      } else {
        setValue(before);
        setState('error');
        setMessage(res?.message ?? 'Couldn’t save.');
      }
    });
  };

  const status = (
    <span className="inline-flex min-w-[4.5rem] items-center gap-1 text-xs" aria-live="polite">
      {pending ? <Loader2 size={13} className="animate-spin text-muted" /> : state === 'saved' ? <span className="inline-flex items-center gap-1 text-emerald-700"><Check size={13} /> Saved</span> : state === 'error' ? <span className="inline-flex items-center gap-1 text-red-600"><AlertCircle size={13} /> {message}</span> : null}
    </span>
  );

  if (stacked) {
    return (
      <div className="space-y-3">
        <div>
          <p className="b-label flex items-center gap-1.5"><Workflow size={13} /> Workflow (CRM)</p>
          <Choice label="Workflow access" value={value.crm} options={CRM_OPTIONS} labels={crmRoleLabel} disabled={pending} onPick={(v) => save({ ...value, crm: v })} />
        </div>
        <div>
          <p className="b-label flex items-center gap-1.5"><Truck size={13} /> Deliveries</p>
          <Choice label="Deliveries access" value={value.deliveries} options={DL_OPTIONS} labels={deliveriesRoleLabel} disabled={pending} onPick={(v) => save({ ...value, deliveries: v })} />
        </div>
        {status}
      </div>
    );
  }
  return (
    <>
      <td><Choice label="Workflow access" value={value.crm} options={CRM_OPTIONS} labels={crmRoleLabel} disabled={pending} onPick={(v) => save({ ...value, crm: v })} /></td>
      <td><Choice label="Deliveries access" value={value.deliveries} options={DL_OPTIONS} labels={deliveriesRoleLabel} disabled={pending} onPick={(v) => save({ ...value, deliveries: v })} /></td>
      <td>{status}</td>
    </>
  );
}

export type AccessPerson = { id: string; name: string; level: 'employee' | 'manager' | 'admin'; role: string | null; crm: CrmRole; deliveries: DeliveriesRole };

/** Settings ▸ App access: everyone in one tidy table, with search. */
export function AppAccessTable({ people }: { people: AccessPerson[] }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => people.filter((p) => `${p.name} ${p.role ?? ''} ${p.level}`.toLowerCase().includes(q.trim().toLowerCase())), [people, q]);
  return (
    <div className="space-y-4">
      <label className="relative block max-w-sm">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person…" className="b-input !py-2 pl-9" />
      </label>
      <div className="overflow-x-auto rounded-2xl border border-stone/60">
        <table className="b-table b-table-plain min-w-[720px]">
          <thead>
            <tr>
              <th>Person</th>
              <th><span className="inline-flex items-center gap-1.5"><Workflow size={14} /> Workflow</span></th>
              <th><span className="inline-flex items-center gap-1.5"><Truck size={14} /> Deliveries</span></th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/base/team/${p.id}`} className="flex items-center gap-2.5 hover:text-brass-dark">
                    <Avatar name={p.name} size="sm" />
                    <span>
                      <span className="block font-medium">{p.name}</span>
                      <span className="block text-xs capitalize text-muted">{p.level}{p.role ? ` · ${p.role}` : ''}</span>
                    </span>
                  </Link>
                </td>
                {p.level === 'admin' ? (
                  <>
                    <td colSpan={2}><span className="b-badge-green">Admin — full access to every app</span></td>
                    <td />
                  </>
                ) : (
                  <AppAccessForm id={p.id} crm={p.crm} deliveries={p.deliveries} />
                )}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={4} className="py-8 text-center text-sm text-muted">Nobody matches “{q}”.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
