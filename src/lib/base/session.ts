import 'server-only';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, sessionTtlSeconds, signSession, verifySession, type SessionClaims } from './token';

export async function createSession(claims: SessionClaims) {
  const ttl = sessionTtlSeconds(claims.lvl);
  const token = await signSession(claims, ttl);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ttl,
    priority: 'high',
  });
}

export async function readSession(): Promise<SessionClaims | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function destroySession() {
  (await cookies()).delete({ name: SESSION_COOKIE, path: '/' });
}
