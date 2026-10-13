'use client';

import { useState } from 'react';
import { Download, FileText, Filter } from 'lucide-react';

type Preset = { key: string; label: string; from: string; to: string };

/**
 * Pick any date range (quick presets or custom dates) and, for managers, one person —
 * then view it on screen or download it as a PDF (everyone) or CSV (managers).
 */
export default function TimesheetFilter({
  presets,
  from: initialFrom,
  to: initialTo,
  employee: initialEmployee = '',
  employees,
}: {
  presets: Preset[];
  from: string;
  to: string;
  employee?: string;
  /** Managers only: who can be picked. Omit for employees (always their own timesheet). */
  employees?: { id: string; name: string }[];
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const preset = presets.find((p) => p.from === from && p.to === to)?.key ?? 'custom';

  return (
    <form method="get" action="/base/timesheets" className="b-card b-card-pad mb-6">
      <input type="hidden" name="view" value="range" />
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] md:items-end">
        <label className="block">
          <span className="b-label">Date range</span>
          <select
            className="b-input"
            value={preset}
            onChange={(e) => {
              const p = presets.find((x) => x.key === e.target.value);
              if (p) {
                setFrom(p.from);
                setTo(p.to);
              }
            }}
          >
            {presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            <option value="custom" disabled={preset !== 'custom'}>Custom dates</option>
          </select>
        </label>
        <label className="block">
          <span className="b-label">From</span>
          <input type="date" name="from" className="b-input" required value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block">
          <span className="b-label">To</span>
          <input type="date" name="to" className="b-input" required value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        {employees ? (
          <label className="block">
            <span className="b-label">Team member</span>
            <select name="employee" className="b-input" defaultValue={initialEmployee}>
              <option value="">Everyone</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
        ) : (
          <div className="hidden md:block" />
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" className="b-btn-primary"><Filter size={15} /> Show timesheet</button>
        <button type="submit" formAction="/base/timesheets/pdf" className="b-btn-brass"><FileText size={15} /> Download PDF</button>
        {employees && <button type="submit" formAction="/base/timesheets/export" className="b-btn-ghost"><Download size={15} /> Download CSV</button>}
      </div>
    </form>
  );
}
