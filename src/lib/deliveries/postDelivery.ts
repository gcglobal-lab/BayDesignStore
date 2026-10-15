import 'server-only';
import { db, must } from '@/lib/base/db';
import { addDaysYmd, isYmd, todayYmd, zonedMidnight } from '@/lib/base/time';
import { followupLabel, type FollowupStatus, type Order } from './types';

export type PostRow = Order & { route: { name: string; driver_id: string | null } | null; proofs: { kind: string }[]; items: { id: string }[] };

/** Every finished delivery: proof of delivery, customer rating, and the office's follow-up. Kept permanently. */
export async function loadPostDelivery(sp: Record<string, string | string[] | undefined>, zone: string) {
  const today = todayYmd(zone);
  const from = isYmd(sp.from) ? (sp.from as string) : addDaysYmd(today, -29, zone);
  const to = isYmd(sp.to) ? (sp.to as string) : today;
  const outcome = sp.outcome === 'delivered' || sp.outcome === 'failed' ? sp.outcome : 'all';
  const follow = typeof sp.follow === 'string' && sp.follow in followupLabel ? (sp.follow as FollowupStatus) : null;
  const low = sp.rating === 'low';
  let q = db()
    .from('dl_orders')
    .select('*, route:dl_routes(name, driver_id), proofs:dl_proofs(kind), items:dl_order_items(id)')
    .in('status', outcome === 'all' ? ['delivered', 'failed'] : [outcome])
    .gte('completed_at', zonedMidnight(from, zone).toISOString())
    .lt('completed_at', zonedMidnight(addDaysYmd(to, 1, zone), zone).toISOString())
    .order('completed_at', { ascending: false })
    .limit(2000);
  if (follow) q = q.eq('followup_status', follow);
  if (low) q = q.lte('rating', 3);
  return { rows: must<PostRow[]>(await q, 'load completed deliveries'), from, to, outcome, follow, low };
}

