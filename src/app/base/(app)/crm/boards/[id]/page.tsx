import { notFound, redirect } from 'next/navigation';
import { requireCrm } from '@/lib/base/auth';
import { db } from '@/lib/base/db';

/** Old board links → the board inside its workspace. */
export default async function BoardRedirect({ params, searchParams }: PageProps<'/base/crm/boards/[id]'>) {
  await requireCrm();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await db().from('crm_boards').select('workspace_id').eq('id', id).maybeSingle();
  if (!data) notFound();
  redirect(`/base/crm/workspace/${data.workspace_id}/board/${id}${typeof sp.item === 'string' ? `?item=${sp.item}` : ''}`);
}
