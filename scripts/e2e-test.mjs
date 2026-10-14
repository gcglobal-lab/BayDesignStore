#!/usr/bin/env node
/**
 * End-to-end test through the real forms (the same server actions the browser calls),
 * against a running production server (npm run build && npm start):
 *   create an employee with a password → sign in with it → punch in, meal break, punch out
 *   (at a store and off site) → request time off → manager approves → add / delete a shift →
 *   edit a time card → edit the employee → set a wage → terminate → signed out.
 * Everything is checked in the database, then the test employee is deleted.
 *
 *   node scripts/e2e-test.mjs [--base http://localhost:3000]
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
  const found = Object.entries(manifest.node).find(([, v]) => v.filename.endsWith(file) && v.exportedName === name)?.[0];
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
  for (const [k, v] of Object.entries(fields)) for (const one of [v].flat()) if (one !== undefined && one !== null) fd.append(k, String(one));
  return fd;
};
/** Calls a server action the way the browser does. `withState` = useActionState forms (prev, formData). */
async function call(actionId, args, cookie, page = '/base') {
  const body = await encodeReply(args);
  const res = await fetch(`${BASE}${page}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Next-Action': actionId, Accept: 'text/x-component', Origin: BASE, Cookie: cookie, ...(typeof body === 'string' ? { 'Content-Type': 'text/plain;charset=UTF-8' } : {}) },
    body,
  });
  const text = await res.text();
  return { status: res.status, text, ok: /"ok":true/.test(text), headers: res.headers };
}
const get = (path, cookie) => fetch(`${BASE}${path}`, { headers: { Cookie: cookie }, redirect: 'manual' });
const ymd = (offsetDays) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UPTOWN = { lat: 26.214225, lng: -81.781417, accuracy: 10, ageMs: 300 };
const OFF_SITE = { lat: 26.1347, lng: -81.8063, accuracy: 15, ageMs: 300 }; // near Naples Pier

let employeeId = null;
try {
  console.log(`\nEnd-to-end test → ${BASE}\n`);
  await db.from('employees').delete().eq('login_id', 'e2e.tester');
  const [{ data: roles }, { data: locations }] = await Promise.all([db.from('job_roles').select('id, name').order('name').limit(2), db.from('locations').select('id').limit(1)]);

  console.log('Employees & sign-in');
  const password = 'E2eTest-2026';
  const created = await call(id('team/actions.ts', 'createEmployee'), [null, form({ first_name: 'E2E', last_name: 'Tester', email: 'e2e.tester@example.com', phone: '(239) 555-0100', login_id: 'e2e.tester', access_level: 'employee', location_id: locations[0].id, role_ids: roles[0].id, primary_role_id: roles[0].id, password, wage_amount: 21.5, wage_type: 'hourly' })], admin, '/base/team/new');
  employeeId = created.text.match(/"id":"([0-9a-f-]{36})"/)?.[1] ?? null;
  check('admin creates an employee with a password', created.ok && !!employeeId);
  const { data: emp } = await db.from('employees').select('status, password_hash, password_secret, employee_roles(role_id), employee_wages!employee_wages_employee_id_fkey(amount)').eq('id', employeeId).single();
  check('saved with role, wage and an encrypted password copy', emp.status === 'active' && emp.employee_roles.length === 1 && Number(emp.employee_wages[0]?.amount) === 21.5 && emp.password_secret?.startsWith('v1:'));

  const loginId = id('login/actions.ts', 'signIn');
  const bad = await call(loginId, [null, form({ loginId: 'e2e.tester', password: 'wrong-password' })], '', '/base/login');
  check('wrong password is refused', !bad.ok && /don.t match/.test(bad.text));
  const good = await call(loginId, [null, form({ loginId: 'e2e.tester', password })], '', '/base/login');
  const sessionCookie = (good.headers.get('set-cookie') ?? '').match(/(__Host-bdb_session=[^;]+)/)?.[1];
  check('signs in with the password the admin set', !!sessionCookie, `HTTP ${good.status}`);
  const me = sessionCookie ?? '';
  const week = await get('/base/my-week', me);
  check('their Home (My Week) opens', week.status === 200);

  console.log('\nTime clock');
  const clock = (n) => id('my-week/clock-actions.ts', n);
  let t = Date.now();
  const inRes = await call(clock('clockIn'), [UPTOWN, null], me, '/base/my-week');
  check('punch in at the Uptown store', inRes.ok, `${Date.now() - t} ms`);
  check('a second punch-in is refused', /already punched in/i.test((await call(clock('clockIn'), [UPTOWN, null], me, '/base/my-week')).text));
  check('meal break starts', (await call(clock('startBreak'), ['meal'], me, '/base/my-week')).ok);
  await sleep(1200);
  check('meal break ends', (await call(clock('endBreak'), [], me, '/base/my-week')).ok);
  t = Date.now();
  check('punch out', (await call(clock('clockOut'), [UPTOWN], me, '/base/my-week')).ok, `${Date.now() - t} ms`);
  t = Date.now();
  check('punch in off site (client visit)', (await call(clock('clockIn'), [OFF_SITE, 'Smith residence'], me, '/base/my-week')).ok, `${Date.now() - t} ms`);
  check('punch out off site', (await call(clock('clockOut'), [OFF_SITE], me, '/base/my-week')).ok);
  await sleep(5000); // the street address is looked up after the punch
  const { data: cards } = await db.from('time_entries').select('id, clock_in_at, clock_out_at, clock_in_place, clock_out_place, clock_in_in_geofence, clock_in_note, breaks:time_entry_breaks(type, ended_at)').eq('employee_id', employeeId).order('clock_in_at');
  check('2 time cards, both closed', cards.length === 2 && cards.every((c) => c.clock_out_at));
  check('store punch recorded as "Uptown" with its meal break', cards[0].clock_in_place === 'Uptown' && cards[0].breaks.length === 1 && cards[0].breaks[0].type === 'meal' && !!cards[0].breaks[0].ended_at);
  check('off-site punch recorded with a street address and the client note', !!cards[1].clock_in_place && cards[1].clock_in_place !== 'Uptown' && cards[1].clock_in_in_geofence === false && cards[1].clock_in_note === 'Smith residence', cards[1].clock_in_place ?? 'no address');

  console.log('\nTime off');
  const day = ymd(10);
  check('employee requests time off', (await call(id('time-off/actions.ts', 'requestTimeOff'), [null, form({ type: 'unpaid', reason: 'personal', all_day: 'on', starts_on: day, ends_on: day, note: 'E2E test' })], me, '/base/time-off')).ok);
  const { data: req } = await db.from('time_off_requests').select('id, status').eq('employee_id', employeeId).single();
  await call(id('time-off/actions.ts', 'reviewTimeOff'), [form({ id: req.id, decision: 'approved' })], admin, '/base/time-off');
  const { data: reqAfter } = await db.from('time_off_requests').select('status').eq('id', req.id).single();
  check('manager approves it', req.status === 'pending' && reqAfter.status === 'approved');

  console.log('\nSchedule & time cards');
  const shiftDay = ymd(3);
  check('manager adds a published shift', (await call(id('schedule/actions.ts', 'saveShift'), [null, form({ employee_id: employeeId, date: shiftDay, start: '09:00', end: '17:00', role_id: roles[0].id, break_minutes: 30, location_id: locations[0].id, notes: 'E2E', publish: 'on' })], admin, '/base/schedule')).ok);
  const { data: shift } = await db.from('shifts').select('id, published_at, break_minutes').eq('employee_id', employeeId).single();
  check('shift saved and published', !!shift?.published_at && shift.break_minutes === 30);
  check('overlapping shift is refused', !(await call(id('schedule/actions.ts', 'saveShift'), [null, form({ employee_id: employeeId, date: shiftDay, start: '10:00', end: '12:00', break_minutes: 0, location_id: locations[0].id })], admin, '/base/schedule')).ok);
  await call(id('schedule/actions.ts', 'deleteShift'), [form({ id: shift.id })], admin, '/base/schedule');
  const { count: shiftsLeft } = await db.from('shifts').select('id', { count: 'exact', head: true }).eq('employee_id', employeeId);
  check('shift deleted', shiftsLeft === 0);
  const cardDay = cards[0].clock_in_at.slice(0, 10);
  const edit = await call(id('timesheets/actions.ts', 'saveTimeCard'), [null, form({ id: cards[0].id, employee_id: employeeId, date: cardDay, clock_in: '01:00', clock_out: '02:30', meal_minutes: 15, notes: 'Corrected by E2E' })], admin, '/base/timesheets');
  const { data: edited } = await db.from('time_entries').select('notes, edited_at').eq('id', cards[0].id).single();
  check('manager edits a time card', edit.ok && edited.notes === 'Corrected by E2E' && !!edited.edited_at, edit.ok ? '' : edit.text.match(/"message":"([^"]+)/)?.[1]);

  console.log('\nEdit & terminate');
  const upd = await call(id('team/actions.ts', 'updateEmployee'), [null, form({ id: employeeId, first_name: 'E2E', last_name: 'Edited', email: 'e2e.tester@example.com', phone: '(239) 555-0199', login_id: 'e2e.tester', access_level: 'employee', location_id: locations[0].id, role_ids: [roles[0].id, roles[1].id], primary_role_id: roles[1].id })], admin, `/base/team/${employeeId}`);
  const { data: afterUpd } = await db.from('employees').select('last_name, phone, employee_roles(role_id, is_primary)').eq('id', employeeId).single();
  check('admin edits name, phone and roles', upd.ok && afterUpd.last_name === 'Edited' && afterUpd.phone === '(239) 555-0199' && afterUpd.employee_roles.length === 2 && afterUpd.employee_roles.find((r) => r.is_primary)?.role_id === roles[1].id);
  check('still signed in (no password change)', (await get('/base/my-week', me)).status === 200);
  check('admin sets a new wage', (await call(id('team/actions.ts', 'setWage'), [null, form({ id: employeeId, amount: 23, wage_type: 'hourly', effective_from: ymd(0) })], admin, `/base/team/${employeeId}`)).ok);
  await call(id('team/actions.ts', 'setEmployeeStatus'), [form({ id: employeeId, status: 'terminated' })], admin, `/base/team/${employeeId}`);
  const { data: term } = await db.from('employees').select('status').eq('id', employeeId).single();
  check('admin terminates the employee', term.status === 'terminated');
  await sleep(500);
  check('terminated employee is signed out at once', (await get('/base/my-week', me)).status === 307);
  check('…and can no longer sign in', !(await call(loginId, [null, form({ loginId: 'e2e.tester', password })], '', '/base/login')).headers.get('set-cookie')?.includes('__Host-bdb_session=ey'));

  console.log('\nActivity log');
  await sleep(2000);
  const { data: log } = await db.from('audit_log').select('action, summary').eq('entity_id', employeeId);
  const { data: own } = await db.from('audit_log').select('action').eq('actor_id', employeeId);
  const actions = new Set([...(log ?? []), ...(own ?? [])].map((a) => a.action));
  check('every step is in Recent activity', ['employee.create', 'employee.update', 'employee.wage', 'employee.terminate', 'auth.sign_in', 'clock.in', 'clock.out', 'time_off.request'].every((a) => actions.has(a)), [...actions].join(', '));
  check('readable sentence for the edit', (log ?? []).some((a) => a.action === 'employee.update' && /changed .*last name/.test(a.summary ?? '')));
} catch (err) {
  failures++;
  console.error('\nTest crashed:', err.message);
} finally {
  if (employeeId) {
    await db.from('audit_log').delete().eq('entity_id', employeeId);
    await db.from('audit_log').delete().eq('actor_id', employeeId);
    await db.from('employees').delete().eq('id', employeeId);
  }
  await db.from('login_attempts').delete().eq('identifier', 'e2e.tester');
}
console.log(failures ? `\n${failures} check(s) failed\n` : '\nAll checks passed — test employee removed.\n');
process.exitCode = failures ? 1 : 0;
