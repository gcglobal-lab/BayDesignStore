import { getViewer } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { isDbConfigured } from '@/lib/base/env';
import { storage } from '@/lib/base/storage';
import { boardAccess } from '@/lib/crm/boards';
import { canWorkTask } from '@/lib/tasks/access';

/** Opens (or with ?download=1 downloads) an attached file through a short-lived private link. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  const { id } = await params;
  if (!viewer || !isDbConfigured() || !/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });
  const { data: f } = await db().from('portal_files').select('board_id, task_id, path, name').eq('id', id).maybeSingle();
  if (!f) return new Response('Not found', { status: 404 });
  if (f.task_id) {
    const { data: t } = await db().from('tasks').select('created_by, assignee_ids').eq('id', f.task_id).maybeSingle();
    if (!t || !canWorkTask(viewer, t)) return new Response('Not found', { status: 404 });
  } else {
    const { data: b } = f.board_id ? await db().from('crm_boards').select('id, visibility, created_by').eq('id', f.board_id).maybeSingle() : { data: null };
    if (!b || !(await boardAccess(viewer, b)).see) return new Response('Not found', { status: 404 });
  }
  const download = new URL(request.url).searchParams.get('download') === '1';
  const { data, error } = await storage().createSignedUrl(f.path, 300, download ? { download: f.name } : undefined);
  if (error || !data) return new Response('File unavailable', { status: 404 });
  return new Response(null, { status: 302, headers: { Location: data.signedUrl, 'Cache-Control': 'private, max-age=240' } });
}
