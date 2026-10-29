'use client';

import { useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { ease } from './motion';
import { responsive, SIZES } from '@/lib/photos';

type PageHeroProps = {
  eyebrow: string;
  title: string;
  text?: string;
  image: string;
  crumb: string;
  children?: ReactNode;
  height?: 'tall' | 'short';
  /** Leave room for content that overlaps the bottom edge. */
  overlap?: boolean;
};

/** Full-bleed image header for inner pages, with parallax and masked title reveal. */
export default function PageHero({ eyebrow, title, text, image, crumb, children, height = 'tall', overlap = false }: PageHeroProps) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '25%']);
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section
      ref={ref}
      className={`relative w-full overflow-hidden bg-ink ${height === 'tall' ? 'h-[82svh] min-h-[560px]' : 'h-[62svh] min-h-[480px]'}`}
    >
      <motion.div style={{ y }} className="absolute inset-0">
        <motion.img
          {...responsive(image, SIZES.cover)}
          alt=""
          initial={{ scale: 1.2 }}
          animate={{ scale: 1.05 }}
          transition={{ duration: 2.2, ease }}
          className="h-full w-full object-cover"
        />
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/25 to-ink/40" />

      <motion.div
        style={{ opacity: fade }}
        className={`shell relative flex h-full flex-col justify-end ${overlap ? 'pb-24 md:pb-28' : 'pb-14 md:pb-20'}`}
      >
        <motion.nav
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="mb-6 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/70"
          aria-label="Breadcrumb"
        >
          <Link href="/" className="hover:text-white">Home</Link>
          <ChevronRight size={12} />
          <span className="text-white">{crumb}</span>
        </motion.nav>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.8, ease }}
          className="eyebrow !text-white/90"
        >
          {eyebrow}
        </motion.p>
        <h1 className="display mt-4 max-w-6xl text-[clamp(2.75rem,7vw,7.5rem)] text-white">
          {title.split(' ').map((word, i) => (
            <span key={i} className="inline-block overflow-hidden pb-[0.1em] align-top">
              <motion.span
                className="inline-block"
                initial={{ y: '105%' }}
                animate={{ y: '0%' }}
                transition={{ duration: 1, delay: 0.5 + i * 0.07, ease }}
              >
                {word}&nbsp;
              </motion.span>
            </span>
          ))}
        </h1>
        <div className="mt-6 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          {text && (
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.8, ease }}
              className="max-w-xl text-base leading-relaxed text-white/85 md:text-lg"
            >
              {text}
            </motion.p>
          )}
          {children}
        </div>
      </motion.div>
    </section>
  );
}
