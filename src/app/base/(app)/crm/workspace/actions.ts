'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireCrm, type Viewer } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { GROUP_COLORS } from '@/lib/crm/boardTypes';
import { boardAccess } from '@/lib/crm/boards';
import { viewerKey, workspaceAccess } from '@/lib/crm/workspaces';

const uuid = z.string().uuid();
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const refresh = () => revalidatePath('/base/crm/workspace', 'layout');

async function manageWs(viewer: Viewer, wsId: string) {
  if (!uuid.safeParse(wsId).success) return false;
  const { data: ws } = await db().from('crm_workspaces').select('id, visibility, created_by').eq('id', wsId).maybeSingle();
  return Boolean(ws && (await workspaceAccess(viewer, ws)).manage);
}

// --------------------------------------------------------------- workspaces --

const wsSchema = z.object({
  name: z.string().trim().min(1, 'Name the workspace.').max(80),
  description: z.string().trim().max(2000),
  color: hex.catch('#E2445C'),
  visibility: z.enum(['everyone', 'members']).catch('everyone'),
});

export async function createWorkspace(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm({ manager: true });
  const parsed = wsSchema.safeParse(Object.fromEntries(['name', 'description', 'color', 'visibility'].map((k) => [k, fd.get(k) ?? ''])));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the workspace.');
  const { count } = await db().from('crm_workspaces').select('id', { count: 'exact', head: true });
  const { data, error } = await db()
    .from('crm_workspaces')
    .insert({ ...parsed.data, description: parsed.data.description || null, position: count ?? 0, created_by: viewer.employeeId })
    .select('id')
    .single();
  if (error || !data) return fail('Couldn’t create the workspace.');
  if (viewer.employeeId) await db().from('crm_workspace_members').insert({ workspace_id: data.id, employee_id: viewer.employeeId, role: 'owner' });
  await audit(viewer, 'crm.workspace', 'crm_workspaces', data.id, { text: `created the workspace “${parsed.data.name}”` });
  refresh();
  redirect(`/base/crm/workspace/${data.id}`);
}

export async function updateWorkspace(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm();
  const id = String(fd.get('id') ?? '');
  if (!(await manageWs(viewer, id))) return fail('Only a workspace owner or Workflow manager can change this workspace.');
  const parsed = wsSchema.safeParse(Object.fromEntries(['name', 'description', 'color', 'visibility'].map((k) => [k, fd.get(k) ?? ''])));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the workspace.');
  await db().from('crm_workspaces').update({ ...parsed.data, description: parsed.data.description || null }).eq('id', id);
  await audit(viewer, 'crm.workspace', 'crm_workspaces', id, { text: `updated the workspace “${parsed.data.name}”` });
  refresh();
  return done('Workspace saved.');
}

export async function deleteWorkspace(fd: FormData) {
  const viewer = await requireCrm({ manager: true });
  const id = uuid.safeParse(fd.get('id'));
  if (!id.success) return;
  const { count } = await db().from('crm_workspaces').select('id', { count: 'exact', head: true }).eq('archived', false);
  if ((count ?? 0) <= 1) return;
  const { data } = await db().from('crm_workspaces').delete().eq('id', id.data).select('name').maybeSingle();
  await audit(viewer, 'crm.workspace', 'crm_workspaces', id.data, { text: `deleted the workspace “${data?.name ?? ''}” and its boards` });
  refresh();
  redirect('/base/crm/workspace');
}

export async function setWorkspaceMember(wsId: string, employeeId: string, role: 'owner' | 'member' | 'viewer' | null): Promise<ActionResult> {
  const viewer = await requireCrm();
  if (!(await manageWs(viewer, wsId))) return fail('Only a workspace owner or Workflow manager can manage members.');
  if (!uuid.safeParse(employeeId).success) return fail('Choose a person.');
  if (role) await db().from('crm_workspace_members').upsert({ workspace_id: wsId, employee_id: employeeId, role });
  else await db().from('crm_workspace_members').delete().eq('workspace_id', wsId).eq('employee_id', employeeId);
  refresh();
  return done();
}

// ------------------------------------------------------------------ folders --

