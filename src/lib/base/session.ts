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

/**
 * Overwrites the cookie with an already-expired one using the same attributes it was set with.
 * A plain delete drops `Secure`, and browsers ignore any change to a `__Host-` cookie without it,
 * which left people signed in after "Sign out" in production.
 */
export async function destroySession() {
  (await cookies()).set(SESSION_COOKIE, '', { ...sessionCookieOptions, maxAge: 0 });
}
