import 'server-only';
import { db } from './db';
import { isDbConfigured } from './env';

/**
 * Brute-force protection for sign-in: at most 5 failures per login ID and 25 per IP
 * address in 15 minutes. Attempts live in the database so the limit holds across
 * server instances; before the database is connected an in-memory log is used.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IDENTIFIER = 5;
const MAX_PER_IP = 25;

const memory: { identifier: string; ip: string | null; at: number }[] = [];

export async function isLoginBlocked(identifier: string, ip: string | null): Promise<boolean> {
  const since = Date.now() - WINDOW_MS;
  if (!isDbConfigured()) {
    while (memory.length && memory[0].at < since) memory.shift();
    const byId = memory.filter((a) => a.identifier === identifier).length;
    const byIp = ip ? memory.filter((a) => a.ip === ip).length : 0;
    return byId >= MAX_PER_IDENTIFIER || byIp >= MAX_PER_IP;
  }
  const sinceIso = new Date(since).toISOString();
  const [byId, byIp] = await Promise.all([
    db().from('login_attempts').select('id', { count: 'exact', head: true }).eq('identifier', identifier).eq('success', false).gte('created_at', sinceIso),
    ip
      ? db().from('login_attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).eq('success', false).gte('created_at', sinceIso)
      : Promise.resolve({ count: 0, error: null }),
  ]);
  // Fail closed: if we can't count attempts, don't allow unlimited guessing.
  if (byId.error || byIp.error) return true;
  return (byId.count ?? 0) >= MAX_PER_IDENTIFIER || (byIp.count ?? 0) >= MAX_PER_IP;
}

export async function recordLoginAttempt(identifier: string, ip: string | null, success: boolean) {
  if (!isDbConfigured()) {
    if (!success) memory.push({ identifier, ip, at: Date.now() });
    else for (let i = memory.length - 1; i >= 0; i--) if (memory[i].identifier === identifier) memory.splice(i, 1);
    return;
  }
  await db().from('login_attempts').insert({ identifier, ip, success });
  // A successful sign-in clears that login ID's recent failures.
  if (success) {
    await db().from('login_attempts').delete().eq('identifier', identifier).eq('success', false);
  }
}
