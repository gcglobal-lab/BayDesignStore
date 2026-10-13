import 'server-only';

/**
 * Sends email through Resend's HTTP API (no SDK needed). Configure in .env.local:
 *   RESEND_API_KEY     — from resend.com ▸ API Keys
 *   INQUIRY_EMAIL_TO   — who gets website inquiries (comma-separated for several)
 *   INQUIRY_EMAIL_FROM — the sender; "onboarding@resend.dev" works for testing, but it can
 *                        only deliver to your own Resend account's address. Verify your
 *                        domain in Resend to send from e.g. inquiries@baydesignstore.com.
 */
const DEFAULT_TO = 'gc.globl@outlook.com';
const DEFAULT_FROM = 'Bay Design Store <onboarding@resend.dev>';

export const isEmailConfigured = () => Boolean(process.env.RESEND_API_KEY?.trim());

export async function sendEmail({ subject, html, text, replyTo }: { subject: string; html: string; text: string; replyTo?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, error: 'RESEND_API_KEY is not set' };
  const to = (process.env.INQUIRY_EMAIL_TO?.trim() || DEFAULT_TO).split(',').map((s) => s.trim()).filter(Boolean);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.INQUIRY_EMAIL_FROM?.trim() || DEFAULT_FROM, to, subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 300)}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Email request failed' };
  }
}

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
