import 'server-only';
import { cache } from 'react';
import { db, must } from './db';
import { CacheKeys, memo } from './memo';
import type { Department, Employee, Location, Role, TimeEntry } from './types';

const EMPLOYEE_COLUMNS =
  'id, first_name, last_name, email, phone, login_id, access_level, crm_role, deliveries_role, status, location_id, title, is_contractor, birthday, hire_date, password_hash, last_login_at, terminated_at, ' +
  'employee_roles(is_primary, job_roles(id, name, color, department_id, work_type)), employee_wages!employee_wages_employee_id_fkey(wage_type, amount, effective_from)';

type EmployeeRow = Omit<Employee, 'roles' | 'wage' | 'has_password'> & {
  password_hash: string | null;
  employee_roles: { is_primary: boolean; job_roles: Role | null }[];
  employee_wages: { wage_type: 'hourly' | 'salary'; amount: number | string; effective_from: string }[];
};

function shapeEmployee(row: EmployeeRow, today: string): Employee {
  const { password_hash, employee_roles, employee_wages, ...rest } = row;
  const wage = employee_wages
    .filter((w) => w.effective_from <= today)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
  return {
    ...rest,
    has_password: Boolean(password_hash),
    roles: employee_roles
      .filter((r) => r.job_roles)
      .map((r) => ({ ...(r.job_roles as Role), is_primary: r.is_primary }))
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.name.localeCompare(b.name)),
    wage: wage ? { wage_type: wage.wage_type, amount: Number(wage.amount), effective_from: wage.effective_from } : null,
  };
}

/** The roster, alphabetical by first name (like Homebase). Password hashes never leave this function. */
export const listEmployees = cache(
  (includeTerminated = false): Promise<Employee[]> =>
    memo(`${CacheKeys.employees}:${includeTerminated}`, 15_000, async () => {
      let query = db().from('employees').select(EMPLOYEE_COLUMNS).order('first_name').order('last_name');
      if (!includeTerminated) query = query.neq('status', 'terminated');
      const rows = must<EmployeeRow[]>(await query, 'load the team roster');
      const today = new Date().toISOString().slice(0, 10);
      return rows.map((r) => shapeEmployee(r, today));
    }),
);

export const getEmployee = cache(async (id: string): Promise<Employee | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const row = must<EmployeeRow | null>(await db().from('employees').select(EMPLOYEE_COLUMNS).eq('id', id).maybeSingle(), 'load a team member');
  return row ? shapeEmployee(row, new Date().toISOString().slice(0, 10)) : null;
});

export const listRoles = cache(
  (): Promise<Role[]> =>
    memo(CacheKeys.roles, 60_000, async () => must<Role[]>(await db().from('job_roles').select('id, name, color, department_id, work_type').order('name'), 'load roles')),
);

export const listDepartments = cache(
  (): Promise<Department[]> => memo(CacheKeys.departments, 60_000, async () => must<Department[]>(await db().from('departments').select('id, name').order('name'), 'load departments')),
);

export const listLocations = cache(
  (): Promise<Location[]> => memo(CacheKeys.locations, 60_000, async () => must<Location[]>(await db().from('locations').select('*').order('created_at'), 'load locations')),
);

const ENTRY_COLUMNS = '*, breaks:time_entry_breaks(id, type, started_at, ended_at)';

export async function getOpenEntry(employeeId: string): Promise<TimeEntry | null> {
  return must<TimeEntry | null>(
    await db().from('time_entries').select(ENTRY_COLUMNS).eq('employee_id', employeeId).is('clock_out_at', null).maybeSingle(),
    'load the open time card',
  );
}

/** Time cards that overlap [fromIso, toIso), optionally for one person. */
export async function listEntries(fromIso: string, toIso: string, employeeId?: string): Promise<TimeEntry[]> {
  let query = db()
    .from('time_entries')
    .select(ENTRY_COLUMNS)
    .lt('clock_in_at', toIso)
    .or(`clock_out_at.is.null,clock_out_at.gte."${fromIso}"`) // quoted: ISO timestamps contain PostgREST's reserved ':' and '.'
    .order('clock_in_at');
  if (employeeId) query = query.eq('employee_id', employeeId);
  return must<TimeEntry[]>(await query, 'load time cards');
}

/** Minutes worked on a time card (minus completed breaks), counting an open card up to `now`. */
export function workedMinutes(entry: Pick<TimeEntry, 'clock_in_at' | 'clock_out_at' | 'breaks'>, now = Date.now(), unpaidBreaksOnly = true): number {
  const end = entry.clock_out_at ? new Date(entry.clock_out_at).getTime() : now;
  const total = (end - new Date(entry.clock_in_at).getTime()) / 60000;
  const breaks = entry.breaks
    .filter((b) => !unpaidBreaksOnly || b.type === 'meal')
    .reduce((sum, b) => sum + ((b.ended_at ? new Date(b.ended_at).getTime() : Math.min(end, now)) - new Date(b.started_at).getTime()) / 60000, 0);
  return Math.max(0, total - breaks);
}

export const breakMinutes = (entry: Pick<TimeEntry, 'breaks'>, type: 'rest' | 'meal', now = Date.now()) =>
  entry.breaks
    .filter((b) => b.type === type)
    .reduce((sum, b) => sum + ((b.ended_at ? new Date(b.ended_at).getTime() : now) - new Date(b.started_at).getTime()) / 60000, 0);
