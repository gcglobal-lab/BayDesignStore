import { notFound, redirect } from 'next/navigation';
import WorkspacePanel from '@/components/crm/workspace/WorkspacePanel';
import { requireCrm } from '@/lib/base/auth';
import { getWorkspace, workspaceAccess, workspaceTree } from '@/lib/crm/workspaces';

/** Workflow ▸ Workspace: the workspace panel (middle column) next to the page (right column). */
export default async function WorkspaceLayout({ children, params }: LayoutProps<'/base/crm/workspace/[wsId]'>) {
  const viewer = await requireCrm();
  const { wsId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(wsId)) notFound();
  // The workspace and its panel tree load together (the page below reuses both from the per-request cache).
  const treeP = workspaceTree(viewer, wsId);
  treeP.catch(() => {}); // awaited below; avoids an unhandled rejection on notFound()
  const ws = await getWorkspace(wsId);
  if (!ws) notFound();
  const [access, tree] = await Promise.all([workspaceAccess(viewer, ws), treeP]);
  if (!access.see) redirect('/base/crm/workspace');
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
