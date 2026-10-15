/** Workflow ▸ Boards: shapes, column types and value helpers. Safe to import from client components. */

export type ColumnType = 'text' | 'long_text' | 'number' | 'currency' | 'date' | 'status' | 'person' | 'email' | 'phone' | 'link' | 'checkbox' | 'formula';
export type StatusLabel = { id: string; label: string; color: string };
export type FormulaOp = 'subtract' | 'add' | 'multiply' | 'divide' | 'subitems_sum';
export type ColumnSettings = { labels?: StatusLabel[]; op?: FormulaOp; a?: string; b?: string; currency?: boolean };

export type BoardColumn = { id: string; board_id: string; scope: 'item' | 'subitem'; name: string; type: ColumnType; settings: ColumnSettings; width: number; position: number };
export type BoardGroup = { id: string; board_id: string; name: string; color: string; employee_id: string | null; position: number };
export type BoardItem = {
  id: string;
  board_id: string;
  group_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  values: Record<string, unknown>;
  contact_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};
export type Board = {
  id: string;
  name: string;
  description: string | null;
  folder: string | null;
  color: string;
  visibility: 'everyone' | 'members';
  item_label: string;
  group_label: string;
  position: number;
  archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
export type BoardUpdate = { id: string; item_id: string; kind: 'comment' | 'log'; body: string; author_name: string | null; created_at: string };

export const columnTypeLabel: Record<ColumnType, string> = {
  text: 'Text',
  long_text: 'Long text / notes',
  number: 'Number',
  currency: 'Money ($)',
  date: 'Date',
  status: 'Status (coloured labels)',
  person: 'Person',
  email: 'Email',
  phone: 'Phone',
  link: 'Link',
  checkbox: 'Checkbox',
  formula: 'Formula (calculated)',
};
export const formulaLabel: Record<FormulaOp, string> = { subtract: 'A − B', add: 'A + B', multiply: 'A × B', divide: 'A ÷ B', subitems_sum: 'Sum of a sub-item column' };

export const STATUS_COLORS = ['#94A3B8', '#0EA5E9', '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#F97316', '#10B981', '#059669', '#EF4444'];
export const GROUP_COLORS = ['#6366F1', '#EC4899', '#10B981', '#F59E0B', '#0EA5E9', '#8B5CF6', '#EF4444', '#14B8A6', '#F97316', '#64748B'];

export const isNumeric = (t: ColumnType) => t === 'number' || t === 'currency' || t === 'formula';
export const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : null);

/** Value of a formula column for an item (sub-items needed for "sum of a sub-item column"). */
export function formulaValue(col: BoardColumn, item: BoardItem, subitems: BoardItem[], columns: BoardColumn[]): number | null {
  const s = col.settings;
  if (s.op === 'subitems_sum') {
    if (!s.a) return null;
    const sub = columns.find((c) => c.id === s.a);
    return subitems.reduce((sum, si) => sum + (sub?.type === 'formula' ? (formulaValue(sub, si, [], columns) ?? 0) : (num(si.values[s.a!]) ?? 0)), 0);
  }
  const get = (id?: string) => {
    if (!id) return null;
    const c = columns.find((x) => x.id === id);
    if (!c) return null;
    return c.type === 'formula' && c.id !== col.id ? formulaValue(c, item, subitems, columns) : num(item.values[id]);
  };
  const a = get(s.a) ?? 0;
  const b = get(s.b) ?? 0;
  switch (s.op) {
    case 'add':
      return a + b;
    case 'subtract':
      return a - b;
    case 'multiply':
      return a * b;
    case 'divide':
      return b ? a / b : null;
    default:
      return null;
  }
}

/** A formula shows as money when either input is money (or it sums a money column). */
export function formulaIsMoney(col: BoardColumn, columns: BoardColumn[]): boolean {
  const ids = [col.settings.a, col.settings.b].filter(Boolean);
  return ids.some((id) => {
    const c = columns.find((x) => x.id === id);
    return c?.type === 'currency' || (c?.type === 'formula' && c.id !== col.id && formulaIsMoney(c, columns));
  });
}

export const money2 = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Plain-text value of a cell (search, exports, cards). */
export function cellText(col: BoardColumn, item: BoardItem, ctx: { subitems: BoardItem[]; columns: BoardColumn[]; names: Record<string, string> }): string {
  const v = item.values[col.id];
  switch (col.type) {
    case 'formula': {
      const n = formulaValue(col, item, ctx.subitems, ctx.columns);
      return n === null ? '' : formulaIsMoney(col, ctx.columns) ? money2(n) : String(Math.round(n * 100) / 100);
    }
    case 'currency':
      return num(v) === null ? '' : money2(num(v)!);
    case 'number':
      return num(v) === null ? '' : String(num(v));
    case 'status':
      return col.settings.labels?.find((l) => l.id === v)?.label ?? '';
    case 'person':
      return typeof v === 'string' ? (ctx.names[v] ?? '') : '';
    case 'checkbox':
      return v ? 'Yes' : '';
    default:
      return typeof v === 'string' ? v : v == null ? '' : String(v);
  }
}

