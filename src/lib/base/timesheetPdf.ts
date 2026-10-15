import 'server-only';
import { jsPDF } from 'jspdf';
import { autoTable, type RowInput } from 'jspdf-autotable';
import { entryIssues, summarizeHours } from './payroll';
import { breakMinutes, workedMinutes } from './queries';
import type { CompanySettings } from './settings';
import { fmtDate, fmtDuration, fmtTime, toYmd, type Ymd } from './time';
import { fullName, type Employee, type TimeEntry } from './types';

const BRASS: [number, number, number] = [79, 70, 229]; // indigo — Bay Design Base theme
const INK: [number, number, number] = [23, 23, 58];
const VIOLET: [number, number, number] = [124, 58, 237];
const MUTED: [number, number, number] = [100, 106, 135];
const LINEN: [number, number, number] = [238, 240, 252];

/** The built-in PDF fonts only cover Latin-1, so swap typographic punctuation and drop anything else. */
const t = (s: string | null | undefined) =>
  (s ?? '')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

type Options = {
  from: Ymd;
  to: Ymd;
  entries: TimeEntry[];
  employees: Employee[];
  settings: CompanySettings;
  /** Shown under the title, e.g. "All team members" or a name. */
  scope: string;
  /** Wages are only printed for managers. */
  showPay: boolean;
};

/**
 * A printable timesheet for any date range: a summary per person (regular, overtime,
 * total, est. pay) followed by every time card with punch places and issues.
 */
