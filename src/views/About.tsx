'use client';

import { motion } from 'framer-motion';
import { Award, Heart, Sparkles } from 'lucide-react';
import { companyInfo, pageImages, stats, timeline } from '@/data/siteData';
import PageHero from '@/components/PageHero';
import CTABanner from '@/components/CTABanner';
import { ClipReveal, Counter, ParallaxImage, Reveal, SplitWords, ease } from '@/components/motion';
import { SIZES } from '@/lib/photos';

const values = [
  { icon: Heart, title: 'Client Happiness', text: 'Every decision we make starts with a simple question: will this make our clients happy?' },
  { icon: Sparkles, title: 'Curated Quality', text: 'Each piece in our collection is hand-selected by Susan Bay for its beauty, quality, and character.' },
  { icon: Award, title: 'Design Excellence', text: 'Our professionally trained designers create elegant and relaxed rooms for the places you live.' },
];

export default function About() {
  return (
    <div className="bg-ivory">
      <PageHero
        crumb="About"
        eyebrow="Our Story"
        title="A legacy of fine furniture & design"
        text="Designer-curated home furnishings and full-service interior design in Naples, Florida — since 1979."
        image={pageImages.about}
      />

      {/* Philosophy */}
      <section className="shell py-24 text-center md:py-36">
        <Reveal><p className="eyebrow justify-center">Our Philosophy</p></Reveal>
        <SplitWords text="Our goal is to have happy clients." className="display mx-auto mt-6 max-w-5xl text-[clamp(2.6rem,6vw,6rem)]" />
        <Reveal delay={0.15}>
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-muted">{companyInfo.philosophy}</p>
        </Reveal>
      </section>

      {/* Founder */}
      <section className="bg-linen py-24 md:py-32">
        <div className="shell grid items-center gap-14 lg:grid-cols-12 lg:gap-20">
          <div className="lg:col-span-5">
            <ClipReveal src={companyInfo.ownerImage} alt="Susan Bay, Founder & CEO" className="aspect-[4/5] rounded-[2rem]" />
          </div>
          <div className="lg:col-span-7">
            <Reveal><p className="eyebrow">Founder &amp; CEO</p></Reveal>
            <SplitWords text="Susan Bay" className="display mt-4 text-[clamp(3rem,6vw,6rem)]" />
            <Reveal delay={0.1}>
              <p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted">{companyInfo.ownerBio}</p>
              <blockquote className="mt-10 border-l-2 border-brass pl-6 font-display text-2xl italic leading-snug text-ink md:text-3xl">
                “{companyInfo.ownerQuote}”
              </blockquote>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="shell py-24 md:py-32">
        <Reveal><p className="eyebrow">Milestones</p></Reveal>
        <SplitWords text="More than four decades of design" className="display mt-4 max-w-3xl text-[clamp(2.4rem,4.6vw,4.75rem)]" />
        <div className="relative mt-16 grid gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.6, ease }}
            className="absolute left-0 right-0 top-[3.1rem] hidden h-px origin-left bg-stone lg:block"
          />
          {timeline.map((t, i) => (
            <Reveal key={t.year} delay={0.2 + i * 0.12} className="relative">
              <p className="display text-6xl text-brass">{t.year}</p>
              <span className="relative z-10 mt-4 hidden h-3 w-3 rounded-full border-2 border-ivory bg-brass ring-1 ring-brass lg:block" />
              <h3 className="mt-6 font-display text-2xl">{t.title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{t.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Sherrill */}
      <section className="shell pb-24 md:pb-32">
        <div className="grid overflow-hidden rounded-[2rem] bg-sand/60 lg:grid-cols-2">
          <div className="flex flex-col justify-center p-8 sm:p-12 lg:p-20">
            <Reveal><p className="eyebrow">Partnership</p></Reveal>
            <SplitWords text="Susan Bay designs for Sherrill Furniture" className="display mt-4 text-[clamp(2.2rem,3.8vw,3.75rem)]" />
            <Reveal delay={0.1}>
              <p className="mt-6 leading-relaxed text-muted">
                Susan Bay designs for Sherrill Furniture on the DC Collections featured at High Point Market each April and October. Based on the original designs of award-winning designer Dan Carithers, the collection features both upholstery and case goods. Susan’s fresh perspective, design expertise, and experience have made the DC Collection one of the most popular lines in the Sherrill family of furniture.
              </p>
            </Reveal>
          </div>
          <ParallaxImage src={pageImages.sherrill} alt="Oak sideboard styled with gilded accents beneath palm photography" className="relative min-h-[420px]" sizes={SIZES.half} />
        </div>
      </section>

      {/* Values */}
      <section className="bg-linen py-24 md:py-32">
        <div className="shell">
          <div className="text-center">
            <Reveal><p className="eyebrow justify-center">What Drives Us</p></Reveal>
            <SplitWords text="Our values" className="display mt-4 text-[clamp(2.4rem,4.6vw,4.75rem)]" />
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {values.map((v, i) => (
              <Reveal key={v.title} delay={i * 0.1}>
                <div className="group h-full rounded-3xl border border-stone/80 bg-ivory p-10 transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_30px_60px_-30px_rgba(30,28,25,0.35)]">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-sand text-brass transition-colors duration-500 group-hover:bg-ink group-hover:text-brass-light">
                    <v.icon size={26} strokeWidth={1.4} />
                  </span>
                  <h3 className="mt-8 font-display text-3xl">{v.title}</h3>
                  <p className="mt-3 leading-relaxed text-muted">{v.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="shell py-20 md:py-28">
        <div className="grid grid-cols-2 gap-y-10 lg:grid-cols-4">
          {stats.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 0.08} className="text-center">
              <div className="display text-[clamp(3rem,5vw,5rem)]">
                <Counter value={stat.value} suffix={stat.suffix} />
              </div>
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.22em] text-muted">{stat.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <CTABanner title="Visit our stores in Downtown & North Naples" image={pageImages.aboutSecondary} />
    </div>
  );
}
