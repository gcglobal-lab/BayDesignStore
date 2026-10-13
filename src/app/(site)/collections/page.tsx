import type { Metadata } from 'next';
import Collections from '@/views/Collections';
import JsonLd from '@/components/JsonLd';
import { buildMetadata, pageSeo } from '@/lib/seo';
import { pageJsonLd } from '@/lib/structuredData';

export const metadata: Metadata = buildMetadata(pageSeo.collections);

export default function Page() {
  return (
    <>
      <JsonLd data={pageJsonLd.collections} />
      <Collections />
    </>
  );
}
