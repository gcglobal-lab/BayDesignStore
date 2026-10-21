'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, ArrowUpRight, Pause, Play } from 'lucide-react';
import { heroSlides, type HeroSlide } from '@/data/siteData';
import { ease } from './motion';

const IMAGE_MS = 7000;
const VIDEO_MS = 10000;

type Renditions = NonNullable<HeroSlide['video']>;

/**
 * Sharpest rendition the screen can actually show. Phones and tablets always get 1080p: decoding
 * 1440p/4K there can stall playback or make the browser drop images to free memory.
 */
function pickRendition(video: Renditions) {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return video.hd;
  if (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 1024) return video.hd;
  const px = window.innerWidth * Math.min(window.devicePixelRatio || 1, 2);
  if (px > 3200 && video.uhd) return video.uhd;
  if (px > 2000) return video.qhd;
  return video.hd;
}

const FADE_MS = 1200;
/** How long to wait for the next video to start before showing its poster instead. */
const READY_TIMEOUT_MS = 3000;

/**
 * One slide's background. Every slide keeps its own layer mounted so switching is just an opacity
 * crossfade (handled by the GPU) — no clip-path repaints over a playing video. Only the slides
 * around the current one are loaded; the next one buffers in the background so it is already
 * playing when it fades in.
 */
