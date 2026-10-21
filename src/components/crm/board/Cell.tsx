'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Download, ExternalLink, FileUp, Loader2, Mail, Phone, Plus, Search, Trash2, X } from 'lucide-react';
import { deleteFile, type PortalFile } from '@/app/base/(app)/crm/files/actions';
import { DateEditor, RangeEditor } from '@/components/base/calendar/Calendar';
import { Popover } from '@/components/ui/Popover';
import { fileKind, fileUrl, fmtBytes, uploadFile } from '@/components/ui/upload';
import { asIds, asTimeline, fmtShortDate, fmtTimeline, formulaIsMoney, formulaValue, money2, num, type BoardColumn, type BoardItem } from '@/lib/crm/boardTypes';
import { confirmDialog } from '@/components/ui/toast';

export type CellCtx = {
  columns: BoardColumn[];
  subitems: BoardItem[];
  people: { id: string; name: string }[];
  names: Record<string, string>;
  readOnly: boolean;
  /** The row's group colour (timeline pills). */
  color?: string;
  files?: PortalFile[];
  onFiles?: (next: PortalFile[]) => void;
  onSave: (value: unknown) => void;
  onEditLabels?: () => void;
};

const AVATAR = ['#E2445C', '#579BFC', '#A25DDC', '#00C875', '#FDAB3D', '#0086C0', '#FF642E', '#784BD1', '#037F4C', '#FF158A'];
export function avatarColor(name: string) {
  return AVATAR[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR.length];
}
export function Initials({ name, size = 26, ring = false }: { name: string; size?: number; ring?: boolean }) {
  const t = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
  return (
    <span
      title={name}
      className={`inline-flex flex-none items-center justify-center rounded-full font-semibold text-white ${ring ? 'ring-2 ring-surface' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.38, background: avatarColor(name) }}
    >
      {t}
    </span>
  );
}

/** Outline person icon (empty People cell), like monday. */
const EmptyPerson = () => (
  <span className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full border border-dashed border-muted/60 text-muted/70">
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10" cy="7" r="3.2" /><path d="M3.8 17c.9-3.2 3.4-4.8 6.2-4.8s5.3 1.6 6.2 4.8" strokeLinecap="round" /></svg>
  </span>
);

/** A text-like cell: shows the value, becomes an input when clicked, saves on Enter / leaving the field. */
function TextCell({ value, type, ctx, display, center = false }: { value: string; type: 'text' | 'email' | 'phone' | 'link' | 'number' | 'currency'; ctx: CellCtx; display: ReactNode; center?: boolean }) {
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
        className={`h-full w-full bg-surface px-2 py-1.5 text-sm outline-none ring-2 ring-inset ring-brass/70 ${center ? 'text-center' : ''}`}
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
      className={`flex h-full w-full items-center gap-1 truncate px-2 py-1.5 text-sm ${center ? 'justify-center tabular-nums' : 'text-left'} ${ctx.readOnly ? 'cursor-default' : 'hover:ring-1 hover:ring-inset hover:ring-stone'}`}
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

function usePop() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return { ref, open, setOpen, close };
}

function PeoplePicker({ people, selected, multi, onChange }: { people: { id: string; name: string }[]; selected: string[]; multi: boolean; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState('');
  const shown = people.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="w-64">
      <label className="mb-1 flex items-center gap-2 rounded-lg bg-linen px-2.5 py-1.5">
        <Search size={13} className="text-muted" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names" className="w-full bg-transparent text-sm outline-none" />
      </label>
      <div className="max-h-64 space-y-0.5 overflow-y-auto">
        {shown.map((p) => {
          const on = selected.includes(p.id);
          return (
            <button key={p.id} type="button" onClick={() => onChange(multi ? (on ? selected.filter((x) => x !== p.id) : [...selected, p.id]) : on ? [] : [p.id])} className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-sand/70 ${on ? 'font-semibold' : ''}`}>
              <Initials name={p.name} size={24} /> <span className="min-w-0 flex-1 truncate">{p.name}</span> {on && <Check size={14} className="text-brass" />}
            </button>
          );
        })}
        {shown.length === 0 && <p className="px-2 py-3 text-center text-sm text-muted">No one found</p>}
      </div>
    </div>
  );
}

