import 'server-only';
import type { Viewer } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import type { Board, BoardColumn, BoardGroup, BoardItem } from './boardTypes';

export type BoardAccess = { see: boolean; edit: boolean; manage: boolean; role: 'manager' | 'editor' | 'viewer' | null };

/**
 * Who can do what on a board:
 *  - Workflow managers and admins: everything on every board.
 *  - The person who made the board: everything on it.
 *  - Boards open to everyone: any Workflow user can view and edit.
 *  - Members-only boards: members, as editor or viewer.
 */
export async function boardAccess(viewer: Viewer, board: Pick<Board, 'id' | 'visibility' | 'created_by'>): Promise<BoardAccess> {
  if (viewer.crm === 'none') return { see: false, edit: false, manage: false, role: null };
  if (viewer.crm === 'manager' || (viewer.employeeId && board.created_by === viewer.employeeId)) return { see: true, edit: true, manage: true, role: 'manager' };
  let role: 'editor' | 'viewer' | null = null;
  if (viewer.employeeId) {
    const { data } = await db().from('crm_board_members').select('role').eq('board_id', board.id).eq('employee_id', viewer.employeeId).maybeSingle();
    role = (data?.role as 'editor' | 'viewer' | undefined) ?? null;
  }
  if (board.visibility === 'everyone') return { see: true, edit: role !== 'viewer', manage: false, role: role ?? 'editor' };
  return { see: role !== null, edit: role === 'editor', manage: false, role };
}

/** Boards this person can open (for the boards list). */
export async function visibleBoards(viewer: Viewer, includeArchived = false): Promise<Board[]> {
  let q = db().from('crm_boards').select('*').order('folder', { nullsFirst: true }).order('position').order('name');
  if (!includeArchived) q = q.eq('archived', false);
  const boards = must<Board[]>(await q, 'load boards');
  if (viewer.crm === 'manager') return boards;
  const { data } = viewer.employeeId ? await db().from('crm_board_members').select('board_id').eq('employee_id', viewer.employeeId) : { data: [] };
  const mine = new Set((data ?? []).map((m) => m.board_id));
  return boards.filter((b) => b.visibility === 'everyone' || mine.has(b.id) || b.created_by === viewer.employeeId);
}

export async function loadBoard(id: string) {
  const [b, cols, groups, items] = await Promise.all([
    db().from('crm_boards').select('*').eq('id', id).maybeSingle(),
    db().from('crm_board_columns').select('*').eq('board_id', id).order('position'),
    db().from('crm_board_groups').select('*').eq('board_id', id).order('position'),
    db().from('crm_board_items').select('*').eq('board_id', id).order('position').limit(10000),
  ]);
  const board = must<Board | null>(b, 'load the board');
  if (!board) return null;
  return {
    board,
    columns: must<BoardColumn[]>(cols, 'load board columns'),
    groups: must<BoardGroup[]>(groups, 'load board groups'),
    items: must<BoardItem[]>(items, 'load board items'),
  };
}
