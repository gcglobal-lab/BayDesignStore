'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Armchair, ArrowUpRight, Calendar, Check, Home, Palette, Plus, Sparkles, Truck, type LucideIcon } from 'lucide-react';
import { faqs, instantSteps, pageImages, services } from '@/data/siteData';
import PageHero from '@/components/PageHero';
import CTABanner from '@/components/CTABanner';
import { ParallaxImage, Reveal, SplitWords, ease } from '@/components/motion';

const iconMap: Record<string, LucideIcon> = { Sparkles, Home, Truck, Calendar, Armchair, Palette };

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section className="shell py-24 md:py-32">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-20">
        <div>
          <Reveal><p className="eyebrow">Questions</p></Reveal>
          <SplitWords text="Frequently asked questions" className="display mt-4 text-[clamp(2.4rem,4.4vw,4.5rem)]" />
          <Reveal delay={0.1}>
            <p className="mt-6 max-w-sm leading-relaxed text-muted">Everything you need to know about working with our Naples interior design team.</p>
          </Reveal>
        </div>
        <div className="divide-y divide-stone border-y border-stone">
          {faqs.map((f, i) => (
            <div key={f.q}>
              <button
                onClick={() => setOpen(open === i ? -1 : i)}
                className="flex w-full items-center justify-between gap-6 py-6 text-left"
                aria-expanded={open === i}
              >
                <h3 className="font-display text-2xl md:text-[1.7rem]">{f.q}</h3>
                <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-full border transition-all duration-500 ${open === i ? 'rotate-45 border-ink bg-ink text-ivory' : 'border-stone'}`}>
                  <Plus size={16} />
                </span>
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.5, ease }}
                    className="overflow-hidden"
                  >
                    <p className="max-w-2xl pb-6 leading-relaxed text-muted">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Services() {
  return (
    <div className="bg-ivory">
      <PageHero
        crumb="Services"
        eyebrow="What We Offer"
        title="Design services, start to finish"
        text="From our exclusive Instant Design Program to full-service interior design, white glove delivery and private appointments."
        image={pageImages.services}
      />

      {/* Quick index */}
      <section className="border-b border-stone/70">
        <div className="shell no-scrollbar flex gap-8 overflow-x-auto py-6 text-sm">
          {services.map((s, i) => (
            <a key={s.id} href={`#${s.id}`} className="link-underline flex-none whitespace-nowrap text-muted hover:text-ink">
              <span className="text-brass">0{i + 1}</span> {s.title}
            </a>
          ))}
        </div>
      </section>

      <section className="shell space-y-24 py-24 md:space-y-36 md:py-32">
        {services.map((s, i) => {
          const Icon = iconMap[s.icon] ?? Sparkles;
          const flip = i % 2 === 1;
          return (
            <article key={s.id} id={s.id} className="grid scroll-mt-28 items-center gap-10 lg:grid-cols-2 lg:gap-20">
              <ParallaxImage
                src={s.image}
                alt={s.title}
                className={`relative aspect-[4/3] rounded-[2rem] lg:aspect-[5/4] ${flip ? 'lg:order-2' : ''}`}
              />
              <div>
                <Reveal className="flex items-center gap-5">
                  <span className="display text-7xl text-sand md:text-8xl">0{i + 1}</span>
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-brass-light">
                    <Icon size={22} strokeWidth={1.5} />
                  </span>
                </Reveal>
                <SplitWords text={s.title} as="h2" className="display mt-6 text-[clamp(2.2rem,4vw,4rem)]" />
                <Reveal delay={0.1}>
                  <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">{s.description}</p>
                  <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                    {s.features.map((f) => (
                      <li key={f} className="flex items-center gap-3 rounded-full border border-stone/80 px-4 py-3 text-sm">
                        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brass/15 text-brass">
                          <Check size={13} strokeWidth={2.2} />
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/contact" className="link-underline mt-10 text-sm font-medium">
                    Enquire about this service <ArrowUpRight size={16} />
                  </Link>
                </Reveal>
              </div>
            </article>
          );
        })}
      </section>

      {/* Instant Design process */}
      <section className="bg-linen py-24 md:py-32">
        <div className="shell">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
            <div>
              <Reveal><p className="eyebrow">How It Works</p></Reveal>
              <SplitWords text="The “Instant” Design Program" className="display mt-4 text-[clamp(2.4rem,4.6vw,4.75rem)]" />
            </div>
            <Reveal delay={0.1}>
              <p className="max-w-lg text-lg leading-relaxed text-muted lg:ml-auto">
                There is no better way to get great designer style for your home — quickly. And the consultation is complimentary.
              </p>
            </Reveal>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {instantSteps.map((step, i) => (
              <Reveal key={step.title} delay={i * 0.1}>
                <div className="group relative h-full overflow-hidden rounded-3xl bg-ivory p-8 transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_30px_60px_-30px_rgba(30,28,25,0.35)] md:p-10">
                  <span className="display text-8xl text-sand transition-colors duration-500 group-hover:text-brass/40">0{i + 1}</span>
                  <h3 className="mt-6 font-display text-3xl">{step.title}</h3>
                  <p className="mt-3 leading-relaxed text-muted">{step.text}</p>
                  <span className="absolute bottom-0 left-0 h-1 w-full origin-left scale-x-0 bg-brass transition-transform duration-700 group-hover:scale-x-100" />
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Faq />

      <CTABanner title="Let’s create the rooms you love" />
    </div>
  );
}
