'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireAdmin } from '@/lib/base/auth';
import { diff } from '@/lib/base/activity';
import { db } from '@/lib/base/db';
import { CacheKeys, invalidate } from '@/lib/base/memo';
import { getSettings } from '@/lib/base/settings';
import { isYmd } from '@/lib/base/time';

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v));
const optionalNumber = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v)))
    .pipe(z.number().min(min).max(max).nullable());

const validTimezone = (tzName: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tzName });
    return true;
  } catch {
    return false;
  }
};

const settingsSchema = z.object({
  company_name: z.string().trim().min(1, 'Company name is required.').max(120),
  account_owner_name: text(120),
  phone: text(40),
  timezone: z.string().refine(validTimezone, 'Unknown timezone.'),
  week_start: z.coerce.number().int().min(0).max(6),
  pay_period_days: z.coerce.number().refine((n) => n === 7 || n === 14, 'Pay periods are weekly or every two weeks.'),
  pay_period_anchor: z.string().refine(isYmd, 'Pick the first day of a pay period.'),
  daily_overtime_hours: optionalNumber(1, 24),
  weekly_overtime_hours: optionalNumber(1, 168),
  require_location: z.boolean(),
  enforce_geofence: z.boolean(),
  early_clock_in_minutes: z.coerce.number().int().min(0).max(240),
  late_grace_minutes: z.coerce.number().int().min(0).max(120),
  paid_leave_days_per_year: z.coerce.number().min(0).max(365),
});

type SettingsField = keyof typeof settingsSchema.shape;
const BOOLEAN_FIELDS: SettingsField[] = ['require_location', 'enforce_geofence'];

/**
 * Saves one section of the settings page. Each section's form lists its fields in a hidden
 * `fields` input, so saving "Overtime" never touches the time clock options.
 */
export async function saveSettings(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireAdmin();
  const fields = String(formData.get('fields') ?? '')
    .split(',')
    .filter((f): f is SettingsField => f in settingsSchema.shape);
  if (!fields.length) return fail('Nothing to save.');
  const input = Object.fromEntries(fields.map((f) => [f, BOOLEAN_FIELDS.includes(f) ? formData.get(f) === 'on' : String(formData.get(f) ?? '')]));
  const schema = settingsSchema.pick(Object.fromEntries(fields.map((f) => [f, true])) as Partial<Record<SettingsField, true>>);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the settings.');

  const before = await getSettings();
  const { error } = await db().from('company_settings').update(parsed.data).eq('id', 1);
  if (error) return fail('Couldn’t save settings.');
  invalidate(CacheKeys.settings);
  const changes = diff(before as unknown as Record<string, unknown>, parsed.data as Record<string, unknown>);
  await audit(viewer, 'settings.update', 'company_settings', '1', { changes });
  revalidatePath('/base', 'layout');
  return done(changes.length ? 'Settings saved.' : 'Nothing changed.');
}

const locationSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, 'Location name is required.').max(120),
    phone: text(40),
    address1: text(200),
    address2: text(200),
    city: text(100),
    state: text(100),
    postal_code: text(20),
    country: z.string().trim().min(1).max(100),
    timezone: z.string().refine(validTimezone, 'Unknown timezone.'),
    business_type: text(80),
    business_category: text(80),
    website: text(200).refine((v) => v === null || /^https?:\/\/[^\s]+$/i.test(v), 'Website must start with http:// or https://'),
    latitude: optionalNumber(-90, 90),
    longitude: optionalNumber(-180, 180),
    geofence_radius_m: z.coerce.number().int().min(25, 'Geofence must be at least 25 m.').max(5000),
    is_active: z.boolean(),
  })
  .refine((v) => (v.latitude === null) === (v.longitude === null), 'Enter both latitude and longitude, or neither.');

export async function saveLocation(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireAdmin();
  const get = (k: string) => String(formData.get(k) ?? '');
  const parsed = locationSchema.safeParse({
    id: get('id') || undefined,
    name: get('name'),
    phone: get('phone'),
    address1: get('address1'),
    address2: get('address2'),
    city: get('city'),
    state: get('state'),
    postal_code: get('postal_code'),
    country: get('country') || 'United States',
    timezone: get('timezone') || 'America/New_York',
    business_type: get('business_type'),
    business_category: get('business_category'),
    website: get('website'),
    latitude: get('latitude'),
    longitude: get('longitude'),
    geofence_radius_m: get('geofence_radius_m') || '150',
    is_active: formData.get('is_active') === 'on',
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the location details.');
  const { id, ...row } = parsed.data;
  const before = id ? (await db().from('locations').select('*').eq('id', id).maybeSingle()).data : null;
  const res = id ? await db().from('locations').update(row).eq('id', id).select('id').single() : await db().from('locations').insert(row).select('id').single();
  if (res.error) return fail('Couldn’t save the location.');
  invalidate(CacheKeys.locations);
  await audit(viewer, id ? 'location.update' : 'location.create', 'locations', res.data.id, { name: row.name, changes: id ? diff(before, row) : undefined });
  revalidatePath('/base', 'layout');
  return done(id ? 'Location saved.' : 'Location added.');
}
