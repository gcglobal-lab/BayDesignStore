import { distanceMeters } from './geo';

/** Raw readings are deleted after this many days; punch-in/out locations stay with the time card. */
export const PING_RETENTION_DAYS = 90;

export type Ping = {
  recorded_at: string;
  status: 'ok' | 'denied' | 'unavailable';
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
};

/** Somewhere they stayed (within STOP_RADIUS_M) for at least STOP_MIN_MINUTES. */
export type Stop = { lat: number; lng: number; from: string; to: string; minutes: number };
/** A stretch of the shift with no usable reading: app closed, phone locked, or location off. */
export type Gap = { from: string; to: string; minutes: number; reason: 'no-signal' | 'denied' };
export type TrailEvent = ({ kind: 'stop' } & Stop) | ({ kind: 'gap' } & Gap) | { kind: 'move'; from: string; to: string; meters: number };

export type Trail = {
  /** Line segments to draw; broken wherever there is a gap. */
  segments: [number, number][][];
  stops: Stop[];
  gaps: Gap[];
  events: TrailEvent[];
  meters: number;
  /** Share of the shift (0–1) covered by readings. */
  coverage: number;
  last: { lat: number; lng: number; at: string; accuracy: number | null } | null;
};

/** Readings vaguer than this are ignored (a cell-tower guess can be kilometres off). */
const MAX_ACCURACY_M = 300;
const STOP_RADIUS_M = 150;
const STOP_MIN_MINUTES = 8;
/** No reading for this long counts as a gap (the phone sends every ~2 minutes). */
const GAP_MINUTES = 12;

const ms = (iso: string) => new Date(iso).getTime();
const minutesBetween = (a: string, b: string) => Math.max(0, (ms(b) - ms(a)) / 60_000);

/**
 * Turns one time card's readings into stops, movement and gaps. The shift runs from
 * `startIso` (punch in) to `endIso` (punch out, or now while still on the clock).
 */
export function buildTrail(pings: Ping[], startIso: string, endIso: string): Trail {
  const sorted = [...pings].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  const fixes = sorted.filter((p): p is Ping & { lat: number; lng: number } => p.status === 'ok' && p.lat != null && p.lng != null && (p.accuracy_m ?? 0) <= MAX_ACCURACY_M);
  const deniedAt = sorted.filter((p) => p.status === 'denied').map((p) => ms(p.recorded_at));

  // Gaps: shift start → first fix, between fixes, last fix → shift end.
  const marks = [startIso, ...fixes.map((f) => f.recorded_at), endIso];
  const gaps: Gap[] = [];
  for (let i = 1; i < marks.length; i++) {
    const minutes = minutesBetween(marks[i - 1], marks[i]);
    if (minutes < GAP_MINUTES) continue;
    const denied = deniedAt.some((t) => t >= ms(marks[i - 1]) && t <= ms(marks[i]));
    gaps.push({ from: marks[i - 1], to: marks[i], minutes, reason: denied ? 'denied' : 'no-signal' });
  }
  const gapMinutes = gaps.reduce((s, g) => s + g.minutes, 0);
  const shiftMinutes = minutesBetween(startIso, endIso);

  // Line segments, broken at gaps.
  const segments: [number, number][][] = [];
  let current: [number, number][] = [];
  let meters = 0;
  for (let i = 0; i < fixes.length; i++) {
    const f = fixes[i];
    if (i > 0 && minutesBetween(fixes[i - 1].recorded_at, f.recorded_at) >= GAP_MINUTES) {
      if (current.length) segments.push(current);
      current = [];
    } else if (i > 0) {
      const step = distanceMeters(fixes[i - 1].lat, fixes[i - 1].lng, f.lat, f.lng);
      // GPS jitter while standing still isn't travel.
      if (step > Math.max(30, (f.accuracy_m ?? 0) + (fixes[i - 1].accuracy_m ?? 0))) meters += step;
    }
    current.push([f.lat, f.lng]);
  }
  if (current.length) segments.push(current);

  // Stops: runs of readings that stay near where the run started (a gap ends the run).
  const stops: Stop[] = [];
  let run: typeof fixes = [];
  const closeRun = () => {
    if (run.length >= 2) {
      const minutes = minutesBetween(run[0].recorded_at, run[run.length - 1].recorded_at);
      if (minutes >= STOP_MIN_MINUTES) {
        const lat = run.reduce((s, p) => s + p.lat, 0) / run.length;
        const lng = run.reduce((s, p) => s + p.lng, 0) / run.length;
        stops.push({ lat, lng, from: run[0].recorded_at, to: run[run.length - 1].recorded_at, minutes });
      }
    }
    run = [];
  };
  for (let i = 0; i < fixes.length; i++) {
    const f = fixes[i];
    const brokenByGap = i > 0 && minutesBetween(fixes[i - 1].recorded_at, f.recorded_at) >= GAP_MINUTES;
    if (run.length && (brokenByGap || distanceMeters(run[0].lat, run[0].lng, f.lat, f.lng) > STOP_RADIUS_M)) closeRun();
    run.push(f);
  }
  closeRun();

  // One chronological story: stops and gaps, with the travel between them.
  const events: TrailEvent[] = [...stops.map((s) => ({ kind: 'stop' as const, ...s })), ...gaps.map((g) => ({ kind: 'gap' as const, ...g }))].sort((a, b) => a.from.localeCompare(b.from));
  const story: TrailEvent[] = [];
  let cursor = startIso;
  for (const ev of [...events, null]) {
    const until = ev ? ev.from : endIso;
    const between = fixes.filter((f) => f.recorded_at >= cursor && f.recorded_at <= until);
    let moved = 0;
    for (let i = 1; i < between.length; i++) {
      const step = distanceMeters(between[i - 1].lat, between[i - 1].lng, between[i].lat, between[i].lng);
      if (step > Math.max(30, (between[i].accuracy_m ?? 0) + (between[i - 1].accuracy_m ?? 0))) moved += step;
    }
    if (moved >= 200) story.push({ kind: 'move', from: cursor, to: until, meters: moved });
    if (ev) {
      story.push(ev);
      if (ev.to > cursor) cursor = ev.to;
    }
  }

  const lastFix = fixes[fixes.length - 1];
  return {
    segments,
    stops,
    gaps,
    events: story,
    meters,
    coverage: shiftMinutes > 0 ? Math.max(0, Math.min(1, 1 - gapMinutes / shiftMinutes)) : 1,
    last: lastFix ? { lat: lastFix.lat, lng: lastFix.lng, at: lastFix.recorded_at, accuracy: lastFix.accuracy_m } : null,
  };
}
