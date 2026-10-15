import { audit } from '@/lib/base/audit';
import { getViewer } from '@/lib/base/auth';
import { isDbConfigured } from '@/lib/base/env';
import { listEmployees } from '@/lib/base/queries';
import { getSettings } from '@/lib/base/settings';
import { fmtDate, fmtTime } from '@/lib/base/time';
import { fullName } from '@/lib/base/types';
import { boardPdf, boardXlsx, type Scope } from '@/lib/crm/boardExport';
import { boardAccess, loadBoard } from '@/lib/crm/boards';

/** Download a board, one group (e.g. a designer) or one row (e.g. a client) as Excel or PDF. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  const { id } = await params;
  if (!viewer || viewer.crm === 'none' || !isDbConfigured() || !/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });
  const data = await loadBoard(id);
  if (!data || !(await boardAccess(viewer, data.board)).see) return new Response('Not found', { status: 404 });
  const url = new URL(request.url);
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx';
  const groupId = url.searchParams.get('group');
  const itemId = url.searchParams.get('item');
  const group = groupId ? data.groups.find((g) => g.id === groupId) : undefined;
  const item = itemId ? data.items.find((i) => i.id === itemId) : undefined;
  const scope: Scope = item ? { kind: 'item', item } : group ? { kind: 'group', group } : { kind: 'board' };
  const names = Object.fromEntries((await listEmployees(true)).map((e) => [e.id, fullName(e)]));
  const { timezone: zone } = await getSettings();
  const generated = `${fmtDate(new Date(), zone, 'MMM d, yyyy')} ${fmtTime(new Date(), zone)}`;
  const label = item ? item.name : group ? `${data.board.name} ${group.name}` : data.board.name;
  const file = `${label}`.replace(/[^a-zA-Z0-9 ._-]/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'board';
  await audit(viewer, 'crm.board_export', 'crm_boards', id, { text: `downloaded ${label} (${format === 'pdf' ? 'PDF' : 'Excel'})` });
  const body = format === 'pdf' ? boardPdf(data, scope, names, generated) : await boardXlsx(data, scope, names);
  return new Response(body, {
    headers: {
      'Content-Type': format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${file}.${format}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
