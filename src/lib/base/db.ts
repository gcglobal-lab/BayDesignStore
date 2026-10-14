import 'server-only';
import { headers } from 'next/headers';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './env';
import { onRemoteInvalidate, publish } from './sync';

let client: SupabaseClient | null = null;

/**
 * Shared read cache for page views. Many people opening the same pages at the same moment
 * ask the database the same questions; identical reads within READ_TTL_MS share one answer.
 *   - Any write through this server clears every cached read that touches that table (the
 *     table name appears in the query URL, including embedded tables), so whoever made a
 *     change sees it at once.
 *   - Server actions (punch in/out, saves, approvals) never use the cache: their checks
 *     ("already punched in?", "does this overlap?") always see the live database.
 *   - A read that started before a write finished is never stored afterwards.
 */
const READ_TTL_MS = Math.max(0, Number(process.env.DB_READ_CACHE_MS ?? 3000));
const MAX_CACHED = 2000;
type Cached = { at: number; status: number; statusText: string; headers: [string, string][]; body: ArrayBuffer };
const readCache = new Map<string, Cached>();
const readsInFlight = new Map<string, Promise<Cached>>();
let writeVersion = 0;
const tableVersion = new Map<string, number>();

/** "employees" for https://…/rest/v1/employees?select=… */
const tableOf = (url: string) => url.match(/\/rest\/v1\/([a-z_]+)/)?.[1] ?? '';

function dropTable(table: string) {
  writeVersion++;
  tableVersion.set(table, writeVersion);
  for (const key of readCache.keys()) if (key.includes(table)) readCache.delete(key);
}

function invalidateTable(table: string) {
  dropTable(table);
  publish('reads', [table]);
}
onRemoteInvalidate('reads', (tables) => tables.forEach(dropTable));

/** True while rendering a page or a GET route; false inside server actions (and outside requests). */
async function cacheableRequest(): Promise<boolean> {
  if (READ_TTL_MS === 0) return false;
  try {
    const h = await headers();
    return !h.has('next-action');
  } catch {
    return false;
  }
}

const toResponse = (c: Cached) => new Response(c.body.slice(0), { status: c.status, statusText: c.statusText, headers: c.headers });

/**
 * Database traffic control. Supabase answers "upstream request timeout" when it receives
 * more queries at once than it has connections for, so each server process keeps at most
 * DB_MAX_CONCURRENCY queries in flight and queues the rest (a short wait instead of an error).
 * Reads that fail with a gateway error are retried with backoff; writes are never retried,
 * so nothing can be saved twice.
 */
const MAX_IN_FLIGHT = Math.max(1, Number(process.env.DB_MAX_CONCURRENCY) || 24);
const REQUEST_TIMEOUT_MS = 25_000;
let inFlight = 0;
/** Saves and server actions (punch in/out, approvals…) go first; page views wait behind them. */
const urgent: (() => void)[] = [];
const queue: (() => void)[] = [];

function acquire(priority: boolean): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise((resolve) => (priority ? urgent : queue).push(resolve));
}

function release() {
  const next = urgent.shift() ?? queue.shift();
  if (next) next(); // hand the slot straight to the next waiting query
  else inFlight--;
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504, 520, 522, 524]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gatedFetch(input: RequestInfo | URL, init?: RequestInit, priority = false): Promise<Response> {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const canRetry = method === 'GET' || method === 'HEAD';
  await acquire(priority);
  try {
    for (let attempt = 0; ; attempt++) {
      const signal = init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(input, { ...init, signal, cache: 'no-store' });
        if (canRetry && RETRYABLE.has(res.status) && attempt < 3) {
          await res.body?.cancel().catch(() => {});
          await sleep(250 * 2 ** attempt + Math.random() * 200);
          continue;
        }
        return res;
      } catch (err) {
        if (!canRetry || attempt >= 3 || init?.signal?.aborted) throw err;
        await sleep(250 * 2 ** attempt + Math.random() * 200);
      }
    }
  } finally {
    release();
  }
}

/** Reads go through the shared cache when allowed; writes clear the tables they touch. */
async function dbFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    const table = tableOf(url);
    invalidateTable(table);
    try {
      return await gatedFetch(input, init, true);
    } finally {
      invalidateTable(table);
    }
  }
  if (!(await cacheableRequest())) return gatedFetch(input, init, true);

  const h = new Headers(init?.headers);
  const key = `${method} ${url} ${h.get('accept') ?? ''} ${h.get('prefer') ?? ''} ${h.get('range') ?? ''}`;
  const hit = readCache.get(key);
  if (hit && Date.now() - hit.at < READ_TTL_MS) return toResponse(hit);

  let pending = readsInFlight.get(key);
  if (!pending) {
    const startedAt = writeVersion;
    pending = (async () => {
      const res = await gatedFetch(input, init);
      const headersOut = [...res.headers.entries()].filter(([k]) => k !== 'content-encoding' && k !== 'content-length');
      const c: Cached = { at: Date.now(), status: res.status, statusText: res.statusText, headers: headersOut, body: await res.arrayBuffer() };
      // Only keep it if nothing it reads from was written while it was on its way.
      const stale = [...tableVersion.entries()].some(([table, version]) => version > startedAt && key.includes(table));
      if (res.ok && !stale) {
        if (readCache.size >= MAX_CACHED) readCache.delete(readCache.keys().next().value!);
        readCache.set(key, c);
      }
      return c;
    })().finally(() => readsInFlight.delete(key));
    readsInFlight.set(key, pending);
  }
  return toResponse(await pending);
}

/** For the load test / health checks: how busy the database gate is right now. */
export const dbGateStats = () => ({ inFlight, queued: queue.length + urgent.length, max: MAX_IN_FLIGHT, cachedReads: readCache.size });

/**
 * Supabase client authenticated with the service-role key. Only ever used on the
 * server; every caller must have checked the viewer's permissions first.
 */
export function db(): SupabaseClient {
  if (client) return client;
  const config = getSupabaseConfig();
  if (!config) throw new Error('Bay Design Base database is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: dbFetch },
  });
  return client;
}

type Result = { data: unknown; error: { message: string; code?: string } | null };

/** Unwraps a Supabase response, throwing on error (the message is logged server-side, never shown raw). */
export function must<T>(res: Result, context: string): T {
  if (res.error) {
    console.error(`[db] ${context}:`, res.error.message);
    throw new Error(`Database error while trying to ${context}.`);
  }
  return res.data as T;
}

export const isUniqueViolation = (res: Result) => res.error?.code === '23505';
