import type { Metadata } from 'next';
import Services from '@/views/Services';
import JsonLd from '@/components/JsonLd';
import { buildMetadata, pageSeo } from '@/lib/seo';
import { pageJsonLd } from '@/lib/structuredData';

export const metadata: Metadata = buildMetadata(pageSeo.services);

export default function Page() {
  return (
    <>
      <JsonLd data={pageJsonLd.services} />
      <Services />
    </>
  );
}
