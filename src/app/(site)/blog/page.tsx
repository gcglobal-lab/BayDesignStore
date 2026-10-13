import type { Metadata } from 'next';
import Blog from '@/views/Blog';
import JsonLd from '@/components/JsonLd';
import { buildMetadata, pageSeo } from '@/lib/seo';
import { pageJsonLd } from '@/lib/structuredData';

export const metadata: Metadata = buildMetadata(pageSeo.blog);

export default function Page() {
  return (
    <>
      <JsonLd data={pageJsonLd.blog} />
      <Blog />
    </>
  );
}
