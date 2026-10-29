'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Maximize2, X } from 'lucide-react';
import { pageImages, portfolioItems } from '@/data/siteData';
import PageHero from '@/components/PageHero';
import CTABanner from '@/components/CTABanner';
import { ease } from '@/components/motion';
import { responsive, SIZES } from '@/lib/photos';

const categories = ['All', ...Array.from(new Set(portfolioItems.map((p) => p.category)))];
const aspects = ['aspect-[4/5]', 'aspect-[4/3]', 'aspect-[3/4]', 'aspect-square', 'aspect-[4/3]', 'aspect-[4/5]'];

export default function Portfolio() {
  const [active, setActive] = useState('All');
  const [lightbox, setLightbox] = useState<number | null>(null);
  const filtered = active === 'All' ? portfolioItems : portfolioItems.filter((p) => p.category === active);

  const step = useCallback(
    (dir: number) => setLightbox((i) => (i === null ? i : (i + dir + filtered.length) % filtered.length)),
    [filtered.length],
  );

  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [lightbox, step]);

  const current = lightbox !== null ? filtered[lightbox] : null;

  return (
    <div className="bg-ivory">
      <PageHero
        crumb="Portfolio"
        eyebrow="Our Design Portfolio"
        title="Elegant & relaxed rooms"
        text="Our designers create elegant and relaxed rooms for the places you live. Explore a selection of our home interior design."
        image={pageImages.portfolio}
      />

      <section className="shell py-16 md:py-24">
        <div className="mb-12 flex flex-wrap items-center justify-between gap-6">
          <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-full border border-stone/70 bg-linen p-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActive(cat)}
                className={`relative whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-medium transition-colors ${active === cat ? 'text-ivory' : 'text-ink/70 hover:text-ink'}`}
              >
                {active === cat && <motion.span layoutId="portfolio-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                <span className="relative">{cat}</span>
              </button>
            ))}
          </div>
          <p className="text-sm text-muted">{filtered.length} projects · click any image to view full screen</p>
        </div>

        <motion.div layout className="columns-1 gap-5 sm:columns-2 lg:columns-3 2xl:columns-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((item, i) => (
              <motion.button
                key={item.id}
                layout
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.7, delay: (i % 4) * 0.06, ease }}
                onClick={() => setLightbox(i)}
                className={`img-zoom group relative mb-5 block w-full break-inside-avoid overflow-hidden rounded-3xl bg-sand text-left ${aspects[i % aspects.length]}`}
              >
                <img {...responsive(item.image, SIZES.third)} alt={item.title} loading="lazy" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/75 via-transparent to-transparent opacity-70 transition-opacity duration-500 group-hover:opacity-100" />
                <span className="glass absolute right-4 top-4 flex h-10 w-10 scale-75 items-center justify-center rounded-full opacity-0 transition-all duration-500 group-hover:scale-100 group-hover:opacity-100">
                  <Maximize2 size={15} />
                </span>
                <div className="absolute inset-x-6 bottom-6 text-white">
                  <p className="text-[0.65rem] uppercase tracking-[0.22em] text-white/75">{item.category} · {item.location}</p>
                  <h3 className="display mt-1 text-2xl md:text-3xl">{item.title}</h3>
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        </motion.div>
      </section>

      <CTABanner title="Imagine your home in our portfolio" />

      <AnimatePresence>
        {current && lightbox !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex flex-col bg-ink/95 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label={current.title}
          >
            <div className="flex items-center justify-between px-5 py-5 text-white md:px-10">
              <div>
                <p className="text-[0.65rem] uppercase tracking-[0.22em] text-white/60">{current.category} · {current.location}</p>
                <p className="font-display text-2xl">{current.title}</p>
              </div>
              <div className="flex items-center gap-5">
                <span className="font-display text-lg">{lightbox + 1} <span className="text-white/40">/ {filtered.length}</span></span>
                <button onClick={() => setLightbox(null)} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 hover:bg-white hover:text-ink" aria-label="Close">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 md:px-24">
              <AnimatePresence mode="wait">
                <motion.img
                  key={current.id}
                  {...responsive(current.image)}
                  alt={current.title}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.02 }}
                  transition={{ duration: 0.45, ease }}
                  className="max-h-full max-w-full rounded-2xl object-contain"
                />
              </AnimatePresence>
              <button onClick={() => step(-1)} className="glass-dark absolute left-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/25 text-white hover:bg-white hover:text-ink md:left-8 md:h-14 md:w-14" aria-label="Previous image">
                <ArrowLeft size={20} />
              </button>
              <button onClick={() => step(1)} className="glass-dark absolute right-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/25 text-white hover:bg-white hover:text-ink md:right-8 md:h-14 md:w-14" aria-label="Next image">
                <ArrowRight size={20} />
              </button>
            </div>
            <div className="no-scrollbar flex justify-center gap-2 overflow-x-auto px-5 py-5">
              {filtered.map((item, i) => (
                <button
                  key={item.id}
                  onClick={() => setLightbox(i)}
                  className={`h-14 w-20 flex-none overflow-hidden rounded-lg transition-all ${i === lightbox ? 'opacity-100 ring-2 ring-brass-light' : 'opacity-40 hover:opacity-80'}`}
                  aria-label={`View ${item.title}`}
                >
                  <img {...responsive(item.image, SIZES.tiny)} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
