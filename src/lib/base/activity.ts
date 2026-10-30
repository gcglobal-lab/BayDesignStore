/**
 * Turns audit-log entries into plain sentences for Settings ▸ Recent activity
 * ("Hemant Singh punched in at Uptown"). Used when an entry is written (stored as
 * audit_log.summary) and to describe older entries that were logged without one.
 */

export type Change = { field: string; from: unknown; to: unknown };
export type ActivityDetails = Record<string, unknown> & { subject?: string; changes?: Change[] };

const str = (v: unknown) => (v == null || v === '' ? null : String(v));
const plural = (n: unknown, word: string) => `${Number(n) || 0} ${word}${Number(n) === 1 ? '' : 's'}`;

/** Short, human names for fields that show up in "what changed" lists. */
export const FIELD_LABELS: Record<string, string> = {
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email',
  phone: 'Phone',
  login_id: 'Login ID',
  access_level: 'Access level',
  location_id: 'Location',
  title: 'Title',
  is_contractor: 'Contractor',
  birthday: 'Birthday',
  hire_date: 'Hire date',
  roles: 'Roles',
  password: 'Password',
  company_name: 'Company name',
  account_owner_name: 'Account owner',
  timezone: 'Timezone',
  week_start: 'Week starts on',
  pay_period_days: 'Pay period length',
  pay_period_anchor: 'Pay period start',
  daily_overtime_hours: 'Daily overtime after',
  weekly_overtime_hours: 'Weekly overtime after',
  require_location: 'Require location',
  enforce_geofence: 'Only allow punching in on site',
  early_clock_in_minutes: 'Early punch-in (min)',
  late_grace_minutes: 'Late after (min)',
  paid_leave_days_per_year: 'Paid leave days per year',
  name: 'Name',
  address1: 'Address 1',
  address2: 'Address 2',
  city: 'City',
  state: 'State',
  postal_code: 'Zip code',
  latitude: 'Latitude',
  longitude: 'Longitude',
  geofence_radius_m: 'Geofence radius (m)',
  is_active: 'Active',
  clock_in: 'Punch in',
  clock_out: 'Punch out',
  meal_minutes: 'Meal break (min)',
  notes: 'Notes',
  starts_at: 'Starts',
  ends_at: 'Ends',
  employee: 'Team member',
  role: 'Role',
  break_minutes: 'Break (min)',
  published: 'Published',
  website: 'Website',
};

/** Records which of `fields` differ between two objects (for "what changed"). */
export function diff(before: Record<string, unknown> | null | undefined, after: Record<string, unknown>, fields = Object.keys(after)): Change[] {
  const norm = (v: unknown) => (v === undefined || v === '' ? null : Array.isArray(v) ? [...v].map(String).sort().join(', ') : v);
  return fields
    .filter((f) => JSON.stringify(norm(before?.[f])) !== JSON.stringify(norm(after[f])))
    .map((f) => ({ field: f, from: norm(before?.[f]) ?? null, to: norm(after[f]) ?? null }));
}

