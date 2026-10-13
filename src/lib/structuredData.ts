import { faqs, type BlogPost } from '@/data/siteData';
import { SITE_URL, breadcrumb } from './seo';

const mapLink = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

const openingHours = [
  { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '17:30' },
  { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Saturday', opens: '09:00', closes: '17:00' },
];

/** Site-wide Organization / WebSite / LocalBusiness graph, rendered on every public page. */
export const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Bay Design Store',
      alternateName: ['Bay Design', 'BayDesign', 'Bay Design Store Naples', 'Bay Design Naples', 'Bay Design Warehouse'],
      description: 'Naples, Florida interior design firm and fine furniture store, founded by Susan Bay in 1979.',
      slogan: 'Naples, Florida interior design & fine furniture since 1979',
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/icon-512.png`,
      foundingDate: '1979',
      founder: { '@type': 'Person', name: 'Susan Bay', jobTitle: 'Founder & CEO' },
      email: 'info@baydesignstore.com',
      telephone: '+1-239-649-0906',
      knowsAbout: ['Interior design', 'Luxury interior design', 'Coastal interior design', 'Fine furniture', 'Custom furniture'],
      sameAs: ['https://www.instagram.com/baydesignstore/', 'https://www.facebook.com/BayDesignStore'],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: 'Bay Design Store',
      alternateName: ['Bay Design', 'BayDesign'],
      publisher: { '@id': `${SITE_URL}/#organization` },
      inLanguage: 'en-US',
    },
    {
      '@type': ['FurnitureStore', 'HomeGoodsStore', 'ProfessionalService'],
      '@id': `${SITE_URL}/#downtown`,
      name: 'Bay Design Store — Downtown Naples Showroom',
      description: 'Fine furniture, home furnishings and full-service interior design in Downtown Naples, Florida.',
      url: `${SITE_URL}/`,
      image: 'https://images.unsplash.com/photo-1615529182904-14819c35db37?auto=format&fit=crop&w=1200&q=80',
      telephone: '+1-239-649-0906',
      email: 'info@baydesignstore.com',
      priceRange: '$$$',
      hasMap: mapLink('Bay Design Store, 326 13th Avenue South, Naples, FL 34102'),
      parentOrganization: { '@id': `${SITE_URL}/#organization` },
      address: { '@type': 'PostalAddress', streetAddress: '326 13th Avenue South', addressLocality: 'Naples', addressRegion: 'FL', postalCode: '34102', addressCountry: 'US' },
      openingHoursSpecification: [
        ...openingHours,
        { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Sunday', opens: '10:00', closes: '16:00' },
      ],
      areaServed: [
        { '@type': 'City', name: 'Naples, FL' },
        { '@type': 'City', name: 'Marco Island, FL' },
        { '@type': 'City', name: 'Bonita Springs, FL' },
        { '@type': 'City', name: 'Estero, FL' },
        { '@type': 'City', name: 'Fort Myers, FL' },
        { '@type': 'AdministrativeArea', name: 'Collier County, FL' },
        { '@type': 'AdministrativeArea', name: 'Lee County, FL' },
        { '@type': 'State', name: 'Florida' },
      ],
      knowsAbout: ['Interior design', 'Luxury interior design', 'Coastal interior design', 'Fine furniture', 'Home furnishings', 'Custom furniture', 'Space planning', 'Art and accessories'],
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: 'Interior Design Services',
        itemListElement: [
          'Full-Service Interior Design',
          'Instant Design Program',
          'White Glove Delivery & Installation',
          'Custom Furniture Orders',
          'Private & Video Design Appointments',
        ].map((name) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name } })),
      },
    },
    {
      '@type': ['FurnitureStore', 'HomeGoodsStore'],
      '@id': `${SITE_URL}/#warehouse`,
      name: 'Bay Design Warehouse — North Naples Showroom',
      alternateName: 'Bay Design Store Warehouse',
      description: 'The Bay Design warehouse and North Naples showroom: ready-to-deliver furniture, lighting, art and accessories.',
      url: `${SITE_URL}/contact`,
      telephone: '+1-239-778-9709',
      priceRange: '$$$',
      hasMap: mapLink('Bay Design, 5510 Shirley Street, Naples, FL 34109'),
      parentOrganization: { '@id': `${SITE_URL}/#organization` },
      address: { '@type': 'PostalAddress', streetAddress: '5510 Shirley Street', addressLocality: 'Naples', addressRegion: 'FL', postalCode: '34109', addressCountry: 'US' },
      openingHoursSpecification: openingHours,
    },
  ],
};

const crumbs = (name: string, path: string) => breadcrumb([{ name: 'Home', path: '/' }, { name, path }]);

/** Per-page structured data, rendered server-side by each page. */
export const pageJsonLd = {
  about: crumbs('About', '/about'),
  collections: crumbs('Collections', '/collections'),
  portfolio: crumbs('Portfolio', '/portfolio'),
  contact: crumbs('Contact', '/contact'),
  blog: crumbs('Journal', '/blog'),
  services: {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      },
      crumbs('Services', '/services'),
    ],
  },
};

export const blogPostJsonLd = (post: BlogPost) => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.excerpt,
      image: post.image,
      datePublished: post.isoDate,
      dateModified: post.isoDate,
      keywords: post.keywords.join(', '),
      mainEntityOfPage: `${SITE_URL}/blog/${post.id}`,
      author: { '@type': 'Organization', name: 'Bay Design Store', url: SITE_URL },
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    breadcrumb([
      { name: 'Home', path: '/' },
      { name: 'Journal', path: '/blog' },
      { name: post.seoTitle, path: `/blog/${post.id}` },
    ]),
  ],
});
