import type { MapPoint, MapStore } from '@/components/base/map/PunchMap';
import { fmtDate, fmtShortTime, fmtTime } from './time';
import type { Location, TimeEntry } from './types';

/** Punch-in and punch-out pins for time cards (only punches that recorded a location). */
export function punchPoints(entries: TimeEntry[], zone: string, nameOf?: (employeeId: string) => string): MapPoint[] {
  return entries.flatMap((e) => {
    const name = nameOf?.(e.employee_id);
    const out: MapPoint[] = [];
    if (e.clock_in_lat != null && e.clock_in_lng != null) {
      out.push({
        kind: 'in',
        lat: e.clock_in_lat,
        lng: e.clock_in_lng,
        accuracy: e.clock_in_accuracy_m,
        time: fmtShortTime(e.clock_in_at, zone),
        when: `${fmtDate(new Date(e.clock_in_at), zone, 'EEE, MMM d')} · ${fmtTime(e.clock_in_at, zone)}`,
        place: e.clock_in_place,
        name,
        card: e.id,
      });
    }
    if (e.clock_out_at && e.clock_out_lat != null && e.clock_out_lng != null) {
      out.push({
        kind: 'out',
        lat: e.clock_out_lat,
        lng: e.clock_out_lng,
        accuracy: e.clock_out_accuracy_m,
        time: fmtShortTime(e.clock_out_at, zone),
        when: `${fmtDate(new Date(e.clock_out_at), zone, 'EEE, MMM d')} · ${fmtTime(e.clock_out_at, zone)}`,
        place: e.clock_out_place,
        name,
        card: e.id,
      });
    }
    return out;
  });
}

export function storePoints(locations: Location[]): MapStore[] {
  return locations
    .filter((l) => l.is_active && l.latitude != null && l.longitude != null)
    .map((l) => ({ name: l.name, lat: l.latitude!, lng: l.longitude!, radius: l.geofence_radius_m }));
}
