'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDownUp,
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Filter,
  GripVertical,
  LayoutGrid,
  Layers,
  Maximize2,
  MessageCircle,
  MessageCirclePlus,
  MoreHorizontal,
  Plus,
  Search,
  Table2,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { addColumn, addGroup, addItem, bulkItems, deleteColumn, deleteGroup, deleteItem, duplicateItem, setCell, setItemLabel, updateColumn, updateGroup, updateItem } from '@/app/base/(app)/crm/boards/actions';
import type { PortalFile } from '@/app/base/(app)/crm/files/actions';
import { Popover } from '@/components/ui/Popover';
import Select from '@/components/ui/Select';
import {
  asIds,
  asTimeline,
  cellText,
  COLUMN_PICKER,
  columnsAt,
  depthOf,
  columnTypeColor,
  columnTypeShort,
  fmtShortDate,
  formulaIsMoney,
  formulaLabel,
  formulaValue,
  GROUP_COLORS,
  isNumeric,
  money2,
  num,
  STATUS_COLORS,
  type Board,
  type BoardColumn,
  type BoardGroup,
  type BoardItem,
  type ColumnType,
  type FormulaOp,
  type StatusLabel,
} from '@/lib/crm/boardTypes';
import Cell, { Initials, type CellCtx } from './Cell';
import { GroupPanel, ItemPanel } from './Panels';
import { confirmDialog, friendlyError, isControlFlow, toast } from '@/components/ui/toast';

