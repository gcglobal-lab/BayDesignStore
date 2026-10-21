import type { Metadata } from 'next';
import { DatePicker } from '@/components/base/calendar/Calendar';
import Link from 'next/link';
import { Camera, Download, PenLine, Star } from 'lucide-react';
import { Card, EmptyState, PageHeader } from '@/components/base/ui';
import FollowupForm from '@/components/deliveries/FollowupForm';
import { requireDeliveries } from '@/lib/base/auth';
import { getSettings } from '@/lib/base/settings';
import { fmtDate, fmtTime } from '@/lib/base/time';
import { loadPostDelivery } from '@/lib/deliveries/postDelivery';
import { getCrews } from '@/lib/deliveries/data';
import { followupLabel, followupTone, serviceLabel, statusLabel, statusTone, type FollowupStatus } from '@/lib/deliveries/types';
import Select from '@/components/ui/Select';

export const metadata: Metadata = { title: 'Post-delivery' };

export default async function PostDeliveryPage({ searchParams }: PageProps<'/base/deliveries/post-delivery'>) {
  await requireDeliveries({ dispatcher: true });
  const sp = await searchParams;
  const [{ timezone: zone }, crews] = await Promise.all([getSettings(), getCrews()]);
  const { rows, from, to, outcome, follow, low } = await loadPostDelivery(sp, zone);
  const rated = rows.filter((r) => r.rating);
  const avg = rated.length ? rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length : null;
  const qs = new URLSearchParams({ from, to, outcome, ...(follow ? { follow } : {}), ...(low ? { rating: 'low' } : {}) });

  return (
    <>
      <PageHeader
        plain
        title="Post-delivery"
        description="Every completed stop with its proof of delivery, the customer’s rating and your follow-up. Records are kept permanently."
        actions={<a href={`/base/deliveries/post-delivery/export?${qs}`} className="b-btn-ghost"><Download size={15} /> Export CSV</a>}
      />
      <form action="/base/deliveries/post-delivery" className="mb-5 flex flex-wrap items-center gap-2">
        <DatePicker name="from" defaultValue={from} compact className="w-48" aria-label="From" />
        <span className="text-muted">to</span>
        <DatePicker name="to" defaultValue={to} compact className="w-48" aria-label="To" />
        <Select name="outcome" defaultValue={outcome} className="b-input !w-auto !py-2" aria-label="Outcome">
          <option value="all">Delivered & not delivered</option>
          <option value="delivered">Delivered</option>
          <option value="failed">Not delivered</option>
        </Select>
        <Select name="follow" defaultValue={follow ?? ''} className="b-input !w-auto !py-2" aria-label="Follow-up">
          <option value="">Any follow-up</option>
          {(Object.keys(followupLabel) as FollowupStatus[]).map((k) => <option key={k} value={k}>{followupLabel[k]}</option>)}
        </Select>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="rating" value="low" defaultChecked={low} className="b-check" /> 3★ or less</label>
        <button className="b-btn-ghost" type="submit">Filter</button>
      </form>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Completed stops', String(rows.length)],
          ['Average rating', avg === null ? '—' : `${avg.toFixed(1)} ★`],
          ['Ratings received', `${rated.length}`],
          ['Need follow-up', String(rows.filter((r) => r.followup_status !== 'done').length)],
        ].map(([k, v]) => (
          <div key={k} className="b-card px-4 py-3"><p className="text-xs text-muted">{k}</p><p className="text-2xl font-semibold">{v}</p></div>
        ))}
      </div>

      <Card pad={false}>
        {rows.length === 0 ? (
          <EmptyState title="No completed deliveries match." />
        ) : (
          <div className="overflow-x-auto">
            <table className="b-table min-w-[1000px]">
              <thead><tr><th>Completed</th><th>Order</th><th>Outcome</th><th>Proof</th><th>Customer rating</th><th>Follow-up</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const sigs = r.proofs.filter((p) => p.kind === 'signature').length;
                  const photos = r.proofs.filter((p) => p.kind === 'photo').length;
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="whitespace-nowrap text-sm">{r.completed_at ? <>{fmtDate(new Date(r.completed_at), zone, 'MMM d, yyyy')}<p className="text-xs text-muted">{fmtTime(r.completed_at, zone)}</p></> : '—'}</td>
                      <td>
                        <Link href={`/base/deliveries/orders/${r.id}`} className="font-medium hover:text-brass-dark">#{r.number} · {r.customer_name}</Link>
                        <p className="text-xs text-muted">{serviceLabel[r.service_type]} · {r.items.length} item{r.items.length === 1 ? '' : 's'}{r.route ? ` · ${r.route.name}` : ''}{r.route?.driver_id ? ` · ${crews.names.get(r.route.driver_id)}` : ''}</p>
                      </td>
                      <td>
                        <span className={statusTone[r.status]}>{statusLabel[r.status]}</span>
                        {r.failed_reason && <p className="mt-1 text-xs text-red-700">{r.failed_reason}</p>}
                        {r.recipient_name && <p className="mt-1 text-xs text-muted">Received by {r.recipient_name}</p>}
                      </td>
                      <td className="whitespace-nowrap text-xs text-muted">
                        <span className={`mr-2 inline-flex items-center gap-1 ${sigs ? 'text-emerald-700' : ''}`}><PenLine size={12} /> {sigs ? 'Signed' : 'No signature'}</span>
                        <span className={`inline-flex items-center gap-1 ${photos ? 'text-emerald-700' : ''}`}><Camera size={12} /> {photos}</span>
                      </td>
                      <td className="max-w-[16rem]">
                        {r.rating ? (
                          <>
                            <p className="flex items-center gap-0.5">{Array.from({ length: 5 }, (_, n) => <Star key={n} size={13} className={n < r.rating! ? 'fill-amber-400 text-amber-400' : 'text-stone'} />)}</p>
                            {r.feedback && <p className="mt-1 line-clamp-3 text-xs text-ink/80">“{r.feedback}”</p>}
                          </>
                        ) : (
                          <span className="text-xs text-muted">{r.status === 'delivered' ? 'Not rated yet' : '—'}</span>
                        )}
                      </td>
                      <td>
                        <span className={followupTone[r.followup_status]}>{followupLabel[r.followup_status]}</span>
                        <div className="mt-1.5"><FollowupForm id={r.id} status={r.followup_status} note={r.followup_note} compact /></div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
