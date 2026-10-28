import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, LogOut, UserCheck, UserX } from 'lucide-react';
import { PasswordPanel, WageForm } from '@/components/base/EmployeeAdminForms';
import EmployeeForm from '@/components/base/EmployeeForm';
import StoreSelect from '@/components/base/StoreSelect';
import AppAccessForm from '@/components/portal/AppAccessForm';
import { SubmitButton } from '@/components/base/forms';
import { Avatar, Card } from '@/components/base/ui';
import { requireManager } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { fmtDistance, mapLink } from '@/lib/base/geo';
import { getEmployee, listLocations, listRoles, workedMinutes } from '@/lib/base/queries';
import { getSettings } from '@/lib/base/settings';
import { fmtDate, fmtDuration, fmtTime, todayYmd } from '@/lib/base/time';
import { fmtDays, fullName, wageLabel, type TimeEntry } from '@/lib/base/types';
import { leaveBalance } from '@/lib/base/leave';
import { passwordsFor } from '@/lib/base/passwords';
import { LeaveAllowanceForm } from '@/components/base/LeaveForms';
import { setEmployeeStatus, signOutEverywhere } from '../actions';

export const metadata: Metadata = { title: 'Team member' };

export default async function EmployeePage({ params }: PageProps<'/base/team/[id]'>) {
  const viewer = await requireManager();
  const { id } = await params;
  const employee = await getEmployee(id);
  if (!employee) notFound();

  const settings = await getSettings();
  const zone = settings.timezone;
  const thisYear = Number(todayYmd(zone).slice(0, 4));
  const [roles, locations, entriesRes, wagesRes, leave, passwords] = await Promise.all([
    listRoles(),
    listLocations(),
    db().from('time_entries').select('*, breaks:time_entry_breaks(id, type, started_at, ended_at)').eq('employee_id', id).order('clock_in_at', { ascending: false }).limit(8),
    db().from('employee_wages').select('id, wage_type, amount, effective_from').eq('employee_id', id).order('effective_from', { ascending: false }).limit(10),
    leaveBalance(id, thisYear),
    passwordsFor(viewer, [id]),
  ]);
  const admin = viewer.level === 'admin';
  const entries = must<TimeEntry[]>(entriesRes, 'load recent time cards');
  const wages = must<{ id: string; wage_type: 'hourly' | 'salary'; amount: number; effective_from: string }[]>(wagesRes, 'load wages');

  const self = employee.id === viewer.employeeId;
  const manageable = viewer.level === 'admin' || employee.access_level === 'employee';
  const canEdit = manageable || self;
  const name = fullName(employee);

  return (
    <>
      <Link href="/base/team" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> Team roster</Link>

      <div className="mb-8 flex flex-wrap items-center gap-4">
        <Avatar name={name} size="lg" />
        <div className="flex-1">
          <h1 className="b-h1">{name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="capitalize">{employee.access_level}</span>
            {employee.title && <>· {employee.title}</>}
            · {employee.status === 'terminated' ? <span className="b-badge-gray">Terminated</span> : employee.has_password ? <span className="b-badge-green">Active</span> : <span className="b-badge-amber">No password yet</span>}
            {employee.last_login_at && <>· last signed in {fmtDate(new Date(employee.last_login_at), zone, 'MMM d')} at {fmtTime(employee.last_login_at, zone)}</>}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card title="Profile">
          {canEdit ? (
            <EmployeeForm
              isSelf={self}
              isAdmin={admin}
              canSetLevel={admin}
              roles={roles}
              locations={locations}
              values={{
                id: employee.id,
                first_name: employee.first_name,
                last_name: employee.last_name,
                email: employee.email,
                phone: employee.phone,
                login_id: employee.login_id,
                access_level: employee.access_level,
                location_id: employee.location_id,
                title: employee.title,
                is_contractor: employee.is_contractor,
                birthday: employee.birthday,
                hire_date: employee.hire_date,
                role_ids: employee.roles.map((r) => r.id),
                primary_role_id: employee.roles.find((r) => r.is_primary)?.id ?? null,
                password: admin ? (employee.has_password ? (passwords.get(employee.id) ?? null) : '') : undefined,
              }}
            />
          ) : (
            <p className="text-sm text-muted">Only an admin can edit managers and admins.</p>
          )}
        </Card>

        <aside className="space-y-6">
          {manageable && employee.status !== 'terminated' && (
            <Card title="Sign-in">
              <div className="space-y-4">
                <p className="text-sm">Login ID: <code className="rounded bg-linen px-1.5 py-0.5 font-mono">{employee.login_id}</code></p>
                {admin ? (
                  <PasswordPanel id={employee.id} current={passwords.get(employee.id) ?? null} hasPassword={employee.has_password} />
                ) : (
                  <p className="text-sm text-muted">{employee.has_password ? 'Has a password.' : 'No password yet.'} Only an admin can see, set or change passwords.</p>
                )}
                {employee.has_password && !self && (
                  <form action={signOutEverywhere} className="border-t border-stone/50 pt-4">
                    <input type="hidden" name="id" value={employee.id} />
                    <SubmitButton className="b-btn-quiet b-btn-sm" confirm={`Sign ${employee.first_name} out on every device?`}><LogOut size={13} /> Sign out everywhere</SubmitButton>
                  </form>
                )}
              </div>
            </Card>
          )}

          {admin && employee.status !== 'terminated' && (
            <Card title="App access">
              {employee.access_level === 'admin' ? (
                <p className="text-sm text-muted">Admins always have full access to Time, Workflow and Deliveries.</p>
              ) : (
                <>
                  <p className="mb-3 text-sm text-muted">Time is on for everyone. Choose whether {employee.first_name} can also open Workflow (CRM) and Deliveries.</p>
                  <AppAccessForm id={employee.id} crm={employee.crm_role} deliveries={employee.deliveries_role} stacked />
                </>
              )}
            </Card>
          )}

          <Card title="Store">
            <p className="mb-3 text-sm text-muted">Where {employee.first_name} works. It stays until you change it; new shifts start at this store (you can still pick the other store for a particular shift).</p>
            <StoreSelect employeeId={employee.id} value={employee.location_id} locations={locations.filter((l) => l.is_active).map((l) => ({ id: l.id, name: l.name }))} disabled={!manageable && !self} />
          </Card>

          <Card title={<h2 id="wage" className="b-h2">Wage</h2>}>
            <p className="mb-3 text-sm">Current: <span className="font-medium">{wageLabel(employee.wage) ?? 'Not set'}</span></p>
            {(viewer.level === 'admin' || (manageable && !self)) && <WageForm id={employee.id} today={todayYmd(zone)} />}
            {wages.length > 1 && (
              <ul className="mt-4 space-y-1 border-t border-stone/50 pt-3 text-xs text-muted">
                {wages.map((w) => <li key={w.id}>{wageLabel({ ...w, amount: Number(w.amount) })} from {fmtDate(w.effective_from, zone, 'MMM d, yyyy')}</li>)}
              </ul>
            )}
          </Card>

          <Card title={<h2 id="leave" className="b-h2">Paid leave · {thisYear}</h2>}>
            <p className="text-sm">
              <span className={`font-display text-2xl font-semibold ${leave.remaining <= 0 ? 'text-red-600' : ''}`}>{leave.remaining <= 0 ? 'None left' : fmtDays(leave.remaining)}</span>
              <span className="text-muted"> of {fmtDays(leave.allowance)} left</span>
            </p>
            <p className="mt-1 text-xs text-muted">
              {fmtDays(leave.used)} taken{leave.pending ? ` · ${fmtDays(leave.pending)} waiting for approval` : ''}{leave.isDefault ? ' · company default' : ''}
            </p>
            {(viewer.level === 'admin' || (manageable && !self)) && (
              <div className="mt-4 border-t border-stone/50 pt-4">
                <p className="mb-1.5 text-xs font-medium text-muted">Paid leave days for {thisYear} (set or reduce)</p>
                <LeaveAllowanceForm employeeId={employee.id} year={thisYear} value={leave.allowance} />
              </div>
            )}
          </Card>

          <Card title="Recent time cards" pad={false}>
            {entries.length === 0 ? (
              <p className="px-6 py-5 text-sm text-muted">No time cards yet.</p>
            ) : (
              <ul className="divide-y divide-stone/40">
                {entries.map((e) => (
                  <li key={e.id} className="px-5 py-3 text-sm">
                    <p className="font-medium">{fmtDate(new Date(e.clock_in_at), zone, 'EEE, MMM d')}</p>
                    <p className="text-xs text-muted">
                      {fmtTime(e.clock_in_at, zone)} – {e.clock_out_at ? fmtTime(e.clock_out_at, zone) : 'now'} · {fmtDuration(workedMinutes(e))}
                    </p>
                    {e.clock_in_lat != null && e.clock_in_lng != null && (
                      <a href={mapLink(e.clock_in_lat, e.clock_in_lng)} target="_blank" rel="noopener noreferrer" className="text-[0.7rem] text-muted hover:underline">
                        Punched in at {e.clock_in_place ?? (e.clock_in_in_geofence === false ? `${fmtDistance(e.clock_in_distance_m)} from a store` : 'a store')} · map
                      </a>
                    )}
                    {e.clock_in_note && <p className="text-[0.7rem] text-ink">{e.clock_in_note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {admin && !self && (
            <Card title="Employment">
              <form action={setEmployeeStatus}>
                <input type="hidden" name="id" value={employee.id} />
                {employee.status === 'terminated' ? (
                  <>
                    <input type="hidden" name="status" value="active" />
                    <p className="mb-3 text-sm text-muted">Terminated {employee.terminated_at ? fmtDate(new Date(employee.terminated_at), zone, 'MMM d, yyyy') : ''}. Their history is kept.</p>
                    <SubmitButton className="b-btn-ghost"><UserCheck size={15} /> Reactivate</SubmitButton>
                  </>
                ) : (
                  <>
                    <input type="hidden" name="status" value="terminated" />
                    <p className="mb-3 text-sm text-muted">Signs them out immediately, closes any open time card and returns their future shifts to open shifts. Their history is kept.</p>
                    <SubmitButton className="b-btn-danger" confirm={`Terminate ${name}? They will lose access immediately.`}><UserX size={15} /> Terminate</SubmitButton>
                  </>
                )}
              </form>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
