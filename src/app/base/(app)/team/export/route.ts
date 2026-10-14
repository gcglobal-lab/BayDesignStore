import { getViewer, isManager } from '@/lib/base/auth';
import { audit } from '@/lib/base/audit';
import { isDbConfigured } from '@/lib/base/env';
import { csvResponse, toCsv } from '@/lib/base/csv';
import { listEmployees, listLocations } from '@/lib/base/queries';
import { fullName } from '@/lib/base/types';

export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer || !isManager(viewer) || !isDbConfigured()) return new Response('Not found', { status: 404 });

  const includeTerminated = new URL(request.url).searchParams.get('terminated') === '1';
  const [employees, locations] = await Promise.all([listEmployees(includeTerminated), listLocations()]);
  const rows = [
    ['Name', 'Title', 'Email', 'Phone', 'Login ID', 'Access level', 'Location', 'Roles', 'Wage', 'Wage type', 'Status'],
    ...employees.map((e) => [
      fullName(e),
      e.title,
      e.email,
      e.phone,
      e.login_id,
      e.access_level,
      locations.find((l) => l.id === e.location_id)?.name,
      e.roles.map((r) => r.name).join('; '),
      e.wage?.amount,
      e.wage?.wage_type,
      e.status,
    ]),
  ];
  await audit(viewer, 'team.export');
  return csvResponse(`bay-design-team-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
}
