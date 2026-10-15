'use client';

import { useActionState, useState } from 'react';
import { CheckCircle2, Loader2, Star } from 'lucide-react';
import { submitFeedback } from './actions';

/** "How did we do?" — stars and a comment, shown once the delivery is complete. */
export default function FeedbackForm({ token }: { token: string }) {
  const [result, action, pending] = useActionState(submitFeedback, null);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  if (result?.ok) return <p className="mt-6 flex items-start gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 size={17} className="mt-0.5 flex-none" /> {result.message}</p>;
  return (
    <form action={action} className="mt-6 space-y-3 rounded-2xl bg-[#F3F4FB] p-4">
      <p className="font-semibold">How did we do?</p>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="rating" value={rating} />
      <div className="flex gap-1" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n === 1 ? '' : 's'}`} onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} className="p-0.5">
            <Star size={32} className={(hover || rating) >= n ? 'fill-amber-400 text-amber-400' : 'text-[#C9CCE0]'} />
          </button>
        ))}
      </div>
      <textarea name="feedback" maxLength={2000} placeholder="Anything you’d like to tell us? (optional)" className="block min-h-[80px] w-full rounded-xl border border-[#DDE0EF] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#6366F1]" />
      {result && !result.ok && <p className="text-sm text-red-700">{result.message}</p>}
      <button type="submit" disabled={!rating || pending} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#6366F1] to-[#4F46E5] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {pending && <Loader2 size={14} className="animate-spin" />} Send feedback
      </button>
    </form>
  );
}
