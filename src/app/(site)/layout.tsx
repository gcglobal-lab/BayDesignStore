import type { ReactNode } from 'react';
import { preconnect } from 'react-dom';
import Layout from '@/components/Layout';
import JsonLd from '@/components/JsonLd';
import { organizationJsonLd } from '@/lib/structuredData';
import StoreChat from '@/components/chat/StoreChat';

export default function SiteLayout({ children }: { children: ReactNode }) {
  preconnect('https://images.unsplash.com');
  preconnect('https://images.pexels.com');
  preconnect('https://videos.pexels.com');
  return (
    <>
      <JsonLd data={organizationJsonLd} />
      <Layout>{children}</Layout>
      <StoreChat />
      <noscript>
        <h1>Bay Design Store — Naples, Florida Interior Design &amp; Fine Furniture</h1>
        <p>
          Designer-curated home furnishings and full-service interior design since 1979. Downtown Naples showroom: 326 13th Avenue South, Naples, FL
          34102, (239) 649-0906. Bay Design warehouse: 5510 Shirley Street, Naples, FL 34109, (239) 778-9709.
        </p>
      </noscript>
    </>
  );
}
