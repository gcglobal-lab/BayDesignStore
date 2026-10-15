'use client';

import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, Filter } from 'lucide-react';
import { DateRangePicker, type RangePreset } from './calendar/Calendar';
import { MONTHS, MONTHS_SHORT, firstOfMonth, lastOfMonth } from './calendar/dates';
import Select from '@/components/ui/Select';

/**
 * Pick any date range — quick presets, a whole month (Jan … Dec), part of a month, or any
 * from/to on the calendar — and, for managers, one person. Then view it on screen or
 * download it as a PDF (everyone) or spreadsheet (managers).
 */
export default function TimesheetFilter({
  presets,
  from: initialFrom,
  to: initialTo,
  employee: initialEmployee = '',
  employees,
  zone,
  weekStart,
  maxDays,
}: {
  presets: RangePreset[];
  from: string;
  to: string;
  employee?: string;
  /** Managers only: who can be picked. Omit for employees (always their own timesheet). */
  employees?: { id: string; name: string }[];
  zone: string;
  weekStart: number;
  maxDays: number;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [range, setRange] = useState({ from: initialFrom, to: initialTo });
  const [year, setYear] = useState(Number(initialFrom.slice(0, 4)));
  const preset = presets.find((p) => p.from === range.from && p.to === range.to)?.key ?? 'custom';

  const isFullMonth = (m0: number) => range.from === firstOfMonth(year, m0) && range.to === lastOfMonth(year, m0);
  const isInMonth = (m0: number) => !isFullMonth(m0) && range.from.slice(0, 7) === `${year}-${String(m0 + 1).padStart(2, '0')}` && range.to.slice(0, 7) === range.from.slice(0, 7);

  /** Changing the range submits straight away, so the table follows the filter. */
  function show(next: { from: string; to: string }) {
    setRange(next);
    window.setTimeout(() => form.current?.requestSubmit(), 0);
  }

  return (
    <form ref={form} method="get" action="/base/timesheets" className="b-card b-card-pad mb-6 space-y-5">
      <input type="hidden" name="view" value="range" />
      <input type="hidden" name="from" value={range.from} />
      <input type="hidden" name="to" value={range.to} />
      {/* Used by the Excel button (the reports download); ignored by the other buttons. */}
      <input type="hidden" name="report" value="timecards" />
      <input type="hidden" name="format" value="xlsx" />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)] lg:items-end">
        <label className="block">
          <span className="b-label">Quick range</span>
          <Select
            className="b-input"
            value={preset}
            onChange={(e) => {
              const p = presets.find((x) => x.key === e.target.value);
              if (p) show({ from: p.from, to: p.to });
            }}
          >
            {presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            <option value="custom" disabled={preset !== 'custom'}>Custom dates</option>
          </Select>
        </label>
        <div>
          <span className="b-label">From → To</span>
          <DateRangePicker from={range.from} to={range.to} onChange={show} presets={presets} zone={zone} weekStart={weekStart} maxDays={maxDays} />
        </div>
        {employees ? (
          <label className="block">
            <span className="b-label">Team member</span>
            <Select people name="employee" className="b-input" defaultValue={initialEmployee} onChange={() => form.current?.requestSubmit()}>
              <option value="">Everyone</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </label>
        ) : (
          <div className="hidden lg:block" />
        )}
      </div>

      {/* Month filter: a whole month in one click. Pick days on the calendar for part of a month. */}
      <div className="rounded-2xl border border-stone/60 bg-gradient-to-r from-linen/80 via-white to-violet-50/60 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="b-label !mb-0">Month</span>
          <div className="flex items-center gap-1 rounded-full border border-stone bg-white px-1 py-0.5">
            <button type="button" className="rounded-full p-1.5 hover:bg-linen" onClick={() => setYear(year - 1)} aria-label="Previous year"><ChevronLeft size={14} /></button>
            <span className="min-w-[3rem] text-center text-sm font-semibold">{year}</span>
            <button type="button" className="rounded-full p-1.5 hover:bg-linen" onClick={() => setYear(year + 1)} aria-label="Next year"><ChevronRight size={14} /></button>
          </div>
          <span className="ml-auto hidden text-xs text-muted md:block">Full month: tap a month · Part of a month: pick days in From → To</span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 xl:grid-cols-12">
          {MONTHS_SHORT.map((label, i) => (
            <button
              key={label}
              type="button"
              title={`All of ${MONTHS[i]} ${year}`}
              onClick={() => show({ from: firstOfMonth(year, i), to: lastOfMonth(year, i) })}
              className={`rounded-xl py-2.5 text-sm font-semibold transition-all ${
                isFullMonth(i)
                  ? 'bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-[0_8px_18px_-10px_rgba(124,58,237,0.9)]'
                  : isInMonth(i)
                    ? 'bg-white text-violet-700 ring-2 ring-inset ring-violet-400'
                    : 'bg-white text-ink ring-1 ring-inset ring-stone/70 hover:ring-violet-300'
              }`}
            >
              {label}
              {isInMonth(i) && <span className="block text-[0.6rem] font-medium">part</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="b-btn-primary"><Filter size={15} /> Show timesheet</button>
        <button type="submit" formAction="/base/timesheets/pdf" className="b-btn-brass"><FileText size={15} /> Download PDF</button>
        {employees && (
          <>
            <button type="submit" formAction="/base/reports/download" className="b-btn-ghost"><FileSpreadsheet size={15} /> Download Excel</button>
            <button type="submit" formAction="/base/timesheets/export" className="b-btn-ghost"><Download size={15} /> CSV</button>
          </>
        )}
      </div>
    </form>
  );
}
