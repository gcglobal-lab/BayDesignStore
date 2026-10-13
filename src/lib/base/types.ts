import type { AccessLevel } from './token';

export type EmployeeStatus = 'active' | 'pending' | 'terminated';
export type RequestStatus = 'pending' | 'approved' | 'denied' | 'cancelled';
export type TimeOffType = 'vacation' | 'pto' | 'sick' | 'unpaid';
export type TimeOffReason = 'vacation' | 'personal' | 'sick' | 'family' | 'other';

export type WorkType = 'showroom' | 'designer' | 'warehouse' | 'driver';

export type Role = { id: string; name: string; color: string; department_id: string | null; work_type: WorkType };
export type Department = { id: string; name: string };

export type Location = {
  id: string;
  name: string;
  phone: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string;
  timezone: string;
  business_type: string | null;
  business_category: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_m: number;
  is_active: boolean;
};

export type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  login_id: string;
  access_level: AccessLevel;
  status: EmployeeStatus;
  location_id: string | null;
  title: string | null;
  is_contractor: boolean;
  birthday: string | null;
  hire_date: string | null;
  has_password: boolean;
  last_login_at: string | null;
  terminated_at: string | null;
  roles: (Role & { is_primary: boolean })[];
  wage: { wage_type: 'hourly' | 'salary'; amount: number; effective_from: string } | null;
};

export type Shift = {
  id: string;
  employee_id: string | null;
  location_id: string | null;
  role_id: string | null;
  starts_at: string;
  ends_at: string;
  break_minutes: number;
  notes: string | null;
  published_at: string | null;
};

export type TimeEntry = {
  id: string;
  employee_id: string;
  shift_id: string | null;
  location_id: string | null;
  clock_in_at: string;
  clock_out_at: string | null;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_in_accuracy_m: number | null;
  clock_in_distance_m: number | null;
  clock_in_in_geofence: boolean | null;
  clock_out_lat: number | null;
  clock_out_lng: number | null;
  clock_out_accuracy_m: number | null;
  clock_out_distance_m: number | null;
  clock_out_in_geofence: boolean | null;
  clock_in_place: string | null;
  clock_out_place: string | null;
  clock_in_note: string | null;
  source: 'web' | 'manual';
  notes: string | null;
  edited_at: string | null;
  breaks: { id: string; type: 'rest' | 'meal'; started_at: string; ended_at: string | null }[];
};

export type TimeOffRequest = {
  id: string;
  employee_id: string;
  type: TimeOffType;
  reason: TimeOffReason;
  starts_on: string;
  ends_on: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  hours: number;
  status: RequestStatus;
  note: string | null;
  manager_note: string | null;
  created_at: string;
};

/** What each kind of worker sees on their time clock. Set per role in Team ▸ Departments & Roles. */
export const workTypes: Record<WorkType, { label: string; clockTitle: string; note: { label: string; placeholder: string } | null; visitsTitle: string }> = {
  showroom: { label: 'Showroom', clockTitle: 'Showroom time clock', note: null, visitsTitle: 'Where you punched in' },
  designer: {
    label: 'Designer',
    clockTitle: 'Designer time clock',
    note: { label: 'Client or project (optional)', placeholder: 'e.g. Smith residence, Port Royal' },
    visitsTitle: 'Client visits this week',
  },
  warehouse: { label: 'Warehouse', clockTitle: 'Warehouse time clock', note: null, visitsTitle: 'Where you punched in' },
  driver: {
    label: 'Driver',
    clockTitle: 'Driver time clock',
    note: { label: 'Route or deliveries (optional)', placeholder: 'e.g. 3 deliveries — Marco Island' },
    visitsTitle: 'Routes this week',
  },
};

/** A person's work type comes from their primary role (or first role); default is showroom. */
export const workTypeOf = (e: { roles: { work_type: WorkType; is_primary: boolean }[] } | null): WorkType =>
  (e?.roles.find((r) => r.is_primary) ?? e?.roles[0])?.work_type ?? 'showroom';

export const fullName =(e: { first_name: string; last_name: string }) => `${e.first_name} ${e.last_name}`.trim();

export const timeOffTypeLabel: Record<TimeOffType, string> = { vacation: 'Vacation', pto: 'Paid time off', sick: 'Sick leave', unpaid: 'Normal leave (unpaid)' };
/** Leave types that come out of the yearly paid-leave allowance. */
export const PAID_LEAVE_TYPES: readonly TimeOffType[] = ['vacation', 'pto'];
export const HOURS_PER_DAY = 8;
export const fmtDays = (days: number) => {
  const d = Math.round(days * 100) / 100;
  return `${d} day${d === 1 ? '' : 's'}`;
};
export const timeOffReasonLabel: Record<TimeOffReason, string> = { vacation: 'Vacation', personal: 'Personal', sick: 'Sick', family: 'Family', other: 'Other' };

export function wageLabel(wage: Employee['wage']) {
  if (!wage) return null;
  return wage.wage_type === 'hourly' ? `$${wage.amount.toFixed(2)}/hr` : `$${wage.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}/yr`;
}
