#!/usr/bin/env node
/**
 * Load + data-integrity test for Bay Design Store / Bay Design Base.
 *
 *   npm run build && npm start            (in another terminal — test the production server)
 *   node scripts/load-test.mjs --users 500 --requests 1000
 *   node scripts/load-test.mjs --users 5000 --requests 10000 --employees 60 --punches 4
 *
 * What it does
 *   1. Creates temporary team members (login "loadtest.001"…, one test manager) in the database.
 *   2. Signs them in (session tokens made with SESSION_SECRET, exactly like the sign-in page).
 *   3. Runs --requests requests with --users of them in flight at once: website pages, the
 *      Base pages people use most, and real punch in / punch out calls (the same server
 *      actions the phone uses, with a GPS fix at the Uptown store).
 *   4. Fires 5 simultaneous punch-ins for one person — exactly one may succeed.
 *   5. Checks the database: every test person has exactly --punches closed time cards and
 *      no open ones, and the activity log recorded them.
 *   6. Deletes everything it created (use --keep to leave the test people in place).
 *
 * Options: --base http://localhost:3000  --users 500  --requests 1000  --employees 40  --punches 3  --keep  --dev
 */
import { performance } from 'node:perf_hooks';
import { createClient } from '@supabase/supabase-js';
import { SignJWT } from 'jose';
import { actionIds } from './action-ids.mjs';

process.loadEnvFile?.('.env.local');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:3000').replace(/\/$/, '');
const USERS = Number(arg('users', 500));
const REQUESTS = Number(arg('requests', 1000));
const EMPLOYEES = Number(arg('employees', 40));
const PUNCHES = Number(arg('punches', 3));
const KEEP = process.argv.includes('--keep');
const PREFIX = 'loadtest.';

for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SESSION_SECRET']) {
  if (!process.env[k]) {
    console.error(`${k} is missing from .env.local`);
    process.exit(1);
  }
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
// next start runs in production mode (cookie __Host-bdb_session); pass --dev when testing next dev.
const prodCookie = !process.argv.includes('--dev');

// ------------------------------------------------------------------ helpers --
// Local build ids for localhost, or read from the deployed site's JavaScript (see action-ids.mjs).
const find = await actionIds(BASE, `${prodCookie ? '__Host-bdb_session' : 'bdb_session'}=${await token('env-admin', 'admin', 1)}`);
const actions = { clockIn: find('my-week/clock-actions.ts', 'clockIn'), clockOut: find('my-week/clock-actions.ts', 'clockOut') };
if (!actions.clockIn || !actions.clockOut) {
  console.error('Server action ids not found — build the app first (npm run build), or check --base.');
  process.exit(1);
}

async function token(id, lvl, sv) {
  return new SignJWT({ lvl, sv })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(id)
    .setIssuer('bay-design-base')
    .setAudience('bay-design-base:session')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(secret);
}

const stats = new Map(); // route → { ok, fail, times: [] , codes: {} }
function record(route, ms, ok, code) {
  const s = stats.get(route) ?? { ok: 0, fail: 0, times: [], codes: {} };
  s[ok ? 'ok' : 'fail']++;
  s.times.push(ms);
  s.codes[code] = (s.codes[code] ?? 0) + 1;
  stats.set(route, s);
}
const pct = (arr, p) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  return Math.round(a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))]);
};

async function hit(route, url, init = {}, check = (r) => r.ok) {
  const t = performance.now();
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(90_000), ...init });
    const text = await res.text();
    const ok = check(res, text);
    record(route, performance.now() - t, ok, res.status);
    return { ok, status: res.status, text };
  } catch (err) {
    record(route, performance.now() - t, false, err.name === 'TimeoutError' ? 'timeout' : err.cause?.code ?? err.code ?? err.name);
    return { ok: false, status: 0, text: '' };
  }
}

function cookieFor(t) {
  return `${prodCookie ? '__Host-bdb_session' : 'bdb_session'}=${t}`;
}

const UPTOWN = { lat: 26.214225, lng: -81.781417, accuracy: 12, ageMs: 500 };
function actionCall(id, args, cookie) {
  return {
    method: 'POST',
    headers: {
      'Next-Action': id,
      'Content-Type': 'text/plain;charset=UTF-8',
      Accept: 'text/x-component',
      Origin: BASE,
      Cookie: cookie,
    },
    body: JSON.stringify(args),
  };
}
const actionOk = (res, text) => res.ok && /"ok":true/.test(text);

