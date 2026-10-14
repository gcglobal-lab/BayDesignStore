import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/base/token';

/**
 * Gatekeeper for Bay Design Base (/base). Runs before any page renders:
 *  - no valid session → straight to the sign-in page (pages re-check the database too)
 *  - strict per-request nonce Content-Security-Policy
 *  - never cached, never indexed
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isLogin = pathname === '/base/login';
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session && !isLogin) {
    const url = new URL('/base/login', request.url);
    if (pathname !== '/base') url.searchParams.set('next', pathname + search);
    return secure(NextResponse.redirect(url));
  }
  // Signed-in people skip the sign-in page — unless the app sent them there because the
  // session is no longer valid (terminated, password reset…), in which case drop the cookie.
  const expired = isLogin && request.nextUrl.searchParams.get('reason') === 'expired';
  if (session && isLogin && !expired && request.method === 'GET') {
    return secure(NextResponse.redirect(new URL('/base', request.url)));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    // Map tiles for the punch-location maps (CARTO streets, Esri satellite).
    "img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://basemaps.cartocdn.com https://tile.openstreetmap.org https://server.arcgisonline.com",
    "font-src 'self'",
    "frame-src https://www.openstreetmap.org",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(process.env.NODE_ENV === 'production' ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('x-base-path', pathname);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  if (expired) response.cookies.delete(SESSION_COOKIE);
  return secure(response);
}

function secure(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export const config = {
  matcher: ['/base', '/base/:path*'],
};