export function buildTimesheetPdf({ from, to, entries, employees, settings, scope, showPay }: Options): ArrayBuffer {
  const zone = settings.timezone;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 36;
  const range = from === to ? fmtDate(from, zone, 'EEE, MMM d, yyyy') : `${fmtDate(from, zone, 'MMM d, yyyy')} - ${fmtDate(to, zone, 'MMM d, yyyy')}`;
  const generated = `${fmtDate(new Date(), zone, 'MMM d, yyyy')} ${fmtTime(new Date(), zone)}`;

  const nameOf = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? fullName(e) : 'Former team member';
  };
  const byEmployee = new Map<string, TimeEntry[]>();
  for (const e of [...entries].sort((a, b) => a.clock_in_at.localeCompare(b.clock_in_at))) byEmployee.set(e.employee_id, [...(byEmployee.get(e.employee_id) ?? []), e]);
  const people = [...byEmployee.entries()].map(([id, list]) => {
    const emp = employees.find((x) => x.id === id);
    const sum = summarizeHours(list, settings);
    const rate = emp?.wage?.wage_type === 'hourly' ? emp.wage.amount : null;
    const pay = rate == null ? null : (sum.regular / 60) * rate + (sum.overtime / 60) * rate * 1.5;
    const days = new Set(list.map((e) => toYmd(new Date(e.clock_in_at), zone))).size;
    return { id, name: nameOf(id), list, sum, pay, days };
  });
  people.sort((a, b) => a.name.localeCompare(b.name));

  // ------------------------------------------------------------ header ----
  doc.setFillColor(...BRASS);
  doc.rect(0, 0, pageWidth, 70, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Timesheet', margin, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(t(`${settings.company_name}  |  ${range}  |  ${scope}`), margin, 52);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('EMPLOYEE PORTAL', pageWidth - margin, 32, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(224, 222, 255);
  doc.text(t(`Generated ${generated} (${zone})`), pageWidth - margin, 52, { align: 'right' });

  let y = 92;
  const totals = people.reduce((s, p) => ({ total: s.total + p.sum.total, overtime: s.overtime + p.sum.overtime, pay: s.pay + (p.pay ?? 0), cards: s.cards + p.list.length }), { total: 0, overtime: 0, pay: 0, cards: 0 });

  // Key figures
  const stats: [string, string][] = [
    ['Team members', String(people.length)],
    ['Time cards', String(totals.cards)],
    ['Total worked (HH:MM)', fmtDuration(totals.total)],
    ['Overtime (HH:MM)', fmtDuration(totals.overtime)],
    ...(showPay ? ([['Est. pay', `$${totals.pay.toFixed(2)}`]] as [string, string][]) : []),
  ];
  const boxW = (pageWidth - margin * 2 - (stats.length - 1) * 10) / stats.length;
  stats.forEach(([label, value], i) => {
    const x = margin + i * (boxW + 10);
    doc.setFillColor(...LINEN);
    doc.roundedRect(x, y, boxW, 44, 6, 6, 'F');
    doc.setTextColor(...MUTED);
    doc.setFontSize(8);
    doc.text(label.toUpperCase(), x + 10, y + 15);
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(value, x + 10, y + 35);
    doc.setFont('helvetica', 'normal');
  });
  y += 62;

  if (people.length === 0) {
    doc.setTextColor(...MUTED);
    doc.setFontSize(11);
    doc.text('No time cards in this period.', margin, y + 10);
  } else {
    // -------------------------------------------------------- summary ----
    const head = ['Team member', 'Days worked', 'Regular (HH:MM)', 'Overtime (HH:MM)', 'Total worked (HH:MM)', ...(showPay ? ['Est. pay'] : []), 'Issues'];
    const body: RowInput[] = people.map((p) => [
      t(p.name),
      String(p.days),
      fmtDuration(p.sum.regular),
      fmtDuration(p.sum.overtime),
      fmtDuration(p.sum.total),
      ...(showPay ? [p.pay == null ? 'No hourly wage' : `$${p.pay.toFixed(2)}`] : []),
      String(p.list.reduce((n, e) => n + entryIssues(e, settings).length, 0) || '-'),
    ]);
    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      foot: [['Total', '', fmtDuration(totals.total - totals.overtime), fmtDuration(totals.overtime), fmtDuration(totals.total), ...(showPay ? [`$${totals.pay.toFixed(2)}`] : []), '']],
      margin: { left: margin, right: margin, top: 40 },
      styles: { fontSize: 9, cellPadding: 5, textColor: INK },
      headStyles: { fillColor: BRASS, textColor: 255 },
      footStyles: { fillColor: LINEN, textColor: INK, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 249, 255] },
      // Number columns line up on the right in the heading, rows and total alike.
      didParseCell: (data) => {
        if (data.column.index >= 1 && data.column.index <= (showPay ? 5 : 4)) data.cell.styles.halign = 'right';
      },
    });

    // -------------------------------------------------- per person -------
    for (const p of people) {
      autoTable(doc, {
        startY: lastY(doc) + 22,
        head: [
          [{ content: t(`${p.name}  -  ${fmtDuration(p.sum.total)} worked${p.sum.overtime ? ` (${fmtDuration(p.sum.overtime)} overtime)` : ''}`), colSpan: 7, styles: { fillColor: VIOLET, textColor: 255, fontSize: 10 } }],
          ['Date', 'Punch in', 'Punch out', 'Meal break (HH:MM)', 'Worked (HH:MM)', 'Punch-in place', 'Notes / issues'],
        ],
        body: p.list.map((e) => [
          fmtDate(new Date(e.clock_in_at), zone, 'EEE MMM d'),
          fmtTime(e.clock_in_at, zone),
          e.clock_out_at ? fmtTime(e.clock_out_at, zone) : 'still on the clock',
          fmtDuration(breakMinutes(e, 'meal')),
          fmtDuration(workedMinutes(e)),
          t(e.clock_in_place ?? (e.clock_in_lat != null ? `${e.clock_in_lat.toFixed(4)}, ${e.clock_in_lng?.toFixed(4)}` : 'No location')),
          t([e.clock_in_note, e.notes, ...entryIssues(e, settings).map((i) => i.label)].filter(Boolean).join(' | ')),
        ]),
        margin: { left: margin, right: margin, top: 40 },
        styles: { fontSize: 8.5, cellPadding: 4, textColor: INK, overflow: 'linebreak' },
        headStyles: { fillColor: LINEN, textColor: INK, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 58 }, 2: { cellWidth: 70 }, 3: { cellWidth: 58 }, 4: { cellWidth: 72 }, 5: { cellWidth: 200 } },
        showHead: 'everyPage',
      });
    }
  }

  // ---------------------------------------------------------- footer ----
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const h = doc.internal.pageSize.getHeight();
    const ot = `Overtime over ${settings.weekly_overtime_hours ?? '-'} hrs/week${settings.daily_overtime_hours ? ` or ${settings.daily_overtime_hours} hrs/day` : ''}, est. at 1.5x. Meal breaks unpaid; rest breaks paid.`;
    doc.text(t(ot), margin, h - 18);
    doc.text(`Page ${i} of ${pages}`, pageWidth - margin, h - 18, { align: 'right' });
  }

  return doc.output('arraybuffer');
}

const lastY = (doc: jsPDF) => (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 120;
