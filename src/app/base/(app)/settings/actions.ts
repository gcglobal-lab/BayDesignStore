'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireAdmin } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
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
});

export async function saveSettings(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireAdmin();
  const get = (k: string) => String(formData.get(k) ?? '');
  const parsed = settingsSchema.safeParse({
    company_name: get('company_name'),
    account_owner_name: get('account_owner_name'),
    phone: get('phone'),
    timezone: get('timezone'),
    week_start: get('week_start'),
    pay_period_days: get('pay_period_days'),
    pay_period_anchor: get('pay_period_anchor'),
    daily_overtime_hours: get('daily_overtime_hours'),
    weekly_overtime_hours: get('weekly_overtime_hours'),
    require_location: formData.get('require_location') === 'on',
    enforce_geofence: formData.get('enforce_geofence') === 'on',
    early_clock_in_minutes: get('early_clock_in_minutes'),
    late_grace_minutes: get('late_grace_minutes'),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the settings.');
  const { error } = await db().from('company_settings').upsert({ id: 1, ...parsed.data });
  if (error) return fail('Couldn’t save settings.');
  await audit(viewer, 'settings.update', 'company_settings', '1', parsed.data);
  revalidatePath('/base', 'layout');
  return done('Settings saved.');
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
  const res = id ? await db().from('locations').update(row).eq('id', id).select('id').single() : await db().from('locations').insert(row).select('id').single();
  if (res.error) return fail('Couldn’t save the location.');
  await audit(viewer, id ? 'location.update' : 'location.create', 'locations', res.data.id, { geofence: row.latitude !== null, radius: row.geofence_radius_m });
  revalidatePath('/base', 'layout');
  return done(id ? 'Location saved.' : 'Location added.');
}
