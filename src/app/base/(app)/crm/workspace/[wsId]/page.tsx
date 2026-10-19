import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArchiveRestore, Clock, Folder, Lock, Table2, Trash2, Users } from 'lucide-react';
import { SubmitButton } from '@/components/base/forms';
import { Card, EmptyState } from '@/components/base/ui';
import { FavoriteStar, WorkspaceMembers } from '@/components/crm/workspace/WorkspaceBits';
import { requireCrm } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { listEmployees } from '@/lib/base/queries';
import { getSettings } from '@/lib/base/settings';
import { fmtDate } from '@/lib/base/time';
import { fullName } from '@/lib/base/types';
import { getWorkspace, workspaceAccess, workspaceTree } from '@/lib/crm/workspaces';
import { archiveBoard, deleteBoard } from '../../boards/actions';

export const metadata: Metadata = { title: 'Workspace' };

const TABS = [
  { key: 'recents', label: 'Recents', icon: Clock },
  { key: 'content', label: 'Content', icon: Table2 },
  { key: 'members', label: 'Members', icon: Users },
  { key: 'archive', label: 'Archive', icon: ArchiveRestore },
] as const;

/** Manage workspace: the workspace's home, like monday.com. */
export default async function WorkspaceHome({ params, searchParams }: PageProps<'/base/crm/workspace/[wsId]'>) {
  const viewer = await requireCrm();
  const { wsId } = await params;
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? 'recents';
  const ws = await getWorkspace(wsId);
  if (!ws) notFound();
  const [access, tree, { timezone: zone }, employees, membersRes] = await Promise.all([
    workspaceAccess(viewer, ws),
    workspaceTree(viewer, wsId),
    getSettings(),
    listEmployees(),
    db().from('crm_workspace_members').select('employee_id, role').eq('workspace_id', wsId),
  ]);
  const live = tree.boards.filter((b) => !b.archived);
  const archived = tree.boards.filter((b) => b.archived);
  const ids = live.map((b) => b.id);
  const { data: rows } = ids.length ? await db().from('crm_board_items').select('board_id').in('board_id', ids).is('parent_id', null) : { data: [] };
  const counts = new Map<string, number>();
  (rows ?? []).forEach((r) => counts.set(r.board_id, (counts.get(r.board_id) ?? 0) + 1));
  const folderName = new Map(tree.folders.map((f) => [f.id, f.name]));
  const favs = new Set(tree.favoriteIds);
  const people = employees.map((e) => ({ id: e.id, name: fullName(e) }));
  const names = new Map(people.map((p) => [p.id, p.name]));
  const href = (id: string) => `/base/crm/workspace/${wsId}/board/${id}`;

  return (
    <div className="-mx-4 -mt-6 sm:-mx-6 lg:-mx-8">
      <div className="h-36 sm:h-44" style={{ background: `linear-gradient(120deg, ${ws.color}33, ${ws.color}10 60%, transparent)` }} />
      <div className="px-4 sm:px-6 lg:px-10">
        <div className="-mt-14 flex flex-wrap items-end gap-5">
          <span className="relative flex h-28 w-28 items-center justify-center rounded-3xl text-5xl font-bold text-white shadow-xl ring-4 ring-linen" style={{ background: ws.color }}>{ws.name[0]?.toUpperCase()}</span>
          <div className="pb-2">
            <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">{ws.name} {ws.visibility === 'members' && <Lock size={18} className="text-muted" aria-label="Closed workspace" />}</h1>
            <p className="text-sm text-muted">{ws.description ?? `${live.length} board${live.length === 1 ? '' : 's'} · ${tree.folders.length} folder${tree.folders.length === 1 ? '' : 's'}`}</p>
          </div>
        </div>

        <nav className="mt-6 flex gap-1 border-b border-stone/70" aria-label="Workspace">
          {TABS.map((t) => (
            <Link key={t.key} href={`/base/crm/workspace/${wsId}?tab=${t.key}`} aria-current={tab === t.key ? 'page' : undefined} className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm ${tab === t.key ? 'border-brass font-medium text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
              <t.icon size={15} /> {t.label}
              {t.key === 'archive' && archived.length > 0 && <span className="rounded-full bg-sand px-1.5 text-[0.68rem]">{archived.length}</span>}
            </Link>
          ))}
        </nav>

        <div className="py-6">
          {tab === 'recents' &&
            (live.length === 0 ? (
              <Card><EmptyState icon={<Table2 size={20} />} title="No boards yet.">Use the + next to the workspace name to add a board — try the “Designer deposits” template.</EmptyState></Card>
            ) : (
              <ul className="divide-y divide-stone/60 rounded-xl border border-stone/70 bg-surface">
                {[...live].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 12).map((b) => (
                  <li key={b.id} className="flex items-center gap-3 px-4 py-3 hover:bg-linen">
                    <Table2 size={17} className="text-muted" />
                    <Link href={href(b.id)} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-brass">{b.name}</Link>
                    <span className="hidden text-xs text-muted sm:inline">{b.folder_id ? folderName.get(b.folder_id) : ''}</span>
                    <span className="hidden w-32 text-right text-xs text-muted md:inline">updated {fmtDate(new Date(b.updated_at), zone, 'MMM d')}</span>
                    <FavoriteStar boardId={b.id} on={favs.has(b.id)} />
                  </li>
                ))}
              </ul>
            ))}

          {tab === 'content' && (
            <div className="overflow-x-auto rounded-xl border border-stone/70 bg-surface">
              <table className="b-table b-table-plain">
                <thead><tr><th>Board</th><th>Folder</th><th>Rows</th><th>Created by</th><th>Updated</th><th /></tr></thead>
                <tbody>
                  {live.map((b) => (
                    <tr key={b.id}>
                      <td><Link href={href(b.id)} className="flex items-center gap-2 font-medium hover:text-brass"><Table2 size={15} className="text-muted" /> {b.name} {b.visibility === 'members' && <Lock size={12} className="text-muted" />}</Link></td>
                      <td className="text-muted">{b.folder_id ? <span className="inline-flex items-center gap-1"><Folder size={13} /> {folderName.get(b.folder_id)}</span> : '—'}</td>
                      <td>{counts.get(b.id) ?? 0}</td>
                      <td className="text-muted">{b.created_by ? names.get(b.created_by) ?? '—' : '—'}</td>
                      <td className="text-muted">{fmtDate(new Date(b.updated_at), zone, 'MMM d, yyyy')}</td>
                      <td><FavoriteStar boardId={b.id} on={favs.has(b.id)} /></td>
                    </tr>
                  ))}
                  {live.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-sm text-muted">No boards yet.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'members' && (
            <div className="max-w-3xl">
              <p className="mb-4 text-sm text-muted">
                {ws.visibility === 'members' ? 'This is a closed workspace — only members (and Workflow managers) can see it.' : 'This workspace is open to everyone with Workflow access. Owners can add boards and folders; add people here to make them owners.'}
              </p>
              <WorkspaceMembers wsId={wsId} members={(membersRes.data ?? []) as { employee_id: string; role: 'owner' | 'member' | 'viewer' }[]} people={people} canManage={access.manage} />
            </div>
          )}

          {tab === 'archive' &&
            (archived.length === 0 ? (
              <Card><EmptyState icon={<ArchiveRestore size={20} />} title="Nothing archived." /></Card>
            ) : (
              <ul className="divide-y divide-stone/60 rounded-xl border border-stone/70 bg-surface">
                {archived.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <Table2 size={17} className="text-muted" />
                    <Link href={href(b.id)} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-brass">{b.name}</Link>
                    <span className="text-xs text-muted">archived · updated {fmtDate(new Date(b.updated_at), zone, 'MMM d')}</span>
                    {access.manage && (
                      <form action={archiveBoard}>
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="archived" value="false" />
                        <SubmitButton className="b-btn-ghost b-btn-sm"><ArchiveRestore size={13} /> Restore</SubmitButton>
                      </form>
                    )}
                    {viewer.crm === 'manager' && (
                      <form action={deleteBoard}>
                        <input type="hidden" name="id" value={b.id} />
                        <SubmitButton className="b-btn-quiet b-btn-sm text-red-600" confirm={`Delete “${b.name}” for good?`}><Trash2 size={13} /> Delete</SubmitButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ))}
        </div>
      </div>
    </div>
  );
}
