import { audit } from '@/lib/base/audit';
import { getViewer, isManager } from '@/lib/base/auth';
import { csvResponse, toCsv } from '@/lib/base/csv';
import { isDbConfigured } from '@/lib/base/env';
import { entryIssues } from '@/lib/base/payroll';
import { breakMinutes, listEmployees, listEntries, workedMinutes } from '@/lib/base/queries';
import { getSettings } from '@/lib/base/settings';
import { dayRangeIso, fmtDuration, fmtHours, fmtTime, toYmd } from '@/lib/base/time';
import { parseRange } from '@/lib/base/timesheetRange';
import { fullName } from '@/lib/base/types';

/** Every time card in a date range, one row each — for payroll. */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer || !isManager(viewer) || !isDbConfigured()) return new Response('Not found', { status: 404 });

  const params = new URL(request.url).searchParams;
  const range = parseRange(params.get('from'), params.get('to'));
  if ('error' in range) return new Response(range.error, { status: 400 });
  const { from, to } = range;
  const requested = params.get('employee') ?? '';
  const employeeId = /^[0-9a-f-]{36}$/i.test(requested) ? requested : undefined;

  const settings = await getSettings();
  const zone = settings.timezone;
  const [employees, entries] = await Promise.all([listEmployees(true), listEntries(dayRangeIso(from, zone)[0], dayRangeIso(to, zone)[1], employeeId)]);
  const nameOf = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? fullName(e) : 'Former team member';
  };

  const rows = [
    ['Team member', 'Date', 'Punch in', 'Punch out', 'Worked (HH:MM)', 'Worked (decimal hours)', 'Meal break (min)', 'Rest break (min)', 'Punch-in place', 'Punch-out place', 'Client / route', 'Punch-in latitude', 'Punch-in longitude', 'Punch-in accuracy (m)', 'At a store at punch-in', 'Punch-out latitude', 'Punch-out longitude', 'At a store at punch-out', 'Source', 'Issues', 'Notes'],
    ...entries
      .sort((a, b) => nameOf(a.employee_id).localeCompare(nameOf(b.employee_id)) || a.clock_in_at.localeCompare(b.clock_in_at))
      .map((e) => [
        nameOf(e.employee_id),
        toYmd(new Date(e.clock_in_at), zone),
        fmtTime(e.clock_in_at, zone),
        e.clock_out_at ? fmtTime(e.clock_out_at, zone) : '',
        fmtDuration(workedMinutes(e)),
        fmtHours(workedMinutes(e)),
        Math.round(breakMinutes(e, 'meal')),
        Math.round(breakMinutes(e, 'rest')),
        e.clock_in_place,
        e.clock_out_place,
        e.clock_in_note,
        e.clock_in_lat,
        e.clock_in_lng,
        e.clock_in_accuracy_m == null ? '' : Math.round(e.clock_in_accuracy_m),
        e.clock_in_in_geofence == null ? '' : e.clock_in_in_geofence ? 'yes' : 'no',
        e.clock_out_lat,
        e.clock_out_lng,
        e.clock_out_in_geofence == null ? '' : e.clock_out_in_geofence ? 'yes' : 'no',
        e.source,
        entryIssues(e, settings).map((i) => i.label).join('; '),
        e.notes,
      ]),
  ];
  await audit(viewer, 'timesheets.export', undefined, undefined, { from, to, employee: employeeId ?? 'all' });
  return csvResponse(`bay-design-timesheets-${from}-to-${to}.csv`, toCsv(rows));
}
