'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireViewer } from '@/lib/base/auth';
import { THEME_COOKIE } from '@/lib/portal/theme';

/** Light / dark / match-the-device for Workflow and Deliveries. */
export async function setTheme(formData: FormData) {
  await requireViewer();
  const value = String(formData.get('theme'));
  if (value !== 'light' && value !== 'dark' && value !== 'system') return;
  (await cookies()).set(THEME_COOKIE, value, { path: '/', maxAge: 400 * 24 * 3600, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', httpOnly: true });
  revalidatePath('/base', 'layout');
}
