import 'server-only';
import { cache } from 'react';
import type { Viewer } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import type { Board } from './boardTypes';
import { visibleBoards } from './boards';

export type Workspace = { id: string; name: string; description: string | null; color: string; visibility: 'everyone' | 'members'; position: number; archived: boolean; created_by: string | null; created_at: string; updated_at: string };
export type Folder = { id: string; workspace_id: string; parent_id: string | null; name: string; color: string; position: number };
export type WorkspaceAccess = { see: boolean; manage: boolean; role: 'owner' | 'member' | 'viewer' | null };

/** Workflow managers / admins: everything. Owners manage their workspace. Members-only workspaces hide from others. */
export async function workspaceAccess(viewer: Viewer, ws: Pick<Workspace, 'id' | 'visibility' | 'created_by'>): Promise<WorkspaceAccess> {
  if (viewer.crm === 'none') return { see: false, manage: false, role: null };
  if (viewer.crm === 'manager') return { see: true, manage: true, role: 'owner' };
  let role: WorkspaceAccess['role'] = null;
  if (viewer.employeeId) {
    const { data } = await db().from('crm_workspace_members').select('role').eq('workspace_id', ws.id).eq('employee_id', viewer.employeeId).maybeSingle();
    role = (data?.role as WorkspaceAccess['role']) ?? null;
  }
  if (ws.created_by && ws.created_by === viewer.employeeId) role = 'owner';
  return { see: ws.visibility === 'everyone' || role !== null, manage: role === 'owner', role };
}

export async function visibleWorkspaces(viewer: Viewer): Promise<Workspace[]> {
  const all = must<Workspace[]>(await db().from('crm_workspaces').select('*').eq('archived', false).order('position').order('name'), 'load workspaces');
  if (viewer.crm === 'manager') return all;
  const { data } = viewer.employeeId ? await db().from('crm_workspace_members').select('workspace_id').eq('employee_id', viewer.employeeId) : { data: [] };
  const mine = new Set((data ?? []).map((m) => m.workspace_id));
  return all.filter((w) => w.visibility === 'everyone' || mine.has(w.id) || w.created_by === viewer.employeeId);
}

export const viewerKey = (v: Viewer) => v.employeeId ?? v.id;

/** One workspace row. Cached per request so the layout and the page share a single query. */
export const getWorkspace = cache(async (wsId: string) => (await db().from('crm_workspaces').select('*').eq('id', wsId).maybeSingle<Workspace>()).data);

/**
 * Everything the workspace panel shows. Cached per request (the layout and the page both need it);
 * the viewer object is itself cached per request by getViewer, so it works as a key.
 */
export const workspaceTree = cache(async (viewer: Viewer, wsId: string) => {
  const [workspaces, folders, boards, favs] = await Promise.all([
    visibleWorkspaces(viewer),
    db().from('crm_folders').select('id, workspace_id, parent_id, name, color, position').eq('workspace_id', wsId).order('position').order('name'),
    visibleBoards(viewer, true),
    db().from('crm_favorites').select('board_id').eq('viewer', viewerKey(viewer)),
  ]);
  const favorites = new Set((favs.data ?? []).map((f) => f.board_id as string));
  return {
    workspaces,
    folders: must<Folder[]>(folders, 'load folders'),
    boards: boards.filter((b) => b.workspace_id === wsId),
    favorites: boards.filter((b) => favorites.has(b.id) && !b.archived) as Board[],
    favoriteIds: [...favorites],
  };
});
