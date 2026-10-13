'use client';

import { useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, Check, Loader2 } from 'lucide-react';
import { submitInquiry } from '@/app/inquiry-actions';

const interests = ['Instant Design', 'Full-Service Design', 'Furniture Purchase', 'Private Appointment', 'Video Consultation'];
const empty = { name: '', email: '', phone: '', message: '', website: '' };

/** Contact form — saved to Bay Design Base ▸ Inquiries and emailed to the team (see app/inquiry-actions.ts). */
export default function InquiryForm() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState(empty);
  const [interest, setInterest] = useState(interests[0]);
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const page = usePathname();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    startSending(async () => {
      const result = await submitInquiry({ ...form, interest, page });
      if (!result?.ok) {
        setError(result?.message ?? 'Sorry — your message didn’t go through. Please try again.');
        return;
      }
      setSubmitted(true);
      window.setTimeout(() => {
        setSubmitted(false);
        setForm(empty);
      }, 6000);
    });
  };

  return (
    <div className="rounded-[2rem] border border-stone/70 bg-ivory p-7 shadow-[0_40px_80px_-40px_rgba(30,28,25,0.35)] sm:p-10 md:p-12">
      <p className="eyebrow">Start a Conversation</p>
      <h2 className="display mt-4 text-4xl md:text-5xl">Tell us about your space</h2>
      <AnimatePresence mode="wait">
        {submitted ? (
          <motion.div key="thanks" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="py-16 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brass text-ivory">
              <Check size={26} />
            </span>
            <p className="display mt-6 text-3xl">Thank you.</p>
            <p className="mt-2 text-muted">Our design team will be in touch soon.</p>
          </motion.div>
        ) : (
          <motion.form key="form" onSubmit={handleSubmit} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-10 space-y-8">
            <fieldset>
              <legend className="mb-3 text-[0.7rem] font-medium uppercase tracking-[0.2em] text-muted">I’m interested in</legend>
              <div className="flex flex-wrap gap-2">
                {interests.map((item) => (
                  <button
                    type="button"
                    key={item}
                    onClick={() => setInterest(item)}
                    className={`rounded-full border px-4 py-2 text-sm transition-all duration-300 ${interest === item ? 'border-ink bg-ink text-ivory' : 'border-stone text-ink/70 hover:border-ink hover:text-ink'}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-8 sm:grid-cols-2">
              <label className="field">Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" /></label>
              <label className="field">Email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="your@email.com" /></label>
            </div>
            <label className="field">Phone<input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(239) 000-0000" /></label>
            <label className="field">Message<textarea required rows={4} maxLength={5000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Tell us about your project, rooms and timeline…" /></label>
            {/* Spam trap: hidden from people, bots fill it in. */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={sending} className="btn-primary w-full !py-4 disabled:opacity-70">
              {sending ? (
                <>Sending… <Loader2 size={16} className="animate-spin" /></>
              ) : (
                <>Send Message <ArrowUpRight size={16} /></>
              )}
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