function FilesCell({ ctx, item, col }: { ctx: CellCtx; item: BoardItem; col: BoardColumn }) {
  const p = usePop();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const files = ctx.files ?? [];
  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setError(null);
    let next = files;
    for (const f of Array.from(list)) {
      try {
        const saved = await uploadFile({ item_id: item.id, column_id: col.id }, f);
        next = [...next, saved];
        ctx.onFiles?.(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed.');
      }
    }
    setBusy(false);
  };
  return (
    <div className="h-full">
      <button ref={p.ref} type="button" onClick={() => p.setOpen(true)} className="flex h-full w-full items-center justify-center gap-1 px-1.5 hover:ring-1 hover:ring-inset hover:ring-stone" aria-label={`${col.name}: ${files.length} files`}>
        {files.length === 0 ? (
          !ctx.readOnly && <Plus size={14} className="text-muted/60" />
        ) : (
          files.slice(0, 4).map((f) => {
            const k = fileKind(f.name, f.mime);
            return k.image ? (
              <img key={f.id} src={fileUrl(f.id)} alt={f.name} className="h-[22px] w-[22px] rounded object-cover ring-1 ring-stone" />
            ) : (
              <span key={f.id} className="flex h-[22px] w-[18px] items-center justify-center rounded-[3px] text-[0.5rem] font-bold text-white" style={{ background: k.color }} title={f.name}>
                {k.label[0]}
              </span>
            );
          })
        )}
        {files.length > 4 && <span className="text-[0.65rem] text-muted">+{files.length - 4}</span>}
      </button>
      <Popover anchor={p.ref} open={p.open} onClose={p.close} width={320}>
        <div className="p-1.5">
          <p className="mb-2 text-xs font-semibold text-muted">{col.name}</p>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {files.map((f) => {
              const k = fileKind(f.name, f.mime);
              return (
                <li key={f.id} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-sand/60">
                  {k.image ? (
                    <img src={fileUrl(f.id)} alt="" className="h-9 w-9 rounded object-cover" />
                  ) : (
                    <span className="flex h-9 w-8 flex-none items-center justify-center rounded text-[0.6rem] font-bold text-white" style={{ background: k.color }}>{k.label}</span>
                  )}
                  <a href={fileUrl(f.id)} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium hover:text-brass">{f.name}</span>
                    <span className="block text-[0.68rem] text-muted">{fmtBytes(f.size)}{f.uploader_name ? ` · ${f.uploader_name}` : ''}</span>
                  </a>
                  <a href={fileUrl(f.id)} target="_blank" rel="noreferrer" className="rounded p-1 text-muted hover:text-ink" aria-label="Open"><ExternalLink size={14} /></a>
                  <a href={fileUrl(f.id, true)} className="rounded p-1 text-muted hover:text-ink" aria-label="Download"><Download size={14} /></a>
                  {!ctx.readOnly && (
                    <button
                      type="button"
                      className="rounded p-1 text-muted hover:text-red-600"
                      aria-label="Delete file"
                      onClick={async () => {
                        if (!(await confirmDialog({ title: `Delete ${f.name}?`, danger: true }))) return;
                        const res = await deleteFile(f.id);
                        if (res.ok) ctx.onFiles?.(files.filter((x) => x.id !== f.id));
                        else setError(res.message ?? 'Couldn’t delete.');
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              );
            })}
            {files.length === 0 && <li className="px-2 py-2 text-sm text-muted">No files yet.</li>}
          </ul>
          {error && <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</p>}
          {!ctx.readOnly && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                upload(e.dataTransfer.files);
              }}
              className="mt-2 flex flex-col items-center gap-1 rounded-xl border-2 border-dashed border-stone px-3 py-4 text-center text-xs text-muted"
            >
              <input ref={input} type="file" multiple className="sr-only" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
              <button type="button" disabled={busy} onClick={() => input.current?.click()} className="b-btn-brass b-btn-sm">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />} {busy ? 'Uploading…' : 'Upload files'}
              </button>
              or drop them here · up to 25 MB each
            </div>
          )}
        </div>
      </Popover>
    </div>
  );
}

