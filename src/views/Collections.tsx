'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, Eye, X } from 'lucide-react';
import { collections, pageImages, type Product } from '@/data/siteData';
import PageHero from '@/components/PageHero';
import CTABanner from '@/components/CTABanner';
import { ease } from '@/components/motion';
import { responsive, SIZES } from '@/lib/photos';

const categories = ['All', ...Array.from(new Set(collections.map((p) => p.category)))];

export default function Collections() {
  const [active, setActive] = useState('All');
  const [quickView, setQuickView] = useState<Product | null>(null);
  const filtered = active === 'All' ? collections : collections.filter((p) => p.category === active);

  useEffect(() => {
    if (!quickView) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setQuickView(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quickView]);

  return (
    <div className="bg-ivory">
      <PageHero
        crumb="Collections"
        eyebrow="Curated by Susan Bay"
        title="The Collection"
        text="An extensive, ever-changing collection of stunning home furnishings — hand-selected to complement the casual, yet elegant Naples lifestyle."
        image={pageImages.collections}
        height="short"
      />

      <div className="sticky top-[5.25rem] z-30 py-4">
        <div className="shell">
          <div className="glass no-scrollbar mx-auto flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-stone/70 p-1.5 shadow-[0_10px_30px_-15px_rgba(30,28,25,0.3)]">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActive(cat)}
                className={`relative whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-medium transition-colors duration-300 ${active === cat ? 'text-ivory' : 'text-ink/70 hover:text-ink'}`}
              >
                {active === cat && (
                  <motion.span layoutId="collection-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                )}
                <span className="relative">{cat}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="shell pb-24 pt-8 md:pb-32">
        <p className="mb-8 text-sm text-muted">
          Showing <span className="font-medium text-ink">{filtered.length}</span> pieces{active !== 'All' && <> in <span className="font-medium text-ink">{active}</span></>}
        </p>
        <motion.div layout className="grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((p, i) => (
              <motion.article
                key={p.id}
                layout
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.6, delay: i * 0.04, ease }}
                className="group"
              >
                <div className="img-zoom relative aspect-[4/5] overflow-hidden rounded-3xl bg-sand">
                  <img {...responsive(p.image, SIZES.third)} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                  <span className="glass absolute left-4 top-4 rounded-full px-3 py-1 text-[0.65rem] font-medium uppercase tracking-[0.18em]">{p.category}</span>
                  <div className="absolute inset-x-4 bottom-4 flex translate-y-4 gap-2 opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
                    <button onClick={() => setQuickView(p)} className="glass flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-sm font-medium text-ink">
                      <Eye size={15} /> Quick view
                    </button>
                    <Link href="/contact" className="flex flex-1 items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm font-medium text-ivory">
                      Enquire <ArrowUpRight size={15} />
                    </Link>
                  </div>
                </div>
                <div className="mt-5 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-display text-2xl leading-tight">{p.name}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{p.description}</p>
                  </div>
                  <span className="whitespace-nowrap font-medium text-brass">{p.price}</span>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </motion.div>
      </section>

      <CTABanner title="Can’t find the perfect piece? We’ll custom-order it." text="We stock many styles of sofas, chairs, consoles, cabinets, tables, fabrics and pillows — experience them in person, then customize fabric and finish." />

      <AnimatePresence>
        {quickView && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm"
            onClick={() => setQuickView(null)}
            role="dialog"
            aria-modal="true"
            aria-label={quickView.name}
          >
            <motion.div
              initial={{ y: 40, scale: 0.96, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.5, ease }}
              onClick={(e) => e.stopPropagation()}
              className="relative grid max-h-[90vh] w-full max-w-5xl overflow-auto rounded-[2rem] bg-ivory md:grid-cols-2"
            >
              <img {...responsive(quickView.image, SIZES.half)} alt={quickView.name} className="aspect-square h-full w-full object-cover md:aspect-auto" />
              <div className="flex flex-col justify-center p-8 md:p-12">
                <p className="eyebrow">{quickView.category}</p>
                <h2 className="display mt-4 text-4xl md:text-5xl">{quickView.name}</h2>
                <p className="mt-4 font-display text-3xl text-brass">{quickView.price}</p>
                <p className="mt-6 leading-relaxed text-muted">{quickView.description}</p>
                <ul className="mt-6 space-y-2 text-sm text-muted">
                  <li>· Available to view in our Downtown showroom</li>
                  <li>· Custom fabric &amp; finish options</li>
                  <li>· White glove delivery &amp; installation</li>
                </ul>
                <Link href="/contact" className="btn-primary mt-10 self-start">
                  Enquire About This Piece <ArrowUpRight size={16} />
                </Link>
              </div>
              <button
                onClick={() => setQuickView(null)}
                className="glass absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
