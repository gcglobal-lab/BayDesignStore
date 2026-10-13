import type { Metadata } from 'next';
import { KeyRound, ShieldCheck } from 'lucide-react';
import PasswordChangeForm from '@/components/base/PasswordChangeForm';
import { Avatar, Card, PageHeader } from '@/components/base/ui';
import { requireViewer } from '@/lib/base/auth';
import { getEmployee } from '@/lib/base/queries';
import { fullName } from '@/lib/base/types';

export const metadata: Metadata = { title: 'Account & Password' };

export default async function AccountPage() {
  const viewer = await requireViewer({ allowPasswordChange: true });
  const me = viewer.employeeId ? await getEmployee(viewer.employeeId) : null;
  const welcome = viewer.mustChangePassword;

  return (
    <>
      <PageHeader eyebrow="Account" title={welcome ? `Welcome, ${viewer.firstName}` : 'Account & Password'} description={welcome ? 'Before you start, choose your own password. Only you will know it.' : undefined} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card title={<h2 className="b-h2 flex items-center gap-2"><KeyRound size={18} className="text-brass" /> {welcome ? 'Choose your password' : 'Change password'}</h2>}>
          {viewer.employeeId ? (
            <PasswordChangeForm welcome={welcome} />
          ) : (
            <p className="text-sm text-muted">
              You’re signed in as the built-in administrator. Its password is stored (hashed) in the server’s <code className="rounded bg-linen px-1.5 py-0.5">.env.local</code> file.
              Run <code className="rounded bg-linen px-1.5 py-0.5">npm run hash-password</code> and update <code className="rounded bg-linen px-1.5 py-0.5">ADMIN_PASSWORD_HASH</code> to change it.
            </p>
          )}
        </Card>
        {me && (
          <Card title="Your profile">
            <div className="flex items-center gap-3">
              <Avatar name={fullName(me)} size="lg" />
              <div>
                <p className="font-medium">{fullName(me)}</p>
                <p className="text-sm capitalize text-muted">{me.access_level}{me.roles[0] ? ` · ${me.roles[0].name}` : ''}</p>
              </div>
            </div>
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted">Login ID</dt><dd className="font-mono">{me.login_id}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Email</dt><dd className="truncate">{me.email ?? '—'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Phone</dt><dd>{me.phone ?? '—'}</dd></div>
            </dl>
            <p className="mt-5 flex items-start gap-2 rounded-xl bg-linen p-3 text-xs text-muted">
              <ShieldCheck size={14} className="mt-px flex-none text-brass" /> Need to update your details? Ask a manager — they can edit your profile from the team roster.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
