'use client';

import { useEffect, useState, useTransition } from 'react';
import { Coffee, Loader2, LocateFixed, LogIn, LogOut, MapPin, MapPinOff, UtensilsCrossed } from 'lucide-react';
import type { ActionResult } from '@/lib/base/actionResult';
import { FormMessage } from './forms';
import { clockIn, clockOut, endBreak, startBreak, type GpsFix } from '@/app/base/(app)/my-week/clock-actions';

export type ClockState = {
  clockInAt: string | null;
  mealBreaks: { startedAt: string; endedAt: string | null }[]; // unpaid, so not counted as worked
  onBreak: { type: 'rest' | 'meal'; startedAt: string } | null;
  clockInPlace: { lat: number; lng: number; accuracy: number | null; atStore: boolean; place: string | null } | null;
  clockInNote: string | null;
};

export type ClockKind = { clockTitle: string; note: { label: string; placeholder: string } | null };

type Phase = { kind: 'idle' } | { kind: 'locating'; accuracy: number | null } | { kind: 'saving' };

/** How long a punch waits for the GPS to sharpen before using the best reading so far. */
const LOCATE_MS = 5000;

/**
 * Best GPS fix we can get in ~5 s: phones often start with a coarse Wi-Fi/cell
 * position and sharpen as GPS locks on, so keep watching and take the most precise.
 * If there's no reading at all by then (GPS still cold), take the first one that arrives.
 */
function getBestPosition(onProgress: (accuracy: number) => void): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('unsupported'));
    let best: GeolocationPosition | null = null;
    let lastError: GeolocationPositionError | null = null;
    let finished = false;
    let timeUp = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      navigator.geolocation.clearWatch(watchId);
      window.clearTimeout(timer);
      if (best) resolve(best);
      else reject(lastError ?? new Error('timeout'));
    };
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) {
          best = pos;
          onProgress(pos.coords.accuracy);
        }
        if (pos.coords.accuracy <= 20 || timeUp) finish();
      },
      (err) => {
        lastError = err;
        if (err.code === err.PERMISSION_DENIED || err.code === err.TIMEOUT) finish();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
    const timer = window.setTimeout(() => {
      timeUp = true;
      if (best) finish();
    }, LOCATE_MS);
  });
}

function locationError(err: unknown): string {
  if (err instanceof Error && err.message === 'unsupported') return 'This browser can’t share its location. Try Safari or Chrome on your phone.';
  const code = (err as GeolocationPositionError | undefined)?.code;
  if (code === 1) return 'Location access is blocked. Allow location for this site in your browser settings (and turn on Precise Location on iPhone), then try again.';
  if (code === 2) return 'Your location isn’t available right now. Turn on Location Services and try again.';
  return 'Finding your location took too long. Step near a window or outside and try again.';
}

