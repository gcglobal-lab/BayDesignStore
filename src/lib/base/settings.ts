import 'server-only';
import { cache } from 'react';
import { db } from './db';
import { DEFAULT_TIMEZONE, isDbConfigured } from './env';
import { CacheKeys, memo } from './memo';

export type CompanySettings = {
  company_name: string;
  account_owner_name: string | null;
  phone: string | null;
  timezone: string;
  week_start: number;
  pay_period_days: number;
  pay_period_anchor: string;
  daily_overtime_hours: number | null;
  weekly_overtime_hours: number | null;
  require_location: boolean;
  enforce_geofence: boolean;
  max_accuracy_m: number;
  early_clock_in_minutes: number;
  late_grace_minutes: number;
  /** Paid-leave days everyone gets per year unless an allowance is set for them. */
  paid_leave_days_per_year: number;
};

export const DEFAULT_SETTINGS: CompanySettings = {
  company_name: 'Bay Design Store Warehouse & Showroom',
  account_owner_name: null,
  phone: null,
  timezone: DEFAULT_TIMEZONE,
  week_start: 1,
  pay_period_days: 14,
  pay_period_anchor: '2026-01-05',
  daily_overtime_hours: null,
  weekly_overtime_hours: 40,
  require_location: true,
  enforce_geofence: false,
  max_accuracy_m: 150,
  early_clock_in_minutes: 15,
  late_grace_minutes: 10,
  paid_leave_days_per_year: 10,
};

/** Company settings for this request (falls back to defaults before the database is connected). */
export const getSettings = cache(async (): Promise<CompanySettings> => {
  if (!isDbConfigured()) return DEFAULT_SETTINGS;
  return memo(CacheKeys.settings, 30_000, loadSettings).catch(() => DEFAULT_SETTINGS);
});

async function loadSettings(): Promise<CompanySettings> {
  const { data, error } = await db().from('company_settings').select('*').eq('id', 1).maybeSingle();
  if (error || !data) throw new Error(error?.message ?? 'The company settings row is missing.');
  return {
    ...DEFAULT_SETTINGS,
    ...data,
    daily_overtime_hours: data.daily_overtime_hours == null ? null : Number(data.daily_overtime_hours),
    weekly_overtime_hours: data.weekly_overtime_hours == null ? null : Number(data.weekly_overtime_hours),
    paid_leave_days_per_year: Number(data.paid_leave_days_per_year ?? DEFAULT_SETTINGS.paid_leave_days_per_year),
  };
}
