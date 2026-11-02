import type { Metadata } from 'next';
import ActivityFeed from '@/components/base/ActivityFeed';
import { requireAdmin } from '@/lib/base/auth';
import { getSettings } from '@/lib/base/settings';

export const metadata: Metadata = { title: 'Workflow activity' };

export default async function ActivityPage({ searchParams }: PageProps<'/base/crm/activity'>) {
  await requireAdmin();
  const [sp, settings] = await Promise.all([searchParams, getSettings()]);
  return <ActivityFeed app="crm" sp={sp} zone={settings.timezone} />;
}
