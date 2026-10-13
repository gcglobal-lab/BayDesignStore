import type { MetadataRoute } from 'next';
import { blogPosts } from '@/data/siteData';
import { SITE_URL } from '@/lib/seo';

const PAGES = ['/', '/about', '/collections', '/services', '/portfolio', '/blog', '/contact'];

export default function sitemap(): MetadataRoute.Sitemap {
  const today = new Date().toISOString().slice(0, 10);
  return [
    ...PAGES.map((p) => ({ url: `${SITE_URL}${p}`, lastModified: today, priority: p === '/' ? 1 : 0.8 })),
    ...blogPosts.map((p) => ({ url: `${SITE_URL}/blog/${p.id}`, lastModified: p.isoDate, priority: 0.7 })),
  ];
}
