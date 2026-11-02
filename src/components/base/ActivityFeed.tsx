import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import { Avatar, PageHeader } from '@/components/base/ui';
import Select from '@/components/ui/Select';
import { describeActivity, FIELD_LABELS, fmtChangeValue, type ActivityDetails, type Change } from '@/lib/base/activity';
import { db, must } from '@/lib/base/db';
import { listEmployees } from '@/lib/base/queries';
import { fmtDate, fmtTime } from '@/lib/base/time';
import { fullName } from '@/lib/base/types';
import type { AppKey } from '@/lib/portal/apps';

/** A filter group: action prefixes it covers, minus any it hands to a more specific group. */
type Category = { label: string; prefixes: string[]; except?: string[]; tone: string };

const TONE = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  sky: 'bg-sky-50 text-sky-700 ring-sky-600/15',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/15',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/15',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  pink: 'bg-pink-50 text-pink-700 ring-pink-600/15',
  slate: 'bg-slate-100 text-slate-700 ring-slate-600/15',
  teal: 'bg-teal-50 text-teal-700 ring-teal-600/15',
};

/** Workflow and Deliveries each keep their own log; Time gets everything else (incl. sign-ins). */
const WORKFLOW_PREFIXES = ['crm.', 'task.'];
const DELIVERY_PREFIXES = ['delivery.', 'crm.delivery'];

const FEEDS: Record<AppKey, { path: string; description: string; only?: string[]; except?: string[]; categories: Record<string, Category> }> = {
  time: {
    path: '/base/activity',
    description: 'Everything people did in Time — punches, time cards, schedules, time off, team changes and sign-ins.',
    except: [...WORKFLOW_PREFIXES, ...DELIVERY_PREFIXES],
    categories: {
      clock: { label: 'Punches & breaks', prefixes: ['clock.'], tone: TONE.emerald },
      timecard: { label: 'Time cards', prefixes: ['timecard.'], tone: TONE.sky },
      team: { label: 'Team & passwords', prefixes: ['employee.', 'role.', 'department.'], tone: TONE.violet },
      schedule: { label: 'Schedule', prefixes: ['shift.', 'shift_request.', 'schedule.', 'event.', 'availability.'], tone: TONE.indigo },
      leave: { label: 'Time off', prefixes: ['time_off.', 'leave.'], tone: TONE.amber },
      settings: { label: 'Settings', prefixes: ['settings.', 'location.'], tone: TONE.pink },
      auth: { label: 'Sign-ins', prefixes: ['auth.'], tone: TONE.slate },
      exports: { label: 'Downloads & website', prefixes: ['timesheets.', 'team.', 'inquiries.', 'newsletter.', 'report.', 'inquiry.', 'assistant.'], tone: TONE.teal },
    },
  },
  crm: {
    path: '/base/crm/activity',
    description: 'Everything people did in Workflow — leads, deals, customers, quotes, boards and tasks.',
    only: WORKFLOW_PREFIXES,
    except: ['crm.delivery'],
    categories: {
      leads: { label: 'Leads', prefixes: ['crm.lead_'], tone: TONE.emerald },
      deals: { label: 'Deals', prefixes: ['crm.deal_'], tone: TONE.indigo },
      customers: { label: 'Customers & vendors', prefixes: ['crm.contact_', 'crm.company_', 'crm.vendor_'], tone: TONE.violet },
      quotes: { label: 'Quotes & products', prefixes: ['crm.quote_', 'crm.product'], tone: TONE.amber },
      boards: { label: 'Boards & workspace', prefixes: ['crm.board', 'crm.workspace'], tone: TONE.sky },
      tasks: { label: 'Tasks & activities', prefixes: ['task.', 'crm.activity'], tone: TONE.pink },
      settings: { label: 'Settings & exports', prefixes: ['crm.settings', 'crm.automation', 'crm.export'], tone: TONE.slate },
      notes: { label: 'Notes & updates', prefixes: ['crm.update'], tone: TONE.teal },
    },
  },
  deliveries: {
    path: '/base/deliveries/activity',
    description: 'Everything people did in Deliveries — orders, routes, drivers’ stops, trucks and settings.',
    only: DELIVERY_PREFIXES,
    categories: {
      routes: { label: 'Routes & dispatch', prefixes: ['delivery.route'], tone: TONE.indigo },
      trucks: { label: 'Trucks & crews', prefixes: ['delivery.truck'], tone: TONE.sky },
      settings: { label: 'Settings & exports', prefixes: ['delivery.settings', 'delivery.export'], tone: TONE.slate },
      orders: { label: 'Orders & stops', prefixes: ['delivery.', 'crm.delivery'], except: ['delivery.route', 'delivery.truck', 'delivery.settings', 'delivery.export'], tone: TONE.emerald },
    },
  },
};

