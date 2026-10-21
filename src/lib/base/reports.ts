import 'server-only';
import { describeActivity, type ActivityDetails } from './activity';
import { db, must } from './db';
import { entryIssues, summarizeHours } from './payroll';
import { breakMinutes, listEmployees, listEntries, listLocations, workedMinutes } from './queries';
import type { CompanySettings } from './settings';
import { addDaysYmd, dayRangeIso, fmtDate, fmtTime, payPeriodStartYmd, toYmd, type Ymd } from './time';
import { fullName, timeOffReasonLabel, timeOffTypeLabel, wageLabel, type Employee, type Shift, type TimeOffRequest } from './types';

/** How a column's values are shown: durations are minutes, money is dollars. */
export type ColumnKind = 'text' | 'number' | 'minutes' | 'money' | 'date';
export type Column = { label: string; kind?: ColumnKind; width?: number };
export type Cell = string | number | null;
export type Report = {
  key: ReportKey;
  title: string;
  subtitle: string;
  columns: Column[];
  rows: Cell[][];
  totals?: Cell[];
  notes?: string[];
};

export type ReportKey = 'hours' | 'payroll' | 'timecards' | 'attendance' | 'time-off' | 'roster' | 'activity' | 'inquiries';

export const REPORTS: Record<ReportKey, { title: string; description: string; usesRange: boolean; usesPerson: boolean }> = {
  hours: { title: 'Hours summary', description: 'Days worked, regular and overtime hours, breaks and estimated pay per person.', usesRange: true, usesPerson: true },
  payroll: { title: 'Payroll by pay period', description: 'Each person’s hours and estimated pay for every pay period in the range — ready for payroll.', usesRange: true, usesPerson: true },
  timecards: { title: 'Time cards', description: 'Every punch in and out with places, breaks, worked time and issues.', usesRange: true, usesPerson: true },
  attendance: { title: 'Attendance & punctuality', description: 'Scheduled shifts against actual punches: on time, late, no-shows and early leaves.', usesRange: true, usesPerson: true },
  'time-off': { title: 'Time off', description: 'Leave requests in the range with type, hours and status.', usesRange: true, usesPerson: true },
  roster: { title: 'Team roster', description: 'Everyone on the team with contact details, roles, access and wage.', usesRange: false, usesPerson: false },
  activity: { title: 'Activity log', description: 'Who did what in the Employee Portal, in plain sentences.', usesRange: true, usesPerson: true },
  inquiries: { title: 'Website inquiries', description: 'Messages from the website contact form and chat assistant.', usesRange: true, usesPerson: false },
};

export const isReportKey = (k: unknown): k is ReportKey => typeof k === 'string' && k in REPORTS;

type Input = { key: ReportKey; from: Ymd; to: Ymd; employeeId?: string; settings: CompanySettings };

const rateOf = (e: Employee | undefined) => (e?.wage?.wage_type === 'hourly' ? e.wage.amount : null);

