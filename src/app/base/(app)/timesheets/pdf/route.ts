import { audit } from '@/lib/base/audit';
import { getViewer, isManager } from '@/lib/base/auth';
import { isDbConfigured } from '@/lib/base/env';
import { listEmployees, listEntries } from '@/lib/base/queries';
import { getSettings } from '@/lib/base/settings';
import { dayRangeIso } from '@/lib/base/time';
import { buildTimesheetPdf } from '@/lib/base/timesheetPdf';
import { parseRange } from '@/lib/base/timesheetRange';
import { fullName } from '@/lib/base/types';

/**
 * Timesheet PDF for any date range. Managers can download everyone or one person;
 * employees only ever get their own (the employee filter is ignored for them).
 */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer || viewer.mustChangePassword || !isDbConfigured()) return new Response('Not found', { status: 404 });
  const manager = isManager(viewer);
  if (!manager && !viewer.employeeId) return new Response('Not found', { status: 404 });

  const params = new URL(request.url).searchParams;
  const range = parseRange(params.get('from'), params.get('to'));
  if ('error' in range) return new Response(range.error, { status: 400 });
  const requested = params.get('employee') ?? '';
  const employeeId = manager ? (/^[0-9a-f-]{36}$/i.test(requested) ? requested : undefined) : viewer.employeeId!;

  const settings = await getSettings();
  const zone = settings.timezone;
  const [employees, entries] = await Promise.all([
    listEmployees(true),
    listEntries(dayRangeIso(range.from, zone)[0], dayRangeIso(range.to, zone)[1], employeeId),
  ]);
  const person = employeeId ? employees.find((e) => e.id === employeeId) : null;
  if (employeeId && !person) return new Response('Not found', { status: 404 });

  const pdf = buildTimesheetPdf({
    from: range.from,
    to: range.to,
    entries,
    employees,
    settings,
    scope: person ? fullName(person) : 'All team members',
    showPay: manager,
  });
  await audit(viewer, 'timesheets.pdf', undefined, undefined, { ...range, employee: employeeId ?? 'all' });

  const who = person ? `-${person.login_id}` : '';
  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="bay-design-timesheet${who}-${range.from}-to-${range.to}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
