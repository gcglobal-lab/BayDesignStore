'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

/** One punch on the map. `card` links a punch-in to its punch-out (drawn as a route). */
export type MapPoint = {
  /** 'now' is someone's latest reading on the live map. */
  kind: 'in' | 'out' | 'now';
  lat: number;
  lng: number;
  accuracy: number | null;
  /** Short time on the pin, e.g. "9:02a". */
  time: string;
  /** Longer label in the pop-up, e.g. "Mon, Oct 12 · 9:02 am". */
  when?: string;
  place: string | null;
  name?: string;
  card?: string;
};
export type MapStore = { name: string; lat: number; lng: number; radius: number };
/** A shift's location trail: the path (broken at gaps) and the places they stayed. */
export type MapTrail = { segments: [number, number][][]; stops: { lat: number; lng: number; label: string }[] };

// Leaflet needs the browser (window), so it's only loaded on the client, when a map is shown.
const Inner = dynamic(() => import('./PunchMapInner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-linen to-violet-50 text-sm text-muted">
      <Loader2 size={16} className="animate-spin" /> Loading map…
    </div>
  ),
});

/** Interactive map of punch-in / punch-out locations with the stores and their geofences. */
export default function PunchMap({ points, stores = [], trail, height = 380 }: { points: MapPoint[]; stores?: MapStore[]; trail?: MapTrail; height?: number }) {
  return (
    <div style={{ height }}>
      <Inner points={points} stores={stores} trail={trail} height={height} />
    </div>
  );
}
