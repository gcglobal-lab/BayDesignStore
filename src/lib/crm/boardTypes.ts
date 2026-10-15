/** Workflow ▸ Boards: shapes, column types and value helpers. Safe to import from client components. */

export type ColumnType = 'text' | 'long_text' | 'number' | 'currency' | 'date' | 'status' | 'person' | 'email' | 'phone' | 'link' | 'checkbox' | 'formula' | 'dropdown' | 'people' | 'files' | 'timeline';
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
  workspace_id: string;
  folder_id: string | null;
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
  dropdown: 'Dropdown',
  people: 'People',
  files: 'Files',
  timeline: 'Timeline (date range)',
};

/** The column picker, grouped like monday.com. */
export const COLUMN_PICKER: { title: string; types: ColumnType[] }[] = [
  { title: 'Essentials', types: ['status', 'dropdown', 'text', 'date', 'people', 'currency', 'number'] },
  { title: 'Super useful', types: ['files', 'timeline', 'checkbox', 'formula', 'long_text', 'person', 'phone', 'email', 'link'] },
];
export const columnTypeShort: Record<ColumnType, string> = { status: 'Status', dropdown: 'Dropdown', text: 'Text', date: 'Date', people: 'People', currency: 'Money', number: 'Numbers', files: 'Files', timeline: 'Timeline', checkbox: 'Checkbox', formula: 'Formula', long_text: 'Long text', person: 'Person', phone: 'Phone', email: 'Email', link: 'Link' };
export const columnTypeColor: Record<ColumnType, string> = { status: '#00C875', dropdown: '#00C875', text: '#FDAB3D', date: '#A25DDC', people: '#66CCFF', currency: '#FDAB3D', number: '#FDAB3D', files: '#FF7575', timeline: '#A25DDC', checkbox: '#FDAB3D', formula: '#2EB6B6', long_text: '#FDAB3D', person: '#66CCFF', phone: '#FF642E', email: '#579BFC', link: '#579BFC' };
export const formulaLabel: Record<FormulaOp, string> = { subtract: 'A − B', add: 'A + B', multiply: 'A × B', divide: 'A ÷ B', subitems_sum: 'Sum of a sub-item column' };

// monday.com's palette
export const STATUS_COLORS = ['#00C875', '#FDAB3D', '#DF2F4A', '#579BFC', '#A25DDC', '#C4C4C4', '#0086C0', '#9CD326', '#FF642E', '#FF158A', '#037F4C', '#784BD1'];
export const GROUP_COLORS = ['#579BFC', '#FDAB3D', '#A25DDC', '#00C875', '#E2445C', '#037F4C', '#0086C0', '#9CD326', '#FF642E', '#FF158A', '#784BD1', '#66CCFF'];
export type Timeline = { from: string; to: string };
export const asIds = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' && v ? [v] : []);
export const asTimeline = (v: unknown): Timeline | null => (v && typeof v === 'object' && typeof (v as Timeline).from === 'string' && typeof (v as Timeline).to === 'string' ? (v as Timeline) : null);
const shortDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export const fmtShortDate = shortDate;
export const fmtTimeline = (t: Timeline) => (t.from === t.to ? shortDate(t.from) : `${shortDate(t.from)} - ${shortDate(t.to)}`);

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
    case 'dropdown':
      return col.settings.labels?.find((l) => l.id === v)?.label ?? '';
    case 'people':
      return asIds(v).map((id) => ctx.names[id] ?? '').filter(Boolean).join(', ');
    case 'timeline': {
      const t = asTimeline(v);
      return t ? fmtTimeline(t) : '';
    }
    case 'files':
      return '';
    case 'date':
      return typeof v === 'string' && v ? shortDate(v) : '';
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
    key: 'deposits',
    name: 'Designer deposits',
    description: 'A board per designer (e.g. “Victoria Bird”): one group per customer, a row per deposit month with date, who’s assigned, amount, payment method, proof files, notes and status.',
    item_label: 'deposit month',
    group_label: 'Customer',
    groups: ['New customer'],
    columns: [
      { name: 'Deposit Date', type: 'date', width: 130 },
      { name: 'Assigned', type: 'people', width: 120 },
      { name: 'Deposit Amount', type: 'currency', width: 150 },
      { name: 'Payment Method', type: 'dropdown', width: 150, settings: { labels: [sl('CC', '#579BFC', 0), sl('Check', '#A25DDC', 1), sl('Cash', '#00C875', 2), sl('Wire / ACH', '#0086C0', 3), sl('Zelle', '#784BD1', 4), sl('Financing', '#FDAB3D', 5)] } },
      { name: 'Proof Files', type: 'files', width: 140 },
      { name: 'Notes', type: 'text', width: 230 },
      { name: 'Deposit Status', type: 'status', width: 150, settings: { labels: [sl('Received', '#00C875', 0), sl('Pending', '#FDAB3D', 1), sl('Partial', '#579BFC', 2), sl('Declined', '#DF2F4A', 3), sl('Refunded', '#A25DDC', 4)] } },
    ],
  },
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
