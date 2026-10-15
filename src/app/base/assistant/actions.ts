'use server';

import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireAdmin, requireViewer } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { CacheKeys, invalidate } from '@/lib/base/memo';
import { passwordsFor } from '@/lib/base/passwords';
import { getEmployee } from '@/lib/base/queries';
import { setEmployeePassword } from '../(app)/team/actions';

/** Admin, from the assistant: set a password (typed or generated). Same rules as Team ▸ Roster. */
export async function assistantSetPassword(employeeId: string, password: string): Promise<ActionResult> {
  await requireAdmin();
  const fd = new FormData();
  fd.set('id', employeeId);
  fd.set('password', password);
  return setEmployeePassword(null, fd);
}

/** Admin, from the assistant: look up someone's current password. */
export async function assistantShowPassword(employeeId: string): Promise<ActionResult> {
  const viewer = await requireAdmin();
  if (!z.string().uuid().safeParse(employeeId).success) return fail('Team member not found.');
  const person = await getEmployee(employeeId);
  if (!person) return fail('Team member not found.');
  if (!person.has_password) return done(`${person.first_name} has no password yet.`, { login: person.login_id });
  const password = (await passwordsFor(viewer, [employeeId])).get(employeeId);
  return password
    ? done(`${person.first_name}’s sign-in details:`, { login: person.login_id, password })
    : done(`${person.first_name}’s password was set before passwords were stored, so it can’t be shown. Set a new one to see it.`, { login: person.login_id });
}

/** Anyone signed in: ask the admin for a new password. Lands in Website ▸ inquiries and the activity log. */
export async function requestPasswordHelp(note: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  const me = viewer.employeeId ? await getEmployee(viewer.employeeId) : null;
  const message = `password help requested from the Employee Portal assistant.\nLogin ID: ${me?.login_id ?? '—'}${note.trim() ? `\n\n${note.trim().slice(0, 1000)}` : ''}`;
  const { error } = await db().from('inquiries').insert({
    name: viewer.name,
    email: me?.email ?? 'no email on file',
    phone: me?.phone ?? null,
    interest: 'Password help',
    message,
    page: 'Employee Portal assistant',
    source: 'base_chat',
  });
  if (error) return fail('Couldn’t send the request. Please ask a manager in person.');
  invalidate(CacheKeys.inquiries);
  await audit(viewer, 'assistant.password_help');
  return done('Sent — the admin will set a new password and give it to you.');
}
