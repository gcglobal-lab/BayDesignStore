import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Blog from '@/views/Blog';
import { blogPosts } from '@/data/siteData';
import JsonLd from '@/components/JsonLd';
import { buildMetadata } from '@/lib/seo';
import { blogPostJsonLd } from '@/lib/structuredData';

export const dynamicParams = false;

export function generateStaticParams() {
  return blogPosts.map((post) => ({ postId: post.id }));
}

export async function generateMetadata({ params }: PageProps<'/blog/[postId]'>): Promise<Metadata> {
  const { postId } = await params;
  const post = blogPosts.find((p) => p.id === postId);
  if (!post) return {};
  return buildMetadata({
    title: /bay design/i.test(post.seoTitle) || post.seoTitle.length > 42 ? post.seoTitle : `${post.seoTitle} | Bay Design Store`,
    description: post.excerpt,
    path: `/blog/${post.id}`,
    keywords: post.keywords,
    image: post.image,
    type: 'article',
  });
}

export default async function Page({ params }: PageProps<'/blog/[postId]'>) {
  const { postId } = await params;
  const post = blogPosts.find((p) => p.id === postId);
  if (!post) notFound();
  return (
    <>
      <JsonLd data={blogPostJsonLd(post)} />
      <Blog postId={postId} />
    </>
  );
}
