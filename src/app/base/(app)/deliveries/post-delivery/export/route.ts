import { audit } from '@/lib/base/audit';
import { getViewer } from '@/lib/base/auth';
import { csvResponse, toCsv } from '@/lib/base/csv';
import { isDbConfigured } from '@/lib/base/env';
import { getSettings } from '@/lib/base/settings';
import { fmtTime, toYmd } from '@/lib/base/time';
import { getCrews } from '@/lib/deliveries/data';
import { followupLabel, serviceLabel, statusLabel, fullAddress } from '@/lib/deliveries/types';
import { loadPostDelivery } from '@/lib/deliveries/postDelivery';

/** CSV of completed deliveries with proof, rating and follow-up (dispatchers and admins). */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer || viewer.deliveries !== 'dispatcher' || !isDbConfigured()) return new Response('Not found', { status: 404 });
  const sp = Object.fromEntries(new URL(request.url).searchParams.entries());
  const [{ timezone: zone }, crews] = await Promise.all([getSettings(), getCrews()]);
  const { rows, from, to } = await loadPostDelivery(sp, zone);
  await audit(viewer, 'delivery.export', 'dl_orders', null, { text: `exported ${rows.length} completed deliveries (${from} to ${to})` });
  return csvResponse(
    `post-delivery-${from}-to-${to}.csv`,
    toCsv([
      ['Completed', 'Order #', 'Customer', 'Phone', 'Email', 'Address', 'Service', 'Outcome', 'Reason', 'Received by', 'Signature', 'Photos', 'Route', 'Driver', 'Driver notes', 'Rating', 'Customer feedback', 'Follow-up', 'Follow-up note'],
      ...rows.map((r) => [
        r.completed_at ? `${toYmd(new Date(r.completed_at), zone)} ${fmtTime(r.completed_at, zone)}` : '',
        r.number,
        r.customer_name,
        r.phone,
        r.email,
        fullAddress(r),
        serviceLabel[r.service_type],
        statusLabel[r.status],
        r.failed_reason,
        r.recipient_name,
        r.proofs.some((p) => p.kind === 'signature') ? 'yes' : 'no',
        r.proofs.filter((p) => p.kind === 'photo').length,
        r.route?.name,
        r.route?.driver_id ? crews.names.get(r.route.driver_id) : '',
        r.driver_notes,
        r.rating,
        r.feedback,
        followupLabel[r.followup_status],
        r.followup_note,
      ]),
    ]),
  );
}
