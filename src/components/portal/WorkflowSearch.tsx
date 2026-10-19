'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Handshake, ListTodo, Loader2, Rows3, Search, Table2, UserRound, Zap, type LucideIcon } from 'lucide-react';
import { searchWorkflow, type SearchHit } from '@/app/base/(app)/crm/search-actions';

const ICONS: Record<SearchHit['kind'], LucideIcon> = { Board: Table2, Row: Rows3, Contact: UserRound, Company: Building2, Deal: Handshake, Lead: Zap, Task: ListTodo };
const ORDER: SearchHit['kind'][] = ['Board', 'Row', 'Contact', 'Company', 'Deal', 'Lead', 'Task'];
const HEADINGS: Record<SearchHit['kind'], string> = { Board: 'Boards', Row: 'Rows on boards', Contact: 'Contacts', Company: 'Companies', Deal: 'Deals', Lead: 'Leads', Task: 'Tasks' };

/** The search button at the top of the Workflow menu, and its pop-up (also opens with Ctrl / ⌘ + K). */
export function SearchButton({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="px-3 pt-3">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-2.5 rounded-xl bg-white/[0.07] px-3 py-2.5 text-[0.88rem] text-white/70 ring-1 ring-white/10 transition-colors hover:bg-white/[0.12] hover:text-white"
      >
        <Search size={16} strokeWidth={1.9} />
        Search
        <kbd className="ml-auto rounded-md bg-white/10 px-1.5 py-0.5 font-sans text-[0.65rem] text-white/60">Ctrl K</kbd>
      </button>
    </div>
  );
}

export default function WorkflowSearch({ open, onClose, dark }: { open: boolean; onClose: () => void; dark: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    if (!open) return;
    setActive(0);
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    const ticket = ++latest.current;
    const id = window.setTimeout(async () => {
      const res = await searchWorkflow(term).catch(() => []);
      if (ticket !== latest.current) return; // a newer search has started
      setHits(res);
      setBusy(false);
    }, 220);
    return () => window.clearTimeout(id);
  }, [q, open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  const sorted = ORDER.flatMap((k) => hits.filter((h) => h.kind === k));
  const go = (h: SearchHit | undefined) => {
    if (!h) return;
    onClose();
    setQ('');
    router.push(h.href);
  };

  return (
    <div data-app="crm" data-theme={dark ? 'dark' : 'light'} className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search Workflow">
      <button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close search" />
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-stone/70 bg-surface text-ink shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-3 border-b border-stone/70 px-4">
          {busy ? <Loader2 size={18} className="animate-spin text-muted" /> : <Search size={18} className="text-muted" />}
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, sorted.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              }
              if (e.key === 'Enter') go(sorted[active]);
            }}
            placeholder="Search boards, rows, contacts, deals, leads, tasks…"
            className="w-full bg-transparent py-4 text-[0.95rem] outline-none placeholder:text-muted"
            aria-label="Search"
          />
          <kbd className="rounded-md border border-stone px-1.5 py-0.5 text-[0.65rem] text-muted">Esc</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {q.trim().length < 2 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Type at least two letters.</p>
          ) : !busy && sorted.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Nothing matches “{q.trim()}”.</p>
          ) : (
            ORDER.map((kind) => {
              const list = sorted.filter((h) => h.kind === kind);
              if (!list.length) return null;
              const Icon = ICONS[kind];
              return (
                <div key={kind} className="mb-1">
                  <p className="px-3 pb-1 pt-2 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">{HEADINGS[kind]}</p>
                  {list.map((h) => {
                    const i = sorted.indexOf(h);
                    return (
                      <button
                        key={`${h.kind}-${h.id}`}
                        type="button"
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(h)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${i === active ? 'bg-brass/10' : ''}`}
                      >
                        <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg ${i === active ? 'bg-brass text-white' : 'bg-sand text-ink/70'}`}>
                          <Icon size={15} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{h.title}</span>
                          <span className="block truncate text-xs capitalize text-muted">{h.sub}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
