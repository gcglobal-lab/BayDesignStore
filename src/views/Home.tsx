'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Instagram, MapPin, Phone } from 'lucide-react';
import {
  blogPosts,
  collections,
  companyInfo,
  galleryImages,
  instagramImages,
  instantSteps,
  pageImages,
  portfolioItems,
  roomCategories,
  services,
  stats,
} from '@/data/siteData';
import HeroSlider from '@/components/HeroSlider';
import Carousel from '@/components/Carousel';
import Marquee from '@/components/Marquee';
import CTABanner from '@/components/CTABanner';
import { ClipReveal, Counter, ParallaxImage, Reveal, SplitWords, ease } from '@/components/motion';

function SectionHeader({ eyebrow, title, text, link }: { eyebrow: string; title: string; text?: string; link?: { to: string; label: string } }) {
  return (
    <div className="mb-12 grid gap-6 md:mb-16 lg:grid-cols-[1.3fr_1fr] lg:items-end">
      <div>
        <Reveal><p className="eyebrow">{eyebrow}</p></Reveal>
        <SplitWords text={title} className="display mt-4 text-[clamp(2.4rem,4.6vw,4.75rem)]" />
      </div>
      <Reveal delay={0.15} className="flex flex-col gap-6 lg:items-end lg:text-right">
        {text && <p className="max-w-md text-base leading-relaxed text-muted">{text}</p>}
        {link && (
          <Link href={link.to} className="link-underline text-sm font-medium text-ink">
            {link.label} <ArrowRight size={16} />
          </Link>
        )}
      </Reveal>
    </div>
  );
}

function RotatingBadge() {
  const text = 'SINCE 1979 · NAPLES FLORIDA · FINE FURNITURE · ';
  return (
    <div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-ink text-ivory shadow-2xl md:h-40 md:w-40">
      <motion.svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
      >
        <defs>
          <path id="badge-circle" d="M50 50 m-38 0 a38 38 0 1 1 76 0 a38 38 0 1 1 -76 0" />
        </defs>
        <text className="fill-current font-sans text-[7.4px] tracking-[0.18em]">
          <textPath href="#badge-circle">{text}</textPath>
        </text>
      </motion.svg>
      <span className="font-display text-3xl italic text-brass-light md:text-4xl">45</span>
    </div>
  );
}

