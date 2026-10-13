/** OpenStreetMap preview of a GPS fix (no API key, no tracking scripts). */
export default function MapEmbed({ lat, lng, title }: { lat: number; lng: number; title: string }) {
  const d = 0.0035;
  const bbox = [lng - d, lat - d * 0.7, lng + d, lat + d * 0.7].map((n) => n.toFixed(6)).join(',');
  return (
    <iframe
      title={title}
      src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)},${lng.toFixed(6)}`}
      className="h-56 w-full rounded-2xl border border-stone/60"
      loading="lazy"
      referrerPolicy="no-referrer"
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
