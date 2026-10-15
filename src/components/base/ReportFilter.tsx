'use client';

import { useRef, useState } from 'react';
import { Eye, FileSpreadsheet, FileText, Sheet } from 'lucide-react';
import { DateRangePicker, type RangePreset } from './calendar/Calendar';
import Select from '@/components/ui/Select';

/** Range + person for a report, then preview on screen or download as PDF / Excel / CSV. */
export default function ReportFilter({
  report,
  from,
  to,
  employee,
  employees,
  usesRange,
  usesPerson,
  presets,
  zone,
  weekStart,
  maxDays,
}: {
  report: string;
  from: string;
  to: string;
  employee: string;
  employees: { id: string; name: string }[];
  usesRange: boolean;
  usesPerson: boolean;
  presets: RangePreset[];
  zone: string;
  weekStart: number;
  maxDays: number;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [range, setRange] = useState({ from, to });
  return (
    <form ref={form} method="get" action="/base/reports" className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="report" value={report} />
      <input type="hidden" name="from" value={range.from} />
      <input type="hidden" name="to" value={range.to} />
      {usesRange && (
        <div className="min-w-[260px] flex-1 sm:max-w-sm">
          <span className="b-label">Dates</span>
          <DateRangePicker
            from={range.from}
            to={range.to}
            presets={presets}
            zone={zone}
            weekStart={weekStart}
            maxDays={maxDays}
            onChange={(r) => {
              setRange(r);
              window.setTimeout(() => form.current?.requestSubmit(), 0);
            }}
          />
        </div>
      )}
      {usesPerson && (
        <label className="block min-w-[200px]">
          <span className="b-label">Team member</span>
          <Select people name="employee" className="b-input" defaultValue={employee} onChange={() => form.current?.requestSubmit()}>
            <option value="">Everyone</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="b-btn-primary"><Eye size={15} /> Preview</button>
        <button type="submit" formAction="/base/reports/download" name="format" value="pdf" className="b-btn-brass"><FileText size={15} /> PDF</button>
        <button type="submit" formAction="/base/reports/download" name="format" value="xlsx" className="b-btn-ghost"><FileSpreadsheet size={15} /> Excel</button>
        <button type="submit" formAction="/base/reports/download" name="format" value="csv" className="b-btn-ghost"><Sheet size={15} /> CSV</button>
      </div>
    </form>
  );
}
