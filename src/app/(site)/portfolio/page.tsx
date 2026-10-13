import type { Metadata } from 'next';
import Portfolio from '@/views/Portfolio';
import JsonLd from '@/components/JsonLd';
import { buildMetadata, pageSeo } from '@/lib/seo';
import { pageJsonLd } from '@/lib/structuredData';

export const metadata: Metadata = buildMetadata(pageSeo.portfolio);

export default function Page() {
  return (
    <>
      <JsonLd data={pageJsonLd.portfolio} />
      <Portfolio />
    </>
  );
}