export type BoardData = { board: Board; columns: BoardColumn[]; groups: BoardGroup[]; items: BoardItem[] };
type Person = { id: string; name: string };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A toolbar / menu button that opens a pop-over. */
function PopButton({ label, icon, active, children, width = 260, align = 'start', className }: { label: ReactNode; icon?: ReactNode; active?: boolean; children: (close: () => void) => ReactNode; width?: number; align?: 'start' | 'end'; className?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={className ?? `inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${active ? 'bg-brass/10 font-medium text-brass' : 'text-ink/80 hover:bg-sand/70'}`}
      >
        {icon}
        {label}
      </button>
      <Popover anchor={ref} open={open} onClose={close} width={width} align={align}>
        {children(close)}
      </Popover>
    </>
  );
}
const MenuItem = ({ onClick, children, danger }: { onClick: () => void; children: ReactNode; danger?: boolean }) => (
  <button type="button" onClick={onClick} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-sand/70 ${danger ? 'text-red-600' : ''}`}>{children}</button>
);

/** Editor for status / dropdown labels, or a formula's inputs. */
function ColumnSetup({ col, columns, onSave, onClose }: { col: BoardColumn; columns: BoardColumn[]; onSave: (settings: BoardColumn['settings']) => void; onClose: () => void }) {
  const [labels, setLabels] = useState<StatusLabel[]>(col.settings.labels ?? []);
  const [op, setOp] = useState<FormulaOp>(col.settings.op ?? 'subtract');
  const [a, setA] = useState(col.settings.a ?? '');
  const [b, setB] = useState(col.settings.b ?? '');
  const numericCols = columnsAt(columns, col.scope === 'item' ? 0 : col.level).filter((c) => c.id !== col.id && isNumeric(c.type));
  const subCols = columnsAt(columns, col.scope === 'item' ? 1 : col.level + 1).filter((c) => isNumeric(c.type));
  const isLabels = col.type === 'status' || col.type === 'dropdown';
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl border border-stone/60 bg-surface p-5 text-ink shadow-2xl">
        <p className="mb-4 text-lg font-semibold">{isLabels ? `Labels · ${col.name}` : `Formula · ${col.name}`}</p>
        {isLabels ? (
          <div className="space-y-2">
            {labels.map((l, i) => (
              <div key={l.id} className="flex items-center gap-2">
                <div className="flex flex-none flex-wrap gap-1">
                  {STATUS_COLORS.slice(0, 6).map((c) => <button key={c} type="button" onClick={() => setLabels(labels.map((x, j) => (j === i ? { ...x, color: c } : x)))} className={`h-5 w-5 rounded ${l.color === c ? 'ring-2 ring-ink ring-offset-1' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} />)}
                  <input type="color" value={l.color} onChange={(e) => setLabels(labels.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} className="h-5 w-6 cursor-pointer rounded border border-stone" aria-label="More colours" />
                </div>
                <input value={l.label} maxLength={40} onChange={(e) => setLabels(labels.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="b-input !py-1.5" aria-label="Label" style={{ borderLeft: `4px solid ${l.color}` }} />
                <button type="button" onClick={() => setLabels(labels.filter((_, j) => j !== i))} className="rounded p-1.5 text-muted hover:text-red-600" aria-label="Remove label"><Trash2 size={14} /></button>
              </div>
            ))}
            <button type="button" className="b-btn-quiet b-btn-sm" onClick={() => setLabels([...labels, { id: `s${Date.now().toString(36)}`, label: 'New label', color: STATUS_COLORS[labels.length % STATUS_COLORS.length] }])}><Plus size={13} /> Add label</button>
          </div>
        ) : (
          <div className="space-y-3">
            <Select className="b-input" value={op} onChange={(e) => setOp(e.target.value as FormulaOp)} aria-label="Calculation">
              {(Object.keys(formulaLabel) as FormulaOp[]).filter((k) => k !== 'subitems_sum' || col.scope === 'item').map((k) => <option key={k} value={k}>{formulaLabel[k]}</option>)}
            </Select>
            {op === 'subitems_sum' ? (
              <Select className="b-input" value={a} onChange={(e) => setA(e.target.value)} aria-label="Sub-item column">
                <option value="">Sub-item column…</option>
                {subCols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Select className="b-input" value={a} onChange={(e) => setA(e.target.value)} aria-label="A"><option value="">A…</option>{numericCols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
                <Select className="b-input" value={b} onChange={(e) => setB(e.target.value)} aria-label="B"><option value="">B…</option>{numericCols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
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
              onSave(isLabels ? { labels: labels.filter((l) => l.label.trim()) } : { op, a: a || undefined, b: op === 'subitems_sum' ? undefined : b || undefined });
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

/** The "+" column picker, like monday: search, Essentials, Super useful. */
function ColumnPicker({ scope, onAdd }: { scope: 'item' | 'subitem'; onAdd: (name: string, type: ColumnType) => void }) {
  const [q, setQ] = useState('');
  return (
    <PopButton label={<Plus size={16} />} className="flex h-full w-full items-center justify-center text-muted hover:bg-sand/60 hover:text-ink" width={360} align="end">
      {(close) => (
        <div className="p-2">
          <label className="mb-3 flex items-center gap-2 rounded-lg border border-stone/70 px-3 py-2">
            <Search size={14} className="text-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or describe your column" className="w-full bg-transparent text-sm outline-none" />
          </label>
          {COLUMN_PICKER.map((sec) => {
            const types = sec.types.filter((t) => columnTypeShort[t].toLowerCase().includes(q.trim().toLowerCase()));
            if (!types.length) return null;
            return (
              <div key={sec.title} className="mb-3">
                <p className="mb-1.5 px-1 text-xs text-muted">{sec.title}{scope === 'subitem' ? ' · sub-items' : ''}</p>
                <div className="grid grid-cols-2 gap-1">
                  {types.map((t) => (
                    <button key={t} type="button" onClick={() => { close(); onAdd(columnTypeShort[t], t); }} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-sand/70">
                      <span className="flex h-5 w-5 items-center justify-center rounded text-[0.6rem] font-bold text-white" style={{ background: columnTypeColor[t] }}>{columnTypeShort[t][0]}</span>
                      {columnTypeShort[t]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PopButton>
  );
}

/**
 * Where the cursor goes when a name becomes editable: a placeholder name ("New item",
 * "New group", "Group 1") is selected so typing replaces it; a real name keeps its text with the
 * cursor blinking at the end, ready to edit.
 */
function placeCaret(e: { target: HTMLInputElement }) {
  const el = e.target;
  if (/^(new |group \d|item \d)/i.test(el.value)) el.select();
  else el.setSelectionRange(el.value.length, el.value.length);
}

/** A header title that becomes a text box on one click (for people who can change the board's setup). */
function TitleEdit({ value, manage, onSave }: { value: string; manage: boolean; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <input
        autoFocus
        defaultValue={value}
        maxLength={40}
        onFocus={placeCaret}
        className="w-full rounded bg-surface px-1.5 py-1 text-center text-[0.8rem] outline-none ring-2 ring-brass/60"
        onBlur={(e) => {
          setEditing(false);
          const n = e.target.value.trim();
          if (n && n !== value) onSave(n);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            (e.target as HTMLInputElement).value = value;
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    );
  return (
    <span className={`truncate rounded px-1 ${manage ? 'cursor-text hover:ring-1 hover:ring-stone' : ''}`} title={manage ? 'Click to rename' : value} onClick={() => manage && setEditing(true)}>
      {value}
    </span>
  );
}

function ColumnHeader({ col, manage, onRename, onSetup, onMove, onDelete, onHide, onSort }: { col: BoardColumn; manage: boolean; onRename: (n: string) => void; onSetup: () => void; onMove: (d: -1 | 1) => void; onDelete: () => void; onHide: () => void; onSort: (dir: 1 | -1) => void }) {
  const [renaming, setRenaming] = useState(false);
  if (renaming) {
    return (
      <input
        autoFocus
        defaultValue={col.name}
        maxLength={60}
        onFocus={placeCaret}
        className="w-full rounded bg-surface px-1.5 py-1 text-center text-[0.8rem] outline-none ring-2 ring-brass/60"
        onBlur={(e) => {
          setRenaming(false);
          if (e.target.value.trim() && e.target.value !== col.name) onRename(e.target.value.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            (e.target as HTMLInputElement).value = col.name;
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    );
  }
  return (
    <div className="group/h relative flex items-center justify-center gap-1">
      <span
        className={`truncate rounded px-1 ${manage ? 'cursor-text hover:ring-1 hover:ring-stone' : ''}`}
        title={manage ? 'Click to rename' : col.name}
        onClick={() => manage && setRenaming(true)}
      >
        {col.name}
      </span>
      <span className="absolute right-0 opacity-0 group-hover/h:opacity-100">
        <PopButton label={<MoreHorizontal size={14} />} className="rounded p-0.5 text-muted hover:bg-sand hover:text-ink" width={200} align="end">
          {(close) => (
            <>
              <MenuItem onClick={() => { close(); onSort(1); }}>Sort ascending</MenuItem>
              <MenuItem onClick={() => { close(); onSort(-1); }}>Sort descending</MenuItem>
              <MenuItem onClick={() => { close(); onHide(); }}><EyeOff size={14} /> Hide column</MenuItem>
              {manage && (
                <>
                  <div className="my-1 border-t border-stone/60" />
                  <MenuItem onClick={() => { close(); setRenaming(true); }}>Rename</MenuItem>
                  {(col.type === 'status' || col.type === 'dropdown' || col.type === 'formula') && <MenuItem onClick={() => { close(); onSetup(); }}>{col.type === 'formula' ? 'Edit formula' : 'Edit labels'}</MenuItem>}
                  <MenuItem onClick={() => { close(); onMove(-1); }}>Move left</MenuItem>
                  <MenuItem onClick={() => { close(); onMove(1); }}>Move right</MenuItem>
                  <MenuItem danger onClick={() => { close(); void confirmDialog({ title: `Delete the column “${col.name}”?`, message: "Everything stored in this column is removed from every row.", danger: true }).then((ok) => ok && onDelete()); }}><Trash2 size={14} /> Delete column</MenuItem>
                </>
              )}
            </>
          )}
        </PopButton>
      </span>
    </div>
  );
}

type Bucket = { key: string; name: string; color: string; group?: BoardGroup };

export default function BoardView({
  data,
  files: initialFiles,
  updateCounts,
  people,
  names,
  canEdit,
  canManage,
  initialItem,
}: {
  data: BoardData;
  files: PortalFile[];
  updateCounts: Record<string, number>;
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
  const [files, setFiles] = useState(initialFiles);
  const [view, setView] = useState<'table' | 'cards'>('table');
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [person, setPerson] = useState('');
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<string>('groups');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<{ kind: 'item' | 'group'; id: string; tab?: 'details' | 'updates' } | null>(initialItem ? { kind: 'item', id: initialItem } : null);
  const [setup, setSetup] = useState<BoardColumn | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renamingItem, setRenamingItem] = useState<string | null>(null);

  useEffect(() => {
    setColumns(data.columns);
    setGroups(data.groups);
    setItems(data.items);
  }, [data]);
  useEffect(() => setFiles(initialFiles), [initialFiles]);
  // Hidden columns are remembered per board on this device.
  const hideKey = `board-hidden:${board.id}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(hideKey) ?? '[]');
      if (Array.isArray(saved)) setHidden(new Set(saved));
    } catch {
      // storage unavailable — nothing to restore
    }
  }, [hideKey]);
  const toggleHidden = (id: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      try {
        window.localStorage.setItem(hideKey, JSON.stringify([...n]));
      } catch {
        // ignore
      }
      return n;
    });

  const allItemCols = useMemo(() => columns.filter((c) => c.scope === 'item').sort((a, b) => a.position - b.position), [columns]);
  const itemCols = allItemCols.filter((c) => !hidden.has(c.id));
  const subCols = useMemo(() => columns.filter((c) => c.scope === 'subitem').sort((a, b) => a.position - b.position), [columns]);
  const subsOf = useCallback((id: string) => items.filter((i) => i.parent_id === id).sort((a, b) => a.position - b.position), [items]);
  /** These rows plus everything below them, at any depth. */
  const withDescendants = (ids: string[], list: BoardItem[] = items) => {
    const out = new Set(ids);
    let grew = true;
    while (grew) {
      grew = false;
      for (const i of list) {
        if (i.parent_id && out.has(i.parent_id) && !out.has(i.id)) {
          out.add(i.id);
          grew = true;
        }
      }
    }
    return out;
  };
  const filesOf = useCallback((itemId: string, colId: string) => files.filter((f) => f.item_id === itemId && f.column_id === colId), [files]);
  const groupOf = (id: string) => groups.find((g) => g.id === id);
  const peopleCols = allItemCols.filter((c) => c.type === 'people' || c.type === 'person');
  const labelCols = allItemCols.filter((c) => c.type === 'status' || c.type === 'dropdown');

  /** Every save goes through here: a refused or crashed save undoes the change on screen and says why. */
  const run = async <T extends { ok: boolean; message?: string } | null>(p: Promise<T>, rollback?: () => void): Promise<T | null> => {
    try {
      const res = await p;
      if (!res?.ok) {
        rollback?.();
        toast.error(res?.message || 'Couldn’t save — please try again.');
      }
      return res;
    } catch (err) {
      if (isControlFlow(err)) throw err;
      console.error(err);
      rollback?.();
      toast.error(friendlyError(err));
      return null;
    }
  };

  // ------------------------------------------------------------ mutations --
  const saveCell = (item: BoardItem, col: BoardColumn, value: unknown) => {
    const before = item.values;
    const next = { ...item.values };
    if (value === null || value === '' || value === undefined) delete next[col.id];
    else next[col.id] = col.type === 'number' || col.type === 'currency' ? Number(String(value).replace(/[$,\s]/g, '')) : value;
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, values: next } : i)));
    run(setCell(item.id, col.id, value), () => setItems((list) => list.map((i) => (i.id === item.id ? { ...i, values: before } : i))));
  };
  const patchItem = (id: string, patch: Partial<BoardItem>) => {
    const before = items.find((i) => i.id === id);
    setItems((list) => {
      const below = patch.group_id ? withDescendants([id], list) : new Set<string>();
      return list.map((i) => (i.id === id ? { ...i, ...patch } : below.has(i.id) ? { ...i, group_id: patch.group_id! } : i));
    });
    run(updateItem(id, patch as Parameters<typeof updateItem>[1]), () => before && setItems((list) => list.map((i) => (i.id === id ? before : i))));
  };
  const createItem = async (groupId: string, name: string, parentId?: string) => {
    const res = await run(addItem(board.id, groupId, name, parentId ?? null));
    const raw = res?.data?.item;
    const made = raw ? (JSON.parse(raw) as BoardItem) : null;
    if (made) setItems((list) => [...list, made]);
    // The first sub-item on a new level comes with that level's starting columns.
    const cols = res?.data?.columns ? (JSON.parse(res.data.columns) as BoardColumn[]) : [];
    if (cols.length) setColumns((list) => [...list, ...cols]);
    if (parentId) setExpanded((s) => new Set(s).add(parentId));
    return made;
  };
  /** "New item": drop a row straight onto the board with its name ready to type over (no pop-up). */
  const quickAdd = async (groupId: string) => {
    setCollapsed((s) => {
      const n = new Set(s);
      n.delete(groupId);
      return n;
    });
    const made = await createItem(groupId, `New ${board.item_label.toLowerCase()}`);
    if (made) setRenamingItem(made.id);
  };
  /** Add a sub-item straight away (cells ready to click) with its name ready to type over. */
  const quickSub = async (parent: BoardItem) => {
    const made = await createItem(parent.group_id, 'New sub-item', parent.id);
    if (made) setRenamingItem(made.id);
  };
  const renameItem = (it: BoardItem, name: string) => {
    setRenamingItem(null);
    if (name.trim() && name.trim() !== it.name) patchItem(it.id, { name: name.trim() });
  };
  const createColumn = async (scope: 'item' | 'subitem', name: string, type: ColumnType, level = 1) => {
    const res = await run(addColumn(board.id, scope, name, type, {}, level));
    const raw = res?.data?.column;
    if (raw) {
      const col = JSON.parse(raw) as BoardColumn;
      // The levels below get their own copy of a new column.
      const copies = res?.data?.copies ? (JSON.parse(res.data.copies) as BoardColumn[]) : [];
      setColumns((list) => [...list, col, ...copies]);
      if (type === 'formula') setSetup(col);
    }
  };
  const patchColumn = (col: BoardColumn, patch: Partial<BoardColumn>) => {
    setColumns((list) => list.map((c) => (c.id === col.id ? { ...c, ...patch } : c)));
    run(updateColumn(col.id, patch), () => setColumns((list) => list.map((c) => (c.id === col.id ? col : c))));
  };
  const moveColumn = (col: BoardColumn, dir: -1 | 1) => {
    const list = columnsAt(columns, col.scope === 'item' ? 0 : col.level);
    const i = list.findIndex((c) => c.id === col.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const updated = list.map((c, n) => ({ ...c, position: n }));
    setColumns((all) => all.map((c) => updated.find((u) => u.id === c.id) ?? c));
    updated.forEach((c) => run(updateColumn(c.id, { position: c.position })));
  };
  /** Delete a row's whole sub-item table: every sub-item under it, at any depth. */
  const removeSubs = async (parent: BoardItem) => {
    const subs = subsOf(parent.id);
    if (!subs.length || !(await confirmDialog({ title: `Delete all ${subs.length} sub-item${subs.length === 1 ? '' : 's'} of “${parent.name}”?`, message: 'Their own sub-items and updates are removed too.', danger: true }))) return;
    const before = items;
    const ids = subs.map((s) => s.id);
    setItems((list) => {
      const all = withDescendants(ids, list);
      return list.filter((i) => !all.has(i.id));
    });
    run(bulkItems(board.id, ids, 'delete'), () => setItems(before));
  };
  const removeSub = async (s: BoardItem) => {
    const kids = subsOf(s.id).length;
    if (!(await confirmDialog({ title: `Delete “${s.name}”?`, message: kids ? 'Its sub-items and updates are removed too.' : 'Its updates are removed too.', danger: true }))) return;
    const before = items;
    setItems((list) => {
      const all = withDescendants([s.id], list);
      return list.filter((i) => !all.has(i.id));
    });
    run(deleteItem(s.id), () => setItems(before));
  };
  const removeColumn = (col: BoardColumn) => {
    setColumns((list) => list.filter((c) => c.id !== col.id));
    run(deleteColumn(col.id), () => setColumns((list) => [...list, col]));
  };
  const createGroup = async () => {
    const name = `New ${board.group_label.toLowerCase()}`;
    const res = await run(addGroup(board.id, name));
    const d = res?.data;
    if (d?.id) {
      setGroups((list) => [...list, { id: d.id, board_id: board.id, name, color: d.color, employee_id: null, position: Number(d.position) }]);
      setRenamingGroup(d.id);
    }
  };
  const patchGroup = (g: BoardGroup, patch: Partial<BoardGroup>) => {
    setGroups((list) => list.map((x) => (x.id === g.id ? { ...x, ...patch } : x)));
    run(updateGroup(g.id, patch), () => setGroups((list) => list.map((x) => (x.id === g.id ? g : x))));
  };
  const removeGroup = async (g: BoardGroup) => {
    if (!(await confirmDialog({ title: `Delete “${g.name}”?`, message: "The group and every row in it are removed.", danger: true }))) return;
    const before = { groups, items };
    setGroups((list) => list.filter((x) => x.id !== g.id));
    setItems((list) => list.filter((i) => i.group_id !== g.id));
    run(deleteGroup(g.id), () => {
      setGroups(before.groups);
      setItems(before.items);
    });
  };
  const dropItem = (dragId: string, groupId: string, beforeId: string | null) => {
    const list = items.filter((i) => !i.parent_id && i.group_id === groupId && i.id !== dragId).sort((a, b) => a.position - b.position);
    const idx = beforeId ? list.findIndex((i) => i.id === beforeId) : list.length;
    const prev = list[idx - 1]?.position;
    const next = list[idx]?.position;
    const position = prev === undefined && next === undefined ? 1 : prev === undefined ? next! - 1 : next === undefined ? prev + 1 : (prev + next) / 2;
    patchItem(dragId, { group_id: groupId, position });
  };
  const bulk = async (op: 'move' | 'delete', groupId?: string) => {
    const ids = [...selected];
    if (op === 'delete' && !(await confirmDialog({ title: `Delete ${ids.length} row${ids.length === 1 ? '' : 's'}?`, message: 'Their sub-items and updates are removed too.', danger: true }))) return;
    const before = items;
    setItems((list) => {
      const all = withDescendants(ids, list);
      return op === 'delete' ? list.filter((i) => !all.has(i.id)) : list.map((i) => (all.has(i.id) ? { ...i, group_id: groupId! } : i));
    });
    setSelected(new Set());
    await run(bulkItems(board.id, ids, op, groupId), () => setItems(before));
  };
  const bulkDuplicate = async () => {
    const ids = [...selected];
    setSelected(new Set());
    for (const id of ids) {
      const res = await run(duplicateItem(id));
      if (res?.ok && res.data?.items) setItems((list) => [...list, ...(JSON.parse(res.data!.items) as BoardItem[])]);
    }
  };

  // ------------------------------------------------------------ filtering --
  const valueKeys = (c: BoardColumn, it: BoardItem): string[] => (c.type === 'people' || c.type === 'person' ? asIds(it.values[c.id]) : typeof it.values[c.id] === 'string' ? [it.values[c.id] as string] : ['__none']);
  const matches = (it: BoardItem) => {
    if (person && !peopleCols.some((c) => asIds(it.values[c.id]).includes(person)) && groupOf(it.group_id)?.employee_id !== person) return false;
    for (const [colId, vals] of Object.entries(filters)) {
      if (!vals.length) continue;
      const c = columns.find((x) => x.id === colId);
      if (c && !valueKeys(c, it).some((v) => vals.includes(v))) return false;
    }
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    const hay = (x: BoardItem, cols: BoardColumn[]) => [x.name, x.description ?? '', groupOf(x.group_id)?.name ?? '', ...cols.map((c) => cellText(c, x, { subitems: subsOf(x.id), columns, names }))].join(' ').toLowerCase();
    // A row matches when it, or any of its sub-items at any depth, matches.
    const deep = (x: BoardItem): boolean => subsOf(x.id).some((s) => hay(s, [...allItemCols, ...subCols]).includes(needle) || deep(s));
    return hay(it, allItemCols).includes(needle) || deep(it);
  };
  const sortRows = (list: BoardItem[]) => {
    if (!sort) return list.sort((a, b) => a.position - b.position);
    const col = columns.find((c) => c.id === sort.col);
    const key = (it: BoardItem): string | number => {
      if (sort.col === 'name') return it.name.toLowerCase();
      if (!col) return '';
      if (isNumeric(col.type)) return (col.type === 'formula' ? formulaValue(col, it, subsOf(it.id), columns) : num(it.values[col.id])) ?? -Infinity;
      if (col.type === 'date') return typeof it.values[col.id] === 'string' ? (it.values[col.id] as string) : '';
      return cellText(col, it, { subitems: subsOf(it.id), columns, names }).toLowerCase();
    };
    return list.sort((a, b) => {
      const x = key(a);
      const y = key(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  };
  const topRows = items.filter((i) => !i.parent_id && matches(i));
  const buckets: Bucket[] = useMemo(() => {
    if (groupBy === 'groups') return [...groups].sort((a, b) => a.position - b.position).map((g) => ({ key: g.id, name: g.name, color: g.color, group: g }));
    const c = columns.find((x) => x.id === groupBy);
    if (!c) return [];
    if (c.type === 'people' || c.type === 'person') return [...people.map((p) => ({ key: p.id, name: p.name, color: '#579BFC' })), { key: '__none', name: 'No one assigned', color: '#C4C4C4' }];
    return [...(c.settings.labels ?? []).map((l) => ({ key: l.id, name: l.label, color: l.color })), { key: '__none', name: 'No value', color: '#C4C4C4' }];
  }, [groupBy, groups, columns, people]);
  const bucketRows = (b: Bucket) => {
    if (groupBy === 'groups') return sortRows(topRows.filter((r) => r.group_id === b.key));
    const c = columns.find((x) => x.id === groupBy);
    if (!c) return [];
    return sortRows(topRows.filter((r) => {
      const keys = valueKeys(c, r);
      return b.key === '__none' ? keys.length === 0 || keys[0] === '__none' : keys.includes(b.key);
    }));
  };

  // -------------------------------------------------------------- summary --
  const summary = (col: BoardColumn, rows: BoardItem[], color: string): ReactNode => {
    if (isNumeric(col.type)) {
      const n = rows.reduce((s, it) => s + ((col.type === 'formula' ? formulaValue(col, it, subsOf(it.id), columns) : num(it.values[col.id])) ?? 0), 0);
      return (
        <span className="flex flex-col items-center leading-tight">
          <span className="text-sm font-semibold tabular-nums">{col.type === 'currency' || (col.type === 'formula' && formulaIsMoney(col, columns)) ? money2(n) : Math.round(n * 100) / 100}</span>
          <span className="text-[0.62rem] text-muted">sum</span>
        </span>
      );
    }
    if (col.type === 'date' || col.type === 'timeline') {
      const dates = rows
        .flatMap((r) => {
          if (col.type === 'date') return typeof r.values[col.id] === 'string' ? [r.values[col.id] as string] : [];
          const t = asTimeline(r.values[col.id]);
          return t ? [t.from, t.to] : [];
        })
        .sort();
      if (!dates.length) return null;
      const a = dates[0];
      const b = dates[dates.length - 1];
      return <span className="rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ background: color }}>{a === b ? fmtShortDate(a) : `${fmtShortDate(a)} - ${fmtShortDate(b)}`}</span>;
    }
    if (col.type === 'status' || col.type === 'dropdown') {
      const labels = col.settings.labels ?? [];
      const counts = labels.map((l) => ({ l, n: rows.filter((r) => r.values[col.id] === l.id).length })).filter((x) => x.n);
      if (!counts.length) return null;
      return (
        <span className="flex h-6 w-full overflow-hidden" title={counts.map((c) => `${c.l.label}: ${c.n}`).join(' · ')}>
          {counts.map((c) => <span key={c.l.id} style={{ width: `${(c.n / rows.length) * 100}%`, background: c.l.color }} />)}
        </span>
      );
    }
    return null;
  };

  const panelItem = panel?.kind === 'item' ? items.find((i) => i.id === panel.id) : null;
  const panelGroup = panel?.kind === 'group' ? groupOf(panel.id) : null;
  const exportHref = (format: 'xlsx' | 'pdf', extra = '') => `/base/crm/boards/${board.id}/export?format=${format}${extra}`;
  const grid = (cols: BoardColumn[]) => `40px minmax(240px, 1.6fr) ${cols.map((c) => `${c.width}px`).join(' ')} 48px`;
  const subGrid = (cols: BoardColumn[]) => `minmax(200px, 1.4fr) ${cols.map((c) => `${c.width}px`).join(' ')} 48px`;
  const ctx = (it: BoardItem, col: BoardColumn, color: string): CellCtx => ({
    columns,
    subitems: subsOf(it.id),
    people,
    names,
    readOnly: !canEdit,
    color,
    files: col.type === 'files' ? filesOf(it.id, col.id) : undefined,
    onFiles: col.type === 'files' ? (next) => setFiles((all) => [...all.filter((f) => !(f.item_id === it.id && f.column_id === col.id)), ...next]) : undefined,
    onSave: (v) => saveCell(it, col, v),
    onEditLabels: canManage && (col.type === 'status' || col.type === 'dropdown') ? () => setSetup(col) : undefined,
  });
  const header = (c: BoardColumn) => (
    <ColumnHeader col={c} manage={canManage} onRename={(n) => patchColumn(c, { name: n })} onSetup={() => setSetup(c)} onMove={(d) => moveColumn(c, d)} onDelete={() => removeColumn(c)} onHide={() => toggleHidden(c.id)} onSort={(dir) => setSort({ col: c.id, dir })} />
  );
  // ---------------------------------------------------------- sub-items --
  /** The arrow that opens a row's sub-items, or a dashed + to start them. */
  const subToggle = (it: BoardItem, subs: BoardItem[], open: boolean) =>
    subs.length > 0 || open || !canEdit ? (
      <button type="button" onClick={() => toggle(setExpanded, it.id)} className={`ml-1 flex flex-none items-center rounded px-1 py-1 text-[0.68rem] text-muted hover:bg-sand ${subs.length || open ? '' : 'invisible'}`} aria-label="Sub-items" title="Sub-items">
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {subs.length > 0 && <span className="ml-0.5">{subs.length}</span>}
      </button>
    ) : (
      <button type="button" onClick={() => void quickSub(it)} className="ml-1 flex h-6 w-6 flex-none items-center justify-center rounded border border-dashed border-stone text-muted hover:border-brass hover:bg-sand hover:text-brass" aria-label={`Add sub-item to ${it.name}`} title="Add sub-item">
        <Plus size={12} />
      </button>
    );
  /** A row's sub-items as a nested table; each sub-item can open its own sub-items, at any depth. */
  const renderSubs = (parent: BoardItem, depth: number, color: string): ReactNode => {
    const subs = subsOf(parent.id);
    // Each sub-item level has its own columns — changing them never touches the level above or below.
    const nestCols = columnsAt(columns, depth).filter((c) => !hidden.has(c.id));
    return (
      <div className={`border-b border-stone/60 bg-linen/60 py-2 pr-2 ${depth === 1 ? 'pl-12' : 'pl-8'}`}>
        <div className="overflow-hidden rounded-md border border-stone/70 bg-surface" style={{ borderLeft: `4px solid ${color}${depth === 1 ? '88' : '55'}` }}>
          <div className="grid border-b border-stone/70 text-[0.75rem] text-muted" style={{ gridTemplateColumns: subGrid(nestCols) }}>
            <span className="relative flex items-center justify-center border-r border-stone/60 px-2 py-1.5">
              {depth === 1 ? 'Sub-item' : `Sub-item · level ${depth}`}
              {canEdit && subs.length > 0 && (
                <button type="button" onClick={() => void removeSubs(parent)} className="absolute right-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.7rem] text-muted hover:bg-red-50 hover:text-red-600" title="Delete this sub-item table">
                  <Trash2 size={12} /> Delete all
                </button>
              )}
            </span>
            {nestCols.map((c) => <div key={c.id} className="border-r border-stone/60 px-2 py-1.5 text-center">{header(c)}</div>)}
            {canManage ? <ColumnPicker scope="subitem" onAdd={(n, t) => createColumn('subitem', n, t, depth)} /> : <span />}
          </div>
          {subs.map((s) => {
            const kids = subsOf(s.id);
            const sOpen = expanded.has(s.id);
            return (
              <div key={s.id}>
                <div className="grid border-b border-stone/50 transition-colors hover:bg-linen" style={{ gridTemplateColumns: subGrid(nestCols) }}>
                  <div className="flex min-w-0 items-center border-r border-stone/60">
                    {subToggle(s, kids, sOpen)}
                    {renamingItem === s.id ? (
                      <NameInput value={s.name} onDone={(n) => renameItem(s, n)} />
                    ) : (
                      <span
                        role={canEdit ? 'button' : undefined}
                        tabIndex={canEdit ? 0 : undefined}
                        onClick={() => canEdit && setRenamingItem(s.id)}
                        onKeyDown={(e) => e.key === 'Enter' && canEdit && setRenamingItem(s.id)}
                        className={`min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm ${canEdit ? 'cursor-text rounded hover:ring-1 hover:ring-stone' : ''}`}
                        title={canEdit ? 'Click to edit' : s.name}
                      >
                        {s.name}
                      </span>
                    )}
                    <button type="button" onClick={() => setPanel({ kind: 'item', id: s.id })} className="mr-1 flex h-7 w-7 flex-none items-center justify-center rounded text-muted hover:bg-sand hover:text-brass" aria-label={`Open ${s.name}`} title="Open">
                      <Maximize2 size={13} />
                    </button>
                  </div>
                  {nestCols.map((c) => <div key={c.id} className="min-h-[34px] min-w-0 border-r border-stone/60"><Cell col={c} item={s} ctx={ctx(s, c, color)} /></div>)}
                  {canEdit ? (
                    <button type="button" onClick={() => void removeSub(s)} className="flex items-center justify-center text-muted hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${s.name}`} title="Delete sub-item">
                      <Trash2 size={13} />
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
                {sOpen && renderSubs(s, depth + 1, color)}
              </div>
            );
          })}
          {canEdit && (
            <div className="grid" style={{ gridTemplateColumns: subGrid(nestCols) }}>
              <div className="min-w-0 border-r border-stone/60">
                <GroupAddRow label={depth === 1 ? 'Add sub-item' : 'Add sub-item here'} onAdd={(n) => createItem(parent.group_id, n, parent.id)} />
              </div>
              {nestCols.map((c) => <span key={c.id} className="border-r border-stone/60" />)}
              <span />
            </div>
          )}
        </div>
      </div>
    );
  };

  const activeFilters = Object.values(filters).reduce((s, v) => s + v.length, 0);
  const sortedGroups = [...groups].sort((a, b) => a.position - b.position);
  // "New item" adds to the bottom of the board: the end of its last group.
  const lastGroup = sortedGroups[sortedGroups.length - 1];
  const toggle = (set: (fn: (s: Set<string>) => Set<string>) => void, id: string) =>
    set((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="pb-24">
      {/* View tabs */}
      <div className="mb-3 flex items-center gap-1 border-b border-stone/70">
        {(['table', 'cards'] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)} className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${view === v ? 'border-brass font-medium text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
            {v === 'table' ? <Table2 size={14} /> : <LayoutGrid size={14} />} {v === 'table' ? 'Main table' : 'Cards'}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-1">
        {canEdit && lastGroup && (
          <span className="mr-2 inline-flex overflow-hidden rounded-md shadow-sm">
            <button type="button" className="b-btn-brass !rounded-none !rounded-l-md !px-3 !py-1.5" onClick={() => quickAdd(lastGroup.id)} title={`Adds to the bottom of “${lastGroup.name}”`}>
              New {board.item_label.toLowerCase()}
            </button>
            <PopButton label={<ChevronDown size={15} />} className="b-btn-brass !rounded-none !rounded-r-md border-l border-white/30 !px-1.5 !py-1.5" width={250}>
              {(close) => (
                <div className="p-1">
                  {sortedGroups.length > 1 && (
                    <>
                      <p className="px-2.5 pb-1 pt-1.5 text-xs text-muted">New {board.item_label.toLowerCase()} in…</p>
                      {sortedGroups.map((gr) => (
                        <MenuItem key={gr.id} onClick={() => { close(); quickAdd(gr.id); }}>
                          <span className="h-3 w-3 flex-none rounded-sm" style={{ background: gr.color }} /> <span className="truncate">{gr.name}</span>
                        </MenuItem>
                      ))}
                      <div className="my-1 border-t border-stone/60" />
                    </>
                  )}
                  <MenuItem onClick={() => { close(); createGroup(); }}><Layers size={14} /> New {board.group_label.toLowerCase()}</MenuItem>
                </div>
              )}
            </PopButton>
          </span>
        )}
        {searching || q ? (
          <label className="inline-flex items-center gap-1.5 rounded-md border border-brass/60 px-2 py-1">
            <Search size={14} className="text-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setSearching(false)} placeholder="Search this board" className="w-44 bg-transparent text-sm outline-none" />
            {q && <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setQ('')} aria-label="Clear search"><X size={13} className="text-muted" /></button>}
          </label>
        ) : (
          <button type="button" onClick={() => setSearching(true)} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-ink/80 hover:bg-sand/70"><Search size={15} /> Search</button>
        )}
        <PopButton label={person ? names[person] ?? 'Person' : 'Person'} icon={person ? <Initials name={names[person] ?? '?'} size={18} /> : <UserRound size={15} />} active={Boolean(person)} width={290}>
          {(close) => (
            <div className="p-1">
              <p className="px-2 pb-2 pt-1 text-xs text-muted">Show only rows with this person (in a People column or as the group’s person)</p>
              <div className="flex flex-wrap gap-1.5 px-1.5 pb-2">
                {people.map((p) => (
                  <button key={p.id} type="button" onClick={() => { setPerson(person === p.id ? '' : p.id); close(); }} className={`rounded-full ${person === p.id ? 'ring-2 ring-brass ring-offset-2 ring-offset-surface' : ''}`} title={p.name}>
                    <Initials name={p.name} size={30} />
                  </button>
                ))}
              </div>
              {person && <MenuItem onClick={() => { setPerson(''); close(); }}><X size={14} /> Clear</MenuItem>}
            </div>
          )}
        </PopButton>
        <PopButton label={<>Filter{activeFilters ? ` / ${activeFilters}` : ''}</>} icon={<Filter size={15} />} active={activeFilters > 0} width={380}>
          {() => (
            <div className="max-h-[70vh] space-y-3 overflow-y-auto p-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Quick filters</p>
                {activeFilters > 0 && <button type="button" onClick={() => setFilters({})} className="text-xs text-brass">Clear all</button>}
              </div>
              {[...labelCols, ...peopleCols].map((c) => {
                const opts = c.type === 'status' || c.type === 'dropdown' ? (c.settings.labels ?? []).map((l) => ({ id: l.id, label: l.label, color: l.color })) : people.map((p) => ({ id: p.id, label: p.name, color: '' }));
                const vals = filters[c.id] ?? [];
                return (
                  <div key={c.id}>
                    <p className="mb-1.5 text-xs font-medium text-muted">{c.name}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {opts.map((o) => {
                        const on = vals.includes(o.id);
                        return (
                          <button key={o.id} type="button" onClick={() => setFilters({ ...filters, [c.id]: on ? vals.filter((v) => v !== o.id) : [...vals, o.id] })} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${on ? 'border-brass bg-brass/10 font-medium' : 'border-stone hover:bg-sand/60'}`}>
                            {o.color ? <span className="h-2.5 w-2.5 rounded-sm" style={{ background: o.color }} /> : <Initials name={o.label} size={16} />} {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {labelCols.length + peopleCols.length === 0 && <p className="text-sm text-muted">Add a Status, Dropdown or People column to filter by it.</p>}
            </div>
          )}
        </PopButton>
        <PopButton label={sort ? 'Sort / 1' : 'Sort'} icon={<ArrowDownUp size={15} />} active={Boolean(sort)} width={300}>
          {(close) => (
            <div className="space-y-2 p-2">
              <p className="text-sm font-semibold">Sort by</p>
              <Select className="b-input" value={sort?.col ?? ''} onChange={(e) => setSort(e.target.value ? { col: e.target.value, dir: sort?.dir ?? 1 } : null)} aria-label="Sort by">
                <option value="">Manual order</option>
                <option value="name">{cap(board.item_label)}</option>
                {allItemCols.filter((c) => !['long_text', 'files'].includes(c.type)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              {sort && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setSort({ ...sort, dir: 1 })} className={`flex-1 rounded-md border px-2 py-1.5 text-sm ${sort.dir === 1 ? 'border-brass bg-brass/10' : 'border-stone'}`}>Ascending</button>
                  <button type="button" onClick={() => setSort({ ...sort, dir: -1 })} className={`flex-1 rounded-md border px-2 py-1.5 text-sm ${sort.dir === -1 ? 'border-brass bg-brass/10' : 'border-stone'}`}>Descending</button>
                </div>
              )}
              {sort && <button type="button" onClick={() => { setSort(null); close(); }} className="text-xs text-brass">Remove sort</button>}
            </div>
          )}
        </PopButton>
        <PopButton label={hidden.size ? `Hide / ${hidden.size}` : 'Hide'} icon={<EyeOff size={15} />} active={hidden.size > 0} width={280}>
          {() => (
            <div className="space-y-1 p-2">
              <p className="mb-1 text-sm font-semibold">Show columns</p>
              {allItemCols.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-sand/60">
                  <input type="checkbox" className="b-check" checked={!hidden.has(c.id)} onChange={() => toggleHidden(c.id)} /> {c.name}
                </label>
              ))}
            </div>
          )}
        </PopButton>
        <PopButton label={groupBy === 'groups' ? 'Group by' : `Group by: ${columns.find((c) => c.id === groupBy)?.name ?? ''}`} icon={<Layers size={15} />} active={groupBy !== 'groups'} width={260}>
          {(close) => (
            <div className="p-1">
              <MenuItem onClick={() => { setGroupBy('groups'); close(); }}>{cap(board.group_label)} (default){groupBy === 'groups' && ' ✓'}</MenuItem>
              {[...labelCols, ...peopleCols].map((c) => <MenuItem key={c.id} onClick={() => { setGroupBy(c.id); close(); }}>{c.name}{groupBy === c.id && ' ✓'}</MenuItem>)}
            </div>
          )}
        </PopButton>
        <PopButton label={<MoreHorizontal size={16} />} width={240}>
          {(close) => (
            <div className="p-1">
              <a href={exportHref('xlsx')} onClick={close} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-sand/70"><FileSpreadsheet size={14} /> Export to Excel</a>
              <a href={exportHref('pdf')} onClick={close} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-sand/70"><FileText size={14} /> Export to PDF</a>
              <MenuItem onClick={() => { setCollapsed(new Set(buckets.map((b) => b.key))); close(); }}><ChevronsDownUp size={14} /> Collapse all groups</MenuItem>
              <MenuItem onClick={() => { setCollapsed(new Set()); close(); }}><ChevronsUpDown size={14} /> Expand all groups</MenuItem>
            </div>
          )}
        </PopButton>
      </div>


      <div className="space-y-9">
        {buckets.map((b) => {
          const rows = bucketRows(b);
          const g = b.group;
          const isCollapsed = collapsed.has(b.key);
          if (groupBy !== 'groups' && rows.length === 0) return null;
          const allSel = rows.length > 0 && rows.every((r) => selected.has(r.id));
          return (
            <section
              key={b.key}
              onDragOver={(e) => drag && g && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (drag && g) dropItem(drag, g.id, null);
                setDrag(null);
              }}
            >
              {/* group title */}
              <div className="group/g mb-1.5 flex items-center gap-1.5">
                <button type="button" onClick={() => toggle(setCollapsed, b.key)} className="rounded p-0.5" aria-label={isCollapsed ? 'Expand' : 'Collapse'}>
                  {isCollapsed ? <ChevronRight size={18} style={{ color: b.color }} /> : <ChevronDown size={18} style={{ color: b.color }} />}
                </button>
                {g && renamingGroup === g.id ? (
                  <input autoFocus defaultValue={g.name} maxLength={120} onFocus={placeCaret} className="b-input !w-72 !py-1 font-semibold" onBlur={(e) => { setRenamingGroup(null); if (e.target.value.trim() && e.target.value !== g.name) patchGroup(g, { name: e.target.value.trim() }); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
                ) : (
                  <>
                    <button type="button" onClick={() => g && (canEdit ? setRenamingGroup(g.id) : setPanel({ kind: 'group', id: g.id }))} className={`rounded px-1 text-[1.1rem] font-semibold ${g && canEdit ? 'cursor-text hover:ring-1 hover:ring-stone' : 'hover:opacity-80'}`} style={{ color: b.color }} title={g ? (canEdit ? 'Click to rename' : 'Open summary') : undefined}>
                      {b.name}
                    </button>
                    {g && canEdit && (
                      <button type="button" onClick={() => setPanel({ kind: 'group', id: g.id })} className="rounded p-1 text-muted hover:bg-sand hover:text-brass" aria-label={`Open ${b.name} summary`} title="Open summary">
                        <Maximize2 size={14} />
                      </button>
                    )}
                  </>
                )}
                <span className="text-xs text-muted opacity-0 transition-opacity group-hover/g:opacity-100">{rows.length} {rows.length === 1 ? board.item_label.toLowerCase() : 'rows'}</span>
                {g && canEdit && (
                  <span className="opacity-0 transition-opacity group-hover/g:opacity-100">
                    <PopButton label={<MoreHorizontal size={16} />} className="rounded p-1 text-muted hover:bg-sand" width={250}>
                      {(close) => (
                        <div className="p-1">
                          <MenuItem onClick={() => { close(); setPanel({ kind: 'group', id: g.id }); }}>Open summary</MenuItem>
                          <MenuItem onClick={() => { close(); setRenamingGroup(g.id); }}>Rename</MenuItem>
                          <div className="flex flex-wrap gap-1.5 px-2.5 py-2">
                            {GROUP_COLORS.map((c) => <button key={c} type="button" onClick={() => { close(); patchGroup(g, { color: c }); }} className={`h-5 w-5 rounded-full ${c === g.color ? 'ring-2 ring-ink ring-offset-1' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} />)}
                          </div>
                          <div className="px-2.5 py-1.5 text-xs text-muted">
                            Linked person
                            <Select people className="b-input mt-1 !py-1 text-sm" value={g.employee_id ?? ''} onChange={(e) => { close(); patchGroup(g, { employee_id: e.target.value || null }); }} aria-label="Linked person">
                              <option value="">— None —</option>
                              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </Select>
                          </div>
                          <a href={exportHref('xlsx', `&group=${g.id}`)} onClick={close} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-sand/70"><FileSpreadsheet size={14} /> Export to Excel</a>
                          <a href={exportHref('pdf', `&group=${g.id}`)} onClick={close} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-sand/70"><FileText size={14} /> Export to PDF</a>
                          {canManage && <MenuItem danger onClick={() => { close(); removeGroup(g); }}><Trash2 size={14} /> Delete group</MenuItem>}
                        </div>
                      )}
                    </PopButton>
                  </span>
                )}
              </div>

              {!isCollapsed && view === 'table' && (
                <div className="overflow-x-auto">
                  <div className="min-w-max overflow-hidden rounded-md border border-stone/80 bg-surface" style={{ borderLeft: `6px solid ${b.color}` }}>
                    {/* header */}
                    <div className="grid border-b border-stone/80 text-[0.82rem] text-ink/80" style={{ gridTemplateColumns: grid(itemCols) }}>
                      <span className="flex items-center justify-center border-r border-stone/60">
                        <input type="checkbox" className="b-check" checked={allSel} onChange={() => setSelected((s) => { const n = new Set(s); rows.forEach((r) => (allSel ? n.delete(r.id) : n.add(r.id))); return n; })} aria-label="Select all rows" />
                      </span>
                      <div className="flex items-center justify-center border-r border-stone/60 px-2 py-2">
                        <TitleEdit value={cap(board.item_label)} manage={canManage} onSave={(n) => run(setItemLabel(board.id, n))} />
                      </div>
                      {itemCols.map((c) => <div key={c.id} className="border-r border-stone/60 px-2 py-2 text-center">{header(c)}</div>)}
                      {canManage ? <ColumnPicker scope="item" onAdd={(n, t) => createColumn('item', n, t)} /> : <span />}
                    </div>
                    {/* rows */}
                    {rows.map((it) => {
                      const subs = subsOf(it.id);
                      const open = expanded.has(it.id);
                      const count = updateCounts[it.id] ?? 0;
                      const color = groupOf(it.group_id)?.color ?? b.color;
                      return (
                        <div key={it.id}>
                          <div
                            className={`group/row grid border-b border-stone/60 transition-colors hover:bg-linen ${selected.has(it.id) ? 'bg-brass/5' : ''} ${drag === it.id ? 'opacity-40' : ''}`}
                            style={{ gridTemplateColumns: grid(itemCols) }}
                            draggable={canEdit && !sort && groupBy === 'groups'}
                            onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDrag(it.id); }}
                            onDragEnd={() => setDrag(null)}
                            onDragOver={(e) => drag && e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (drag && drag !== it.id && g) dropItem(drag, g.id, it.id);
                              setDrag(null);
                            }}
                          >
                            <span className="relative flex items-center justify-center border-r border-stone/60">
                              {canEdit && !sort && groupBy === 'groups' && <GripVertical size={12} className="absolute -left-0.5 cursor-grab text-muted/40 opacity-0 group-hover/row:opacity-100" />}
                              <input type="checkbox" className="b-check" checked={selected.has(it.id)} onChange={() => toggle(setSelected, it.id)} aria-label={`Select ${it.name}`} />
                            </span>
                            <div className="flex min-w-0 items-center border-r border-stone/60">
                              {subToggle(it, subs, open)}
                              {renamingItem === it.id ? (
                                <NameInput value={it.name} onDone={(n) => renameItem(it, n)} />
                              ) : (
                                <span
                                  role={canEdit ? 'button' : undefined}
                                  tabIndex={canEdit ? 0 : undefined}
                                  onClick={() => canEdit && setRenamingItem(it.id)}
                                  onKeyDown={(e) => e.key === 'Enter' && canEdit && setRenamingItem(it.id)}
                                  className={`min-w-0 flex-1 truncate px-2 py-2 text-left text-sm ${canEdit ? 'cursor-text rounded hover:ring-1 hover:ring-stone' : ''}`}
                                  title={canEdit ? 'Click to edit' : it.name}
                                >
                                  {it.name}
                                </span>
                              )}
                              <button type="button" onClick={() => setPanel({ kind: 'item', id: it.id })} className="flex h-8 w-8 flex-none items-center justify-center rounded text-muted hover:bg-sand hover:text-brass" aria-label={`Open ${it.name}`} title="Open">
                                <Maximize2 size={14} />
                              </button>
                              <button type="button" onClick={() => setPanel({ kind: 'item', id: it.id, tab: 'updates' })} className="relative mr-1 flex h-8 w-9 flex-none items-center justify-center rounded text-muted hover:bg-sand hover:text-brass" aria-label={`Updates (${count})`} title="Updates">
                                {count ? <MessageCircle size={18} className="text-brass" /> : <MessageCirclePlus size={18} />}
                                {count > 0 && <span className="absolute right-0.5 top-0.5 rounded-full bg-brass px-1 text-[0.55rem] font-bold leading-[14px] text-white">{count}</span>}
                              </button>
                            </div>
                            {itemCols.map((c) => <div key={c.id} className="min-h-[38px] min-w-0 border-r border-stone/60"><Cell col={c} item={it} ctx={ctx(it, c, color)} /></div>)}
                            <span />
                          </div>
                          {open && renderSubs(it, 1, color)}
                        </div>
                      );
                    })}
                    {canEdit && g ? (
                      <div className="grid border-b border-stone/60" style={{ gridTemplateColumns: grid(itemCols) }}>
                        <span className="border-r border-stone/60" />
                        <div className="min-w-0 border-r border-stone/60">
                          <GroupAddRow label={`Add new ${board.item_label.toLowerCase()}`} onAdd={(n) => createItem(g.id, n)} />
                        </div>
                        {itemCols.map((c) => <span key={c.id} className="border-r border-stone/60" />)}
                        <span />
                      </div>
                    ) : (
                      rows.length === 0 && <p className="border-b border-stone/60 px-4 py-3 text-sm text-muted">No {board.item_label.toLowerCase()}s here yet.</p>
                    )}
                    {/* footer */}
                    {rows.length > 0 && (
                      <div className="grid" style={{ gridTemplateColumns: grid(itemCols) }}>
                        <span />
                        <span />
                        {itemCols.map((c) => <div key={c.id} className="flex min-h-[44px] items-center justify-center border-l border-stone/60 px-2 py-1.5">{summary(c, rows, b.color)}</div>)}
                        <span />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!isCollapsed && view === 'cards' && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {rows.map((it) => (
                    <button key={it.id} type="button" onClick={() => setPanel({ kind: 'item', id: it.id })} className="b-card block overflow-hidden text-left transition-shadow hover:shadow-md">
                      <div className="h-1.5" style={{ background: b.color }} />
                      <div className="p-4">
                        <p className="font-semibold">{it.name}</p>
                        <dl className="mt-2 space-y-1.5 text-xs">
                          {itemCols.filter((c) => c.type !== 'long_text').slice(0, 8).map((c) => {
                            const label = c.type === 'status' || c.type === 'dropdown' ? c.settings.labels?.find((l) => l.id === it.values[c.id]) : null;
                            const fileCount = c.type === 'files' ? filesOf(it.id, c.id).length : 0;
                            const t = c.type === 'files' ? (fileCount ? `${fileCount} file${fileCount === 1 ? '' : 's'}` : '') : cellText(c, it, { subitems: subsOf(it.id), columns, names });
                            if (!t) return null;
                            return (
                              <div key={c.id} className="flex justify-between gap-3">
                                <dt className="text-muted">{c.name}</dt>
                                <dd className="truncate text-right font-medium">{label ? <span className="rounded px-1.5 py-0.5 text-[0.65rem] font-semibold text-white" style={{ background: label.color }}>{t}</span> : t}</dd>
                              </div>
                            );
                          })}
                        </dl>
                        {((updateCounts[it.id] ?? 0) > 0 || subsOf(it.id).length > 0) && (
                          <p className="mt-3 flex gap-3 border-t border-stone/50 pt-2 text-[0.7rem] text-muted">
                            {subsOf(it.id).length > 0 && <span>{subsOf(it.id).length} sub-items</span>}
                            {(updateCounts[it.id] ?? 0) > 0 && <span className="inline-flex items-center gap-1"><MessageCircle size={11} /> {updateCounts[it.id]}</span>}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {canEdit && groupBy === 'groups' && (
        <button type="button" onClick={createGroup} className="mt-8 inline-flex items-center gap-2 rounded-md border border-stone px-3 py-1.5 text-sm hover:bg-sand/60"><Plus size={15} /> Add new group</button>
      )}

      {/* bulk actions */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-xl border border-stone/70 bg-surface px-2 py-2 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.4)] lg:ml-32">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brass text-sm font-bold text-white">{selected.size}</span>
          <span className="mr-2 pl-1 text-sm">selected</span>
          {canEdit && <button type="button" onClick={bulkDuplicate} className="inline-flex flex-col items-center rounded-lg px-3 py-1 text-xs hover:bg-sand/70"><Copy size={16} /> Duplicate</button>}
          {canEdit && (
            <PopButton label={<span className="inline-flex flex-col items-center text-xs"><ArrowRightLeft size={16} /> Move to</span>} className="rounded-lg px-3 py-1 hover:bg-sand/70" width={240}>
              {(close) => <div className="p-1">{groups.map((gr) => <MenuItem key={gr.id} onClick={() => { close(); bulk('move', gr.id); }}><span className="h-3 w-3 rounded-sm" style={{ background: gr.color }} /> {gr.name}</MenuItem>)}</div>}
            </PopButton>
          )}
          {canEdit && <button type="button" onClick={() => bulk('delete')} className="inline-flex flex-col items-center rounded-lg px-3 py-1 text-xs text-red-600 hover:bg-red-50"><Trash2 size={16} /> Delete</button>}
          <button type="button" onClick={() => setSelected(new Set())} className="ml-1 rounded-lg p-2 text-muted hover:bg-sand/70" aria-label="Clear selection"><X size={16} /></button>
        </div>
      )}

      {panelItem && (
        <ItemPanel
          key={`${panelItem.id}-${panel?.tab ?? 'details'}`}
          initialTab={panel?.tab ?? 'details'}
          board={board}
          item={panelItem}
          parent={panelItem.parent_id ? (items.find((i) => i.id === panelItem.parent_id) ?? null) : null}
          depth={depthOf(panelItem, items)}
          columns={columns}
          groups={groups}
          subitems={subsOf(panelItem.id)}
          ctxFor={(it, col) => ctx(it, col, groupOf(it.group_id)?.color ?? '#579BFC')}
          canEdit={canEdit}
          onClose={() => setPanel(null)}
          onOpenItem={(id) => setPanel({ kind: 'item', id })}
          onPatch={(patch) => patchItem(panelItem.id, patch)}
          onAddSub={(n) => createItem(panelItem.group_id, n, panelItem.id)}
          onRemoved={(ids) => {
            setItems((list) => {
              const all = withDescendants(ids, list);
              return list.filter((i) => !all.has(i.id));
            });
            setPanel(null);
          }}
          onAdded={(added) => setItems((list) => [...list, ...added])}
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

/** Inline name editor: Enter or clicking away saves, Escape cancels. */
function NameInput({ value, onDone }: { value: string; onDone: (name: string) => void }) {
  return (
    <input
      autoFocus
      defaultValue={value}
      maxLength={200}
      onFocus={placeCaret}
      onBlur={(e) => onDone(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          (e.target as HTMLInputElement).value = value;
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="mx-1 min-w-0 flex-1 rounded border border-brass bg-surface px-2 py-1.5 text-sm outline-none"
      aria-label="Name"
    />
  );
}

/**
 * The last line of every group: "+ Add new item". Clicking it turns it into a name box;
 * Enter adds the row (with all its columns working) and the line goes back to "+ Add new item",
 * ready for the next one. Esc or clicking away with nothing typed just closes it.
 */
function GroupAddRow({ label, onAdd }: { label: string; onAdd: (name: string) => Promise<unknown> }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  // The line resets at once; the row appears as soon as it's saved (errors show as a toast).
  const submit = () => {
    const n = name.trim();
    setName('');
    setEditing(false);
    if (n) void onAdd(n);
  };
  if (!editing)
    return (
      <button type="button" onClick={() => setEditing(true)} className="flex h-full w-full items-center gap-1.5 px-3 py-2 text-left text-sm text-muted hover:bg-linen hover:text-brass">
        <Plus size={14} /> {label}
      </button>
    );
  return (
    <input
      autoFocus
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
        if (e.key === 'Escape') {
          setName('');
          setEditing(false);
        }
      }}
      placeholder={`${label.replace(/^Add (new )?/, '').replace(/ here$/, '')} name`}
      maxLength={200}
      className="mx-1 my-1 w-[calc(100%-0.5rem)] rounded border border-brass bg-surface px-2 py-1.5 text-sm outline-none"
      aria-label={label}
    />
  );
}
