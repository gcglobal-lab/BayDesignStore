'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, ArrowUpRight, Calendar } from 'lucide-react';
import { blogPosts, pageImages } from '@/data/siteData';
import PageHero from '@/components/PageHero';
import CTABanner from '@/components/CTABanner';
import { Reveal, SplitWords } from '@/components/motion';
import { responsive, SIZES } from '@/lib/photos';

/** The journal index, or a single article when `postId` is given (the route 404s unknown ids). */
export default function Blog({ postId }: { postId?: string }) {
  const selectedPost = postId ? blogPosts.find((post) => post.id === postId) : undefined;

  if (selectedPost) {
    const more = blogPosts.filter((p) => p.id !== selectedPost.id).slice(0, 3);
    return (
      <div className="bg-ivory">
        <PageHero crumb="Journal" eyebrow={selectedPost.category} title={selectedPost.title} image={selectedPost.image} height="tall">
          <p className="flex items-center gap-2 text-sm text-white/80"><Calendar size={15} /> {selectedPost.date} · Naples, Florida</p>
        </PageHero>
        <article className="shell py-20 md:py-28">
          <div className="mx-auto max-w-3xl">
            <Link href="/blog" className="link-underline mb-12 text-sm text-brass"><ArrowLeft size={15} /> Back to Journal</Link>
            <p className="font-display text-2xl leading-relaxed text-ink md:text-3xl">{selectedPost.excerpt}</p>
            {selectedPost.body.map((section, i) => (
              <section key={section.heading} className="mt-12">
                <h2 className="display text-3xl md:text-4xl">{section.heading}</h2>
                {section.paragraphs.map((text) => (
                  <p key={text.slice(0, 32)} className="mt-5 text-lg leading-relaxed text-muted">{text}</p>
                ))}
                {i === 0 && (
                  <img {...responsive(selectedPost.image)} alt={selectedPost.imageAlt} className="mt-12 aspect-[16/9] w-full rounded-[2rem] object-cover" />
                )}
              </section>
            ))}
            <div className="mt-12 flex flex-wrap gap-2 border-t border-stone pt-8">
              {selectedPost.keywords.slice(0, 5).map((k) => (
                <span key={k} className="rounded-full bg-linen px-4 py-1.5 text-xs text-muted">{k}</span>
              ))}
            </div>
            <Link href="/contact" className="btn-primary btn-sheen mt-10">Talk to a Designer <ArrowUpRight size={16} /></Link>
          </div>
        </article>
        <section className="bg-linen py-20 md:py-28">
          <div className="shell">
            <h2 className="display mb-10 text-4xl md:text-5xl">More from the Journal</h2>
            <div className="grid gap-6 md:grid-cols-3">
              {more.map((post) => <PostCard key={post.id} post={post} />)}
            </div>
          </div>
        </section>
      </div>
    );
  }

  const [featuredPost, ...posts] = blogPosts;

  return (
    <div className="bg-ivory">
      <PageHero
        crumb="Journal"
        eyebrow="The Bay Design Journal"
        title="Ideas for living beautifully in Florida"
        text="A considered edit of interior design inspiration, furniture knowledge, and Naples living from the team at Bay Design Store."
        image={pageImages.journal}
        height="short"
      />

      <section className="shell py-20 md:py-28">
        <Reveal>
          <Link href={`/blog/${featuredPost.id}`} className="group grid overflow-hidden rounded-[2rem] bg-linen lg:grid-cols-[1.2fr_1fr]">
            <div className="img-zoom aspect-[4/3] overflow-hidden lg:aspect-auto lg:min-h-[520px]">
              <img {...responsive(featuredPost.image, SIZES.half)} alt={featuredPost.imageAlt} className="h-full w-full object-cover" />
            </div>
            <div className="flex flex-col justify-between p-8 sm:p-12 lg:p-16">
              <div>
                <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-brass">
                  <span>{featuredPost.category}</span>
                  <span className="h-1 w-1 rounded-full bg-brass" />
                  <span>Featured</span>
                </div>
                <h2 className="display mt-6 text-[clamp(2rem,3.4vw,3.5rem)] transition-colors group-hover:text-brass">{featuredPost.title}</h2>
                <p className="mt-6 leading-relaxed text-muted">{featuredPost.excerpt}</p>
              </div>
              <div className="mt-12 flex items-center justify-between border-t border-stone pt-6">
                <span className="flex items-center gap-2 text-sm text-muted"><Calendar size={14} /> {featuredPost.date}</span>
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-ivory transition-transform duration-500 group-hover:rotate-45">
                  <ArrowUpRight size={18} />
                </span>
              </div>
            </div>
          </Link>
        </Reveal>

        <div className="mt-24 flex items-end justify-between gap-4">
          <div>
            <Reveal><p className="eyebrow">Fresh Perspective</p></Reveal>
            <SplitWords text="Latest from Bay Design" className="display mt-4 text-[clamp(2.2rem,4vw,4rem)]" />
          </div>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post, i) => (
            <Reveal key={post.id} delay={i * 0.1}>
              <PostCard post={post} />
            </Reveal>
          ))}
        </div>
      </section>

      <CTABanner />
    </div>
  );
}

function PostCard({ post }: { post: (typeof blogPosts)[number] }) {
  return (
    <Link href={`/blog/${post.id}`} className="group block h-full overflow-hidden rounded-3xl border border-stone/70 bg-ivory transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(30,28,25,0.35)]">
      <div className="img-zoom aspect-[4/3] overflow-hidden">
        <img {...responsive(post.image, SIZES.third)} alt={post.imageAlt} loading="lazy" className="h-full w-full object-cover" />
      </div>
      <div className="p-7">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="uppercase tracking-[0.18em] text-brass">{post.category}</span>
          <span className="text-muted">{post.date}</span>
        </div>
        <h3 className="display mt-4 text-2xl leading-snug">{post.title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-muted">{post.excerpt}</p>
        <span className="link-underline mt-6 text-sm font-medium">Read the story <ArrowRight size={15} /></span>
      </div>
    </Link>
  );
}
