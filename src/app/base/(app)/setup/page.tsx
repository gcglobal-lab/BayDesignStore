import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Database } from 'lucide-react';
import { requireViewer } from '@/lib/base/auth';
import { isDbConfigured } from '@/lib/base/env';

export const metadata: Metadata = { title: 'Finish setup' };

const code = 'rounded bg-linen px-1.5 py-0.5 text-[0.8rem]';

export default async function SetupPage() {
  await requireViewer({ allowNoDatabase: true });
  if (isDbConfigured()) redirect('/base');

  return (
    <div className="b-card mx-auto mt-10 max-w-2xl p-8 sm:p-10">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sand text-brass-dark">
        <Database size={22} />
      </div>
      <h1 className="b-h1 mt-5">Connect the database</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">You’re signed in as the administrator, but Bay Design Base doesn’t have a database yet. To finish setup:</p>
      <ol className="mt-5 list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-ink">
        <li>Create a Supabase project.</li>
        <li>
          In its SQL editor, run <code className={code}>supabase/migrations/20261010000000_bay_design_base.sql</code>, then <code className={code}>supabase/seed.sql</code>.
        </li>
        <li>
          Add <code className={code}>SUPABASE_URL</code> and <code className={code}>SUPABASE_SERVICE_ROLE_KEY</code> to <code className={code}>.env.local</code> and restart the app.
        </li>
      </ol>
    </div>
  );
}
