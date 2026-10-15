'use client';

import { useActionState, useRef } from 'react';
import { Check, Loader2, Truck, Workflow } from 'lucide-react';
import { setAppAccess } from '@/app/base/(app)/team/access-actions';
import { crmRoleLabel, deliveriesRoleLabel, type CrmRole, type DeliveriesRole } from '@/lib/portal/apps';

/** Two drop-downs (Workflow, Deliveries) that save as soon as one changes. Admins only. */
export default function AppAccessForm({ id, crm, deliveries, compact = false }: { id: string; crm: CrmRole; deliveries: DeliveriesRole; compact?: boolean }) {
  const [result, action, pending] = useActionState(setAppAccess, null);
  const form = useRef<HTMLFormElement>(null);
  const submit = () => form.current?.requestSubmit();
  return (
    <form ref={form} action={action} className={compact ? 'flex flex-wrap items-center gap-2' : 'space-y-3'}>
      <input type="hidden" name="id" value={id} />
      <label className={compact ? 'flex items-center gap-1.5' : 'block'}>
        <span className={compact ? 'sr-only' : 'b-label flex items-center gap-1.5'}>
          <Workflow size={13} /> Workflow (CRM)
        </span>
        <select name="crm_role" defaultValue={crm} onChange={submit} className="b-input !py-1.5" aria-label="Workflow access">
          {(Object.keys(crmRoleLabel) as CrmRole[]).map((k) => (
            <option key={k} value={k}>
              {compact ? `Workflow: ${crmRoleLabel[k]}` : crmRoleLabel[k]}
            </option>
          ))}
        </select>
      </label>
      <label className={compact ? 'flex items-center gap-1.5' : 'block'}>
        <span className={compact ? 'sr-only' : 'b-label flex items-center gap-1.5'}>
          <Truck size={13} /> Deliveries
        </span>
        <select name="deliveries_role" defaultValue={deliveries} onChange={submit} className="b-input !py-1.5" aria-label="Deliveries access">
          {(Object.keys(deliveriesRoleLabel) as DeliveriesRole[]).map((k) => (
            <option key={k} value={k}>
              {compact ? `Deliveries: ${deliveriesRoleLabel[k]}` : deliveriesRoleLabel[k]}
            </option>
          ))}
        </select>
      </label>
      <span className="inline-flex min-w-[4rem] items-center gap-1 text-xs" aria-live="polite">
        {pending ? (
          <Loader2 size={13} className="animate-spin text-muted" />
        ) : result?.ok ? (
          <span className="inline-flex items-center gap-1 text-emerald-700"><Check size={13} /> {result.message}</span>
        ) : result?.message ? (
          <span className="text-red-600">{result.message}</span>
        ) : null}
      </span>
    </form>
  );
}
