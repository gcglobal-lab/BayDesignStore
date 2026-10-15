'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ExternalLink, Mail, Phone, X } from 'lucide-react';
import { formulaIsMoney, formulaValue, money2, num, type BoardColumn, type BoardItem } from '@/lib/crm/boardTypes';

export type CellCtx = {
  columns: BoardColumn[];
  subitems: BoardItem[];
  people: { id: string; name: string }[];
  names: Record<string, string>;
  readOnly: boolean;
  onSave: (value: unknown) => void;
  onEditLabels?: () => void;
};

/** Closes a pop-over when clicking elsewhere or pressing Esc. */
function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

function Popover({ open, onClose, children, wide = false }: { open: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useOutside(open, onClose);
  if (!open) return null;
  return (
    <div ref={ref} className={`absolute left-0 top-full z-40 mt-1 rounded-xl border border-stone/70 bg-ivory p-2 text-ink shadow-xl ${wide ? 'w-72' : 'w-52'}`}>
      {children}
    </div>
  );
}

/** A text-like cell: shows the value, becomes an input when clicked, saves on Enter / leaving the field. */
function TextCell({ value, type, ctx, display }: { value: string; type: 'text' | 'email' | 'phone' | 'link' | 'number' | 'currency'; ctx: CellCtx; display: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing && !ctx.readOnly) {
    const commit = () => {
      setEditing(false);
      if (draft !== value) ctx.onSave(draft);
    };
    return (
      <input
        autoFocus
        className="h-full w-full bg-surface px-2 py-1.5 text-sm outline-none ring-2 ring-inset ring-brass/60"
        value={draft}
        inputMode={type === 'number' || type === 'currency' ? 'decimal' : type === 'phone' ? 'tel' : undefined}
        type={type === 'email' ? 'email' : 'text'}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className={`flex h-full w-full items-center gap-1 truncate px-2 py-1.5 text-left text-sm ${type === 'number' || type === 'currency' ? 'justify-end tabular-nums' : ''} ${ctx.readOnly ? 'cursor-default' : 'hover:bg-sand/40'}`}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      disabled={ctx.readOnly}
    >
      {display}
    </button>
  );
}

export default function Cell({ col, item, ctx }: { col: BoardColumn; item: BoardItem; ctx: CellCtx }) {
  const raw = item.values[col.id];
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  switch (col.type) {
    case 'formula': {
      const n = formulaValue(col, item, ctx.subitems, ctx.columns);
      const moneyish = formulaIsMoney(col, ctx.columns);
      return <div className={`truncate px-2 py-1.5 text-right text-sm font-medium tabular-nums ${n !== null && n < 0 ? 'text-red-600' : ''}`}>{n === null ? '' : moneyish ? money2(n) : Math.round(n * 100) / 100}</div>;
    }
    case 'number':
    case 'currency': {
      const n = num(raw);
      return <TextCell value={n === null ? '' : String(n)} type={col.type} ctx={ctx} display={n === null ? '' : col.type === 'currency' ? money2(n) : n} />;
    }
    case 'email':
    case 'phone':
    case 'link':
    case 'text': {
      const s = typeof raw === 'string' ? raw : '';
      const href = !s ? null : col.type === 'email' ? `mailto:${s}` : col.type === 'phone' ? `tel:${s}` : col.type === 'link' ? (s.startsWith('http') ? s : `https://${s}`) : null;
      return (
        <div className="group/cell relative flex h-full items-center">
          <TextCell value={s} type={col.type} ctx={ctx} display={<span className="truncate">{s}</span>} />
          {href && (
            <a href={href} target={col.type === 'link' ? '_blank' : undefined} rel="noreferrer" className="absolute right-1 hidden rounded bg-surface p-1 text-brass-dark shadow group-hover/cell:block" aria-label="Open" onClick={(e) => e.stopPropagation()}>
              {col.type === 'email' ? <Mail size={12} /> : col.type === 'phone' ? <Phone size={12} /> : <ExternalLink size={12} />}
            </a>
          )}
        </div>
      );
    }
    case 'long_text': {
      const s = typeof raw === 'string' ? raw : '';
      return (
        <div className="relative h-full">
          <button type="button" disabled={ctx.readOnly} onClick={() => setOpen(true)} className="flex h-full w-full items-center truncate px-2 py-1.5 text-left text-sm hover:bg-sand/40">
            <span className="truncate">{s}</span>
          </button>
          {open && <LongTextEditor value={s} onClose={close} onSave={(v) => v !== s && ctx.onSave(v)} />}
        </div>
      );
    }
    case 'date': {
      const s = typeof raw === 'string' ? raw : '';
      return ctx.readOnly ? (
        <div className="px-2 py-1.5 text-sm">{s}</div>
      ) : (
        <input type="date" value={s} onChange={(e) => ctx.onSave(e.target.value || null)} className="h-full w-full bg-transparent px-2 py-1 text-sm outline-none hover:bg-sand/40 focus:ring-2 focus:ring-inset focus:ring-brass/60" aria-label={col.name} />
      );
    }
    case 'checkbox':
      return (
        <div className="flex h-full items-center justify-center">
          <input type="checkbox" className="b-check" checked={Boolean(raw)} disabled={ctx.readOnly} onChange={(e) => ctx.onSave(e.target.checked)} aria-label={col.name} />
        </div>
      );
    case 'person': {
      const id = typeof raw === 'string' ? raw : '';
      const name = id ? (ctx.names[id] ?? 'Former team member') : '';
      return (
        <div className="relative h-full">
          <button type="button" disabled={ctx.readOnly} onClick={() => setOpen(true)} className="flex h-full w-full items-center gap-1.5 truncate px-2 py-1.5 text-left text-sm hover:bg-sand/40">
            {name && <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brass/15 text-[0.6rem] font-bold text-brass-dark">{name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>}
            <span className="truncate">{name}</span>
          </button>
          <Popover open={open} onClose={close}>
            <div className="max-h-64 space-y-0.5 overflow-y-auto">
              {ctx.people.map((p) => (
                <button key={p.id} type="button" className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-sand/60 ${p.id === id ? 'font-semibold text-brass-dark' : ''}`} onClick={() => { ctx.onSave(p.id); close(); }}>
                  {p.id === id && <Check size={13} />} {p.name}
                </button>
              ))}
              {id && <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-muted hover:bg-sand/60" onClick={() => { ctx.onSave(null); close(); }}><X size={13} /> Clear</button>}
            </div>
          </Popover>
        </div>
      );
    }
    case 'status': {
      const label = col.settings.labels?.find((l) => l.id === raw);
      return (
        <div className="relative h-full p-1">
          <button
            type="button"
            disabled={ctx.readOnly}
            onClick={() => setOpen(true)}
            className="flex h-full min-h-[28px] w-full items-center justify-center truncate rounded-md px-2 text-xs font-semibold text-white transition-[filter] hover:brightness-110"
            style={{ background: label?.color ?? 'rgb(var(--c-stone))', color: label ? 'white' : 'rgb(var(--c-muted))' }}
          >
            {label?.label ?? ''}
          </button>
          <Popover open={open} onClose={close}>
            <div className="space-y-1">
              {(col.settings.labels ?? []).map((l) => (
                <button key={l.id} type="button" onClick={() => { ctx.onSave(l.id); close(); }} className="block w-full truncate rounded-md px-2 py-1.5 text-center text-xs font-semibold text-white hover:brightness-110" style={{ background: l.color }}>
                  {l.label}
                </button>
              ))}
              {label && <button type="button" onClick={() => { ctx.onSave(null); close(); }} className="block w-full rounded-md px-2 py-1 text-center text-xs text-muted hover:bg-sand/60">Clear</button>}
              {ctx.onEditLabels && <button type="button" onClick={() => { close(); ctx.onEditLabels!(); }} className="block w-full rounded-md border-t border-stone/60 px-2 pt-2 text-center text-xs font-medium text-brass-dark">Edit labels…</button>}
            </div>
          </Popover>
        </div>
      );
    }
  }
}

function LongTextEditor({ value, onSave, onClose }: { value: string; onSave: (v: string) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(value);
  const done = () => {
    onSave(draft);
    onClose();
  };
  const ref = useOutside(true, done);
  return (
    <div ref={ref} className="absolute left-0 top-0 z-40 w-80 rounded-xl border border-stone/70 bg-ivory p-2 shadow-xl">
      <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={5000} className="b-input min-h-[140px] text-sm" />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className="b-btn-quiet b-btn-sm" onClick={onClose}>Cancel</button>
        <button type="button" className="b-btn-brass b-btn-sm" onClick={done}>Save</button>
      </div>
    </div>
  );
}
