'use server';

import { z } from 'zod';
import { requireViewer, type Viewer } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { MAX_FILE_BYTES, safeFileName, storage } from '@/lib/base/storage';
import { boardAccess } from '@/lib/crm/boards';
import { canWorkTask } from '@/lib/tasks/access';

export type PortalFile = { id: string; item_id: string | null; column_id: string | null; task_id: string | null; name: string; mime: string; size: number; created_at: string; uploader_name: string | null };
type Target = { item_id?: string | null; column_id?: string | null; task_id?: string | null };

const uuid = z.string().uuid();

/** May this person add / remove files on that board cell or task? */
async function allowed(viewer: Viewer, t: Target): Promise<{ ok: true; boardId: string | null; folder: string } | { ok: false; message: string }> {
  if (t.task_id) {
    if (!uuid.safeParse(t.task_id).success) return { ok: false, message: 'Task not found.' };
    const { data: task } = await db().from('tasks').select('id, created_by, assignee_ids').eq('id', t.task_id).maybeSingle();
    if (!task || !canWorkTask(viewer, task)) return { ok: false, message: 'You can’t add files to this task.' };
    return { ok: true, boardId: null, folder: `tasks/${task.id}` };
  }
  if (!t.item_id || !t.column_id || !uuid.safeParse(t.item_id).success || !uuid.safeParse(t.column_id).success) return { ok: false, message: 'Choose where the file goes.' };
  const [{ data: item }, { data: col }] = await Promise.all([
    db().from('crm_board_items').select('id, board_id').eq('id', t.item_id).maybeSingle(),
    db().from('crm_board_columns').select('board_id, type').eq('id', t.column_id).maybeSingle(),
  ]);
  if (!item || !col || col.board_id !== item.board_id || col.type !== 'files') return { ok: false, message: 'That isn’t a files column.' };
  const { data: board } = await db().from('crm_boards').select('id, visibility, created_by').eq('id', item.board_id).maybeSingle();
  if (!board || !(await boardAccess(viewer, board)).edit) return { ok: false, message: 'You can view this board but not change it.' };
  return { ok: true, boardId: board.id, folder: `boards/${board.id}/${item.id}` };
}

/**
 * Step 1 of an upload: checks permission and returns a one-time signed URL the browser uploads
 * the file to directly (so big scans don't pass through the web server).
 */
export async function startUpload(t: Target, file: { name: string; size: number; type: string }): Promise<{ ok: true; url: string; path: string } | { ok: false; message: string }> {
  const viewer = await requireViewer();
  const a = await allowed(viewer, t);
  if (!a.ok) return a;
  if (!file.name || file.size <= 0) return { ok: false, message: 'That file is empty.' };
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: 'Files can be up to 25 MB.' };
  const path = `${a.folder}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { data, error } = await storage().createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: 'Couldn’t start the upload. Please try again.' };
  return { ok: true, url: data.signedUrl, path };
}

/** Step 2: the upload finished — record it (after checking the file really is there). */
export async function finishUpload(t: Target, path: string, file: { name: string; size: number; type: string }): Promise<{ ok: true; file: PortalFile } | { ok: false; message: string }> {
  const viewer = await requireViewer();
  const a = await allowed(viewer, t);
  if (!a.ok) return a;
  if (!path.startsWith(`${a.folder}/`) || path.includes('..')) return { ok: false, message: 'Upload not recognised.' };
  const folder = path.slice(0, path.lastIndexOf('/'));
  const { data: listed } = await storage().list(folder, { search: path.slice(path.lastIndexOf('/') + 1) });
  const obj = listed?.find((o) => `${folder}/${o.name}` === path);
  if (!obj) return { ok: false, message: 'The upload didn’t finish — please try again.' };
  const size = Number((obj.metadata as { size?: number } | null)?.size ?? file.size);
  const { data, error } = await db()
    .from('portal_files')
    .insert({
      board_id: a.boardId,
      item_id: t.task_id ? null : t.item_id,
      column_id: t.task_id ? null : t.column_id,
      task_id: t.task_id ?? null,
      name: file.name.slice(0, 200),
      mime: (file.type || 'application/octet-stream').slice(0, 120),
      size,
      path,
      uploaded_by: viewer.employeeId,
      uploader_name: viewer.name,
    })
    .select('id, item_id, column_id, task_id, name, mime, size, created_at, uploader_name')
    .single();
  if (error || !data) return { ok: false, message: 'Couldn’t save the file.' };
  if (t.item_id) await db().from('crm_board_updates').insert({ item_id: t.item_id, kind: 'log', body: `Added file ${file.name.slice(0, 120)}`, author_id: viewer.employeeId, author_name: viewer.name });
  if (t.task_id) await db().from('task_comments').insert({ task_id: t.task_id, kind: 'log', body: `Added file ${file.name.slice(0, 120)}`, author_id: viewer.employeeId, author_name: viewer.name });
  return { ok: true, file: data as PortalFile };
}

export async function deleteFile(id: string): Promise<{ ok: boolean; message?: string }> {
  const viewer = await requireViewer();
  if (!uuid.safeParse(id).success) return { ok: false, message: 'File not found.' };
  const { data: f } = await db().from('portal_files').select('id, item_id, column_id, task_id, path, name').eq('id', id).maybeSingle();
  if (!f) return { ok: false, message: 'File not found.' };
  const a = await allowed(viewer, f);
  if (!a.ok) return a;
  await storage().remove([f.path]);
  await db().from('portal_files').delete().eq('id', id);
  if (f.item_id) await db().from('crm_board_updates').insert({ item_id: f.item_id, kind: 'log', body: `Removed file ${f.name}`, author_id: viewer.employeeId, author_name: viewer.name });
  return { ok: true };
}
