import type { Metadata } from 'next';
import Contact from '@/views/Contact';
import JsonLd from '@/components/JsonLd';
import { buildMetadata, pageSeo } from '@/lib/seo';
import { pageJsonLd } from '@/lib/structuredData';

export const metadata: Metadata = buildMetadata(pageSeo.contact);

export default function Page() {
  return (
    <>
      <JsonLd data={pageJsonLd.contact} />
      <Contact />
    </>
  );
}
