import type { Metadata } from 'next';
import About from '@/views/About';
import JsonLd from '@/components/JsonLd';
import { buildMetadata, pageSeo } from '@/lib/seo';
import { pageJsonLd } from '@/lib/structuredData';

export const metadata: Metadata = buildMetadata(pageSeo.about);

export default function Page() {
  return (
    <>
      <JsonLd data={pageJsonLd.about} />
      <About />
    </>
  );
}