/** One readable sentence for an activity. `actor` is who did it; `details.subject` whom it was about. */
export function describeActivity(action: string, actor: string, details: ActivityDetails | null | undefined): string {
  const d = details ?? {};
  const who = str(d.subject);
  const about = who ? ` for ${who}` : '';
  const at = str(d.place) ? ` at ${d.place}` : '';
  const changes = Array.isArray(d.changes) ? d.changes : [];
  const changed = changes.length ? ` — changed ${changes.map((c) => (FIELD_LABELS[c.field] ?? c.field).toLowerCase()).join(', ')}` : '';
  const range = str(d.from) && str(d.to) ? ` (${d.from} to ${d.to})` : '';

  // Workflow and Deliveries write their own sentence ("moved Smith sofa to Negotiation").
  if (typeof d.text === 'string' && d.text) return `${actor} ${d.text}`;

  switch (action) {
    case 'employee.app_access':
      return `${actor} changed app access${about}${changes.length ? ` — ${changes.map((c) => `${c.field}: ${c.to}`).join(', ')}` : ''}`;
    case 'auth.sign_in':
      return `${actor} signed in`;
    case 'auth.sign_out':
      return `${actor} signed out`;
    case 'auth.password_change':
      return `${actor} changed their password`;
    case 'clock.in':
      return `${actor} punched in${at}${d.inside === false ? ' (away from the stores)' : ''}`;
    case 'clock.out':
      return `${actor} punched out${at}`;
    case 'location.view_trail':
      return `${actor} viewed ${str(d.employee) ? `${d.employee}’s` : 'a'} location trail for ${d.day}`;
    case 'clock.break_start':
      return `${actor} started a ${d.type === 'meal' ? 'meal' : 'rest'} break`;
    case 'clock.break_end':
      return `${actor} ended their break`;
    case 'employee.create':
      return `${actor} added ${who ?? 'a team member'} as ${d.access_level === 'manager' ? 'a manager' : d.access_level === 'admin' ? 'an admin' : 'an employee'}`;
    case 'employee.update':
      return `${actor} updated ${who ? `${who}’s` : 'a'} profile${changed}`;
    case 'employee.password_reset':
    case 'employee.password_set':
      return `${actor} set a new password${about}`;
    case 'employee.password_delete':
      return `${actor} removed the password${about} — they can’t sign in until a new one is set`;
    case 'employee.passwords_generated':
      return `${actor} created passwords for ${plural(d.count, 'team member')} who didn’t have one`;
    case 'employee.terminate':
      return `${actor} terminated ${who ?? 'a team member'}`;
    case 'employee.reactivate':
      return `${actor} reactivated ${who ?? 'a team member'}`;
    case 'employee.sign_out_everywhere':
      return `${actor} signed ${who ?? 'a team member'} out on every device`;
    case 'employee.wage':
      return `${actor} set ${who ? `${who}’s` : 'a'} wage to $${d.amount}${d.wage_type === 'salary' ? '/yr' : '/hr'}`;
    case 'timecard.add':
      return `${actor} added a time card${about}${str(d.date) ? ` on ${d.date}` : ''}`;
    case 'timecard.edit':
      return `${actor} edited a time card${about}${changed}`;
    case 'timecard.delete':
      return `${actor} deleted a time card${about}`;
    case 'shift.create':
      return `${actor} added a shift${about}${str(d.when) ? ` on ${d.when}` : ''}`;
    case 'shift.update':
      return `${actor} changed a shift${about}${changed}`;
    case 'shift.delete':
      return `${actor} deleted a shift${about}`;
    case 'shift.offer':
      return `${actor} offered one of their shifts to the team`;
    case 'shift.request_open':
      return `${actor} asked to pick up an open shift`;
    case 'shift.take':
      return `${actor} offered to cover a teammate’s shift`;
    case 'shift.request_cancel':
      return `${actor} cancelled a shift request`;
    case 'shift_request.approved':
      return `${actor} approved a shift request${about}`;
    case 'shift_request.denied':
      return `${actor} denied a shift request${about}`;
    case 'schedule.publish':
      return `${actor} published ${plural(d.count, 'shift')} for the week of ${d.from ?? 'this week'}`;
    case 'schedule.copy_week':
      return `${actor} copied ${plural(d.count, 'shift')} from the previous week into the week of ${d.to ?? 'this week'}`;
    case 'time_off.request':
      return `${actor} requested time off${range}`;
    case 'time_off.add':
      return `${actor} added time off${about}${range}`;
    case 'time_off.approved':
      return `${actor} approved time off${about}`;
    case 'time_off.denied':
      return `${actor} denied time off${about}`;
    case 'time_off.cancel':
      return `${actor} cancelled time off${about}`;
    case 'leave.allowance_set':
      return `${actor} set ${who ? `${who}’s` : 'a'} paid leave for ${d.year} to ${d.paid_days} days`;
    case 'leave.allowance_set_all':
      return `${actor} set everyone’s paid leave for ${d.year} to ${d.paid_days} days (${plural(d.people, 'person')})`;
    case 'leave.default_set':
      return `${actor} set the yearly paid leave to ${d.paid_days} days`;
    case 'availability.submit':
      return `${actor} sent new availability`;
    case 'availability.approved':
      return `${actor} approved new availability${about}`;
    case 'availability.denied':
      return `${actor} denied new availability${about}`;
    case 'settings.update':
      return `${actor} updated company settings${changed}`;
    case 'location.create':
      return `${actor} added the location ${str(d.name) ?? ''}`.trim();
    case 'location.update':
      return `${actor} updated the location ${str(d.name) ?? ''}${changed}`.trim();
    case 'role.create':
      return `${actor} created the role “${d.name}”`;
    case 'role.update':
      return `${actor} updated the role ${str(d.name) ? `“${d.name}”` : ''}`.trim();
    case 'role.delete':
      return `${actor} deleted the role ${str(d.name) ? `“${d.name}”` : ''}`.trim();
    case 'department.create':
      return `${actor} created the department “${d.name}”`;
    case 'department.delete':
      return `${actor} deleted a department`;
    case 'department.manager_add':
      return `${actor} made ${who ?? 'someone'} a department manager`;
    case 'department.manager_remove':
      return `${actor} removed ${who ?? 'someone'} as a department manager`;
    case 'event.create':
      return `${actor} added the event “${d.title}”`;
    case 'event.delete':
      return `${actor} deleted an event`;
    case 'timesheets.export':
      return `${actor} downloaded the timesheet spreadsheet${range}`;
    case 'timesheets.pdf':
      return `${actor} downloaded a timesheet PDF${range}`;
    case 'report.download':
      return `${actor} downloaded the ${d.report ?? ''} report as ${String(d.format ?? '').toUpperCase()}${range}`.replace('  ', ' ');
    case 'team.export':
      return `${actor} exported the team roster`;
    case 'inquiries.export':
      return `${actor} exported website inquiries`;
    case 'newsletter.export':
      return `${actor} exported newsletter sign-ups`;
    case 'inquiry.read':
    case 'inquiry.replied':
    case 'inquiry.archived':
    case 'inquiry.new':
      return `${actor} marked a website inquiry as ${action.split('.')[1]}`;
    case 'assistant.password_help':
      return `${actor} asked the Base assistant for password help`;
    default:
      return `${actor} · ${action.replace(/[._]/g, ' ')}`;
  }
}

/** Display a stored value from a "what changed" list. */
export function fmtChangeValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}
