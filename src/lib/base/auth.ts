import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { db } from './db';
import { ADMIN_DISPLAY_NAME, getAdminCredentials, isDbConfigured } from './env';
import { CacheKeys, memo } from './memo';
import { readSession } from './session';
import { ENV_ADMIN_SUBJECT, type AccessLevel } from './token';

export type Viewer = {
  /** 'env-admin' for the administrator defined in .env, otherwise the employee id. */
  id: string;
  /** Null for the .env administrator, who is not on the roster and can't clock in. */
  employeeId: string | null;
  name: string;
  firstName: string;
  level: AccessLevel;
};

export const isManager = (v: Viewer) => v.level === 'manager' || v.level === 'admin';

/**
 * The signed-in person, re-validated against the database: a terminated account, a new
 * password or a changed access level ends the session (within a few seconds on other
 * server instances; immediately on the one that made the change).
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const claims = await readSession();
  if (!claims) return null;

  if (claims.sub === ENV_ADMIN_SUBJECT) {
    if (!getAdminCredentials() || claims.lvl !== 'admin') return null;
    return { id: ENV_ADMIN_SUBJECT, employeeId: null, name: ADMIN_DISPLAY_NAME, firstName: ADMIN_DISPLAY_NAME, level: 'admin' };
  }

  if (!isDbConfigured() || !/^[0-9a-f-]{36}$/i.test(claims.sub)) return null;
  return memo(`${CacheKeys.viewer}${claims.sub}:${claims.sv}`, 10_000, async (): Promise<Viewer | null> => {
    const { data, error } = await db()
      .from('employees')
      .select('id, first_name, last_name, access_level, status, session_version, password_hash')
      .eq('id', claims.sub)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || data.status === 'terminated' || !data.password_hash || data.session_version !== claims.sv) return null;
    return {
      id: data.id,
      employeeId: data.id,
      name: `${data.first_name} ${data.last_name}`.trim(),
      firstName: data.first_name,
      level: data.access_level,
    };
  }).catch(() => null);
});

/** Every Base page and server action starts here. */
export async function requireViewer({ allowNoDatabase = false } = {}): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect('/base/login?reason=expired');
  // Before Supabase is connected only the .env admin can sign in, and only the setup page works.
  if (!allowNoDatabase && !isDbConfigured()) redirect('/base/setup');
  return viewer;
}

export async function requireManager(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!isManager(viewer)) redirect('/base/my-week');
  return viewer;
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (viewer.level !== 'admin') redirect('/base');
  return viewer;
}

/** A viewer who is on the roster (can clock in, request time off, etc.). */
export async function requireEmployee(): Promise<Viewer & { employeeId: string }> {
  const viewer = await requireViewer();
  if (!viewer.employeeId) redirect('/base/manager');
  return viewer as Viewer & { employeeId: string };
}
