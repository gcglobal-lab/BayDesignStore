'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { appOf } from '@/lib/portal/apps';

const query = '(prefers-color-scheme: dark)';
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(query);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};

/**
 * The page area. Workflow and Deliveries follow the person's light / dark choice; Time keeps
 * its usual light look. (The menu bar stays dark in both.)
 */
export default function PortalMain({ theme, children }: { theme: 'light' | 'dark' | 'system'; children: ReactNode }) {
  const pathname = usePathname() ?? '/base';
  const app = appOf(pathname);
  // Workspace pages draw their own middle column, so they run edge to edge.
  const bleed = pathname.startsWith('/base/crm/workspace');
  const systemDark = useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
  const dark = app !== 'time' && (theme === 'dark' || (theme === 'system' && systemDark));
  return (
    <main data-theme={dark ? 'dark' : 'light'} data-app={app} className={`lg:pl-64 print:!pl-0 ${dark || app === 'crm' ? 'min-h-screen bg-linen text-ink' : ''}`}>
      {bleed ? children : <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">{children}</div>}
    </main>
  );
}
