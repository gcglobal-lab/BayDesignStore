'use client';

import { ArrowUpRight, Calendar, Clock, Facebook, Instagram, Mail, MapPin, Phone, Video } from 'lucide-react';
import { companyInfo, pageImages } from '@/data/siteData';
import InquiryForm from '@/components/InquiryForm';
import PageHero from '@/components/PageHero';
import { Reveal, SplitWords } from '@/components/motion';

const locations = [
  { name: 'Downtown Naples Showroom', address: companyInfo.address, hours: companyInfo.hoursDowntown, phone: companyInfo.phone, image: pageImages.downtown, map: 'https://maps.google.com/?q=326+13th+Avenue+South+Naples+FL+34102' },
  { name: 'North Naples Showroom & Warehouse', address: companyInfo.warehouseAddress, hours: companyInfo.hoursWarehouse, phone: companyInfo.warehousePhone, image: pageImages.warehouse, map: 'https://maps.google.com/?q=5510+Shirley+Street+Naples+FL+34109' },
];

export default function Contact() {
  return (
    <div className="bg-ivory">
      <PageHero
        crumb="Contact"
        eyebrow="Get in Touch"
        title="Visit our stores"
        text="Schedule a private appointment, or reach out — we’d love to help you create a home you’ll truly love."
        image={pageImages.contact}
        height="short"
        overlap
      />

      {/* Quick actions */}
      <section className="shell -mt-12 relative z-10">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Phone, title: 'Call Us', text: companyInfo.phone, href: `tel:${companyInfo.phone}` },
            { icon: Video, title: 'Video Consultation', text: 'Schedule a virtual design session', href: '#contact-form' },
            { icon: Calendar, title: 'Book a Visit', text: 'Private in-store appointment', href: '#contact-form' },
          ].map((card, i) => (
            <Reveal key={card.title} delay={i * 0.08}>
              <a href={card.href} className="glass group flex items-center gap-5 rounded-3xl border border-white/70 p-6 shadow-[0_30px_60px_-30px_rgba(30,28,25,0.4)] transition-transform duration-500 hover:-translate-y-1">
                <span className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-ink text-brass-light transition-transform duration-500 group-hover:rotate-12">
                  <card.icon size={22} strokeWidth={1.5} />
                </span>
                <span>
                  <span className="block font-display text-2xl">{card.title}</span>
                  <span className="text-sm text-muted">{card.text}</span>
                </span>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="contact-form" className="shell scroll-mt-24 py-24 md:py-32">
        <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <Reveal><p className="eyebrow">Our Locations</p></Reveal>
            <SplitWords text="Two stores in Naples, Florida" className="display mt-4 text-[clamp(2.4rem,4.4vw,4.5rem)]" />
            <div className="mt-12 space-y-5">
              {locations.map((loc, i) => (
                <Reveal key={loc.name} delay={i * 0.1}>
                  <div className="group grid overflow-hidden rounded-3xl border border-stone/70 bg-linen sm:grid-cols-[180px_1fr]">
                    <div className="img-zoom h-44 overflow-hidden sm:h-full">
                      <img src={loc.image} alt={loc.name} loading="lazy" className="h-full w-full object-cover" />
                    </div>
                    <div className="p-6">
                      <h3 className="font-display text-2xl">{loc.name}</h3>
                      <p className="mt-3 flex items-start gap-2 text-sm text-ink/80"><MapPin size={15} className="mt-0.5 flex-none text-brass" /> {loc.address}</p>
                      <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-muted"><Clock size={14} className="mt-0.5 flex-none text-brass" /> {loc.hours}</p>
                      <div className="mt-4 flex flex-wrap gap-4 text-sm">
                        <a href={`tel:${loc.phone}`} className="link-underline font-medium"><Phone size={14} /> {loc.phone}</a>
                        <a href={loc.map} target="_blank" rel="noopener noreferrer" className="link-underline text-brass">Directions <ArrowUpRight size={14} /></a>
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal delay={0.2} className="mt-10 flex flex-wrap items-center gap-6 text-sm">
              <a href={`mailto:${companyInfo.email}`} className="link-underline"><Mail size={15} className="text-brass" /> {companyInfo.email}</a>
              <div className="flex gap-3">
                <a href={companyInfo.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="flex h-11 w-11 items-center justify-center rounded-full border border-stone transition-colors hover:bg-ink hover:text-ivory"><Instagram size={17} /></a>
                <a href={companyInfo.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="flex h-11 w-11 items-center justify-center rounded-full border border-stone transition-colors hover:bg-ink hover:text-ivory"><Facebook size={17} /></a>
              </div>
            </Reveal>
          </div>
          <Reveal delay={0.1}>
            <InquiryForm />
          </Reveal>
        </div>
      </section>

      <section className="shell pb-10">
        <div className="relative h-[420px] overflow-hidden rounded-[2rem] border border-stone/70 md:h-[520px]">
          <iframe
            title="Bay Design Store locations in Naples, FL"
            src="https://www.openstreetmap.org/export/embed.html?bbox=-81.83%2C26.12%2C-81.76%2C26.27&layer=mapnik&marker=26.1400%2C-81.7997"
            className="h-full w-full"
            style={{ border: 0, filter: 'grayscale(0.85) sepia(0.15) contrast(0.95)' }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="glass pointer-events-none absolute left-5 top-5 rounded-2xl px-5 py-4">
            <p className="text-[0.65rem] uppercase tracking-[0.22em] text-brass">Find Us</p>
            <p className="font-display text-2xl">Naples, Florida</p>
          </div>
        </div>
      </section>
    </div>
  );
}
