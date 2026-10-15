'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { subscribeNewsletter } from '@/app/inquiry-actions';
import { motion } from 'framer-motion';
import { ArrowUp, ArrowUpRight, Facebook, Instagram, Mail, Phone } from 'lucide-react';
import { companyInfo, navLinks, services } from '@/data/siteData';
import Logo from './Logo';
import { ease } from './motion';

export default function Footer() {
  const [email, setEmail] = useState('');
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  return (
    <footer className="relative mt-16 overflow-hidden bg-linen pt-20 md:mt-24 md:pt-28">
      <div className="shell">
        {/* Newsletter */}
        <div className="grid gap-10 border-b border-stone pb-16 lg:grid-cols-2 lg:items-end">
          <div>
            <p className="eyebrow">The Bay Design Letter</p>
            <h2 className="display mt-4 max-w-xl text-[clamp(2.2rem,4vw,3.75rem)]">
              New arrivals, design notes &amp; private events.
            </h2>
          </div>
          <div className="w-full lg:ml-auto lg:max-w-xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              startSaving(async () => {
                const result = await subscribeNewsletter({ email });
                if (!result?.ok) return setError(result?.message ?? 'Please try again.');
                setJoined(true);
                setEmail('');
              });
            }}
            className="flex w-full items-center gap-3 rounded-full border border-stone bg-ivory p-2 pl-6"
          >
            <Mail size={18} className="flex-none text-brass" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={joined ? 'Thank you — you’re on the list.' : 'Your email address'}
              className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted"
              aria-label="Email address"
            />
            <button type="submit" disabled={saving} className="btn-primary !px-6 disabled:opacity-70">
              {saving ? 'Saving…' : 'Subscribe'}
            </button>
          </form>
          {error && <p role="alert" className="mt-2 pl-6 text-sm text-red-700">{error}</p>}
          </div>
        </div>

        {/* Columns */}
        <div className="grid gap-12 py-16 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.8fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="group inline-block">
              <Logo tone="dark" size="md" />
            </Link>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-muted">
              Designer-curated home furnishings and full-service interior design in Naples, Florida. Founded by Susan Bay in 1979.
            </p>
            <div className="mt-6 flex gap-3">
              {[
                { href: companyInfo.instagram, icon: Instagram, label: 'Instagram' },
                { href: companyInfo.facebook, icon: Facebook, label: 'Facebook' },
              ].map(({ href, icon: Icon, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-stone text-ink transition-all duration-300 hover:-translate-y-1 hover:border-ink hover:bg-ink hover:text-ivory"
                >
                  <Icon size={17} />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-5 text-xs font-medium uppercase tracking-[0.22em] text-brass">Explore</h4>
            <ul className="space-y-3">
              {navLinks.map((link) => (
                <li key={link.path}>
                  <Link href={link.path} className="link-underline text-sm text-ink/80 hover:text-ink">{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-5 text-xs font-medium uppercase tracking-[0.22em] text-brass">Services</h4>
            <ul className="space-y-3">
              {services.map((s) => (
                <li key={s.id}>
                  <Link href="/services" className="link-underline text-sm text-ink/80 hover:text-ink">{s.title}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-5 text-xs font-medium uppercase tracking-[0.22em] text-brass">Downtown Showroom</h4>
            <p className="text-sm leading-relaxed text-ink/80">{companyInfo.address}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted">{companyInfo.hoursDowntown}</p>
            <a href={`tel:${companyInfo.phone}`} className="mt-3 flex items-center gap-2 text-sm text-ink hover:text-brass">
              <Phone size={14} /> {companyInfo.phone}
            </a>
          </div>

          <div>
            <h4 className="mb-5 text-xs font-medium uppercase tracking-[0.22em] text-brass">North Naples Warehouse</h4>
            <p className="text-sm leading-relaxed text-ink/80">{companyInfo.warehouseAddress}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted">{companyInfo.hoursWarehouse}</p>
            <a href={`tel:${companyInfo.warehousePhone}`} className="mt-3 flex items-center gap-2 text-sm text-ink hover:text-brass">
              <Phone size={14} /> {companyInfo.warehousePhone}
            </a>
          </div>
        </div>

        <p className="border-t border-stone py-6 text-xs leading-relaxed text-muted">
          <span className="font-medium text-ink">Interior design &amp; fine furniture serving</span> Naples · Old Naples · Port Royal · Pelican Bay ·
          Park Shore · Marco Island · Bonita Springs · Estero · Fort Myers · Collier &amp; Lee Counties · Southwest Florida — with clients across Florida and
          the United States.
        </p>

        <div className="flex flex-col items-start justify-between gap-4 border-t border-stone py-6 text-xs text-muted md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} Bay Design Store. All rights reserved. Naples, Florida.</p>
          <div className="flex items-center gap-6">
            <a href={`mailto:${companyInfo.email}`} className="hover:text-ink">{companyInfo.email}</a>
            <a
              href="/base"
              className="btn-sheen group relative flex items-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-brass-light to-brass py-2 pl-5 pr-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink shadow-[0_6px_20px_-8px_rgba(168,131,79,0.9)] transition-transform duration-300 hover:-translate-y-0.5"
            >
              Employee Portal
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-brass-light transition-transform duration-500 group-hover:rotate-45">
                <ArrowUpRight size={12} />
              </span>
            </a>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-ivory transition-transform hover:-translate-y-1"
              aria-label="Back to top"
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Oversized wordmark */}
      <motion.p
        initial={{ y: '40%', opacity: 0 }}
        whileInView={{ y: '0%', opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.4, ease }}
        className="pointer-events-none mt-2 select-none whitespace-nowrap pb-[3vw] text-center font-brand text-[13.5vw] leading-none tracking-tight text-sand"
        aria-hidden="true"
      >
        Bay Design
      </motion.p>
    </footer>
  );
}
