import 'server-only';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { toCsv } from './csv';
import { fmtCell, type Cell, type Report } from './reports';

const INDIGO: [number, number, number] = [79, 70, 229];
const VIOLET: [number, number, number] = [124, 58, 237];
const INK: [number, number, number] = [23, 23, 58];
const MUTED: [number, number, number] = [100, 106, 135];
const LINEN: [number, number, number] = [238, 240, 252];

/** The built-in PDF fonts only cover Latin-1, so swap typographic punctuation and drop anything else. */
const latin = (s: string) =>
  s
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/×/g, 'x')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

export function reportPdf(report: Report, company: string, generatedAt: string): ArrayBuffer {
  const wide = report.columns.length > 6;
  const doc = new jsPDF({ orientation: wide ? 'landscape' : 'portrait', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 36;

  // Header band
  doc.setFillColor(...INDIGO);
  doc.rect(0, 0, pageWidth, 74, 'F');
  doc.setFillColor(...VIOLET);
  doc.rect(pageWidth * 0.62, 0, pageWidth * 0.38, 74, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text(latin(report.title), margin, 36);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(latin(report.subtitle), margin, 55);
  doc.text(latin(company), pageWidth - margin, 36, { align: 'right' });
  doc.text(latin(`Generated ${generatedAt}`), pageWidth - margin, 55, { align: 'right' });

  const body = report.rows.map((r) => r.map((v, i) => latin(fmtCell(v, report.columns[i]?.kind))));
  const foot = report.totals ? [report.totals.map((v, i) => latin(fmtCell(v, report.columns[i]?.kind)))] : undefined;
  const numeric = (i: number) => ['number', 'minutes', 'money'].includes(report.columns[i]?.kind ?? 'text');

  autoTable(doc, {
    startY: 92,
    margin: { left: margin, right: margin, bottom: 40 },
    head: [report.columns.map((c) => latin(c.label))],
    body: body.length ? body : [[{ content: 'No data for this range.', colSpan: report.columns.length, styles: { halign: 'center', textColor: MUTED } }]],
    foot,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: wide ? 7.6 : 8.6, cellPadding: 4, textColor: INK, lineColor: [221, 224, 239], lineWidth: 0.5, overflow: 'linebreak' },
    headStyles: { fillColor: INK, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: LINEN, textColor: INK, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 249, 255] },
    columnStyles: Object.fromEntries(report.columns.map((c, i) => [i, { halign: numeric(i) ? 'right' : 'left', ...(c.width ? { cellWidth: c.width * (wide ? 0.85 : 1) } : {}) }])),
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(latin(`${report.title} · ${company}`), margin, h - 18);
      doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - margin, h - 18, { align: 'right' });
    },
  });

  if (report.notes?.length) {
    const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100;
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    report.notes.forEach((n, i) => doc.text(latin(n), margin, y + 18 + i * 12, { maxWidth: pageWidth - margin * 2 }));
  }
  return doc.output('arraybuffer');
}

/** Excel workbook: real numbers (hours as decimal hours, money as currency), frozen header, filters. */
export async function reportXlsx(report: Report, company: string, generatedAt: string): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Employee Portal';
  wb.created = new Date();
  const ws = wb.addWorksheet(report.title.slice(0, 31), { views: [{ state: 'frozen', ySplit: 4 }] });

  ws.mergeCells(1, 1, 1, report.columns.length);
  ws.getCell(1, 1).value = report.title;
  ws.getCell(1, 1).font = { bold: true, size: 16, color: { argb: 'FF4F46E5' } };
  ws.mergeCells(2, 1, 2, report.columns.length);
  ws.getCell(2, 1).value = `${report.subtitle} · ${company} · generated ${generatedAt}`;
  ws.getCell(2, 1).font = { size: 10, color: { argb: 'FF646A87' } };

  const header = ws.getRow(4);
  report.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.kind === 'minutes' ? `${c.label} (hours)` : c.label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17173A' } };
    cell.alignment = { vertical: 'middle' };
  });
  header.height = 20;

  const toExcel = (v: Cell, i: number) => {
    const kind = report.columns[i]?.kind;
    if (v === null || v === '') return null;
    if (kind === 'minutes' && typeof v === 'number') return Math.round((v / 60) * 100) / 100;
    if (kind === 'money' && typeof v === 'number') return Math.round(v * 100) / 100;
    if (kind === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T00:00:00Z`);
    return v;
  };
  const addRow = (cells: Cell[], bold = false) => {
    const row = ws.addRow(cells.map(toExcel));
    report.columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (c.kind === 'minutes') cell.numFmt = '0.00';
      if (c.kind === 'money') cell.numFmt = '"$"#,##0.00';
      if (c.kind === 'date') cell.numFmt = 'yyyy-mm-dd';
      if (bold) {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF0FC' } };
      }
    });
  };
  report.rows.forEach((r) => addRow(r));
  if (report.totals) addRow(report.totals, true);
  if (report.rows.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + report.rows.length, column: report.columns.length } };

  report.columns.forEach((c, i) => {
    const longest = Math.max(c.label.length + 8, ...report.rows.slice(0, 500).map((r) => fmtCell(r[i], c.kind).length));
    ws.getColumn(i + 1).width = Math.min(60, Math.max(10, longest + 2));
  });
  if (report.notes?.length) {
    ws.addRow([]);
    report.notes.forEach((n) => (ws.addRow([n]).getCell(1).font = { italic: true, color: { argb: 'FF646A87' } }));
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export function reportCsv(report: Report): string {
  return toCsv([
    report.columns.map((c) => (c.kind === 'minutes' ? `${c.label} (hours)` : c.label)),
    ...[...report.rows, ...(report.totals ? [report.totals] : [])].map((r) =>
      r.map((v, i) => (report.columns[i]?.kind === 'minutes' && typeof v === 'number' ? (Math.round((v / 60) * 100) / 100).toFixed(2) : report.columns[i]?.kind === 'money' && typeof v === 'number' ? v.toFixed(2) : v)),
    ),
  ]);
}
