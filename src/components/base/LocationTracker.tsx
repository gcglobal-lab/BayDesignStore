'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPinOff, X } from 'lucide-react';
import { distanceMeters } from '@/lib/base/geo';
import { trackLocation, type LocationPing } from '@/app/base/(app)/my-week/track-actions';

/** Send at least this often while on the clock… */
const EVERY_MS = 2 * 60_000;
/** …and sooner when they've moved this far (but not more than once per MIN_GAP_MS). */
const MOVED_M = 150;
const MIN_GAP_MS = 30_000;
/** Report "location blocked" at most this often. */
const DENIED_EVERY_MS = 10 * 60_000;

/**
 * While the viewer is punched in and Base is open, sends their location every couple of
 * minutes (sooner when they move) so managers can see the shift's trail. Stops at punch
 * out. Browsers only share location while the page is open, so closing the app or
 * locking the phone shows up as a gap on the trail.
 */
export default function LocationTracker({ onClock }: { onClock: boolean }) {
  const [blocked, setBlocked] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const last = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const lastDenied = useRef(0);
  const stopped = useRef(false);

  useEffect(() => {
    if (!onClock || !('geolocation' in navigator)) return;
    stopped.current = false;
    let sending = false;

    const send = async (ping: LocationPing) => {
      if (sending || stopped.current) return;
      sending = true;
      try {
        const res = await trackLocation(ping);
        if (!res.tracking) stopped.current = true;
      } catch {
        // Offline or a deploy in progress: the next reading tries again.
      } finally {
        sending = false;
      }
    };

    const onFix = (pos: GeolocationPosition, force = false) => {
      setBlocked(false);
      const now = Date.now();
      const prev = last.current;
      const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords;
      const due = !prev || now - prev.at >= EVERY_MS;
      const moved = prev && now - prev.at >= MIN_GAP_MS && distanceMeters(prev.lat, prev.lng, lat, lng) >= MOVED_M;
      if (!force && !due && !moved) return;
      last.current = { at: now, lat, lng };
      void send({ status: 'ok', lat, lng, accuracy, speed: speed != null && speed >= 0 ? speed : null, ageMs: Math.max(0, now - pos.timestamp) });
    };

    const onError = (err: GeolocationPositionError) => {
      if (err.code !== err.PERMISSION_DENIED) return;
      setBlocked(true);
      if (Date.now() - lastDenied.current < DENIED_EVERY_MS) return;
      lastDenied.current = Date.now();
      void send({ status: 'denied' });
    };

    const watchId = navigator.geolocation.watchPosition(onFix, onError, { enableHighAccuracy: true, maximumAge: 30_000, timeout: 60_000 });
    // A phone sitting still may not report through the watch, so ask directly when a reading is due.
    const poll = () => {
      if (stopped.current || document.visibilityState !== 'visible') return;
      if (last.current && Date.now() - last.current.at < EVERY_MS) return;
      navigator.geolocation.getCurrentPosition((pos) => onFix(pos), onError, { enableHighAccuracy: true, maximumAge: 30_000, timeout: 30_000 });
    };
    const timer = window.setInterval(poll, 30_000);
    // Coming back to the app: report straight away so the gap ends where it really ended.
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || stopped.current) return;
      navigator.geolocation.getCurrentPosition((pos) => onFix(pos, true), onError, { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 });
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [onClock]);

  if (!onClock || !blocked || dismissed) return null;
  return (
    <div role="alert" className="fixed inset-x-4 top-4 z-[1000] mx-auto flex max-w-md items-start gap-3 rounded-2xl bg-rose-600 px-4 py-3 text-sm text-white shadow-xl">
      <MapPinOff size={18} className="mt-0.5 flex-none" />
      <p className="flex-1">
        <span className="font-semibold">Location is blocked.</span> While you’re on the clock, your manager sees “location off”. Allow location for this site in your browser settings.
      </p>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss" className="-mr-1 rounded-full p-1 hover:bg-white/20">
        <X size={16} />
      </button>
    </div>
  );
}
