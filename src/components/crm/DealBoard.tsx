'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CalendarClock, Flame, GripVertical, ThumbsDown, Trophy } from 'lucide-react';
import { moveDeal, setDealStatus } from '@/app/base/(app)/crm/deals/actions';
import { initials } from '@/components/base/ui';
import { moneyShort, type Stage } from '@/lib/crm/types';

export type BoardCard = {
  id: string;
  title: string;
  stage_id: string;
  value: number;
  position: number;
  priority: 'low' | 'normal' | 'high';
  who: string | null;
  owner: string | null;
  tags: string[];
  daysInStage: number;
  rotting: boolean;
  next: { label: string; overdue: boolean } | null;
  close: string | null;
  canMove: boolean;
};

/**
 * Pipeline board. Drag a card to another column (or within one) to move it; drop it on Won /
 * Lost to close it. On phones, the stage picker on each card does the same.
 */
export default function DealBoard({ stages, cards: initial, lostReasons }: { stages: Stage[]; cards: BoardCard[]; lostReasons: string[] }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lostFor, setLostFor] = useState<string | null>(null);
  const [, start] = useTransition();
  useEffect(() => setCards(initial), [initial]);

  const column = (stageId: string) => cards.filter((c) => c.stage_id === stageId).sort((a, b) => a.position - b.position);

  function move(id: string, stageId: string, beforeId: string | null) {
    const list = column(stageId).filter((c) => c.id !== id);
    const idx = beforeId ? list.findIndex((c) => c.id === beforeId) : list.length;
    const prev = list[idx - 1]?.position;
    const next = list[idx]?.position;
    const position = prev === undefined && next === undefined ? 0 : prev === undefined ? next! - 1 : next === undefined ? prev + 1 : (prev + next) / 2;
    const snapshot = cards;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stage_id: stageId, position, daysInStage: c.stage_id === stageId ? c.daysInStage : 0, rotting: c.stage_id === stageId ? c.rotting : false } : c)));
    start(async () => {
      const res = await moveDeal(id, stageId, position);
      if (!res?.ok) {
        setCards(snapshot);
        setError(res?.message ?? 'Couldn’t move the deal.');
      } else router.refresh();
    });
  }

  function close(id: string, status: 'won' | 'lost', reason?: string) {
    const snapshot = cards;
    setCards((cs) => cs.filter((c) => c.id !== id));
    const fd = new FormData();
    fd.set('id', id);
    fd.set('status', status);
    if (reason) fd.set('lost_reason', reason);
    start(async () => {
      const res = await setDealStatus(null, fd);
      if (!res?.ok) {
        setCards(snapshot);
        setError(res?.message ?? 'Couldn’t update the deal.');
      } else router.refresh();
    });
  }

  const dropProps = (stageId: string, beforeId: string | null = null) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(stageId);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const id = e.dataTransfer.getData('text/plain') || dragId;
      setOver(null);
      setDragId(null);
      if (id) move(id, stageId, beforeId);
    },
  });

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle size={15} /> {error}
          <button type="button" className="ml-auto text-xs underline" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        <div className="flex min-w-max gap-3">
          {stages.map((s) => {
            const list = column(s.id);
            const total = list.reduce((sum, c) => sum + c.value, 0);
            return (
              <section
                key={s.id}
                {...dropProps(s.id)}
                onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
                className={`flex w-[272px] flex-none flex-col rounded-2xl border bg-sand/40 transition-colors ${over === s.id ? 'border-brass bg-brass/10' : 'border-stone/50'}`}
              >
                <header className="rounded-t-2xl border-b border-stone/50 px-3 py-2.5" style={{ boxShadow: `inset 0 3px 0 ${s.color}` }}>
                  <p className="flex items-center justify-between gap-2 text-sm font-semibold text-ink">
                    <span className="truncate">{s.name}</span>
                    <span className="rounded-full bg-surface px-2 py-0.5 text-[0.68rem] text-muted">{list.length}</span>
                  </p>
                  <p className="mt-0.5 text-[0.7rem] text-muted">
                    {moneyShort(total)} · {s.probability}% → <span className="font-medium text-ink/80">{moneyShort((total * s.probability) / 100)}</span>
                  </p>
                </header>
                <div className="flex min-h-[140px] flex-1 flex-col gap-2 p-2">
                  {list.map((c) => (
                    <article
                      key={c.id}
                      draggable={c.canMove}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', c.id);
                        e.dataTransfer.effectAllowed = 'move';
                        setDragId(c.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOver(null);
                      }}
                      {...dropProps(s.id, c.id)}
                      className={`group rounded-xl border bg-surface p-3 shadow-[0_6px_16px_-14px_rgb(var(--c-ink)/0.6)] transition-all ${dragId === c.id ? 'opacity-40' : ''} ${c.rotting ? 'border-red-300/70' : 'border-stone/60'} ${c.canMove ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    >
                      <div className="flex items-start gap-1.5">
                        {c.canMove && <GripVertical size={14} className="mt-0.5 flex-none text-muted/50" />}
                        <Link href={`/base/crm/deals/${c.id}`} className="min-w-0 flex-1 text-sm font-semibold leading-snug text-ink hover:text-brass-dark">
                          {c.title}
                        </Link>
                        {c.priority === 'high' && <Flame size={14} className="flex-none text-red-500" aria-label="High priority" />}
                      </div>
                      {c.who && <p className="mt-1 truncate text-xs text-muted">{c.who}</p>}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-ink">{moneyShort(c.value)}</span>
                        <span className="flex items-center gap-1.5">
                          {c.rotting && <span className="b-badge-red" title="No movement for a while">{c.daysInStage}d idle</span>}
                          {c.owner && (
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brass/15 text-[0.6rem] font-bold text-brass-dark" title={c.owner}>
                              {initials(c.owner)}
                            </span>
                          )}
                        </span>
                      </div>
                      {c.next ? (
                        <p className={`mt-2 flex items-center gap-1 truncate text-[0.7rem] ${c.next.overdue ? 'text-red-700' : 'text-muted'}`}>
                          <CalendarClock size={11} /> {c.next.label}
                        </p>
                      ) : (
                        <p className="mt-2 flex items-center gap-1 text-[0.7rem] text-amber-700"><AlertTriangle size={11} /> No next step planned</p>
                      )}
                      {c.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {c.tags.slice(0, 3).map((t) => <span key={t} className="rounded-full bg-sand px-2 py-0.5 text-[0.62rem] font-medium text-muted">{t}</span>)}
                        </div>
                      )}
                      {c.canMove && (
                        <select
                          aria-label="Move to stage"
                          className="mt-2 w-full rounded-lg border border-stone/60 bg-surface px-2 py-1 text-[0.7rem] text-muted lg:hidden"
                          value={c.stage_id}
                          onChange={(e) => move(c.id, e.target.value, null)}
                        >
                          {stages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                        </select>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* Drop zones for closing a deal */}
      <div className={`sticky bottom-3 z-10 mt-2 grid grid-cols-2 gap-3 transition-all ${dragId ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData('text/plain');
            setDragId(null);
            if (id) close(id, 'won');
          }}
          className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-400 bg-emerald-50 py-5 text-sm font-semibold text-emerald-700"
        >
          <Trophy size={18} /> Drop here: Won
        </div>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData('text/plain');
            setDragId(null);
            if (id) setLostFor(id);
          }}
          className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-red-300 bg-red-50 py-5 text-sm font-semibold text-red-700"
        >
          <ThumbsDown size={18} /> Drop here: Lost
        </div>
      </div>

      {lostFor && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Why was it lost?">
          <div className="w-full max-w-sm rounded-3xl border border-stone/60 bg-ivory p-5 text-ink shadow-2xl">
            <p className="b-h2 mb-1">Why was it lost?</p>
            <p className="mb-4 text-sm text-muted">{cards.find((c) => c.id === lostFor)?.title}</p>
            <div className="grid gap-2">
              {lostReasons.map((r) => (
                <button
                  key={r}
                  type="button"
                  className="b-btn-ghost justify-start"
                  onClick={() => {
                    close(lostFor, 'lost', r);
                    setLostFor(null);
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
            <button type="button" className="b-btn-quiet mt-3 w-full" onClick={() => setLostFor(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
