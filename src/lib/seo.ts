import type { Metadata } from 'next';

/** Public domain of the live site — used for canonical links, social previews and the sitemap. */
export const SITE_URL = 'https://baydesignstore.com';
export const SITE_NAME = 'Bay Design Store';
export const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1615529182904-14819c35db37?auto=format&fit=crop&w=1200&h=630&q=80';

/** Core phrases people search for; merged into every page's keywords. */
export const coreKeywords = [
  'Bay Design Store',
  'Bay Design',
  'BayDesign',
  'Bay Design Naples',
  'Bay Design warehouse',
  'Naples interior design',
  'Naples interior designer',
  'Florida interior design',
  'Florida interior designer',
  'best interior designer in Florida',
  'luxury interior design Florida',
  'interior design USA',
  'Naples furniture store',
  'furniture store Naples FL',
];

export type PageSeo = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  image?: string;
  type?: 'website' | 'article';
};

/** Title, description and keywords for each static page — rendered server-side as Next metadata. */
export const pageSeo = {
  home: {
    title: 'Bay Design Store | Naples, Florida Interior Design & Fine Furniture',
    description:
      'Naples, Florida interior design firm and fine furniture store founded by Susan Bay in 1979. Luxury full-service interior design, a Downtown Naples showroom and the Bay Design warehouse — serving Southwest Florida and beyond.',
    path: '/',
    keywords: ['interior designer near me', 'Naples FL interior design', 'Southwest Florida interior designer', 'luxury furniture Naples'],
  },
  about: {
    title: 'About Bay Design Store | Susan Bay, Naples Florida Interior Designer Since 1979',
    description:
      'Meet Susan Bay, founder of Bay Design Store. Founded in Ann Arbor in 1979 and in Naples, Florida since 2003, we are a full-service interior design firm and fine furniture boutique. Susan also designs for Sherrill Furniture.',
    path: '/about',
    keywords: ['Susan Bay', 'Susan Bay interior designer', 'Sherrill Furniture DC Collection', 'Naples interior design firm', 'Florida interior designer since 1979'],
  },
  collections: {
    title: 'Luxury Furniture Store in Naples, FL | Bay Design Store Collection',
    description:
      'Shop designer-curated sofas, chairs, tables, lighting, art and accessories at Bay Design Store — a luxury furniture store in Naples, Florida with a Downtown showroom and North Naples warehouse. Custom orders and white-glove delivery.',
    path: '/collections',
    keywords: ['luxury furniture Naples FL', 'furniture store near me', 'sofas Naples FL', 'coastal furniture Florida', 'custom furniture Naples', 'home furnishings Naples'],
  },
  services: {
    title: 'Interior Design Services in Naples & Southwest Florida | Bay Design Store',
    description:
      'Full-service luxury interior design, the complimentary Instant Design Program, custom furniture, white-glove delivery and private appointments from Bay Design Store in Naples, Florida.',
    path: '/services',
    keywords: ['interior design services Naples', 'full-service interior design Florida', 'Instant Design Program', 'white glove furniture delivery Naples', 'custom furniture orders Florida', 'interior decorator Naples FL'],
  },
  portfolio: {
    title: 'Interior Design Portfolio | Luxury Naples & Florida Homes | Bay Design Store',
    description:
      'Explore the Bay Design Store interior design portfolio — elegant, relaxed living rooms, dining rooms, bedrooms and kitchens designed for homes in Naples and Southwest Florida.',
    path: '/portfolio',
    keywords: ['interior design portfolio Florida', 'luxury home interiors Naples', 'coastal living room design', 'Florida home interior design ideas'],
  },
  contact: {
    title: 'Visit Bay Design Store | Naples Showroom & Bay Design Warehouse',
    description:
      'Visit Bay Design Store at 326 13th Avenue South in Downtown Naples, or the Bay Design warehouse at 5510 Shirley Street, North Naples, FL. Call (239) 649-0906 to book a private or video design appointment.',
    path: '/contact',
    keywords: ['Bay Design Store address', 'Bay Design warehouse Shirley Street', 'Bay Design Store phone number', 'furniture showroom Naples', 'interior designer appointment Naples'],
  },
  blog: {
    title: 'Interior Design Journal | Florida & Coastal Design Ideas | Bay Design Store',
    description:
      'Interior design advice from Naples, Florida: how to choose the best interior designer in Florida, coastal and luxury design ideas, Bay Design warehouse finds, and Southwest Florida trends.',
    path: '/blog',
    keywords: ['interior design blog', 'Florida interior design ideas', 'coastal interior design', 'Naples design trends', 'luxury interior design USA'],
  },
} satisfies Record<string, PageSeo>;

/** Next metadata (title, description, canonical, social tags) for a page. */
export function buildMetadata({ title, description, path, keywords = [], image = DEFAULT_IMAGE, type = 'website' }: PageSeo): Metadata {
  const url = `${SITE_URL}${path}`;
  return {
    title: { absolute: title },
    description,
    keywords: Array.from(new Set([...keywords, ...coreKeywords])),
    alternates: { canonical: url },
    openGraph: { type, url, title, description, images: [image], siteName: SITE_NAME, locale: 'en_US' },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export const breadcrumb = (items: { name: string; path: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  '@id': `${SITE_URL}${items[items.length - 1].path}#breadcrumb`,
  itemListElement: items.map((item, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: item.name,
    item: `${SITE_URL}${item.path}`,
  })),
});
