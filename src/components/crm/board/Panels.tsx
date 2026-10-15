'use client';

import { useEffect, useState, useTransition } from 'react';
import { ArrowLeft, Copy, FileSpreadsheet, FileText, History, Loader2, MessageSquare, Plus, Trash2, X } from 'lucide-react';
import { addItemUpdate, deleteItem, duplicateItem, itemUpdates } from '@/app/base/(app)/crm/boards/actions';
import { cellText, formulaIsMoney, formulaValue, isNumeric, money2, num, type Board, type BoardColumn, type BoardGroup, type BoardItem, type BoardUpdate } from '@/lib/crm/boardTypes';
import Cell from './Cell';

function Drawer({ onClose, children, label }: { onClose: () => void; children: React.ReactNode; label: string }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[75]" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" className="absolute inset-0 bg-black/30" onClick={onClose} aria-label="Close" />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[640px] flex-col overflow-hidden border-l border-stone/60 bg-ivory text-ink shadow-2xl">{children}</aside>
    </div>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function ItemPanel({
  board,
  item,
  parent,
  columns,
  groups,
  subitems,
  people,
  names,
  canEdit,
  canManage,
  onClose,
  onOpenItem,
  onSaveCell,
  onPatch,
  onAddSub,
  onRemoved,
  onAdded,
  onEditLabels,
  exportHref,
}: {
  board: Board;
  item: BoardItem;
  parent: BoardItem | null;
  columns: BoardColumn[];
  groups: BoardGroup[];
  subitems: BoardItem[];
  people: { id: string; name: string }[];
  names: Record<string, string>;
  canEdit: boolean;
  canManage: boolean;
  onClose: () => void;
  onOpenItem: (id: string) => void;
  onSaveCell: (item: BoardItem, col: BoardColumn, value: unknown) => void;
  onPatch: (patch: Partial<BoardItem>) => void;
  onAddSub: (name: string) => void;
  onRemoved: (ids: string[]) => void;
  onAdded: (items: BoardItem[]) => void;
  onEditLabels: (col: BoardColumn) => void;
  exportHref: (format: 'xlsx' | 'pdf', extra?: string) => string;
}) {
  const isSub = Boolean(item.parent_id);
  const cols = columns.filter((c) => c.scope === (isSub ? 'subitem' : 'item')).sort((a, b) => a.position - b.position);
  const subCols = columns.filter((c) => c.scope === 'subitem').sort((a, b) => a.position - b.position);
  const [tab, setTab] = useState<'details' | 'updates'>('details');
  const [name, setName] = useState(item.name);
  const [desc, setDesc] = useState(item.description ?? '');
  const [updates, setUpdates] = useState<BoardUpdate[] | null>(null);
  const [comment, setComment] = useState('');
  const [newSub, setNewSub] = useState('');
  const [pending, start] = useTransition();
  const group = groups.find((g) => g.id === item.group_id);

  useEffect(() => {
    setName(item.name);
    setDesc(item.description ?? '');
    setUpdates(null);
  }, [item.id, item.name, item.description]);
  useEffect(() => {
    if (tab === 'updates' && updates === null) itemUpdates(item.id).then(setUpdates);
  }, [tab, updates, item.id]);

  const ctx = (it: BoardItem, col: BoardColumn) => ({
    columns,
    subitems: it.id === item.id ? subitems : [],
    people,
    names,
    readOnly: !canEdit,
    onSave: (v: unknown) => onSaveCell(it, col, v),
    onEditLabels: canManage && col.type === 'status' ? () => onEditLabels(col) : undefined,
  });

  return (
    <Drawer onClose={onClose} label={item.name}>
      <header className="border-b border-stone/60 px-5 py-4" style={{ boxShadow: `inset 0 4px 0 ${group?.color ?? '#6366F1'}` }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {parent && (
              <button type="button" onClick={() => onOpenItem(parent.id)} className="mb-1 inline-flex items-center gap-1 text-xs text-muted hover:text-brass-dark"><ArrowLeft size={12} /> {parent.name}</button>
            )}
            <input
              value={name}
              disabled={!canEdit}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name !== item.name && onPatch({ name: name.trim() })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="w-full rounded-lg bg-transparent px-1 text-xl font-semibold outline-none hover:bg-sand/40 focus:bg-surface focus:ring-2 focus:ring-brass/40"
              aria-label="Name"
            />
            <div className="mt-1 flex flex-wrap items-center gap-2 px-1 text-xs text-muted">
              {!isSub && canEdit ? (
                <select value={item.group_id} onChange={(e) => onPatch({ group_id: e.target.value })} className="rounded-md border border-stone/60 bg-surface px-1.5 py-0.5 text-xs" aria-label={board.group_label}>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              ) : (
                <span style={{ color: group?.color }}>{group?.name}</span>
              )}
              <span>· added {when(item.created_at)}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-sand/60" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="b-segment">
            <button type="button" aria-pressed={tab === 'details'} onClick={() => setTab('details')}>Details</button>
            <button type="button" aria-pressed={tab === 'updates'} onClick={() => setTab('updates')} className="inline-flex items-center gap-1"><MessageSquare size={13} /> Updates</button>
          </div>
          {!isSub && (
            <>
              <a href={exportHref('pdf', `&item=${item.id}`)} className="b-btn-ghost b-btn-sm"><FileText size={13} /> PDF</a>
              <a href={exportHref('xlsx', `&item=${item.id}`)} className="b-btn-ghost b-btn-sm"><FileSpreadsheet size={13} /> Excel</a>
            </>
          )}
          {canEdit && (
            <span className="ml-auto flex gap-1">
              <button
                type="button"
                disabled={pending}
                className="b-btn-quiet b-btn-sm"
                onClick={() =>
                  start(async () => {
                    const res = await duplicateItem(item.id);
                    if (res?.ok && res.data?.items) onAdded(JSON.parse(res.data.items));
                  })
                }
              >
                <Copy size={13} /> Duplicate
              </button>
              <button
                type="button"
                disabled={pending}
                className="b-btn-quiet b-btn-sm text-red-600"
                onClick={() => {
                  if (!window.confirm(`Delete “${item.name}”${subitems.length ? ` and its ${subitems.length} sub-items` : ''}?`)) return;
                  start(async () => {
                    const res = await deleteItem(item.id);
                    if (res?.ok) onRemoved([item.id]);
                  });
                }}
              >
                <Trash2 size={13} /> Delete
              </button>
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {tab === 'details' ? (
          <div className="space-y-6">
            <dl className="divide-y divide-stone/50 rounded-2xl border border-stone/60 bg-surface">
              {cols.map((c) => (
                <div key={c.id} className="grid grid-cols-[150px_minmax(0,1fr)] items-center">
                  <dt className="px-3 py-2 text-xs font-medium text-muted">{c.name}</dt>
                  <dd className="min-h-[38px] border-l border-stone/50"><Cell col={c} item={item} ctx={ctx(item, c)} /></dd>
                </div>
              ))}
              {cols.length === 0 && <p className="px-3 py-3 text-sm text-muted">No columns yet.</p>}
            </dl>

            <div>
              <p className="b-label">Description</p>
              <textarea
                value={desc}
                disabled={!canEdit}
                onChange={(e) => setDesc(e.target.value)}
                onBlur={() => desc !== (item.description ?? '') && onPatch({ description: desc })}
                maxLength={10000}
                placeholder="Room details, style, measurements, special instructions…"
                className="b-input min-h-[120px]"
              />
            </div>

            {!isSub && (
              <div>
                <p className="b-label">Sub-items ({subitems.length})</p>
                <div className="overflow-x-auto rounded-2xl border border-stone/60 bg-surface">
                  <table className="w-full min-w-max text-sm">
                    <thead>
                      <tr className="border-b border-stone/60 text-[0.68rem] uppercase tracking-wider text-muted">
                        <th className="px-3 py-2 text-left font-semibold">Name</th>
                        {subCols.map((c) => <th key={c.id} className="border-l border-stone/40 px-2 py-2 font-semibold" style={{ minWidth: Math.min(c.width, 160) }}>{c.name}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {subitems.map((s) => (
                        <tr key={s.id} className="border-b border-stone/40">
                          <td className="px-3 py-1.5"><button type="button" onClick={() => onOpenItem(s.id)} className="text-left hover:text-brass-dark">{s.name}</button></td>
                          {subCols.map((c) => <td key={c.id} className="border-l border-stone/40 p-0"><Cell col={c} item={s} ctx={ctx(s, c)} /></td>)}
                        </tr>
                      ))}
                      {subitems.length > 0 && subCols.some((c) => isNumeric(c.type)) && (
                        <tr className="bg-linen/60 text-xs font-semibold">
                          <td className="px-3 py-1.5 text-muted">Total</td>
                          {subCols.map((c) => {
                            if (!isNumeric(c.type)) return <td key={c.id} />;
                            const total = subitems.reduce((sum, s) => sum + ((c.type === 'formula' ? formulaValue(c, s, [], columns) : num(s.values[c.id])) ?? 0), 0);
                            return <td key={c.id} className="px-2 py-1.5 text-right tabular-nums">{c.type === 'currency' || (c.type === 'formula' && formulaIsMoney(c, columns)) ? money2(total) : total}</td>;
                          })}
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {canEdit && (
                    <form
                      className="flex items-center gap-2 border-t border-stone/50 px-3 py-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (newSub.trim()) onAddSub(newSub);
                        setNewSub('');
                      }}
                    >
                      <Plus size={14} className="text-muted" />
                      <input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Add a sub-item and press Enter" maxLength={200} className="flex-1 bg-transparent text-sm outline-none" />
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {canEdit && (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const body = comment.trim();
                  if (!body) return;
                  start(async () => {
                    const res = await addItemUpdate(item.id, body);
                    if (res?.ok) {
                      setComment('');
                      setUpdates(await itemUpdates(item.id));
                    }
                  });
                }}
              >
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={5000} placeholder="Write an update — a call, a payment, a change…" className="b-input min-h-[90px]" />
                <div className="flex justify-end">
                  <button type="submit" disabled={pending || !comment.trim()} className="b-btn-brass b-btn-sm">{pending && <Loader2 size={13} className="animate-spin" />} Post update</button>
                </div>
              </form>
            )}
            {updates === null ? (
              <p className="flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> Loading…</p>
            ) : updates.length === 0 ? (
              <p className="text-sm text-muted">No updates yet.</p>
            ) : (
              <ul className="space-y-3">
                {updates.map((u) =>
                  u.kind === 'log' ? (
                    <li key={u.id} className="flex items-center gap-2 text-xs text-muted"><History size={12} /> {u.body} · {u.author_name} · {when(u.created_at)}</li>
                  ) : (
                    <li key={u.id} className="rounded-2xl border border-stone/60 bg-surface px-4 py-3">
                      <p className="text-xs text-muted"><b className="text-ink">{u.author_name ?? 'Someone'}</b> · {when(u.created_at)}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{u.body}</p>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}

/** Everything for one group (e.g. a designer): totals, status mix, every row with its sub-items. */
export function GroupPanel({
  board,
  group,
  rows,
  columns,
  subsOf,
  names,
  onClose,
  onOpenItem,
  exportHref,
}: {
  board: Board;
  group: BoardGroup;
  rows: BoardItem[];
  columns: BoardColumn[];
  subsOf: (id: string) => BoardItem[];
  names: Record<string, string>;
  onClose: () => void;
  onOpenItem: (id: string) => void;
  exportHref: (format: 'xlsx' | 'pdf', extra?: string) => string;
}) {
  const itemCols = columns.filter((c) => c.scope === 'item').sort((a, b) => a.position - b.position);
  const subCols = columns.filter((c) => c.scope === 'subitem').sort((a, b) => a.position - b.position);
  const money = itemCols.filter((c) => c.type === 'currency' || (c.type === 'formula' && formulaIsMoney(c, columns)));
  const statusCols = itemCols.filter((c) => c.type === 'status');
  const sum = (c: BoardColumn) => rows.reduce((s, it) => s + ((c.type === 'formula' ? formulaValue(c, it, subsOf(it.id), columns) : num(it.values[c.id])) ?? 0), 0);
  const shown = itemCols.filter((c) => c.type !== 'long_text').slice(0, 5);
  const subCount = rows.reduce((s, r) => s + subsOf(r.id).length, 0);

  return (
    <Drawer onClose={onClose} label={group.name}>
      <header className="border-b border-stone/60 px-5 py-4" style={{ boxShadow: `inset 0 4px 0 ${group.color}` }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="b-eyebrow">{board.group_label}</p>
            <h2 className="text-xl font-semibold" style={{ color: group.color }}>{group.name}</h2>
            <p className="text-xs text-muted">{rows.length} {board.item_label.toLowerCase()}{rows.length === 1 ? '' : 's'} · {subCount} sub-items{group.employee_id && names[group.employee_id] ? ` · ${names[group.employee_id]}` : ''}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-sand/60" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="mt-3 flex gap-2">
          <a href={exportHref('xlsx', `&group=${group.id}`)} className="b-btn-ghost b-btn-sm"><FileSpreadsheet size={13} /> Download Excel</a>
          <a href={exportHref('pdf', `&group=${group.id}`)} className="b-btn-ghost b-btn-sm"><FileText size={13} /> Download PDF</a>
        </div>
      </header>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {money.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {money.map((c) => (
              <div key={c.id} className="rounded-2xl border border-stone/60 bg-surface px-4 py-3">
                <p className="text-xs text-muted">{c.name}</p>
                <p className={`text-lg font-semibold tabular-nums ${sum(c) < 0 ? 'text-red-600' : ''}`}>{money2(sum(c))}</p>
              </div>
            ))}
          </div>
        )}
        {statusCols.map((c) => (
          <div key={c.id}>
            <p className="b-label">{c.name}</p>
            <div className="flex flex-wrap gap-2">
              {(c.settings.labels ?? []).map((l) => {
                const n = rows.filter((r) => r.values[c.id] === l.id).length;
                return n ? <span key={l.id} className="rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: l.color }}>{l.label} · {n}</span> : null;
              })}
            </div>
          </div>
        ))}
        <div className="space-y-3">
          {rows.map((r) => {
            const subs = subsOf(r.id);
            return (
              <div key={r.id} className="rounded-2xl border border-stone/60 bg-surface">
                <button type="button" onClick={() => onOpenItem(r.id)} className="block w-full px-4 py-3 text-left hover:bg-linen/50">
                  <p className="font-semibold">{r.name}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                    {shown.map((c) => {
                      const t = cellText(c, r, { subitems: subs, columns, names });
                      return t ? <span key={c.id}>{c.name}: <b className="font-medium text-ink">{t}</b></span> : null;
                    })}
                  </p>
                </button>
                {subs.length > 0 && (
                  <ul className="border-t border-stone/50 px-4 py-2 text-xs">
                    {subs.map((s) => (
                      <li key={s.id} className="flex flex-wrap gap-x-3 py-0.5">
                        <button type="button" onClick={() => onOpenItem(s.id)} className="font-medium hover:text-brass-dark">↳ {s.name}</button>
                        {subCols.map((c) => {
                          const t = cellText(c, s, { subitems: [], columns, names });
                          return t ? <span key={c.id} className="text-muted">{c.name}: {t}</span> : null;
                        })}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          {rows.length === 0 && <p className="text-sm text-muted">Nothing in this {board.group_label.toLowerCase()} yet.</p>}
        </div>
      </div>
    </Drawer>
  );
}
