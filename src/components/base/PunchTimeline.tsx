import { ArrowRight, MapPin } from 'lucide-react';
import { mapLink } from '@/lib/base/geo';
import { workedMinutes } from '@/lib/base/queries';
import { fmtDuration, fmtShortTime, fmtTime } from '@/lib/base/time';
import type { TimeEntry } from '@/lib/base/types';

const HOUR = 3_600_000;

/**
 * Every punch in and out one person made in a day: a bar across the day with a segment per
 * time card (meal breaks in amber, a still-open card pulsing), then the list of punches with
 * times, places, worked time and the gaps in between. Collapsed until opened.
 */
export default function PunchTimeline({ entries, zone, now }: { entries: TimeEntry[]; zone: string; now: number }) {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => a.clock_in_at.localeCompare(b.clock_in_at));
  const endOf = (e: TimeEntry) => (e.clock_out_at ? new Date(e.clock_out_at).getTime() : now);
  const first = new Date(sorted[0].clock_in_at).getTime();
  const last = Math.max(...sorted.map(endOf));
  // Whole hours either side, at least two hours wide so short punches are still visible.
  const from = Math.floor(first / HOUR) * HOUR;
  const to = Math.max(Math.ceil(last / HOUR) * HOUR, from + 2 * HOUR);
  const pct = (t: number) => ((t - from) / (to - from)) * 100;
  const hours = Array.from({ length: Math.round((to - from) / HOUR) + 1 }, (_, i) => from + i * HOUR);
  const labelEvery = hours.length > 13 ? 3 : hours.length > 7 ? 2 : 1;
  const total = sorted.reduce((s, e) => s + workedMinutes(e, now), 0);

  return (
    <details className="group mt-2 basis-full">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-full border border-stone bg-white px-3 py-1 text-xs font-medium text-brass-dark transition-colors hover:border-brass/50 hover:bg-linen">
        <span className="transition-transform group-open:rotate-90">›</span>
        Timeline
        <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${sorted.length > 1 ? 'bg-amber-100 text-amber-800' : 'bg-linen text-muted'}`}>
          {sorted.length} punch{sorted.length === 1 ? '' : 'es'}
        </span>
      </summary>

      <div className="mt-3 rounded-2xl border border-stone/60 bg-gradient-to-br from-white to-linen/60 p-4">
        {/* Day bar */}
        <div className="relative h-4 rounded-full bg-sand/70">
          {hours.map((h) => (
            <span key={h} className="absolute top-0 h-full w-px bg-white/80" style={{ left: `${pct(h)}%` }} />
          ))}
          {sorted.map((e) => {
            const start = new Date(e.clock_in_at).getTime();
            const end = endOf(e);
            return (
              <span
                key={e.id}
                title={`${fmtTime(e.clock_in_at, zone)} – ${e.clock_out_at ? fmtTime(e.clock_out_at, zone) : 'now'} · ${fmtDuration(workedMinutes(e, now))}`}
                className={`absolute top-0 h-full rounded-full bg-gradient-to-r from-brass to-[#7C3AED] ${e.clock_out_at ? '' : 'animate-pulse'}`}
                style={{ left: `${pct(start)}%`, width: `max(${pct(end) - pct(start)}%, 6px)` }}
              >
                {e.breaks
                  .filter((b) => b.type === 'meal')
                  .map((b) => {
                    const bs = new Date(b.started_at).getTime();
                    const be = b.ended_at ? new Date(b.ended_at).getTime() : now;
                    return (
                      <span
                        key={b.id}
                        className="absolute top-0 h-full rounded-full bg-amber-400"
                        style={{ left: `${((bs - start) / Math.max(1, end - start)) * 100}%`, width: `${((be - bs) / Math.max(1, end - start)) * 100}%` }}
                      />
                    );
                  })}
              </span>
            );
          })}
        </div>
        <div className="relative mt-1 h-4 text-[0.62rem] text-muted">
          {hours.map((h, i) =>
            i % labelEvery === 0 ? (
              <span key={h} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${pct(h)}%` }}>
                {fmtShortTime(new Date(h), zone)}
              </span>
            ) : null,
          )}
        </div>

        {/* Punches */}
        <ol className="mt-4 space-y-2">
          {sorted.map((e, i) => {
            const prev = sorted[i - 1];
            const gap = prev?.clock_out_at ? (new Date(e.clock_in_at).getTime() - new Date(prev.clock_out_at).getTime()) / 60_000 : null;
            return (
              <li key={e.id}>
                {gap != null && gap > 0 && <p className="mb-2 ml-9 text-[0.68rem] italic text-muted">Off the clock for {fmtDuration(gap)}</p>}
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-xl bg-white px-3 py-2 text-xs shadow-sm ring-1 ring-stone/50">
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-gradient-to-br from-brass to-[#7C3AED] text-[0.65rem] font-semibold text-white">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 font-medium text-ink">
                      <span className="text-emerald-700">In {fmtTime(e.clock_in_at, zone)}</span>
                      <ArrowRight size={12} className="text-muted" />
                      {e.clock_out_at ? <span className="text-sky-700">Out {fmtTime(e.clock_out_at, zone)}</span> : <span className="text-emerald-700">still on the clock</span>}
                    </span>
                    <span className="mt-0.5 block text-muted">
                      {e.clock_in_lat != null && e.clock_in_lng != null ? (
                        <a href={mapLink(e.clock_in_lat, e.clock_in_lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                          <MapPin size={11} /> {e.clock_in_place ?? 'Punch-in location'}
                        </a>
                      ) : (
                        'No punch-in location'
                      )}
                      {e.clock_out_place && e.clock_out_place !== e.clock_in_place && <> → {e.clock_out_place}</>}
                      {e.clock_in_note && <> · {e.clock_in_note}</>}
                    </span>
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-800">{fmtDuration(workedMinutes(e, now))}</span>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-right text-xs text-muted">
          Worked across {sorted.length} punch{sorted.length === 1 ? '' : 'es'}: <span className="font-semibold text-ink">{fmtDuration(total)}</span>
        </p>
      </div>
    </details>
  );
}
