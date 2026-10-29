import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import Sidebar from '@/components/base/Sidebar';
import BaseChat from '@/components/chat/BaseChat';
import PortalMain from '@/components/portal/PortalMain';
import { isManager, requireViewer, type Viewer } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { isDbConfigured } from '@/lib/base/env';
import { CacheKeys, memo } from '@/lib/base/memo';
import { getSettings } from '@/lib/base/settings';
import { todayYmd } from '@/lib/base/time';
import { readTheme } from '@/lib/portal/theme';

/** Unread website inquiries, for the sidebar badge (managers and admins only). */
async function newInquiryCount(manager: boolean): Promise<number> {
  if (!manager || !isDbConfigured()) return 0;
  return memo(CacheKeys.inquiries, 15_000, async () => {
    const { count, error } = await db().from('inquiries').select('id', { count: 'exact', head: true }).eq('status', 'new');
    if (error) throw new Error(error.message);
    return count ?? 0;
  }).catch(() => 0);
}

/** Badges: new Workflow leads, and this person's open tasks due today or overdue. */
async function crmCounts(viewer: Viewer): Promise<{ newLeads: number; tasksDue: number }> {
  if (!isDbConfigured()) return { newLeads: 0, tasksDue: 0 };
  return memo(`${CacheKeys.crmBadges}${viewer.id}`, 15_000, async () => {
    const { timezone } = await getSettings();
    const today = todayYmd(timezone);
    const [leads, tasks] = await Promise.all([
      viewer.crm !== 'none' ? db().from('crm_leads').select('id', { count: 'exact', head: true }).eq('status', 'new') : Promise.resolve({ count: 0 }),
      viewer.employeeId
        ? db().from('tasks').select('id', { count: 'exact', head: true }).contains('assignee_ids', [viewer.employeeId]).neq('status', 'done').lte('due_date', today)
        : Promise.resolve({ count: 0 }),
    ]);
    return { newLeads: leads.count ?? 0, tasksDue: tasks.count ?? 0 };
  }).catch(() => ({ newLeads: 0, tasksDue: 0 }));
}

export const metadata: Metadata = {
  title: { template: '%s | Employee Portal', default: 'Employee Portal' },
  robots: { index: false, follow: false },
  manifest: '/portal.webmanifest',
  appleWebApp: { capable: true, title: 'BD Portal', statusBarStyle: 'default' },
  icons: { icon: [{ url: '/favicon.ico', sizes: '48x48' }, { url: '/favicon.svg', type: 'image/svg+xml' }], apple: { url: '/portal-apple-icon.png', sizes: '180x180' } },
};

export default async function BaseAppLayout({ children }: { children: ReactNode }) {
  const path = (await headers()).get('x-base-path') ?? '';
  // First sign-in with a password someone else chose: pick your own before anything else
  // (requireViewer enforces this — and the database check — for every page and action too).
  const viewer = await requireViewer({ allowNoDatabase: path === '/base/setup' });
  const [newInquiries, crm, theme] = await Promise.all([newInquiryCount(isManager(viewer)), crmCounts(viewer), readTheme()]);

  return (
    <div className="base-theme min-h-screen bg-linen bg-[radial-gradient(ellipse_at_top_right,rgba(167,139,250,0.20),transparent_50%),radial-gradient(ellipse_at_top_left,rgba(56,189,248,0.10),transparent_45%),radial-gradient(ellipse_at_bottom_right,rgba(244,114,182,0.10),transparent_50%)] lg:bg-fixed">
      <Sidebar
        viewer={{
          name: viewer.name,
          level: viewer.level,
          onRoster: viewer.employeeId !== null,
          crm: viewer.crm,
          deliveries: viewer.deliveries,
          newInquiries,
          ...crm,
        }}
        theme={theme}
      />
      <PortalMain theme={theme}>{children}</PortalMain>
      <BaseChat firstName={viewer.firstName} level={viewer.level} />
    </div>
  );
}
