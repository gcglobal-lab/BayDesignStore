import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import Sidebar from '@/components/base/Sidebar';
import BaseChat from '@/components/chat/BaseChat';
import { isManager, requireViewer } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { isDbConfigured } from '@/lib/base/env';
import { CacheKeys, memo } from '@/lib/base/memo';

/** Unread website inquiries, for the sidebar badge (managers and admins only). */
async function newInquiryCount(manager: boolean): Promise<number> {
  if (!manager || !isDbConfigured()) return 0;
  return memo(CacheKeys.inquiries, 15_000, async () => {
    const { count, error } = await db().from('inquiries').select('id', { count: 'exact', head: true }).eq('status', 'new');
    if (error) throw new Error(error.message);
    return count ?? 0;
  }).catch(() => 0);
}

export const metadata: Metadata = {
  title: { template: '%s | Bay Design Base', default: 'Bay Design Base' },
  robots: { index: false, follow: false },
};

export default async function BaseAppLayout({ children }: { children: ReactNode }) {
  const path = (await headers()).get('x-base-path') ?? '';
  // First sign-in with a password someone else chose: pick your own before anything else
  // (requireViewer enforces this — and the database check — for every page and action too).
  const viewer = await requireViewer({ allowNoDatabase: path === '/base/setup' });

  return (
    <div className="base-theme min-h-screen bg-linen bg-[radial-gradient(ellipse_at_top_right,rgba(167,139,250,0.20),transparent_50%),radial-gradient(ellipse_at_top_left,rgba(56,189,248,0.10),transparent_45%),radial-gradient(ellipse_at_bottom_right,rgba(244,114,182,0.10),transparent_50%)] bg-fixed">
      <Sidebar viewer={{ name: viewer.name, level: viewer.level, onRoster: viewer.employeeId !== null, newInquiries: await newInquiryCount(isManager(viewer)) }} />
      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">{children}</div>
      </main>
      <BaseChat firstName={viewer.firstName} level={viewer.level} />
    </div>
  );
}
