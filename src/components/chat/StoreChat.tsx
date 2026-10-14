'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, Mail } from 'lucide-react';
import { submitChatInquiry } from '@/app/inquiry-actions';
import ChatWidget, { type ChatTurn } from './ChatWidget';

/** "Send this to the team" card shown under a reply when the visitor wants to be contacted. */
function InquiryCard({ history }: { history: ChatTurn[] }) {
  const questions = history.filter((t) => t.role === 'user').map((t) => t.content);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ ok: boolean; message?: string } | null>(null);
  const [sending, setSending] = useState(false);

  if (state?.ok) {
    return (
      <p className="ml-9 flex items-start gap-2 rounded-2xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
        <CheckCircle2 size={16} className="mt-0.5 flex-none" /> {state.message ?? 'Sent — our team will be in touch soon.'}
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="ml-9 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-ivory transition-colors hover:bg-charcoal">
        <Mail size={14} /> Send my request to the team
      </button>
    );
  }
  return (
    <form
      className="ml-9 space-y-2 rounded-2xl border border-stone/70 bg-white p-3.5 shadow-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setSending(true);
        const res = await submitChatInquiry(Object.fromEntries(fd.entries()));
        setSending(false);
        setState(res ?? { ok: false, message: 'Something went wrong.' });
      }}
    >
      <p className="text-sm font-semibold">Our team will reply by email or phone</p>
      <input name="name" required maxLength={120} placeholder="Your name" className="w-full rounded-xl border border-stone px-3 py-2 text-sm outline-none focus:border-brass" />
      <input name="email" type="email" required maxLength={254} placeholder="Email" className="w-full rounded-xl border border-stone px-3 py-2 text-sm outline-none focus:border-brass" />
      <input name="phone" type="tel" maxLength={40} placeholder="Phone (optional)" className="w-full rounded-xl border border-stone px-3 py-2 text-sm outline-none focus:border-brass" />
      <textarea name="message" required maxLength={5000} rows={3} defaultValue={questions.slice(-3).join('\n')} className="w-full resize-none rounded-xl border border-stone px-3 py-2 text-sm outline-none focus:border-brass" />
      {/* Honeypot for bots */}
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      {state && !state.ok && <p className="text-xs text-red-600">{state.message}</p>}
      <button type="submit" disabled={sending} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brass to-brass-dark px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
        {sending ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Send to Bay Design Store
      </button>
    </form>
  );
}

export default function StoreChat() {
  return (
    <ChatWidget
      endpoint="/api/chat"
      storageKey="bds-chat"
      title="Bay Design Store"
      subtitle="Ask us anything · usually answers instantly"
      greeting="Hi! I’m the Bay Design Store assistant. Ask me about our showrooms, opening hours, design services or delivery — or I can pass a message to our design team."
      suggestions={['When are you open?', 'Where are your showrooms?', 'Book a design consultation', 'Do you deliver?']}
      renderExtra={(reply, history) => (reply.inquiry ? <InquiryCard history={history} /> : null)}
      footer="AI assistant — for urgent questions call (239) 649-0906"
    />
  );
}
