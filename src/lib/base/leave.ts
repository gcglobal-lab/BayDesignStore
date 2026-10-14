import 'server-only';
import { db, must } from './db';
import { getSettings } from './settings';
import { HOURS_PER_DAY, PAID_LEAVE_TYPES } from './types';

export type LeaveBalance = {
  year: number;
  /** Paid-leave days for the year: the person's own allowance, or the company default. */
  allowance: number;
  isDefault: boolean;
  used: number;
  pending: number;
  /** allowance − used − pending; what they can still request. */
  remaining: number;
};

/**
 * Paid-leave balances (vacation + PTO) for everyone, or for the given people, in one year.
 * Leave counts toward the year it starts in.
 */
export async function leaveBalances(year: number, employeeIds?: string[]): Promise<Map<string, LeaveBalance>> {
  let allowanceQuery = db().from('leave_allowances').select('employee_id, paid_days').eq('year', year);
  let requestQuery = db()
    .from('time_off_requests')
    .select('employee_id, hours, status')
    .in('type', [...PAID_LEAVE_TYPES])
    .in('status', ['approved', 'pending'])
    .gte('starts_on', `${year}-01-01`)
    .lte('starts_on', `${year}-12-31`);
  if (employeeIds) {
    allowanceQuery = allowanceQuery.in('employee_id', employeeIds);
    requestQuery = requestQuery.in('employee_id', employeeIds);
  }
  const [settings, allowancesRes, requestsRes] = await Promise.all([getSettings(), allowanceQuery, requestQuery]);
  const allowances = must<{ employee_id: string; paid_days: number | string }[]>(allowancesRes, 'load leave allowances');
  const requests = must<{ employee_id: string; hours: number | string; status: 'approved' | 'pending' }[]>(requestsRes, 'load paid leave');

  const ids = new Set([...(employeeIds ?? []), ...allowances.map((a) => a.employee_id), ...requests.map((r) => r.employee_id)]);
  const result = new Map<string, LeaveBalance>();
  for (const id of ids) {
    const own = allowances.find((a) => a.employee_id === id);
    const allowance = own ? Number(own.paid_days) : settings.paid_leave_days_per_year;
    const sum = (status: 'approved' | 'pending') =>
      requests.filter((r) => r.employee_id === id && r.status === status).reduce((s, r) => s + Number(r.hours) / HOURS_PER_DAY, 0);
    const used = sum('approved');
    const pending = sum('pending');
    result.set(id, { year, allowance, isDefault: !own, used, pending, remaining: Math.round((allowance - used - pending) * 100) / 100 });
  }
  return result;
}

export async function leaveBalance(employeeId: string, year: number): Promise<LeaveBalance> {
  return (await leaveBalances(year, [employeeId])).get(employeeId)!;
}

/** One person's balances for several years, with two queries in total (e.g. this year and next). */
export async function leaveBalanceYears(employeeId: string, years: number[]): Promise<Map<number, LeaveBalance>> {
  const first = Math.min(...years);
  const last = Math.max(...years);
  const [settings, allowancesRes, requestsRes] = await Promise.all([
    getSettings(),
    db().from('leave_allowances').select('year, paid_days').eq('employee_id', employeeId).in('year', years),
    db()
      .from('time_off_requests')
      .select('starts_on, hours, status')
      .eq('employee_id', employeeId)
      .in('type', [...PAID_LEAVE_TYPES])
      .in('status', ['approved', 'pending'])
      .gte('starts_on', `${first}-01-01`)
      .lte('starts_on', `${last}-12-31`),
  ]);
  const allowances = must<{ year: number; paid_days: number | string }[]>(allowancesRes, 'load leave allowances');
  const requests = must<{ starts_on: string; hours: number | string; status: 'approved' | 'pending' }[]>(requestsRes, 'load paid leave');
  const result = new Map<number, LeaveBalance>();
  for (const year of years) {
    const own = allowances.find((a) => Number(a.year) === year);
    const allowance = own ? Number(own.paid_days) : settings.paid_leave_days_per_year;
    const inYear = requests.filter((r) => r.starts_on.startsWith(`${year}-`));
    const sum = (status: 'approved' | 'pending') => inYear.filter((r) => r.status === status).reduce((s, r) => s + Number(r.hours) / HOURS_PER_DAY, 0);
    const used = sum('approved');
    const pending = sum('pending');
    result.set(year, { year, allowance, isDefault: !own, used, pending, remaining: Math.round((allowance - used - pending) * 100) / 100 });
  }
  return result;
}
