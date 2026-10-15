import type { Metadata } from 'next';
import Link from 'next/link';
import { Download, KanbanSquare, List, Plus, Search } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import { Card, EmptyState, PageHeader } from '@/components/base/ui';
import DealBoard, { type BoardCard } from '@/components/crm/DealBoard';
import DealForm from '@/components/crm/DealForm';
import { requireCrm } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { fmtDate, fmtTime } from '@/lib/base/time';
import { canEditRecord, getCrmPeople, getCrmSetup, labelsFor, pickerOptions, searchTerm } from '@/lib/crm/data';
import { daysSince, money, type Deal } from '@/lib/crm/types';
import Select from '@/components/ui/Select';

export const metadata: Metadata = { title: 'Deals' };

export default async function DealsPage({ searchParams }: PageProps<'/base/crm/deals'>) {
  const viewer = await requireCrm();
  const sp = await searchParams;
  const [{ pipelines, settings }, people, { timezone: zone }] = await Promise.all([getCrmSetup(), getCrmPeople(), getSettings()]);
  const pipeline = pipelines.find((p) => p.id === sp.pipeline) ?? pipelines.find((p) => p.is_default) ?? pipelines[0];
  const view = sp.view === 'list' ? 'list' : 'board';
  const status = sp.status === 'won' || sp.status === 'lost' || sp.status === 'all' ? sp.status : 'open';
  const owner = typeof sp.owner === 'string' && sp.owner ? sp.owner : 'all';
  const q = searchTerm(sp.q);

  if (!pipeline) {
    return (
      <>
        <PageHeader plain title="Deals" />
        <Card><EmptyState title="No pipelines yet.">A Workflow manager can add one in Workflow ▸ Settings.</EmptyState></Card>
      </>
    );
  }

  let query = db().from('crm_deals').select('*').eq('pipeline_id', pipeline.id).order('position').limit(1000);
  if (view === 'board' || status !== 'all') query = query.eq('status', view === 'board' ? 'open' : status);
  if (owner === 'me') query = viewer.employeeId ? query.eq('owner_id', viewer.employeeId) : query.is('owner_id', null);
  else if (owner === 'none') query = query.is('owner_id', null);
  else if (/^[0-9a-f-]{36}$/.test(owner)) query = query.eq('owner_id', owner);
  if (q) query = query.ilike('title', `%${q}%`);
  const deals = must<Deal[]>(await query, 'load deals');

  const [contactNames, companyNames, nextRes, pickers] = await Promise.all([
    labelsFor('crm_contacts', deals.map((d) => d.contact_id)),
    labelsFor('crm_companies', deals.map((d) => d.company_id)),
    deals.length
      ? db().from('crm_activities').select('deal_id, subject, due_at').in('deal_id', deals.slice(0, 500).map((d) => d.id)).eq('done', false).not('due_at', 'is', null).order('due_at')
      : Promise.resolve({ data: [], error: null }),
    pickerOptions(),
  ]);
  const next = new Map<string, { subject: string; due_at: string }>();
  for (const a of must<{ deal_id: string; subject: string; due_at: string }[]>(nextRes, 'load next steps')) if (!next.has(a.deal_id)) next.set(a.deal_id, a);

  const stageOf = new Map(pipeline.stages.map((s) => [s.id, s]));
  const now = Date.now();
  const cards: BoardCard[] = deals.map((d) => {
    const st = stageOf.get(d.stage_id);
    const days = daysSince(d.stage_changed_at, now);
    const n = next.get(d.id);
    return {
      id: d.id,
      title: d.title,
      stage_id: d.stage_id,
      value: Number(d.value),
      position: d.position,
      priority: d.priority,
      who: [d.contact_id && contactNames.get(d.contact_id), d.company_id && companyNames.get(d.company_id)].filter(Boolean).join(' · ') || null,
      owner: d.owner_id ? (people.names.get(d.owner_id) ?? null) : null,
      tags: d.tags,
      daysInStage: days,
      rotting: Boolean(st?.rot_days && days > st.rot_days),
      next: n ? { label: `${n.subject} · ${fmtDate(new Date(n.due_at), zone, 'MMM d')} ${fmtTime(n.due_at, zone)}`, overdue: new Date(n.due_at).getTime() < now } : null,
      close: d.expected_close,
      canMove: canEditRecord(viewer, d.owner_id),
    };
  });

  const openTotal = cards.reduce((s, c) => s + c.value, 0);
  const weighted = deals.reduce((s, d) => s + Number(d.value) * ((stageOf.get(d.stage_id)?.probability ?? 0) / 100), 0);
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ pipeline: pipeline.id, view, status, owner, ...(q ? { q } : {}), ...patch });
    return `/base/crm/deals?${p}`;
  };

  return (
    <>
      <PageHeader
        plain
        title="Deals"
        description={view === 'board' ? <>{cards.length} open · {money(openTotal)} in the pipeline · <span title="Value × stage probability">{money(weighted)} weighted forecast</span></> : `${deals.length} deals`}
        actions={
          <>
            <a href={`/base/crm/export?type=deals&pipeline=${pipeline.id}`} className="b-btn-ghost"><Download size={15} /> Export</a>
            <Dialog trigger={<><Plus size={15} /> New deal</>} triggerClassName="b-btn-brass" title="New deal" wide>
              <DealForm pipelines={pipelines} owners={people.owners} contacts={pickers.contacts} companies={pickers.companies} sources={settings.lead_sources} tags={settings.deal_tags} me={viewer.employeeId} defaults={{ pipeline_id: pipeline.id }} />
            </Dialog>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {pipelines.length > 1 && (
          <div className="b-segment">
            {pipelines.map((p) => (
              <Link key={p.id} href={href({ pipeline: p.id })} aria-current={p.id === pipeline.id ? 'page' : undefined}>{p.name}</Link>
            ))}
          </div>
        )}
        <div className="b-segment">
          <Link href={href({ view: 'board' })} aria-current={view === 'board' ? 'page' : undefined} className="inline-flex items-center gap-1.5"><KanbanSquare size={14} /> Board</Link>
          <Link href={href({ view: 'list' })} aria-current={view === 'list' ? 'page' : undefined} className="inline-flex items-center gap-1.5"><List size={14} /> List</Link>
        </div>
        <form className="flex flex-1 flex-wrap items-center gap-2" action="/base/crm/deals">
          <input type="hidden" name="pipeline" value={pipeline.id} />
          <input type="hidden" name="view" value={view} />
          <Select people name="owner" defaultValue={owner} className="b-input !w-auto !py-2">
            <option value="all">Everyone’s deals</option>
            {viewer.employeeId && <option value="me">My deals</option>}
            <option value="none">Unassigned</option>
            {people.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
          {view === 'list' && (
            <Select name="status" defaultValue={status} className="b-input !w-auto !py-2">
              <option value="open">Open</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
              <option value="all">All</option>
            </Select>
          )}
          <label className="relative min-w-[12rem] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={q} placeholder="Search deals…" className="b-input !py-2 pl-9" />
          </label>
          <button type="submit" className="b-btn-ghost">Filter</button>
        </form>
      </div>

      {view === 'board' ? (
        <DealBoard stages={pipeline.stages} cards={cards} lostReasons={settings.lost_reasons} />
      ) : (
        <Card pad={false}>
          {deals.length === 0 ? (
            <EmptyState icon={<KanbanSquare size={20} />} title="No deals match." />
          ) : (
            <div className="overflow-x-auto">
              <table className="b-table">
                <thead>
                  <tr><th>Deal</th><th>Stage</th><th>Value</th><th>Contact / company</th><th>Owner</th><th>Expected close</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {deals.map((d) => {
                    const c = cards.find((x) => x.id === d.id)!;
                    const st = stageOf.get(d.stage_id);
                    return (
                      <tr key={d.id}>
                        <td><Link href={`/base/crm/deals/${d.id}`} className="font-medium hover:text-brass-dark">{d.title}</Link></td>
                        <td><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: st?.color }} />{st?.name}</span></td>
                        <td className="font-medium">{money(d.value)}</td>
                        <td className="text-muted">{c.who ?? '—'}</td>
                        <td>{c.owner ?? <span className="text-muted">Unassigned</span>}</td>
                        <td className="text-muted">{d.expected_close ? fmtDate(d.expected_close, zone, 'MMM d, yyyy') : '—'}</td>
                        <td><span className={`${d.status === 'won' ? 'b-badge-green' : d.status === 'lost' ? 'b-badge-red' : 'b-badge-blue'} capitalize`}>{d.status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