export async function buildReport({ key, from, to, employeeId, settings }: Input): Promise<Report> {
  const zone = settings.timezone;
  const [startIso] = dayRangeIso(from, zone);
  const [, endIso] = dayRangeIso(to, zone);
  const employees = await listEmployees(true);
  const byId = new Map(employees.map((e) => [e.id, e]));
  const nameOf = (id: string | null) => {
    const e = id ? byId.get(id) : undefined;
    return e ? fullName(e) : 'Former team member';
  };
  const person = employeeId ? byId.get(employeeId) : undefined;
  const range = from === to ? fmtDate(from, zone, 'EEE, MMM d, yyyy') : `${fmtDate(from, zone, 'MMM d, yyyy')} – ${fmtDate(to, zone, 'MMM d, yyyy')}`;
  const subtitle = REPORTS[key].usesRange ? `${range} · ${person ? fullName(person) : REPORTS[key].usesPerson ? 'All team members' : 'All'}` : `As of ${fmtDate(new Date(), zone, 'MMM d, yyyy')}`;
  const base = { key, title: REPORTS[key].title, subtitle };

  switch (key) {
    case 'hours': {
      const entries = await listEntries(startIso, endIso, employeeId);
      const byPerson = groupBy(entries, (e) => e.employee_id);
      const rows = [...byPerson.entries()]
        .map(([id, list]) => {
          const emp = byId.get(id);
          const sum = summarizeHours(list, settings);
          const rate = rateOf(emp);
          const pay = rate == null ? null : (sum.regular / 60) * rate + (sum.overtime / 60) * rate * 1.5;
          const days = new Set(list.map((e) => toYmd(new Date(e.clock_in_at), zone))).size;
          const meal = list.reduce((s, e) => s + breakMinutes(e, 'meal'), 0);
          return [nameOf(id), emp?.roles[0]?.name ?? '', days, list.length, sum.regular, sum.overtime, sum.total, meal, rate, pay] as Cell[];
        })
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      return {
        ...base,
        columns: [
          { label: 'Team member', width: 150 },
          { label: 'Role', width: 90 },
          { label: 'Days', kind: 'number' },
          { label: 'Time cards', kind: 'number' },
          { label: 'Regular', kind: 'minutes' },
          { label: 'Overtime', kind: 'minutes' },
          { label: 'Total worked', kind: 'minutes' },
          { label: 'Meal breaks', kind: 'minutes' },
          { label: 'Hourly rate', kind: 'money' },
          { label: 'Est. pay', kind: 'money' },
        ],
        rows,
        totals: ['Total', '', sumCol(rows, 2), sumCol(rows, 3), sumCol(rows, 4), sumCol(rows, 5), sumCol(rows, 6), sumCol(rows, 7), null, sumCol(rows, 9)],
        notes: [`Overtime over ${settings.weekly_overtime_hours ?? '—'} hrs/week${settings.daily_overtime_hours ? ` or ${settings.daily_overtime_hours} hrs/day` : ''}, estimated at 1.5×. Salaried people show no hourly estimate.`],
      };
    }

    case 'payroll': {
      const entries = await listEntries(startIso, endIso, employeeId);
      const rows: Cell[][] = [];
      const byPerson = groupBy(entries, (e) => e.employee_id);
      for (const [id, list] of [...byPerson.entries()].sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0])))) {
        const emp = byId.get(id);
        const byPeriod = groupBy(list, (e) => payPeriodStartYmd(toYmd(new Date(e.clock_in_at), zone), settings.pay_period_anchor, settings.pay_period_days, zone));
        for (const [start, cards] of [...byPeriod.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
          const sum = summarizeHours(cards, settings);
          const rate = rateOf(emp);
          const end = addDaysYmd(start, settings.pay_period_days - 1, zone);
          rows.push([
            nameOf(id),
            `${fmtDate(start, zone, 'MMM d')} – ${fmtDate(end, zone, 'MMM d, yyyy')}`,
            emp?.wage ? (emp.wage.wage_type === 'hourly' ? 'Hourly' : 'Salary') : 'Not set',
            sum.regular,
            sum.overtime,
            sum.total,
            rate,
            rate == null ? null : (sum.regular / 60) * rate,
            rate == null ? null : (sum.overtime / 60) * rate * 1.5,
            rate == null ? null : (sum.regular / 60) * rate + (sum.overtime / 60) * rate * 1.5,
          ]);
        }
      }
      return {
        ...base,
        columns: [
          { label: 'Team member', width: 140 },
          { label: 'Pay period', width: 130 },
          { label: 'Pay type' },
          { label: 'Regular', kind: 'minutes' },
          { label: 'Overtime', kind: 'minutes' },
          { label: 'Total', kind: 'minutes' },
          { label: 'Rate', kind: 'money' },
          { label: 'Regular pay', kind: 'money' },
          { label: 'Overtime pay', kind: 'money' },
          { label: 'Est. gross', kind: 'money' },
        ],
        rows,
        totals: ['Total', '', '', sumCol(rows, 3), sumCol(rows, 4), sumCol(rows, 5), null, sumCol(rows, 7), sumCol(rows, 8), sumCol(rows, 9)],
        notes: [`Pay periods: ${settings.pay_period_days === 7 ? 'weekly' : 'every two weeks'}. Estimates only — before taxes and deductions.`],
      };
    }

    case 'timecards': {
      const entries = await listEntries(startIso, endIso, employeeId);
      const rows = [...entries]
        .sort((a, b) => nameOf(a.employee_id).localeCompare(nameOf(b.employee_id)) || a.clock_in_at.localeCompare(b.clock_in_at))
        .map((e) => [
          nameOf(e.employee_id),
          toYmd(new Date(e.clock_in_at), zone),
          fmtTime(e.clock_in_at, zone),
          e.clock_out_at ? fmtTime(e.clock_out_at, zone) : 'On the clock',
          workedMinutes(e),
          breakMinutes(e, 'meal'),
          e.clock_in_place ?? (e.clock_in_lat != null ? `${e.clock_in_lat.toFixed(5)}, ${e.clock_in_lng?.toFixed(5)}` : ''),
          e.clock_out_place ?? '',
          e.clock_in_note ?? '',
          entryIssues(e, settings).map((i) => i.label).join('; '),
        ] as Cell[]);
      return {
        ...base,
        columns: [
          { label: 'Team member', width: 120 },
          { label: 'Date', kind: 'date' },
          { label: 'Punch in' },
          { label: 'Punch out' },
          { label: 'Worked', kind: 'minutes' },
          { label: 'Meal break', kind: 'minutes' },
          { label: 'Punch-in place', width: 150 },
          { label: 'Punch-out place', width: 150 },
          { label: 'Client / route', width: 110 },
          { label: 'Issues', width: 100 },
        ],
        rows,
        totals: ['Total', `${rows.length} cards`, '', '', sumCol(rows, 4), sumCol(rows, 5), '', '', '', ''],
      };
    }

    case 'attendance': {
      let shiftQuery = db().from('shifts').select('*').not('employee_id', 'is', null).not('published_at', 'is', null).gte('starts_at', startIso).lt('starts_at', endIso).order('starts_at');
      if (employeeId) shiftQuery = shiftQuery.eq('employee_id', employeeId);
      const [shiftsRes, entries] = await Promise.all([shiftQuery, listEntries(startIso, endIso, employeeId)]);
      const shifts = must<Shift[]>(shiftsRes, 'load shifts');
      const now = Date.now();
      const grace = settings.late_grace_minutes * 60_000;
      const counts = { onTime: 0, late: 0, noShow: 0 };
      // Each punch's local day is worked out once, and each shift only looks at its own person's punches.
      const dayOf = new Map(entries.map((e) => [e.id, toYmd(new Date(e.clock_in_at), zone)]));
      const entriesOf = groupBy(entries, (e) => e.employee_id);
      const rows = shifts.map((s) => {
        const day = toYmd(new Date(s.starts_at), zone);
        const mine = (entriesOf.get(s.employee_id!) ?? [])
          .filter((e) => e.shift_id === s.id || dayOf.get(e.id) === day)
          .sort((a, b) => a.clock_in_at.localeCompare(b.clock_in_at));
        const first = mine[0];
        const last = mine[mine.length - 1];
        const start = new Date(s.starts_at).getTime();
        const end = new Date(s.ends_at).getTime();
        let status: string;
        let lateMin: number | null = null;
        if (!first) {
          status = start > now ? 'Upcoming' : 'No show';
          if (status === 'No show') counts.noShow++;
        } else {
          const diff = new Date(first.clock_in_at).getTime() - start;
          lateMin = Math.max(0, Math.round(diff / 60_000));
          status = diff > grace ? 'Late' : 'On time';
          if (status === 'Late') counts.late++;
          else counts.onTime++;
          if (last?.clock_out_at && new Date(last.clock_out_at).getTime() < end - 15 * 60_000) status += ' · left early';
        }
        return [
          nameOf(s.employee_id),
          day,
          `${fmtTime(s.starts_at, zone)} – ${fmtTime(s.ends_at, zone)}`,
          first ? fmtTime(first.clock_in_at, zone) : '',
          last?.clock_out_at ? fmtTime(last.clock_out_at, zone) : first ? 'On the clock' : '',
          lateMin,
          mine.reduce((sum, e) => sum + workedMinutes(e), 0),
          status,
        ] as Cell[];
      });
      return {
        ...base,
        columns: [
          { label: 'Team member', width: 140 },
          { label: 'Date', kind: 'date' },
          { label: 'Scheduled', width: 120 },
          { label: 'First punch in' },
          { label: 'Last punch out' },
          { label: 'Minutes late', kind: 'number' },
          { label: 'Worked', kind: 'minutes' },
          { label: 'Status', width: 110 },
        ],
        rows,
        notes: [`${shifts.length} published shifts · ${counts.onTime} on time · ${counts.late} late (over ${settings.late_grace_minutes} min) · ${counts.noShow} no-shows.`],
      };
    }

    case 'time-off': {
      let q = db().from('time_off_requests').select('*').lte('starts_on', to).gte('ends_on', from).order('starts_on');
      if (employeeId) q = q.eq('employee_id', employeeId);
      const list = must<TimeOffRequest[]>(await q, 'load time off');
      const rows = list.map((t) => [
        nameOf(t.employee_id),
        timeOffTypeLabel[t.type],
        timeOffReasonLabel[t.reason],
        t.starts_on,
        t.ends_on,
        t.all_day ? 'All day' : `${t.start_time?.slice(0, 5)}–${t.end_time?.slice(0, 5)}`,
        Number(t.hours),
        t.status[0].toUpperCase() + t.status.slice(1),
        t.note ?? '',
      ] as Cell[]);
      const approved = list.filter((t) => t.status === 'approved').reduce((s, t) => s + Number(t.hours), 0);
      return {
        ...base,
        columns: [
          { label: 'Team member', width: 130 },
          { label: 'Type' },
          { label: 'Reason' },
          { label: 'From', kind: 'date' },
          { label: 'To', kind: 'date' },
          { label: 'When' },
          { label: 'Hours', kind: 'number' },
          { label: 'Status' },
          { label: 'Note', width: 160 },
        ],
        rows,
        notes: [`${approved} approved hours in this range.`],
      };
    }

    case 'roster': {
      const locations = await listLocations();
      const rows = employees.map((e) => [
        fullName(e),
        e.login_id,
        e.access_level[0].toUpperCase() + e.access_level.slice(1),
        e.roles.map((r) => r.name).join(', '),
        e.email ?? '',
        e.phone ?? '',
        locations.find((l) => l.id === e.location_id)?.name ?? '',
        wageLabel(e.wage) ?? '',
        e.status === 'terminated' ? 'Terminated' : e.has_password ? 'Active' : 'No password yet',
        e.hire_date ?? '',
      ] as Cell[]);
      return {
        ...base,
        columns: [
          { label: 'Name', width: 120 },
          { label: 'Login ID', width: 110 },
          { label: 'Access' },
          { label: 'Roles', width: 120 },
          { label: 'Email', width: 150 },
          { label: 'Phone' },
          { label: 'Location' },
          { label: 'Wage' },
          { label: 'Status' },
          { label: 'Hire date', kind: 'date' },
        ],
        rows,
      };
    }

    case 'activity': {
      let q = db().from('audit_log').select('actor_label, action, details, summary, created_at, ip').gte('created_at', startIso).lt('created_at', endIso).order('created_at', { ascending: false }).limit(5000);
      if (employeeId) q = q.eq('actor_id', employeeId);
      const list = must<{ actor_label: string; action: string; details: ActivityDetails | null; summary: string | null; created_at: string; ip: string | null }[]>(await q, 'load activity');
      return {
        ...base,
        columns: [{ label: 'Date', kind: 'date' }, { label: 'Time' }, { label: 'Who', width: 120 }, { label: 'What happened', width: 360 }, { label: 'IP' }],
        rows: list.map((a) => [toYmd(new Date(a.created_at), zone), fmtTime(a.created_at, zone), a.actor_label, a.summary ?? describeActivity(a.action, a.actor_label, a.details), a.ip ?? '']),
        notes: list.length === 5000 ? ['Showing the latest 5,000 entries — pick a shorter range for everything.'] : undefined,
      };
    }

    case 'inquiries': {
      const list = must<{ created_at: string; name: string; email: string; phone: string | null; interest: string | null; source: string | null; status: string; message: string }[]>(
        await db().from('inquiries').select('created_at, name, email, phone, interest, source, status, message').gte('created_at', startIso).lt('created_at', endIso).order('created_at', { ascending: false }),
        'load inquiries',
      );
      const sourceLabel: Record<string, string> = { contact_form: 'Contact form', website_chat: 'Website chat', base_chat: 'Base assistant' };
      return {
        ...base,
        columns: [{ label: 'Date', kind: 'date' }, { label: 'Name', width: 110 }, { label: 'Email', width: 150 }, { label: 'Phone' }, { label: 'Interest' }, { label: 'Source' }, { label: 'Status' }, { label: 'Message', width: 260 }],
        rows: list.map((i) => [toYmd(new Date(i.created_at), zone), i.name, i.email, i.phone ?? '', i.interest ?? '', sourceLabel[i.source ?? 'contact_form'] ?? i.source ?? '', i.status, i.message]),
      };
    }
  }
}

function groupBy<T>(list: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of list) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function sumCol(rows: Cell[][], i: number): number | null {
  const nums = rows.map((r) => r[i]).filter((v): v is number => typeof v === 'number');
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
}

/** A cell as text, for the screen and the PDF. */
export function fmtCell(v: Cell, kind: ColumnKind = 'text'): string {
  if (v === null || v === '') return kind === 'money' ? '—' : '';
  if (typeof v === 'number') {
    if (kind === 'minutes') {
      const m = Math.max(0, Math.round(v));
      return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    }
    if (kind === 'money') return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
  return v;
}

