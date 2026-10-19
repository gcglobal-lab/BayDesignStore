import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Archive, ArchiveRestore, Copy, Eye, Lock, Settings2, Trash2, UserPlus } from 'lucide-react';
import type { PortalFile } from '@/app/base/(app)/crm/files/actions';
import { Dialog } from '@/components/base/Dialog';
import { SubmitButton } from '@/components/base/forms';
import { BoardMembers, BoardSettingsForm } from '@/components/crm/board/BoardForms';
import BoardView from '@/components/crm/board/BoardView';
import { Initials } from '@/components/crm/board/Cell';
import { FavoriteStar } from '@/components/crm/workspace/WorkspaceBits';
import { requireCrm } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { listEmployees } from '@/lib/base/queries';
import { fullName } from '@/lib/base/types';
import { boardAccess, loadBoard } from '@/lib/crm/boards';
import { viewerKey } from '@/lib/crm/workspaces';
import { archiveBoard, deleteBoard, duplicateBoard } from '../../../../boards/actions';

export const metadata: Metadata = { title: 'Board' };

export default async function WorkspaceBoardPage({ params, searchParams }: PageProps<'/base/crm/workspace/[wsId]/board/[boardId]'>) {
  const viewer = await requireCrm();
  const { wsId, boardId } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(boardId)) notFound();
  // Everything that only needs the board id starts at the same time as the board itself
  // (one round of queries instead of two); nothing is shown until access has been checked.
  const boardP = loadBoard(boardId);
  const extrasP = Promise.all([
    listEmployees(true),
    db().from('crm_board_members').select('employee_id, role').eq('board_id', boardId),
    db().from('portal_files').select('id, item_id, column_id, task_id, name, mime, size, created_at, uploader_name').eq('board_id', boardId).order('created_at'),
    db().from('crm_favorites').select('board_id').eq('viewer', viewerKey(viewer)).eq('board_id', boardId).maybeSingle(),
  ]);
  extrasP.catch(() => {}); // awaited below; avoids an unhandled rejection if we redirect first
  const data = await boardP;
  if (!data) notFound();
  if (data.board.workspace_id !== wsId) redirect(`/base/crm/workspace/${data.board.workspace_id}/board/${boardId}`);
  const itemIds = data.items.map((i) => i.id);
  const [access, [all, membersRes, filesRes, favRes], updatesRes] = await Promise.all([
    boardAccess(viewer, data.board),
    extrasP,
    // Comment counts per row: by row id for normal boards (uses the item index, no join);
    // very large boards fall back to the join so the request URL stays short.
    itemIds.length === 0
      ? Promise.resolve({ data: [] })
      : itemIds.length <= 250
        ? db().from('crm_board_updates').select('item_id').eq('kind', 'comment').in('item_id', itemIds).limit(20000)
        : db().from('crm_board_updates').select('item_id, crm_board_items!inner(board_id)').eq('kind', 'comment').eq('crm_board_items.board_id', boardId).limit(20000),
  ]);
  if (!access.see) redirect(`/base/crm/workspace/${wsId}`);
  const names = Object.fromEntries(all.map((e) => [e.id, fullName(e)]));
  const people = all.filter((e) => e.status !== 'terminated').map((e) => ({ id: e.id, name: fullName(e) }));
  const members = (membersRes.data ?? []) as { employee_id: string; role: 'editor' | 'viewer' }[];
  const updateCounts: Record<string, number> = {};
  for (const u of (updatesRes.data ?? []) as { item_id: string }[]) updateCounts[u.item_id] = (updateCounts[u.item_id] ?? 0) + 1;
  const { board } = data;
  const initialItem = typeof sp.item === 'string' && data.items.some((i) => i.id === sp.item) ? sp.item : null;
  const shown = members.slice(0, 4);

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <h1 className="truncate text-[1.7rem] font-semibold tracking-tight">{board.name}</h1>
          {board.visibility === 'members' && <Lock size={16} className="flex-none text-muted" aria-label="Members only" />}
          <FavoriteStar boardId={board.id} on={Boolean(favRes.data)} />
          {!access.edit && <span className="b-badge-gray ml-1"><Eye size={11} /> View only</span>}
          {board.archived && <span className="b-badge-amber ml-1">Archived</span>}
        </div>
        <div className="flex items-center gap-2">
          {shown.length > 0 && (
            <span className="flex -space-x-2">
              {shown.map((m) => <Initials key={m.employee_id} name={names[m.employee_id] ?? '?'} size={30} ring />)}
            </span>
          )}
          {access.manage && (
            <>
              <Dialog trigger={<><UserPlus size={15} /> Invite{members.length ? ` / ${members.length}` : ''}</>} triggerClassName="b-btn-ghost" title="Board members">
                <BoardMembers boardId={board.id} members={members} people={people} visibility={board.visibility} />
              </Dialog>
              <Dialog trigger={<Settings2 size={16} />} triggerClassName="b-btn-ghost !px-2.5" title="Board settings" wide>
                <BoardSettingsForm board={board} />
                <div className="mt-6 flex flex-wrap gap-2 border-t border-stone/50 pt-4">
                  <form action={duplicateBoard} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={board.id} />
                    <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="with_items" className="b-check" /> with rows</label>
                    <SubmitButton className="b-btn-ghost b-btn-sm"><Copy size={13} /> Duplicate board</SubmitButton>
                  </form>
                  <form action={archiveBoard}>
                    <input type="hidden" name="id" value={board.id} />
                    <input type="hidden" name="archived" value={String(!board.archived)} />
                    <SubmitButton className="b-btn-ghost b-btn-sm">{board.archived ? <><ArchiveRestore size={13} /> Restore</> : <><Archive size={13} /> Archive</>}</SubmitButton>
                  </form>
                  {viewer.crm === 'manager' && (
                    <form action={deleteBoard} className="ml-auto">
                      <input type="hidden" name="id" value={board.id} />
                      <SubmitButton className="b-btn-danger b-btn-sm" confirm={`Delete “${board.name}” and everything on it? This can’t be undone.`}><Trash2 size={13} /> Delete board</SubmitButton>
                    </form>
                  )}
                </div>
              </Dialog>
            </>
          )}
        </div>
      </div>
      {board.description && <p className="mb-3 max-w-3xl whitespace-pre-wrap text-sm text-muted">{board.description}</p>}
      <BoardView
        data={data}
        files={(filesRes.data ?? []) as PortalFile[]}
        updateCounts={updateCounts}
        people={people}
        names={names}
        canEdit={access.edit && !board.archived}
        canManage={access.manage && !board.archived}
        initialItem={initialItem}
      />
    </>
  );
}
