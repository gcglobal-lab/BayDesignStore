import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './env';

export const FILES_BUCKET = 'portal-files';
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

let client: SupabaseClient | null = null;

/**
 * Supabase Storage with the service-role key (server only). Kept apart from db(): file bytes
 * must not go through the page-read cache or the query gate.
 */
export function storage() {
  if (!client) {
    const c = getSupabaseConfig();
    if (!c) throw new Error('Storage is not configured.');
    client = createClient(c.url, c.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client.storage.from(FILES_BUCKET);
}

/** A safe object name: letters, digits, dot, dash, underscore. */
export const safeFileName = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(-120) || 'file';
