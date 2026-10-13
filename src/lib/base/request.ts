import 'server-only';
import { isIP } from 'node:net';
import { headers } from 'next/headers';

/**
 * Client IP as reported by the hosting proxy. Only used for rate limiting and the
 * audit trail, never for access decisions. Returns null if it isn't a valid IP.
 */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const candidate = (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? '').trim();
  return isIP(candidate) ? candidate : null;
}

export async function userAgent(): Promise<string | null> {
  return (await headers()).get('user-agent')?.slice(0, 400) ?? null;
}