function SlideLayer({
  slide,
  src,
  load,
  play,
  shown,
  leaving,
  priority = false,
  onReady,
}: {
  slide: HeroSlide;
  src?: string;
  load: boolean;
  play: boolean;
  shown: boolean;
  leaving: boolean;
  /** The opening slide: its poster is fetched before anything else on the page. */
  priority?: boolean;
  onReady: (ready: boolean) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  // Release the download and decoder of slides that are no longer nearby.
  useEffect(() => {
    const v = ref.current;
    if (v && !load && v.networkState !== v.NETWORK_EMPTY) v.load();
  }, [load]);

  // React sets `muted` only as a property and browsers may skip autoplay for videos added after a
  // client-side navigation, so start playback by hand — and again after the back/forward cache or a hidden tab.
  useEffect(() => {
    const v = ref.current;
    if (!v || !load || !src) return;
    v.muted = true;
    v.defaultMuted = true;
    if (!play) {
      v.pause();
      return;
    }
    const start = () => {
      if (document.visibilityState === 'visible' && v.paused) v.play().catch(() => {});
    };
    start();
    v.addEventListener('canplay', start);
    window.addEventListener('pageshow', start);
    document.addEventListener('visibilitychange', start);
    return () => {
      v.removeEventListener('canplay', start);
      window.removeEventListener('pageshow', start);
      document.removeEventListener('visibilitychange', start);
    };
  }, [load, play, src]);

  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 ${
        shown ? 'z-[2] opacity-100 transition-opacity duration-[1200ms] ease-out' : leaving ? 'z-[1] opacity-100' : 'z-0 opacity-0'
      }`}
    >
      {load && (
        <img
          src={slide.poster}
          alt=""
          fetchPriority={priority ? 'high' : 'auto'}
          decoding={priority ? 'sync' : 'async'}
          className={`absolute inset-0 h-full w-full object-cover ${!slide.video && (shown || leaving) ? 'animate-kenburns' : ''}`}
        />
      )}
      {slide.video && (
        <video
          ref={ref}
          // Fades over the poster only when it starts on screen (first load); a video buffered off screen just appears.
          className={`absolute inset-0 h-full w-full object-cover ${shown ? 'transition-opacity duration-700' : ''} ${started ? 'opacity-100' : 'opacity-0'}`}
          src={load ? src : undefined}
          muted
          loop
          playsInline
          preload="auto"
          onPlaying={() => {
            setStarted(true);
            onReady(true);
          }}
          onEmptied={() => {
            setStarted(false);
            onReady(false);
          }}
        />
      )}
    </div>
  );
}

export default function HeroSlider() {
  /** The slide asked for (arrows, dots, timer) and the slide on screen, which waits until its video plays. */
  const [target, setTarget] = useState(0);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [ready, setReady] = useState<Record<number, boolean>>({});
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  // The rendition depends on the screen, so it is only chosen in the browser (the poster shows until then).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const sources = useMemo(() => (mounted ? heroSlides.map((s) => (s.video ? pickRendition(s.video) : undefined)) : []), [mounted]);
  const n = heroSlides.length;
  const slide = heroSlides[index];
  const next = heroSlides[(index + 1) % n];
  const duration = slide.video ? VIDEO_MS : IMAGE_MS;

  const go = useCallback((dir: number) => setTarget((t) => (t + dir + n) % n), [n]);
  const goTo = (i: number) => setTarget(i);

  // Switch once the requested slide's video is actually playing (or after a short timeout).
  useEffect(() => {
    if (target === index) return;
    const reveal = () => {
      setLeaving(index);
      setIndex(target);
    };
    const waitForVideo = mounted && heroSlides[target].video && !ready[target];
    const id = window.setTimeout(reveal, waitForVideo ? READY_TIMEOUT_MS : 0);
    return () => window.clearTimeout(id);
  }, [target, index, ready, mounted]);

  // The previous slide stays underneath until the new one has fully faded in.
  useEffect(() => {
    if (leaving === null) return;
    const id = window.setTimeout(() => setLeaving(null), FADE_MS + 100);
    return () => window.clearTimeout(id);
  }, [leaving, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (window.scrollY > window.innerHeight * 0.6) return;
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const near = (i: number) => i === index || i === target || i === leaving || i === (index + 1) % n || i === (target + 1) % n;

  return (
    <section
      className="relative h-[100svh] min-h-[640px] w-full overflow-hidden bg-ink"
      aria-roledescription="carousel"
      aria-label="Featured interiors"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      {heroSlides.map((s, i) => (
        <SlideLayer
          key={s.id}
          slide={s}
          src={sources[i]}
          load={near(i)}
          play={i === index || i === target || i === leaving}
          shown={i === index}
          leaving={i === leaving}
          priority={i === 0}
          onReady={(r) => setReady((prev) => (prev[i] === r ? prev : { ...prev, [i]: r }))}
        />
      ))}
      <div className="pointer-events-none absolute inset-0 z-[3] bg-gradient-to-r from-ink/70 via-ink/25 to-transparent" />
      <div className="pointer-events-none absolute inset-0 z-[3] bg-gradient-to-t from-ink/70 via-transparent to-ink/30" />

      {/* Copy */}
      <div className="shell relative z-10 flex h-full flex-col justify-end pb-44 pt-32 sm:pb-48 lg:pb-52">
        <AnimatePresence mode="wait">
          <motion.div key={slide.id} className="max-w-[min(62rem,100%)]" initial="hidden" animate="show" exit="exit">
            <motion.p
              variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10, transition: { duration: 0.35 } } }}
              transition={{ duration: 0.7, delay: 0.5, ease }}
              className="eyebrow !text-brass-light"
            >
              {slide.eyebrow}
            </motion.p>
            <h1 className="display mt-5 text-[clamp(2.6rem,6.4vw,6.8rem)] text-white">
              {slide.title.split(' ').map((word, i) => (
                <span key={i} className="inline-block overflow-hidden pb-[0.1em] align-top">
                  <motion.span
                    className="inline-block"
                    variants={{ hidden: { y: '105%' }, show: { y: '0%' }, exit: { y: '-105%', transition: { duration: 0.45, ease } } }}
                    transition={{ duration: 0.9, delay: 0.55 + i * 0.05, ease }}
                  >
                    {word}&nbsp;
                  </motion.span>
                </span>
              ))}
            </h1>
            <motion.p
              variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 }, exit: { opacity: 0, transition: { duration: 0.3 } } }}
              transition={{ duration: 0.8, delay: 0.9, ease }}
              className="mt-6 max-w-xl text-base leading-relaxed text-white/85 md:text-lg"
            >
              {slide.text}
            </motion.p>
            <motion.div
              variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 }, exit: { opacity: 0, transition: { duration: 0.3 } } }}
              transition={{ duration: 0.8, delay: 1.05, ease }}
              className="mt-9 flex flex-wrap items-center gap-4"
            >
              <Link href={slide.cta.to} className="btn-primary btn-light">
                {slide.cta.label} <ArrowUpRight size={16} />
              </Link>
              <Link href="/contact" className="link-underline text-sm font-medium text-white">
                Schedule a consultation
              </Link>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="shell absolute inset-x-0 bottom-0 z-20 pb-8 md:pb-10">
        <div className="flex items-end justify-between gap-6">
          <div className="flex min-w-0 flex-1 items-end gap-3 sm:gap-4">
            {heroSlides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => goTo(i)}
                className="group min-w-0 flex-1 text-left md:max-w-[9.5rem]"
                aria-label={`Go to slide ${i + 1}: ${s.title}`}
                aria-current={i === index}
              >
                <span className={`mb-2 hidden font-sans text-[0.7rem] tracking-[0.2em] transition-colors md:block ${i === index ? 'text-white' : 'text-white/50 group-hover:text-white/80'}`}>
                  0{i + 1}
                </span>
                <span className="relative block h-[2px] overflow-hidden rounded-full bg-white/25">
                  {i < index && <span className="absolute inset-0 bg-white/70" />}
                  {i === index && (
                    <span
                      key={`${s.id}-${index}`}
                      className="absolute inset-0 origin-left animate-progress bg-white"
                      style={{ animationDuration: `${duration}ms`, animationPlayState: paused ? 'paused' : 'running' }}
                      onAnimationEnd={() => go(1)}
                    />
                  )}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-none items-center gap-3">
            <button
              onClick={() => setPaused((p) => !p)}
              className="glass-dark hidden h-12 w-12 items-center justify-center rounded-full border border-white/25 text-white transition-colors hover:bg-white hover:text-ink sm:flex"
              aria-label={paused ? 'Play slideshow' : 'Pause slideshow'}
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <button
              onClick={() => go(-1)}
              className="glass-dark flex h-12 w-12 items-center justify-center rounded-full border border-white/25 text-white transition-all duration-300 hover:scale-105 hover:bg-white hover:text-ink md:h-14 md:w-14"
              aria-label="Previous slide"
            >
              <ArrowLeft size={18} />
            </button>
            <button
              onClick={() => go(1)}
              className="glass-dark flex h-12 w-12 items-center justify-center rounded-full border border-white/25 text-white transition-all duration-300 hover:scale-105 hover:bg-white hover:text-ink md:h-14 md:w-14"
              aria-label="Next slide"
            >
              <ArrowRight size={18} />
            </button>

            {/* Next-slide preview */}
            <button
              onClick={() => go(1)}
              className="glass-dark group hidden items-center gap-4 rounded-2xl border border-white/20 p-2 pr-5 text-left text-white xl:flex"
              aria-label="Next slide preview"
            >
              <span className="relative h-16 w-24 overflow-hidden rounded-xl">
                <AnimatePresence mode="popLayout">
                  <motion.img
                    key={next.id}
                    src={next.poster}
                    alt=""
                    initial={{ opacity: 0, scale: 1.2 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8, ease }}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                </AnimatePresence>
              </span>
              <span className="w-40">
                <span className="block text-[0.65rem] uppercase tracking-[0.22em] text-white/60">Up next</span>
                <span className="mt-1 line-clamp-2 block font-display text-lg leading-tight">{next.title}</span>
              </span>
            </button>
          </div>
        </div>

        <div className="mt-5 hidden items-center gap-3 text-[0.7rem] uppercase tracking-[0.25em] text-white/60 md:flex">
          <span className="relative block h-8 w-5 rounded-full border border-white/40">
            <span className="absolute left-1/2 top-1.5 h-1.5 w-1 -translate-x-1/2 animate-scroll-dot rounded-full bg-white" />
          </span>
          Scroll to explore
          <span className="ml-auto font-display text-base normal-case tracking-normal text-white">
            <span className="text-2xl">{String(index + 1).padStart(2, '0')}</span>
            <span className="mx-2 text-white/50">/</span>
            {String(heroSlides.length).padStart(2, '0')}
          </span>
        </div>
      </div>
    </section>
  );
}
