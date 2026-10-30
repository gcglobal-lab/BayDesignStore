import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, Car, LocateFixed, MapPin, MapPinOff, Navigation, SignalZero } from 'lucide-react';
import AutoRefresh from '@/components/base/AutoRefresh';
import PunchMap, { type MapPoint, type MapTrail } from '@/components/base/map/PunchMap';
import { Avatar, EmptyState, PageHeader } from '@/components/base/ui';
import { audit } from '@/lib/base/audit';
import { requireManager } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { fmtDistance, mapLink, matchLocation } from '@/lib/base/geo';
import { punchPoints, storePoints } from '@/lib/base/mapPoints';
import { memo } from '@/lib/base/memo';
import { placeName } from '@/lib/base/placeName';
import { listEmployees, listEntries, listLocations } from '@/lib/base/queries';
import { getSettings } from '@/lib/base/settings';
import { dayRangeIso, fmtDate, fmtDuration, fmtShortTime, fmtTime, isYmd, todayYmd } from '@/lib/base/time';
import { buildTrail, PING_RETENTION_DAYS, type Ping, type TrailEvent } from '@/lib/base/trail';
import { fullName, type Location } from '@/lib/base/types';

export const metadata: Metadata = { title: 'Live Map' };

type Latest = { ok: Ping | null; any: Ping | null };

const PING_COLUMNS = 'recorded_at, status, lat, lng, accuracy_m';

