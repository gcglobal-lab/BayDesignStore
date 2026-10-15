'use server';

import { after } from 'next/server';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { db, isUniqueViolation } from '@/lib/base/db';
import { isDbConfigured } from '@/lib/base/env';
import { CacheKeys, invalidate } from '@/lib/base/memo';
import { clientIp, userAgent } from '@/lib/base/request';
import { leadFromInquiry } from '@/lib/crm/intake';
import { escapeHtml, sendEmail } from '@/lib/email';

/**
 * Public website forms. The contact form is saved to the database first (so a message is
 * never lost), then an email alert goes to the team; Employee Portal ▸ Website shows them all.
 */

const INTERESTS = ['Instant Design', 'Full-Service Design', 'Furniture Purchase', 'Private Appointment', 'Video Consultation'] as const;
const email = z.string().trim().toLowerCase().max(254).email('Please enter a valid email address.');

const inquirySchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name.').max(120),
  email,
  phone: z.string().trim().max(40).optional(),
  interest: z.enum(INTERESTS).optional(),
  message: z.string().trim().min(1, 'Please write a message.').max(5000, 'Please keep the message under 5,000 characters.'),
  page: z.string().max(200).optional(),
});

const MAX_PER_IP_PER_HOUR = 5;

export async function submitInquiry(input: unknown): Promise<ActionResult> {
  return createInquiry(input, 'contact_form');
}

/** An inquiry sent from the website chat assistant (same checks, alerts and inbox). */
export async function submitChatInquiry(input: unknown): Promise<ActionResult> {
  const raw = (input ?? {}) as Record<string, unknown>;
  return createInquiry({ ...raw, interest: undefined, page: 'Website chat' }, 'website_chat');
}

async function createInquiry(input: unknown, source: 'contact_form' | 'website_chat'): Promise<ActionResult> {
  const raw = (input ?? {}) as Record<string, unknown>;
  // Honeypot: a hidden field people never see; bots fill it in. Pretend it worked.
  if (typeof raw.website === 'string' && raw.website.trim() !== '') return done();

  const parsed = inquirySchema.safeParse({ ...raw, phone: raw.phone || undefined, interest: raw.interest || undefined });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the form and try again.');
  if (!isDbConfigured()) return fail('Sorry — messages can’t be sent right now. Please call us at (239) 778-9709.');
  const v = parsed.data;

  const ip = await clientIp();
  if (ip) {
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await db().from('inquiries').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', since);
    if ((count ?? 0) >= MAX_PER_IP_PER_HOUR) return fail('You’ve sent several messages already — we’ll be in touch soon. For anything urgent, please call (239) 778-9709.');
  }

  const { data, error } = await db()
    .from('inquiries')
    .insert({ name: v.name, email: v.email, phone: v.phone ?? null, interest: v.interest ?? null, message: v.message, page: v.page ?? null, ip, user_agent: await userAgent(), source })
    .select('id, created_at')
    .single();
  if (error) {
    console.error('[inquiry] save failed', error.message);
    return fail('Sorry — your message didn’t go through. Please try again, or call us at (239) 778-9709.');
  }

  const rows: [string, string][] = [
    ['Name', v.name],
    ['Email', v.email],
    ['Phone', v.phone || '—'],
    ['Interested in', v.interest || '—'],
    ['Sent from', source === 'website_chat' ? 'Website chat assistant' : 'Contact form'],
  ];
  invalidate(CacheKeys.inquiries);
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto;color:#17173a">
      <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed,#db2777);color:#fff;padding:22px 26px;border-radius:14px 14px 0 0">
        <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.85">Bay Design Store · website</div>
        <div style="font-size:22px;font-weight:bold;margin-top:6px">New inquiry from ${escapeHtml(v.name)}</div>
      </div>
      <div style="border:1px solid #dde0ef;border-top:0;padding:22px 26px;border-radius:0 0 14px 14px">
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          ${rows.map(([k, val]) => `<tr><td style="padding:6px 0;color:#646a87;width:130px">${k}</td><td style="padding:6px 0">${escapeHtml(val)}</td></tr>`).join('')}
        </table>
        <div style="margin-top:16px;padding:16px;background:#f3f4fb;border-radius:10px;font-size:14px;line-height:1.6;white-space:pre-wrap">${escapeHtml(v.message)}</div>
        <p style="margin-top:18px;font-size:13px;color:#646a87">Reply to this email to answer ${escapeHtml(v.name)} directly. All inquiries are also in Employee Portal ▸ Website.</p>
      </div>
    </div>`;
  const text = `New website inquiry\n\n${rows.map(([k, val]) => `${k}: ${val}`).join('\n')}\n\n${v.message}\n\nReply to this email to answer directly. All inquiries are in Employee Portal > Website.`;
  // The message is saved; the email alert goes out after the visitor gets their answer.
  after(() => leadFromInquiry({ id: data.id, name: v.name, email: v.email, phone: v.phone ?? null, interest: v.interest ?? null, message: v.message, source }));
  after(async () => {
    const sent = await sendEmail({ subject: `New inquiry: ${v.name}${v.interest ? ` · ${v.interest}` : source === 'website_chat' ? ' · website chat' : ''}`, html, text, replyTo: v.email });
    await db().from('inquiries').update(sent.ok ? { email_sent: true } : { email_sent: false, email_error: sent.error.slice(0, 500) }).eq('id', data.id);
    if (!sent.ok) console.error('[inquiry] email alert failed (message is saved):', sent.error);
  });

  return done('Thank you — our design team will be in touch soon.');
}

export async function subscribeNewsletter(input: unknown): Promise<ActionResult> {
  const raw = (input ?? {}) as Record<string, unknown>;
  if (typeof raw.website === 'string' && raw.website.trim() !== '') return done();
  const parsed = email.safeParse(raw.email);
  if (!parsed.success) return fail('Please enter a valid email address.');
  if (!isDbConfigured()) return fail('Sorry — sign-ups aren’t available right now.');
  const res = await db().from('newsletter_subscribers').insert({ email: parsed.data, ip: await clientIp() });
  if (res.error && !isUniqueViolation(res)) {
    console.error('[newsletter] save failed', res.error.message);
    return fail('Sorry — that didn’t work. Please try again.');
  }
  return done('Thank you — you’re on the list.');
}
