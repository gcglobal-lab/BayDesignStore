#!/usr/bin/env node
/**
 * Copies every Bay Design table from one Supabase database to another (e.g. moving region).
 *
 *   1. In .env.local: SOURCE_DATABASE_URL = the OLD database, DATABASE_URL = the NEW one
 *      (both: Supabase → Connect → "Session pooler" URI with the password filled in).
 *   2. npm run db:migrate                        → creates the tables in the new database
 *   3. node scripts/db-copy.mjs --dry-run        → shows row counts, changes nothing
 *   4. node scripts/db-copy.mjs --replace        → empties the new tables, copies everything
 *
 * The old database is only read. Row counts are compared at the end.
 */
import postgres from 'postgres';

process.loadEnvFile?.('.env.local');
const from = process.env.SOURCE_DATABASE_URL;
const to = process.env.DATABASE_URL;
const dryRun = process.argv.includes('--dry-run');
const replace = process.argv.includes('--replace');
if (!from || !to) {
  console.error('Set SOURCE_DATABASE_URL (old database) and DATABASE_URL (new database) in .env.local.');
  process.exit(1);
}
if (from === to) {
  console.error('SOURCE_DATABASE_URL and DATABASE_URL are the same database.');
  process.exit(1);
}

// Parents before children, so foreign keys are always satisfied.
const TABLES = [
  'company_settings', 'locations', 'departments', 'job_roles', 'employees', 'department_managers',
  'employee_roles', 'employee_wages', 'shifts', 'shift_requests', 'events', 'time_off_policies',
  'time_off_requests', 'availability_requests', 'availability_slots', 'time_entries', 'time_entry_breaks',
  'manager_log', 'leave_allowances', 'inquiries', 'newsletter_subscribers', 'audit_log', 'login_attempts',
];

const src = postgres(from, { ssl: 'require', max: 1, onnotice: () => {} });
const dst = postgres(to, { ssl: 'require', max: 1, onnotice: () => {} });
const count = async (db, t) => Number((await db.unsafe(`select count(*)::int as n from public.${t}`))[0].n);

try {
  const host = (u) => new URL(u).hostname;
  console.log(`From ${host(from)}  →  to ${host(to)}\n`);
  for (const t of TABLES) {
    const exists = await dst.unsafe(`select to_regclass('public.${t}') as r`);
    if (!exists[0].r) throw new Error(`Table ${t} is missing in the new database — run "npm run db:migrate" first.`);
  }
  const before = {};
  for (const t of TABLES) before[t] = await count(src, t);
  console.log(TABLES.map((t) => `  ${t.padEnd(24)} ${before[t]}`).join('\n'));
  if (dryRun) {
    console.log('\nDry run — nothing copied.');
    process.exit(0);
  }
  const existing = await count(dst, 'employees');
  if (existing > 0 && !replace) throw new Error(`The new database already has ${existing} employees. Re-run with --replace to overwrite it.`);

  await dst.begin(async (tx) => {
    await tx.unsafe(`truncate ${TABLES.map((t) => `public.${t}`).join(', ')} restart identity cascade`);
    for (const t of TABLES) {
      const reader = await src.unsafe(`copy public.${t} to stdout`).readable();
      const writer = await tx.unsafe(`copy public.${t} from stdin`).writable();
      await new Promise((resolve, reject) => {
        reader.on('error', reject);
        writer.on('error', reject);
        writer.on('finish', resolve);
        reader.pipe(writer);
      });
      process.stdout.write(`  copied ${t}\n`);
    }
    // Identity columns continue after the copied ids.
    for (const t of ['audit_log', 'login_attempts']) {
      await tx.unsafe(`select setval(pg_get_serial_sequence('public.${t}', 'id'), coalesce((select max(id) from public.${t}), 0) + 1, false)`);
    }
  });

  let ok = true;
  for (const t of TABLES) {
    const n = await count(dst, t);
    if (n !== before[t]) {
      ok = false;
      console.log(`  ✗ ${t}: ${before[t]} in old, ${n} in new`);
    }
  }
  console.log(ok ? '\n✓ Every table copied with matching row counts.' : '\nSome counts differ — see above.');
  process.exitCode = ok ? 0 : 1;
} catch (err) {
  console.error(`\nCopy failed (the new database was left unchanged): ${err.message}`);
  process.exitCode = 1;
} finally {
  await src.end();
  await dst.end();
}
