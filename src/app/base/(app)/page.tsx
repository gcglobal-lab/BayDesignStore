import { redirect } from 'next/navigation';
import { isManager, requireViewer } from '@/lib/base/auth';

export default async function BaseHome() {
  const viewer = await requireViewer();
  redirect(isManager(viewer) ? '/base/manager' : '/base/my-week');
}
