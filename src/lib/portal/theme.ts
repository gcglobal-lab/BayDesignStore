import 'server-only';
import { cookies } from 'next/headers';

export type ThemePref = 'light' | 'dark' | 'system';
export const THEME_COOKIE = 'portal_theme';

/** Each person's Workflow / Deliveries appearance, remembered on their device. */
export async function readTheme(): Promise<ThemePref> {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return v === 'dark' || v === 'system' ? v : 'light';
}
