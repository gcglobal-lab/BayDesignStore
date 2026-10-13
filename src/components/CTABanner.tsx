'use client';

import Link from 'next/link';
import { ArrowUpRight, Phone } from 'lucide-react';
import { companyInfo, pageImages } from '@/data/siteData';
import { ParallaxImage, SplitWords, Reveal } from './motion';

type CTABannerProps = {
  title?: string;
  text?: string;
  image?: string;
};

export default function CTABanner({
  title = 'Ready to create a home you’ll truly love?',
  text = 'Visit our Downtown showroom or North Naples warehouse, or schedule a private appointment with our design team.',
  image = pageImages.cta,
}: CTABannerProps) {
  return (
    <section className="shell py-6 md:py-10">
      <div className="relative overflow-hidden rounded-[2rem] md:rounded-[2.5rem]">
        <ParallaxImage src={image} alt="" className="absolute inset-0 h-full w-full" strength={10} />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/80 via-ink/50 to-ink/20" />
        <div className="relative grid gap-10 px-6 py-20 sm:px-12 md:py-28 lg:grid-cols-[1.4fr_1fr] lg:items-end lg:px-20 lg:py-32">
          <div>
            <p className="eyebrow !text-brass-light">Begin Your Project</p>
            <SplitWords text={title} className="display mt-5 text-[clamp(2.4rem,5vw,5rem)] text-white" />
          </div>
          <Reveal delay={0.2}>
            <p className="max-w-md text-base leading-relaxed text-white/85">{text}</p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/contact" className="btn-primary btn-light">
                Book a Visit <ArrowUpRight size={16} />
              </Link>
              <a href={`tel:${companyInfo.phone}`} className="btn-ghost text-white hover:!bg-white hover:!text-ink hover:!border-white">
                <Phone size={15} /> {companyInfo.phone}
              </a>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
