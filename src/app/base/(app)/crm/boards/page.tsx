import { redirect } from 'next/navigation';

/** Boards now live in Workflow ▸ Workspace. */
export default function BoardsRedirect() {
  redirect('/base/crm/workspace');
}
