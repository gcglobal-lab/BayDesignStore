import { redirect } from 'next/navigation';
import { requireCrm } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { visibleWorkspaces } from '@/lib/crm/workspaces';

/** Opens the first workspace you can see (a manager's first visit creates "Main workspace"). */
export default async function WorkspaceIndex() {
  const viewer = await requireCrm();
  const list = await visibleWorkspaces(viewer);
  if (list[0]) redirect(`/base/crm/workspace/${list[0].id}`);
  if (viewer.crm === 'manager') {
    const { data } = await db().from('crm_workspaces').insert({ name: 'Main workspace', color: '#E2445C', created_by: viewer.employeeId }).select('id').single();
    if (data) redirect(`/base/crm/workspace/${data.id}`);
  }
  redirect('/base/crm');
}
