'use server';

import { requireViewer } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { visibleBoards } from '@/lib/crm/boards';
import { canSeeAllTasks } from '@/lib/tasks/access';

export type SearchHit = { kind: 'Board' | 'Row' | 'Contact' | 'Company' | 'Deal' | 'Lead' | 'Task'; id: string; title: string; sub: string; href: string };

const PER_KIND = 6;

/**
 * Workflow search (the search box at the top of the Workflow menu): boards and their rows,
 * contacts, companies, deals, leads and tasks — only what this person can already open.
 */
export async function searchWorkflow(raw: string): Promise<SearchHit[]> {
  const viewer = await requireViewer();
  // Characters that would break PostgREST's or() filter or act as wildcards are dropped.
  const q = raw.replace(/[%_,()*\\:"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const crm = viewer.crm !== 'none';

  const boardsP = crm ? visibleBoards(viewer) : Promise.resolve([]);
  const tasksQ = db().from('tasks').select('id, number, title, status').ilike('title', like).order('updated_at', { ascending: false }).limit(PER_KIND);
  const tasksP = canSeeAllTasks(viewer) ? tasksQ : viewer.employeeId ? tasksQ.or(`created_by.eq.${viewer.employeeId},assignee_ids.cs.{${viewer.employeeId}}`) : Promise.resolve({ data: [] });
  const none = Promise.resolve({ data: [] as never[] });
  const [boards, tasks, contacts, companies, deals, leads] = await Promise.all([
    boardsP,
    tasksP,
    crm ? db().from('crm_contacts').select('id, first_name, last_name, email, phone').or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`).limit(PER_KIND) : none,
    crm ? db().from('crm_companies').select('id, name, city').ilike('name', like).limit(PER_KIND) : none,
    crm ? db().from('crm_deals').select('id, title, value, status').ilike('title', like).order('updated_at', { ascending: false }).limit(PER_KIND) : none,
    crm ? db().from('crm_leads').select('id, name, title, email, status').or(`name.ilike.${like},title.ilike.${like},email.ilike.${like},phone.ilike.${like},company_name.ilike.${like}`).order('created_at', { ascending: false }).limit(PER_KIND) : none,
  ]);

  const boardHref = (b: { id: string; workspace_id?: string | null }) => (b.workspace_id ? `/base/crm/workspace/${b.workspace_id}/board/${b.id}` : `/base/crm/boards/${b.id}`);
  const byId = new Map(boards.map((b) => [b.id, b]));
  const rows = boards.length
    ? (await db().from('crm_board_items').select('id, name, board_id, parent_id').in('board_id', [...byId.keys()]).ilike('name', like).order('updated_at', { ascending: false }).limit(PER_KIND * 2)).data ?? []
    : [];

  const needle = q.toLowerCase();
  const hits: SearchHit[] = [
    ...boards.filter((b) => b.name.toLowerCase().includes(needle)).slice(0, PER_KIND).map((b) => ({ kind: 'Board' as const, id: b.id, title: b.name, sub: b.archived ? 'Archived board' : 'Board', href: boardHref(b) })),
    ...rows.slice(0, PER_KIND * 2).map((r) => {
      const b = byId.get(r.board_id)!;
      return { kind: 'Row' as const, id: r.id, title: r.name, sub: `${r.parent_id ? 'Sub-item' : b.item_label} · ${b.name}`, href: `${boardHref(b)}?item=${r.id}` };
    }),
    ...(contacts.data ?? []).map((c) => ({ kind: 'Contact' as const, id: c.id, title: `${c.first_name} ${c.last_name}`.trim(), sub: c.email || c.phone || 'Contact', href: `/base/crm/contacts/${c.id}` })),
    ...(companies.data ?? []).map((c) => ({ kind: 'Company' as const, id: c.id, title: c.name, sub: c.city || 'Company', href: `/base/crm/companies/${c.id}` })),
    ...(deals.data ?? []).map((d) => ({ kind: 'Deal' as const, id: d.id, title: d.title, sub: `${d.status ?? 'open'}${d.value ? ` · $${Number(d.value).toLocaleString('en-US')}` : ''}`, href: `/base/crm/deals/${d.id}` })),
    ...(leads.data ?? []).map((l) => ({ kind: 'Lead' as const, id: l.id, title: l.name || l.title || l.email || 'Lead', sub: `${l.status ?? 'new'}${l.email ? ` · ${l.email}` : ''}`, href: `/base/crm/leads/${l.id}` })),
    ...((tasks.data ?? []) as { id: string; number: number | null; title: string; status: string }[]).map((t) => ({ kind: 'Task' as const, id: t.id, title: t.title, sub: `${t.number ? `#${t.number} · ` : ''}${t.status.replace(/_/g, ' ')}`, href: `/base/crm/tasks?task=${t.id}` })),
  ];
  return hits;
}
