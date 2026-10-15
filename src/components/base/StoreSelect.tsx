'use client';

import { useRef, useState, useTransition } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { assignStore } from '@/app/base/(app)/team/actions';
import Select from '@/components/ui/Select';

/** Uptown / Downtown for one person — saves as soon as it's changed, and stays until changed again. */
export default function StoreSelect({ employeeId, value, locations, disabled = false, compact = false }: { employeeId: string; value: string | null; locations: { id: string; name: string }[]; disabled?: boolean; compact?: boolean }) {
  const [current, setCurrent] = useState(value ?? '');
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} className="flex items-center gap-1.5" onSubmit={(e) => e.preventDefault()}>
      <span className={`relative inline-flex items-center ${compact ? '' : 'w-full'}`}>
        <MapPin size={14} className={`pointer-events-none absolute left-2.5 ${current ? 'text-violet-500' : 'text-muted'}`} />
        <Select
          aria-label="Store"
          disabled={disabled || pending}
          value={current}
          onChange={(e) => {
            const next = e.target.value;
            setCurrent(next);
            setSaved(false);
            const fd = new FormData();
            fd.set('id', employeeId);
            fd.set('location_id', next);
            start(async () => {
              await assignStore(fd);
              setSaved(true);
              window.setTimeout(() => setSaved(false), 1500);
            });
          }}
          className={`appearance-none rounded-xl border bg-white py-1.5 pl-7 pr-7 text-sm font-medium transition-colors focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-60 ${current ? 'border-violet-200 text-ink' : 'border-dashed border-stone text-muted'} ${compact ? '' : 'w-full'}`}
        >
          <option value="">No store</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
        <span className="pointer-events-none absolute right-2.5 text-[0.6rem] text-muted">▼</span>
      </span>
      {pending && <Loader2 size={14} className="animate-spin text-violet-500" />}
      {saved && <span className="text-xs font-medium text-emerald-600">Saved</span>}
    </form>
  );
}
