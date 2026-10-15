import 'server-only';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { cellText, formulaIsMoney, formulaValue, isNumeric, money2, num, type Board, type BoardColumn, type BoardGroup, type BoardItem } from './boardTypes';

type Data = { board: Board; columns: BoardColumn[]; groups: BoardGroup[]; items: BoardItem[] };
export type Scope = { kind: 'board' } | { kind: 'group'; group: BoardGroup } | { kind: 'item'; item: BoardItem };

const INK: [number, number, number] = [23, 23, 58];
const MUTED: [number, number, number] = [100, 106, 135];
const latin = (s: string) => s.replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[×]/g, 'x').replace(/[−]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?');
const hexRgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function helpers(d: Data, names: Record<string, string>) {
  const itemCols = d.columns.filter((c) => c.scope === 'item').sort((a, b) => a.position - b.position);
  const subCols = d.columns.filter((c) => c.scope === 'subitem').sort((a, b) => a.position - b.position);
  const subsOf = (id: string) => d.items.filter((i) => i.parent_id === id).sort((a, b) => a.position - b.position);
  const text = (c: BoardColumn, it: BoardItem) => cellText(c, it, { subitems: subsOf(it.id), columns: d.columns, names });
  const value = (c: BoardColumn, it: BoardItem): string | number | null => {
    if (c.type === 'formula') return formulaValue(c, it, subsOf(it.id), d.columns);
    if (c.type === 'number' || c.type === 'currency') return num(it.values[c.id]);
    return text(c, it) || null;
  };
  const isMoney = (c: BoardColumn) => c.type === 'currency' || (c.type === 'formula' && formulaIsMoney(c, d.columns));
  const fmtTotal = (c: BoardColumn, n: number) => (isMoney(c) ? money2(n) : String(Math.round(n * 100) / 100));
  const groupsIn = (scope: Scope) => (scope.kind === 'group' ? [scope.group] : [...d.groups].sort((a, b) => a.position - b.position));
  const rowsOf = (g: BoardGroup) => d.items.filter((i) => !i.parent_id && i.group_id === g.id).sort((a, b) => a.position - b.position);
  return { itemCols, subCols, subsOf, text, value, isMoney, fmtTotal, groupsIn, rowsOf };
}

export async function boardXlsx(d: Data, scope: Scope, names: Record<string, string>): Promise<ArrayBuffer> {
  const h = helpers(d, names);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Employee Portal';
  const header = (ws: ExcelJS.Worksheet, labels: string[], row: number) => {
    const r = ws.getRow(row);
    labels.forEach((l, i) => {
      const cell = r.getCell(i + 1);
      cell.value = l;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17173A' } };
    });
  };
  const fmtCells = (row: ExcelJS.Row, cols: BoardColumn[], offset: number) =>
    cols.forEach((c, i) => {
      if (h.isMoney(c)) row.getCell(i + offset + 1).numFmt = '"$"#,##0.00';
    });
  const title = scope.kind === 'item' ? scope.item.name : scope.kind === 'group' ? `${d.board.name} — ${scope.group.name}` : d.board.name;

  if (scope.kind === 'item') {
    const it = scope.item;
    const ws = wb.addWorksheet('Details');
    ws.getCell(1, 1).value = title;
    ws.getCell(1, 1).font = { bold: true, size: 16, color: { argb: 'FF4F46E5' } };
    ws.getCell(2, 1).value = `${d.board.name} · ${d.groups.find((g) => g.id === it.group_id)?.name ?? ''}`;
    header(ws, ['Field', 'Value'], 4);
    for (const c of h.itemCols) {
      const row = ws.addRow([c.name, h.value(c, it)]);
      if (h.isMoney(c)) row.getCell(2).numFmt = '"$"#,##0.00';
    }
    if (it.description) ws.addRow(['Description', it.description]);
    ws.getColumn(1).width = 24;
    ws.getColumn(2).width = 60;
    const subs = h.subsOf(it.id);
    if (subs.length) {
      const s = wb.addWorksheet('Sub-items');
      header(s, ['Name', ...h.subCols.map((c) => c.name)], 1);
      subs.forEach((si) => fmtCells(s.addRow([si.name, ...h.subCols.map((c) => h.value(c, si))]), h.subCols, 1));
      s.columns.forEach((col) => (col.width = 20));
    }
  } else {
    // Excel sheet names can't contain * ? : \ / [ ] and max out at 31 characters.
    const ws = wb.addWorksheet(`${d.board.item_label}s`.replace(/[*?:\\/[\]]/g, '-').slice(0, 31) || 'Rows', { views: [{ state: 'frozen', ySplit: 3 }] });
    ws.getCell(1, 1).value = title;
    ws.getCell(1, 1).font = { bold: true, size: 16, color: { argb: 'FF4F46E5' } };
    header(ws, [d.board.group_label, d.board.item_label, ...h.itemCols.map((c) => c.name), 'Description'], 3);
    for (const g of h.groupsIn(scope)) {
      const rows = h.rowsOf(g);
      rows.forEach((it) => fmtCells(ws.addRow([g.name, it.name, ...h.itemCols.map((c) => h.value(c, it)), it.description ?? '']), h.itemCols, 2));
      if (rows.length && h.itemCols.some((c) => isNumeric(c.type))) {
        const total = ws.addRow([`${g.name} total`, '', ...h.itemCols.map((c) => (isNumeric(c.type) ? rows.reduce((s, it) => s + (Number(h.value(c, it)) || 0), 0) : null)), '']);
        fmtCells(total, h.itemCols, 2);
        total.font = { bold: true };
      }
    }
    ws.columns.forEach((col, i) => (col.width = i < 2 ? 26 : 18));
    const subsAll = h.groupsIn(scope).flatMap((g) => h.rowsOf(g).flatMap((it) => h.subsOf(it.id).map((s) => ({ g, it, s }))));
    if (subsAll.length) {
      const s = wb.addWorksheet('Sub-items');
      header(s, [d.board.group_label, d.board.item_label, 'Sub-item', ...h.subCols.map((c) => c.name)], 1);
      subsAll.forEach(({ g, it, s: si }) => fmtCells(s.addRow([g.name, it.name, si.name, ...h.subCols.map((c) => h.value(c, si))]), h.subCols, 3));
      s.columns.forEach((col, i) => (col.width = i < 3 ? 24 : 16));
    }
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export function boardPdf(d: Data, scope: Scope, names: Record<string, string>, generated: string): ArrayBuffer {
  const h = helpers(d, names);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const M = 32;
  const title = scope.kind === 'item' ? scope.item.name : scope.kind === 'group' ? scope.group.name : d.board.name;
  const color = scope.kind === 'group' ? hexRgb(scope.group.color) : hexRgb(d.board.color);
  doc.setFillColor(...color);
  doc.rect(0, 0, W, 64, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(latin(title), M, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(latin(scope.kind === 'board' ? d.board.description?.slice(0, 120) ?? '' : d.board.name), M, 50);
  doc.text(latin(`Bay Design Store · ${generated}`), W - M, 32, { align: 'right' });
  let y = 82;
  const table = (head: string[], body: (string | number)[][], foot?: string[], numericFrom = -1, numericCols: boolean[] = []) => {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, bottom: 34 },
      head: [head.map(latin)],
      body: body.map((r) => r.map((v) => latin(String(v ?? '')))),
      foot: foot ? [foot.map(latin)] : undefined,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: head.length > 9 ? 7 : 8, cellPadding: 3.5, textColor: INK, lineColor: [221, 224, 239], lineWidth: 0.5, overflow: 'linebreak' },
      headStyles: { fillColor: INK, textColor: 255 },
      footStyles: { fillColor: [238, 240, 252], textColor: INK, fontStyle: 'bold' },
      columnStyles: Object.fromEntries(numericCols.map((n, i) => [i + Math.max(0, numericFrom), { halign: n ? 'right' : 'left' }])),
      didDrawPage: () => {
        doc.setFontSize(7.5);
        doc.setTextColor(...MUTED);
        doc.text(latin(`${d.board.name} · page ${doc.getNumberOfPages()}`), W - M, doc.internal.pageSize.getHeight() - 14, { align: 'right' });
      },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 18;
  };
  const heading = (text: string, rgb: [number, number, number] = INK) => {
    if (y > doc.internal.pageSize.getHeight() - 90) {
      doc.addPage();
      y = 40;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...rgb);
    doc.text(latin(text), M, y);
    y += 10;
  };

  if (scope.kind === 'item') {
    const it = scope.item;
    table(['Field', 'Value'], [[d.board.group_label, d.groups.find((g) => g.id === it.group_id)?.name ?? ''], ...h.itemCols.map((c) => [c.name, h.text(c, it)])]);
    if (it.description) {
      heading('Description');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      const lines = doc.splitTextToSize(latin(it.description), W - M * 2);
      doc.text(lines, M, y + 4);
      y += lines.length * 11 + 16;
    }
    const subs = h.subsOf(it.id);
    if (subs.length) {
      heading(`Sub-items (${subs.length})`);
      const numeric = h.subCols.map((c) => isNumeric(c.type));
      const foot = numeric.some(Boolean) ? ['Total', ...h.subCols.map((c) => (isNumeric(c.type) ? h.fmtTotal(c, subs.reduce((s, si) => s + (Number(h.value(c, si)) || 0), 0)) : ''))] : undefined;
      table(['Name', ...h.subCols.map((c) => c.name)], subs.map((si) => [si.name, ...h.subCols.map((c) => h.text(c, si))]), foot, 1, numeric);
    }
  } else {
    const cols = h.itemCols.filter((c) => c.type !== 'long_text');
    const numeric = cols.map((c) => isNumeric(c.type));
    for (const g of h.groupsIn(scope)) {
      const rows = h.rowsOf(g);
      heading(`${g.name} — ${rows.length} ${d.board.item_label.toLowerCase()}${rows.length === 1 ? '' : 's'}`, hexRgb(g.color));
      const foot = numeric.some(Boolean) && rows.length ? ['Total', ...cols.map((c) => (isNumeric(c.type) ? h.fmtTotal(c, rows.reduce((s, it) => s + (Number(h.value(c, it)) || 0), 0)) : ''))] : undefined;
      table([d.board.item_label, ...cols.map((c) => c.name)], rows.length ? rows.map((it) => [it.name, ...cols.map((c) => h.text(c, it))]) : [['Nothing here yet.']], foot, 1, numeric);
      const subs = rows.flatMap((it) => h.subsOf(it.id).map((s) => ({ it, s })));
      if (subs.length && scope.kind === 'group') {
        heading('Sub-items');
        table([d.board.item_label, 'Sub-item', ...h.subCols.map((c) => c.name)], subs.map(({ it, s }) => [it.name, s.name, ...h.subCols.map((c) => h.text(c, s))]), undefined, 2, h.subCols.map((c) => isNumeric(c.type)));
      }
    }
  }
  return doc.output('arraybuffer');
}