export default function Cell({ col, item, ctx }: { col: BoardColumn; item: BoardItem; ctx: CellCtx }) {
  const raw = item.values[col.id];
  const p = usePop();
  const labels = useMemo(() => col.settings.labels ?? [], [col.settings.labels]);

  switch (col.type) {
    case 'formula': {
      const n = formulaValue(col, item, ctx.subitems, ctx.columns);
      return <div className={`truncate px-2 py-1.5 text-center text-sm font-medium tabular-nums ${n !== null && n < 0 ? 'text-red-600' : ''}`}>{n === null ? '' : formulaIsMoney(col, ctx.columns) ? money2(n) : Math.round(n * 100) / 100}</div>;
    }
    case 'number':
    case 'currency': {
      const n = num(raw);
      return <TextCell center value={n === null ? '' : String(n)} type={col.type} ctx={ctx} display={n === null ? '' : col.type === 'currency' ? money2(n) : n} />;
    }
    case 'email':
    case 'phone':
    case 'link':
    case 'text': {
      const s = typeof raw === 'string' ? raw : '';
      const href = !s ? null : col.type === 'email' ? `mailto:${s}` : col.type === 'phone' ? `tel:${s}` : col.type === 'link' ? (s.startsWith('http') ? s : `https://${s}`) : null;
      return (
        <div className="group/cell relative flex h-full items-center">
          <TextCell center={col.type === 'text'} value={s} type={col.type} ctx={ctx} display={<span className="truncate">{s}</span>} />
          {href && (
            <a href={href} target={col.type === 'link' ? '_blank' : undefined} rel="noreferrer" className="absolute right-1 hidden rounded bg-surface p-1 text-brass shadow group-hover/cell:block" aria-label="Open" onClick={(e) => e.stopPropagation()}>
              {col.type === 'email' ? <Mail size={12} /> : col.type === 'phone' ? <Phone size={12} /> : <ExternalLink size={12} />}
            </a>
          )}
        </div>
      );
    }
    case 'long_text': {
      const s = typeof raw === 'string' ? raw : '';
      return (
        <div className="h-full">
          <button ref={p.ref} type="button" disabled={ctx.readOnly} onClick={() => p.setOpen(true)} className="flex h-full w-full items-center truncate px-2 py-1.5 text-left text-sm hover:ring-1 hover:ring-inset hover:ring-stone">
            <span className="truncate">{s}</span>
          </button>
          <Popover anchor={p.ref} open={p.open} onClose={p.close} width={340}>
            <LongText value={s} onSave={(v) => { if (v !== s) ctx.onSave(v); p.close(); }} onCancel={p.close} />
          </Popover>
        </div>
      );
    }
    case 'date': {
      const s = typeof raw === 'string' ? raw : '';
      return (
        <div className="h-full">
          <button ref={p.ref} type="button" disabled={ctx.readOnly} onClick={() => p.setOpen(true)} className="flex h-full w-full items-center justify-center px-2 py-1.5 text-sm hover:ring-1 hover:ring-inset hover:ring-stone">
            {s ? fmtShortDate(s) : ''}
          </button>
          <Popover anchor={p.ref} open={p.open} onClose={p.close} width={336}>
            <DateEditor
              value={s}
              label={col.name}
              onSave={(v) => {
                if (v !== (s || null)) ctx.onSave(v);
                p.close();
              }}
            />
          </Popover>
        </div>
      );
    }
    case 'timeline': {
      const t = asTimeline(raw);
      return (
        <div className="h-full p-1">
          <button ref={p.ref} type="button" disabled={ctx.readOnly} onClick={() => p.setOpen(true)} className="flex h-full w-full items-center justify-center rounded-full px-2 text-xs font-semibold text-white" style={{ background: t ? (ctx.color ?? '#579BFC') : 'transparent' }}>
            {t ? fmtTimeline(t) : <span className="text-muted/60">-</span>}
          </button>
          <Popover anchor={p.ref} open={p.open} onClose={p.close} width={336}>
            <RangeEditor value={t} onSave={(v) => { ctx.onSave(v); p.close(); }} />
          </Popover>
        </div>
      );
    }
    case 'checkbox':
      return (
        <div className="flex h-full items-center justify-center">
          <input type="checkbox" className="b-check" checked={Boolean(raw)} disabled={ctx.readOnly} onChange={(e) => ctx.onSave(e.target.checked)} aria-label={col.name} />
        </div>
      );
    case 'person':
    case 'people': {
      const ids = asIds(raw);
      const multi = col.type === 'people';
      return (
        <div className="h-full">
          <button ref={p.ref} type="button" disabled={ctx.readOnly} onClick={() => p.setOpen(true)} className="flex h-full w-full items-center justify-center px-2 py-1 hover:ring-1 hover:ring-inset hover:ring-stone" aria-label={col.name}>
            {ids.length === 0 ? (
              <EmptyPerson />
            ) : (
              <span className="flex -space-x-1.5">
                {ids.slice(0, 3).map((id) => <Initials key={id} name={ctx.names[id] ?? 'Former team member'} ring />)}
                {ids.length > 3 && <span className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full bg-sand text-[0.6rem] font-semibold ring-2 ring-surface">+{ids.length - 3}</span>}
              </span>
            )}
          </button>
          <Popover anchor={p.ref} open={p.open} onClose={p.close}>
            <PeoplePicker
              people={ctx.people}
              selected={ids}
              multi={multi}
              onChange={(next) => {
                ctx.onSave(multi ? (next.length ? next : null) : (next[0] ?? null));
                if (!multi) p.close();
              }}
            />
          </Popover>
        </div>
      );
    }
    case 'files':
      return <FilesCell ctx={ctx} item={item} col={col} />;
    case 'dropdown':
    case 'status': {
      const label = labels.find((l) => l.id === raw);
      const status = col.type === 'status';
      return (
        <div className={`h-full ${status ? '' : 'p-1'}`}>
          <button
            ref={p.ref}
            type="button"
            disabled={ctx.readOnly}
            onClick={() => p.setOpen(true)}
            className={
              status
                ? 'flex h-full min-h-[36px] w-full items-center justify-center truncate px-2 text-[0.8rem] font-medium text-white transition-[filter] hover:brightness-105'
                : 'flex h-full w-full items-center justify-center hover:ring-1 hover:ring-inset hover:ring-stone'
            }
            style={status ? { background: label?.color ?? 'rgb(var(--c-stone) / 0.7)' } : undefined}
          >
            {status ? label?.label ?? '' : label ? <span className="truncate rounded-md px-2 py-0.5 text-xs font-medium" style={{ background: `${label.color}26`, color: label.color, border: `1px solid ${label.color}55` }}>{label.label}</span> : null}
          </button>
          <Popover anchor={p.ref} open={p.open} onClose={p.close} width={status ? 220 : 230}>
            <div className="space-y-1 p-1">
              {labels.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => { ctx.onSave(l.id); p.close(); }}
                  className={status ? 'block w-full truncate rounded px-2 py-2 text-center text-sm font-medium text-white hover:brightness-110' : 'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-sand/70'}
                  style={status ? { background: l.color } : undefined}
                >
                  {!status && <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />}
                  {l.label}
                  {!status && l.id === raw && <Check size={14} className="ml-auto text-brass" />}
                </button>
              ))}
              {label && <button type="button" onClick={() => { ctx.onSave(null); p.close(); }} className="flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-sand/70"><X size={12} /> Clear</button>}
              {ctx.onEditLabels && <button type="button" onClick={() => { p.close(); ctx.onEditLabels!(); }} className="block w-full border-t border-stone/60 px-2 pt-2 text-center text-xs font-medium text-brass">Edit labels…</button>}
            </div>
          </Popover>
        </div>
      );
    }
  }
}

/**
 * Notes editor. Whatever is typed is kept when the box closes — by Save, clicking elsewhere or
 * scrolling away — so nothing is lost; only Cancel (or Esc) throws the change away.
 */
function LongText({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(value);
  const latest = useRef({ draft: value, done: false, onSave });
  latest.current.draft = draft;
  latest.current.onSave = onSave;
  useEffect(
    () => () => {
      const l = latest.current;
      if (!l.done && l.draft !== value) l.onSave(l.draft);
    },
    [value],
  );
  const finish = (save: boolean) => {
    latest.current.done = true;
    if (save) onSave(draft);
    else onCancel();
  };
  return (
    <div className="p-1.5">
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) finish(true);
          if (e.key === 'Escape') latest.current.done = true;
        }}
        maxLength={5000}
        className="b-input min-h-[150px] text-sm"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <span className="mr-auto text-[0.7rem] text-muted">Saves when you click away</span>
        <button type="button" className="b-btn-quiet b-btn-sm" onClick={() => finish(false)}>Cancel</button>
        <button type="button" className="b-btn-brass b-btn-sm" onClick={() => finish(true)}>Save</button>
      </div>
    </div>
  );
}
