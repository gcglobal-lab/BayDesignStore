#!/usr/bin/env node
/**
 * End-to-end test of the Homebase-style schedule against a running production server:
 *   "Apply to" several days, the manager/admin edit rule (managers add shifts; once published
 *   only an admin changes them), the time-card lock, time off from the schedule (with typed
 *   hours) and an admin turning a shift into time off, punch in/out on the grid for admins only
 *   (and "No punch-in"), plus the manager limits: no adding or terminating people, no time cards,
 *   but their own time clock. Creates a temporary manager and employee and removes everything after.
 *
 *   node scripts/e2e-schedule.mjs [--base http://localhost:3000]
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
const cookie = (t) => `__Host-bdb_session=${t}`;
let failures = 0;
const check = (label, pass, detail = '') => {
  if (!pass) failures++;
  console.log(`  ${pass ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};
const form = (fields) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    for (const x of Array.isArray(v) ? v : [v]) fd.append(k, String(x));
  }
  return fd;
};
/** The `{ ok, message }` row of a React Flight response. */
function actionResult(text) {
  for (const line of text.split('\n')) {
    const json = line.slice(line.indexOf(':') + 1);
    if (!json.includes('"ok":')) continue;
    try {
      return JSON.parse(json);
    } catch {
      // not the result row
    }
  }
  return null;
}
async function call(as, file, name, args, page = '/base/schedule') {
  const body = await encodeReply(args);
  const res = await fetch(`${BASE}${page}`, { method: 'POST', redirect: 'manual', headers: { 'Next-Action': id(file, name), Accept: 'text/x-component', Origin: BASE, Cookie: as, ...(typeof body === 'string' ? { 'Content-Type': 'text/plain;charset=UTF-8' } : {}) }, body });
  const text = await res.text();
  const result = actionResult(text);
  return { ok: result?.ok === true, message: result?.message ?? '', redirect: res.headers.get('x-action-redirect') ?? '' };
}
const S = (as, name, fields) => call(as, 'schedule/actions.ts', name, name === 'deleteShift' ? [form(fields)] : [null, form(fields)]);
/** The page's props as they reach the browser (the Flight data inlined in the HTML, unescaped). */
const flight = async (as, path) => (await fetch(`${BASE}${path}`, { headers: { Cookie: as }, redirect: 'manual' })).text().then((t) => t.replace(/\\"/g, '"'));
const html = async (as, path) => {
  const r = await fetch(`${BASE}${path}`, { headers: { Cookie: as }, redirect: 'manual' });
  return { status: r.status, body: await r.text() };
};

const { data: settings } = await db.from('company_settings').select('timezone').eq('id', 1).single();
const zone = settings.timezone;
const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const plusDays = (s, n) => new Date(Date.parse(`${s}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const today = ymd(new Date());
const later = plusDays(today, 28); // a quiet week four weeks out
const TAG = `e2e${Date.now()}`;
const people = [];
const { data: role } = await db.from('job_roles').select('id, name').ilike('name', 'Downtown').maybeSingle();

try {
  for (const lvl of ['manager', 'employee']) {
    const { data, error } = await db
      .from('employees')
      .insert({ first_name: 'Sched', last_name: `${lvl} ${TAG}`, login_id: `${TAG}.${lvl}`, access_level: lvl, status: 'active', password_hash: 'scrypt:16384:8:1:c21va2U:c21va2U', must_change_password: false })
      .select('id, session_version')
      .single();
    if (error) throw new Error(error.message);
    people.push(data);
  }
  const [mgr, emp] = people;
  const admin = cookie(await sign('env-admin', 'admin', 1));
  const manager = cookie(await sign(mgr.id, 'manager', mgr.session_version));
  const employee = cookie(await sign(emp.id, 'employee', emp.session_version));
  const shiftsOf = async () => (await db.from('shifts').select('id, starts_at, published_at, notes').eq('employee_id', emp.id).order('starts_at')).data ?? [];

  console.log(`\nSchedule end-to-end test → ${BASE}\n\nAdd shift ▸ Apply to`);
  const days = [later, plusDays(later, 1), plusDays(later, 2)];
  let r = await S(manager, 'saveShift', { employee_id: emp.id, date: days, start: '09:00', end: '17:00', role_id: role?.id, location_id: null, break_minutes: 30, notes: 'Bring the samples' });
  let mine = await shiftsOf();
  check('manager adds one shift on each of three picked days', r.ok && mine.length === 3, r.message);
  check('they start as drafts with the note', mine.every((s) => !s.published_at && s.notes === 'Bring the samples'));
  r = await S(manager, 'saveShift', { employee_id: emp.id, date: [later], start: '10:00', end: '12:00', location_id: null, break_minutes: 0 });
  check('overlapping shift on the same day is refused', !r.ok && /overlaps/.test(r.message), r.message);

  console.log('\nWho can change a shift');
  r = await S(manager, 'saveShift', { id: mine[0].id, employee_id: emp.id, date: [later], start: '08:00', end: '16:00', location_id: null, break_minutes: 0 });
  check('manager can still change a draft', r.ok, r.message);
  r = await S(manager, 'saveShift', { id: mine[0].id, employee_id: emp.id, date: [later, plusDays(later, 4)], start: '08:00', end: '16:00', location_id: null, break_minutes: 0 });
  check('an edit can only be on one day', !r.ok, r.message);
  await db.from('shifts').update({ published_at: new Date().toISOString() }).eq('employee_id', emp.id);
  r = await S(manager, 'saveShift', { id: mine[0].id, employee_id: emp.id, date: [later], start: '09:00', end: '17:00', location_id: null, break_minutes: 0 });
  check('manager can’t change a published shift', !r.ok && /Only an admin/.test(r.message), r.message);
  r = await S(manager, 'deleteShift', { id: mine[0].id });
  check('manager can’t delete a published shift', !r.ok && /Only an admin/.test(r.message), r.message);
  r = await S(admin, 'saveShift', { id: mine[0].id, employee_id: emp.id, date: [plusDays(later, 3)], start: '09:00', end: '17:00', location_id: null, break_minutes: 0, publish: 'on' });
  mine = await shiftsOf();
  check('admin can change (and move) a published shift', r.ok && mine.some((s) => s.starts_at.startsWith(plusDays(later, 3)) || ymd(new Date(s.starts_at)) === plusDays(later, 3)), r.message);
  r = await S(admin, 'deleteShift', { id: mine[0].id });
  check('admin can delete a published shift', r.ok && (await shiftsOf()).length === 2, r.message);

  console.log('\nTime off from the schedule');
  const T = (as, fields) => call(as, 'time-off/actions.ts', 'addTimeOff', [null, form(fields)]);
  r = await T(manager, { employee_id: emp.id, type: 'unpaid', reason: 'personal', starts_on: plusDays(later, 5), ends_on: plusDays(later, 6), all_day: 'on', hours: '12' });
  const { data: off } = await db.from('time_off_requests').select('status, hours').eq('employee_id', emp.id).eq('starts_on', plusDays(later, 5)).maybeSingle();
  check('manager adds approved time off with typed total hours', r.ok && off?.status === 'approved' && Number(off.hours) === 12, `${r.message} ${JSON.stringify(off)}`);
  mine = await shiftsOf();
  const target = mine[0];
  const targetDay = ymd(new Date(target.starts_at));
  r = await T(manager, { employee_id: emp.id, shift_id: target.id, type: 'unpaid', reason: 'other', starts_on: targetDay, ends_on: targetDay, all_day: 'on' });
  check('manager can’t turn a shift into time off', !r.ok && /Only an admin/.test(r.message), r.message);
  r = await T(admin, { employee_id: emp.id, shift_id: target.id, type: 'unpaid', reason: 'other', starts_on: targetDay, ends_on: targetDay, all_day: 'on' });
  const gone = !(await shiftsOf()).some((s) => s.id === target.id);
  const { count: offCount } = await db.from('time_off_requests').select('id', { count: 'exact', head: true }).eq('employee_id', emp.id).eq('starts_on', targetDay);
  check('admin “Make it time off” removes the shift and adds the time off', r.ok && gone && offCount === 1, r.message);

  console.log('\nPunch in / out on the grid');
  const now = Date.now();
  const { data: todayShift } = await db
    .from('shifts')
    .insert({ employee_id: emp.id, role_id: role?.id ?? null, starts_at: new Date(now - 3 * 3_600_000).toISOString(), ends_at: new Date(now + 5 * 3_600_000).toISOString(), break_minutes: 0, published_at: new Date().toISOString() })
    .select('id')
    .single();
  const week = `/base/schedule?week=${ymd(new Date(now - 3 * 3_600_000))}`;
  const near = (payload, key) => {
    const at = payload.indexOf(`"id":"${todayShift.id}"`);
    if (at < 0) return null;
    const chunk = payload.slice(Math.max(0, at - 600), at + 900);
    return chunk.match(new RegExp(`"${key}":(true|false)`))?.[1] ?? null;
  };
  let adminView = await flight(admin, week);
  check('admin sees “No punch-in” for a started shift nobody punched in for', near(adminView, 'noShow') === 'true');
  const { data: entry } = await db.from('time_entries').insert({ employee_id: emp.id, shift_id: todayShift.id, clock_in_at: new Date(now - 2.5 * 3_600_000).toISOString(), source: 'manual' }).select('id').single();
  // Written straight to the database, so let the server's 3-second read cache run out.
  await new Promise((done) => setTimeout(done, 3500));
  adminView = await flight(admin, week);
  check('admin sees the punch in under the shift', adminView.includes(`"shiftId":"${todayShift.id}"`) && adminView.includes('"clockIn"'));
  check('…and the late minutes', /"lateMinutes":\d+/.test(adminView));
  check('the shift is locked once it has a time card', near(adminView, 'locked') === 'true');
  const managerView = await flight(manager, week);
  check('manager gets no punch data', managerView.includes(todayShift.id) && !managerView.includes('"clockIn"') && near(managerView, 'noShow') === 'false');
  const employeeView = await flight(employee, week);
  check('employee gets no punch data', employeeView.includes(todayShift.id) && !employeeView.includes('"clockIn"'));
  r = await S(admin, 'saveShift', { id: todayShift.id, employee_id: emp.id, date: [ymd(new Date(now - 3 * 3_600_000))], start: '09:00', end: '17:00', location_id: null, break_minutes: 0 });
  check('even an admin can’t edit a shift with a time card', !r.ok && /time cards/.test(r.message), r.message);
  r = await S(admin, 'deleteShift', { id: todayShift.id });
  check('…or delete it', !r.ok, r.message);
  await db.from('time_entries').delete().eq('id', entry.id);

  console.log('\nManager limits');
  r = await call(manager, 'team/actions.ts', 'createEmployee', [null, form({ first_name: 'No', last_name: 'Way', login_id: `${TAG}.nope`, access_level: 'employee' })], '/base/team');
  const { count: sneaked } = await db.from('employees').select('id', { count: 'exact', head: true }).eq('login_id', `${TAG}.nope`);
  check('manager can’t add a team member', !r.ok && !sneaked, r.redirect || r.message);
  r = await call(manager, 'team/actions.ts', 'setEmployeeStatus', [form({ id: emp.id, status: 'terminated' })], '/base/team');
  const { data: still } = await db.from('employees').select('status').eq('id', emp.id).single();
  check('manager can’t terminate anyone', still.status === 'active');
  r = await call(manager, 'timesheets/actions.ts', 'saveTimeCard', [null, form({ employee_id: emp.id, date: today, clock_in: '09:00', clock_out: '10:00' })], '/base/timesheets');
  const { count: cards } = await db.from('time_entries').select('id', { count: 'exact', head: true }).eq('employee_id', emp.id);
  check('manager can’t add time cards', !r.ok && !cards, r.redirect || r.message);
  const newPage = await html(manager, '/base/team/new');
  check('manager is sent away from Add team member', newPage.body.includes('NEXT_REDIRECT') || newPage.status === 307, String(newPage.status));
  const roster = await html(manager, '/base/team');
  check('roster has no Add team member button for managers', roster.status === 200 && !roster.body.includes('href="/base/team/new"'));
  const myWeek = await html(manager, '/base/my-week');
  check('manager has their own time clock (My Week)', myWeek.status === 200 && !myWeek.body.includes('NEXT_REDIRECT'), String(myWeek.status));
  const sched = await html(manager, '/base/schedule');
  check('My Week is in the manager’s menu', sched.body.includes('href="/base/my-week"'));
  const timesheets = await html(admin, '/base/timesheets');
  check('admin still has Add time card', timesheets.body.includes('Add time card'));
  const mgrTimesheets = await html(manager, '/base/timesheets');
  check('manager has no Add time card', mgrTimesheets.status === 200 && !mgrTimesheets.body.includes('Add time card'));
} finally {
  for (const p of people) {
    await db.from('time_entries').delete().eq('employee_id', p.id);
    await db.from('time_off_requests').delete().eq('employee_id', p.id);
    await db.from('shifts').delete().eq('employee_id', p.id);
    await db.from('employees').delete().eq('id', p.id);
  }
  await db.from('employees').delete().eq('login_id', `${TAG}.nope`);
}

console.log(failures ? `\n${failures} check(s) failed.\n` : '\nAll schedule checks passed.\n');
process.exit(failures ? 1 : 0);