// -------------------------------------------------------------------- setup --
async function setup() {
  await cleanup(true);
  const rows = Array.from({ length: EMPLOYEES }, (_, i) => ({
    first_name: 'Load',
    last_name: `Test ${String(i + 1).padStart(3, '0')}`,
    login_id: `${PREFIX}${String(i + 1).padStart(3, '0')}`,
    access_level: 'employee',
    status: 'active',
    // Never used to sign in (the test signs session tokens directly); only marks "has a password".
    password_hash: 'scrypt:16384:8:1:bG9hZHRlc3Q:bG9hZHRlc3Q',
    must_change_password: false,
  }));
  rows.push({ first_name: 'Load', last_name: 'Test Manager', login_id: `${PREFIX}manager`, access_level: 'manager', status: 'active', password_hash: 'scrypt:16384:8:1:bG9hZHRlc3Q:bG9hZHRlc3Q', must_change_password: false });
  const { data, error } = await db.from('employees').insert(rows).select('id, login_id, access_level, session_version');
  if (error) throw new Error(`Couldn't create test people: ${error.message}`);
  const people = await Promise.all(data.map(async (e) => ({ ...e, cookie: cookieFor(await token(e.id, e.access_level, e.session_version)) })));
  return { staff: people.filter((p) => p.access_level === 'employee'), manager: people.find((p) => p.access_level === 'manager') };
}

async function cleanup(quiet = false) {
  const { data } = await db.from('employees').select('id').like('login_id', `${PREFIX}%`);
  const ids = (data ?? []).map((e) => e.id);
  if (ids.length) {
    await db.from('audit_log').delete().in('actor_id', ids);
    await db.from('employees').delete().in('id', ids); // time cards and breaks cascade
  }
  await db.from('audit_log').delete().like('actor_label', 'Load Test%');
  if (!quiet) console.log(`Cleanup: removed ${ids.length} test people and their time cards / activity.`);
}

