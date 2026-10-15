import type { Metadata } from 'next';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { Card, EmptyState, PageHeader } from '@/components/base/ui';
import { requireCrm } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { addDaysYmd, fmtDate, isYmd, todayYmd, zonedMidnight } from '@/lib/base/time';
import { getCrmPeople } from '@/lib/crm/data';
import { money, moneyShort } from '@/lib/crm/types';

export const metadata: Metadata = { title: 'Workflow reports' };

type DealRow = { id: string; value: number; status: 'open' | 'won' | 'lost'; owner_id: string | null; source: string | null; lost_reason: string | null; created_at: string; closed_at: string | null };

function Bar({ value, max, color = 'from-brass to-brass-light' }: { value: number; max: number; color?: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-sand">
      <div className={`h-full rounded-full bg-gradient-to-r ${color}`} style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }} />
    </div>
  );
}

export default async function CrmReportsPage({ searchParams }: PageProps<'/base/crm/reports'>) {
  await requireCrm();
  const sp = await searchParams;
  const [people, { timezone: zone }] = await Promise.all([getCrmPeople(), getSettings()]);
  const today = todayYmd(zone);
  const presets: Record<string, [string, string, string]> = {
    month: ['This month', `${today.slice(0, 7)}-01`, today],
    last30: ['Last 30 days', addDaysYmd(today, -29, zone), today],
    quarter: ['Last 90 days', addDaysYmd(today, -89, zone), today],
    year: ['This year', `${today.slice(0, 4)}-01-01`, today],
  };
  const preset = typeof sp.range === 'string' && sp.range in presets ? sp.range : isYmd(sp.from) && isYmd(sp.to) ? 'custom' : 'quarter';
  const [from, to] = preset === 'custom' ? [sp.from as string, sp.to as string] : [presets[preset][1], presets[preset][2]];
  const fromIso = zonedMidnight(from, zone).toISOString();
  const toIso = zonedMidnight(addDaysYmd(to, 1, zone), zone).toISOString();

  const [closedRes, createdRes, leadsRes, actsRes, openRes] = await Promise.all([
    db().from('crm_deals').select('id, value, status, owner_id, source, lost_reason, created_at, closed_at').neq('status', 'open').gte('closed_at', fromIso).lt('closed_at', toIso).limit(10000),
    db().from('crm_deals').select('id, value, status, owner_id, source, lost_reason, created_at, closed_at').gte('created_at', fromIso).lt('created_at', toIso).limit(10000),
    db().from('crm_leads').select('id, source, status, owner_id').gte('created_at', fromIso).lt('created_at', toIso).limit(10000),
    db().from('crm_activities').select('type, assignee_id').eq('done', true).in('type', ['call', 'meeting', 'email', 'task']).gte('done_at', fromIso).lt('done_at', toIso).limit(20000),
    db().from('crm_deals').select('value, owner_id').eq('status', 'open').limit(10000),
  ]);
  const closed = must<DealRow[]>(closedRes, 'load closed deals');
  const created = must<DealRow[]>(createdRes, 'load new deals');
  const leads = must<{ id: string; source: string | null; status: string; owner_id: string | null }[]>(leadsRes, 'load leads');
  const acts = must<{ type: string; assignee_id: string | null }[]>(actsRes, 'load activities');
  const openDeals = must<{ value: number; owner_id: string | null }[]>(openRes, 'load open deals');

  const won = closed.filter((d) => d.status === 'won');
  const lost = closed.filter((d) => d.status === 'lost');
  const wonValue = won.reduce((s, d) => s + Number(d.value), 0);
  const cycle = won.length ? Math.round(won.reduce((s, d) => s + (new Date(d.closed_at!).getTime() - new Date(d.created_at).getTime()) / 86_400_000, 0) / won.length) : null;

  // By person
  const ids = new Set<string>([...closed, ...openDeals].map((d) => d.owner_id ?? 'none'));
  acts.forEach((a) => ids.add(a.assignee_id ?? 'none'));
  const byPerson = [...ids].map((id) => {
    const w = won.filter((d) => (d.owner_id ?? 'none') === id);
    const l = lost.filter((d) => (d.owner_id ?? 'none') === id);
    return {
      id,
      name: id === 'none' ? 'Unassigned' : (people.names.get(id) ?? 'Former team member'),
      won: w.length,
      wonValue: w.reduce((s, d) => s + Number(d.value), 0),
      lost: l.length,
      winRate: w.length + l.length ? Math.round((w.length / (w.length + l.length)) * 100) : null,
      open: openDeals.filter((d) => (d.owner_id ?? 'none') === id).reduce((s, d) => s + Number(d.value), 0),
      calls: acts.filter((a) => (a.assignee_id ?? 'none') === id && a.type === 'call').length,
      meetings: acts.filter((a) => (a.assignee_id ?? 'none') === id && a.type === 'meeting').length,
      other: acts.filter((a) => (a.assignee_id ?? 'none') === id && (a.type === 'email' || a.type === 'task')).length,
    };
  }).sort((a, b) => b.wonValue - a.wonValue || b.open - a.open);
  const maxPerson = Math.max(1, ...byPerson.map((p) => p.wonValue));

  // Lead sources
  const sources = new Map<string, { leads: number; converted: number; deals: number; won: number; wonValue: number }>();
  const src = (k: string | null) => {
    const key = k ?? 'Unknown';
    if (!sources.has(key)) sources.set(key, { leads: 0, converted: 0, deals: 0, won: 0, wonValue: 0 });
    return sources.get(key)!;
  };
  leads.forEach((l) => {
    const s = src(l.source);
    s.leads++;
    if (l.status === 'converted') s.converted++;
  });
  created.forEach((d) => src(d.source).deals++);
  won.forEach((d) => {
    const s = src(d.source);
    s.won++;
    s.wonValue += Number(d.value);
  });
  const sourceRows = [...sources.entries()].sort((a, b) => b[1].wonValue - a[1].wonValue || b[1].leads - a[1].leads);

  const reasons = new Map<string, number>();
  lost.forEach((d) => reasons.set(d.lost_reason ?? 'Not given', (reasons.get(d.lost_reason ?? 'Not given') ?? 0) + 1));
  const reasonRows = [...reasons.entries()].sort((a, b) => b[1] - a[1]);
  const maxReason = Math.max(1, ...reasons.values());

  // Won per week across the range
  const weeks: { start: string; value: number }[] = [];
  for (let d = from; d <= to && weeks.length < 60; d = addDaysYmd(d, 7, zone)) weeks.push({ start: d, value: 0 });
  won.forEach((d) => {
    const day = fmtDate(new Date(d.closed_at!), zone, 'yyyy-MM-dd');
    const w = [...weeks].reverse().find((x) => x.start <= day);
    if (w) w.value += Number(d.value);
  });
  const maxWeek = Math.max(1, ...weeks.map((w) => w.value));

  return (
    <>
      <PageHeader
        plain
        title="Reports"
        description={`${fmtDate(from, zone, 'MMM d, yyyy')} – ${fmtDate(to, zone, 'MMM d, yyyy')}`}
        actions={<a href="/base/crm/export?type=deals&status=all" className="b-btn-ghost"><Download size={15} /> Export all deals</a>}
      />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="b-segment flex-wrap">
          {Object.entries(presets).map(([k, [label]]) => <Link key={k} href={`/base/crm/reports?range=${k}`} aria-current={preset === k ? 'page' : undefined}>{label}</Link>)}
        </div>
        <form action="/base/crm/reports" className="flex flex-wrap items-center gap-2">
          <input type="date" name="from" defaultValue={from} className="b-input !w-auto !py-2" />
          <span className="text-muted">to</span>
          <input type="date" name="to" defaultValue={to} className="b-input !w-auto !py-2" />
          <button type="submit" className="b-btn-ghost">Apply</button>
        </form>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Won', money(wonValue), `${won.length} deals`],
          ['Average deal', won.length ? money(wonValue / won.length) : '—', 'won deals'],
          ['Win rate', won.length + lost.length ? `${Math.round((won.length / (won.length + lost.length)) * 100)}%` : '—', `${won.length} won · ${lost.length} lost`],
          ['Sales cycle', cycle === null ? '—' : `${cycle} days`, 'created → won'],
          ['New leads', String(leads.length), `${leads.filter((l) => l.status === 'converted').length} converted`],
        ].map(([k, v, h]) => (
          <div key={k} className="b-card px-4 py-3">
            <p className="text-xs text-muted">{k}</p>
            <p className="text-2xl font-semibold tracking-tight">{v}</p>
            <p className="text-[0.7rem] text-muted">{h}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Revenue won, by week" className="xl:col-span-2">
          {won.length === 0 ? (
            <EmptyState title="No deals won in this period." />
          ) : (
            <div className="flex h-44 items-end gap-1">
              {weeks.map((w) => (
                <div key={w.start} className="group flex flex-1 flex-col items-center gap-1" title={`Week of ${fmtDate(w.start, zone, 'MMM d')}: ${money(w.value)}`}>
                  <div className="w-full rounded-t bg-gradient-to-t from-brass to-brass-light" style={{ height: `${Math.max(2, (w.value / maxWeek) * 100)}%` }} />
                  {weeks.length <= 16 && <span className="text-[0.6rem] text-muted">{fmtDate(w.start, zone, 'M/d')}</span>}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Sales by person" className="xl:col-span-2" pad={false}>
          <div className="overflow-x-auto">
            <table className="b-table">
              <thead><tr><th>Person</th><th className="w-[28%]">Won</th><th>Deals won</th><th>Lost</th><th>Win rate</th><th>Open pipeline</th><th>Calls</th><th>Meetings</th><th>Emails & to-dos</th></tr></thead>
              <tbody>
                {byPerson.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}</td>
                    <td><p className="mb-1 text-sm font-semibold">{money(p.wonValue)}</p><Bar value={p.wonValue} max={maxPerson} /></td>
                    <td>{p.won}</td>
                    <td>{p.lost}</td>
                    <td>{p.winRate === null ? '—' : `${p.winRate}%`}</td>
                    <td>{moneyShort(p.open)}</td>
                    <td>{p.calls}</td>
                    <td>{p.meetings}</td>
                    <td>{p.other}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Lead sources" pad={false}>
          {sourceRows.length === 0 ? (
            <EmptyState title="No leads or deals in this period." />
          ) : (
            <div className="overflow-x-auto">
              <table className="b-table">
                <thead><tr><th>Source</th><th>Leads</th><th>Converted</th><th>New deals</th><th>Won</th><th className="text-right">Won value</th></tr></thead>
                <tbody>
                  {sourceRows.map(([k, s]) => (
                    <tr key={k}>
                      <td className="font-medium">{k}</td>
                      <td>{s.leads}</td>
                      <td>{s.leads ? `${Math.round((s.converted / s.leads) * 100)}%` : '—'}</td>
                      <td>{s.deals}</td>
                      <td>{s.won}</td>
                      <td className="text-right font-medium">{money(s.wonValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Why deals were lost">
          {reasonRows.length === 0 ? (
            <EmptyState title="No lost deals in this period." />
          ) : (
            <ul className="space-y-3">
              {reasonRows.map(([r, n]) => (
                <li key={r}>
                  <div className="mb-1 flex justify-between text-sm"><span>{r}</span><span className="font-semibold">{n}</span></div>
                  <Bar value={n} max={maxReason} color="from-red-400 to-pink-400" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
