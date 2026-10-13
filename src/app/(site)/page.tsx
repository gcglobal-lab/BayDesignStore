import type { Metadata } from 'next';
import Home from '@/views/Home';
import { buildMetadata, pageSeo } from '@/lib/seo';

export const metadata: Metadata = buildMetadata(pageSeo.home);

export default function Page() {
  return <Home />;
}
