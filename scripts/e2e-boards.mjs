#!/usr/bin/env node
/**
 * End-to-end test of Workflow ▸ Boards against a running production server:
 *   create a "Designers & clients" board → groups, columns and formulas → add a client with
 *   amounts → sub-items → Remaining / Line total formulas → status + comment → new column →
 *   members-only board and a view-only member → Excel / PDF downloads → delete.
 *
 *   node scripts/e2e-boards.mjs [--base http://localhost:3000]
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
const id = (name) => {
  const found = Object.entries(manifest.node).find(([, v]) => v.filename.replace(/\\/g, '/').endsWith('crm/boards/actions.ts') && v.exportedName === name)?.[0];
  if (!found) throw new Error(`Action ${name} not found — build first.`);
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
async function call(name, args, cookie, page = '/base/crm/boards') {
  const body = await encodeReply(args);
  const res = await fetch(`${BASE}${page}`, { method: 'POST', redirect: 'manual', headers: { 'Next-Action': id(name), Accept: 'text/x-component', Origin: BASE, Cookie: cookie, ...(typeof body === 'string' ? { 'Content-Type': 'text/plain;charset=UTF-8' } : {}) }, body });
  const text = await res.text();
  const data = text.match(/"data":(\{.*?\})\}/)?.[1];
  return { ok: /"ok":true/.test(text), text, redirect: res.headers.get('x-action-redirect') ?? '', data: data ? JSON.parse(data) : null };
}
const get = (path, cookie) => fetch(`${BASE}${path}`, { headers: { Cookie: cookie }, redirect: 'manual' });
const TAG = `e2e-board-${Date.now()}`;
let boardId = null;
let boardId2 = null;
let empId = null;

try {
  console.log(`\nBoards end-to-end test → ${BASE}\n`);
  const { data: ws } = await db.from('crm_workspaces').select('id').eq('archived', false).order('position').limit(1).single();
  const WS = ws.id;
  const created = await call('createBoard', [null, form({ name: TAG, template: 'designers', workspace_id: WS, visibility: 'everyone' })], admin);
  boardId = created.redirect.match(/board\/([0-9a-f-]{36})/)?.[1] ?? null;
  check('create a board from the Designers & clients template', !!boardId, created.redirect);
  const [{ data: cols }, { data: groups }] = await Promise.all([db.from('crm_board_columns').select('*').eq('board_id', boardId), db.from('crm_board_groups').select('*').eq('board_id', boardId)]);
  const col = (name, scope = 'item') => cols.find((c) => c.name === name && c.scope === scope);
  check('it has the columns and sub-item columns', !!col('Order amount') && !!col('Remaining') && !!col('Qty', 'subitem') && !!col('Line total', 'subitem'));
  check('“Remaining” is Order amount − Paid', col('Remaining').settings.op === 'subtract' && col('Remaining').settings.a === col('Order amount').id && col('Remaining').settings.b === col('Paid').id);
  check('there is at least one designer group', groups.length >= 1, groups.map((g) => g.name).join(', '));
  check('board page opens', (await get(`/base/crm/workspace/${WS}/board/${boardId}`, admin)).status === 200);

  const g = groups[0];
  const item = await call('addItem', [boardId, g.id, 'Smith residence — SO-1042', null], admin);
  const itemId = item.data?.item ? JSON.parse(item.data.item).id : null;
  check('add a client / sales order row', !!itemId);
  for (const [name, v] of [['Sales order #', 'SO-1042'], ['Order amount', '12,500'], ['Paid', 5000], ['Order date', '2026-10-01']]) await call('setCell', [itemId, col(name).id, v], admin);
  const statusCol = col('Status');
  await call('setCell', [itemId, statusCol.id, statusCol.settings.labels[2].id], admin);
  const { data: saved } = await db.from('crm_board_items').select('values').eq('id', itemId).single();
  check('cells save (amount parsed from “12,500”)', saved.values[col('Order amount').id] === 12500 && saved.values[col('Paid').id] === 5000 && saved.values[col('Sales order #').id] === 'SO-1042');
  check('bad values are refused', !(await call('setCell', [itemId, col('Order amount').id, 'lots'], admin)).ok && !(await call('setCell', [itemId, col('Remaining').id, 5], admin)).ok);

  const sub = await call('addItem', [boardId, g.id, 'Linen sofa', itemId], admin);
  const subId = sub.data?.item ? JSON.parse(sub.data.item).id : null;
  await call('setCell', [subId, col('Qty', 'subitem').id, 2], admin);
  await call('setCell', [subId, col('Price', 'subitem').id, 4200], admin);
  const { data: subRow } = await db.from('crm_board_items').select('parent_id, values').eq('id', subId).single();
  check('add a sub-item with qty and price', subRow.parent_id === itemId && subRow.values[col('Qty', 'subitem').id] === 2);
  check('comment on the client', (await call('addItemUpdate', [itemId, 'Deposit received by card.'], admin)).ok);
  const { count: logs } = await db.from('crm_board_updates').select('id', { count: 'exact', head: true }).eq('item_id', itemId);
  check('status change and comment are in the updates', (logs ?? 0) >= 3);

  const newCol = await call('addColumn', [boardId, 'item', 'Install date', 'date', {}], admin);
  check('add a new column', newCol.ok);
  const grp = await call('addGroup', [boardId, 'Designer E2E', null], admin);
  check('add a designer group', grp.ok && !!grp.data?.id);
  check('move the client to the new designer', (await call('updateItem', [itemId, { group_id: grp.data.id, description: 'Living room, coastal style' }], admin)).ok);
  const { data: movedSub } = await db.from('crm_board_items').select('group_id').eq('id', subId).single();
  check('its sub-items move with it', movedSub.group_id === grp.data.id);

  const xlsx = await get(`/base/crm/boards/${boardId}/export?format=xlsx`, admin);
  check('board → Excel download', xlsx.status === 200 && (xlsx.headers.get('content-type') ?? '').includes('spreadsheet') && (await xlsx.arrayBuffer()).byteLength > 2000);
  const pdf = await get(`/base/crm/boards/${boardId}/export?format=pdf&group=${grp.data.id}`, admin);
  const pdfBytes = new Uint8Array(await pdf.arrayBuffer());
  check('designer (group) → PDF download', pdf.status === 200 && String.fromCharCode(...pdfBytes.slice(0, 4)) === '%PDF');
  const itemPdf = await get(`/base/crm/boards/${boardId}/export?format=pdf&item=${itemId}`, admin);
  check('client (item) → PDF download', itemPdf.status === 200);

  console.log('\nMembers & permissions');
  const { data: emp } = await db.from('employees').insert({ first_name: 'E2E', last_name: 'Viewer', login_id: `${TAG}.v`.slice(0, 60), status: 'active', access_level: 'employee', crm_role: 'user', password_hash: 'scrypt:dummy' }).select('id, session_version').single();
  empId = emp.id;
  const user = `__Host-bdb_session=${await sign(emp.id, 'employee', emp.session_version)}`;
  check('a Workflow user can open a board open to everyone', (await get(`/base/crm/workspace/${WS}/board/${boardId}`, user)).status === 200);
  check('…and edit it', (await call('setCell', [itemId, col('Paid').id, 6000], user)).ok);
  check('…but not change its columns', !(await call('addColumn', [boardId, 'item', 'Nope', 'text', {}], user)).ok);
  await call('createBoard', [null, form({ name: `${TAG}-x`, template: 'blank', workspace_id: WS })], user);
  check('users can’t create boards', !(await db.from('crm_boards').select('id').eq('name', `${TAG}-x`)).data?.length);
  const priv = await call('createBoard', [null, form({ name: `${TAG}-private`, template: 'blank', visibility: 'members', workspace_id: WS })], admin);
  boardId2 = priv.redirect.match(/board\/([0-9a-f-]{36})/)?.[1] ?? null;
  {
    // The page streams behind a loading screen, so it's refused with a 307 or a redirect inside the page — and never shows the board.
    const r = await get(`/base/crm/workspace/${WS}/board/${boardId2}`, user);
    const html = r.status === 200 ? await r.text() : '';
    check('members-only board is hidden from non-members', (r.status === 307 || /NEXT_REDIRECT;replace;|NEXT_HTTP_ERROR_FALLBACK;404/.test(html)) && !html.includes(`${TAG}-private`), String(r.status));
  }
  await call('setBoardMember', [boardId2, emp.id, 'viewer'], admin);
  check('added as view-only → can open it', (await get(`/base/crm/workspace/${WS}/board/${boardId2}`, user)).status === 200);
  const { data: g2 } = await db.from('crm_board_groups').select('id').eq('board_id', boardId2).limit(1).single();
  check('…but can’t add rows', !(await call('addItem', [boardId2, g2.id, 'x', null], user)).ok);
  const list = await (await get(`/base/crm/workspace/${WS}`, user)).text();
  check('workspace panel shows both boards to the member', list.includes(TAG) && list.includes(`${TAG}-private`));
} catch (err) {
  failures++;
  console.error('\n✗ Test crashed:', err);
} finally {
  console.log('\nCleaning up');
  for (const b of [boardId, boardId2]) if (b) await db.from('crm_boards').delete().eq('id', b);
  if (empId) await db.from('employees').delete().eq('id', empId);
  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
  process.exitCode = failures ? 1 : 0;
}
