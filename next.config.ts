import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

/** Headers sent on every response, public site and Bay Design Base alike. */
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // Geolocation is only ever requested by our own pages (the Base time clock).
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)' },
];

/**
 * CSP for the statically rendered marketing pages. Bay Design Base (/base) gets a stricter,
 * per-request nonce policy from src/proxy.ts instead.
 */
const publicCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.unsplash.com https://images.pexels.com https://images.squarespace-cdn.com",
  "media-src 'self' https://videos.pexels.com",
  "font-src 'self'",
  "frame-src https://www.openstreetmap.org",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The Docker image runs the self-contained server (see Dockerfile); npm start is unaffected.
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' as const } : {}),
  compress: true,
  // Map tile key for the browser (CARTO requires one; it is meant to be public — restrict it to your domain in CARTO).
  env: { NEXT_PUBLIC_CARTO_KEY: process.env.CARTOAPI?.trim() ?? '' },
  // Timesheet PDFs are built on the server; load jsPDF from node_modules instead of bundling it.
  serverExternalPackages: ['jspdf', 'jspdf-autotable', 'exceljs'],
  reactStrictMode: true,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Everything except /base and /base/*
      { source: '/:path((?!base(?:/|$)).*)', headers: [{ key: 'Content-Security-Policy', value: publicCsp }] },
    ];
  },
};

export default nextConfig;
