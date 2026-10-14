'use server';

import { after } from 'next/server';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireEmployee } from '@/lib/base/auth';
import { db, isUniqueViolation } from '@/lib/base/db';
import { fmtDistance, matchLocation } from '@/lib/base/geo';
import { placeName } from '@/lib/base/placeName';
import { getOpenEntry, listLocations } from '@/lib/base/queries';
import { clientIp, userAgent } from '@/lib/base/request';
import { getSettings, type CompanySettings } from '@/lib/base/settings';
import { fmtTime } from '@/lib/base/time';

/** A GPS reading from the phone. `ageMs` is how old the reading was when sent (immune to a wrong phone clock). */
const fixSchema = z
  .object({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    accuracy: z.number().finite().min(0).max(100_000),
    ageMs: z.number().finite().min(-5_000).max(10 * 60_000),
  })
  .nullable();

export type GpsFix = z.infer<typeof fixSchema>;

const noteSchema = z
  .string()
  .trim()
  .max(300, 'Keep the note under 300 characters.')
  .transform((v) => v || null)
  .nullable();

type FixCheck =
  | { error: string }
  | {
      lat: number | null;
      lng: number | null;
      accuracy: number | null;
      distance: number | null;
      inside: boolean | null;
      locationId: string | null;
      /** "Uptown" / "Downtown" inside a store. Off site it's looked up after the response (see recordAddress). */
      place: string | null;
    };

async function checkFix(input: unknown, settings: CompanySettings, verb: 'in' | 'out', locationsPromise: ReturnType<typeof listLocations>): Promise<FixCheck> {
  const parsed = fixSchema.safeParse(input);
  if (!parsed.success) return { error: 'We couldn’t read your location. Please try again.' };
  const fix = parsed.data;

  if (!fix) {
    if (settings.require_location) return { error: `Your location is needed to punch ${verb}. Allow location access for this site, then try again.` };
    return { lat: null, lng: null, accuracy: null, distance: null, inside: null, locationId: null, place: null };
  }
  if (fix.ageMs > 2 * 60_000) return { error: 'That location reading is out of date. Please try again.' };
  // Any reading is accepted, wherever the phone is: the exact coordinates and how accurate
  // they were are stored with the punch, so a vague fix is visible rather than blocking work.

  const locations = (await locationsPromise).filter((l) => l.is_active);
  const match = matchLocation(fix.lat, fix.lng, fix.accuracy, locations);
  const location = locations.find((l) => l.id === match.locationId) ?? null;
  if (settings.enforce_geofence && match.inside === false) {
    return { error: `You’re about ${fmtDistance(match.distance)} from ${location?.name ?? 'the store'}. You can punch ${verb} once you’re on site.` };
  }
  return {
    lat: fix.lat,
    lng: fix.lng,
    accuracy: Math.round(fix.accuracy),
    distance: match.distance,
    inside: match.inside,
    // Off site the card belongs to no store; the address says where they were.
    locationId: match.inside ? match.locationId : null,
    place: match.inside && location ? location.name : null,
  };
}

/**
 * Off site, the street address is looked up after the punch is saved and the response is
 * sent (it can take a couple of seconds), so punching in never waits for it.
 */
function recordAddress(entryId: string, check: Extract<FixCheck, { lat: number | null }>, column: 'clock_in_place' | 'clock_out_place') {
  if (check.place || check.lat == null || check.lng == null) return;
  const { lat, lng } = check;
  after(async () => {
    const place = await placeName(lat, lng);
    const { error } = await db().from('time_entries').update({ [column]: place }).eq('id', entryId);
    if (error) console.error('[clock] saving the address failed', error.message);
  });
}

/** What the time clock needs to show the new state straight away (before the page refreshes). */
const punchData = (at: string, check: Extract<FixCheck, { lat: number | null }>): Record<string, string> => ({
  at,
  ...(check.lat != null && check.lng != null
    ? { lat: String(check.lat), lng: String(check.lng), accuracy: String(check.accuracy ?? ''), atStore: check.inside ? '1' : '', place: check.place ?? '' }
    : {}),
});

const where = (check: Extract<FixCheck, { lat: number | null }>) => (check.place ? ` at ${check.place}` : '');

