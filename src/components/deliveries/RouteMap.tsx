'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

export type MapStop = { id: string; lat: number; lng: number; label: string; title: string; detail?: string; done?: boolean; failed?: boolean; href?: string };
export type MapRoute = { id: string; name: string; color: string; stops: MapStop[] };
export type MapDepot = { name: string; lat: number; lng: number } | null;

// Leaflet needs the browser, so the map loads on the client only.
const Inner = dynamic(() => import('./RouteMapInner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-2 rounded-2xl bg-sand/40 text-sm text-muted">
      <Loader2 size={16} className="animate-spin" /> Loading map…
    </div>
  ),
});

/** Routes (numbered stops joined in order, one colour per truck), loose orders in grey, and the depot. */
export default function RouteMap({ routes, loose = [], depot, height = 420 }: { routes: MapRoute[]; loose?: MapStop[]; depot: MapDepot; height?: number }) {
  return (
    <div style={{ height }}>
      <Inner routes={routes} loose={loose} depot={depot} height={height} />
    </div>
  );
}
