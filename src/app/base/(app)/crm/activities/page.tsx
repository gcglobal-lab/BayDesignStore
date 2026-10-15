import type { Metadata } from 'next';
import Link from 'next/link';
import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns';
import { tz } from '@date-fns/tz';
import { CalendarDays, ChevronLeft, ChevronRight, List, ListTodo, Plus } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import { Card, EmptyState, PageHeader } from '@/components/base/ui';
import ActivityComposer from '@/components/crm/ActivityComposer';
import { ActivityIcon, DoneToggle, SnoozeButtons } from '@/components/crm/Timeline';
import { requireCrm } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { addDaysYmd, dayRangeIso, fmtDate, fmtTime, todayYmd, toYmd, weekDays, weekStartYmd, zonedMidnight } from '@/lib/base/time';
import { getCrmPeople } from '@/lib/crm/data';
import { activityTypeLabel, priorityTone, type Activity } from '@/lib/crm/types';
import Select from '@/components/ui/Select';

export const metadata: Metadata = { title: 'Activities' };

const TABS = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Next 14 days' },
  { key: 'later', label: 'Later' },
  { key: 'done', label: 'Done' },
] as const;
type Tab = (typeof TABS)[number]['key'];

/** Where an activity belongs ("Smith sofa", "Jane Doe"), with a link. */
async function contextFor(items: Activity[]) {
  const ids = (k: 'deal_id' | 'contact_id' | 'lead_id' | 'company_id') => [...new Set(items.map((a) => a[k]).filter((x): x is string => Boolean(x)))].slice(0, 500);
  const [deals, contacts, leads, companies] = await Promise.all([
    ids('deal_id').length ? db().from('crm_deals').select('id, title').in('id', ids('deal_id')) : Promise.resolve({ data: [] }),
    ids('contact_id').length ? db().from('crm_contacts').select('id, first_name, last_name').in('id', ids('contact_id')) : Promise.resolve({ data: [] }),
    ids('lead_id').length ? db().from('crm_leads').select('id, name').in('id', ids('lead_id')) : Promise.resolve({ data: [] }),
    ids('company_id').length ? db().from('crm_companies').select('id, name').in('id', ids('company_id')) : Promise.resolve({ data: [] }),
  ]);
  const d = new Map((deals.data ?? []).map((r: { id: string; title: string }) => [r.id, r.title]));
  const c = new Map((contacts.data ?? []).map((r: { id: string; first_name: string; last_name: string }) => [r.id, `${r.first_name} ${r.last_name}`.trim()]));
  const l = new Map((leads.data ?? []).map((r: { id: string; name: string }) => [r.id, r.name]));
  const co = new Map((companies.data ?? []).map((r: { id: string; name: string }) => [r.id, r.name]));
  return (a: Activity): { href: string; label: string } | null => {
    if (a.deal_id && d.has(a.deal_id)) return { href: `/base/crm/deals/${a.deal_id}`, label: d.get(a.deal_id)! };
    if (a.lead_id && l.has(a.lead_id)) return { href: `/base/crm/leads/${a.lead_id}`, label: `Lead · ${l.get(a.lead_id)}` };
    if (a.contact_id && c.has(a.contact_id)) return { href: `/base/crm/contacts/${a.contact_id}`, label: c.get(a.contact_id)! };
    if (a.company_id && co.has(a.company_id)) return { href: `/base/crm/companies/${a.company_id}`, label: co.get(a.company_id)! };
    return null;
  };
}

