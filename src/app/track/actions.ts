'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { db } from '@/lib/base/db';
import { isDbConfigured } from '@/lib/base/env';

/**
 * The customer's rating after delivery (public — the order's secret tracking token is the key).
 * One rating per order. Low ratings are flagged for the office to follow up.
 */
export async function submitFeedback(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  if (!isDbConfigured()) return fail('Sorry — please try again later.');
  const parsed = z
    .object({ token: z.string().regex(/^[0-9a-f]{32}$/), rating: z.coerce.number().int().min(1).max(5), feedback: z.string().trim().max(2000) })
    .safeParse({ token: fd.get('token'), rating: fd.get('rating'), feedback: fd.get('feedback') ?? '' });
  if (!parsed.success) return fail('Please choose from 1 to 5 stars.');
  const { token, rating, feedback } = parsed.data;
  const { data: o } = await db().from('dl_orders').select('id, number, status, rating, contact_id, deal_id, customer_name').eq('tracking_token', token).maybeSingle();
  if (!o || o.status !== 'delivered') return fail('You can rate the delivery once it’s complete.');
  if (o.rating) return done('Thank you — we already have your rating.');
  await db()
    .from('dl_orders')
    .update({ rating, feedback: feedback || null, feedback_at: new Date().toISOString(), ...(rating <= 3 ? { followup_status: 'issue' } : {}) })
    .eq('id', o.id);
  await db().from('dl_events').insert({ order_id: o.id, status: 'feedback', note: `${rating}★${feedback ? ` — ${feedback.slice(0, 400)}` : ''}`, actor_label: o.customer_name });
  if (o.contact_id || o.deal_id) {
    await db()
      .from('crm_activities')
      .insert({ type: 'log', subject: `rated delivery #${o.number} ${rating}★${feedback ? `: “${feedback.slice(0, 120)}”` : ''}`.slice(0, 200), done: true, done_at: new Date().toISOString(), author_name: o.customer_name, contact_id: o.contact_id, deal_id: o.deal_id });
  }
  revalidatePath(`/track/${token}`);
  return done(rating >= 4 ? 'Thank you so much! We’re delighted you’re happy.' : 'Thank you for telling us — our team will reach out to make it right.');
}
