import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Toaster } from '@/components/ui/toast';
import { cormorant, dmSans, marcellus } from './fonts';
import { SITE_URL, buildMetadata, pageSeo } from '@/lib/seo';
import '@/index.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  ...buildMetadata(pageSeo.home),
  authors: [{ name: 'Bay Design Store' }],
  robots: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  // Ownership codes from Google Search Console / Bing Webmaster Tools (see .env.example).
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { 'msvalidate.01': process.env.BING_SITE_VERIFICATION } : undefined,
  },
  other: { 'geo.region': 'US-FL', 'geo.placename': 'Naples, Florida' },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-48.png', type: 'image/png', sizes: '48x48' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180' },
  },
  manifest: '/site.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#FBF8F3',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-US" data-scroll-behavior="smooth" className={`${cormorant.variable} ${dmSans.variable} ${marcellus.variable}`}>
      <body>
        {children}
        <Toaster />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
