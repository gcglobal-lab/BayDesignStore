import type { Metadata } from 'next';
import Link from 'next/link';
import { Archive, Folder, LayoutGrid, Lock, Plus } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import { Card, EmptyState, PageHeader } from '@/components/base/ui';
import { NewBoardForm } from '@/components/crm/board/BoardForms';
import { requireCrm } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { fmtDate } from '@/lib/base/time';
import { visibleBoards } from '@/lib/crm/boards';

export const metadata: Metadata = { title: 'Boards' };

/** The workspace: every board you can open, grouped by folder (like monday.com). */
export default async function BoardsPage({ searchParams }: PageProps<'/base/crm/boards'>) {
  const viewer = await requireCrm();
  const sp = await searchParams;
  const showArchived = sp.archived === '1' && viewer.crm === 'manager';
  const [boards, { timezone: zone }] = await Promise.all([visibleBoards(viewer, showArchived), getSettings()]);
  const list = boards.filter((b) => b.archived === showArchived);
  const ids = list.map((b) => b.id);
  const { data: counts } = ids.length ? await db().from('crm_board_items').select('board_id').in('board_id', ids).is('parent_id', null) : { data: [] };
  const rowCount = new Map<string, number>();
  (counts ?? []).forEach((c) => rowCount.set(c.board_id, (rowCount.get(c.board_id) ?? 0) + 1));
  const folders = [...new Set(boards.map((b) => b.folder).filter((f): f is string => Boolean(f)))].sort();
  const byFolder = new Map<string, typeof list>();
  for (const b of list) byFolder.set(b.folder ?? '', [...(byFolder.get(b.folder ?? '') ?? []), b]);
  const order = ['', ...folders].filter((f) => byFolder.has(f));

  return (
    <>
      <PageHeader
        plain
        title={showArchived ? 'Archived boards' : 'Boards'}
        description="Your workspace — boards for designers and their clients, claims, vendors and anything else you track. Click a board to open it."
        actions={
          <>
            {viewer.crm === 'manager' && <Link href={showArchived ? '/base/crm/boards' : '/base/crm/boards?archived=1'} className="b-btn-ghost"><Archive size={15} /> {showArchived ? 'Active boards' : 'Archived'}</Link>}
            {viewer.crm === 'manager' && (
              <Dialog trigger={<><Plus size={15} /> New board</>} triggerClassName="b-btn-brass" title="New board" description="Start from a template — you can add, rename and remove columns and groups any time." wide>
                <NewBoardForm folders={folders} />
              </Dialog>
            )}
          </>
        }
      />
      {list.length === 0 ? (
        <Card>
          <EmptyState icon={<LayoutGrid size={20} />} title={showArchived ? 'No archived boards.' : 'No boards yet.'}>
            {viewer.crm === 'manager' ? 'Create one with “New board” — try the Designers & clients template.' : 'A Workflow manager can create boards and add you to them.'}
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-8">
          {order.map((f) => (
            <section key={f || 'none'}>
              {f && <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted"><Folder size={15} /> {f}</h2>}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {byFolder.get(f)!.map((b) => (
                  <Link key={b.id} href={`/base/crm/boards/${b.id}`} className="b-card group flex items-start gap-3 p-4 transition-shadow hover:shadow-lg">
                    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-lg font-bold text-white" style={{ background: b.color }}>{b.name[0]?.toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-semibold group-hover:text-brass-dark">{b.name} {b.visibility === 'members' && <Lock size={12} className="text-muted" aria-label="Members only" />}</span>
                      {b.description && <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{b.description}</span>}
                      <span className="mt-1 block text-[0.7rem] text-muted">{rowCount.get(b.id) ?? 0} {b.item_label.toLowerCase()}{(rowCount.get(b.id) ?? 0) === 1 ? '' : 's'} · updated {fmtDate(new Date(b.updated_at), zone, 'MMM d')}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
