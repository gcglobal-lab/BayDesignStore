import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Archive, ArchiveRestore, ArrowLeft, Copy, Eye, Lock, Settings2, Trash2, Users } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import { SubmitButton } from '@/components/base/forms';
import { BoardMembers, BoardSettingsForm } from '@/components/crm/board/BoardForms';
import BoardView from '@/components/crm/board/BoardView';
import { requireCrm } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { listEmployees } from '@/lib/base/queries';
import { fullName } from '@/lib/base/types';
import { boardAccess, loadBoard } from '@/lib/crm/boards';
import { archiveBoard, deleteBoard, duplicateBoard } from '../actions';

export const metadata: Metadata = { title: 'Board' };

export default async function BoardPage({ params, searchParams }: PageProps<'/base/crm/boards/[id]'>) {
  const viewer = await requireCrm();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadBoard(id);
  if (!data) notFound();
  const access = await boardAccess(viewer, data.board);
  if (!access.see) redirect('/base/crm/boards');

  const [all, membersRes, foldersRes] = await Promise.all([
    listEmployees(true),
    db().from('crm_board_members').select('employee_id, role').eq('board_id', id),
    db().from('crm_boards').select('folder').not('folder', 'is', null),
  ]);
  const names = Object.fromEntries(all.map((e) => [e.id, fullName(e)]));
  const people = all.filter((e) => e.status !== 'terminated').map((e) => ({ id: e.id, name: fullName(e) }));
  const members = (membersRes.data ?? []) as { employee_id: string; role: 'editor' | 'viewer' }[];
  const folders = [...new Set((foldersRes.data ?? []).map((f) => f.folder as string))].sort();
  const { board } = data;
  const initialItem = typeof sp.item === 'string' && data.items.some((i) => i.id === sp.item) ? sp.item : null;

  return (
    <>
      <Link href="/base/crm/boards" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> Boards{board.folder ? ` · ${board.folder}` : ''}</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[1.9rem] font-semibold leading-tight tracking-tight">
            <span className="h-3 w-3 rounded-full" style={{ background: board.color }} />
            {board.name}
            {board.visibility === 'members' && <Lock size={16} className="text-muted" aria-label="Members only" />}
            {!access.edit && <span className="b-badge-gray"><Eye size={11} /> View only</span>}
            {board.archived && <span className="b-badge-amber">Archived</span>}
          </h1>
          {board.description && <p className="mt-1 max-w-3xl whitespace-pre-wrap text-sm text-muted">{board.description}</p>}
        </div>
        {access.manage && (
          <div className="flex flex-wrap items-center gap-2">
            <Dialog trigger={<><Users size={14} /> Members{members.length ? ` · ${members.length}` : ''}</>} triggerClassName="b-btn-ghost" title="Board members">
              <BoardMembers boardId={board.id} members={members} people={people} visibility={board.visibility} />
            </Dialog>
            <Dialog trigger={<><Settings2 size={14} /> Settings</>} triggerClassName="b-btn-ghost" title="Board settings" wide>
              <BoardSettingsForm board={board} folders={folders} />
              <div className="mt-6 flex flex-wrap gap-2 border-t border-stone/50 pt-4">
                {viewer.crm === 'manager' && (
                  <form action={duplicateBoard} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={board.id} />
                    <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="with_items" className="b-check" /> with rows</label>
                    <SubmitButton className="b-btn-ghost b-btn-sm"><Copy size={13} /> Duplicate board</SubmitButton>
                  </form>
                )}
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
          </div>
        )}
      </div>
      <BoardView data={data} people={people} names={names} canEdit={access.edit && !board.archived} canManage={access.manage && !board.archived} initialItem={initialItem} />
    </>
  );
}
