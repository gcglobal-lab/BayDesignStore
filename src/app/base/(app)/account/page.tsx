import type { Metadata } from 'next';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Avatar, Card, PageHeader } from '@/components/base/ui';
import { requireViewer } from '@/lib/base/auth';
import { getEmployee } from '@/lib/base/queries';
import { fullName } from '@/lib/base/types';

export const metadata: Metadata = { title: 'My profile' };

export default async function AccountPage() {
  const viewer = await requireViewer();
  const me = viewer.employeeId ? await getEmployee(viewer.employeeId) : null;

  return (
    <>
      <PageHeader eyebrow="Account" title="My profile" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {me ? (
          <Card title="Your details">
            <div className="flex items-center gap-3">
              <Avatar name={fullName(me)} size="lg" />
              <div>
                <p className="font-medium">{fullName(me)}</p>
                <p className="text-sm capitalize text-muted">{me.access_level}{me.roles[0] ? ` · ${me.roles[0].name}` : ''}</p>
              </div>
            </div>
            <dl className="mt-5 divide-y divide-stone/50 text-sm">
              {[
                ['Login ID', <span key="l" className="font-mono">{me.login_id}</span>],
                ['Email', me.email ?? '—'],
                ['Phone', me.phone ?? '—'],
                ['Roles', me.roles.map((r) => r.name).join(', ') || '—'],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between gap-4 py-2.5">
                  <dt className="text-muted">{label}</dt>
                  <dd className="truncate text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ) : (
          <Card title="Built-in administrator">
            <p className="text-sm text-muted">
              You’re signed in as the built-in administrator. Its password is stored (hashed) in the server’s <code className="rounded bg-linen px-1.5 py-0.5">.env.local</code> file.
              Run <code className="rounded bg-linen px-1.5 py-0.5">npm run hash-password</code> and update <code className="rounded bg-linen px-1.5 py-0.5">ADMIN_PASSWORD_HASH</code> to change it.
            </p>
          </Card>
        )}
        <Card title={<h2 className="b-h2 flex items-center gap-2"><KeyRound size={18} className="text-brass" /> Password</h2>}>
          <p className="text-sm text-muted">Passwords are created and changed by the admin. If you forgot yours or want a new one, ask the admin — or use the assistant (bottom right) to send them a request.</p>
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-linen p-3 text-xs text-muted">
            <ShieldCheck size={14} className="mt-px flex-none text-brass" /> Need to update your details? Ask a manager — they can edit your profile from the team roster.
          </p>
        </Card>
      </div>
    </>
  );
}