const pad = (n: number) => String(n).padStart(2, '0');

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function TimeClock({
  state,
  timezone,
  requireLocation,
  nextShiftLabel,
  kind,
}: {
  state: ClockState;
  timezone: string;
  requireLocation: boolean;
  nextShiftLabel: string | null;
  kind: ClockKind;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [note, setNote] = useState('');
  const [result, setResult] = useState<ActionResult>(null);
  const [isPending, startTransition] = useTransition();
  const now = useNow(1000);

  const onClock = state.clockInAt !== null;
  const busy = phase.kind !== 'idle' || isPending;

  // Worked time ticks live: time since clock-in minus unpaid meal breaks.
  const meals = state.mealBreaks.reduce((sum, b) => sum + ((b.endedAt ? new Date(b.endedAt).getTime() : now) - new Date(b.startedAt).getTime()), 0);
  const worked = state.clockInAt ? Math.max(0, (now - new Date(state.clockInAt).getTime() - meals) / 60000) : 0;
  const workedLabel = `${Math.floor(worked / 60)}:${pad(Math.floor(worked % 60))}`;
  const breakFor = state.onBreak ? Math.max(0, Math.floor((now - new Date(state.onBreak.startedAt).getTime()) / 60000)) : 0;

  const clockTime = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(now);
  const clockDate = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric' }).format(now);
  const sinceLabel = state.clockInAt ? new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(state.clockInAt)).toLowerCase() : null;

  async function punch() {
    setResult(null);
    let fix: GpsFix = null;
    setPhase({ kind: 'locating', accuracy: null });
    try {
      const pos = await getBestPosition((accuracy) => setPhase({ kind: 'locating', accuracy }));
      fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, ageMs: Math.max(0, Date.now() - pos.timestamp) };
    } catch (err) {
      if (requireLocation) {
        setPhase({ kind: 'idle' });
        setResult({ ok: false, message: locationError(err) });
        return;
      }
    }
    setPhase({ kind: 'saving' });
    startTransition(async () => {
      const res = await (onClock ? clockOut(fix) : clockIn(fix, note));
      setResult(res);
      if (res?.ok) setNote('');
      setPhase({ kind: 'idle' });
    });
  }

  function onBreakAction(action: () => Promise<ActionResult>) {
    setResult(null);
    startTransition(async () => setResult(await action()));
  }

  return (
    <section className="b-card relative overflow-hidden">
      <div className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${onClock ? 'opacity-100' : 'opacity-0'} bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.10),transparent_60%)]`} />
      <div className="relative grid gap-6 p-5 sm:p-7 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="b-eyebrow">{kind.clockTitle}</p>
          <p className="mt-2 font-display text-5xl font-medium tabular-nums leading-none sm:text-6xl" suppressHydrationWarning>
            {clockTime.toLowerCase()}
          </p>
          <p className="mt-1 text-sm text-muted" suppressHydrationWarning>{clockDate}</p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {onClock ? (
              state.onBreak ? (
                <span className="b-badge-amber"><Coffee size={12} /> On {state.onBreak.type} break · {breakFor} min</span>
              ) : (
                <span className="b-badge-green">
                  <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
                  On the clock since {sinceLabel}
                </span>
              )
            ) : (
              <span className="b-badge-gray">Off the clock</span>
            )}
            {onClock && <span className="b-badge-gray tabular-nums" suppressHydrationWarning>Worked {workedLabel}</span>}
          </div>

          {!onClock && nextShiftLabel && <p className="mt-3 text-sm text-ink">Next shift: <span className="font-medium">{nextShiftLabel}</span></p>}

          {onClock && state.clockInPlace && (
            <a
              href={`https://www.google.com/maps?q=${state.clockInPlace.lat},${state.clockInPlace.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink"
            >
              <MapPin size={13} className={state.clockInPlace.atStore ? 'text-emerald-600' : 'text-brass'} />
              Punched in at {state.clockInPlace.place ?? 'your location'}
              {state.clockInPlace.accuracy != null && ` (±${state.clockInPlace.accuracy} m)`}
            </a>
          )}
          {onClock && state.clockInNote && <p className="mt-1 text-xs text-ink">{kind.note?.label.replace(' (optional)', '') ?? 'Note'}: <span className="font-medium">{state.clockInNote}</span></p>}

          {!onClock && kind.note && (
            <label className="mt-4 block max-w-sm">
              <span className="b-label">{kind.note.label}</span>
              <input
                className="b-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                placeholder={kind.note.placeholder}
                disabled={busy}
              />
            </label>
          )}
        </div>

        <div className="flex flex-col items-stretch gap-3 md:w-64">
          <button
            type="button"
            onClick={punch}
            disabled={busy || (onClock && state.onBreak !== null)}
            className={`group relative flex h-16 items-center justify-center gap-2.5 rounded-2xl text-base font-semibold text-white shadow-lg transition-all duration-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${
              onClock ? 'bg-ink shadow-ink/20 hover:bg-charcoal' : 'bg-gradient-to-br from-brass-light via-brass to-brass-dark shadow-brass/30 hover:brightness-105'
            }`}
          >
            {phase.kind === 'locating' ? (
              <><LocateFixed size={20} className="animate-pulse" /> Locating{phase.accuracy ? ` · ±${Math.round(phase.accuracy)} m` : '…'}</>
            ) : phase.kind === 'saving' || isPending ? (
              <><Loader2 size={20} className="animate-spin" /> Saving…</>
            ) : onClock ? (
              <><LogOut size={20} /> Punch out</>
            ) : (
              <><LogIn size={20} /> Punch in</>
            )}
          </button>

          {onClock && (
            state.onBreak ? (
              <button type="button" className="b-btn-ghost !py-2.5" disabled={busy} onClick={() => onBreakAction(endBreak)}>
                End {state.onBreak.type} break
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="b-btn-ghost !px-2 !py-2.5" disabled={busy} onClick={() => onBreakAction(() => startBreak('rest'))}>
                  <Coffee size={15} /> Rest break
                </button>
                <button type="button" className="b-btn-ghost !px-2 !py-2.5" disabled={busy} onClick={() => onBreakAction(() => startBreak('meal'))}>
                  <UtensilsCrossed size={15} /> Meal break
                </button>
              </div>
            )
          )}

          <p className="flex items-start gap-1.5 text-[0.72rem] leading-snug text-muted">
            {requireLocation ? <MapPin size={13} className="mt-px flex-none text-brass" /> : <MapPinOff size={13} className="mt-px flex-none" />}
            {requireLocation
              ? 'Works anywhere in the world. At a store we record Uptown or Downtown; anywhere else, the exact address. Only when you punch in and out — never in between.'
              : 'Location is recorded when available.'}
          </p>
        </div>
      </div>
      {result?.message && (
        <div className="relative border-t border-stone/50 px-5 py-4 sm:px-7">
          <FormMessage result={result} />
        </div>
      )}
    </section>
  );
}
