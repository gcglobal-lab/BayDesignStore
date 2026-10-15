import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Activity, BadgeDollarSign, LayoutGrid, Truck, Workflow, CalendarClock, ChevronLeft, ChevronRight, Clock3, Eye, Info, KeyRound, MapPin, Palmtree, Plus, Tags, Timer } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import PunchMap from '@/components/base/map/PunchMap';
import { BasicInfoPanel, LocationForm, OvertimePanel, PayrollPanel, SchedulePanel, TimeClockPanel, TimeOffPanel } from '@/components/base/SettingsForms';
import { Avatar } from '@/components/base/ui';
import { AppAccessTable } from '@/components/portal/AppAccessForm';
import { describeActivity, FIELD_LABELS, fmtChangeValue, type ActivityDetails, type Change } from '@/lib/base/activity';
import { requireAdmin } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { storePoints } from '@/lib/base/mapPoints';
import { listEmployees, listLocations } from '@/lib/base/queries';
import { getSettings } from '@/lib/base/settings';
import { fmtDate, fmtTime } from '@/lib/base/time';
import { fullName } from '@/lib/base/types';
import Select from '@/components/ui/Select';

export const metadata: Metadata = { title: 'Settings' };

type SectionKey = 'basic' | 'locations' | 'schedule' | 'clock' | 'overtime' | 'payroll' | 'time-off' | 'team' | 'apps' | 'activity';
const NAV: { group: string; items: { key: SectionKey; label: string; icon: typeof Info }[] }[] = [
  { group: 'Location', items: [{ key: 'basic', label: 'Basic info', icon: Info }, { key: 'locations', label: 'Stores & geofences', icon: MapPin }] },
  { group: 'Scheduling', items: [{ key: 'schedule', label: 'Schedule enforcement', icon: CalendarClock }] },
  { group: 'Time tracking', items: [{ key: 'clock', label: 'Time clock options', icon: Clock3 }, { key: 'overtime', label: 'Overtime', icon: Timer }] },
  { group: 'Payroll', items: [{ key: 'payroll', label: 'Payroll settings', icon: BadgeDollarSign }] },
  { group: 'Team management', items: [{ key: 'time-off', label: 'Time off', icon: Palmtree }, { key: 'team', label: 'Roles & passwords', icon: Tags }, { key: 'apps', label: 'App access', icon: LayoutGrid }] },
  { group: 'Security', items: [{ key: 'activity', label: 'Recent activity', icon: Activity }] },
];

