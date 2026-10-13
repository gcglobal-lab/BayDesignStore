#!/usr/bin/env node
/**
 * Applies supabase/migrations/*.sql to the database in DATABASE_URL (from .env.local).
 *
 *   npm run db:migrate            → runs migrations not applied yet
 *   npm run db:migrate -- --seed  → also loads supabase/seed.sql (once)
 *
 * Each file runs in its own transaction and is recorded in
 * supabase_migrations.schema_migrations (same table the Supabase CLI uses).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

process.loadEnvFile?.('.env.local');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is empty in .env.local (Supabase → Connect → Session pooler URI).');
  process.exit(1);
}

const sql = postgres(url, { ssl: 'require', max: 1, onnotice: () => {} });
const dir = 'supabase/migrations';

try {
  await sql`create schema if not exists supabase_migrations`;
  await sql`create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)`;
  const applied = new Set((await sql`select version from supabase_migrations.schema_migrations`).map((r) => r.version));

  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const jobs = files.map((f) => ({ version: f.split('_')[0], name: f.replace(/^\d+_|\.sql$/g, ''), path: join(dir, f) }));
  if (process.argv.includes('--seed') && existsSync('supabase/seed.sql')) jobs.push({ version: 'seed', name: 'seed', path: 'supabase/seed.sql' });

  for (const job of jobs) {
    if (applied.has(job.version)) {
      console.log(`✓ ${job.version} ${job.name} (already applied)`);
      continue;
    }
    const body = readFileSync(job.path, 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into supabase_migrations.schema_migrations (version, name) values (${job.version}, ${job.name})`;
    });
    console.log(`→ ${job.version} ${job.name} applied`);
  }
  console.log('Database is up to date.');
} catch (err) {
  console.error(`Migration failed (nothing from the failing file was kept): ${err.message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
