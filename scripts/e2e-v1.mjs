#!/usr/bin/env node
/**
 * End-to-end test of the October 2026 V1 changes against a running production server:
 *   boards — each sub-item level gets its own columns (seeded from the level above), a new
 *   column flows down to every level below, deleting a copy leaves the parent's column, a row
 *   is duplicated with its whole sub-item tree, and a board is duplicated with nested sub-items
 *   and its cell values; Workflow ▸ Vendors (add, refuse duplicates / bad emails, edit, delete);
 *   Deliveries ▸ Customers quick add. Everything it creates is deleted at the end.
 *
 *   node scripts/e2e-v1.mjs [--base http://localhost:3000]
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { SignJWT } from 'jose';

process.env.NODE_ENV = 'production';
process.loadEnvFile?.('.env.local');
const { encodeReply } = await import('next/dist/compiled/react-server-dom-turbopack/client.node.js').then((m) => m.default ?? m);
const i = process.argv.indexOf('--base');
const BASE = (i > -1 ? process.argv[i + 1] : 'http://localhost:3000').replace(/\/$/, '');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const manifest = JSON.parse(readFileSync('.next/server/server-reference-manifest.json', 'utf8'));
const id = (file, name) => {
  const found = Object.entries(manifest.node).find(([, v]) => v.filename.replace(/\\/g, '/').endsWith(file) && v.exportedName === name)?.[0];
  if (!found) throw new Error(`Action ${name} in ${file} not found — build first.`);
  return found;
};
const sign = (sub, lvl, sv) =>
  new SignJWT({ lvl, sv }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(sub).setIssuer('bay-design-base').setAudience('bay-design-base:session').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(process.env.SESSION_SECRET));
const admin = `__Host-bdb_session=${await sign('env-admin', 'admin', 1)}`;
let failures = 0;
const check = (label, pass, detail = '') => {
  if (!pass) failures++;
  console.log(`  ${pass ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};
const form = (fields) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) fd.append(k, String(v));
  return fd;
};
/**
 * The action's result from a React Flight response. Rows are `id:json` lines, or `id:T<hex byte
 * length>,<text>` for long strings, which other rows point at as "$<id>".
 */
function actionResult(buf) {
  const rows = new Map();
  for (let pos = 0; pos < buf.length; ) {
    const colon = buf.indexOf(0x3a, pos);
    if (colon < 0) break;
    const key = buf.subarray(pos, colon).toString();
    if (buf[colon + 1] === 0x54) {
      const comma = buf.indexOf(0x2c, colon);
      const len = parseInt(buf.subarray(colon + 2, comma).toString(), 16);
      rows.set(key, { text: buf.subarray(comma + 1, comma + 1 + len).toString() });
      pos = comma + 1 + len;
    } else {
      const nl = buf.indexOf(0x0a, colon);
      const end = nl < 0 ? buf.length : nl;
      rows.set(key, { json: buf.subarray(colon + 1, end).toString() });
      pos = end + 1;
    }
  }
  const resolve = (v) => {
    if (typeof v === 'string' && /^\$[0-9a-f]+$/.test(v)) {
      const r = rows.get(v.slice(1));
      return r?.text ?? (r?.json ? resolve(JSON.parse(r.json)) : v);
    }
    if (typeof v === 'string' && v.startsWith('$$')) return v.slice(1);
    if (Array.isArray(v)) return v.map(resolve);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x)]));
    return v;
  };
  for (const r of rows.values()) {
    if (!r.json?.includes('"ok":')) continue;
    try {
      return resolve(JSON.parse(r.json));
    } catch {
      // not the result row
    }
  }
  return null;
}
async function call(file, name, args, page) {
  const body = await encodeReply(args);
  const res = await fetch(`${BASE}${page}`, { method: 'POST', redirect: 'manual', headers: { 'Next-Action': id(file, name), Accept: 'text/x-component', Origin: BASE, Cookie: admin, ...(typeof body === 'string' ? { 'Content-Type': 'text/plain;charset=UTF-8' } : {}) }, body });
  const buf = Buffer.from(await res.arrayBuffer());
  const result = actionResult(buf);
  return { ok: result?.ok === true, text: buf.toString(), redirect: res.headers.get('x-action-redirect') ?? '', data: result?.data ?? null };
}
const B = (name, args) => call('crm/boards/actions.ts', name, args, '/base/crm/boards');
const get = (path) => fetch(`${BASE}${path}`, { headers: { Cookie: admin }, redirect: 'manual' });
const TAG = `e2e-v1-${Date.now()}`;
const boards = [];
const vendorIds = [];
const contactIds = [];

