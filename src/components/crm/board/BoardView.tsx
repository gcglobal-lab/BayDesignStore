'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, ChevronDown, ChevronRight, Download, FileSpreadsheet, FileText, GripVertical, LayoutGrid, MoreHorizontal, Plus, Search, Table2, Trash2, UserRound, X } from 'lucide-react';
import { addColumn, addGroup, addItem, deleteColumn, deleteGroup, setCell, updateColumn, updateGroup, updateItem } from '@/app/base/(app)/crm/boards/actions';
import { cellText, columnTypeLabel, formulaIsMoney, formulaLabel, formulaValue, GROUP_COLORS, isNumeric, money2, num, STATUS_COLORS, type Board, type BoardColumn, type BoardGroup, type BoardItem, type ColumnType, type FormulaOp, type StatusLabel } from '@/lib/crm/boardTypes';
import Cell from './Cell';
import { GroupPanel, ItemPanel } from './Panels';

export type BoardData = { board: Board; columns: BoardColumn[]; groups: BoardGroup[]; items: BoardItem[] };
type Person = { id: string; name: string };

/** Pop-over anchored under a button; closes on outside click / Esc. */
function Menu({ open, onClose, children, align = 'left', width = 'w-56' }: { open: boolean; onClose: () => void; children: React.ReactNode; align?: 'left' | 'right'; width?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className={`absolute top-full z-50 mt-1 ${width} rounded-xl border border-stone/70 bg-ivory p-1.5 text-left text-sm font-normal normal-case tracking-normal text-ink shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}>
      {children}
    </div>
  );
}
const MenuItem = ({ onClick, children, danger }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) => (
  <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-sand/60 ${danger ? 'text-red-600' : ''}`}>{children}</button>
);

/** Editor for a status column's labels, or a formula's inputs. */
function ColumnSetup({ col, columns, onSave, onClose }: { col: BoardColumn; columns: BoardColumn[]; onSave: (settings: BoardColumn['settings']) => void; onClose: () => void }) {
  const [labels, setLabels] = useState<StatusLabel[]>(col.settings.labels ?? []);
  const [op, setOp] = useState<FormulaOp>(col.settings.op ?? 'subtract');
  const [a, setA] = useState(col.settings.a ?? '');
  const [b, setB] = useState(col.settings.b ?? '');
  const numericCols = columns.filter((c) => c.scope === col.scope && c.id !== col.id && isNumeric(c.type));
  const subCols = columns.filter((c) => c.scope === 'subitem' && isNumeric(c.type));
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-3xl border border-stone/60 bg-ivory p-5 text-ink shadow-2xl">
        <p className="b-h2 mb-4">{col.type === 'status' ? `Labels · ${col.name}` : `Formula · ${col.name}`}</p>
        {col.type === 'status' ? (
          <div className="space-y-2">
            {labels.map((l, i) => (
              <div key={l.id} className="flex items-center gap-2">
                <input type="color" value={l.color} onChange={(e) => setLabels(labels.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} className="h-9 w-10 cursor-pointer rounded-lg border border-stone" aria-label="Colour" />
                <input value={l.label} maxLength={40} onChange={(e) => setLabels(labels.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="b-input !py-1.5" aria-label="Label" />
                <button type="button" onClick={() => setLabels(labels.filter((_, j) => j !== i))} className="rounded p-1.5 text-muted hover:text-red-600" aria-label="Remove label"><Trash2 size={14} /></button>
              </div>
            ))}
            <button type="button" className="b-btn-quiet b-btn-sm" onClick={() => setLabels([...labels, { id: `s${Date.now().toString(36)}`, label: 'New label', color: STATUS_COLORS[labels.length % STATUS_COLORS.length] }])}><Plus size={13} /> Add label</button>
          </div>
        ) : (
          <div className="space-y-3">
            <select className="b-input" value={op} onChange={(e) => setOp(e.target.value as FormulaOp)}>
              {(Object.keys(formulaLabel) as FormulaOp[]).filter((k) => k !== 'subitems_sum' || col.scope === 'item').map((k) => <option key={k} value={k}>{formulaLabel[k]}</option>)}
            </select>
            {op === 'subitems_sum' ? (
              <select className="b-input" value={a} onChange={(e) => setA(e.target.value)}>
                <option value="">Sub-item column…</option>
                {subCols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <select className="b-input" value={a} onChange={(e) => setA(e.target.value)} aria-label="A">
                  <option value="">A…</option>
                  {numericCols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select className="b-input" value={b} onChange={(e) => setB(e.target.value)} aria-label="B">
                  <option value="">B…</option>
                  {numericCols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <p className="text-xs text-muted">e.g. Remaining = Order amount − Paid, or Order total = sum of the sub-items’ line totals.</p>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="b-btn-quiet" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="b-btn-brass"
            onClick={() => {
              onSave(col.type === 'status' ? { labels: labels.filter((l) => l.label.trim()) } : { op, a: a || undefined, b: op === 'subitems_sum' ? undefined : b || undefined });
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/** "+" at the end of the header row: name + type (+ formula inputs). */
function AddColumn({ scope, columns, onAdd }: { scope: 'item' | 'subitem'; columns: BoardColumn[]; onAdd: (name: string, type: ColumnType, settings: BoardColumn['settings']) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<ColumnType>('text');
  const [op, setOp] = useState<FormulaOp>('subtract');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const numericCols = columns.filter((c) => c.scope === scope && isNumeric(c.type));
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(true)} className="flex h-full w-10 items-center justify-center text-muted hover:text-brass-dark" aria-label="Add column" title="Add column"><Plus size={15} /></button>
      <Menu open={open} onClose={close} align="right" width="w-72">
        <form
          className="space-y-2 p-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onAdd(name, type, type === 'formula' ? { op, a: a || undefined, b: op === 'subitems_sum' ? undefined : b || undefined } : {});
            setName('');
            setOpen(false);
          }}
        >
          <p className="text-xs font-semibold text-muted">New {scope === 'subitem' ? 'sub-item ' : ''}column</p>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Column name" className="b-input !py-1.5" />
          <select value={type} onChange={(e) => setType(e.target.value as ColumnType)} className="b-input !py-1.5">
            {(Object.keys(columnTypeLabel) as ColumnType[]).map((t) => <option key={t} value={t}>{columnTypeLabel[t]}</option>)}
          </select>
          {type === 'formula' && (
            <div className="space-y-2 rounded-lg bg-sand/40 p-2">
              <select value={op} onChange={(e) => setOp(e.target.value as FormulaOp)} className="b-input !py-1.5 text-xs">
                {(Object.keys(formulaLabel) as FormulaOp[]).filter((k) => k !== 'subitems_sum' || scope === 'item').map((k) => <option key={k} value={k}>{formulaLabel[k]}</option>)}
              </select>
              {op === 'subitems_sum' ? (
                <select value={a} onChange={(e) => setA(e.target.value)} className="b-input !py-1.5 text-xs">
                  <option value="">Sub-item column…</option>
                  {columns.filter((c) => c.scope === 'subitem' && isNumeric(c.type)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  <select value={a} onChange={(e) => setA(e.target.value)} className="b-input !py-1.5 text-xs" aria-label="A"><option value="">A…</option>{numericCols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                  <select value={b} onChange={(e) => setB(e.target.value)} className="b-input !py-1.5 text-xs" aria-label="B"><option value="">B…</option>{numericCols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                </div>
              )}
            </div>
          )}
          <button type="submit" className="b-btn-brass b-btn-sm w-full">Add column</button>
        </form>
      </Menu>
    </div>
  );
}

function ColumnHeader({ col, manage, onRename, onSetup, onMove, onDelete }: { col: BoardColumn; manage: boolean; onRename: (n: string) => void; onSetup: () => void; onMove: (d: -1 | 1) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (renaming) {
    return (
      <input
        autoFocus
        defaultValue={col.name}
        maxLength={60}
        className="w-full rounded bg-surface px-1.5 py-1 text-xs font-semibold outline-none ring-2 ring-brass/60"
        onBlur={(e) => {
          setRenaming(false);
          if (e.target.value.trim() && e.target.value !== col.name) onRename(e.target.value);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    );
  }
  return (
    <div className="group/h relative flex items-center justify-center gap-1">
      <span className="truncate" title={`${col.name} · ${columnTypeLabel[col.type]}`}>{col.name}</span>
      {manage && (
        <>
          <button type="button" onClick={() => setOpen(true)} className="rounded p-0.5 text-muted opacity-0 hover:text-ink group-hover/h:opacity-100" aria-label={`${col.name} options`}><MoreHorizontal size={13} /></button>
          <Menu open={open} onClose={close} align="right" width="w-48">
            <MenuItem onClick={() => { setOpen(false); setRenaming(true); }}>Rename</MenuItem>
            {(col.type === 'status' || col.type === 'formula') && <MenuItem onClick={() => { setOpen(false); onSetup(); }}>{col.type === 'status' ? 'Edit labels' : 'Edit formula'}</MenuItem>}
            <MenuItem onClick={() => { setOpen(false); onMove(-1); }}>Move left</MenuItem>
            <MenuItem onClick={() => { setOpen(false); onMove(1); }}>Move right</MenuItem>
            <MenuItem danger onClick={() => { setOpen(false); if (window.confirm(`Delete the column “${col.name}” and its data?`)) onDelete(); }}><Trash2 size={13} /> Delete column</MenuItem>
          </Menu>
        </>
      )}
    </div>
  );
}

export default function BoardView({
  data,
  people,
  names,
  canEdit,
  canManage,
  initialItem,
}: {
  data: BoardData;
  people: Person[];
  names: Record<string, string>;
  canEdit: boolean;
  canManage: boolean;
  initialItem?: string | null;
}) {
  const { board } = data;
  const [columns, setColumns] = useState(data.columns);
  const [groups, setGroups] = useState(data.groups);
  const [items, setItems] = useState(data.items);
  const [view, setView] = useState<'table' | 'cards'>('table');
  const [q, setQ] = useState('');
  const [person, setPerson] = useState('');
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<{ kind: 'item' | 'group'; id: string } | null>(initialItem ? { kind: 'item', id: initialItem } : null);
  const [setup, setSetup] = useState<BoardColumn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [groupMenu, setGroupMenu] = useState<string | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);

  useEffect(() => {
    setColumns(data.columns);
    setGroups(data.groups);
    setItems(data.items);
  }, [data]);

  const itemCols = useMemo(() => columns.filter((c) => c.scope === 'item').sort((a, b) => a.position - b.position), [columns]);
  const subCols = useMemo(() => columns.filter((c) => c.scope === 'subitem').sort((a, b) => a.position - b.position), [columns]);
  const subsOf = useCallback((id: string) => items.filter((i) => i.parent_id === id).sort((a, b) => a.position - b.position), [items]);
  const personCols = itemCols.filter((c) => c.type === 'person');
  const ctxFor = (it: BoardItem) => ({ subitems: subsOf(it.id), columns, names });

  const fail = (msg?: string) => setError(msg ?? 'Couldn’t save — please try again.');
  const run = async (p: Promise<{ ok: boolean; message?: string } | null>, rollback?: () => void) => {
    const res = await p;
    if (!res?.ok) {
      rollback?.();
      fail(res?.message);
    }
    return res;
  };

  // ------------------------------------------------------------ mutations --
  const saveCell = (item: BoardItem, col: BoardColumn, value: unknown) => {
    const before = item.values;
    const nextValues = { ...item.values };
    if (value === null || value === '' || value === undefined) delete nextValues[col.id];
    else nextValues[col.id] = col.type === 'number' || col.type === 'currency' ? Number(String(value).replace(/[$,\s]/g, '')) : value;
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, values: nextValues } : i)));
    run(setCell(item.id, col.id, value), () => setItems((list) => list.map((i) => (i.id === item.id ? { ...i, values: before } : i))));
  };
  const patchItem = (id: string, patch: Partial<BoardItem>) => {
    const before = items.find((i) => i.id === id);
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i.parent_id === id && patch.group_id ? { ...i, group_id: patch.group_id } : i)));
    run(updateItem(id, patch as Parameters<typeof updateItem>[1]), () => before && setItems((list) => list.map((i) => (i.id === id ? before : i))));
  };
  const createItem = async (groupId: string, name: string, parentId?: string) => {
    const res = await run(addItem(board.id, groupId, name, parentId ?? null));
    const raw = (res as { data?: Record<string, string> } | null)?.data?.item;
    if (raw) setItems((list) => [...list, JSON.parse(raw) as BoardItem]);
    if (parentId) setExpanded((s) => new Set(s).add(parentId));
  };
  const createColumn = async (scope: 'item' | 'subitem', name: string, type: ColumnType, settings: BoardColumn['settings']) => {
    const res = await run(addColumn(board.id, scope, name, type, settings));
    const raw = (res as { data?: Record<string, string> } | null)?.data?.column;
    if (raw) setColumns((list) => [...list, JSON.parse(raw) as BoardColumn]);
  };
  const patchColumn = (col: BoardColumn, patch: Partial<BoardColumn>) => {
    setColumns((list) => list.map((c) => (c.id === col.id ? { ...c, ...patch } : c)));
    run(updateColumn(col.id, patch), () => setColumns((list) => list.map((c) => (c.id === col.id ? col : c))));
  };
  const moveColumn = (col: BoardColumn, dir: -1 | 1) => {
    const list = columns.filter((c) => c.scope === col.scope).sort((a, b) => a.position - b.position);
    const i = list.findIndex((c) => c.id === col.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const updated = list.map((c, n) => ({ ...c, position: n }));
    setColumns((all) => all.map((c) => updated.find((u) => u.id === c.id) ?? c));
    updated.forEach((c) => run(updateColumn(c.id, { position: c.position })));
  };
  const removeColumn = (col: BoardColumn) => {
    setColumns((list) => list.filter((c) => c.id !== col.id));
    run(deleteColumn(col.id), () => setColumns((list) => [...list, col]));
  };
  const createGroup = async () => {
    const name = window.prompt(`Name of the new ${board.group_label.toLowerCase()}:`);
    if (!name?.trim()) return;
    const res = await run(addGroup(board.id, name));
    const d = (res as { data?: Record<string, string> } | null)?.data;
    if (d?.id) setGroups((list) => [...list, { id: d.id, board_id: board.id, name: name.trim(), color: d.color, employee_id: null, position: Number(d.position) }]);
  };
  const patchGroup = (g: BoardGroup, patch: Partial<BoardGroup>) => {
    setGroups((list) => list.map((x) => (x.id === g.id ? { ...x, ...patch } : x)));
    run(updateGroup(g.id, patch), () => setGroups((list) => list.map((x) => (x.id === g.id ? g : x))));
  };
  const removeGroup = (g: BoardGroup) => {
    if (!window.confirm(`Delete “${g.name}” and everything in it?`)) return;
    const before = { groups, items };
    setGroups((list) => list.filter((x) => x.id !== g.id));
    setItems((list) => list.filter((i) => i.group_id !== g.id));
    run(deleteGroup(g.id), () => {
      setGroups(before.groups);
      setItems(before.items);
    });
  };
  /** Drop a row before another row, or at the end of a group. */
  const dropItem = (dragId: string, groupId: string, beforeId: string | null) => {
    const list = items.filter((i) => !i.parent_id && i.group_id === groupId && i.id !== dragId).sort((a, b) => a.position - b.position);
    const idx = beforeId ? list.findIndex((i) => i.id === beforeId) : list.length;
    const prev = list[idx - 1]?.position;
    const next = list[idx]?.position;
    const position = prev === undefined && next === undefined ? 1 : prev === undefined ? next! - 1 : next === undefined ? prev + 1 : (prev + next) / 2;
    patchItem(dragId, { group_id: groupId, position });
  };

  // ------------------------------------------------------------ filtering --
  const matches = (it: BoardItem) => {
    const subs = subsOf(it.id);
    if (person && !personCols.some((c) => it.values[c.id] === person) && groups.find((g) => g.id === it.group_id)?.employee_id !== person) return false;
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    const hay = (x: BoardItem, cols: BoardColumn[]) => [x.name, x.description ?? '', ...cols.map((c) => cellText(c, x, { subitems: subsOf(x.id), columns, names }))].join(' ').toLowerCase();
    return hay(it, itemCols).includes(needle) || subs.some((s) => hay(s, subCols).includes(needle));
  };
  const rowsOf = (groupId: string) => {
    const list = items.filter((i) => !i.parent_id && i.group_id === groupId && matches(i));
    if (!sort) return list.sort((a, b) => a.position - b.position);
    const col = columns.find((c) => c.id === sort.col);
    const key = (it: BoardItem) => (sort.col === 'name' ? it.name.toLowerCase() : col ? (isNumeric(col.type) ? (col.type === 'formula' ? formulaValue(col, it, subsOf(it.id), columns) : num(it.values[col.id])) ?? -Infinity : cellText(col, it, ctxFor(it)).toLowerCase()) : '');
    return list.sort((a, b) => {
      const x = key(a);
      const y = key(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  };
  const sumOf = (col: BoardColumn, list: BoardItem[]) =>
    list.reduce((s, it) => s + ((col.type === 'formula' ? formulaValue(col, it, subsOf(it.id), columns) : num(it.values[col.id])) ?? 0), 0);
  const fmtSum = (col: BoardColumn, n: number) => (col.type === 'currency' || (col.type === 'formula' && formulaIsMoney(col, columns)) ? money2(n) : String(Math.round(n * 100) / 100));

  const panelItem = panel?.kind === 'item' ? items.find((i) => i.id === panel.id) : null;
  const panelGroup = panel?.kind === 'group' ? groups.find((g) => g.id === panel.id) : null;
  const exportHref = (format: 'xlsx' | 'pdf', extra = '') => `/base/crm/boards/${board.id}/export?format=${format}${extra}`;
  const gridCols = (cols: BoardColumn[], lead: number) => `${lead}px minmax(220px, 1.4fr) ${cols.map((c) => `${c.width}px`).join(' ')} 40px`;

  // ---------------------------------------------------------------- render --
  const cellCtx = (it: BoardItem, col: BoardColumn) => ({
    columns,
    subitems: subsOf(it.id),
    people,
    names,
    readOnly: !canEdit,
    onSave: (v: unknown) => saveCell(it, col, v),
    onEditLabels: canManage && col.type === 'status' ? () => setSetup(col) : undefined,
  });

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="b-segment">
          <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')} className="inline-flex items-center gap-1.5"><Table2 size={14} /> Table</button>
          <button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')} className="inline-flex items-center gap-1.5"><LayoutGrid size={14} /> Cards</button>
        </div>
        {canEdit && groups[0] && (
          <button type="button" className="b-btn-brass" onClick={() => { const n = window.prompt(`New ${board.item_label.toLowerCase()} — name:`); if (n?.trim()) createItem(groups[0].id, n); }}>
            <Plus size={15} /> New {board.item_label.toLowerCase()}
          </button>
        )}
        {canEdit && <button type="button" className="b-btn-ghost" onClick={createGroup}><Plus size={15} /> Add {board.group_label.toLowerCase()}</button>}
        <label className="relative min-w-[12rem] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this board…" className="b-input !py-2 pl-9" />
        </label>
        <label className="relative">
          <UserRound size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <select value={person} onChange={(e) => setPerson(e.target.value)} className="b-input !w-auto !py-2 pl-8" aria-label="Filter by person">
            <option value="">Everyone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="relative">
          <ArrowDownUp size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <select
            value={sort ? `${sort.col}:${sort.dir}` : ''}
            onChange={(e) => {
              const [col, dir] = e.target.value.split(':');
              setSort(col ? { col, dir: dir === '-1' ? -1 : 1 } : null);
            }}
            className="b-input !w-auto !py-2 pl-8"
            aria-label="Sort"
          >
            <option value="">Manual order</option>
            <option value="name:1">Name A→Z</option>
            {itemCols.filter((c) => c.type !== 'long_text').flatMap((c) => [
              <option key={`${c.id}a`} value={`${c.id}:1`}>{c.name} ↑</option>,
              <option key={`${c.id}d`} value={`${c.id}:-1`}>{c.name} ↓</option>,
            ])}
          </select>
        </label>
        <ExportMenu xlsx={exportHref('xlsx')} pdf={exportHref('pdf')} />
      </div>

      {error && (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error} <button type="button" className="ml-auto" onClick={() => setError(null)} aria-label="Dismiss"><X size={14} /></button>
        </p>
      )}

      <div className="space-y-6">
        {groups
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((g) => {
            const rows = rowsOf(g.id);
            const isCollapsed = collapsed.has(g.id);
            return (
              <section
                key={g.id}
                onDragOver={(e) => drag && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag) dropItem(drag, g.id, null);
                  setDrag(null);
                }}
              >
                {/* Group header */}
                <div className="mb-2 flex items-center gap-2">
                  <button type="button" onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })} className="rounded p-1 text-muted hover:text-ink" aria-label={isCollapsed ? 'Expand' : 'Collapse'}>
                    {isCollapsed ? <ChevronRight size={17} style={{ color: g.color }} /> : <ChevronDown size={17} style={{ color: g.color }} />}
                  </button>
                  {renamingGroup === g.id ? (
                    <input
                      autoFocus
                      defaultValue={g.name}
                      maxLength={120}
                      className="b-input !w-64 !py-1 font-semibold"
                      onBlur={(e) => {
                        setRenamingGroup(null);
                        if (e.target.value.trim() && e.target.value !== g.name) patchGroup(g, { name: e.target.value.trim() });
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    />
                  ) : (
                    <button type="button" onClick={() => setPanel({ kind: 'group', id: g.id })} className="text-lg font-semibold hover:underline" style={{ color: g.color }} title={`Open everything for ${g.name}`}>
                      {g.name}
                    </button>
                  )}
                  <span className="text-xs text-muted">{rows.length} {rows.length === 1 ? board.item_label.toLowerCase() : 'rows'}</span>
                  {canEdit && (
                    <div className="relative">
                      <button type="button" onClick={() => setGroupMenu(g.id)} className="rounded p-1 text-muted hover:text-ink" aria-label="Group options"><MoreHorizontal size={16} /></button>
                      <Menu open={groupMenu === g.id} onClose={() => setGroupMenu(null)} width="w-60">
                        <MenuItem onClick={() => { setGroupMenu(null); setPanel({ kind: 'group', id: g.id }); }}>Open {board.group_label.toLowerCase()} summary</MenuItem>
                        <MenuItem onClick={() => { setGroupMenu(null); setRenamingGroup(g.id); }}>Rename</MenuItem>
                        <div className="flex flex-wrap gap-1 px-2.5 py-1.5">
                          {GROUP_COLORS.map((c) => <button key={c} type="button" onClick={() => { setGroupMenu(null); patchGroup(g, { color: c }); }} className="h-5 w-5 rounded-full ring-2 ring-offset-1 ring-offset-ivory" style={{ background: c, '--tw-ring-color': c === g.color ? c : 'transparent' } as React.CSSProperties} aria-label={`Colour ${c}`} />)}
                        </div>
                        <label className="block px-2.5 py-1.5 text-xs text-muted">
                          Linked person (e.g. the designer)
                          <select className="b-input mt-1 !py-1 text-sm" value={g.employee_id ?? ''} onChange={(e) => { setGroupMenu(null); patchGroup(g, { employee_id: e.target.value || null }); }}>
                            <option value="">— None —</option>
                            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </label>
                        <MenuItem onClick={() => { setGroupMenu(null); window.location.href = exportHref('xlsx', `&group=${g.id}`); }}><FileSpreadsheet size={13} /> Download Excel</MenuItem>
                        <MenuItem onClick={() => { setGroupMenu(null); window.location.href = exportHref('pdf', `&group=${g.id}`); }}><FileText size={13} /> Download PDF</MenuItem>
                        {canManage && <MenuItem danger onClick={() => { setGroupMenu(null); removeGroup(g); }}><Trash2 size={13} /> Delete {board.group_label.toLowerCase()}</MenuItem>}
                      </Menu>
                    </div>
                  )}
                </div>

                {!isCollapsed && view === 'table' && (
                  <div className="overflow-x-auto rounded-xl border border-stone/60 bg-surface" style={{ boxShadow: `inset 4px 0 0 ${g.color}` }}>
                    <div className="min-w-max">
                      {/* header */}
                      <div className="grid border-b border-stone/60 text-[0.7rem] font-semibold uppercase tracking-wider text-muted" style={{ gridTemplateColumns: gridCols(itemCols, 36) }}>
                        <span />
                        <span className="px-2 py-2">{board.item_label}</span>
                        {itemCols.map((c) => (
                          <div key={c.id} className="border-l border-stone/40 px-2 py-2 text-center">
                            <ColumnHeader col={c} manage={canManage} onRename={(n) => patchColumn(c, { name: n })} onSetup={() => setSetup(c)} onMove={(d) => moveColumn(c, d)} onDelete={() => removeColumn(c)} />
                          </div>
                        ))}
                        {canManage ? <AddColumn scope="item" columns={columns} onAdd={(n, t, s) => createColumn('item', n, t, s)} /> : <span />}
                      </div>
                      {/* rows */}
                      {rows.map((it) => {
                        const subs = subsOf(it.id);
                        const open = expanded.has(it.id);
                        return (
                          <div key={it.id}>
                            <div
                              className={`group/row grid border-b border-stone/40 transition-colors hover:bg-linen/50 ${drag === it.id ? 'opacity-40' : ''}`}
                              style={{ gridTemplateColumns: gridCols(itemCols, 36) }}
                              draggable={canEdit && !sort}
                              onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = 'move';
                                setDrag(it.id);
                              }}
                              onDragEnd={() => setDrag(null)}
                              onDragOver={(e) => drag && e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (drag && drag !== it.id) dropItem(drag, g.id, it.id);
                                setDrag(null);
                              }}
                            >
                              <span className="flex items-center justify-center text-muted/40">{canEdit && !sort && <GripVertical size={13} className="cursor-grab" />}</span>
                              <div className="flex min-w-0 items-center gap-1 pr-2">
                                <button type="button" onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; })} className="flex flex-none items-center gap-0.5 rounded px-1 py-1 text-[0.68rem] text-muted hover:bg-sand/60" aria-label={open ? 'Hide sub-items' : 'Show sub-items'} title="Sub-items">
                                  {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                  {subs.length > 0 && <span className="rounded-full bg-sand px-1.5">{subs.length}</span>}
                                </button>
                                <button type="button" onClick={() => setPanel({ kind: 'item', id: it.id })} className="min-w-0 flex-1 truncate py-1.5 text-left text-sm font-medium hover:text-brass-dark" title="Open details">
                                  {it.name}
                                </button>
                                {it.description && <span className="h-1.5 w-1.5 flex-none rounded-full bg-brass-light" title="Has a description" />}
                              </div>
                              {itemCols.map((c) => <div key={c.id} className="min-w-0 border-l border-stone/40"><Cell col={c} item={it} ctx={cellCtx(it, c)} /></div>)}
                              <span />
                            </div>
                            {open && (
                              <SubTable
                                color={g.color}
                                subs={subs}
                                subCols={subCols}
                                columns={columns}
                                canEdit={canEdit}
                                canManage={canManage}
                                gridCols={gridCols}
                                cellCtx={cellCtx}
                                onOpen={(id) => setPanel({ kind: 'item', id })}
                                onAdd={(n) => createItem(it.group_id, n, it.id)}
                                columnHeader={(c) => <ColumnHeader col={c} manage={canManage} onRename={(n) => patchColumn(c, { name: n })} onSetup={() => setSetup(c)} onMove={(d) => moveColumn(c, d)} onDelete={() => removeColumn(c)} />}
                                onAddColumn={(n, t, st) => createColumn('subitem', n, t, st)}
                              />
                            )}
                          </div>
                        );
                      })}
                      {/* add row */}
                      {canEdit && <AddRow placeholder={`+ Add ${board.item_label.toLowerCase()}`} onAdd={(n) => createItem(g.id, n)} cols={gridCols(itemCols, 36)} />}
                      {/* totals */}
                      {rows.length > 0 && (
                        <div className="grid bg-linen/50 text-xs" style={{ gridTemplateColumns: gridCols(itemCols, 36) }}>
                          <span />
                          <span className="px-2 py-2 font-semibold text-muted">Total</span>
                          {itemCols.map((c) => (
                            <div key={c.id} className="border-l border-stone/40 px-2 py-2 text-right font-semibold tabular-nums">
                              {isNumeric(c.type) ? fmtSum(c, sumOf(c, rows)) : c.type === 'status' ? <StatusBar col={c} rows={rows} /> : null}
                            </div>
                          ))}
                          <span />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {!isCollapsed && view === 'cards' && (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {rows.map((it) => (
                      <button key={it.id} type="button" onClick={() => setPanel({ kind: 'item', id: it.id })} className="b-card block p-4 text-left transition-shadow hover:shadow-lg" style={{ boxShadow: `inset 0 3px 0 ${g.color}` }}>
                        <p className="font-semibold">{it.name}</p>
                        <dl className="mt-2 space-y-1 text-xs">
                          {itemCols.filter((c) => c.type !== 'long_text').slice(0, 7).map((c) => {
                            const t = cellText(c, it, ctxFor(it));
                            if (!t) return null;
                            const label = c.type === 'status' ? c.settings.labels?.find((l) => l.id === it.values[c.id]) : null;
                            return (
                              <div key={c.id} className="flex justify-between gap-3">
                                <dt className="text-muted">{c.name}</dt>
                                <dd className="truncate text-right font-medium">{label ? <span className="rounded px-1.5 py-0.5 text-[0.65rem] font-semibold text-white" style={{ background: label.color }}>{t}</span> : t}</dd>
                              </div>
                            );
                          })}
                        </dl>
                        {(subsOf(it.id).length > 0 || it.description) && <p className="mt-2 border-t border-stone/50 pt-2 text-[0.7rem] text-muted">{subsOf(it.id).length} sub-items{it.description ? ' · has notes' : ''}</p>}
                      </button>
                    ))}
                    {canEdit && <button type="button" onClick={() => { const n = window.prompt(`New ${board.item_label.toLowerCase()} — name:`); if (n?.trim()) createItem(g.id, n); }} className="flex min-h-[110px] items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-stone text-sm text-muted hover:border-brass hover:text-brass-dark"><Plus size={15} /> Add</button>}
                  </div>
                )}
              </section>
            );
          })}
      </div>

      {panelItem && (
        <ItemPanel
          board={board}
          item={panelItem}
          parent={panelItem.parent_id ? (items.find((i) => i.id === panelItem.parent_id) ?? null) : null}
          columns={columns}
          groups={groups}
          subitems={subsOf(panelItem.id)}
          people={people}
          names={names}
          canEdit={canEdit}
          canManage={canManage}
          onClose={() => setPanel(null)}
          onOpenItem={(id) => setPanel({ kind: 'item', id })}
          onSaveCell={(it, col, v) => saveCell(it, col, v)}
          onPatch={(patch) => patchItem(panelItem.id, patch)}
          onAddSub={(n) => createItem(panelItem.group_id, n, panelItem.id)}
          onRemoved={(ids) => {
            setItems((list) => list.filter((i) => !ids.includes(i.id) && !ids.includes(i.parent_id ?? '')));
            setPanel(null);
          }}
          onAdded={(added) => setItems((list) => [...list, ...added])}
          onEditLabels={(c) => setSetup(c)}
          exportHref={exportHref}
        />
      )}
      {panelGroup && (
        <GroupPanel
          board={board}
          group={panelGroup}
          rows={items.filter((i) => !i.parent_id && i.group_id === panelGroup.id).sort((a, b) => a.position - b.position)}
          columns={columns}
          subsOf={subsOf}
          names={names}
          onClose={() => setPanel(null)}
          onOpenItem={(id) => setPanel({ kind: 'item', id })}
          exportHref={exportHref}
        />
      )}
      {setup && <ColumnSetup col={setup} columns={columns} onClose={() => setSetup(null)} onSave={(s) => patchColumn(setup, { settings: s })} />}
    </div>
  );
}

function SubTable({ color, subs, subCols, columns, canEdit, canManage, gridCols, cellCtx, onOpen, onAdd, columnHeader, onAddColumn }: {
  color: string;
  subs: BoardItem[];
  subCols: BoardColumn[];
  columns: BoardColumn[];
  canEdit: boolean;
  canManage: boolean;
  gridCols: (cols: BoardColumn[], lead: number) => string;
  cellCtx: (it: BoardItem, col: BoardColumn) => React.ComponentProps<typeof Cell>['ctx'];
  onOpen: (id: string) => void;
  onAdd: (name: string) => void;
  columnHeader: (c: BoardColumn) => React.ReactNode;
  onAddColumn: (n: string, t: ColumnType, s: BoardColumn['settings']) => void;
}) {
  const [name, setName] = useState('');
  return (
    <div className="ml-10 border-l-2 py-1 pl-3" style={{ borderColor: `${color}66` }}>
      <div className="overflow-x-auto">
        <div className="min-w-max">
          <div className="grid border-b border-stone/50 bg-linen/60 text-[0.68rem] font-semibold uppercase tracking-wider text-muted" style={{ gridTemplateColumns: gridCols(subCols, 0) }}>
            <span />
            <span className="px-2 py-1.5">Sub-item</span>
            {subCols.map((c) => (
              <div key={c.id} className="border-l border-stone/40 px-2 py-1.5 text-center">
                {columnHeader(c)}
              </div>
            ))}
            {canManage ? <AddColumn scope="subitem" columns={columns} onAdd={onAddColumn} /> : <span />}
          </div>
          {subs.map((s) => (
            <div key={s.id} className="grid border-b border-stone/40 bg-surface" style={{ gridTemplateColumns: gridCols(subCols, 0) }}>
              <span />
              <button type="button" onClick={() => onOpen(s.id)} className="truncate px-2 py-1.5 text-left text-sm hover:text-brass-dark">{s.name}</button>
              {subCols.map((c) => <div key={c.id} className="min-w-0 border-l border-stone/40"><Cell col={c} item={s} ctx={cellCtx(s, c)} /></div>)}
              <span />
            </div>
          ))}
        </div>
      </div>
      {canEdit && (
        <form
          className="flex items-center gap-2 py-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onAdd(name);
            setName('');
          }}
        >
          <Plus size={13} className="text-muted" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="+ Add sub-item" maxLength={200} className="w-64 bg-transparent text-sm outline-none placeholder:text-muted/70" />
        </form>
      )}
    </div>
  );
};


function AddRow({ placeholder, onAdd, cols }: { placeholder: string; onAdd: (name: string) => void; cols: string }) {
  const [name, setName] = useState('');
  return (
    <form
      className="grid border-b border-stone/40"
      style={{ gridTemplateColumns: cols }}
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onAdd(name);
        setName('');
      }}
    >
      <span />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} maxLength={200} className="bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted/70 focus:bg-linen/50" />
    </form>
  );
}

function StatusBar({ col, rows }: { col: BoardColumn; rows: BoardItem[] }) {
  const labels = col.settings.labels ?? [];
  const counts = labels.map((l) => ({ l, n: rows.filter((r) => r.values[col.id] === l.id).length })).filter((x) => x.n);
  const total = rows.length;
  if (!counts.length) return null;
  return (
    <div className="flex h-4 overflow-hidden rounded" title={counts.map((c) => `${c.l.label}: ${c.n}`).join(' · ')}>
      {counts.map((c) => <span key={c.l.id} style={{ width: `${(c.n / total) * 100}%`, background: c.l.color }} />)}
    </div>
  );
}

function ExportMenu({ xlsx, pdf }: { xlsx: string; pdf: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className="relative">
      <button type="button" className="b-btn-ghost" onClick={() => setOpen(true)}><Download size={15} /> Export</button>
      <Menu open={open} onClose={close} align="right" width="w-48">
        <a href={xlsx} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-sand/60" onClick={close}><FileSpreadsheet size={14} /> Excel (.xlsx)</a>
        <a href={pdf} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-sand/60" onClick={close}><FileText size={14} /> PDF</a>
      </Menu>
    </div>
  );
}
