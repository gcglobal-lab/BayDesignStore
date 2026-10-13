'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireViewer } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { checkPasswordStrength, hashPassword, verifyPassword } from '@/lib/base/password';
import { isLoginBlocked, recordLoginAttempt } from '@/lib/base/rateLimit';
import { clientIp } from '@/lib/base/request';
import { createSession } from '@/lib/base/session';

export async function changePassword(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireViewer({ allowPasswordChange: true });
  if (!viewer.employeeId) return fail('The administrator password lives in the server’s .env file — run `npm run hash-password` to change it.');

  const parsed = z
    .object({ current: z.string().min(1, 'Enter your current password.').max(200), next: z.string().max(200), confirm: z.string().max(200) })
    .safeParse({ current: formData.get('current'), next: formData.get('next'), confirm: formData.get('confirm') });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Fill in all three fields.');
  const { current, next, confirm } = parsed.data;

  const limiterKey = `password-change:${viewer.employeeId}`;
  const ip = await clientIp();
  if (await isLoginBlocked(limiterKey, ip)) return fail('Too many attempts. Please wait 15 minutes and try again.');

  const { data: me } = await db().from('employees').select('login_id, password_hash, session_version').eq('id', viewer.employeeId).single();
  if (!me || !(await verifyPassword(current, me.password_hash))) {
    await recordLoginAttempt(limiterKey, ip, false);
    return fail('Your current password isn’t right.');
  }
  await recordLoginAttempt(limiterKey, ip, true);
  if (next !== confirm) return fail('The new passwords don’t match.');
  if (next === current) return fail('Choose a password different from your current one.');
  const weak = checkPasswordStrength(next, me.login_id);
  if (weak) return fail(weak);

  const sessionVersion = me.session_version + 1;
  const { error } = await db()
    .from('employees')
    .update({ password_hash: await hashPassword(next), must_change_password: false, session_version: sessionVersion })
    .eq('id', viewer.employeeId);
  if (error) return fail('Couldn’t change your password. Please try again.');

  // Other devices are signed out; this one gets a fresh session.
  await createSession({ sub: viewer.employeeId, lvl: viewer.level, sv: sessionVersion });
  await audit(viewer, 'auth.password_change', 'employees', viewer.employeeId);
  if (viewer.mustChangePassword) redirect('/base');
  return done('Password changed. You’ve been signed out on your other devices.');
}
