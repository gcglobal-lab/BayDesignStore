'use client';

import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapDepot, MapRoute, MapStop } from './RouteMap';

const TILES = {
  streets: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Imagery &copy; Esri' },
} as const;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function stopIcon(label: string, color: string, state: 'open' | 'done' | 'failed') {
  const bg = state === 'done' ? '#059669' : state === 'failed' ? '#e11d48' : color;
  return L.divIcon({
    className: '',
    iconSize: [30, 38],
    iconAnchor: [15, 36],
    popupAnchor: [0, -30],
    html: `<div style="position:relative;width:30px;height:38px;filter:drop-shadow(0 6px 8px rgba(23,23,58,.35))">
      <svg viewBox="0 0 30 38" width="30" height="38"><path d="M15 37C15 37 2 23.5 2 14.5a13 13 0 1 1 26 0C28 23.5 15 37 15 37z" fill="${bg}" stroke="white" stroke-width="2.5"/></svg>
      <span style="position:absolute;top:6px;left:0;width:30px;text-align:center;color:white;font:700 11px/1.4 system-ui,sans-serif">${esc(label)}</span>
    </div>`,
  });
}

const depotIcon = L.divIcon({
  className: '',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  html: `<div style="width:34px;height:34px;border-radius:12px;background:linear-gradient(135deg,#17173a,#4f46e5);border:3px solid white;box-shadow:0 8px 16px -6px rgba(23,23,58,.8);display:flex;align-items:center;justify-content:center">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/></svg>
  </div>`,
});

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    const fit = () => {
      map.invalidateSize();
      if (points.length === 1) map.setView(points[0], 14, { animate: false });
      else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15, animate: false });
    };
    fit();
    const t = window.setTimeout(fit, 250);
    return () => window.clearTimeout(t);
  }, [map, points]);
  return null;
}

function StopPopup({ s }: { s: MapStop }) {
  return (
    <Popup>
      <div className="min-w-[180px] space-y-0.5 text-[13px] text-[#17173A]">
        <p className="font-semibold">{s.title}</p>
        {s.detail && <p className="text-[12px] text-gray-600">{s.detail}</p>}
        {s.href && <a href={s.href} className="text-[12px] font-medium text-indigo-600">Open order →</a>}
      </div>
    </Popup>
  );
}

export default function RouteMapInner({ routes, loose, depot, height }: { routes: MapRoute[]; loose: MapStop[]; depot: MapDepot; height: number }) {
  const [layer, setLayer] = useState<keyof typeof TILES>('streets');
  const points = useMemo<[number, number][]>(
    () => [...routes.flatMap((r) => r.stops.map((s) => [s.lat, s.lng] as [number, number])), ...loose.map((s) => [s.lat, s.lng] as [number, number]), ...(depot ? [[depot.lat, depot.lng] as [number, number]] : [])],
    [routes, loose, depot],
  );
  const center: [number, number] = points[0] ?? [26.142, -81.795];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-stone/60" style={{ height }}>
      <MapContainer center={center} zoom={12} scrollWheelZoom className="h-full w-full">
        <TileLayer key={layer} url={TILES[layer].url} attribution={TILES[layer].attribution} maxZoom={19} />
        <Fit points={points} />
        {depot && (
          <Marker position={[depot.lat, depot.lng]} icon={depotIcon}>
            <Popup><span className="text-[13px] font-semibold text-[#17173A]">{depot.name}</span></Popup>
          </Marker>
        )}
        {routes.map((r) => (
          <Polyline
            key={`line-${r.id}`}
            positions={[...(depot ? [[depot.lat, depot.lng] as [number, number]] : []), ...r.stops.map((s) => [s.lat, s.lng] as [number, number])]}
            pathOptions={{ color: r.color, weight: 4, opacity: 0.75, lineCap: 'round', dashArray: '1 8' }}
          />
        ))}
        {routes.flatMap((r) =>
          r.stops.map((s) => (
            <Marker key={`${r.id}-${s.id}`} position={[s.lat, s.lng]} icon={stopIcon(s.label, r.color, s.done ? 'done' : s.failed ? 'failed' : 'open')}>
              <StopPopup s={s} />
            </Marker>
          )),
        )}
        {loose.map((s) => (
          <Marker key={`loose-${s.id}`} position={[s.lat, s.lng]} icon={stopIcon('•', '#94a3b8', 'open')}>
            <StopPopup s={s} />
          </Marker>
        ))}
      </MapContainer>
      <div className="absolute right-3 top-3 z-[500] flex rounded-full bg-white/95 p-1 text-xs font-semibold text-[#17173A] shadow-lg ring-1 ring-black/5">
        {(['streets', 'satellite'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setLayer(k)} className={`rounded-full px-3 py-1.5 transition-colors ${layer === k ? 'bg-[#17173A] text-white' : 'hover:bg-gray-100'}`}>
            {k === 'streets' ? 'Map' : 'Satellite'}
          </button>
        ))}
      </div>
      {routes.length > 0 && (
        <div className="absolute bottom-3 left-3 z-[500] flex max-w-[90%] flex-wrap gap-x-3 gap-y-1 rounded-2xl bg-white/95 px-3 py-2 text-[11px] font-medium text-[#17173A] shadow-lg ring-1 ring-black/5">
          {routes.map((r) => <span key={r.id} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} /> {r.name}</span>)}
          {loose.length > 0 && <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-400" /> Not on a route</span>}
        </div>
      )}
    </div>
  );
}
