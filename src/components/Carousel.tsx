'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { ease } from './motion';

type Breakpoints = { base: number; sm: number; lg: number; xxl: number };

function usePerView({ base, sm, lg, xxl }: Breakpoints) {
  const get = (w: number) => {
    if (w >= 1536) return xxl;
    if (w >= 1024) return lg;
    if (w >= 640) return sm;
    return base;
  };
  // Start from the same width the server renders with, then measure after hydration
  const [perView, setPerView] = useState(() => get(1280));
  useEffect(() => {
    const onResize = () => setPerView(get(window.innerWidth));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, sm, lg, xxl]);
  return perView;
}

type CarouselProps<T> = {
  items: T[];
  renderItem: (item: T, i: number, active: boolean) => ReactNode;
  perView?: Breakpoints;
  interval?: number;
  gap?: number;
  tone?: 'light' | 'dark';
  label: string;
};

export default function Carousel<T>({
  items,
  renderItem,
  perView: bp = { base: 1.12, sm: 2.1, lg: 3.15, xxl: 4.1 },
  interval = 4500,
  gap = 20,
  tone = 'light',
  label,
}: CarouselProps<T>) {
  const perView = usePerView(bp);
  const maxIndex = Math.max(0, Math.ceil(items.length - perView));
  const [index, setIndex] = useState(0);
  const [hovering, setHovering] = useState(false);

  const go = useCallback(
    (dir: number) => setIndex((i) => (i + dir > maxIndex ? 0 : i + dir < 0 ? maxIndex : i + dir)),
    [maxIndex],
  );

  useEffect(() => {
    if (hovering) return;
    const id = window.setTimeout(() => go(1), interval);
    return () => window.clearTimeout(id);
  }, [index, hovering, go, interval]);

  const step = 100 / perView;
  const offset = Math.min(index * step, Math.max(0, (items.length - perView) * step));
  const btn =
    tone === 'light'
      ? 'border-ink/15 text-ink hover:bg-ink hover:text-ivory hover:border-ink'
      : 'border-white/30 text-white hover:bg-white hover:text-ink';

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      aria-roledescription="carousel"
      aria-label={label}
    >
      <motion.div
        className="overflow-hidden touch-pan-y"
        onPanEnd={(_, info) => {
          if (Math.abs(info.offset.x) > 50) go(info.offset.x < 0 ? 1 : -1);
        }}
      >
        <motion.div
          className="flex"
          style={{ marginRight: -gap }}
          animate={{ x: `-${offset}%` }}
          transition={{ duration: 1, ease }}
        >
          {items.map((item, i) => (
            <div key={i} className="flex-none" style={{ width: `${100 / perView}%`, paddingRight: gap }}>
              {renderItem(item, i, i >= index && i < index + perView)}
            </div>
          ))}
        </motion.div>
      </motion.div>

      <div className="mt-8 flex items-center gap-6">
        <span className={`font-display text-xl ${tone === 'light' ? 'text-ink' : 'text-white'}`}>
          {String(index + 1).padStart(2, '0')}
          <span className="mx-2 opacity-40">/</span>
          <span className="opacity-60">{String(maxIndex + 1).padStart(2, '0')}</span>
        </span>
        <div className={`relative h-px flex-1 ${tone === 'light' ? 'bg-ink/15' : 'bg-white/20'}`}>
          <motion.div
            className={`absolute inset-y-0 left-0 -top-px h-[3px] origin-left ${tone === 'light' ? 'bg-brass' : 'bg-white'}`}
            animate={{ width: `${((index + 1) / (maxIndex + 1)) * 100}%` }}
            transition={{ duration: 0.8, ease }}
          />
        </div>
        <div className="flex gap-3">
          <button onClick={() => go(-1)} aria-label="Previous" className={`flex h-12 w-12 items-center justify-center rounded-full border transition-all duration-300 hover:scale-105 ${btn}`}>
            <ArrowLeft size={18} />
          </button>
          <button onClick={() => go(1)} aria-label="Next" className={`flex h-12 w-12 items-center justify-center rounded-full border transition-all duration-300 hover:scale-105 ${btn}`}>
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
