import 'server-only';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, sessionCookieOptions, signSession, verifySession, type SessionClaims } from './token';

export async function createSession(claims: SessionClaims) {
  const token = await signSession(claims, SESSION_TTL_SECONDS);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
}

export async function readSession(): Promise<SessionClaims | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function destroySession() {
  (await cookies()).delete({ name: SESSION_COOKIE, path: '/' });
}
