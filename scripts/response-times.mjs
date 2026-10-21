#!/usr/bin/env node
/**
 * Response times of the main pages: time to first byte and full download, after one warm-up
 * request, as the median and the slowest of --runs requests (default 5).
 *
 *   node scripts/response-times.mjs [--base http://localhost:3000] [--runs 5] [--public-only]
 *
 * Portal pages are fetched as the .env admin (a session signed with SESSION_SECRET, like the
 * other test scripts), so they only work against a server that shares this .env.local.
 */
import { createClient } from '@supabase/supabase-js';
import { SignJWT } from 'jose';

process.loadEnvFile?.('.env.local');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:3000').replace(/\/$/, '');
const RUNS = Math.max(1, Number(arg('runs', 5)));
const publicOnly = process.argv.includes('--public-only');

const PUBLIC = ['/', '/about', '/collections', '/services', '/portfolio', '/contact', '/blog', '/blog/best-interior-designer-florida', '/sitemap.xml', '/api/health'];
let PORTAL = [];
let cookie = '';
if (!publicOnly) {
  const token = await new SignJWT({ lvl: 'admin', sv: 1 }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject('env-admin').setIssuer('bay-design-base').setAudience('bay-design-base:session').setIssuedAt().setExpirationTime('15m').sign(new TextEncoder().encode(process.env.SESSION_SECRET));
  cookie = `__Host-bdb_session=${token}`;
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const [{ data: board }, { data: order }] = await Promise.all([
    db.from('crm_boards').select('id, workspace_id').eq('archived', false).limit(1).maybeSingle(),
    db.from('dl_orders').select('id').limit(1).maybeSingle(),
  ]);
  PORTAL = [
    '/base/manager', '/base/schedule', '/base/timesheets', '/base/time-off', '/base/team', '/base/reports?report=attendance', '/base/settings',
    '/base/crm', '/base/crm/contacts', '/base/crm/vendors', '/base/crm/deals', '/base/crm/tasks', '/base/crm/workspace',
    ...(board ? [`/base/crm/workspace/${board.workspace_id}/board/${board.id}`] : []),
    '/base/deliveries', '/base/deliveries/orders', '/base/deliveries/customers', '/base/deliveries/dispatch',
    ...(order ? [`/base/deliveries/orders/${order.id}`] : []),
  ];
}

async function time(path, c) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, { headers: c ? { Cookie: c } : {}, redirect: 'manual' });
  const ttfb = performance.now() - t0;
  const bytes = (await res.arrayBuffer()).byteLength;
  return { status: res.status, ttfb, total: performance.now() - t0, bytes };
}
const pct = (list, p) => [...list].sort((a, b) => a - b)[Math.min(list.length - 1, Math.floor((list.length - 1) * p))];
const ms = (n) => `${Math.round(n)} ms`.padStart(8);

async function measure(title, paths, c) {
  console.log(`\n${title}\n${'page'.padEnd(52)} status  first byte (median / slowest)   full page   size`);
  const all = [];
  for (const path of paths) {
    await time(path, c); // warm-up
    const runs = [];
    for (let r = 0; r < RUNS; r++) runs.push(await time(path, c));
    const ttfbs = runs.map((r) => r.ttfb);
    const totals = runs.map((r) => r.total);
    all.push(...totals);
    console.log(`${path.slice(0, 51).padEnd(52)} ${String(runs[0].status).padEnd(6)} ${ms(pct(ttfbs, 0.5))} / ${ms(Math.max(...ttfbs))}        ${ms(pct(totals, 0.5))}   ${(runs[0].bytes / 1024).toFixed(0).padStart(4)} KB`);
  }
  console.log(`${'All pages'.padEnd(52)}        median ${ms(pct(all, 0.5)).trim()}, 95% under ${ms(pct(all, 0.95)).trim()}`);
}

console.log(`Response times → ${BASE} (${RUNS} runs per page after a warm-up)`);
await measure('Public website', PUBLIC, '');
if (!publicOnly) await measure('Employee Portal (signed in as the admin)', PORTAL, cookie);
