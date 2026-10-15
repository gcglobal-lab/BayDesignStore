import type { Metadata } from 'next';
import { Trash2, X } from 'lucide-react';
import { SubmitButton } from '@/components/base/forms';
import { NewDepartmentForm, NewRoleForm } from '@/components/base/RoleForms';
import { Card, PageHeader } from '@/components/base/ui';
import { requireManager } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { listDepartments, listEmployees, listRoles } from '@/lib/base/queries';
import { fullName, workTypes, type Role, type WorkType } from '@/lib/base/types';
import { deleteDepartment, deleteRole, setDepartmentManager, updateRole } from './actions';
import Select from '@/components/ui/Select';

export const metadata: Metadata = { title: 'Departments & Roles' };

function RoleChip({ role, departments }: { role: Role; departments: { id: string; name: string }[] }) {
  return (
    <span className="group inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1 text-xs font-semibold text-white shadow-sm" style={{ backgroundColor: role.color }}>
      {role.name}
      {role.work_type !== 'showroom' && <span className="font-normal text-white/75">· {workTypes[role.work_type].label}</span>}
      <details className="relative">
        <summary className="cursor-pointer list-none rounded-full px-1.5 py-0.5 text-white/80 hover:bg-white/20" aria-label={`Edit ${role.name}`}>⋯</summary>
        <div className="absolute left-0 top-7 z-20 w-60 space-y-3 rounded-2xl border border-stone/60 bg-ivory p-3 text-ink shadow-xl">
          <form action={updateRole} className="space-y-2">
            <input type="hidden" name="id" value={role.id} />
            <label className="block text-xs font-medium">
              Time clock screen
              <Select name="work_type" defaultValue={role.work_type} className="b-input mt-1 !py-1.5 text-xs">
                {(Object.keys(workTypes) as WorkType[]).map((w) => <option key={w} value={w}>{workTypes[w].label}</option>)}
              </Select>
            </label>
            <label className="flex items-center justify-between text-xs font-medium">Colour <input type="color" name="color" defaultValue={role.color} className="h-7 w-12 cursor-pointer rounded border border-stone" /></label>
            <label className="block text-xs font-medium">
              Department
              <Select name="department_id" defaultValue={role.department_id ?? ''} className="b-input mt-1 !py-1.5 text-xs">
                <option value="">Department not set</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </label>
            <SubmitButton className="b-btn-primary b-btn-sm w-full">Save</SubmitButton>
          </form>
          <form action={deleteRole}>
            <input type="hidden" name="id" value={role.id} />
            <SubmitButton className="b-btn-danger b-btn-sm w-full" confirm={`Delete the “${role.name}” role? It will be removed from everyone who has it.`}><Trash2 size={12} /> Delete role</SubmitButton>
          </form>
        </div>
      </details>
    </span>
  );
}

export default async function RolesPage() {
  await requireManager();
  const [roles, departments, employees, managersRes] = await Promise.all([
    listRoles(),
    listDepartments(),
    listEmployees(),
    db().from('department_managers').select('department_id, employee_id'),
  ]);
  const deptManagers = must<{ department_id: string; employee_id: string }[]>(managersRes, 'load department managers');
  const managers = employees.filter((e) => e.access_level !== 'employee');
  const groups = [...departments.map((d) => ({ id: d.id as string | null, name: d.name })), { id: null, name: 'Department not set' }];

  return (
    <>
      <PageHeader eyebrow="Team" title="Departments & Roles" description="Roles colour the schedule. Each role’s time clock screen (Designer, Warehouse, Driver, Showroom) decides what people with it as their primary role see on Home." actions={<NewDepartmentForm />} />
      <Card pad={false}>
        <div className="hidden grid-cols-[200px_1fr_260px] gap-6 border-b border-stone/50 px-6 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted lg:grid">
          <span>Department</span>
          <span>Roles</span>
          <span>Managers</span>
        </div>
        <ul className="divide-y divide-stone/40">
          {groups.map((g) => {
            const groupRoles = roles.filter((r) => r.department_id === g.id);
            const assigned = deptManagers.filter((m) => m.department_id === g.id);
            return (
              <li key={g.id ?? 'none'} className="grid gap-4 px-6 py-5 lg:grid-cols-[200px_1fr_260px] lg:gap-6">
                <div className="flex items-start justify-between gap-2">
                  <p className={`font-medium ${g.id ? '' : 'text-muted'}`}>{g.name}</p>
                  {g.id && (
                    <form action={deleteDepartment}>
                      <input type="hidden" name="id" value={g.id} />
                      <SubmitButton className="rounded-full p-1.5 text-muted hover:bg-red-50 hover:text-red-600" confirm={`Delete “${g.name}”? Its roles move to “Department not set”.`}><Trash2 size={14} /></SubmitButton>
                    </form>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {groupRoles.length === 0 && <span className="text-sm text-muted">No roles yet.</span>}
                    {groupRoles.map((r) => <RoleChip key={r.id} role={r} departments={departments} />)}
                  </div>
                  <NewRoleForm departmentId={g.id} />
                </div>
                <div>
                  {g.id ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {assigned.map((m) => {
                          const e = employees.find((x) => x.id === m.employee_id);
                          return (
                            <form key={m.employee_id} action={setDepartmentManager} className="inline-flex items-center gap-1 rounded-full bg-linen py-1 pl-3 pr-1 text-xs">
                              {e ? fullName(e) : 'Former manager'}
                              <input type="hidden" name="department_id" value={g.id!} />
                              <input type="hidden" name="employee_id" value={m.employee_id} />
                              <input type="hidden" name="op" value="remove" />
                              <SubmitButton className="rounded-full p-0.5 text-muted hover:text-red-600"><X size={12} /></SubmitButton>
                            </form>
                          );
                        })}
                      </div>
                      <form action={setDepartmentManager} className="flex gap-1.5">
                        <input type="hidden" name="department_id" value={g.id} />
                        <input type="hidden" name="op" value="add" />
                        <Select people name="employee_id" className="b-input !py-1.5 text-xs" required defaultValue="" aria-label="Add a manager">
                          <option value="" disabled>Add a manager…</option>
                          {managers.filter((m) => !assigned.some((a) => a.employee_id === m.id)).map((m) => <option key={m.id} value={m.id}>{fullName(m)}</option>)}
                        </Select>
                        <SubmitButton className="b-btn-ghost b-btn-sm">Add</SubmitButton>
                      </form>
                    </div>
                  ) : (
                    <p className="text-xs text-muted">Create a department to assign managers.</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
