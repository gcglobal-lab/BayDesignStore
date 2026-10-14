'use server';

import { timingSafeEqual } from 'node:crypto';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { getViewer } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { ADMIN_DISPLAY_NAME, getAdminCredentials, isDbConfigured } from '@/lib/base/env';
import { verifyPassword } from '@/lib/base/password';
import { isLoginBlocked, recordLoginAttempt } from '@/lib/base/rateLimit';
import { clientIp } from '@/lib/base/request';
import { createSession, destroySession } from '@/lib/base/session';
import { ENV_ADMIN_SUBJECT, type SessionClaims } from '@/lib/base/token';

const schema = z.object({
  loginId: z.string().trim().toLowerCase().min(1).max(120),
  password: z.string().min(1).max(200),
  next: z.string().max(300).optional(),
});

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Only allow redirects back into the Base itself (no open redirects). */
function safeNext(next: string | undefined) {
  if (!next || !next.startsWith('/base') || next.startsWith('//') || next.includes('\\') || next.startsWith('/base/login')) return '/base';
  return next;
}

export async function signIn(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = schema.safeParse({
    loginId: formData.get('loginId'),
    password: formData.get('password'),
    next: formData.get('next') || undefined,
  });
  if (!parsed.success) return fail('Enter your login ID and password.');
  const { loginId, password, next } = parsed.data;

  const ip = await clientIp();
  if (await isLoginBlocked(loginId, ip)) {
    return fail('Too many sign-in attempts. Please wait 15 minutes and try again.');
  }

  let claims: SessionClaims | null = null;
  let employeeId: string | null = null;
  let name = ADMIN_DISPLAY_NAME;

  const admin = getAdminCredentials();
  if (admin && sameText(loginId, admin.loginId)) {
    if (await verifyPassword(password, admin.passwordHash)) claims = { sub: ENV_ADMIN_SUBJECT, lvl: 'admin', sv: 1 };
  } else if (isDbConfigured() && /^[a-z0-9._@+-]{3,120}$/.test(loginId)) {
    const column = loginId.includes('@') ? 'email' : 'login_id';
    const { data } = await db()
      .from('employees')
      .select('id, first_name, last_name, password_hash, access_level, status, session_version')
      .eq(column, loginId)
      .maybeSingle();
    // verifyPassword spends the same time whether or not the account exists.
    const valid = await verifyPassword(password, data?.password_hash);
    if (valid && data && data.status !== 'terminated') {
      claims = { sub: data.id, lvl: data.access_level, sv: data.session_version };
      employeeId = data.id;
      name = `${data.first_name} ${data.last_name}`.trim();
    }
  } else {
    await verifyPassword(password, null);
  }

  await recordLoginAttempt(loginId, ip, claims !== null);
  if (!claims) return fail('That login ID and password don’t match. Check them and try again.');

  if (employeeId) {
    await db()
      .from('employees')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', employeeId);
    await db().from('employees').update({ status: 'active' }).eq('id', employeeId).eq('status', 'pending');
  }
  await createSession(claims);
  await audit({ employeeId, name }, 'auth.sign_in');

  redirect(safeNext(next));
}

/**
 * Ends the session. The sign-out button then does a full page load (see Sidebar) so the in-memory
 * router cache of signed-in pages is thrown away and Back/Forward can't show them again.
 */
export async function signOut() {
  const viewer = await getViewer();
  if (viewer) await audit(viewer, 'auth.sign_out');
  await destroySession();
}