/** Activity categories for the filter: action prefixes. */
const CATEGORIES: Record<string, { label: string; prefixes: string[]; tone: string }> = {
  clock: { label: 'Punches & breaks', prefixes: ['clock.'], tone: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15' },
  timecard: { label: 'Time cards', prefixes: ['timecard.'], tone: 'bg-sky-50 text-sky-700 ring-sky-600/15' },
  team: { label: 'Team & passwords', prefixes: ['employee.', 'role.', 'department.'], tone: 'bg-violet-50 text-violet-700 ring-violet-600/15' },
  schedule: { label: 'Schedule', prefixes: ['shift.', 'shift_request.', 'schedule.', 'event.', 'availability.'], tone: 'bg-indigo-50 text-indigo-700 ring-indigo-600/15' },
  leave: { label: 'Time off', prefixes: ['time_off.', 'leave.'], tone: 'bg-amber-50 text-amber-800 ring-amber-600/20' },
  settings: { label: 'Settings', prefixes: ['settings.', 'location.'], tone: 'bg-pink-50 text-pink-700 ring-pink-600/15' },
  auth: { label: 'Sign-ins', prefixes: ['auth.'], tone: 'bg-slate-100 text-slate-700 ring-slate-600/15' },
  crm: { label: 'Workflow', prefixes: ['crm.'], tone: 'bg-violet-50 text-violet-700 ring-violet-600/15' },
  delivery: { label: 'Deliveries', prefixes: ['delivery.'], tone: 'bg-sky-50 text-sky-700 ring-sky-600/15' },
  exports: { label: 'Downloads & website', prefixes: ['timesheets.', 'team.', 'inquiries.', 'newsletter.', 'report.', 'inquiry.', 'assistant.'], tone: 'bg-teal-50 text-teal-700 ring-teal-600/15' },
};
const categoryOf = (action: string) => Object.entries(CATEGORIES).find(([, c]) => c.prefixes.some((p) => action.startsWith(p)))?.[0] ?? 'exports';
const PAGE_SIZE = 30;

export default async function SettingsPage({ searchParams }: PageProps<'/base/settings'>) {
  await requireAdmin();
  const sp = await searchParams;
  const section: SectionKey = NAV.flatMap((g) => g.items).some((i) => i.key === sp.section) ? (sp.section as SectionKey) : 'basic';
  const settings = await getSettings();

  let panel: ReactNode;
  switch (section) {
    case 'basic':
      panel = <BasicInfoPanel settings={settings} />;
      break;
    case 'locations':
      panel = <LocationsPanel />;
      break;
    case 'schedule':
      panel = <SchedulePanel settings={settings} />;
      break;
    case 'clock':
      panel = <TimeClockPanel settings={settings} />;
      break;
    case 'overtime':
      panel = <OvertimePanel settings={settings} />;
      break;
    case 'payroll':
      panel = <PayrollPanel settings={settings} />;
      break;
    case 'time-off':
      panel = <TimeOffPanel settings={settings} />;
      break;
    case 'team':
      panel = <TeamPanel />;
      break;
    case 'apps':
      panel = <AppAccessPanel />;
      break;
    case 'activity':
      panel = <ActivityPanel sp={sp} zone={settings.timezone} />;
      break;
  }

  return (
    <div className="mx-auto max-w-[1200px]">
      <h1 className="mb-6 text-[2rem] font-semibold tracking-tight text-ink">Settings</h1>
      <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-6 lg:self-start">
          <div className="flex gap-4 overflow-x-auto pb-2 lg:block lg:space-y-5 lg:overflow-visible lg:pb-0">
            {NAV.map((g) => (
              <div key={g.group} className="flex-none">
                <p className="mb-1.5 px-3 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-ink/80">{g.group}</p>
                <ul className="flex gap-1 lg:block lg:space-y-0.5">
                  {g.items.map((i) => {
                    const on = i.key === section;
                    return (
                      <li key={i.key}>
                        <Link
                          href={`/base/settings?section=${i.key}`}
                          aria-current={on ? 'page' : undefined}
                          className={`flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition-colors ${on ? 'bg-white font-medium text-brass-dark shadow-sm ring-1 ring-stone/60' : 'text-ink/80 hover:bg-white/70'}`}
                        >
                          <i.icon size={15} className={on ? 'text-brass' : 'text-muted'} />
                          {i.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>
        <div className="min-w-0">{panel}</div>
      </div>
    </div>
  );
}

function PanelShell({ title, description, actions, children }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="b-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone/50 bg-gradient-to-r from-white to-linen/60 px-5 py-5 sm:px-7">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">{title}</h2>
          {description && <p className="mt-1 max-w-xl text-sm text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="px-5 py-5 sm:px-7">{children}</div>
    </section>
  );
}

/** Who can open Workflow (CRM) and Deliveries. Time is for everyone; admins have everything. */
async function AppAccessPanel() {
  const people = (await listEmployees()).filter((e) => e.status !== 'terminated');
  const levelRank = { admin: 0, manager: 1, employee: 2 } as const;
  people.sort((a, b) => levelRank[a.access_level] - levelRank[b.access_level] || fullName(a).localeCompare(fullName(b)));
  const others = people.filter((e) => e.access_level !== 'admin');
  return (
    <PanelShell title="App access" description={<>Everyone can use <b>Time</b>. You decide, person by person, who can also open <b>Workflow</b> and <b>Deliveries</b>. Click a button — it saves straight away.</>}>
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-linen/70 px-4 py-3 text-sm">
          <p className="mb-1 flex items-center gap-1.5 font-semibold"><Workflow size={15} /> Workflow — {others.filter((e) => e.crm_role !== 'none').length} people</p>
          <p className="text-xs text-muted"><b>User</b>: works their own leads and deals, sees everyone’s. <b>Manager</b>: also deletes and changes pipelines, automations and settings.</p>
        </div>
        <div className="rounded-2xl bg-linen/70 px-4 py-3 text-sm">
          <p className="mb-1 flex items-center gap-1.5 font-semibold"><Truck size={15} /> Deliveries — {others.filter((e) => e.deliveries_role !== 'none').length} people</p>
          <p className="text-xs text-muted"><b>Driver</b>: sees only their own route on their phone. <b>Dispatcher</b>: orders, dispatch board, trucks and reports.</p>
        </div>
      </div>
      <AppAccessTable
        people={people.map((e) => ({ id: e.id, name: fullName(e), level: e.access_level, role: e.roles[0]?.name ?? null, crm: e.crm_role, deliveries: e.deliveries_role }))}
      />
    </PanelShell>
  );
}

async function LocationsPanel() {
  const locations = await listLocations();
  return (
    <PanelShell
      title="Stores & geofences"
      description="Each store’s address and the circle punch-ins are checked against. Punch-ins outside are still allowed and record the street address."
      actions={
        <Dialog trigger={<><Plus size={14} /> Add a location</>} triggerClassName="b-btn-ghost b-btn-sm" title="Add a location" wide>
          <LocationForm />
        </Dialog>
      }
    >
      {locations.length > 0 && <PunchMap points={[]} stores={storePoints(locations)} height={300} />}
      <div className="mt-6 space-y-8">
        {locations.map((l) => (
          <div key={l.id} className="rounded-2xl border border-stone/60 p-4 sm:p-5">
            <p className="mb-4 flex items-center gap-2 font-semibold">
              <MapPin size={16} className={l.latitude != null ? 'text-emerald-600' : 'text-amber-600'} /> {l.name}
              <span className="text-xs font-normal text-muted">{l.latitude != null ? `Geofence on · ${l.geofence_radius_m} m` : 'No coordinates yet'}</span>
            </p>
            <LocationForm location={l} />
          </div>
        ))}
        {locations.length === 0 && <p className="text-sm text-muted">No locations yet.</p>}
      </div>
    </PanelShell>
  );
}

async function TeamPanel() {
  const employees = await listEmployees();
  const missing = employees.filter((e) => !e.has_password).length;
  return (
    <PanelShell title="Roles & passwords" description="Where to manage the team’s roles and sign-in details.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/base/team/roles" className="group rounded-2xl border border-stone/60 p-5 transition-colors hover:border-violet-300 hover:bg-violet-50/40">
          <Tags size={20} className="text-brass" />
          <p className="mt-3 font-semibold">Departments & roles</p>
          <p className="mt-1 text-sm text-muted">Create roles, choose their colours and which time clock (showroom, designer, warehouse, driver) they get.</p>
        </Link>
        <Link href="/base/team" className="group rounded-2xl border border-stone/60 p-5 transition-colors hover:border-violet-300 hover:bg-violet-50/40">
          <KeyRound size={20} className="text-brass" />
          <p className="mt-3 font-semibold">Passwords</p>
          <p className="mt-1 text-sm text-muted">
            Only admins create and change passwords. Team ▸ Roster shows every login ID and password; click a name to change it.
            {missing > 0 && <span className="mt-2 block font-medium text-amber-700">{missing} team member{missing === 1 ? '' : 's'} have no password yet.</span>}
          </p>
        </Link>
      </div>
    </PanelShell>
  );
}

type AuditRow = { id: number; actor_id: string | null; actor_label: string; action: string; entity: string | null; entity_id: string | null; details: ActivityDetails | null; summary: string | null; created_at: string; ip: string | null };

async function ActivityPanel({ sp, zone }: { sp: Record<string, string | string[] | undefined>; zone: string }) {
  const who = typeof sp.who === 'string' && /^[0-9a-f-]{36}$/i.test(sp.who) ? sp.who : '';
  const kind = typeof sp.kind === 'string' && sp.kind in CATEGORIES ? sp.kind : '';
  const page = Math.max(1, Math.min(500, Number(sp.page) || 1));

  let query = db()
    .from('audit_log')
    .select('id, actor_id, actor_label, action, entity, entity_id, details, summary, created_at, ip', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (who) query = query.eq('actor_id', who);
  if (kind) query = query.or(CATEGORIES[kind].prefixes.map((p) => `action.like.${p}*`).join(','));
  const [res, employees] = await Promise.all([query, listEmployees(true)]);
  const rows = must<AuditRow[]>(res, 'load the activity log');
  const total = res.count ?? rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (params: Record<string, string>) => `/base/settings?${new URLSearchParams({ section: 'activity', ...(who ? { who } : {}), ...(kind ? { kind } : {}), ...params }).toString()}`;

  return (
    <PanelShell title="Recent activity" description="Everything people did in the Employee Portal — who, what and when. Tap View on any row for the details.">
      <form className="mb-5 flex flex-wrap items-end gap-3" method="get">
        <input type="hidden" name="section" value="activity" />
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
            {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
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
            const cat = CATEGORIES[categoryOf(a.action)];
            const changes: Change[] = Array.isArray(a.details?.changes) ? a.details!.changes : [];
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-white px-4 py-3.5 transition-colors hover:bg-linen/50 sm:flex-nowrap">
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
    </PanelShell>
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
      <dl className="divide-y divide-stone/40 overflow-hidden rounded-2xl border border-stone/60 bg-white text-sm">
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
