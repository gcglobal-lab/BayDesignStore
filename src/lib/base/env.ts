import 'server-only';

/** Server-only configuration for Bay Design Base. Nothing here is ever sent to the browser. */

export function getAdminCredentials(): { loginId: string; passwordHash: string } | null {
  const loginId = process.env.ADMIN_LOGIN_ID?.trim().toLowerCase();
  const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (!loginId || !passwordHash?.startsWith('scrypt:')) return null;
  return { loginId, passwordHash };
}

export const ADMIN_DISPLAY_NAME = process.env.ADMIN_DISPLAY_NAME?.trim() || 'Administrator';

export function getSupabaseConfig(): { url: string; serviceRoleKey: string } | null {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

export const isDbConfigured = () => getSupabaseConfig() !== null;

/** Used until the company settings row can be read (and as its default). */
export const DEFAULT_TIMEZONE = process.env.APP_TIMEZONE?.trim() || 'America/New_York';
