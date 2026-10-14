#!/usr/bin/env node
/**
 * Production server using every CPU core: one Next.js process per core, all on the same port,
 * with requests shared round-robin. Use it instead of `npm start` when Docker isn't available.
 *
 *   npm run build
 *   npm run start:cluster                 (PORT=3000, 4 processes)
 *   WEB_CONCURRENCY=4 npm run start:cluster
 *
 * A process that crashes is replaced automatically. Processes tell each other when they save
 * a change, so their caches never show old data (see src/lib/base/sync.ts).
 */
import cluster from 'node:cluster';
import http from 'node:http';
import { availableParallelism } from 'node:os';

process.env.NODE_ENV = 'production';
process.env.NODE_CLUSTER_SCHED_POLICY ??= 'rr'; // Windows defaults to letting the OS pick, which is uneven
const port = Number(process.env.PORT || 3000);
// Four processes is the sweet spot here: more adds CPU but splits the shared read cache.
const workers = Math.max(1, Number(process.env.WEB_CONCURRENCY) || Math.min(4, Math.max(2, availableParallelism() - 1)));
// Share one database budget across the processes (Supabase free plan copes with ~64 at once).
process.env.DB_MAX_CONCURRENCY ??= String(Math.max(4, Math.ceil(Number(process.env.DB_TOTAL_CONCURRENCY || 64) / workers)));

if (cluster.isPrimary) {
  cluster.schedulingPolicy = cluster.SCHED_RR;
  let stopping = false;
  console.log(`Bay Design: starting ${workers} server processes on http://localhost:${port}`);
  for (let i = 0; i < workers; i++) cluster.fork();

  // Relay "drop your cached copy" messages to every other process.
  cluster.on('message', (from, msg) => {
    if (msg?.type !== 'bdb-invalidate') return;
    for (const w of Object.values(cluster.workers ?? {})) if (w && w.id !== from.id && w.isConnected()) w.send(msg);
  });
  cluster.on('exit', (w, code, signal) => {
    if (stopping) return;
    console.error(`Process ${w.process.pid} stopped (${signal ?? code}); starting a new one.`);
    cluster.fork();
  });
  const stop = () => {
    stopping = true;
    for (const w of Object.values(cluster.workers ?? {})) w?.kill();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} else {
  const { default: next } = await import('next');
  const app = next({ dev: false, dir: process.cwd(), hostname: 'localhost', port });
  await app.prepare();
  const handle = app.getRequestHandler();
  const server = http.createServer((req, res) => handle(req, res));
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.listen({ port, backlog: 4096 }, () => console.log(`  process ${process.pid} ready`));
}
