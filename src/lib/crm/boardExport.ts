import 'server-only';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { LOGO_PNG } from './pdfLogo';
import { cellText, columnsAt, formulaIsMoney, formulaValue, isNumeric, money2, num, type Board, type BoardColumn, type BoardGroup, type BoardItem } from './boardTypes';

type Data = { board: Board; columns: BoardColumn[]; groups: BoardGroup[]; items: BoardItem[] };
export type Scope = { kind: 'board' } | { kind: 'group'; group: BoardGroup } | { kind: 'item'; item: BoardItem };

const INK: [number, number, number] = [23, 23, 58];
const MUTED: [number, number, number] = [100, 106, 135];
const latin = (s: string) => s.replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[×]/g, 'x').replace(/[−]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?');
const hexRgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function helpers(d: Data, names: Record<string, string>) {
  const itemCols = d.columns.filter((c) => c.scope === 'item').sort((a, b) => a.position - b.position);
  const subCols = columnsAt(d.columns, 1);
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

type RGB = [number, number, number];
const BRASS: RGB = [168, 131, 79];
const RULE: RGB = [229, 224, 213];
const IVORY: RGB = [250, 248, 243];
const STORE_LINE = 'Bay Design Store  ·  326 13th Avenue South, Naples, FL 34102  ·  (239) 649-0906';

/** A Status / Dropdown cell's label colour, so the PDF shows the same coloured pills as the board. */
const labelRgb = (c: BoardColumn | undefined, it: BoardItem | undefined): RGB | null => {
  if (!c || !it || (c.type !== 'status' && c.type !== 'dropdown')) return null;
  const l = (c.settings.labels ?? []).find((x) => x.id === it.values[c.id]);
  return l ? hexRgb(l.color) : null;
};

/**
 * A branded report: logo and store name, the board / group / row title with a few headline
 * figures, then one table per group in that group's colour, with page numbers and the store's
 * address on every page.
 */
export function boardPdf(d: Data, scope: Scope, names: Record<string, string>, generated: string): ArrayBuffer {
  const h = helpers(d, names);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const groupName = (id: string) => d.groups.find((g) => g.id === id)?.name ?? '';
  const title = scope.kind === 'item' ? scope.item.name : scope.kind === 'group' ? scope.group.name : d.board.name;
  const subtitle = scope.kind === 'item' ? `${d.board.name}  ·  ${groupName(scope.item.group_id)}` : scope.kind === 'group' ? d.board.name : (d.board.description ?? '').replace(/\s+/g, ' ').slice(0, 150);
  const kind = scope.kind === 'item' ? `${d.board.item_label} details` : scope.kind === 'group' ? `${d.board.group_label} report` : 'Board report';

  // ---- letterhead
  doc.addImage(LOGO_PNG, 'PNG', M, 28, 34, 34);
  doc.setFont('times', 'normal');
  doc.setFontSize(16);
  doc.setTextColor(...INK);
  doc.text('BAY DESIGN STORE', M + 46, 45, { charSpace: 1.2 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text('FINE FURNITURE   |   INTERIOR DESIGN', M + 46, 57, { charSpace: 0.9 });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...BRASS);
  doc.text(latin(kind.toUpperCase()), W - M, 42, { align: 'right', charSpace: 1 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(latin(`Generated ${generated}`), W - M, 55, { align: 'right' });
  doc.setDrawColor(...BRASS);
  doc.setLineWidth(1.2);
  doc.line(M, 74, W - M, 74);

  // ---- title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(21);
  doc.setTextColor(...INK);
  doc.text(latin(title), M, 106);
  let y = 106;
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...MUTED);
    doc.text(latin(subtitle), M, 122);
    y = 122;
  }

  // ---- headline figures
  const groups = scope.kind === 'item' ? [] : h.groupsIn(scope);
  const topRows = scope.kind === 'item' ? [scope.item] : groups.flatMap((g) => h.rowsOf(g));
  const chips: { label: string; value: string }[] =
    scope.kind === 'item'
      ? [{ label: 'Sub-items', value: String(h.subsOf(scope.item.id).length) }]
      : [
          { label: cap(`${d.board.item_label}s`), value: String(topRows.length) },
          ...(scope.kind === 'board' ? [{ label: cap(`${d.board.group_label}s`), value: String(groups.length) }] : []),
          { label: 'Sub-items', value: String(topRows.reduce((s, it) => s + h.subsOf(it.id).length, 0)) },
        ];
  for (const c of h.itemCols.filter((c) => h.isMoney(c)).slice(0, 3)) chips.push({ label: c.name, value: h.fmtTotal(c, topRows.reduce((s, it) => s + (Number(h.value(c, it)) || 0), 0)) });
  y += 16;
  let x = M;
  for (const chip of chips) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    const w = Math.max(84, doc.getTextWidth(latin(chip.value)) + 28, (doc.getTextWidth(latin(chip.label.toUpperCase())) * 7) / 13 + 28);
    if (x + w > W - M) break;
    doc.setFillColor(...IVORY);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.6);
    doc.roundedRect(x, y, w, 42, 6, 6, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(latin(chip.label.toUpperCase()), x + 12, y + 15, { charSpace: 0.5 });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...INK);
    doc.text(latin(chip.value), x + 12, y + 33);
    x += w + 10;
  }
  y += 66;

  // ---- building blocks
  type Cell = { text: string; color?: RGB | null };
  const table = (head: string[], body: Cell[][], opts: { accent?: RGB; foot?: string[]; right?: boolean[]; first?: number } = {}) => {
    const accent = opts.accent ?? INK;
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, top: 44, bottom: 46 },
      head: [head.map(latin)],
      body: body.map((r) => r.map((c) => latin(c.text ?? ''))),
      foot: opts.foot ? [opts.foot.map(latin)] : undefined,
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: head.length > 9 ? 7.2 : 8.3, cellPadding: { top: 5, bottom: 5, left: 6, right: 6 }, textColor: INK, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: accent, textColor: 255, fontStyle: 'bold', fontSize: head.length > 9 ? 7 : 7.8 },
      alternateRowStyles: { fillColor: IVORY },
      footStyles: { fillColor: [241, 237, 228], textColor: INK, fontStyle: 'bold' },
      columnStyles: {
        ...Object.fromEntries((opts.right ?? []).map((r, i) => [i, { halign: r ? 'right' : 'left' }])),
        [0]: { fontStyle: 'bold', cellWidth: opts.first ?? 'auto' },
      },
      didParseCell: (cell) => {
        if (cell.section !== 'body') return;
        const rgb = body[cell.row.index]?.[cell.column.index]?.color;
        if (rgb && cell.cell.raw) {
          cell.cell.styles.fillColor = rgb;
          cell.cell.styles.textColor = 255;
          cell.cell.styles.fontStyle = 'bold';
          cell.cell.styles.halign = 'center';
        }
      },
      didDrawCell: (cell) => {
        if (cell.section !== 'body') return;
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.4);
        doc.line(cell.cell.x, cell.cell.y + cell.cell.height, cell.cell.x + cell.cell.width, cell.cell.y + cell.cell.height);
      },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 24;
  };
  const heading = (text: string, note: string, rgb: RGB = INK) => {
    if (y > H - 130) {
      doc.addPage();
      y = 48;
    }
    doc.setFillColor(...rgb);
    doc.roundedRect(M, y - 9, 5, 13, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(...rgb);
    doc.text(latin(text), M + 12, y + 2);
    if (note) {
      const tw = doc.getTextWidth(latin(text));
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text(latin(note), M + 20 + tw, y + 2);
    }
    y += 12;
  };
  const totalOf = (c: BoardColumn, list: BoardItem[]) => h.fmtTotal(c, list.reduce((s, it) => s + (Number(h.value(c, it)) || 0), 0));

  if (scope.kind === 'item') {
    const it = scope.item;
    heading('Details', '');
    table(
      ['Field', 'Value'],
      [[{ text: cap(d.board.group_label) }, { text: groupName(it.group_id) }], ...h.itemCols.map((c) => [{ text: c.name }, { text: h.text(c, it), color: labelRgb(c, it) }])],
      { first: 180 },
    );
    if (it.description) {
      heading('Description', '');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      const lines = doc.splitTextToSize(latin(it.description), W - M * 2);
      doc.text(lines, M, y + 4);
      y += lines.length * 11 + 20;
    }
    const subs = h.subsOf(it.id);
    if (subs.length) {
      heading('Sub-items', String(subs.length));
      const right = [false, ...h.subCols.map((c) => isNumeric(c.type))];
      const foot = right.some(Boolean) ? ['Total', ...h.subCols.map((c) => (isNumeric(c.type) ? totalOf(c, subs) : ''))] : undefined;
      table(['Name', ...h.subCols.map((c) => c.name)], subs.map((si) => [{ text: si.name }, ...h.subCols.map((c) => ({ text: h.text(c, si), color: labelRgb(c, si) }))]), { foot, right });
    }
  } else {
    const cols = h.itemCols.filter((c) => c.type !== 'long_text' && c.type !== 'files');
    const right = [false, ...cols.map((c) => isNumeric(c.type))];
    for (const g of groups) {
      const rows = h.rowsOf(g);
      const rgb = hexRgb(g.color);
      heading(g.name, `${rows.length} ${d.board.item_label.toLowerCase()}${rows.length === 1 ? '' : 's'}`, rgb);
      const foot = right.some(Boolean) && rows.length ? ['Total', ...cols.map((c) => (isNumeric(c.type) ? totalOf(c, rows) : ''))] : undefined;
      table(
        [cap(d.board.item_label), ...cols.map((c) => c.name)],
        rows.length ? rows.map((it) => [{ text: it.name }, ...cols.map((c) => ({ text: h.text(c, it), color: labelRgb(c, it) }))]) : [[{ text: 'Nothing here yet.' }]],
        { accent: rgb, foot, right },
      );
      const subs = rows.flatMap((it) => h.subsOf(it.id).map((s) => ({ it, s })));
      if (subs.length && scope.kind === 'group') {
        heading('Sub-items', String(subs.length), rgb);
        table(
          [cap(d.board.item_label), 'Sub-item', ...h.subCols.map((c) => c.name)],
          subs.map(({ it, s }) => [{ text: it.name }, { text: s.name }, ...h.subCols.map((c) => ({ text: h.text(c, s), color: labelRgb(c, s) }))]),
          { accent: rgb, right: [false, false, ...h.subCols.map((c) => isNumeric(c.type))] },
        );
      }
    }
  }

  // ---- footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.6);
    doc.line(M, H - 30, W - M, H - 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(latin(STORE_LINE), M, H - 17);
    doc.text(latin(`${title}  ·  Page ${p} of ${pages}`), W - M, H - 17, { align: 'right' });
  }
  return doc.output('arraybuffer');
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
