'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { ArrowRight, ArrowUpRight, ChevronDown, Clock, MapPin, Phone } from 'lucide-react';
import { companyInfo, navLinks, pageImages, portfolioItems, roomCategories, services } from '@/data/siteData';
import Logo from './Logo';

const ease = [0.22, 1, 0.36, 1] as const;
const megaPaths = ['/collections', '/services', '/portfolio'];

/** Label that rolls up on hover, replaced by an identical copy from below. */
function RollText({ children }: { children: string }) {
  return (
    <span className="relative block overflow-hidden">
      <span className="block transition-transform duration-500 ease-lux group-hover:-translate-y-full">{children}</span>
      <span className="absolute inset-0 block translate-y-full transition-transform duration-500 ease-lux group-hover:translate-y-0" aria-hidden="true">
        {children}
      </span>
    </span>
  );
}

function MegaPanel({ path, onNavigate }: { path: string; onNavigate: () => void }) {
  const [preview, setPreview] = useState(0);
  const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

  const intro = (eyebrow: string, title: string, text: string, to: string, label: string) => (
    <motion.div variants={item} className="flex flex-col justify-between pr-4">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h3 className="display mt-4 text-4xl xl:text-5xl">{title}</h3>
        <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">{text}</p>
      </div>
      <Link href={to} onClick={onNavigate} className="btn-primary btn-sheen mt-8 self-start !py-3">
        {label} <ArrowUpRight size={15} />
      </Link>
    </motion.div>
  );

  return (
    <motion.div
      initial="hidden"
      animate="show"
      transition={{ staggerChildren: 0.05, delayChildren: 0.08 }}
      className="grid grid-cols-[minmax(240px,1fr)_3fr] gap-8 p-8 xl:p-10"
    >
      {path === '/collections' && (
        <>
          {intro('The Collection', 'Shop by room', 'Hand-selected furnishings, lighting and art — many pieces ready for same-day delivery.', '/collections', 'View all pieces')}
          <div className="grid grid-cols-5 gap-4">
            {roomCategories.map((cat) => (
              <motion.div key={cat.name} variants={item}>
                <Link href="/collections" onClick={onNavigate} className="group/card block">
                  <div className="aspect-[3/4] overflow-hidden rounded-2xl bg-sand">
                    <img src={cat.image} alt="" className="h-full w-full object-cover transition-transform duration-700 ease-lux group-hover/card:scale-110" />
                  </div>
                  <p className="mt-3 flex items-center justify-between font-display text-xl">
                    {cat.name}
                    <ArrowRight size={15} className="-translate-x-2 opacity-0 transition-all duration-500 group-hover/card:translate-x-0 group-hover/card:opacity-100" />
                  </p>
                  <p className="text-[0.62rem] uppercase tracking-[0.18em] text-muted">{cat.count}</p>
                </Link>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {path === '/services' && (
        <>
          {intro('What We Offer', 'Design services', 'From a complimentary in-home consultation to full-service design and white-glove delivery.', '/services', 'All services')}
          <div className="grid grid-cols-[1.1fr_1fr] gap-8">
            <ul className="divide-y divide-stone/70">
              {services.map((s, i) => (
                <motion.li key={s.id} variants={item} onMouseEnter={() => setPreview(i)}>
                  <Link
                    href={`/services#${s.id}`}
                    onClick={onNavigate}
                    className={`flex items-center gap-5 py-3.5 transition-all duration-300 ${preview === i ? 'pl-2 text-ink' : 'text-ink/60'}`}
                  >
                    <span className="font-display text-sm text-brass">0{i + 1}</span>
                    <span className="flex-1 font-display text-2xl">{s.title}</span>
                    <ArrowUpRight size={16} className={`transition-all duration-300 ${preview === i ? 'opacity-100' : 'opacity-0'}`} />
                  </Link>
                </motion.li>
              ))}
            </ul>
            <motion.div variants={item} className="relative overflow-hidden rounded-2xl bg-sand">
              <AnimatePresence mode="popLayout">
                <motion.img
                  key={services[preview].id}
                  src={services[preview].image}
                  alt=""
                  initial={{ opacity: 0, scale: 1.1 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.7, ease }}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </AnimatePresence>
              <div className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent" />
              <p className="absolute inset-x-6 bottom-6 line-clamp-3 text-sm leading-relaxed text-white/90">{services[preview].description}</p>
            </motion.div>
          </div>
        </>
      )}

      {path === '/portfolio' && (
        <>
          {intro('Our Work', 'Design portfolio', 'Elegant and relaxed rooms for the places you live — across Naples and Southwest Florida.', '/portfolio', 'Explore projects')}
          <div className="grid grid-cols-4 gap-4">
            {portfolioItems.slice(0, 4).map((p) => (
              <motion.div key={p.id} variants={item}>
                <Link href="/portfolio" onClick={onNavigate} className="group/card relative block aspect-[4/5] overflow-hidden rounded-2xl bg-sand">
                  <img src={p.image} alt="" className="h-full w-full object-cover transition-transform duration-700 ease-lux group-hover/card:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
                  <div className="absolute inset-x-4 bottom-4 text-white">
                    <p className="text-[0.6rem] uppercase tracking-[0.2em] text-white/70">{p.category}</p>
                    <p className="font-display text-xl leading-tight">{p.title}</p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}

export default function Navbar() {
  const pathname = usePathname() ?? '/';
  const { scrollY } = useScroll();
  const [atTop, setAtTop] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  useMotionValueEvent(scrollY, 'change', (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setAtTop(y < 60);
    setHidden(y > prev && y > 420);
    if (Math.abs(y - prev) > 4) setHovered(null);
  });

  useEffect(() => {
    setOpen(false);
    setHovered(null);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const isActive = (path: string) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path);
  const light = atTop && !open;
  const mega = hovered && megaPaths.includes(hovered) ? hovered : null;

  return (
    <>
      <motion.header
        initial={{ y: -120 }}
        animate={{ y: hidden && !open ? -140 : 0 }}
        transition={{ duration: 0.6, ease }}
        className="fixed inset-x-0 top-0 z-50"
        onMouseLeave={() => setHovered(null)}
      >
        {/* Soft shade behind the transparent bar so it reads over bright video frames */}
        <motion.div
          animate={{ opacity: light ? 1 : 0 }}
          className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-ink/55 via-ink/20 to-transparent"
        />

        {/* Utility bar — only at the very top on desktop */}
        <motion.div
          animate={{ height: light ? 'auto' : 0, opacity: light ? 1 : 0 }}
          transition={{ duration: 0.4, ease }}
          className="relative hidden overflow-hidden lg:block"
        >
          <div className="shell flex items-center justify-between py-2.5 text-[0.72rem] font-medium uppercase tracking-[0.14em] text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.45)]">
            <div className="flex items-center gap-3">
              <a
                href="https://maps.google.com/?q=326+13th+Avenue+South+Naples+FL+34102"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.08] py-1 pl-1 pr-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-brass-light/60 hover:bg-white/15"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brass-light text-ink transition-transform duration-500 group-hover:scale-110">
                  <MapPin size={12} />
                </span>
                {companyInfo.address}
              </a>
              <span className="flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.08] py-1 pl-1 pr-4 backdrop-blur-md">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brass-light text-ink">
                  <Clock size={12} />
                </span>
                Open 7 days <span className="text-brass-light">·</span> Downtown Showroom
              </span>
            </div>
            <div className="flex items-center gap-3">
              <a
                href={`tel:${companyInfo.phone}`}
                className="group flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.08] py-1 pl-1 pr-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-brass-light/60 hover:bg-white/15"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brass-light text-ink transition-transform duration-500 group-hover:rotate-12">
                  <Phone size={12} />
                </span>
                {companyInfo.phone}
              </a>
              <a
                href="/base"
                className="btn-sheen group relative flex items-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-brass-light to-brass px-5 py-1.5 font-semibold text-ink shadow-[0_6px_20px_-6px_rgba(201,168,116,0.8)] transition-all duration-300 [text-shadow:none] hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-6px_rgba(201,168,116,0.95)]"
              >
                Bay Design Base
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-brass-light transition-transform duration-500 group-hover:rotate-45">
                  <ArrowUpRight size={11} />
                </span>
              </a>
            </div>
          </div>
          <div className="shell"><div className="h-px bg-gradient-to-r from-transparent via-brass-light/60 to-transparent" /></div>
        </motion.div>

        <motion.nav
          layout
          transition={{ duration: 0.6, ease }}
          className={
            light
              ? 'shell relative flex items-center justify-between py-4'
              : 'relative mx-auto mt-3 flex w-[calc(100%-1.5rem)] max-w-[1480px] items-center justify-between rounded-full border border-stone/60 bg-ivory py-2.5 pl-4 pr-2.5 shadow-[0_10px_40px_-12px_rgba(30,28,25,0.25)] sm:pl-6'
          }
        >
          <Link href="/" className="group relative z-[70]" aria-label="Bay Design Store — home">
            <Logo tone={light ? 'light' : 'dark'} size={light ? 'md' : 'sm'} tagline={light} />
          </Link>

          <ul
            className={`hidden items-center gap-0.5 rounded-full p-1.5 transition-all duration-700 xl:flex ${
              light ? 'border border-white/20 bg-white/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-md' : ''
            }`}
          >
            {navLinks.map((link) => {
              const isHovered = hovered === link.path;
              const hasMega = megaPaths.includes(link.path);
              return (
                <li key={link.path} className="relative" onMouseEnter={() => setHovered(link.path)}>
                  {isHovered && (
                    <motion.span
                      layoutId="nav-hover"
                      transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                      className={`absolute inset-0 rounded-full ${light ? 'bg-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.45)]' : 'bg-ink'}`}
                    />
                  )}
                  <Link
                    href={link.path}
                    onFocus={() => setHovered(link.path)}
                    aria-haspopup={hasMega || undefined}
                    aria-expanded={hasMega ? isHovered : undefined}
                    className={`group relative flex items-center gap-1.5 px-3 py-2.5 text-[0.7rem] font-medium uppercase tracking-[0.14em] transition-colors duration-300 2xl:px-5 2xl:tracking-[0.18em] ${
                      isHovered ? (light ? 'text-ink' : 'text-ivory') : light ? 'text-white' : 'text-ink'
                    }`}
                  >
                    <RollText>{link.label}</RollText>
                    {hasMega && <ChevronDown size={12} className={`transition-transform duration-500 ${isHovered ? 'rotate-180' : ''}`} />}
                    {isActive(link.path) && !isHovered && (
                      <motion.span layoutId="nav-active" className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-brass-light" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center gap-2">
            <a
              href={`tel:${companyInfo.phone}`}
              aria-label="Call Bay Design Store"
              className={`group hidden h-11 w-11 items-center justify-center rounded-full border transition-all duration-500 sm:flex xl:hidden 2xl:flex ${
                light ? 'border-white/30 bg-white/[0.07] text-white backdrop-blur-md hover:bg-white hover:text-ink' : 'border-ink/10 text-ink hover:bg-ink hover:text-ivory'
              }`}
            >
              <Phone size={16} className="transition-transform duration-500 group-hover:rotate-12" />
            </a>
            <Link href="/contact" className={`btn-primary btn-sheen hidden !py-3 sm:inline-flex ${light ? 'btn-light' : ''}`}>
              Book a Visit <ArrowUpRight size={16} />
            </Link>
            <button
              onClick={() => setOpen((o) => !o)}
              className={`relative z-[70] flex h-11 w-11 items-center justify-center rounded-full xl:hidden ${
                light ? 'border border-white/25 bg-white/15 text-white backdrop-blur-md' : 'bg-ink text-ivory'
              }`}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
            >
              <span className="relative block h-3 w-5">
                <motion.span animate={open ? { rotate: 45, y: 5 } : { rotate: 0, y: 0 }} className="absolute left-0 top-0 h-[1.5px] w-full bg-current" />
                <motion.span animate={open ? { rotate: -45, y: -5 } : { rotate: 0, y: 0 }} className="absolute bottom-0 left-0 h-[1.5px] w-full bg-current" />
              </span>
            </button>
          </div>
        </motion.nav>

        {/* Mega menu */}
        <AnimatePresence>
          {mega && (
            <motion.div
              key="mega"
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99, transition: { duration: 0.25 } }}
              transition={{ duration: 0.45, ease }}
              className="absolute inset-x-0 top-full hidden pt-3 xl:block"
            >
              <div className="mx-auto w-[calc(100%-1.5rem)] max-w-[1480px] overflow-hidden rounded-[2rem] border border-stone/60 bg-ivory shadow-[0_40px_80px_-30px_rgba(30,28,25,0.45)]">
                <AnimatePresence mode="wait">
                  <motion.div key={mega} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                    <MegaPanel path={mega} onNavigate={() => setHovered(null)} />
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>

      {/* Mobile / tablet menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ clipPath: 'circle(0% at calc(100% - 2.5rem) 2.5rem)' }}
            animate={{ clipPath: 'circle(150% at calc(100% - 2.5rem) 2.5rem)' }}
            exit={{ clipPath: 'circle(0% at calc(100% - 2.5rem) 2.5rem)' }}
            transition={{ duration: 0.8, ease }}
            className="fixed inset-0 z-[45] grid bg-ivory md:grid-cols-[1fr_0.8fr] xl:hidden"
          >
            <div className="flex flex-col justify-between overflow-y-auto px-6 pb-10 pt-28 sm:px-10">
              <ul className="space-y-1">
                {navLinks.map((link, i) => (
                  <motion.li
                    key={link.path}
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 + i * 0.06, duration: 0.6, ease }}
                  >
                    <Link href={link.path} className="group flex items-baseline gap-4 py-1.5">
                      <span className="font-sans text-xs text-brass">0{i + 1}</span>
                      <span
                        className={`display text-[2.6rem] transition-all duration-500 group-hover:translate-x-2 group-hover:italic sm:text-6xl ${
                          isActive(link.path) ? 'italic text-brass' : 'text-ink'
                        }`}
                      >
                        {link.label}
                      </span>
                    </Link>
                  </motion.li>
                ))}
                {/* Phones only — tablets and up keep the original menu */}
                <motion.li
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + navLinks.length * 0.06, duration: 0.6, ease }}
                  className="md:hidden"
                >
                  <a href="/base" className="group flex items-baseline gap-4 py-1.5">
                    <span className="font-sans text-xs text-brass">0{navLinks.length + 1}</span>
                    <span className="display text-[2.6rem] text-ink transition-all duration-500 group-hover:translate-x-2 group-hover:italic">
                      Bay Design Base
                    </span>
                  </a>
                </motion.li>
              </ul>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="mt-10 grid gap-2 border-t border-stone pt-6 text-sm text-muted"
              >
                <a href={`tel:${companyInfo.phone}`} className="text-ink">{companyInfo.phone}</a>
                <a href={`mailto:${companyInfo.email}`}>{companyInfo.email}</a>
                <span>{companyInfo.address}</span>
                <a href="/base" className="mt-2 text-brass">Bay Design Base →</a>
              </motion.div>
            </div>
            <motion.div
              initial={{ scale: 1.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 1.2, ease }}
              className="relative hidden overflow-hidden md:block"
            >
              <img src={pageImages.cta} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/60 to-transparent" />
              <p className="display absolute bottom-10 left-8 right-8 text-4xl italic text-white">
                “Create the rooms you love — for the places you live.”
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
