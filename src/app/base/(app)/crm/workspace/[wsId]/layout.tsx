import { notFound, redirect } from 'next/navigation';
import WorkspacePanel from '@/components/crm/workspace/WorkspacePanel';
import { requireCrm } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { workspaceAccess, workspaceTree, type Workspace } from '@/lib/crm/workspaces';

/** Workflow ▸ Workspace: the workspace panel (middle column) next to the page (right column). */
export default async function WorkspaceLayout({ children, params }: LayoutProps<'/base/crm/workspace/[wsId]'>) {
  const viewer = await requireCrm();
  const { wsId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(wsId)) notFound();
  const { data: ws } = await db().from('crm_workspaces').select('*').eq('id', wsId).maybeSingle<Workspace>();
  if (!ws) notFound();
  const access = await workspaceAccess(viewer, ws);
  if (!access.see) redirect('/base/crm/workspace');
  const tree = await workspaceTree(viewer, wsId);
  return (
    <div className="flex min-h-screen">
      <WorkspacePanel
        workspace={ws}
        workspaces={tree.workspaces}
        folders={tree.folders}
        boards={tree.boards}
        favorites={tree.favorites}
        favoriteIds={tree.favoriteIds}
        canManageWs={access.manage}
        isManager={viewer.crm === 'manager'}
      />
      <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</div>
    </div>
  );
}