const PAGE_SIZE = 30;
const like = (prefixes: string[]) => prefixes.map((p) => `action.like.${p}*`).join(',');
const matches = (c: Category, action: string) => c.prefixes.some((p) => action.startsWith(p)) && !c.except?.some((p) => action.startsWith(p));

type AuditRow = { id: number; actor_id: string | null; actor_label: string; action: string; entity: string | null; entity_id: string | null; details: ActivityDetails | null; summary: string | null; created_at: string; ip: string | null };

/** Admin-only activity log for one app (Time, Workflow or Deliveries). Callers check access. */
export default async function ActivityFeed({ app, sp, zone }: { app: AppKey; sp: Record<string, string | string[] | undefined>; zone: string }) {
  const feed = FEEDS[app];
  const categories = feed.categories;
  const categoryOf = (action: string) => Object.values(categories).find((c) => matches(c, action)) ?? Object.values(categories).at(-1)!;
  const who = typeof sp.who === 'string' && /^[0-9a-f-]{36}$/i.test(sp.who) ? sp.who : '';
  const kind = typeof sp.kind === 'string' && sp.kind in categories ? sp.kind : '';
  const page = Math.max(1, Math.min(500, Number(sp.page) || 1));

  let query = db()
    .from('audit_log')
    .select('id, actor_id, actor_label, action, entity, entity_id, details, summary, created_at, ip', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (feed.only) query = query.or(like(feed.only));
  for (const p of feed.except ?? []) query = query.not('action', 'like', `${p}*`);
  if (who) query = query.eq('actor_id', who);
  if (kind) {
    query = query.or(like(categories[kind].prefixes));
    for (const p of categories[kind].except ?? []) query = query.not('action', 'like', `${p}*`);
  }
  const [res, employees] = await Promise.all([query, listEmployees(true)]);
  const rows = must<AuditRow[]>(res, 'load the activity log');
  const total = res.count ?? rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (params: Record<string, string>) => `${feed.path}?${new URLSearchParams({ ...(who ? { who } : {}), ...(kind ? { kind } : {}), ...params }).toString()}`;

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader plain title="Recent activity" description={`${feed.description} Tap View on any row for the details.`} />
      <section className="b-card px-5 py-5 sm:px-7">
        <form className="mb-5 flex flex-wrap items-end gap-3" method="get">
          <label className="block">
            <span className="b-label">Person</span>
            <Select people name="who" defaultValue={who} className="b-input !w-56">
              <option value="">Everyone</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}
            </Select>
          </label>
          <label className="block">
            <span className="b-label">Type</span>
            <Select name="kind" defaultValue={kind} className="b-input !w-56">
              <option value="">All activity</option>
              {Object.entries(categories).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
            </Select>
          </label>
          <button type="submit" className="b-btn-primary">Filter</button>
          <span className="ml-auto text-xs text-muted">{total.toLocaleString()} entr{total === 1 ? 'y' : 'ies'}</span>
        </form>

        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">No activity matches.</p>
        ) : (
          <ul className="divide-y divide-stone/40 overflow-hidden rounded-2xl border border-stone/60">
            {rows.map((a) => {
              const sentence = a.summary ?? describeActivity(a.action, a.actor_label, a.details);
              const cat = categoryOf(a.action);
              const changes: Change[] = Array.isArray(a.details?.changes) ? a.details!.changes : [];
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-surface px-4 py-3.5 transition-colors hover:bg-linen/50 sm:flex-nowrap">
                  <Avatar name={a.actor_label} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.92rem] leading-snug text-ink">{sentence}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ring-1 ring-inset ${cat.tone}`}>{cat.label}</span>
                      {fmtDate(new Date(a.created_at), zone, 'EEE, MMM d')} · {fmtTime(a.created_at, zone)}
                      {changes.length > 0 && <span>· {changes.length} change{changes.length === 1 ? '' : 's'}</span>}
                    </p>
                  </div>
                  <Dialog trigger={<><Eye size={13} /> View</>} triggerClassName="b-btn-ghost b-btn-sm" title="Activity details" description={sentence} wide>
                    <ActivityDetail row={a} zone={zone} sentence={sentence} category={cat.label} />
                  </Dialog>
                </li>
              );
            })}
          </ul>
        )}

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            {page > 1 ? <Link className="b-btn-ghost b-btn-sm" href={href({ page: String(page - 1) })}><ChevronLeft size={14} /> Newer</Link> : <span />}
            <span className="text-muted">Page {page} of {pages}</span>
            {page < pages ? <Link className="b-btn-ghost b-btn-sm" href={href({ page: String(page + 1) })}>Older <ChevronRight size={14} /></Link> : <span />}
          </div>
        )}
      </section>
    </div>
  );
}