const sl = (label: string, color: string, i: number): StatusLabel => ({ id: `s${i}`, label, color });
type TemplateColumn = { scope?: 'item' | 'subitem'; key?: string; name: string; type: ColumnType; settings?: ColumnSettings; width?: number };
export type BoardTemplate = { key: string; name: string; description: string; item_label: string; group_label: string; groups: string[]; columns: TemplateColumn[] };

/** Ready-made boards. Formula settings refer to other columns by their `key`. */
export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    key: 'designers',
    name: 'Designers & clients',
    description: 'One group per designer, a row per client / sales order with amounts and what’s still owed, and the pieces on each order as sub-items.',
    item_label: 'Client / sales order',
    group_label: 'Designer',
    groups: ['Designer 1'],
    columns: [
      { key: 'so', name: 'Sales order #', type: 'text', width: 130 },
      { name: 'Status', type: 'status', width: 140, settings: { labels: [sl('New', '#0EA5E9', 0), sl('Quoted', '#8B5CF6', 1), sl('Ordered', '#F59E0B', 2), sl('In production', '#F97316', 3), sl('Delivered', '#10B981', 4), sl('Paid in full', '#059669', 5), sl('On hold', '#EF4444', 6)] } },
      { name: 'Order date', type: 'date', width: 130 },
      { key: 'amount', name: 'Order amount', type: 'currency', width: 140 },
      { key: 'paid', name: 'Paid', type: 'currency', width: 130 },
      { name: 'Remaining', type: 'formula', width: 140, settings: { op: 'subtract', a: 'amount', b: 'paid' } },
      { name: 'Phone', type: 'phone', width: 140 },
      { name: 'Email', type: 'email', width: 190 },
      { name: 'Expected delivery', type: 'date', width: 140 },
      { name: 'Notes', type: 'long_text', width: 220 },
      { scope: 'subitem', key: 'qty', name: 'Qty', type: 'number', width: 80 },
      { scope: 'subitem', key: 'price', name: 'Price', type: 'currency', width: 120 },
      { scope: 'subitem', name: 'Line total', type: 'formula', width: 130, settings: { op: 'multiply', a: 'qty', b: 'price' } },
      { scope: 'subitem', name: 'Status', type: 'status', width: 130, settings: { labels: [sl('To order', '#94A3B8', 0), sl('Ordered', '#F59E0B', 1), sl('Received', '#6366F1', 2), sl('Delivered', '#10B981', 3)] } },
      { scope: 'subitem', name: 'Vendor', type: 'text', width: 150 },
    ],
  },
  {
    key: 'claims',
    name: 'Claims & touch-ups',
    description: 'Damage claims and touch-ups from report to fix.',
    item_label: 'Claim',
    group_label: 'Stage',
    groups: ['Open', 'Waiting on vendor', 'Resolved'],
    columns: [
      { name: 'Customer', type: 'text', width: 170 },
      { name: 'Status', type: 'status', width: 140, settings: { labels: [sl('New', '#0EA5E9', 0), sl('Scheduled', '#8B5CF6', 1), sl('Waiting on parts', '#F59E0B', 2), sl('Fixed', '#10B981', 3)] } },
      { name: 'Reported', type: 'date', width: 130 },
      { name: 'Product', type: 'text', width: 170 },
      { name: 'Assigned to', type: 'person', width: 150 },
      { name: 'Phone', type: 'phone', width: 140 },
      { name: 'Issue', type: 'long_text', width: 240 },
      { name: 'Cost', type: 'currency', width: 120 },
    ],
  },
  {
    key: 'vendors',
    name: 'Vendor list',
    description: 'Suppliers, reps and how to reach them.',
    item_label: 'Vendor',
    group_label: 'Category',
    groups: ['Furniture', 'Lighting & decor', 'Rugs & textiles'],
    columns: [
      { name: 'Rep', type: 'text', width: 160 },
      { name: 'Phone', type: 'phone', width: 140 },
      { name: 'Email', type: 'email', width: 200 },
      { name: 'Website', type: 'link', width: 180 },
      { name: 'Account #', type: 'text', width: 130 },
      { name: 'Lead time (weeks)', type: 'number', width: 130 },
      { name: 'Notes', type: 'long_text', width: 240 },
    ],
  },
  {
    key: 'blank',
    name: 'Blank board',
    description: 'Start with a status, person, date and notes column and build from there.',
    item_label: 'Item',
    group_label: 'Group',
    groups: ['Group 1'],
    columns: [
      { name: 'Status', type: 'status', width: 140, settings: { labels: [sl('Not started', '#94A3B8', 0), sl('Working on it', '#F59E0B', 1), sl('Stuck', '#EF4444', 2), sl('Done', '#10B981', 3)] } },
      { name: 'Person', type: 'person', width: 150 },
      { name: 'Date', type: 'date', width: 130 },
      { name: 'Notes', type: 'long_text', width: 240 },
    ],
  },
];
