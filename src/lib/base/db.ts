import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './env';

let client: SupabaseClient | null = null;

/**
 * Supabase client authenticated with the service-role key. Only ever used on the
 * server; every caller must have checked the viewer's permissions first.
 */
export function db(): SupabaseClient {
  if (client) return client;
  const config = getSupabaseConfig();
  if (!config) throw new Error('Bay Design Base database is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
  return client;
}

type Result = { data: unknown; error: { message: string; code?: string } | null };

/** Unwraps a Supabase response, throwing on error (the message is logged server-side, never shown raw). */
export function must<T>(res: Result, context: string): T {
  if (res.error) {
    console.error(`[db] ${context}:`, res.error.message);
    throw new Error(`Database error while trying to ${context}.`);
  }
  return res.data as T;
}

export const isUniqueViolation = (res: Result) => res.error?.code === '23505';