const HIDDEN_DETAIL_KEYS = new Set(['changes', 'subject']);
const DETAIL_LABELS: Record<string, string> = {
  place: 'Place',
  inside: 'At a store',
  accuracy: 'GPS accuracy (m)',
  type: 'Type',
  from: 'From',
  to: 'To',
  count: 'How many',
  employee: 'Team member',
  employee_id: 'Team member',
  access_level: 'Access level',
  amount: 'Amount',
  wage_type: 'Wage type',
  year: 'Year',
  paid_days: 'Paid days',
  people: 'People',
  title: 'Title',
  name: 'Name',
  when: 'When',
  date: 'Date',
  clock_in: 'Punch in',
  clock_out: 'Punch out',
  report: 'Report',
  format: 'Format',
  starts_at: 'Starts',
  color: 'Colour',
  work_type: 'Time clock',
  department_id: 'Department',
};

function ActivityDetail({ row, zone, sentence, category }: { row: AuditRow; zone: string; sentence: string; category: string }) {
  const d = row.details ?? {};
  const changes: Change[] = Array.isArray(d.changes) ? d.changes : [];
  const extra = Object.entries(d).filter(([k, v]) => !HIDDEN_DETAIL_KEYS.has(k) && v !== null && v !== undefined && v !== '' && !/^[0-9a-f-]{36}$/i.test(String(v)));
  const facts: [string, ReactNode][] = [
    ['What happened', sentence],
    ['Who', row.actor_label],
    ...(d.subject ? ([['About', String(d.subject)]] as [string, ReactNode][]) : []),
    ['When', `${fmtDate(new Date(row.created_at), zone, 'EEEE, MMMM d, yyyy')} at ${fmtTime(row.created_at, zone)}`],
    ['Type', category],
    ['Device IP', row.ip ?? '—'],
  ];
  return (
    <div className="space-y-5">
      <dl className="divide-y divide-stone/40 overflow-hidden rounded-2xl border border-stone/60 bg-surface text-sm">
        {facts.map(([k, v]) => (
          <div key={k} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[140px_1fr]">
            <dt className="text-muted">{k}</dt>
            <dd className="font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      {changes.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold">What changed</p>
          <div className="overflow-hidden rounded-2xl border border-stone/60">
            <table className="b-table">
              <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.field}>
                    <td className="font-medium">{FIELD_LABELS[c.field] ?? c.field}</td>
                    <td className="text-red-700/80 line-through decoration-red-300">{fmtChangeValue(c.from)}</td>
                    <td className="font-medium text-emerald-700">{fmtChangeValue(c.to)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {extra.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold">More details</p>
          <dl className="grid gap-2 sm:grid-cols-2">
            {extra.map(([k, v]) => (
              <div key={k} className="rounded-xl bg-linen/70 px-3 py-2">
                <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">{DETAIL_LABELS[k] ?? k.replace(/_/g, ' ')}</dt>
                <dd className="text-sm text-ink">{fmtChangeValue(typeof v === 'object' ? JSON.stringify(v) : v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <p className="text-xs text-muted">Activity is recorded automatically and can’t be edited.</p>
    </div>
  );
}
