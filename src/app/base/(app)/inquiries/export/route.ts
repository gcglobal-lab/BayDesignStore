import { audit } from '@/lib/base/audit';
import { getViewer, isManager } from '@/lib/base/auth';
import { csvResponse, toCsv } from '@/lib/base/csv';
import { db } from '@/lib/base/db';
import { isDbConfigured } from '@/lib/base/env';
import { getSettings } from '@/lib/base/settings';
import { fmtTime, toYmd } from '@/lib/base/time';

/** CSV of website inquiries or newsletter subscribers (managers only). */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer || viewer.mustChangePassword || !isManager(viewer) || !isDbConfigured()) return new Response('Not found', { status: 404 });
  const type = new URL(request.url).searchParams.get('type') === 'newsletter' ? 'newsletter' : 'inquiries';
  const { timezone: zone } = await getSettings();
  const today = toYmd(new Date(), zone);

  if (type === 'newsletter') {
    const { data, error } = await db().from('newsletter_subscribers').select('email, created_at').order('created_at', { ascending: false });
    if (error) return new Response('Could not load subscribers', { status: 500 });
    await audit(viewer, 'newsletter.export');
    return csvResponse(`bay-design-newsletter-${today}.csv`, toCsv([['Email', 'Signed up'], ...data.map((s) => [s.email, `${toYmd(new Date(s.created_at), zone)} ${fmtTime(s.created_at, zone)}`])]));
  }

  const { data, error } = await db().from('inquiries').select('*').order('created_at', { ascending: false });
  if (error) return new Response('Could not load inquiries', { status: 500 });
  await audit(viewer, 'inquiries.export');
  return csvResponse(
    `bay-design-inquiries-${today}.csv`,
    toCsv([
      ['Received', 'Name', 'Email', 'Phone', 'Interested in', 'Message', 'Status', 'Email alert sent'],
      ...data.map((q) => [`${toYmd(new Date(q.created_at), zone)} ${fmtTime(q.created_at, zone)}`, q.name, q.email, q.phone, q.interest, q.message, q.status, q.email_sent ? 'yes' : 'no']),
    ]),
  );
}
