import 'server-only';
import type { Viewer } from './auth';
import { db, must } from './db';
import { openPassword } from './vault';

/**
 * Current passwords by employee id, for admins only (anyone else gets an empty map).
 * Null means a password exists but no readable copy is stored (set before V2).
 */
export async function passwordsFor(viewer: Viewer, ids?: string[]): Promise<Map<string, string | null>> {
  if (viewer.level !== 'admin') return new Map();
  let query = db().from('employees').select('id, password_secret');
  if (ids) query = query.in('id', ids);
  const rows = must<{ id: string; password_secret: string | null }[]>(await query, 'load passwords');
  return new Map(rows.map((r) => [r.id, openPassword(r.password_secret)]));
}
