/** Workflow (CRM) records, labels and small helpers. Safe to import from client components. */

export type Priority = 'low' | 'normal' | 'high';
export type Lifecycle = 'lead' | 'prospect' | 'customer' | 'past_customer' | 'designer' | 'vendor' | 'other';
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'disqualified' | 'converted';
export type DealStatus = 'open' | 'won' | 'lost';
export type ActivityType = 'task' | 'call' | 'meeting' | 'email' | 'note' | 'log';
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';

export type Stage = { id: string; pipeline_id: string; name: string; color: string; probability: number; rot_days: number | null; position: number };
export type Pipeline = { id: string; name: string; position: number; is_default: boolean; stages: Stage[] };

export type CrmSettings = {
  lead_sources: string[];
  lost_reasons: string[];
  deal_tags: string[];
  default_owner_id: string | null;
  quote_terms: string;
};

export type Person = { id: string; name: string };

export type Company = {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  notes: string | null;
  owner_id: string | null;
  created_at: string;
};

export type Contact = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  company_id: string | null;
  lifecycle: Lifecycle;
  source: string | null;
  owner_id: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  tags: string[];
  notes: string | null;
  do_not_contact: boolean;
  last_activity_at: string | null;
  created_at: string;
};

export type Deal = {
  id: string;
  title: string;
  pipeline_id: string;
  stage_id: string;
  contact_id: string | null;
  company_id: string | null;
  owner_id: string | null;
  value: number;
  expected_close: string | null;
  status: DealStatus;
  lost_reason: string | null;
  priority: Priority;
  source: string | null;
  tags: string[];
  notes: string | null;
  position: number;
  stage_changed_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Lead = {
  id: string;
  title: string;
  name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  message: string | null;
  source: string | null;
  status: LeadStatus;
  estimated_value: number | null;
  owner_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  inquiry_id: string | null;
  disqualify_reason: string | null;
  created_at: string;
};

export type Activity = {
  id: string;
  type: ActivityType;
  subject: string;
  body: string | null;
  due_at: string | null;
  done: boolean;
  done_at: string | null;
  priority: Priority;
  outcome: string | null;
  assignee_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  deal_id: string | null;
  lead_id: string | null;
  created_by: string | null;
  author_name: string | null;
  created_at: string;
};

export type Product = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  description: string | null;
  unit_price: number;
  cost: number | null;
  active: boolean;
};

export type QuoteItem = { id?: string; product_id: string | null; description: string; quantity: number; unit_price: number; discount_pct: number };
export type Quote = {
  id: string;
  number: number;
  title: string;
  status: QuoteStatus;
  deal_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  owner_id: string | null;
  valid_until: string | null;
  discount_pct: number;
  tax_pct: number;
  delivery_fee: number;
  notes: string | null;
  terms: string | null;
  sent_at: string | null;
  decided_at: string | null;
  created_at: string;
};

export const lifecycleLabel: Record<Lifecycle, string> = {
  lead: 'Lead',
  prospect: 'Prospect',
  customer: 'Customer',
  past_customer: 'Past customer',
  designer: 'Designer / trade',
  vendor: 'Vendor',
  other: 'Other',
};
export const lifecycleTone: Record<Lifecycle, string> = {
  lead: 'b-badge-blue',
  prospect: 'b-badge-amber',
  customer: 'b-badge-green',
  past_customer: 'b-badge-gray',
  designer: 'b-badge bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/15',
  vendor: 'b-badge-gray',
  other: 'b-badge-gray',
};

export const leadStatusLabel: Record<LeadStatus, string> = { new: 'New', contacted: 'Contacted', qualified: 'Qualified', disqualified: 'Disqualified', converted: 'Converted' };
export const leadStatusTone: Record<LeadStatus, string> = {
  new: 'b-badge-blue',
  contacted: 'b-badge-amber',
  qualified: 'b-badge bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/15',
  disqualified: 'b-badge-gray',
  converted: 'b-badge-green',
};

export const activityTypeLabel: Record<ActivityType, string> = { task: 'To-do', call: 'Call', meeting: 'Meeting', email: 'Email', note: 'Note', log: 'Update' };
export const quoteStatusLabel: Record<QuoteStatus, string> = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', expired: 'Expired' };
export const quoteStatusTone: Record<QuoteStatus, string> = { draft: 'b-badge-gray', sent: 'b-badge-blue', accepted: 'b-badge-green', declined: 'b-badge-red', expired: 'b-badge-amber' };
export const priorityTone: Record<Priority, string> = { low: 'b-badge-gray', normal: 'b-badge-blue', high: 'b-badge-red' };

export const contactName = (c: { first_name: string; last_name: string } | null | undefined) => (c ? `${c.first_name} ${c.last_name}`.trim() : '');

export function money(n: number | null | undefined, cents = false): string {
  return (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: cents ? 2 : 0 });
}

/** "$12.4k" for tight spaces like board column headers. */
export function moneyShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${Math.round(n / 1000)}k`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

/** Totals of a quote: line subtotal, discount, tax and grand total. */
export function quoteTotals(items: Pick<QuoteItem, 'quantity' | 'unit_price' | 'discount_pct'>[], q: Pick<Quote, 'discount_pct' | 'tax_pct' | 'delivery_fee'>) {
  const lines = items.reduce((sum, i) => sum + i.quantity * i.unit_price * (1 - i.discount_pct / 100), 0);
  const discount = lines * (q.discount_pct / 100);
  const taxable = lines - discount;
  const tax = taxable * (q.tax_pct / 100);
  const total = taxable + tax + Number(q.delivery_fee || 0);
  return { lines, discount, tax, total };
}

/** Days since a moment (whole days, never negative). */
export const daysSince = (iso: string, now = Date.now()) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));

/** Replaces {{first_name}}, {{name}}, {{my_name}}, {{deal}} in an email template. */
export function fillTemplate(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? '');
}