export async function createFolder(wsId: string, name: string, parentId?: string | null): Promise<ActionResult> {
  const viewer = await requireCrm();
  if (!(await manageWs(viewer, wsId))) return fail('Only a workspace owner or Workflow manager can add folders.');
  const n = name.trim().slice(0, 80);
  if (!n) return fail('Name the folder.');
  const { count } = await db().from('crm_folders').select('id', { count: 'exact', head: true }).eq('workspace_id', wsId);
  const { data, error } = await db()
    .from('crm_folders')
    .insert({ workspace_id: wsId, parent_id: parentId && uuid.safeParse(parentId).success ? parentId : null, name: n, color: GROUP_COLORS[(count ?? 0) % GROUP_COLORS.length], position: count ?? 0 })
    .select('id')
    .single();
  if (error || !data) return fail('Couldn’t add the folder.');
  refresh();
  return done(undefined, { id: data.id });
}

export async function renameFolder(id: string, name: string): Promise<ActionResult> {
  const viewer = await requireCrm();
  const { data: f } = uuid.safeParse(id).success ? await db().from('crm_folders').select('workspace_id').eq('id', id).maybeSingle() : { data: null };
  if (!f || !(await manageWs(viewer, f.workspace_id))) return fail('Not allowed.');
  const n = name.trim().slice(0, 80);
  if (!n) return fail('Name the folder.');
  await db().from('crm_folders').update({ name: n }).eq('id', id);
  refresh();
  return done();
}

/** Deleting a folder keeps its boards — they move to the top of the workspace. */
export async function deleteFolder(id: string): Promise<ActionResult> {
  const viewer = await requireCrm();
  const { data: f } = uuid.safeParse(id).success ? await db().from('crm_folders').select('workspace_id, name').eq('id', id).maybeSingle() : { data: null };
  if (!f || !(await manageWs(viewer, f.workspace_id))) return fail('Not allowed.');
  // Boards in this folder and any sub-folders go to the top level (FK sets folder_id null).
  await db().from('crm_folders').delete().eq('id', id);
  await audit(viewer, 'crm.workspace', 'crm_folders', id, { text: `deleted the folder “${f.name}” (its boards were kept)` });
  refresh();
  return done();
}

// ------------------------------------------------------------------- boards --

async function manageBoard(viewer: Viewer, boardId: string) {
  if (!uuid.safeParse(boardId).success) return null;
  const { data: b } = await db().from('crm_boards').select('id, name, workspace_id, visibility, created_by').eq('id', boardId).maybeSingle();
  if (!b) return null;
  return (await boardAccess(viewer, b)).manage ? b : null;
}

export async function renameBoard(id: string, name: string): Promise<ActionResult> {
  const viewer = await requireCrm();
  const b = await manageBoard(viewer, id);
  if (!b) return fail('Only the board’s owner or a Workflow manager can rename it.');
  const n = name.trim().slice(0, 120);
  if (!n) return fail('Name the board.');
  await db().from('crm_boards').update({ name: n }).eq('id', id);
  refresh();
  return done();
}

/** Move a board to another folder (null = top level) and/or another workspace. */
export async function moveBoard(id: string, to: { workspace_id?: string; folder_id?: string | null }): Promise<ActionResult> {
  const viewer = await requireCrm();
  const b = await manageBoard(viewer, id);
  if (!b) return fail('Only the board’s owner or a Workflow manager can move it.');
  const ws = to.workspace_id ?? b.workspace_id;
  if (to.workspace_id && !(await manageWs(viewer, to.workspace_id))) return fail('You can’t add boards to that workspace.');
  let folder: string | null = to.folder_id ?? null;
  if (folder) {
    const { data: f } = await db().from('crm_folders').select('workspace_id').eq('id', folder).maybeSingle();
    if (!f || f.workspace_id !== ws) folder = null;
  }
  await db().from('crm_boards').update({ workspace_id: ws, folder_id: folder }).eq('id', id);
  refresh();
  return done();
}

export async function toggleFavorite(boardId: string): Promise<ActionResult> {
  const viewer = await requireCrm();
  if (!uuid.safeParse(boardId).success) return fail('Board not found.');
  const key = viewerKey(viewer);
  const { data } = await db().from('crm_favorites').select('board_id').eq('viewer', key).eq('board_id', boardId).maybeSingle();
  if (data) await db().from('crm_favorites').delete().eq('viewer', key).eq('board_id', boardId);
  else await db().from('crm_favorites').insert({ viewer: key, board_id: boardId });
  refresh();
  return done(undefined, { favorite: data ? 'no' : 'yes' });
}