export async function clockIn(fix: GpsFix, noteInput: string | null = null): Promise<ActionResult> {
  const viewer = await requireEmployee();
  const note = noteSchema.safeParse(noteInput);
  if (!note.success) return fail(note.error.issues[0]?.message ?? 'Check the note.');
  const now = new Date();
  // Everything the punch needs, fetched at the same time.
  const [settings, { data: shift }, ip, ua] = await Promise.all([
    getSettings(),
    // Link the time card to today's shift (published, starting within 4 hours either side).
    db()
      .from('shifts')
      .select('id, starts_at')
      .eq('employee_id', viewer.employeeId)
      .not('published_at', 'is', null)
      .gte('starts_at', new Date(now.getTime() - 4 * 3600_000).toISOString())
      .lte('starts_at', new Date(now.getTime() + 4 * 3600_000).toISOString())
      .order('starts_at')
      .limit(1)
      .maybeSingle(),
    clientIp(),
    userAgent(),
  ]);
  const check = await checkFix(fix, settings, 'in', listLocations());
  if ('error' in check) return fail(check.error);

  if (shift && settings.early_clock_in_minutes >= 0) {
    const earliest = new Date(shift.starts_at).getTime() - settings.early_clock_in_minutes * 60_000;
    if (now.getTime() < earliest) {
      return fail(`Your shift starts at ${fmtTime(shift.starts_at, settings.timezone)}. You can punch in from ${fmtTime(new Date(earliest), settings.timezone)}.`);
    }
  }

  const res = await db()
    .from('time_entries')
    .insert({
      employee_id: viewer.employeeId,
      shift_id: shift?.id ?? null,
      location_id: check.locationId,
      clock_in_at: now.toISOString(),
      clock_in_lat: check.lat,
      clock_in_lng: check.lng,
      clock_in_accuracy_m: check.accuracy,
      clock_in_distance_m: check.distance,
      clock_in_in_geofence: check.inside,
      clock_in_place: check.place,
      clock_in_note: note.data,
      clock_in_ip: ip,
      clock_in_user_agent: ua,
      source: 'web',
    })
    .select('id')
    .single();
  if (isUniqueViolation(res)) return fail('You’re already punched in.');
  if (res.error) {
    console.error('[clock] punch in failed', res.error.message);
    return fail('Punch in didn’t go through. Please try again.');
  }

  recordAddress(res.data.id, check, 'clock_in_place');
  await audit(viewer, 'clock.in', 'time_entries', res.data.id, { place: check.place, inside: check.inside, accuracy: check.accuracy });
  // No revalidatePath: the time clock updates itself at once and refreshes the page in the background.
  return done(`Punched in at ${fmtTime(now, settings.timezone)}${where(check)}.`, punchData(now.toISOString(), check));
}

export async function clockOut(fix: GpsFix): Promise<ActionResult> {
  const viewer = await requireEmployee();
  const [settings, entry, ip, ua] = await Promise.all([getSettings(), getOpenEntry(viewer.employeeId), clientIp(), userAgent()]);
  if (!entry) return fail('You’re not punched in.');

  const check = await checkFix(fix, settings, 'out', listLocations());
  if ('error' in check) return fail(check.error);

  const now = new Date().toISOString();
  // Punching out ends any break that's still running.
  await db().from('time_entry_breaks').update({ ended_at: now }).eq('time_entry_id', entry.id).is('ended_at', null);
  const { error } = await db()
    .from('time_entries')
    .update({
      clock_out_at: now,
      clock_out_lat: check.lat,
      clock_out_lng: check.lng,
      clock_out_accuracy_m: check.accuracy,
      clock_out_distance_m: check.distance,
      clock_out_in_geofence: check.inside,
      clock_out_place: check.place,
      clock_out_ip: ip,
      clock_out_user_agent: ua,
    })
    .eq('id', entry.id)
    .is('clock_out_at', null);
  if (error) {
    console.error('[clock] punch out failed', error.message);
    return fail('Punch out didn’t go through. Please try again.');
  }

  recordAddress(entry.id, check, 'clock_out_place');
  await audit(viewer, 'clock.out', 'time_entries', entry.id, { place: check.place, inside: check.inside, accuracy: check.accuracy });
  return done(`Punched out at ${fmtTime(now, settings.timezone)}${where(check)}. Have a good one!`, punchData(now, check));
}

export async function startBreak(type: 'rest' | 'meal'): Promise<ActionResult> {
  const viewer = await requireEmployee();
  if (type !== 'rest' && type !== 'meal') return fail('Unknown break type.');
  const entry = await getOpenEntry(viewer.employeeId);
  if (!entry) return fail('Punch in before starting a break.');
  const res = await db().from('time_entry_breaks').insert({ time_entry_id: entry.id, type, started_at: new Date().toISOString() });
  if (isUniqueViolation(res)) return fail('You’re already on a break.');
  if (res.error) return fail('Couldn’t start the break. Please try again.');
  await audit(viewer, 'clock.break_start', 'time_entries', entry.id, { type });
  return done(type === 'meal' ? 'Meal break started — enjoy!' : 'Rest break started.');
}

export async function endBreak(): Promise<ActionResult> {
  const viewer = await requireEmployee();
  const entry = await getOpenEntry(viewer.employeeId);
  if (!entry) return fail('You’re not punched in.');
  const { data, error } = await db()
    .from('time_entry_breaks')
    .update({ ended_at: new Date().toISOString() })
    .eq('time_entry_id', entry.id)
    .is('ended_at', null)
    .select('id');
  if (error) return fail('Couldn’t end the break. Please try again.');
  if (!data?.length) return fail('You’re not on a break.');
  await audit(viewer, 'clock.break_end', 'time_entries', entry.id);
  return done('Welcome back — break ended.');
}
