import 'server-only';

/**
 * A readable street address for a GPS fix taken away from the stores ("1250 Gulf Shore
 * Blvd N, Naples, FL"), via OpenStreetMap's Nominatim. Called at clock in/out and
 * for the stops on a shift's trail. Falls back to the coordinates if the lookup is slow or fails —
 * clocking in never waits more than ~3 s on it.
 */
export async function placeName(lat: number, lng: number): Promise<string> {
  const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'BayDesignBase/1.0 (Bay Design Store time clock)', 'Accept-Language': 'en-US' },
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as { display_name?: string; address?: Record<string, string> };
    const a = data.address ?? {};
    const street = [a.house_number, a.road].filter(Boolean).join(' ') || a.neighbourhood || a.suburb || a.amenity;
    const town = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.county;
    const inUs = a.country_code === 'us';
    // "Naples, FL" at home; "Mumbai, Maharashtra, India" abroad.
    const state = inUs ? (a['ISO3166-2-lvl4']?.split('-')[1] ?? a.state) : a.state;
    const label = [street, town, state, inUs ? null : a.country].filter(Boolean).join(', ') || data.display_name;
    return (label || fallback).slice(0, 200);
  } catch {
    return fallback;
  }
}
