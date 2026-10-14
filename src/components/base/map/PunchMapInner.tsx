'use client';

import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPoint, MapStore } from './PunchMap';

// Both map styles work without any API key.
const TILES = {
  streets: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery &copy; Esri',
  },
} as const;

const COLORS = { in: '#059669', out: '#e11d48', store: '#4f46e5' };

function pin(kind: 'in' | 'out', label: string) {
  const color = COLORS[kind];
  return L.divIcon({
    className: '',
    iconSize: [44, 54],
    iconAnchor: [22, 52],
    popupAnchor: [0, -46],
    html: `<div style="position:relative;width:44px;height:54px;filter:drop-shadow(0 8px 10px rgba(23,23,58,.35))">
      <svg viewBox="0 0 44 54" width="44" height="54"><path d="M22 53C22 53 4 33.5 4 21.5a18 18 0 1 1 36 0C40 33.5 22 53 22 53z" fill="${color}" stroke="white" stroke-width="3"/></svg>
      <span style="position:absolute;top:10px;left:0;width:44px;text-align:center;color:white;font:700 10px/1.1 system-ui,sans-serif;letter-spacing:.04em">${kind === 'in' ? 'IN' : 'OUT'}<br/><span style="font-weight:600;font-size:8.5px">${label}</span></span>
    </div>`,
  });
}

const storeIcon = L.divIcon({
  className: '',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  html: `<div style="width:34px;height:34px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#7c3aed);border:3px solid white;box-shadow:0 8px 16px -6px rgba(79,70,229,.8);display:flex;align-items:center;justify-content:center">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1-5h16l1 5"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/></svg>
  </div>`,
});

/**
 * Centres the map on the punches. Maps inside a pop-up open before the pop-up has its final
 * size, so the map is re-measured (and re-centred) when it appears and whenever it resizes —
 * otherwise it shows a cut-off area and the pins sit off screen.
 */
function FitBounds({ points, stores }: { points: MapPoint[]; stores: MapStore[] }) {
  const map = useMap();
  useEffect(() => {
    const coords: [number, number][] = [...points.map((p) => [p.lat, p.lng] as [number, number]), ...(points.length ? [] : stores.map((s) => [s.lat, s.lng] as [number, number]))];
    const fit = () => {
      map.invalidateSize();
      if (coords.length === 0) return;
      if (coords.length === 1) map.setView(coords[0], 16, { animate: false });
      else map.fitBounds(L.latLngBounds(coords), { padding: [56, 56], maxZoom: 17, animate: false });
    };
    fit();
    const timers = [60, 250, 600].map((ms) => window.setTimeout(fit, ms));
    let last = '';
    const observer = new ResizeObserver(([entry]) => {
      const size = `${Math.round(entry.contentRect.width)}x${Math.round(entry.contentRect.height)}`;
      if (size !== last) {
        last = size;
        fit();
      }
    });
    observer.observe(map.getContainer());
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      observer.disconnect();
    };
  }, [map, points, stores]);
  return null;
}

export default function PunchMapInner({ points, stores, height }: { points: MapPoint[]; stores: MapStore[]; height: number }) {
  const [layer, setLayer] = useState<keyof typeof TILES>('streets');
  const center = useMemo<[number, number]>(() => (points[0] ? [points[0].lat, points[0].lng] : stores[0] ? [stores[0].lat, stores[0].lng] : [26.142, -81.795]), [points, stores]);
  // Punch-in → punch-out of the same card, drawn as a dashed route.
  const routes = useMemo(() => {
    const byCard = new Map<string, MapPoint[]>();
    for (const p of points) if (p.card) byCard.set(p.card, [...(byCard.get(p.card) ?? []), p]);
    return [...byCard.values()].filter((list) => list.length === 2).map((list) => list.map((p) => [p.lat, p.lng] as [number, number]));
  }, [points]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-stone/60 shadow-inner" style={{ height }}>
      <MapContainer center={center} zoom={15} scrollWheelZoom className="h-full w-full" attributionControl>
        <TileLayer key={layer} url={TILES[layer].url} attribution={TILES[layer].attribution} maxZoom={19} />
        <FitBounds points={points} stores={stores} />

        {stores.map((s) => (
          <Circle key={`fence-${s.name}`} center={[s.lat, s.lng]} radius={s.radius} pathOptions={{ color: COLORS.store, weight: 2, dashArray: '6 6', fillColor: COLORS.store, fillOpacity: 0.07 }} />
        ))}
        {stores.map((s) => (
          <Marker key={`store-${s.name}`} position={[s.lat, s.lng]} icon={storeIcon}>
            <Tooltip direction="top" offset={[0, -18]} opacity={1}>
              <span className="font-semibold">{s.name}</span>
            </Tooltip>
          </Marker>
        ))}

        {routes.map((r, i) => (
          <Polyline key={i} positions={r} pathOptions={{ color: '#7c3aed', weight: 3, dashArray: '2 8', lineCap: 'round', opacity: 0.85 }} />
        ))}

        {points.map((p, i) => (
          <Circle key={`acc-${i}`} center={[p.lat, p.lng]} radius={Math.min(p.accuracy ?? 0, 500)} pathOptions={{ color: COLORS[p.kind], weight: 1, fillColor: COLORS[p.kind], fillOpacity: 0.12 }} />
        ))}
        {points.map((p, i) => (
          <Marker key={`pin-${i}`} position={[p.lat, p.lng]} icon={pin(p.kind, p.time)}>
            <Popup>
              <div className="min-w-[200px] space-y-1 text-[13px]">
                {p.name && <p className="font-semibold">{p.name}</p>}
                <p>
                  <span className="font-semibold" style={{ color: COLORS[p.kind] }}>{p.kind === 'in' ? 'Punched in' : 'Punched out'}</span> · {p.when ?? p.time}
                </p>
                {p.place && <p className="text-[12px] text-gray-600">{p.place}</p>}
                {p.accuracy != null && <p className="text-[12px] text-gray-500">Accurate to ±{Math.round(p.accuracy)} m</p>}
                <a className="text-[12px] font-medium text-indigo-600" href={`https://www.google.com/maps?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`} target="_blank" rel="noopener noreferrer">
                  Open in Google Maps ↗
                </a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Layer switch */}
      <div className="absolute right-3 top-3 z-[500] flex rounded-full bg-white/95 p-1 text-xs font-semibold shadow-lg ring-1 ring-black/5 backdrop-blur">
        {(['streets', 'satellite'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setLayer(k)} className={`rounded-full px-3 py-1.5 capitalize transition-colors ${layer === k ? 'bg-ink text-white' : 'text-ink hover:bg-linen'}`}>
            {k === 'streets' ? 'Map' : 'Satellite'}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-[500] flex flex-wrap gap-x-3 gap-y-1 rounded-2xl bg-white/95 px-3 py-2 text-[11px] font-medium text-ink shadow-lg ring-1 ring-black/5 backdrop-blur">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS.in }} /> Punch in</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS.out }} /> Punch out</span>
        {stores.length > 0 && <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[4px]" style={{ background: COLORS.store }} /> Store &amp; geofence</span>}
      </div>
    </div>
  );
}