export default async function ActivitiesPage({ searchParams }: PageProps<'/base/crm/activities'>) {
  const viewer = await requireCrm();
  const sp = await searchParams;
  const [people, settings] = await Promise.all([getCrmPeople(), getSettings()]);
  const zone = settings.timezone;
  const today = todayYmd(zone);
  const view = sp.view === 'calendar' ? 'calendar' : 'list';
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : 'today';
  const who = typeof sp.who === 'string' ? sp.who : viewer.employeeId ? 'me' : 'all';
  const [todayStart, todayEnd] = dayRangeIso(today, zone);
  const in14 = dayRangeIso(addDaysYmd(today, 14, zone), zone)[0];

  const base = (head = false) => {
    let q = db().from('crm_activities').select(head ? 'id' : '*', head ? { count: 'exact', head: true } : undefined).in('type', ['task', 'call', 'meeting', 'email']);
    if (who === 'me' && viewer.employeeId) q = q.eq('assignee_id', viewer.employeeId);
    else if (/^[0-9a-f-]{36}$/.test(who)) q = q.eq('assignee_id', who);
    return q;
  };

  // Counts for the tabs.
  const [overdueN, todayN, upcomingN] = await Promise.all([
    base(true).eq('done', false).lt('due_at', todayStart).then((r) => r.count ?? 0),
    base(true).eq('done', false).gte('due_at', todayStart).lt('due_at', todayEnd).then((r) => r.count ?? 0),
    base(true).eq('done', false).gte('due_at', todayEnd).lt('due_at', in14).then((r) => r.count ?? 0),
  ]);

  let items: Activity[] = [];
  let month = '';
  if (view === 'calendar') {
    month = typeof sp.month === 'string' && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
    const first = zonedMidnight(`${month}-01`, zone);
    const from = weekStartYmd(`${month}-01`, zone, settings.week_start);
    const to = addDaysYmd(toYmd(endOfMonth(first, { in: tz(zone) }), zone), 7, zone);
    items = must<Activity[]>(await base().gte('due_at', zonedMidnight(from, zone).toISOString()).lt('due_at', zonedMidnight(to, zone).toISOString()).order('due_at').limit(1000), 'load activities');
  } else {
    let q = base();
    if (tab === 'overdue') q = q.eq('done', false).lt('due_at', todayStart).order('due_at');
    else if (tab === 'today') q = q.eq('done', false).gte('due_at', todayStart).lt('due_at', todayEnd).order('due_at');
    else if (tab === 'upcoming') q = q.eq('done', false).gte('due_at', todayEnd).lt('due_at', in14).order('due_at');
    else if (tab === 'later') q = q.eq('done', false).or(`due_at.gte."${in14}",due_at.is.null`).order('due_at');
    else q = q.eq('done', true).order('done_at', { ascending: false });
    items = must<Activity[]>(await q.limit(300), 'load activities');
  }
  const ctx = await contextFor(items);
  const now = Date.now();
  const href = (patch: Record<string, string>) => `/base/crm/activities?${new URLSearchParams({ view, tab, who, ...(month ? { month } : {}), ...patch })}`;
  const counts: Partial<Record<Tab, number>> = { overdue: overdueN, today: todayN, upcoming: upcomingN };

  return (
    <>
      <PageHeader
        plain
        title="Activities"
        description="Calls, meetings, emails and to-dos — yours or the team’s. Tick them off as you go; the board shows each deal’s next step."
        actions={
          <Dialog trigger={<><Plus size={15} /> New activity</>} triggerClassName="b-btn-brass" title="New activity" wide>
            <ActivityComposer links={{}} owners={people.owners} me={{ id: viewer.employeeId, name: viewer.name }} today={today} />
          </Dialog>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="b-segment">
          <Link href={href({ view: 'list' })} aria-current={view === 'list' ? 'page' : undefined} className="inline-flex items-center gap-1.5"><List size={14} /> List</Link>
          <Link href={href({ view: 'calendar' })} aria-current={view === 'calendar' ? 'page' : undefined} className="inline-flex items-center gap-1.5"><CalendarDays size={14} /> Calendar</Link>
        </div>
        {view === 'list' && (
          <div className="b-segment flex-wrap">
            {TABS.map((t) => (
              <Link key={t.key} href={href({ tab: t.key })} aria-current={tab === t.key ? 'page' : undefined}>
                {t.label}
                {counts[t.key] !== undefined && <span className={`ml-1.5 rounded-full px-1.5 py-px text-[0.68rem] ${t.key === 'overdue' && counts.overdue ? 'bg-red-500 text-white' : 'bg-sand text-muted'}`}>{counts[t.key]}</span>}
              </Link>
            ))}
          </div>
        )}
        <form action="/base/crm/activities" className="ml-auto flex items-center gap-2">
          <input type="hidden" name="view" value={view} />
          <input type="hidden" name="tab" value={tab} />
          {month && <input type="hidden" name="month" value={month} />}
          <Select people name="who" defaultValue={who} className="b-input !w-auto !py-2">
            {viewer.employeeId && <option value="me">Mine</option>}
            <option value="all">Everyone</option>
            {people.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
          <button className="b-btn-ghost" type="submit">Show</button>
        </form>
      </div>

      {view === 'calendar' ? (
        <Card
          title={fmtDate(`${month}-01`, zone, 'MMMM yyyy')}
          actions={
            <span className="flex gap-1">
              <Link className="b-btn-ghost b-btn-sm" href={href({ month: format(addMonths(zonedMidnight(`${month}-01`, zone), -1), 'yyyy-MM') })}><ChevronLeft size={14} /></Link>
              <Link className="b-btn-ghost b-btn-sm" href={href({ month: today.slice(0, 7) })}>Today</Link>
              <Link className="b-btn-ghost b-btn-sm" href={href({ month: format(addMonths(zonedMidnight(`${month}-01`, zone), 1), 'yyyy-MM') })}><ChevronRight size={14} /></Link>
            </span>
          }
          pad={false}
        >
          <MonthGrid month={month} zone={zone} weekStart={settings.week_start} items={items} today={today} ctx={ctx} />
        </Card>
      ) : items.length === 0 ? (
        <Card><EmptyState icon={<ListTodo size={20} />} title={tab === 'overdue' ? 'Nothing overdue. 🎉' : tab === 'today' ? 'Nothing due today.' : 'Nothing here.'} /></Card>
      ) : (
        <Card pad={false}>
          <ul className="divide-y divide-stone/50">
            {items.map((a) => {
              const overdue = !a.done && a.due_at && new Date(a.due_at).getTime() < now;
              const c = ctx(a);
              return (
                <li key={a.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                  <DoneToggle a={a} />
                  <ActivityIcon type={a.type} size={13} />
                  <div className="min-w-0 flex-1">
                    <p className={`flex flex-wrap items-center gap-2 text-sm font-medium ${a.done ? 'text-muted line-through' : ''}`}>
                      {a.subject}
                      <span className="b-badge-gray">{activityTypeLabel[a.type]}</span>
                      {a.priority !== 'normal' && <span className={`${priorityTone[a.priority]} capitalize`}>{a.priority}</span>}
                    </p>
                    <p className={`mt-0.5 flex flex-wrap gap-x-3 text-xs ${overdue ? 'text-red-700' : 'text-muted'}`}>
                      <span>{a.due_at ? `${fmtDate(new Date(a.due_at), zone, 'EEE, MMM d')} · ${fmtTime(a.due_at, zone)}` : 'No date'}</span>
                      {c && <Link href={c.href} className="font-medium text-brass-dark hover:underline">{c.label}</Link>}
                      {who !== 'me' && a.assignee_id && <span>{people.names.get(a.assignee_id)}</span>}
                    </p>
                    {a.body && <p className="mt-1 line-clamp-2 text-sm text-ink/80">{a.body}</p>}
                  </div>
                  {!a.done && <SnoozeButtons id={a.id} />}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}

function MonthGrid({ month, zone, weekStart, items, today, ctx }: { month: string; zone: string; weekStart: number; items: Activity[]; today: string; ctx: (a: Activity) => { href: string; label: string } | null }) {
  const first = weekStartYmd(`${month}-01`, zone, weekStart);
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const start = addDaysYmd(first, w * 7, zone);
    if (w > 3 && start.slice(0, 7) !== month) break;
    weeks.push(weekDays(start, zone));
  }
  const byDay = new Map<string, Activity[]>();
  for (const a of items) {
    if (!a.due_at) continue;
    const k = toYmd(new Date(a.due_at), zone);
    byDay.set(k, [...(byDay.get(k) ?? []), a]);
  }
  const monthStart = startOfMonth(zonedMidnight(`${month}-01`, zone));
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px] grid-cols-7 border-t border-stone/50">
        {weeks[0].map((d) => <div key={d} className="border-b border-stone/50 bg-linen/60 px-2 py-1.5 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">{fmtDate(d, zone, 'EEE')}</div>)}
        {weeks.flat().map((d) => {
          const list = byDay.get(d) ?? [];
          const other = d.slice(0, 7) !== format(monthStart, 'yyyy-MM');
          return (
            <div key={d} className={`min-h-[104px] border-b border-r border-stone/40 p-1.5 ${other ? 'bg-linen/40' : ''}`}>
              <p className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${d === today ? 'bg-brass font-semibold text-white' : other ? 'text-muted/60' : 'text-muted'}`}>{Number(d.slice(8))}</p>
              <ul className="space-y-1">
                {list.slice(0, 4).map((a) => {
                  const c = ctx(a);
                  return (
                    <li key={a.id} title={`${a.subject}${c ? ` — ${c.label}` : ''}`}>
                      <Link href={c?.href ?? '/base/crm/activities'} className={`block truncate rounded-md px-1.5 py-0.5 text-[0.68rem] ${a.done ? 'bg-sand/60 text-muted line-through' : 'bg-brass/15 font-medium text-brass-dark'}`}>
                        {fmtTime(a.due_at!, zone)} {a.subject}
                      </Link>
                    </li>
                  );
                })}
                {list.length > 4 && <li className="px-1.5 text-[0.65rem] text-muted">+{list.length - 4} more</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
