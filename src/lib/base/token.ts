import { SignJWT, jwtVerify } from 'jose';

/**
 * Signed session tokens (HS256). Kept free of `server-only`/Node APIs so the proxy
 * can verify them too. The token only proves who signed in; every request still
 * re-checks the person against the database (see auth.ts).
 */

export type AccessLevel = 'employee' | 'manager' | 'admin';
export type SessionClaims = { sub: string; lvl: AccessLevel; sv: number };

export const ENV_ADMIN_SUBJECT = 'env-admin';
export const SESSION_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-bdb_session' : 'bdb_session';

const ISSUER = 'bay-design-base';
const AUDIENCE = 'bay-design-base:session';

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set to a random string of at least 32 characters.');
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(claims: SessionClaims, ttlSeconds: number): Promise<string> {
  return new SignJWT({ lvl: claims.lvl, sv: claims.sv })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token || token.length > 2048) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
    const lvl = payload.lvl;
    if (typeof payload.sub !== 'string' || typeof payload.sv !== 'number') return null;
    if (lvl !== 'employee' && lvl !== 'manager' && lvl !== 'admin') return null;
    return { sub: payload.sub, lvl, sv: payload.sv };
  } catch {
    return null;
  }
}

/** Managers and admins sign in for a working day; employees stay signed in on their phone for a week. */
export const sessionTtlSeconds = (lvl: AccessLevel) => (lvl === 'employee' ? 7 * 24 * 3600 : 12 * 3600);
