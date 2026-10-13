import 'server-only';
import { db, must } from './db';

export type Slot = { weekday: number; kind: 'available' | 'preferred' | 'unavailable'; all_day: boolean; start_time: string | null; end_time: string | null };
export type AvailabilityRequest = {
  id: string;
  employee_id: string;
  effective_from: string;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  note: string | null;
  created_at: string;
  slots: Slot[];
};

export async function listAvailability(employeeId?: string): Promise<AvailabilityRequest[]> {
  let query = db()
    .from('availability_requests')
    .select('id, employee_id, effective_from, status, note, created_at, slots:availability_slots(weekday, kind, all_day, start_time, end_time)')
    .in('status', ['pending', 'approved'])
    .order('effective_from', { ascending: false })
    .order('created_at', { ascending: false });
  if (employeeId) query = query.eq('employee_id', employeeId);
  return must<AvailabilityRequest[]>(await query, 'load availability');
}

/** The approved availability in effect on a date (the latest one that started on or before it). */
export function availabilityOn(requests: AvailabilityRequest[], employeeId: string, ymd: string) {
  return requests.find((r) => r.employee_id === employeeId && r.status === 'approved' && r.effective_from <= ymd) ?? null;
}

export const fmtSlotTime = (t: string | null) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}${suffix}`;
};
