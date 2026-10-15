import 'server-only';
import { onRemoteInvalidate, publish } from './sync';

/**
 * A tiny in-process cache for data that is read on almost every request but changes
 * rarely (company settings, locations, roles, the roster). Each server action that
 * writes such data calls `invalidate()` for its key, so this server shows the change
 * immediately; other server instances pick it up when the short TTL runs out.
 *
 * Concurrent callers share one in-flight load, so a burst of requests causes one
 * database query instead of hundreds.
 */
type Entry = { at: number; value: Promise<unknown> };
const store = new Map<string, Entry>();

export function memo<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  store.set(key, { at: Date.now(), value });
  // Never cache a failure.
  value.catch(() => {
    if (store.get(key)?.value === value) store.delete(key);
  });
  return value;
}

function drop(prefixes: string[]) {
  for (const key of [...store.keys()]) if (prefixes.some((p) => key.startsWith(p))) store.delete(key);
}

/** Drops cached entries whose key starts with any of the given prefixes — here and in sibling processes. */
export function invalidate(...prefixes: string[]) {
  drop(prefixes);
  publish('memo', prefixes);
}
onRemoteInvalidate('memo', drop);

export const CacheKeys = {
  settings: 'settings',
  locations: 'locations',
  roles: 'roles',
  departments: 'departments',
  employees: 'employees',
  viewer: 'viewer:',
  inquiries: 'inquiries',
  crmBadges: 'crm-badges:',
  crmSetup: 'crm-setup',
  dlSettings: 'dl-settings',
} as const;

/** Everything the roster or company setup affects. */
export const invalidateTeam = () => invalidate(CacheKeys.employees, CacheKeys.roles, CacheKeys.departments, CacheKeys.viewer);
