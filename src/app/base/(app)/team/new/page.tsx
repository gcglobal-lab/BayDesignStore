import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import EmployeeForm from '@/components/base/EmployeeForm';
import { PageHeader } from '@/components/base/ui';
import { requireAdmin } from '@/lib/base/auth';
import { listLocations, listRoles } from '@/lib/base/queries';

export const metadata: Metadata = { title: 'Add team member' };

export default async function NewEmployeePage() {
  const viewer = await requireAdmin();
  const [roles, locations] = await Promise.all([listRoles(), listLocations()]);
  return (
    <>
      <Link href="/base/team" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> Team roster</Link>
      <PageHeader eyebrow="Team" title="Add team member" description="Add an employee or a manager. They sign in with the login ID and the password the admin sets — nobody can sign up on their own." />
      <div className="b-card b-card-pad max-w-3xl">
        <EmployeeForm roles={roles} locations={locations} canSetLevel={viewer.level === 'admin'} isAdmin={viewer.level === 'admin'} />
      </div>
    </>
  );
}