// ---------------------------------------------------------------------- run --
async function main() {
  console.log(`\nBay Design load test → ${BASE}`);
  console.log(`${USERS} users at once · ${REQUESTS} requests · ${EMPLOYEES} test employees × ${PUNCHES} punch-in/out cycles\n`);
  const warm = await fetch(`${BASE}/`).catch(() => null);
  if (!warm?.ok) {
    console.error(`The server at ${BASE} isn't answering. Start it first (npm run build && npm start).`);
    process.exit(1);
  }

  const { staff, manager } = await setup();
  console.log(`Created ${staff.length} test employees + 1 test manager.`);

  // Each test employee's punch cycles run in order (in → out → in …); everything else is mixed traffic.
  const punchQueue = staff.map((p) => ({ p, left: PUNCHES * 2, on: false, retries: 0, gaveUp: false }));
  const pages = [
    { route: 'GET / (website)', make: () => [`${BASE}/`] },
    { route: 'GET /services', make: () => [`${BASE}/services`] },
    { route: 'GET /contact', make: () => [`${BASE}/contact`] },
    { route: 'GET /collections', make: () => [`${BASE}/collections`] },
    { route: 'GET /base/my-week', make: (p) => [`${BASE}/base/my-week`, { headers: { Cookie: p.cookie } }], check: (r) => r.status === 200 },
    { route: 'GET /base/schedule', make: (p) => [`${BASE}/base/schedule`, { headers: { Cookie: p.cookie } }], check: (r) => r.status === 200 },
    { route: 'GET /base/timesheets', make: (p) => [`${BASE}/base/timesheets`, { headers: { Cookie: p.cookie } }], check: (r) => r.status === 200 },
    { route: 'GET /base/time-off', make: (p) => [`${BASE}/base/time-off`, { headers: { Cookie: p.cookie } }], check: (r) => r.status === 200 },
    { route: 'GET /base/manager (manager)', make: () => [`${BASE}/base/manager`, { headers: { Cookie: manager.cookie } }], check: (r) => r.status === 200 },
    { route: 'GET /base/team (manager)', make: () => [`${BASE}/base/team`, { headers: { Cookie: manager.cookie } }], check: (r) => r.status === 200 },
  ];

  let issued = 0;
  let punchesDone = 0;
  const totalPunches = punchQueue.length * PUNCHES * 2;
  const started = performance.now();

  async function nextPunch() {
    const slot = punchQueue.find((q) => q.left > 0 && !q.busy);
    if (!slot) return false;
    slot.busy = true;
    const res = slot.on
      ? await hit('POST punch out', `${BASE}/base/my-week`, actionCall(actions.clockOut, [UPTOWN], slot.p.cookie), actionOk)
      : await hit('POST punch in', `${BASE}/base/my-week`, actionCall(actions.clockIn, [UPTOWN, null], slot.p.cookie), actionOk);
    // "Already punched in" / "not punched in" means an earlier attempt was saved even though its
    // answer didn't arrive — the time card is right, so move on.
    const alreadyDone = slot.on ? /not punched in/i.test(res.text) : /already punched in/i.test(res.text);
    if (res.ok || alreadyDone) {
      slot.on = !slot.on;
      slot.left--;
      punchesDone++;
    } else if (++slot.retries > 8) {
      slot.left = 0; // give up on this person; the data check will report it
      slot.gaveUp = true;
    } else {
      // A failed punch is retried (and counted as an error above).
      await new Promise((r) => setTimeout(r, 300));
    }
    slot.busy = false;
    return true;
  }

  async function worker(w) {
    while (issued < REQUESTS || punchQueue.some((q) => q.left > 0)) {
      // About 1 in 4 requests is a punch while punches remain; the rest are page views.
      const wantPunch = punchQueue.some((q) => q.left > 0 && !q.busy) && (issued >= REQUESTS || (issued + w) % 4 === 0);
      if (wantPunch && (await nextPunch())) {
        issued++;
        continue;
      }
      if (issued >= REQUESTS) {
        if (punchQueue.some((q) => q.left > 0)) await new Promise((r) => setTimeout(r, 50));
        else break;
        continue;
      }
      issued++;
      const page = pages[(issued + w) % pages.length];
      const p = staff[(issued + w) % staff.length];
      const [url, init] = page.make(p);
      await hit(page.route, url, init, page.check);
    }
  }

  const progress = setInterval(() => {
    const done = [...stats.values()].reduce((s, v) => s + v.ok + v.fail, 0);
    process.stdout.write(`\r  ${done} requests done · ${punchesDone}/${totalPunches} punches · ${((performance.now() - started) / 1000).toFixed(0)} s   `);
  }, 1000);
  await Promise.all(Array.from({ length: USERS }, (_, w) => worker(w)));
  clearInterval(progress);
  const seconds = (performance.now() - started) / 1000;
  process.stdout.write('\n');

  // Double punch: 5 at the same moment for one person → exactly one may succeed.
  const target = staff[0];
  const race = await Promise.all(Array.from({ length: 5 }, () => fetch(`${BASE}/base/my-week`, actionCall(actions.clockIn, [UPTOWN, null], target.cookie)).then((r) => r.text())));
  const raceWins = race.filter((t) => /"ok":true/.test(t)).length;
  await fetch(`${BASE}/base/my-week`, actionCall(actions.clockOut, [UPTOWN], target.cookie)).then((r) => r.text());

  // ------------------------------------------------------------- report --
  const all = [...stats.values()];
  const total = all.reduce((s, v) => s + v.ok + v.fail, 0);
  const failed = all.reduce((s, v) => s + v.fail, 0);
  console.log(`\n${total} requests in ${seconds.toFixed(1)} s → ${(total / seconds).toFixed(0)} requests/s · ${failed} failed (${((failed / total) * 100).toFixed(2)}%)\n`);
  console.log('Route'.padEnd(30), 'OK'.padStart(6), 'Fail'.padStart(6), 'p50'.padStart(7), 'p95'.padStart(7), 'p99'.padStart(7), '  status codes');
  for (const [route, s] of stats) {
    console.log(route.padEnd(30), String(s.ok).padStart(6), String(s.fail).padStart(6), `${pct(s.times, 50)}ms`.padStart(7), `${pct(s.times, 95)}ms`.padStart(7), `${pct(s.times, 99)}ms`.padStart(7), ' ', JSON.stringify(s.codes));
  }

  // -------------------------------------------------------- data checks --
  await new Promise((r) => setTimeout(r, 2500)); // activity is written just after each response
  const ids = staff.map((p) => p.id);
  const { data: cards, error } = await db.from('time_entries').select('employee_id, clock_in_at, clock_out_at, clock_in_place, clock_in_in_geofence').in('employee_id', ids);
  if (error) throw new Error(error.message);
  const per = new Map(ids.map((id) => [id, []]));
  for (const c of cards) per.get(c.employee_id).push(c);
  const expected = (id) => PUNCHES + (id === target.id && raceWins === 1 ? 1 : 0);
  const wrongCount = ids.filter((id) => per.get(id).length !== expected(id));
  const open = cards.filter((c) => !c.clock_out_at);
  const badOrder = cards.filter((c) => c.clock_out_at && c.clock_out_at <= c.clock_in_at);
  const notAtStore = cards.filter((c) => c.clock_in_place !== 'Uptown' || c.clock_in_in_geofence !== true);
  const { count: activity } = await db.from('audit_log').select('id', { count: 'exact', head: true }).in('actor_id', ids).in('action', ['clock.in', 'clock.out']);
  const expectedActivity = cards.length * 2;

  console.log('\nData checks');
  const check = (label, pass, detail = '') => console.log(`  ${pass ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  check(`Each test employee has exactly ${PUNCHES} time cards`, wrongCount.length === 0, wrongCount.length ? `${wrongCount.length} people off` : `${cards.length} cards`);
  check('No time card left open', open.length === 0, open.length ? `${open.length} open` : '');
  check('Every punch-out is after its punch-in', badOrder.length === 0);
  check('Every punch recorded at the Uptown store (geofence match)', notAtStore.length === 0, notAtStore.length ? `${notAtStore.length} wrong` : '');
  check('5 simultaneous punch-ins → exactly 1 accepted', raceWins === 1, `${raceWins} accepted`);
  check('Activity log has a punch-in and punch-out entry per card', (activity ?? 0) === expectedActivity, `${activity}/${expectedActivity}`);

  if (!KEEP) await cleanup();
  const ok = failed === 0 && wrongCount.length === 0 && open.length === 0 && badOrder.length === 0 && raceWins === 1;
  console.log(ok ? '\nPASS\n' : '\nSOME CHECKS FAILED — see above\n');
  process.exitCode = ok ? 0 : 1;
}

main().catch(async (err) => {
  console.error('\nLoad test crashed:', err.message);
  if (!KEEP) await cleanup().catch(() => {});
  process.exit(1);
});
