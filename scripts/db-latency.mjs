#!/usr/bin/env node
/** How long one small database query takes from this machine, and how many run per second in parallel. */
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile?.('.env.local');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const one = async () => {
  const t = performance.now();
  const { error } = await db.from('locations').select('id').limit(1);
  if (error) throw new Error(error.message);
  return performance.now() - t;
};
await one();
const seq = [];
for (let i = 0; i < 10; i++) seq.push(await one());
seq.sort((a, b) => a - b);
console.log(`Single query round-trip: median ${seq[5].toFixed(0)} ms (min ${seq[0].toFixed(0)}, max ${seq[9].toFixed(0)})`);
for (const parallel of [16, 32, 64, 128]) {
  const t = performance.now();
  let errors = 0;
  await Promise.all(Array.from({ length: parallel * 4 }, () => one().catch(() => errors++)));
  const s = (performance.now() - t) / 1000;
  console.log(`${parallel * 4} queries, ${parallel} at a time → ${((parallel * 4) / s).toFixed(0)} queries/s, ${errors} errors`);
}