try {
  console.log(`\nV1 end-to-end test → ${BASE}\n\nBoard columns per sub-item level`);
  const { data: ws } = await db.from('crm_workspaces').select('id').eq('archived', false).order('position').limit(1).single();
  const made = await call('crm/boards/actions.ts', 'createBoard', [null, form({ name: TAG, template: 'blank', workspace_id: ws.id, visibility: 'everyone' })], '/base/crm/boards');
  const boardId = made.redirect.match(/board\/([0-9a-f-]{36})/)?.[1];
  if (!boardId) throw new Error(`createBoard failed: ${made.text.slice(0, 200)}`);
  boards.push(boardId);
  let { data: groups } = await db.from('crm_board_groups').select('id').eq('board_id', boardId);
  if (!groups?.length) {
    await B('addGroup', [boardId, 'Group 1']);
    ({ data: groups } = await db.from('crm_board_groups').select('id').eq('board_id', boardId));
  }
  const groupId = groups[0].id;
  const status = await B('addColumn', [boardId, 'item', 'Stage', 'status', {}, 1]);
  const amount = await B('addColumn', [boardId, 'item', 'Amount', 'currency', {}, 1]);
  const amountCol = JSON.parse(amount.data.column);
  check('table columns added', status.ok && amount.ok);
  const { count: tableCols } = await db.from('crm_board_columns').select('id', { count: 'exact', head: true }).eq('board_id', boardId).eq('scope', 'item');

  const top = JSON.parse((await B('addItem', [boardId, groupId, 'Sofa order', null])).data.item);
  await B('setCell', [top.id, amountCol.id, '12500']);
  const sub1Res = await B('addItem', [boardId, groupId, 'Cushions', top.id]);
  const sub1 = JSON.parse(sub1Res.data.item);
  const seeded1 = sub1Res.data.columns ? JSON.parse(sub1Res.data.columns) : [];
  check('first sub-item gives level 1 its own copy of the table columns', seeded1.length === tableCols && seeded1.every((c) => c.scope === 'subitem' && c.level === 1), seeded1.map((c) => c.name).join(', '));
  const sub2Res = await B('addItem', [boardId, groupId, 'Fabric swatch', sub1.id]);
  const sub2 = JSON.parse(sub2Res.data.item);
  const seeded2 = sub2Res.data.columns ? JSON.parse(sub2Res.data.columns) : [];
  check('first sub-sub-item gives level 2 a copy of level 1', seeded2.length === tableCols && seeded2.every((c) => c.level === 2), seeded2.map((c) => c.name).join(', '));
  const again = await B('addItem', [boardId, groupId, 'Piping', top.id]);
  check('a second sub-item on level 1 doesn’t copy the columns again', again.ok && !again.data.columns);

  const notes = await B('addColumn', [boardId, 'item', 'Shipping notes', 'text', {}, 1]);
  const copies = notes.data.copies ? JSON.parse(notes.data.copies) : [];
  check('a column added to the table flows down to every sub-item level', copies.length === 2 && copies.map((c) => c.level).sort().join() === '1,2', `levels ${copies.map((c) => c.level).join(', ')}`);
  const level1Notes = copies.find((c) => c.level === 1);
  await B('deleteColumn', [level1Notes.id]);
  const { data: afterDelete } = await db.from('crm_board_columns').select('scope, level, name').eq('board_id', boardId).eq('name', 'Shipping notes');
  check('deleting it from level 1 keeps it on the table (and on level 2)', afterDelete.length === 2 && afterDelete.some((c) => c.scope === 'item') && afterDelete.some((c) => c.level === 2) && !afterDelete.some((c) => c.scope === 'subitem' && c.level === 1));
  const subOnly = await B('addColumn', [boardId, 'subitem', 'Qty', 'number', {}, 1]);
  const subCopies = subOnly.data.copies ? JSON.parse(subOnly.data.copies) : [];
  const { data: qtyCols } = await db.from('crm_board_columns').select('scope, level').eq('board_id', boardId).eq('name', 'Qty');
  check('a column added in a sub-item table never reaches the table above', qtyCols.every((c) => c.scope === 'subitem') && subCopies.length === 1 && subCopies[0].level === 2, qtyCols.map((c) => `${c.scope}/${c.level}`).join(', '));

  console.log('\nDuplicating');
  const dupItem = await B('duplicateItem', [top.id]);
  const dupRows = dupItem.data?.items ? JSON.parse(dupItem.data.items) : [];
  const dupTop = dupRows[0];
  const dupKids = dupRows.filter((r) => r.parent_id === dupTop?.id);
  const dupGrand = dupRows.filter((r) => dupKids.some((k) => k.id === r.parent_id));
  check('a row is duplicated with its whole sub-item tree', dupRows.length === 4 && dupKids.length === 2 && dupGrand.length === 1, `${dupRows.length} rows`);
  const { data: dbDup } = await db.from('crm_board_items').select('id, parent_id').in('id', dupRows.map((r) => r.id));
  check('…and every copy is saved under its new parent', dbDup.length === 4 && dbDup.filter((r) => r.parent_id === dupTop.id).length === 2);

  const dupBoard = await call('crm/boards/actions.ts', 'duplicateBoard', [form({ id: boardId, with_items: 'on' })], '/base/crm/boards');
  const copyId = dupBoard.redirect.match(/board\/([0-9a-f-]{36})/)?.[1];
  if (copyId) boards.push(copyId);
  const [{ data: srcItems }, { data: cpItems }, { data: cpCols }, { data: srcCols }] = await Promise.all([
    db.from('crm_board_items').select('id, parent_id, name, values').eq('board_id', boardId),
    db.from('crm_board_items').select('id, parent_id, name, values').eq('board_id', copyId ?? '00000000-0000-0000-0000-000000000000'),
    db.from('crm_board_columns').select('id, name, scope, level').eq('board_id', copyId ?? '00000000-0000-0000-0000-000000000000'),
    db.from('crm_board_columns').select('scope, level').eq('board_id', boardId),
  ]);
  check('a board is duplicated with all its rows', Boolean(copyId) && cpItems.length === srcItems.length, `${cpItems?.length ?? 0} of ${srcItems?.length ?? 0}`);
  const depth = (rows, r) => {
    let d = 0;
    for (let p = r.parent_id; p && d < 10; p = rows.find((x) => x.id === p)?.parent_id) d++;
    return d;
  };
  const deepSrc = srcItems.filter((r) => depth(srcItems, r) === 2).length;
  const deepCopy = cpItems.filter((r) => depth(cpItems, r) === 2).length;
  check('…nested sub-items keep their parents (no row comes out at the wrong level)', deepSrc === deepCopy && deepSrc > 0, `${deepCopy} level-2 rows`);
  const cpAmount = cpCols.find((c) => c.name === 'Amount' && c.scope === 'item');
  const cpTop = cpItems.find((r) => r.name === 'Sofa order' && !r.parent_id);
  check('…and its cell values point at the copied columns', Number(cpTop?.values?.[cpAmount?.id]) === 12500, String(cpTop?.values?.[cpAmount?.id]));
  const perLevel = (cols) => cols.filter((c) => c.scope === 'subitem').map((c) => c.level).sort().join();
  check('…with every sub-item level’s own columns', perLevel(cpCols) === perLevel(srcCols) && cpCols.some((c) => c.level === 2), `${cpCols.filter((c) => c.scope === 'subitem').length} sub-item columns`);
  check('board page opens', (await get(`/base/crm/workspace/${ws.id}/board/${boardId}`)).status === 200);

  console.log('\nVendors');
  const V = (name, args) => call('crm/vendors/actions.ts', name, args, '/base/crm/vendors');
  const number = `V-${Date.now() % 100000}`;
  const added = await V('createVendor', [null, form({ name: `${TAG} Lighting`, vendor_number: number, email: 'Orders@Example.com', cc: 'a@example.com; B@example.com  a@example.com', bcc: '', address: '1 Main St, Naples, FL', contact_email: '' })]);
  const { data: vendor } = await db.from('crm_vendors').select('*').eq('vendor_number', number).maybeSingle();
  if (vendor) vendorIds.push(vendor.id);
  check('add a vendor', added.ok && Boolean(vendor), added.ok ? '' : added.text.slice(0, 160));
  check('emails are tidied (lower case, CC list de-duplicated)', vendor?.email === 'orders@example.com' && vendor?.cc === 'a@example.com, b@example.com' && vendor?.bcc === null, `${vendor?.email} · ${vendor?.cc}`);
  const dupe = await V('createVendor', [null, form({ name: 'Other', vendor_number: number.toLowerCase(), email: 'x@example.com', address: 'x' })]);
  check('the same vendor number is refused', !dupe.ok && /already used/.test(dupe.text));
  const badCc = await V('createVendor', [null, form({ name: 'Other', vendor_number: `${number}-2`, email: 'x@example.com', cc: 'not-an-email', address: 'x' })]);
  check('a bad CC address is refused', !badCc.ok && /CC/.test(badCc.text));
  const edited = await V('updateVendor', [null, form({ id: vendor?.id, name: `${TAG} Lighting Co`, vendor_number: number, email: 'orders@example.com', cc: '', bcc: 'boss@example.com', address: '2 Main St', contact_email: 'Jane@Example.com' })]);
  const { data: vendor2 } = await db.from('crm_vendors').select('*').eq('id', vendor?.id).maybeSingle();
  check('edit a vendor', edited.ok && vendor2?.name === `${TAG} Lighting Co` && vendor2?.bcc === 'boss@example.com' && vendor2?.cc === null && vendor2?.contact_email === 'jane@example.com');
  const page = await get(`/base/crm/vendors?q=${encodeURIComponent(TAG)}`);
  check('Vendors page lists it', page.status === 200 && (await page.text()).includes(`${TAG} Lighting Co`));
  await call('crm/vendors/actions.ts', 'deleteVendor', [form({ id: vendor?.id })], '/base/crm/vendors');
  check('delete a vendor', !(await db.from('crm_vendors').select('id').eq('id', vendor?.id).maybeSingle()).data);

  console.log('\nDeliveries customers');
  const C = await call('deliveries/customers/actions.ts', 'createCustomer', [null, form({ name: `${TAG} Customer`, email: '', phone: '239-555-0100', address1: '5510 Shirley Street' })], '/base/deliveries/customers');
  if (C.data?.id) contactIds.push(C.data.id);
  const { data: contact } = await db.from('crm_contacts').select('first_name, last_name, lifecycle, source, phone').eq('id', C.data?.id ?? '00000000-0000-0000-0000-000000000000').maybeSingle();
  check('quick-add a customer (name, phone, address)', C.ok && contact?.lifecycle === 'customer' && contact?.source === 'Delivery', `${contact?.first_name} ${contact?.last_name}`);
  check('…returned to the order form so it can be selected', C.data?.name === `${TAG} Customer` && C.data?.address1 === '5510 Shirley Street');
  const custPage = await get(`/base/deliveries/customers?q=${encodeURIComponent(TAG)}`);
  check('Deliveries ▸ Customers lists them', custPage.status === 200 && (await custPage.text()).includes(`${TAG} Customer`));
} catch (err) {
  failures++;
  console.error('  ✗ crashed:', err.stack ?? err.message);
} finally {
  console.log('\nCleaning up');
  for (const b of boards) await db.from('crm_boards').delete().eq('id', b);
  if (vendorIds.length) await db.from('crm_vendors').delete().in('id', vendorIds);
  if (contactIds.length) {
    await db.from('crm_activities').delete().in('contact_id', contactIds);
    await db.from('crm_contacts').delete().in('id', contactIds);
  }
  await db.from('audit_log').delete().ilike('summary', `%${TAG}%`);
}
console.log(failures ? `\n${failures} check(s) failed.\n` : '\nAll checks passed.\n');
process.exitCode = failures ? 1 : 0;