async function latestPings(entryId: string): Promise<Latest> {
  const [ok, any] = await Promise.all([
    db().from('location_pings').select(PING_COLUMNS).eq('time_entry_id', entryId).eq('status', 'ok').order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
    db().from('location_pings').select(PING_COLUMNS).eq('time_entry_id', entryId).order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  return { ok: (ok.data as Ping | null) ?? null, any: (any.data as Ping | null) ?? null };
}

/** Every reading on one time card, a page at a time (the API returns at most 1,000 rows per request). */
async function entryPings(entryId: string): Promise<Ping[]> {
  const out: Ping[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from('location_pings').select(PING_COLUMNS).eq('time_entry_id', entryId).order('recorded_at').range(from, from + 999);
    if (error) throw new Error(`load the location trail: ${error.message}`);
    out.push(...(data as Ping[]));
    if (data.length < 1000) return out;
  }
}

// OpenStreetMap's address lookup allows about one request a second, so lookups wait their turn.
let lookupQueue: Promise<unknown> = Promise.resolve();
function queuedPlaceName(lat: number, lng: number): Promise<string> {
  return memo(`trail-place:${lat.toFixed(4)},${lng.toFixed(4)}`, 24 * 3600_000, () => {
    const run = lookupQueue.then(() => placeName(lat, lng));
    lookupQueue = run.then(() => new Promise((r) => setTimeout(r, 1100)));
    return run;
  });
}

/** The address of a stop: the store's name inside a geofence, otherwise the street address. */
async function StopPlace({ lat, lng, locations }: { lat: number; lng: number; locations: Location[] }) {
  const match = matchLocation(lat, lng, 0, locations.filter((l) => l.is_active));
  const store = match.inside ? locations.find((l) => l.id === match.locationId)?.name : null;
  const label = store ?? (await queuedPlaceName(lat, lng));
  return (
    <a href={mapLink(lat, lng)} target="_blank" rel="noopener noreferrer" className="font-medium text-ink hover:underline">
      {label}
    </a>
  );
}

function ago(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  return `${Math.floor(min / 60)} h ${min % 60} min ago`;
}

/** Green while readings are fresh, amber after 10 minutes, red after 30 (or when location is blocked). */
function SeenBadge({ latest, now }: { latest: Latest; now: number }) {
  if (latest.any?.status === 'denied' && (!latest.ok || latest.any.recorded_at > latest.ok.recorded_at)) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[0.7rem] font-semibold text-rose-800"><MapPinOff size={11} /> Location blocked</span>;
  }
  if (!latest.ok) return <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[0.7rem] font-semibold text-rose-800"><SignalZero size={11} /> No location yet</span>;
  const min = (now - new Date(latest.ok.recorded_at).getTime()) / 60_000;
  const tone = min <= 10 ? 'bg-emerald-100 text-emerald-800' : min <= 30 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800';
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${tone}`}><LocateFixed size={11} /> {ago(latest.ok.recorded_at, now)}</span>;
}

function EventRow({ ev, zone, locations }: { ev: TrailEvent; zone: string; locations: Location[] }) {
  const span = `${fmtTime(ev.from, zone)} – ${fmtTime(ev.to, zone)}`;
  if (ev.kind === 'stop') {
    return (
      <li className="flex items-start gap-3 rounded-xl bg-white px-3 py-2.5 text-sm shadow-sm ring-1 ring-stone/50">
        <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-amber-500 text-white"><MapPin size={14} /></span>
        <span className="min-w-0 flex-1">
          <Suspense fallback={<span className="text-muted">Looking up the address…</span>}>
            <StopPlace lat={ev.lat} lng={ev.lng} locations={locations} />
          </Suspense>
          <span className="block text-xs text-muted">Stayed {span}</span>
        </span>
        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">{fmtDuration(ev.minutes)}</span>
      </li>
    );
  }
  if (ev.kind === 'move') {
    return (
      <li className="ml-3 flex items-center gap-2 border-l-2 border-dashed border-violet-300 py-1 pl-5 text-xs text-muted">
        <Car size={13} className="text-violet-600" /> Travelled {fmtDistance(ev.meters)} · {span}
      </li>
    );
  }
  return (
    <li className="flex items-start gap-3 rounded-xl bg-rose-50 px-3 py-2.5 text-sm ring-1 ring-rose-200">
      <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-rose-500 text-white">{ev.reason === 'denied' ? <MapPinOff size={14} /> : <SignalZero size={14} />}</span>
      <span className="min-w-0 flex-1">
        <span className="font-medium text-rose-900">{ev.reason === 'denied' ? 'Location blocked on the phone' : 'No location received'}</span>
        <span className="block text-xs text-rose-800/80">{span} · Base was closed, the phone was locked, or it had no signal</span>
      </span>
      <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-rose-800">{fmtDuration(ev.minutes)}</span>
    </li>
  );
}

export default async function LiveMapPage({ searchParams }: PageProps<'/base/live'>) {
  const viewer = await requireManager();
  const params = await searchParams;
  const settings = await getSettings();
  const zone = settings.timezone;
  const today = todayYmd(zone);
  const day = typeof params.day === 'string' && isYmd(params.day) && params.day <= today ? params.day : today;
  const entryId = typeof params.entry === 'string' ? params.entry : null;
  const [dayStart, dayEnd] = dayRangeIso(day, zone);
  const now = Date.now();

  const [employees, locations, dayEntries] = await Promise.all([listEmployees(), listLocations(), listEntries(dayStart, dayEnd)]);
  const nameOf = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? fullName(e) : 'Former team member';
  };
  const entries = [...dayEntries].sort((a, b) => Number(!!a.clock_out_at) - Number(!!b.clock_out_at) || a.clock_in_at.localeCompare(b.clock_in_at));
  const latest = new Map(await Promise.all(entries.map(async (e) => [e.id, await latestPings(e.id)] as const)));
  const stores = storePoints(locations);
  const selected = entries.find((e) => e.id === entryId) ?? null;
  const href = (q: { day?: string; entry?: string }) => `/base/live?${new URLSearchParams({ ...(q.day && q.day !== today ? { day: q.day } : {}), ...(q.entry ? { entry: q.entry } : {}) })}`;

  let detail: { points: MapPoint[]; trail: MapTrail; built: ReturnType<typeof buildTrail> } | null = null;
  if (selected) {
    const pings = await entryPings(selected.id);
    const built = buildTrail(pings, selected.clock_in_at, selected.clock_out_at ?? new Date(now).toISOString());
    const points = punchPoints([selected], zone);
    if (!selected.clock_out_at && built.last) {
      points.push({ kind: 'now', lat: built.last.lat, lng: built.last.lng, accuracy: built.last.accuracy, time: fmtShortTime(built.last.at, zone), when: `${fmtTime(built.last.at, zone)} (${ago(built.last.at, now)})`, place: null, name: nameOf(selected.employee_id) });
    }
    const trail: MapTrail = {
      segments: built.segments,
      stops: built.stops.map((s) => ({ lat: s.lat, lng: s.lng, label: `Stayed ${fmtTime(s.from, zone)} – ${fmtTime(s.to, zone)} (${fmtDuration(s.minutes)})` })),
    };
    detail = { points, trail, built };
    await audit(viewer, 'location.view_trail', 'time_entries', selected.id, { employee: nameOf(selected.employee_id), day });
  }

  // Overview: where everyone still on the clock was last seen.
  const livePoints: MapPoint[] = entries.flatMap((e) => {
    const ok = latest.get(e.id)?.ok;
    if (e.clock_out_at || !ok || ok.lat == null || ok.lng == null) return [];
    return [{ kind: 'now' as const, lat: ok.lat, lng: ok.lng, accuracy: ok.accuracy_m, time: fmtShortTime(ok.recorded_at, zone), when: `${fmtTime(ok.recorded_at, zone)} (${ago(ok.recorded_at, now)})`, place: null, name: nameOf(e.employee_id) }];
  });

  const onClock = entries.filter((e) => !e.clock_out_at).length;

  return (
    <>
      {day === today && <AutoRefresh seconds={60} />}
      <PageHeader
        eyebrow="Team"
        title="Live Map"
        description={`Where people are while they’re on the clock. Phones share their location every few minutes while Base is open; nothing is recorded off the clock. Readings are kept for ${PING_RETENTION_DAYS} days.`}
        actions={
          <form action="/base/live" className="flex items-center gap-2">
            <input type="date" name="day" defaultValue={day} max={today} className="b-input !w-auto" aria-label="Day" />
            <button type="submit" className="b-btn-ghost">Show</button>
          </form>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section className="b-card !rounded-xl p-4">
          <h2 className="mb-3 flex items-center justify-between text-sm font-semibold">
            <span>{day === today ? 'Today' : fmtDate(day, zone, 'EEE, MMM d')}</span>
            <span className="text-xs font-medium text-muted">{onClock} on the clock</span>
          </h2>
          {entries.length === 0 ? (
            <EmptyState icon={<Navigation size={20} />} title="No one punched in">Time cards for this day will show here.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {entries.map((e) => {
                const name = nameOf(e.employee_id);
                const active = e.id === selected?.id;
                return (
                  <li key={e.id}>
                    <Link
                      href={href({ day, entry: e.id })}
                      scroll={false}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 transition-colors ${active ? 'bg-violet-50 ring-violet-300' : 'bg-white ring-stone/50 hover:bg-linen'}`}
                    >
                      <Avatar name={name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{name}</span>
                        <span className="block text-xs text-muted">
                          {fmtTime(e.clock_in_at, zone)} – {e.clock_out_at ? fmtTime(e.clock_out_at, zone) : 'now'}
                          {e.clock_in_note && <> · {e.clock_in_note}</>}
                        </span>
                      </span>
                      {e.clock_out_at ? <span className="b-badge-gray">Done</span> : <SeenBadge latest={latest.get(e.id)!} now={now} />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="min-w-0 space-y-4">
          {selected && detail ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  {nameOf(selected.employee_id)} · {fmtTime(selected.clock_in_at, zone)} – {selected.clock_out_at ? fmtTime(selected.clock_out_at, zone) : 'now'}
                </h2>
                <Link href={href({ day })} scroll={false} className="b-btn-ghost b-btn-sm"><ArrowLeft size={14} /> Everyone</Link>
              </div>
              <PunchMap points={detail.points} stores={stores} trail={detail.trail} height={440} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Location coverage', value: `${Math.round(detail.built.coverage * 100)}%`, warn: detail.built.coverage < 0.8 },
                  { label: 'Stops', value: String(detail.built.stops.length), warn: false },
                  { label: 'Travelled', value: fmtDistance(detail.built.meters), warn: false },
                  { label: 'No location', value: fmtDuration(detail.built.gaps.reduce((s, g) => s + g.minutes, 0)), warn: detail.built.gaps.length > 0 },
                ].map((c) => (
                  <div key={c.label} className={`rounded-xl px-4 py-3 ring-1 ${c.warn ? 'bg-rose-50 ring-rose-200' : 'bg-white ring-stone/50'}`}>
                    <p className="text-xs text-muted">{c.label}</p>
                    <p className={`text-xl font-semibold tabular-nums ${c.warn ? 'text-rose-800' : 'text-ink'}`}>{c.value}</p>
                  </div>
                ))}
              </div>
              <ol className="space-y-2">
                <li className="flex items-center gap-3 text-sm">
                  <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-emerald-600 text-[0.6rem] font-bold text-white">IN</span>
                  Punched in at {fmtTime(selected.clock_in_at, zone)}
                  {selected.clock_in_place && <span className="text-muted">· {selected.clock_in_place}</span>}
                </li>
                {detail.built.events.map((ev, i) => (
                  <EventRow key={i} ev={ev} zone={zone} locations={locations} />
                ))}
                <li className="flex items-center gap-3 text-sm">
                  {selected.clock_out_at ? (
                    <>
                      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-rose-600 text-[0.55rem] font-bold text-white">OUT</span>
                      Punched out at {fmtTime(selected.clock_out_at, zone)}
                      {selected.clock_out_place && <span className="text-muted">· {selected.clock_out_place}</span>}
                    </>
                  ) : (
                    <>
                      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-blue-600 text-[0.55rem] font-bold text-white">NOW</span>
                      Still on the clock{detail.built.last && <span className="text-muted">· last seen {ago(detail.built.last.at, now)}</span>}
                    </>
                  )}
                </li>
              </ol>
            </>
          ) : (
            <>
              <PunchMap points={livePoints} stores={stores} height={520} />
              <p className="text-xs text-muted">
                {day === today
                  ? 'Blue pins show where each person on the clock was last seen. Pick a name to see their whole route for the shift: stops, travel and any time with no location.'
                  : 'Pick a name to see their route for that shift.'}
              </p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
