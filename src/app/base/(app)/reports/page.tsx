import type { Metadata } from 'next';
import Link from 'next/link';
import { Activity, BarChart3, CalendarCheck2, Clock3, Inbox, Palmtree, Receipt, Users } from 'lucide-react';
import ReportFilter from '@/components/base/ReportFilter';
import { EmptyState, PageHeader } from '@/components/base/ui';
import { requireManager } from '@/lib/base/auth';
import { listEmployees } from '@/lib/base/queries';
import { buildReport, fmtCell, isReportKey, REPORTS, type ReportKey } from '@/lib/base/reports';
import { getSettings } from '@/lib/base/settings';
import { todayYmd } from '@/lib/base/time';
import { MAX_RANGE_DAYS, parseRange, rangePresets } from '@/lib/base/timesheetRange';
import { fullName } from '@/lib/base/types';

export const metadata: Metadata = { title: 'Reports' };

const ICONS: Record<ReportKey, typeof Clock3> = {
  hours: Clock3,
  payroll: Receipt,
  timecards: BarChart3,
  attendance: CalendarCheck2,
  'time-off': Palmtree,
  roster: Users,
  activity: Activity,
  inquiries: Inbox,
};
const PREVIEW_ROWS = 300;

export default async function ReportsPage({ searchParams }: PageProps<'/base/reports'>) {
  await requireManager();
  const sp = await searchParams;
  const settings = await getSettings();
  const zone = settings.timezone;
  const today = todayYmd(zone);
  const key: ReportKey = isReportKey(sp.report) ? sp.report : 'hours';
  const requested = parseRange(sp.from, sp.to);
  const { from, to } = 'error' in requested ? { from: `${today.slice(0, 7)}-01`, to: today } : requested;
  const employeeId = typeof sp.employee === 'string' && /^[0-9a-f-]{36}$/i.test(sp.employee) ? sp.employee : undefined;

  const [employees, report] = await Promise.all([listEmployees(true), buildReport({ key, from, to, employeeId: REPORTS[key].usesPerson ? employeeId : undefined, settings })]);
  const numeric = (i: number) => ['number', 'minutes', 'money'].includes(report.columns[i]?.kind ?? 'text');
  const link = (k: ReportKey) => `/base/reports?${new URLSearchParams({ report: k, from, to, ...(employeeId ? { employee: employeeId } : {}) }).toString()}`;

  return (
    <>
      <PageHeader eyebrow="Reports" title="Reports" description="Pick a report and dates, preview it here, then download it as PDF, Excel or CSV." />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(REPORTS) as ReportKey[]).map((k) => {
          const Icon = ICONS[k];
          const on = k === key;
          return (
            <Link
              key={k}
              href={link(k)}
              aria-current={on ? 'page' : undefined}
              className={`group rounded-2xl border p-4 transition-all ${on ? 'border-transparent bg-gradient-to-br from-indigo-500 via-violet-600 to-fuchsia-600 text-white shadow-[0_18px_40px_-22px_rgba(79,70,229,0.9)]' : 'border-stone/70 bg-white hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md'}`}
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${on ? 'bg-white/20' : 'bg-violet-50 text-violet-600'}`}><Icon size={18} /></span>
              <p className="mt-3 font-semibold">{REPORTS[k].title}</p>
              <p className={`mt-1 text-xs leading-relaxed ${on ? 'text-white/80' : 'text-muted'}`}>{REPORTS[k].description}</p>
            </Link>
          );
        })}
      </div>

      <section className="b-card overflow-hidden">
        <div className="border-b border-stone/50 bg-gradient-to-r from-white to-linen/60 px-5 py-5 sm:px-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold tracking-tight">{report.title}</h2>
            <p className="text-sm text-muted">{report.subtitle} · {report.rows.length.toLocaleString()} row{report.rows.length === 1 ? '' : 's'}</p>
          </div>
          <ReportFilter
            report={key}
            from={from}
            to={to}
            employee={employeeId ?? ''}
            employees={employees.filter((e) => e.status !== 'terminated' || e.id === employeeId).map((e) => ({ id: e.id, name: fullName(e) }))}
            usesRange={REPORTS[key].usesRange}
            usesPerson={REPORTS[key].usesPerson}
            presets={rangePresets(today, zone, settings.pay_period_anchor, settings.pay_period_days)}
            zone={zone}
            weekStart={settings.week_start}
            maxDays={MAX_RANGE_DAYS}
          />
        </div>

        {report.rows.length === 0 ? (
          <EmptyState icon={<BarChart3 size={20} />} title="Nothing in this report for these dates." />
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="b-table min-w-[900px]">
              <thead className="sticky top-0 z-10">
                <tr>{report.columns.map((c, i) => <th key={c.label} className={numeric(i) ? 'text-right' : ''}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {report.rows.slice(0, PREVIEW_ROWS).map((r, ri) => (
                  <tr key={ri}>
                    {r.map((v, i) => (
                      <td key={i} className={`${numeric(i) ? 'text-right tabular-nums' : ''} ${i === 0 ? 'font-medium' : ''} max-w-[340px]`}>
                        {fmtCell(v, report.columns[i]?.kind)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {report.totals && (
                <tfoot className="sticky bottom-0">
                  <tr className="bg-violet-50 font-semibold">
                    {report.totals.map((v, i) => <td key={i} className={`border-t-2 border-violet-200 px-4 py-3 ${numeric(i) ? 'text-right tabular-nums' : ''}`}>{fmtCell(v, report.columns[i]?.kind)}</td>)}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        {(report.notes?.length || report.rows.length > PREVIEW_ROWS) && (
          <div className="space-y-1 border-t border-stone/50 px-5 py-3 text-xs text-muted sm:px-6">
            {report.rows.length > PREVIEW_ROWS && <p>Showing the first {PREVIEW_ROWS} rows — downloads include all {report.rows.length.toLocaleString()}.</p>}
            {report.notes?.map((n) => <p key={n}>{n}</p>)}
          </div>
        )}
      </section>
    </>
  );
}
