import { audit } from '@/lib/base/audit';
import { getViewer, isManager } from '@/lib/base/auth';
import { csvResponse } from '@/lib/base/csv';
import { isDbConfigured } from '@/lib/base/env';
import { buildReport, isReportKey, REPORTS } from '@/lib/base/reports';
import { reportCsv, reportPdf, reportXlsx } from '@/lib/base/reportExport';
import { getSettings } from '@/lib/base/settings';
import { fmtDate, fmtTime, todayYmd } from '@/lib/base/time';
import { parseRange } from '@/lib/base/timesheetRange';

/** Downloads a report as PDF, Excel (.xlsx) or CSV. Managers and admins only. */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer || !isManager(viewer) || !isDbConfigured()) return new Response('Not found', { status: 404 });

  const params = new URL(request.url).searchParams;
  const key = params.get('report');
  const format = params.get('format');
  if (!isReportKey(key) || (format !== 'pdf' && format !== 'xlsx' && format !== 'csv')) return new Response('Unknown report or format.', { status: 400 });
  const settings = await getSettings();
  const zone = settings.timezone;
  let range = parseRange(params.get('from'), params.get('to'));
  if ('error' in range) {
    if (REPORTS[key].usesRange) return new Response(range.error, { status: 400 });
    const today = todayYmd(zone);
    range = { from: today, to: today };
  }
  const requested = params.get('employee') ?? '';
  const employeeId = REPORTS[key].usesPerson && /^[0-9a-f-]{36}$/i.test(requested) ? requested : undefined;

  const report = await buildReport({ key, from: range.from, to: range.to, employeeId, settings });
  const generated = `${fmtDate(new Date(), zone, 'MMM d, yyyy')} ${fmtTime(new Date(), zone)}`;
  const name = `bay-design-${key}${REPORTS[key].usesRange ? `-${range.from}-to-${range.to}` : ''}`;
  await audit(viewer, 'report.download', undefined, undefined, { report: REPORTS[key].title, format, ...(REPORTS[key].usesRange ? range : {}), employee_id: employeeId });

  if (format === 'csv') return csvResponse(`${name}.csv`, reportCsv(report));
  const body = format === 'pdf' ? reportPdf(report, settings.company_name, generated) : await reportXlsx(report, settings.company_name, generated);
  return new Response(body, {
    headers: {
      'Content-Type': format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}.${format}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

/** AI replies and large reports can take a while; give them up to a minute (Vercel). */
export const maxDuration = 60;
