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
  compress: true,
  // Timesheet PDFs are built on the server; load jsPDF from node_modules instead of bundling it.
  serverExternalPackages: ['jspdf', 'jspdf-autotable', 'exceljs'],
  reactStrictMode: true,
  // CSV imports (Workflow) and proof-of-delivery photos (Deliveries) are sent to server actions;
  // Vercel accepts request bodies up to 4.5 MB.
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
    // Pages you just visited are reused for 30 s when you go back to them; saving anything
    // (every server action revalidates) still shows fresh data straight away.
    staleTimes: { dynamic: 30 },
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Icons and the web-app manifest rarely change: browsers keep them a day and refresh in the background.
      {
        source: '/:file(favicon\\.ico|favicon\\.svg|favicon-32\\.png|favicon-48\\.png|apple-touch-icon\\.png|icon-192\\.png|icon-512\\.png|site\\.webmanifest|portal\\.webmanifest)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
      // Everything except /base and /base/*
      { source: '/:path((?!base(?:/|$)).*)', headers: [{ key: 'Content-Security-Policy', value: publicCsp }] },
    ];
  },
};

export default nextConfig;
