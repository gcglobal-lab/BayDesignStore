#!/usr/bin/env node
/**
 * Smoke test of a running production server (npm start):
 * every Base page as admin and as an employee, report downloads, both chat assistants,
 * the admin password flow, and that a change made on one server process shows up on all
 * of them straight away. Creates one temporary test employee and removes it afterwards.
 *
 *   node scripts/smoke-test.mjs [--base http://localhost:3000]
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { SignJWT } from 'jose';

process.loadEnvFile?.('.env.local');
const i = process.argv.indexOf('--base');
const BASE = (i > -1 ? process.argv[i + 1] : 'http://localhost:3000').replace(/\/$/, '');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
const sign = (sub, lvl, sv) =>
  new SignJWT({ lvl, sv }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(sub).setIssuer('bay-design-base').setAudience('bay-design-base:session').setIssuedAt().setExpirationTime('1h').sign(secret);
const cookie = (t) => `__Host-bdb_session=${t}`;
const manifest = JSON.parse(readFileSync('.next/server/server-reference-manifest.json', 'utf8'));
const actionId = (file, name) => Object.entries(manifest.node).find(([, v]) => v.filename.endsWith(file) && v.exportedName === name)?.[0];

let failures = 0;
const check = (label, pass, detail = '') => {
  if (!pass) failures++;
  console.log(`  ${pass ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};
const get = async (path, c, extra = {}) => {
  const r = await fetch(`${BASE}${path}`, { headers: { Cookie: c, ...extra }, redirect: 'manual' });
  return { status: r.status, type: r.headers.get('content-type') ?? '', body: Buffer.from(await r.arrayBuffer()) };
};
const action = async (id, args, c, page = '/base/team') => {
  const r = await fetch(`${BASE}${page}`, { method: 'POST', headers: { 'Next-Action': id, 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/x-component', Origin: BASE, Cookie: c }, body: JSON.stringify(args) });
  return r.text();
};

const { data: created, error } = await db
  .from('employees')
  .insert({ first_name: 'Smoke', last_name: 'Tester', login_id: 'smoketest.user', access_level: 'employee', status: 'active', password_hash: 'scrypt:16384:8:1:c21va2U:c21va2U', must_change_password: false })
  .select('id, session_version')
  .single();
if (error) throw new Error(error.message);
const admin = cookie(await sign('env-admin', 'admin', 1));
let employee = cookie(await sign(created.id, 'employee', created.session_version));

try {
  console.log(`\nSmoke test → ${BASE}\n\nPages`);
  const adminPages = ['/base/manager', '/base/my-week', '/base/team', '/base/team/new', `/base/team/${created.id}`, '/base/team/roles', '/base/schedule', '/base/time-off', '/base/team-availability', '/base/timesheets', '/base/timesheets?view=range&from=2026-10-01&to=2026-10-31', '/base/reports', '/base/reports?report=attendance', '/base/inquiries', '/base/account'];
  for (const s of ['basic', 'locations', 'schedule', 'clock', 'overtime', 'payroll', 'time-off', 'team', 'activity']) adminPages.push(`/base/settings?section=${s}`);
  for (const p of adminPages) {
    const r = await get(p, admin);
    // /base/my-week sends the .env admin (not on the roster) to Manager View.
    check(`admin ${p}`, r.status === 200 || (p === '/base/my-week' && r.status === 307), String(r.status));
  }
  for (const p of ['/base/my-week', '/base/schedule', '/base/time-off', '/base/availability', '/base/timesheets', '/base/account']) {
    const r = await get(p, employee);
    check(`employee ${p}`, r.status === 200, String(r.status));
  }
  // The page streams behind a loading screen, so Next sends the redirect inside the page (200) rather than as a 307.
  const blocked = await get('/base/settings', employee);
  const blockedHtml = blocked.body.toString();
  check('employee is kept out of Settings', (blocked.status === 307 || blocked.status === 303 || /NEXT_REDIRECT;replace;\/base[";]/.test(blockedHtml)) && !blockedHtml.includes('Stores &amp; geofences'), String(blocked.status));

  console.log('\nDownloads');
  for (const [report, format, expect] of [['hours', 'pdf', 'application/pdf'], ['payroll', 'xlsx', 'spreadsheetml'], ['timecards', 'csv', 'text/csv'], ['attendance', 'pdf', 'application/pdf'], ['roster', 'xlsx', 'spreadsheetml'], ['activity', 'csv', 'text/csv']]) {
    const r = await get(`/base/reports/download?report=${report}&format=${format}&from=2026-10-01&to=2026-10-31`, admin);
    const magic = format === 'pdf' ? r.body.subarray(0, 4).toString() === '%PDF' : format === 'xlsx' ? r.body.subarray(0, 2).toString() === 'PK' : r.body.length > 10;
    check(`${report} report as ${format.toUpperCase()}`, r.status === 200 && r.type.includes(expect) && magic, `${r.status}, ${r.body.length} bytes`);
  }
  const emp = await get('/base/reports/download?report=hours&format=pdf&from=2026-10-01&to=2026-10-31', employee);
  check('employee cannot download reports', emp.status === 404, String(emp.status));

  console.log('\nPasswords (admin only) and cache across server processes');
  const setPw = actionId('assistant/actions.ts', 'assistantSetPassword');
  const showPw = actionId('assistant/actions.ts', 'assistantShowPassword');
  for (let n = 0; n < 4; n++) await get('/base/team', admin); // warm every process's cache
  const pw = `Smoke-${Math.random().toString(36).slice(2, 8)}`;
  const setRes = await action(setPw, [created.id, pw], admin);
  check('admin sets a password', /"ok":true/.test(setRes));
  let seen = 0;
  for (let n = 0; n < 8; n++) if ((await get('/base/team', admin)).body.toString().includes(pw)) seen++;
  check('new password shows on the roster on every request (every process)', seen === 8, `${seen}/8`);
  const shown = await action(showPw, [created.id], admin);
  check('admin can look the password up', shown.includes(pw));
  const denied = await action(setPw, [created.id, 'Nope12345'], employee);
  check('an employee cannot set passwords', !/"ok":true/.test(denied));
  const { data: after } = await db.from('employees').select('password_hash, password_secret, session_version').eq('id', created.id).single();
  check('stored as a hash + encrypted copy (never plain text)', after.password_hash.startsWith('scrypt:') && after.password_secret.startsWith('v1:') && !after.password_secret.includes(pw));
  const old = await get('/base/my-week', employee);
  check('the new password signed them out of their old session', old.status === 307, String(old.status));
  employee = cookie(await sign(created.id, 'employee', after.session_version)); // signs in again

  console.log('\nAssistants');
  const chat = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'What is the address of the downtown showroom?' }] }) }).then((r) => r.json());
  check('website chat answers store questions', /13th/i.test(chat.reply ?? ''), (chat.model ?? (chat.offline ? 'offline answer' : '')).toString());
  const book = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'I would like to book a design consultation' }] }) }).then((r) => r.json());
  check('website chat offers to send an inquiry', book.inquiry === true);
  const help = await fetch(`${BASE}/base/api/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: employee }, body: JSON.stringify({ messages: [{ role: 'user', content: 'I forgot my password' }] }) }).then((r) => r.json());
  check('Base assistant offers an employee a password request', help.action?.type === 'password_help', (help.reply ?? help.error ?? '').slice(0, 70).replace(/\s+/g, ' '));
  const adminAsk = await fetch(`${BASE}/base/api/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: admin }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Reset the password for Smoke Tester' }] }) }).then((r) => r.json());
  check('Base assistant prepares a password change for the admin', adminAsk.action?.type === 'set_password' && adminAsk.action?.employeeId === created.id);
  const howTo = await fetch(`${BASE}/base/api/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: employee }, body: JSON.stringify({ messages: [{ role: 'user', content: 'How do I request time off?' }] }) }).then((r) => r.json());
  check('Base assistant explains how to do things (no password button)', /time off/i.test(howTo.reply ?? '') && !howTo.action, (howTo.reply ?? '').slice(0, 70).replace(/\s+/g, ' '));

  console.log('\nActivity log');
  await new Promise((r) => setTimeout(r, 2000));
  const { data: log } = await db.from('audit_log').select('summary').eq('action', 'employee.password_set').order('created_at', { ascending: false }).limit(1);
  check('password change logged as a sentence', /set a new password for Smoke Tester/.test(log?.[0]?.summary ?? ''), log?.[0]?.summary ?? '—');
} finally {
  await db.from('inquiries').delete().eq('source', 'base_chat').eq('name', 'Smoke Tester');
  await db.from('audit_log').delete().eq('entity_id', created.id);
  await db.from('audit_log').delete().eq('actor_id', created.id);
  await db.from('employees').delete().eq('id', created.id);
}
console.log(failures ? `\n${failures} check(s) failed\n` : '\nAll checks passed\n');
process.exitCode = failures ? 1 : 0;
