import type { Metadata } from 'next';
import Link from 'next/link';
import { AlarmClock, ArrowRight, BarChart3, Building2, CalendarClock, Contact, FileText, Inbox, KanbanSquare, LayoutGrid, ListTodo, Package, Percent, Settings, Target, TrendingUp, Trophy, Zap } from 'lucide-react';
import AutoRefresh from '@/components/base/AutoRefresh';
import { Card, EmptyState } from '@/components/base/ui';
import { ActivityIcon, DoneToggle } from '@/components/crm/Timeline';
import { requireCrm } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { addDaysYmd, dayRangeIso, fmtDate, fmtTime, todayYmd, zonedMidnight } from '@/lib/base/time';
import { getCrmPeople, getCrmSetup } from '@/lib/crm/data';
import { daysSince, money, moneyShort, type Activity, type Deal, type Lead } from '@/lib/crm/types';

export const metadata: Metadata = { title: 'Workflow' };

function Kpi({ icon: Icon, label, value, hint, href, tone }: { icon: typeof Target; label: string; value: string; hint?: string; href?: string; tone: string }) {
  const body = (
    <div className="b-card flex h-full items-start gap-3 p-4 transition-shadow hover:shadow-lg">
      <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${tone}`}><Icon size={19} /></span>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="truncate text-2xl font-semibold tracking-tight">{value}</p>
        {hint && <p className="truncate text-[0.7rem] text-muted">{hint}</p>}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function CrmDashboard({ searchParams }: PageProps<'/base/crm'>) {
  const viewer = await requireCrm();
  const sp = await searchParams;
  const scope = sp.scope === 'me' || (!sp.scope && viewer.crm !== 'manager' && viewer.employeeId) ? 'me' : 'team';
  const mine = scope === 'me' && viewer.employeeId ? viewer.employeeId : null;
  const [{ pipelines }, people, settings] = await Promise.all([getCrmSetup(), getCrmPeople(), getSettings()]);
  const zone = settings.timezone;
  const today = todayYmd(zone);
  const monthStart = zonedMidnight(`${today.slice(0, 7)}-01`, zone).toISOString();
  const [, todayEnd] = dayRangeIso(today, zone);
  const since90 = zonedMidnight(addDaysYmd(today, -90, zone), zone).toISOString();
  const since180 = zonedMidnight(`${addDaysYmd(today, -160, zone).slice(0, 7)}-01`, zone).toISOString();
  const weekAgo = zonedMidnight(addDaysYmd(today, -7, zone), zone).toISOString();
  const in30 = addDaysYmd(today, 30, zone);

  const [openRes, closedRes, leadsRes, newLeadsCount, agendaRes, feedRes] = await Promise.all([
    (mine ? db().from('crm_deals').select('id, title, value, stage_id, pipeline_id, expected_close, stage_changed_at, owner_id').eq('status', 'open').eq('owner_id', mine) : db().from('crm_deals').select('id, title, value, stage_id, pipeline_id, expected_close, stage_changed_at, owner_id').eq('status', 'open')).limit(2000),
    (mine ? db().from('crm_deals').select('id, value, status, closed_at, owner_id').neq('status', 'open').gte('closed_at', since180).eq('owner_id', mine) : db().from('crm_deals').select('id, value, status, closed_at, owner_id').neq('status', 'open').gte('closed_at', since180)).limit(5000),
    db().from('crm_leads').select('id, name, title, source, created_at, owner_id').eq('status', 'new').order('created_at', { ascending: false }).limit(6),
    db().from('crm_leads').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
    (() => {
      let q = db().from('crm_activities').select('*').eq('done', false).in('type', ['task', 'call', 'meeting', 'email']).lt('due_at', todayEnd).order('due_at').limit(12);
      if (mine) q = q.eq('assignee_id', mine);
      return q;
    })(),
    db().from('crm_activities').select('id, subject, author_name, created_at, deal_id, lead_id, contact_id').eq('type', 'log').order('created_at', { ascending: false }).limit(10),
  ]);
  const open = must<Pick<Deal, 'id' | 'title' | 'value' | 'stage_id' | 'pipeline_id' | 'expected_close' | 'stage_changed_at' | 'owner_id'>[]>(openRes, 'load deals');
  const closed = must<Pick<Deal, 'id' | 'value' | 'status' | 'closed_at' | 'owner_id'>[]>(closedRes, 'load closed deals');
  const leads = must<Pick<Lead, 'id' | 'name' | 'title' | 'source' | 'created_at' | 'owner_id'>[]>(leadsRes, 'load leads');
  const agenda = must<Activity[]>(agendaRes, 'load activities');
  const feed = must<{ id: string; subject: string; author_name: string | null; created_at: string; deal_id: string | null; lead_id: string | null; contact_id: string | null }[]>(feedRes, 'load recent activity');

  const stages = new Map(pipelines.flatMap((p) => p.stages.map((s) => [s.id, s] as const)));
  const pipelineValue = open.reduce((s, d) => s + Number(d.value), 0);
  const weighted = open.reduce((s, d) => s + (Number(d.value) * (stages.get(d.stage_id)?.probability ?? 0)) / 100, 0);
  const wonMonth = closed.filter((d) => d.status === 'won' && d.closed_at! >= monthStart);
  const recent = closed.filter((d) => d.closed_at! >= since90);
  const winRate = recent.length ? Math.round((recent.filter((d) => d.status === 'won').length / recent.length) * 100) : null;
  const closingSoon = open.filter((d) => d.expected_close && d.expected_close <= in30).sort((a, b) => a.expected_close!.localeCompare(b.expected_close!)).slice(0, 6);
  const rotting = open.filter((d) => {
    const st = stages.get(d.stage_id);
    return st?.rot_days && daysSince(d.stage_changed_at) > st.rot_days;
  });

  // Won per month, last 6 months.
  const months = Array.from({ length: 6 }, (_, i) => addDaysYmd(`${today.slice(0, 7)}-15`, -30 * (5 - i), zone).slice(0, 7));
  const wonBy = new Map(months.map((m) => [m, 0]));
  for (const d of closed) if (d.status === 'won' && d.closed_at) {
    const m = fmtDate(new Date(d.closed_at), zone, 'yyyy-MM');
    if (wonBy.has(m)) wonBy.set(m, wonBy.get(m)! + Number(d.value));
  }
  const maxWon = Math.max(1, ...wonBy.values());
  const def = pipelines.find((p) => p.is_default) ?? pipelines[0];
  const byStage = def ? def.stages.map((s) => ({ s, deals: open.filter((d) => d.stage_id === s.id) })) : [];
  const maxStage = Math.max(1, ...byStage.map((x) => x.deals.reduce((t, d) => t + Number(d.value), 0)));
  const now = Date.now();
  const hour = Number(fmtDate(new Date(), zone, 'H'));

  return (
    <>
      <AutoRefresh seconds={60} />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="b-eyebrow">Workflow</p>
          <h1 className="text-[1.9rem] font-semibold leading-tight tracking-tight sm:text-[2.1rem]">Good {hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, {viewer.firstName}</h1>
          <p className="mt-1 text-sm text-muted">{scope === 'me' ? 'Your pipeline, tasks and wins.' : 'The whole team’s pipeline, tasks and wins.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {viewer.employeeId && (
            <div className="b-segment">
              <Link href="/base/crm?scope=me" aria-current={scope === 'me' ? 'page' : undefined}>Me</Link>
              <Link href="/base/crm?scope=team" aria-current={scope === 'team' ? 'page' : undefined}>Team</Link>
            </div>
          )}
          <Link href="/base/crm/deals" className="b-btn-brass"><KanbanSquare size={15} /> Pipeline</Link>
        </div>
      </div>

      <nav aria-label="Sales tools" className="mb-6 rounded-xl border border-stone/70 bg-surface p-2">
        <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-12">
          {[
            { href: '/base/crm/workspace', label: 'Workspace', icon: LayoutGrid, tone: '#4A154B' },
            { href: '/base/crm/tasks', label: 'Team Tasks', icon: ListTodo, tone: '#007A5A' },
            { href: '/base/crm/leads', label: 'Leads', icon: Inbox, tone: '#E01E5A', badge: newLeadsCount.count ?? 0 },
            { href: '/base/crm/deals', label: 'Deals', icon: KanbanSquare, tone: '#1264A3' },
            { href: '/base/crm/contacts', label: 'Contacts', icon: Contact, tone: '#36C5F0' },
            { href: '/base/crm/companies', label: 'Companies', icon: Building2, tone: '#2EB67D' },
            { href: '/base/crm/activities', label: 'Activities', icon: CalendarClock, tone: '#ECB22E' },
            { href: '/base/crm/quotes', label: 'Quotes', icon: FileText, tone: '#A25DDC' },
            { href: '/base/crm/products', label: 'Products', icon: Package, tone: '#FF642E' },
            { href: '/base/crm/reports', label: 'Reports', icon: BarChart3, tone: '#0086C0' },
            ...(viewer.crm === 'manager' ? [{ href: '/base/crm/automations', label: 'Automations', icon: Zap, tone: '#FDAB3D' }] : []),
            { href: '/base/crm/settings', label: 'Settings', icon: Settings, tone: '#616061' },
          ].map((t) => (
            <li key={t.href}>
              <Link href={t.href} className="group relative flex flex-col items-center gap-1.5 rounded-lg px-1 py-3 text-center text-xs font-medium text-ink/80 transition-colors hover:bg-linen hover:text-ink">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg text-white shadow-sm transition-transform group-hover:-translate-y-0.5" style={{ background: t.tone }}><t.icon size={17} /></span>
                {t.label}
                {'badge' in t && t.badge ? <span className="absolute right-2 top-1.5 rounded-full bg-[#E01E5A] px-1.5 text-[0.62rem] font-bold leading-4 text-white">{t.badge}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={Target} label="Open pipeline" value={moneyShort(pipelineValue)} hint={`${open.length} deals`} href="/base/crm/deals" tone="bg-indigo-500/15 text-brass-dark" />
        <Kpi icon={TrendingUp} label="Weighted forecast" value={moneyShort(weighted)} hint="value × stage probability" tone="bg-violet-500/15 text-violet-700" />
        <Kpi icon={Trophy} label="Won this month" value={moneyShort(wonMonth.reduce((s, d) => s + Number(d.value), 0))} hint={`${wonMonth.length} deals`} href="/base/crm/deals?view=list&status=won" tone="bg-emerald-500/15 text-emerald-700" />
        <Kpi icon={Percent} label="Win rate (90 days)" value={winRate === null ? '—' : `${winRate}%`} hint={`${recent.length} closed`} tone="bg-sky-500/15 text-sky-700" />
        <Kpi icon={Inbox} label="New leads (7 days)" value={String(newLeadsCount.count ?? 0)} hint={`${leads.length ? 'some waiting' : 'inbox clear'}`} href="/base/crm/leads" tone="bg-pink-500/15 text-pink-700" />
        <Kpi icon={AlarmClock} label="Idle deals" value={String(rotting.length)} hint="no movement for a while" href="/base/crm/deals" tone="bg-amber-500/15 text-amber-700" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Today & overdue" className="xl:col-span-1" actions={<Link href="/base/crm/activities" className="text-xs font-semibold text-brass-dark">All activities →</Link>} pad={false}>
          {agenda.length === 0 ? (
            <EmptyState icon={<CalendarClock size={20} />} title="Nothing due — nice work." />
          ) : (
            <ul className="divide-y divide-stone/50">
              {agenda.map((a) => {
                const overdue = a.due_at && new Date(a.due_at).getTime() < now;
                const href = a.deal_id ? `/base/crm/deals/${a.deal_id}` : a.lead_id ? `/base/crm/leads/${a.lead_id}` : a.contact_id ? `/base/crm/contacts/${a.contact_id}` : '/base/crm/activities';
                return (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                    <DoneToggle a={a} />
                    <ActivityIcon type={a.type} size={12} />
                    <Link href={href} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium hover:text-brass-dark">{a.subject}</p>
                      <p className={`text-[0.7rem] ${overdue ? 'text-red-700' : 'text-muted'}`}>{a.due_at ? `${fmtDate(new Date(a.due_at), zone, 'MMM d')} · ${fmtTime(a.due_at, zone)}` : ''}{scope === 'team' && a.assignee_id ? ` · ${people.names.get(a.assignee_id)}` : ''}</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title={`Pipeline · ${def?.name ?? ''}`} className="xl:col-span-2">
          {byStage.length === 0 ? (
            <p className="text-sm text-muted">No pipeline yet.</p>
          ) : (
            <ul className="space-y-3">
              {byStage.map(({ s, deals }) => {
                const value = deals.reduce((t, d) => t + Number(d.value), 0);
                return (
                  <li key={s.id}>
                    <Link href={`/base/crm/deals?pipeline=${def.id}`} className="block">
                      <div className="mb-1 flex items-baseline justify-between text-sm">
                        <span className="font-medium">{s.name} <span className="text-xs text-muted">· {deals.length}</span></span>
                        <span className="font-semibold">{money(value)}</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-sand">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(2, (value / maxStage) * 100)}%`, background: s.color }} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="New leads" actions={<Link href="/base/crm/leads" className="text-xs font-semibold text-brass-dark">Inbox →</Link>} pad={false}>
          {leads.length === 0 ? (
            <EmptyState icon={<Inbox size={20} />} title="No new leads." />
          ) : (
            <ul className="divide-y divide-stone/50">
              {leads.map((l) => (
                <li key={l.id}>
                  <Link href={`/base/crm/leads/${l.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-linen/60">
                    <span className="h-2 w-2 flex-none rounded-full bg-brass" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{l.name}</span>
                      <span className="block truncate text-[0.7rem] text-muted">{l.source} · {fmtDate(new Date(l.created_at), zone, 'MMM d')} {fmtTime(l.created_at, zone)}</span>
                    </span>
                    <ArrowRight size={14} className="text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Won by month">
          <div className="flex h-40 items-end gap-2">
            {months.map((m) => {
              const v = wonBy.get(m)!;
              return (
                <div key={m} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[0.62rem] font-semibold text-muted">{v ? moneyShort(v) : ''}</span>
                  <div className="w-full rounded-t-lg bg-gradient-to-t from-brass to-brass-light" style={{ height: `${Math.max(3, (v / maxWon) * 100)}%` }} />
                  <span className="text-[0.65rem] text-muted">{fmtDate(`${m}-01`, zone, 'MMM')}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Closing in the next 30 days" pad={false}>
          {closingSoon.length === 0 ? (
            <EmptyState title="No expected closes soon." />
          ) : (
            <ul className="divide-y divide-stone/50">
              {closingSoon.map((d) => (
                <li key={d.id}>
                  <Link href={`/base/crm/deals/${d.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-linen/60">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{d.title}</span>
                      <span className={`block text-[0.7rem] ${d.expected_close! < today ? 'text-red-700' : 'text-muted'}`}>{fmtDate(d.expected_close!, zone, 'EEE, MMM d')} · {stages.get(d.stage_id)?.name}</span>
                    </span>
                    <span className="text-sm font-semibold">{moneyShort(Number(d.value))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent activity" className="xl:col-span-3" pad={false}>
          {feed.length === 0 ? (
            <EmptyState title="Nothing yet." />
          ) : (
            <ul className="divide-y divide-stone/50">
              {feed.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-brass-light" />
                  <span className="min-w-0 flex-1 truncate"><b className="font-semibold">{f.author_name ?? 'Someone'}</b> {f.subject}</span>
                  {(f.deal_id || f.lead_id || f.contact_id) && (
                    <Link href={f.deal_id ? `/base/crm/deals/${f.deal_id}` : f.lead_id ? `/base/crm/leads/${f.lead_id}` : `/base/crm/contacts/${f.contact_id}`} className="text-xs font-semibold text-brass-dark">Open</Link>
                  )}
                  <span className="whitespace-nowrap text-xs text-muted">{fmtDate(new Date(f.created_at), zone, 'MMM d')} · {fmtTime(f.created_at, zone)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
