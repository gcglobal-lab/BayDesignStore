import type { Metadata } from 'next';
import Link from 'next/link';
import { Download, ExternalLink, KeyRound, Plus, Search, UserRound } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import { GenerateMissingPasswords, PasswordCell } from '@/components/base/EmployeeAdminForms';
import EmployeeForm from '@/components/base/EmployeeForm';
import PrintButton from '@/components/base/PrintButton';
import StoreSelect from '@/components/base/StoreSelect';
import { Avatar, EmptyState, PageHeader } from '@/components/base/ui';
import { requireManager } from '@/lib/base/auth';
import { passwordsFor } from '@/lib/base/passwords';
import { listEmployees, listLocations, listRoles } from '@/lib/base/queries';
import { fullName, wageLabel, type Employee } from '@/lib/base/types';

export const metadata: Metadata = { title: 'Team Roster' };

function StatusCell({ e }: { e: Employee }) {
  if (e.status === 'terminated') return <span className="b-badge-gray">Terminated</span>;
  if (!e.has_password) return <span className="b-badge-amber" title="No password set yet — they can’t sign in">Pending</span>;
  return <span className="b-badge-green">Active</span>;
}

export default async function RosterPage({ searchParams }: PageProps<'/base/team'>) {
  const viewer = await requireManager();
  const admin = viewer.level === 'admin';
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q.trim().toLowerCase().slice(0, 80) : '';
  const showTerminated = sp.terminated === '1';
  const [all, locations, roles, passwords] = await Promise.all([listEmployees(true), listLocations(), listRoles(), passwordsFor(viewer)]);

  const visible = all
    .filter((e) => showTerminated || e.status !== 'terminated')
    .filter((e) => !q || [fullName(e), e.email, e.phone, e.login_id, ...e.roles.map((r) => r.name)].some((v) => v?.toLowerCase().includes(q)));
  const activeCount = all.filter((e) => e.status !== 'terminated').length;
  const missing = all.filter((e) => e.status !== 'terminated' && !e.has_password).length;
  const roleOptions = roles.map((r) => ({ id: r.id, name: r.name, color: r.color, work_type: r.work_type }));
  const storeOptions = locations.filter((l) => l.is_active).map((l) => ({ id: l.id, name: l.name }));
  const locationOptions = locations.map((l) => ({ id: l.id, name: l.name }));

  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Team roster"
        description={`${activeCount} team member${activeCount === 1 ? '' : 's'} · click a name to see and edit everything${admin ? ', including the password' : ''}`}
        actions={
          <>
            {admin && <GenerateMissingPasswords count={missing} />}
            <PrintButton />
            <a href={`/base/team/export${showTerminated ? '?terminated=1' : ''}`} className="b-btn-ghost"><Download size={15} /> Export</a>
            {admin && <Link href="/base/team/new" className="b-btn-brass"><Plus size={16} /> Add team member</Link>}
          </>
        }
      />

      {admin && missing > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          <KeyRound size={17} className="mt-0.5 flex-none" />
          <p>
            <span className="font-semibold">{missing} team member{missing === 1 ? '' : 's'} can’t sign in yet.</span> Click a name and type a password (or press Generate), then Save — or use “Passwords for {missing} without one” above to create them all at once. Every password is shown in the Password column.
          </p>
        </div>
      )}

      <div className="b-card overflow-hidden">
        <form className="flex flex-wrap items-center gap-3 border-b border-stone/50 px-4 py-3 sm:px-5" role="search">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={q} className="b-input pl-9" placeholder="Search name, email, phone or role…" aria-label="Search team members" />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="terminated" value="1" defaultChecked={showTerminated} className="b-check" /> Show terminated
          </label>
          <button type="submit" className="b-btn-ghost b-btn-sm">Apply</button>
          <span className="ml-auto text-xs text-muted">{visible.length} shown</span>
        </form>

        {visible.length === 0 ? (
          <EmptyState icon={<UserRound size={20} />} title="No team members match your search." />
        ) : (
          <div className="overflow-x-auto">
            <table className="b-table min-w-[1000px]">
              <thead>
                <tr>
                  <th>Team member</th>
                  <th>Contact information</th>
                  <th>Access</th>
                  <th>Store</th>
                  <th>Role</th>
                  <th>Wage</th>
                  {admin && <th>Login · Password</th>}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => {
                  const canEdit = admin || e.access_level === 'employee' || e.id === viewer.employeeId;
                  const person = (
                    <span className="group flex items-center gap-3 text-left">
                      <span className="rounded-full ring-2 ring-transparent transition-all group-hover:ring-violet-300"><Avatar name={fullName(e)} /></span>
                      <span>
                        <span className="block font-medium text-ink underline-offset-2 group-hover:text-brass-dark group-hover:underline">{fullName(e)}</span>
                        {(e.title || e.is_contractor) && <span className="block text-xs text-muted">{e.title ?? 'Contractor'}</span>}
                      </span>
                    </span>
                  );
                  return (
                    <tr key={e.id} className={e.status === 'terminated' ? 'opacity-60' : ''}>
                      <td>
                        {canEdit ? (
                          <Dialog trigger={person} triggerClassName="block" title={fullName(e)} description={<Link href={`/base/team/${e.id}`} className="inline-flex items-center gap-1 font-medium text-brass-dark hover:underline">Full profile, wage, leave & time cards <ExternalLink size={12} /></Link>} wide>
                            <EmployeeForm
                              isAdmin={admin}
                              isSelf={e.id === viewer.employeeId}
                              canSetLevel={admin}
                              roles={roleOptions}
                              locations={locationOptions}
                              values={{
                                id: e.id,
                                first_name: e.first_name,
                                last_name: e.last_name,
                                email: e.email,
                                phone: e.phone,
                                login_id: e.login_id,
                                access_level: e.access_level,
                                location_id: e.location_id,
                                title: e.title,
                                is_contractor: e.is_contractor,
                                birthday: e.birthday,
                                hire_date: e.hire_date,
                                role_ids: e.roles.map((r) => r.id),
                                primary_role_id: e.roles.find((r) => r.is_primary)?.id ?? null,
                                password: admin ? (e.has_password ? (passwords.get(e.id) ?? null) : '') : undefined,
                              }}
                            />
                          </Dialog>
                        ) : (
                          <Link href={`/base/team/${e.id}`}>{person}</Link>
                        )}
                      </td>
                      <td className="text-sm">
                        {e.email ? <a href={`mailto:${e.email}`} className="block max-w-[240px] truncate hover:text-brass-dark">{e.email}</a> : <span className="block text-xs text-muted">No email</span>}
                        {e.phone ? <a href={`tel:${e.phone}`} className="block text-muted">{e.phone}</a> : <span className="block text-xs text-muted">No phone</span>}
                      </td>
                      <td className="capitalize">{e.access_level}</td>
                      <td><StoreSelect employeeId={e.id} value={e.location_id} locations={storeOptions} disabled={!canEdit || e.status === 'terminated'} compact /></td>
                      <td>
                        {e.roles[0] ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.roles[0].color }} />
                            {e.roles[0].name}
                            {e.roles.length > 1 && <span className="text-xs text-muted">+{e.roles.length - 1}</span>}
                          </span>
                        ) : (
                          <span className="text-xs text-muted">No role</span>
                        )}
                      </td>
                      <td>{wageLabel(e.wage) ?? <Link href={`/base/team/${e.id}#wage`} className="text-xs text-brass-dark underline">Add wage</Link>}</td>
                      {admin && (
                        <td>
                          <span className="mb-1 block font-mono text-xs text-muted">{e.login_id}</span>
                          <PasswordCell password={passwords.get(e.id) ?? null} hasPassword={e.has_password} />
                        </td>
                      )}
                      <td><StatusCell e={e} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
