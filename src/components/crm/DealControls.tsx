'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, RotateCcw, ThumbsDown, Trophy } from 'lucide-react';
import { moveDeal, setDealStatus } from '@/app/base/(app)/crm/deals/actions';
import { ActionForm, SubmitButton } from '@/components/base/forms';
import type { Stage } from '@/lib/crm/types';

/** The stage bar on a deal: click a stage to move the deal there. */
export function StageBar({ dealId, stages, current, disabled }: { dealId: string; stages: Stage[]; current: string; disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [active, setActive] = useState(current);
  const idx = stages.findIndex((s) => s.id === active);
  return (
    <div className={`flex overflow-hidden rounded-xl ring-1 ring-stone/60 ${pending ? 'opacity-70' : ''}`} role="list" aria-label="Pipeline stage">
      {stages.map((s, i) => {
        const on = i <= idx;
        return (
          <button
            key={s.id}
            type="button"
            role="listitem"
            disabled={disabled || pending}
            title={`${s.name} · ${s.probability}%`}
            onClick={() => {
              if (s.id === active) return;
              setActive(s.id);
              start(async () => {
                const res = await moveDeal(dealId, s.id, Date.now() / 1e6);
                if (!res?.ok) setActive(current);
                router.refresh();
              });
            }}
            className={`relative min-w-0 flex-1 truncate px-2 py-2 text-[0.7rem] font-semibold transition-colors ${on ? 'text-white' : 'bg-surface text-muted hover:bg-sand/60'} ${i ? 'border-l border-white/30' : ''}`}
            style={on ? { background: stages[idx]?.color } : undefined}
          >
            {i === idx && <Check size={11} className="mr-1 inline" />}
            {s.name}
          </button>
        );
      })}
    </div>
  );
}

/** Won / Lost (with a reason) / Re-open. */
export function DealStatusButtons({ id, status, lostReasons, disabled }: { id: string; status: 'open' | 'won' | 'lost'; lostReasons: string[]; disabled: boolean }) {
  const [losing, setLosing] = useState(false);
  if (disabled) return null;
  if (status !== 'open') {
    return (
      <ActionForm action={setDealStatus} showMessage={false} className="">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="status" value="open" />
        <SubmitButton className="b-btn-ghost"><RotateCcw size={14} /> Re-open</SubmitButton>
      </ActionForm>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActionForm action={setDealStatus} showMessage={false} className="">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="status" value="won" />
        <SubmitButton className="b-btn inline-flex bg-emerald-600 text-white hover:bg-emerald-700"><Trophy size={14} /> Won</SubmitButton>
      </ActionForm>
      {losing ? (
        <ActionForm action={setDealStatus} className="flex items-center gap-2">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="lost" />
          <select name="lost_reason" className="b-input !w-auto !py-1.5" required defaultValue="">
            <option value="" disabled>Reason…</option>
            {lostReasons.map((r) => <option key={r}>{r}</option>)}
          </select>
          <SubmitButton className="b-btn-danger">Mark lost</SubmitButton>
          <button type="button" className="b-btn-quiet" onClick={() => setLosing(false)}>Cancel</button>
        </ActionForm>
      ) : (
        <button type="button" className="b-btn-danger" onClick={() => setLosing(true)}><ThumbsDown size={14} /> Lost</button>
      )}
    </div>
  );
}
