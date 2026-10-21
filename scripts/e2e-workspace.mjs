#!/usr/bin/env node
/**
 * End-to-end test of Workflow ▸ Workspace and Team Tasks against a running production server:
 *   new workspace → folder → "Designer deposits" board in it → customer group → deposit month
 *   with People / Dropdown / Status / Timeline cells → a real file upload to storage (and
 *   download link) → rename / move / favourite → workspace pages → Team Tasks: assign to an
 *   employee, their permissions, checklist progress, comments, files.
 * Everything it creates is deleted at the end.
 *
 *   node scripts/e2e-workspace.mjs [--base http://localhost:3000]
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
  for (const [k, v] of Object.entries(fields)) for (const one of [v].flat()) if (one !== undefined && one !== null) fd.append(k, String(one));
  return fd;
};
async function call(file, name, args, cookie, page = '/base/crm/workspace') {
  const body = await encodeReply(args);
  const res = await fetch(`${BASE}${page}`, { method: 'POST', redirect: 'manual', headers: { 'Next-Action': id(file, name), Accept: 'text/x-component', Origin: BASE, Cookie: cookie, ...(typeof body === 'string' ? { 'Content-Type': 'text/plain;charset=UTF-8' } : {}) }, body });
  const text = await res.text();
  return { ok: /"ok":true/.test(text), text, redirect: res.headers.get('x-action-redirect') ?? '', field: (k) => text.match(new RegExp(`"${k}":"([^"]*)"`))?.[1] ?? null };
}
const WSA = 'crm/workspace/actions.ts';
const BA = 'crm/boards/actions.ts';
const FA = 'crm/files/actions.ts';
const TA = 'crm/tasks/actions.ts';
const get = (path, cookie) => fetch(`${BASE}${path}`, { headers: { Cookie: cookie }, redirect: 'manual' });
// Pages stream behind a loading screen, so a redirect is either a 307 or sent inside the page (200).
const redirectOf = async (path, cookie) => {
  const r = await get(path, cookie);
  if (r.status === 307 || r.status === 303) return r.headers.get('location') ?? '';
  return r.status === 200 ? ((await r.text()).match(/NEXT_REDIRECT;replace;([^;"]+)/)?.[1] ?? null) : null;
};
const TAG = `e2e-ws-${Date.now()}`;
const made = { ws: null, emp: null, tasks: [] };

try {
  console.log(`\nWorkspace & Team Tasks end-to-end test → ${BASE}\n`);
  console.log('Workspace');
  const ws = await call(WSA, 'createWorkspace', [null, form({ name: TAG, description: 'E2E', color: '#E2445C', visibility: 'everyone' })], admin);
  made.ws = ws.redirect.match(/workspace\/([0-9a-f-]{36})/)?.[1] ?? null;
  check('create a workspace', Boolean(made.ws), ws.redirect);
  const folder = await call(WSA, 'createFolder', [made.ws, 'Designers', null], admin);
  const folderId = folder.field('id');
  check('add a folder', Boolean(folderId));
  const board = await call(BA, 'createBoard', [null, form({ name: 'Victoria Bird', template: 'deposits', workspace_id: made.ws, folder_id: folderId, visibility: 'everyone' })], admin);
  const boardId = board.redirect.match(/board\/([0-9a-f-]{36})/)?.[1];
  const { data: b } = await db.from('crm_boards').select('folder_id, item_label, group_label').eq('id', boardId).single();
  check('“Designer deposits” board created inside the folder', b?.folder_id === folderId && b.item_label === 'deposit month' && b.group_label === 'Customer');
  const { data: cols } = await db.from('crm_board_columns').select('*').eq('board_id', boardId).eq('scope', 'item').order('position');
  check('columns match monday: Deposit Date … Deposit Status', cols.map((c) => c.name).join('|') === 'Deposit Date|Assigned|Deposit Amount|Payment Method|Proof Files|Notes|Deposit Status', cols.map((c) => c.name).join(', '));
  const col = (n) => cols.find((c) => c.name === n);

  console.log('\nBoard cells & files');
  const grp = await call(BA, 'addGroup', [boardId, 'Rubenfeld, Anne & Martin', null], admin);
  const item = await call(BA, 'addItem', [boardId, grp.field('id'), 'August', null], admin);
  await item; const itemId = (await db.from('crm_board_items').select('id').eq('board_id', boardId).eq('name', 'August').single()).data?.id;
  check('add a customer group and a deposit month', Boolean(itemId));
  const { data: emp } = await db.from('employees').insert({ first_name: 'E2E', last_name: 'Worker', login_id: `${TAG}.w`.slice(0, 60), status: 'active', access_level: 'employee', password_hash: 'scrypt:dummy' }).select('id, session_version').single();
  made.emp = emp.id;
  const pm = col('Payment Method').settings.labels.find((l) => l.label === 'CC');
  const st = col('Deposit Status').settings.labels.find((l) => l.label === 'Received');
  const r1 = await call(BA, 'setCell', [itemId, col('Assigned').id, [emp.id]], admin);
  const r2 = await call(BA, 'setCell', [itemId, col('Payment Method').id, pm.id], admin);
  const r3 = await call(BA, 'setCell', [itemId, col('Deposit Status').id, st.id], admin);
  const r4 = await call(BA, 'setCell', [itemId, col('Deposit Amount').id, '2,280.6'], admin);
  const r5 = await call(BA, 'setCell', [itemId, col('Deposit Date').id, '2026-08-07'], admin);
  const { data: vals } = await db.from('crm_board_items').select('values').eq('id', itemId).single();
  check('People, Dropdown, Status, money and date cells save', r1.ok && r2.ok && r3.ok && r4.ok && r5.ok && vals.values[col('Deposit Amount').id] === 2280.6 && vals.values[col('Assigned').id][0] === emp.id);
  check('a bad dropdown value is refused', !(await call(BA, 'setCell', [itemId, col('Payment Method').id, 'nope'], admin)).ok);
  const tl = await call(BA, 'addColumn', [boardId, 'item', 'Timeline', 'timeline', {}], admin);
  const tlId = (await db.from('crm_board_columns').select('id').eq('board_id', boardId).eq('name', 'Timeline').single()).data?.id;
  check('add a Timeline column and set a range', tl.ok && (await call(BA, 'setCell', [itemId, tlId, { from: '2026-10-09', to: '2026-03-12' }], admin)).ok);
  const { data: tv } = await db.from('crm_board_items').select('values').eq('id', itemId).single();
  check('…the range is put in order', tv.values[tlId]?.from === '2026-03-12' && tv.values[tlId]?.to === '2026-10-09');

  const target = { item_id: itemId, column_id: col('Proof Files').id };
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  const meta = { name: 'deposit-receipt.pdf', size: pdf.length, type: 'application/pdf' };
  const start = await call(FA, 'startUpload', [target, meta], admin);
  const url = start.field('url')?.replace(/\\u0026/g, '&');
  const path = start.field('path');
  check('start an upload (signed link)', start.ok && Boolean(url));
  const put = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/pdf', 'x-upsert': 'false' }, body: pdf });
  check('the file goes straight to storage', put.ok, `HTTP ${put.status}`);
  const fin = await call(FA, 'finishUpload', [target, path, meta], admin);
  const fileId = (await db.from('portal_files').select('id').eq('item_id', itemId).maybeSingle()).data?.id;
  check('the upload is recorded in the database', fin.ok && Boolean(fileId));
  const dl = await get(`/base/crm/files/${fileId}?download=1`, admin);
  check('download link → private signed URL', dl.status === 302 && (dl.headers.get('location') ?? '').includes('/storage/v1/object/sign/'));
  check('viewer without Workflow can’t open the file', (await get(`/base/crm/files/${fileId}`, `__Host-bdb_session=${await sign(emp.id, 'employee', emp.session_version)}`)).status === 404);
  check('delete the file (and from storage)', (await call(FA, 'deleteFile', [fileId], admin)).ok);

  check('rename the board', (await call(WSA, 'renameBoard', [boardId, 'Victoria Bird ✓'], admin)).ok);
  check('move it to the top of the workspace', (await call(WSA, 'moveBoard', [boardId, { folder_id: null }], admin)).ok && (await db.from('crm_boards').select('folder_id').eq('id', boardId).single()).data.folder_id === null);
  check('add it to favourites', (await call(WSA, 'toggleFavorite', [boardId], admin)).field('favorite') === 'yes');
  for (const [label, path2] of [['workspace home', `/base/crm/workspace/${made.ws}`], ['content tab', `/base/crm/workspace/${made.ws}?tab=content`], ['members tab', `/base/crm/workspace/${made.ws}?tab=members`], ['board page', `/base/crm/workspace/${made.ws}/board/${boardId}`], ['old board link redirects', `/base/crm/boards/${boardId}`]]) {
    if (label.includes('redirect')) {
      const to = await redirectOf(path2, admin);
      check(`${label} to the board's new address`, Boolean(to?.includes(`/board/${boardId}`)), to ?? 'no redirect');
      continue;
    }
    const r = await get(path2, admin);
    check(`${label} opens`, r.status === 200, `HTTP ${r.status}`);
  }
  const xl = await get(`/base/crm/boards/${boardId}/export?format=xlsx`, admin);
  check('Excel export of the deposits board', xl.status === 200);

  console.log('\nTeam Tasks');
  const worker = `__Host-bdb_session=${await sign(emp.id, 'employee', emp.session_version)}`;
  const t = await call(TA, 'createTask', [null, form({ title: `${TAG} confirm deposit`, priority: 'high', status: 'todo', due_date: '2026-10-20', assignee_ids: emp.id, checklist: 'Call customer\nSend receipt' })], admin, '/base/crm/tasks');
  const taskId = t.field('id');
  made.tasks.push(taskId);
  check('admin assigns a task with a checklist', t.ok && Boolean(taskId));
  const page = await (await get('/base/crm/tasks', worker)).text();
  check('the employee (no Workflow access) sees it in Team Tasks', page.includes(`${TAG} confirm deposit`));
  check('…and can move it to Working on it', (await call(TA, 'updateTask', [taskId, { status: 'in_progress' }], worker, '/base/crm/tasks')).ok);
  check('…but can’t reassign it', !(await call(TA, 'updateTask', [taskId, { assignee_ids: [] }], worker, '/base/crm/tasks')).ok);
  const { data: steps } = await db.from('task_checklist').select('id').eq('task_id', taskId).order('position');
  await call(TA, 'checklistToggle', [steps[0].id, true], worker, '/base/crm/tasks');
  check('ticking 1 of 2 steps sets progress to 50%', (await db.from('tasks').select('progress').eq('id', taskId).single()).data.progress === 50);
  check('the employee can comment', (await call(TA, 'addTaskComment', [taskId, 'Called — paying Friday'], worker, '/base/crm/tasks')).ok);
  const own = await call(TA, 'createTask', [null, form({ title: `${TAG} own task`, assignee_ids: '00000000-0000-4000-8000-000000000000' })], worker, '/base/crm/tasks');
  made.tasks.push(own.field('id'));
  const { data: ownRow } = await db.from('tasks').select('assignee_ids').eq('id', own.field('id')).single();
  check('employees can only give tasks to themselves', own.ok && ownRow.assignee_ids.length === 1 && ownRow.assignee_ids[0] === emp.id);
  check('employees can’t delete tasks given by someone else', !(await call(TA, 'deleteTask', [taskId], worker, '/base/crm/tasks')).ok);
  check('marking done sets 100%', (await call(TA, 'updateTask', [taskId, { status: 'done' }], admin, '/base/crm/tasks')).ok && (await db.from('tasks').select('progress, completed_at').eq('id', taskId).single()).data.progress === 100);
  check('employees can’t open the Workspace', (await redirectOf(`/base/crm/workspace/${made.ws}`, worker)) !== null);
} catch (err) {
  failures++;
  console.error('\n✗ Test crashed:', err);
} finally {
  console.log('\nCleaning up');
  for (const t of made.tasks) if (t) await db.from('tasks').delete().eq('id', t);
  if (made.ws) {
    const { data: files } = await db.from('portal_files').select('path').in('board_id', (await db.from('crm_boards').select('id').eq('workspace_id', made.ws)).data?.map((x) => x.id) ?? []);
    if (files?.length) await db.storage.from('portal-files').remove(files.map((f) => f.path));
    await db.from('crm_workspaces').delete().eq('id', made.ws);
  }
  if (made.emp) await db.from('employees').delete().eq('id', made.emp);
  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
  process.exitCode = failures ? 1 : 0;
}