export default function Home() {
  const [activeService, setActiveService] = useState(0);
  const featured = portfolioItems.slice(0, 6);

  return (
    <div className="bg-ivory">
      <HeroSlider />

      {/* Ticker */}
      <section className="border-b border-stone/70 bg-ivory py-6 md:py-8">
        <Marquee
          className="display text-3xl italic text-ink md:text-5xl"
          items={['Fine Furniture', 'Full-Service Interior Design', 'Instant Design Program', 'White Glove Delivery', 'Gallery-Quality Art', 'Naples, Florida']}
        />
      </section>

      {/* Intro */}
      <section className="shell py-24 md:py-36">
        <div className="grid gap-16 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-6 xl:col-span-5">
            <Reveal><p className="eyebrow">Welcome to Bay Design Store</p></Reveal>
            <SplitWords
              text="Designer-curated home furnishings & full-service interior design."
              className="display mt-5 text-[clamp(2.5rem,4.4vw,4.6rem)]"
            />
            <Reveal delay={0.1}>
              <p className="mt-8 max-w-lg text-lg leading-relaxed text-muted">
                An extensive, ever-changing collection of ready-to-deliver furniture — hand-selected by owner Susan Bay to complement the casual, yet elegant Naples lifestyle.
              </p>
              <p className="mt-4 max-w-lg leading-relaxed text-muted">{companyInfo.philosophy}</p>
              <div className="mt-10 flex flex-wrap items-center gap-6">
                <Link href="/about" className="btn-primary">
                  Discover Our Story <ArrowUpRight size={16} />
                </Link>
                <Link href="/services" className="link-underline text-sm font-medium">
                  Design Services <ArrowRight size={16} />
                </Link>
              </div>
            </Reveal>
          </div>

          <div className="relative lg:col-span-6 xl:col-span-7">
            <div className="grid grid-cols-12 gap-4">
              <ClipReveal src={pageImages.intro1} alt="Teal living room with gallery wall" className="col-span-8 aspect-[4/5] rounded-3xl" />
              <div className="col-span-4 flex flex-col justify-end gap-4 pb-10">
                <ClipReveal src={pageImages.intro2} alt="White sofa with abstract art" className="aspect-[3/4] rounded-3xl" delay={0.15} />
                <ClipReveal src={galleryImages[2].src} alt="Rattan pendant lights over a lounge" className="aspect-square rounded-3xl" delay={0.3} />
              </div>
            </div>
            <div className="absolute -bottom-8 left-[58%] -translate-x-1/2 md:-bottom-10">
              <RotatingBadge />
            </div>
          </div>
        </div>

        <div className="mt-24 grid grid-cols-2 gap-y-10 border-t border-stone pt-12 md:mt-32 lg:grid-cols-4">
          {stats.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 0.08} className="border-stone lg:border-l lg:pl-8 lg:first:border-l-0 lg:first:pl-0">
              <div className="display text-[clamp(3rem,5vw,5rem)] text-ink">
                <Counter value={stat.value} suffix={stat.suffix} />
              </div>
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.22em] text-muted">{stat.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Gallery carousel */}
      <section className="bg-linen py-24 md:py-32">
        <div className="shell">
          <SectionHeader
            eyebrow="The Bay Design Point of View"
            title="Rooms with a sense of place"
            text="Light-filled great rooms, serene suites and gracious dining rooms — a look inside the spaces our designers create across Southwest Florida."
            link={{ to: '/portfolio', label: 'View the full portfolio' }}
          />
          <Carousel
            label="Interior gallery"
            items={galleryImages}
            interval={4000}
            renderItem={(img, i, active) => (
              <motion.figure
                animate={{ opacity: active ? 1 : 0.55 }}
                transition={{ duration: 0.8 }}
                className="img-zoom group relative aspect-[4/5] overflow-hidden rounded-3xl bg-sand"
              >
                <img src={img.src} alt={img.title} loading="lazy" className="h-full w-full object-cover" draggable={false} />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent opacity-80 transition-opacity duration-500 group-hover:opacity-100" />
                <span className="glass absolute left-5 top-5 rounded-full px-3.5 py-1.5 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-ink">
                  {img.tag}
                </span>
                <figcaption className="absolute inset-x-5 bottom-5 flex items-end justify-between gap-4 text-white">
                  <div>
                    <span className="text-xs text-white/70">{String(i + 1).padStart(2, '0')}</span>
                    <h3 className="display mt-1 text-2xl md:text-3xl">{img.title}</h3>
                  </div>
                  <span className="flex h-11 w-11 flex-none translate-y-3 items-center justify-center rounded-full bg-white text-ink opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
                    <ArrowUpRight size={18} />
                  </span>
                </figcaption>
              </motion.figure>
            )}
          />
        </div>
      </section>

      {/* Shop by room */}
      <section className="shell py-24 md:py-32">
        <SectionHeader
          eyebrow="Shop by Room"
          title="Everything to finish a room"
          text="Sofas, chairs, consoles, cabinets, tables, fabrics, lighting and art — experience it in our showroom before you buy or custom-order."
          link={{ to: '/collections', label: 'Browse all collections' }}
        />
        <div className="grid auto-rows-[260px] gap-4 sm:grid-cols-2 md:auto-rows-[300px] lg:grid-cols-4 lg:gap-5">
          {roomCategories.map((cat, i) => (
            <Reveal
              key={cat.name}
              delay={i * 0.08}
              className={i === 0 ? 'sm:col-span-2 sm:row-span-2' : ''}
            >
              <Link href="/collections" className="img-zoom group relative block h-full overflow-hidden rounded-3xl bg-sand">
                <img src={cat.image} alt={cat.name} loading="lazy" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/5 to-transparent" />
                <div className="absolute inset-x-6 bottom-6 flex items-end justify-between gap-4 text-white">
                  <div>
                    <p className="text-[0.65rem] uppercase tracking-[0.22em] text-white/75">{cat.count}</p>
                    <h3 className={`display mt-2 ${i === 0 ? 'text-4xl md:text-6xl' : 'text-3xl'}`}>{cat.name}</h3>
                  </div>
                  <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full border border-white/40 transition-all duration-500 group-hover:rotate-45 group-hover:border-white group-hover:bg-white group-hover:text-ink">
                    <ArrowUpRight size={18} />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Featured pieces */}
      <section className="border-y border-stone/70 bg-ivory py-24 md:py-32">
        <div className="shell">
          <SectionHeader
            eyebrow="New in the Showroom"
            title="Featured pieces"
            text="Hand-selected by Susan Bay for the Florida lifestyle — many are ready for same-day delivery."
            link={{ to: '/collections', label: 'Shop the collection' }}
          />
          <Carousel
            label="Featured furniture"
            items={collections}
            interval={3800}
            perView={{ base: 1.3, sm: 2.3, lg: 3.3, xxl: 4.3 }}
            renderItem={(p) => (
              <Link href="/collections" className="group block">
                <div className="img-zoom relative aspect-[3/4] overflow-hidden rounded-3xl bg-sand">
                  <img src={p.image} alt={p.name} loading="lazy" draggable={false} className="h-full w-full object-cover" />
                  <span className="glass absolute left-4 top-4 rounded-full px-3 py-1 text-[0.65rem] font-medium uppercase tracking-[0.18em]">{p.category}</span>
                  <span className="absolute inset-x-4 bottom-4 flex translate-y-4 items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm text-ivory opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
                    Enquire about this piece <ArrowUpRight size={15} />
                  </span>
                </div>
                <div className="mt-5 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-display text-2xl leading-tight">{p.name}</h3>
                    <p className="mt-1 line-clamp-1 text-sm text-muted">{p.description}</p>
                  </div>
                  <span className="whitespace-nowrap font-medium text-brass">{p.price}</span>
                </div>
              </Link>
            )}
          />
        </div>
      </section>

      {/* Instant Design Program */}
      <section className="bg-sand/50 py-24 md:py-32">
        <div className="shell grid gap-14 lg:grid-cols-2 lg:gap-20">
          <div className="lg:sticky lg:top-28 lg:h-[calc(100vh-9rem)]">
            <ParallaxImage src={services[0].image} alt="Living room furnished through the Instant Design Program" className="relative h-[60vh] rounded-[2rem] lg:h-full" />
          </div>
          <div className="lg:py-10">
            <Reveal><p className="eyebrow">Signature Service</p></Reveal>
            <SplitWords text="Try our “Instant” Design Program" className="display mt-4 text-[clamp(2.4rem,4.6vw,4.75rem)]" />
            <Reveal delay={0.1}>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
                This complimentary service can help you furnish your room or home quickly. There is no better way to get great designer style for your home.
              </p>
            </Reveal>
            <ol className="mt-14 space-y-4">
              {instantSteps.map((step, i) => (
                <Reveal key={step.title} delay={i * 0.08}>
                  <li className="group flex gap-6 rounded-3xl border border-stone/80 bg-ivory p-6 transition-all duration-500 hover:-translate-y-1 hover:border-brass/50 hover:shadow-[0_20px_50px_-25px_rgba(30,28,25,0.35)] md:gap-8 md:p-8">
                    <span className="display text-5xl text-brass transition-transform duration-500 group-hover:scale-110 md:text-6xl">0{i + 1}</span>
                    <div>
                      <h3 className="font-display text-2xl md:text-3xl">{step.title}</h3>
                      <p className="mt-2 leading-relaxed text-muted">{step.text}</p>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ol>
            <Reveal delay={0.2}>
              <Link href="/contact" className="btn-primary mt-12">
                Schedule Your Consultation <ArrowUpRight size={16} />
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Services accordion */}
      <section className="shell py-24 md:py-32">
        <SectionHeader
          eyebrow="What We Offer"
          title="Design services, start to finish"
          text="From a single accent chair to a complete residence — our team handles design, sourcing, delivery and installation."
          link={{ to: '/services', label: 'All services' }}
        />
        <div className="hidden h-[560px] gap-3 lg:flex">
          {services.map((s, i) => {
            const active = activeService === i;
            return (
              <motion.div
                key={s.id}
                onMouseEnter={() => setActiveService(i)}
                animate={{ flexGrow: active ? 5 : 1 }}
                transition={{ duration: 0.8, ease }}
                className="relative min-w-0 basis-0 cursor-pointer overflow-hidden rounded-3xl bg-sand"
              >
                <motion.img
                  src={s.image}
                  alt={s.title}
                  loading="lazy"
                  animate={{ scale: active ? 1 : 1.15 }}
                  transition={{ duration: 1.2, ease }}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className={`absolute inset-0 transition-colors duration-700 ${active ? 'bg-gradient-to-t from-ink/85 via-ink/20 to-transparent' : 'bg-ink/45'}`} />
                <span className="absolute left-6 top-6 font-display text-xl text-white/80">0{i + 1}</span>
                {!active && (
                  <span className="absolute bottom-8 left-1/2 -translate-x-1/2 rotate-180 whitespace-nowrap font-display text-2xl text-white [writing-mode:vertical-rl]">
                    {s.title}
                  </span>
                )}
                {active && (
                  <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.25, ease }}
                    className="absolute inset-x-8 bottom-8 max-w-xl text-white"
                  >
                    <h3 className="display text-4xl xl:text-5xl">{s.title}</h3>
                    <p className="mt-4 line-clamp-3 text-white/85">{s.description}</p>
                    <Link href="/services" className="link-underline mt-6 text-sm font-medium">
                      Learn more <ArrowRight size={16} />
                    </Link>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:hidden">
          {services.map((s, i) => (
            <Reveal key={s.id} delay={(i % 2) * 0.08}>
              <Link href="/services" className="relative block aspect-[4/5] overflow-hidden rounded-3xl">
                <img src={s.image} alt={s.title} loading="lazy" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/10 to-transparent" />
                <div className="absolute inset-x-6 bottom-6 text-white">
                  <span className="text-sm text-white/70">0{i + 1}</span>
                  <h3 className="display mt-1 text-3xl">{s.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm text-white/80">{s.description}</p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Founder */}
      <section className="bg-linen py-24 md:py-32">
        <div className="shell grid items-center gap-14 lg:grid-cols-12 lg:gap-20">
          <div className="relative lg:col-span-5">
            <ClipReveal src={companyInfo.ownerImage} alt="Susan Bay, Founder & CEO" className="aspect-[4/5] rounded-[2rem]" />
            <Reveal delay={0.3} className="glass absolute -right-4 bottom-8 rounded-2xl px-6 py-4 shadow-xl md:-right-10">
              <p className="font-display text-2xl">Susan Bay</p>
              <p className="text-[0.65rem] uppercase tracking-[0.22em] text-brass">Founder &amp; CEO</p>
            </Reveal>
          </div>
          <div className="lg:col-span-7">
            <Reveal><p className="eyebrow">A Message from Our Founder</p></Reveal>
            <Reveal delay={0.1}>
              <blockquote className="display mt-8 text-[clamp(1.9rem,3.2vw,3.3rem)] italic leading-[1.2] text-ink">
                <span className="mr-1 align-top font-display text-7xl leading-none text-brass">“</span>
                {companyInfo.ownerQuote}
              </blockquote>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="mt-10 max-w-2xl leading-relaxed text-muted">{companyInfo.ownerBio.split('. ').slice(0, 2).join('. ')}.</p>
              <Link href="/about" className="btn-ghost mt-10 text-ink">
                Read Susan’s Story <ArrowRight size={16} />
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Portfolio mosaic */}
      <section className="shell py-24 md:py-32">
        <SectionHeader
          eyebrow="Our Design Portfolio"
          title="Elegant & relaxed rooms"
          text="Our designers create elegant and relaxed rooms for the places you live."
          link={{ to: '/portfolio', label: 'Explore all projects' }}
        />
        <div className="grid grid-flow-dense auto-rows-[220px] grid-cols-2 gap-4 md:auto-rows-[280px] lg:grid-cols-4 lg:gap-5">
          {featured.map((item, i) => {
            const span = ['col-span-2 row-span-2', 'row-span-1', 'row-span-2', 'row-span-1', 'col-span-2 lg:col-span-1', 'col-span-2 lg:col-span-3'][i];
            return (
              <Reveal key={item.id} delay={(i % 3) * 0.08} className={span}>
                <Link href="/portfolio" className="img-zoom group relative block h-full overflow-hidden rounded-3xl bg-sand">
                  <img src={item.image} alt={item.title} loading="lazy" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-ink/0 transition-colors duration-500 group-hover:bg-ink/35" />
                  <div className="absolute inset-x-5 bottom-5 translate-y-4 text-white opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
                    <p className="text-[0.65rem] uppercase tracking-[0.22em] text-white/80">{item.category}</p>
                    <h3 className="display mt-1 text-2xl md:text-3xl">{item.title}</h3>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* Instagram */}
      <section className="bg-ivory pb-24 md:pb-32">
        <div className="shell mb-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div>
            <Reveal><p className="eyebrow">@baydesignstore</p></Reveal>
            <SplitWords text="Bay Design is on Instagram" className="display mt-4 text-[clamp(2.2rem,4vw,4rem)]" />
            <Reveal delay={0.1}><p className="mt-4 text-muted">See our latest projects and the newest arrivals in the store.</p></Reveal>
          </div>
          <a href={companyInfo.instagram} target="_blank" rel="noopener noreferrer" className="btn-primary">
            <Instagram size={16} /> Follow Along
          </a>
        </div>
        <div className="grid grid-cols-3 gap-1 md:grid-cols-6">
          {instagramImages.map((src, i) => (
            <motion.a
              key={src}
              href={companyInfo.instagram}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: i * 0.06, ease }}
              className="img-zoom group relative aspect-square overflow-hidden bg-sand"
              aria-label="Open Bay Design Store on Instagram"
            >
              <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-ink/0 text-white opacity-0 transition-all duration-500 group-hover:bg-ink/40 group-hover:opacity-100">
                <Instagram size={28} />
              </span>
            </motion.a>
          ))}
        </div>
      </section>

      {/* Journal */}
      <section className="bg-linen py-24 md:py-32">
        <div className="shell">
          <SectionHeader
            eyebrow="The Bay Design Journal"
            title="Ideas for living beautifully"
            link={{ to: '/blog', label: 'Read the journal' }}
          />
          <div className="grid gap-6 md:grid-cols-3">
            {blogPosts.slice(0, 3).map((post, i) => (
              <Reveal key={post.id} delay={i * 0.1}>
                <Link href={`/blog/${post.id}`} className="group block">
                  <div className="img-zoom aspect-[4/3] overflow-hidden rounded-3xl bg-sand">
                    <img src={post.image} alt={post.imageAlt} loading="lazy" className="h-full w-full object-cover" />
                  </div>
                  <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-brass">
                    {post.category} <span className="h-1 w-1 rounded-full bg-stone" /> <span className="text-muted">{post.date}</span>
                  </div>
                  <h3 className="display mt-3 text-2xl leading-snug transition-colors group-hover:text-brass md:text-[1.75rem]">{post.title}</h3>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Locations */}
      <section className="shell py-24 md:py-32">
        <SectionHeader eyebrow="Visit Us" title="Two destinations in Naples" />
        <div className="grid gap-6 lg:grid-cols-2">
          {[
            { name: 'Downtown Showroom', address: companyInfo.address, hours: companyInfo.hoursDowntown, phone: companyInfo.phone, image: pageImages.downtown },
            { name: 'North Naples Showroom & Warehouse', address: companyInfo.warehouseAddress, hours: companyInfo.hoursWarehouse, phone: companyInfo.warehousePhone, image: pageImages.warehouse },
          ].map((loc, i) => (
            <Reveal key={loc.name} delay={i * 0.1}>
              <div className="img-zoom group relative h-[480px] overflow-hidden rounded-[2rem] md:h-[560px]">
                <img src={loc.image} alt={loc.name} loading="lazy" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/20 to-transparent" />
                <div className="absolute inset-x-6 bottom-6 md:inset-x-10 md:bottom-10">
                  <h3 className="display text-4xl text-white md:text-5xl">{loc.name}</h3>
                  <div className="glass mt-6 grid gap-3 rounded-2xl p-5 text-sm text-ink sm:grid-cols-2">
                    <span className="flex items-start gap-2"><MapPin size={16} className="mt-0.5 flex-none text-brass" /> {loc.address}</span>
                    <a href={`tel:${loc.phone}`} className="flex items-center gap-2 hover:text-brass"><Phone size={16} className="flex-none text-brass" /> {loc.phone}</a>
                    <span className="text-xs text-muted sm:col-span-2">{loc.hours}</span>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <CTABanner />
    </div>
  );
}
