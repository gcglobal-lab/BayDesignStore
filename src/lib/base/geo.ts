/** Great-circle distance in metres between two GPS coordinates (haversine). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type GeoLocation = { id: string; name: string; latitude: number | null; longitude: number | null; geofence_radius_m: number };

/**
 * The closest store location to a GPS fix and whether the fix is inside its geofence.
 * A fix counts as inside if its accuracy circle overlaps the fence (capped at 100 m
 * so a very vague reading can't stretch the fence across town).
 */
export function matchLocation(lat: number, lng: number, accuracy: number, locations: GeoLocation[]) {
  let best: { location: GeoLocation; distance: number } | null = null;
  for (const location of locations) {
    if (location.latitude == null || location.longitude == null) continue;
    const distance = distanceMeters(lat, lng, location.latitude, location.longitude);
    if (!best || distance < best.distance) best = { location, distance };
  }
  if (!best) return { locationId: null, distance: null, inside: null };
  const inside = best.distance - Math.min(accuracy, 100) <= best.location.geofence_radius_m;
  return { locationId: best.location.id, distance: Math.round(best.distance), inside };
}

export const mapLink = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;

export function fmtDistance(m: number | null | undefined): string {
  if (m == null) return '—';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}
