'use client';

import { useRef, useState, type ReactNode } from 'react';
import { LocateFixed, Loader2 } from 'lucide-react';
import type { CompanySettings } from '@/lib/base/settings';
import type { Location } from '@/lib/base/types';
import { ActionForm, Field, SubmitButton } from './forms';
import { DatePicker } from './calendar/Calendar';
import { saveLocation, saveSettings } from '@/app/base/(app)/settings/actions';
import Select from '@/components/ui/Select';

const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** One "label | control" row, like Homebase's settings panels. */
function Row({ label, hint, htmlFor, children }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 border-b border-stone/40 py-4 last:border-0 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center sm:gap-6">
      <div>
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink">{label}</label>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</p>}
      </div>
      <div className="max-w-md">{children}</div>
    </div>
  );
}

function Toggle({ name, defaultChecked, label, hint }: { name: string; defaultChecked: boolean; label: string; hint: string }) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <label className="flex cursor-pointer items-start justify-between gap-6 border-b border-stone/40 py-4 last:border-0">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted">{hint}</span>
      </span>
      <input type="checkbox" name={name} checked={on} onChange={(e) => setOn(e.target.checked)} className="peer sr-only" />
      <span className={`relative mt-0.5 inline-flex h-6 w-11 flex-none rounded-full transition-colors ${on ? 'bg-gradient-to-r from-indigo-500 to-violet-500' : 'bg-stone'}`} aria-hidden="true">
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </span>
    </label>
  );
}

/** A settings panel: title + Save in the header (like Homebase), rows below. Saves only its own fields. */
export function SettingsPanel({ title, description, fields, children }: { title: string; description?: string; fields: (keyof CompanySettings)[]; children: ReactNode }) {
  return (
    <ActionForm action={saveSettings} className="b-card overflow-hidden">
      <input type="hidden" name="fields" value={fields.join(',')} />
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone/50 bg-gradient-to-r from-white to-linen/60 px-5 py-5 sm:px-7">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">{title}</h2>
          {description && <p className="mt-1 max-w-xl text-sm text-muted">{description}</p>}
        </div>
        <SubmitButton className="b-btn-brass" pendingLabel="Saving…">Save</SubmitButton>
      </div>
      <div className="px-5 py-2 sm:px-7">{children}</div>
    </ActionForm>
  );
}

export function BasicInfoPanel({ settings }: { settings: CompanySettings }) {
  return (
    <SettingsPanel title="Basic info" description="Your company details. The timezone is used for every schedule, time card and report." fields={['company_name', 'account_owner_name', 'phone', 'timezone']}>
      <Row label="Company name" htmlFor="s-name"><input id="s-name" name="company_name" required maxLength={120} className="b-input" defaultValue={settings.company_name} /></Row>
      <Row label="Account owner" htmlFor="s-owner"><input id="s-owner" name="account_owner_name" maxLength={120} className="b-input" defaultValue={settings.account_owner_name ?? ''} /></Row>
      <Row label="Phone number" htmlFor="s-phone"><input id="s-phone" name="phone" maxLength={40} className="b-input" defaultValue={settings.phone ?? ''} /></Row>
      <Row label="Time zone" htmlFor="s-tz">
        <Select id="s-tz" name="timezone" className="b-input" defaultValue={settings.timezone}>
          {[...new Set([settings.timezone, ...TIMEZONES])].map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
        </Select>
      </Row>
    </SettingsPanel>
  );
}

export function SchedulePanel({ settings }: { settings: CompanySettings }) {
  return (
    <SettingsPanel title="Schedule enforcement" description="When people can punch in around their shifts, and when they count as late." fields={['early_clock_in_minutes', 'late_grace_minutes', 'week_start']}>
      <Row label="Early punch-in" hint="How many minutes before a shift someone may punch in." htmlFor="s-early">
        <div className="flex items-center gap-2"><input id="s-early" name="early_clock_in_minutes" type="number" min={0} max={240} className="b-input !w-28" defaultValue={settings.early_clock_in_minutes} /><span className="text-sm text-muted">minutes</span></div>
      </Row>
      <Row label="Late after" hint="Grace period before someone shows as “Late” on Manager View." htmlFor="s-late">
        <div className="flex items-center gap-2"><input id="s-late" name="late_grace_minutes" type="number" min={0} max={120} className="b-input !w-28" defaultValue={settings.late_grace_minutes} /><span className="text-sm text-muted">minutes</span></div>
      </Row>
      <Row label="Week starts on" htmlFor="s-ws">
        <Select id="s-ws" name="week_start" className="b-input" defaultValue={settings.week_start}>
          {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </Select>
      </Row>
    </SettingsPanel>
  );
}

export function TimeClockPanel({ settings }: { settings: CompanySettings }) {
  return (
    <SettingsPanel title="Time clock options" description="How punch in / punch out works on phones." fields={['require_location', 'enforce_geofence']}>
      <Toggle name="require_location" defaultChecked={settings.require_location} label="Require location" hint="People must share their GPS location to punch in or out. The location is recorded only at the punch — never in between." />
      <Toggle
        name="enforce_geofence"
        defaultChecked={settings.enforce_geofence}
        label="Only allow punching in on site"
        hint="Reject punch-ins outside every store’s geofence. Keep this off (recommended) so designers and drivers can punch in at clients — the street address is recorded instead."
      />
    </SettingsPanel>
  );
}

export function OvertimePanel({ settings }: { settings: CompanySettings }) {
  return (
    <SettingsPanel title="Overtime" description="Overtime is shown on timesheets and reports, estimated at 1.5× the hourly wage." fields={['weekly_overtime_hours', 'daily_overtime_hours']}>
      <Row label="Weekly overtime after" hint="Federal (FLSA) rule: 40. Leave empty to turn off." htmlFor="s-wot">
        <div className="flex items-center gap-2"><input id="s-wot" name="weekly_overtime_hours" type="number" step="0.5" min={1} max={168} className="b-input !w-28" defaultValue={settings.weekly_overtime_hours ?? ''} /><span className="text-sm text-muted">hours / week</span></div>
      </Row>
      <Row label="Daily overtime after" hint="Not required in Florida. Leave empty to turn off." htmlFor="s-dot">
        <div className="flex items-center gap-2"><input id="s-dot" name="daily_overtime_hours" type="number" step="0.5" min={1} max={24} className="b-input !w-28" defaultValue={settings.daily_overtime_hours ?? ''} /><span className="text-sm text-muted">hours / day</span></div>
      </Row>
    </SettingsPanel>
  );
}

export function PayrollPanel({ settings }: { settings: CompanySettings }) {
  return (
    <SettingsPanel title="Payroll settings" description="Pay periods used by timesheets and the payroll report." fields={['pay_period_days', 'pay_period_anchor']}>
      <Row label="Pay period" htmlFor="s-pp">
        <Select id="s-pp" name="pay_period_days" className="b-input" defaultValue={settings.pay_period_days}>
          <option value={7}>Weekly</option>
          <option value={14}>Every two weeks</option>
        </Select>
      </Row>
      <Row label="A pay period starts on" hint="Any past first day of a pay period." htmlFor="s-anchor">
        <DatePicker id="s-anchor" name="pay_period_anchor" required defaultValue={settings.pay_period_anchor} weekStart={settings.week_start} zone={settings.timezone} />
      </Row>
    </SettingsPanel>
  );
}

export function TimeOffPanel({ settings }: { settings: CompanySettings }) {
  return (
    <SettingsPanel title="Time off" description="Vacation and paid time off come out of each person’s paid-leave days (1 day = 8 hours)." fields={['paid_leave_days_per_year']}>
      <Row label="Paid leave per year" hint="Everyone without their own number for a year gets this. Set individual days in Time Off ▸ balances." htmlFor="s-pl">
        <div className="flex items-center gap-2"><input id="s-pl" name="paid_leave_days_per_year" type="number" step="0.5" min={0} max={365} className="b-input !w-28" defaultValue={settings.paid_leave_days_per_year} /><span className="text-sm text-muted">days</span></div>
      </Row>
    </SettingsPanel>
  );
}

export function LocationForm({ location }: { location?: Location }) {
  const lat = useRef<HTMLInputElement>(null);
  const lng = useRef<HTMLInputElement>(null);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  function useCurrentLocation() {
    if (!('geolocation' in navigator)) return setNote('This browser can’t share its location.');
    setLocating(true);
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (lat.current) lat.current.value = pos.coords.latitude.toFixed(6);
        if (lng.current) lng.current.value = pos.coords.longitude.toFixed(6);
        setNote(`Set from this device (accurate to ±${Math.round(pos.coords.accuracy)} m). Save to apply.`);
        setLocating(false);
      },
      (err) => {
        setNote(err.code === 1 ? 'Location access was blocked for this site.' : 'Couldn’t get a location. Try again near a window.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  return (
    <ActionForm action={saveLocation}>
      {location && <input type="hidden" name="id" value={location.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Location name" htmlFor={`l-name-${location?.id}`}><input id={`l-name-${location?.id}`} name="name" required maxLength={120} className="b-input" defaultValue={location?.name ?? ''} /></Field>
        <Field label="Location phone" htmlFor={`l-phone-${location?.id}`}><input id={`l-phone-${location?.id}`} name="phone" maxLength={40} className="b-input" defaultValue={location?.phone ?? ''} /></Field>
        <Field label="Address 1" htmlFor={`l-a1-${location?.id}`}><input id={`l-a1-${location?.id}`} name="address1" maxLength={200} className="b-input" defaultValue={location?.address1 ?? ''} /></Field>
        <Field label="Address 2" htmlFor={`l-a2-${location?.id}`}><input id={`l-a2-${location?.id}`} name="address2" maxLength={200} className="b-input" defaultValue={location?.address2 ?? ''} /></Field>
        <Field label="City" htmlFor={`l-city-${location?.id}`}><input id={`l-city-${location?.id}`} name="city" maxLength={100} className="b-input" defaultValue={location?.city ?? 'Naples'} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="State" htmlFor={`l-state-${location?.id}`}><input id={`l-state-${location?.id}`} name="state" maxLength={100} className="b-input" defaultValue={location?.state ?? 'Florida'} /></Field>
          <Field label="Zip code" htmlFor={`l-zip-${location?.id}`}><input id={`l-zip-${location?.id}`} name="postal_code" maxLength={20} className="b-input" defaultValue={location?.postal_code ?? ''} /></Field>
        </div>
        <Field label="Country" htmlFor={`l-country-${location?.id}`}><input id={`l-country-${location?.id}`} name="country" maxLength={100} className="b-input" defaultValue={location?.country ?? 'United States'} /></Field>
        <Field label="Timezone" htmlFor={`l-tz-${location?.id}`}>
          <Select id={`l-tz-${location?.id}`} name="timezone" className="b-input" defaultValue={location?.timezone ?? 'America/New_York'}>
            {[...new Set([location?.timezone ?? 'America/New_York', ...TIMEZONES])].map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </Select>
        </Field>
        <Field label="Business type" htmlFor={`l-bt-${location?.id}`}><input id={`l-bt-${location?.id}`} name="business_type" maxLength={80} className="b-input" defaultValue={location?.business_type ?? 'Retail'} /></Field>
        <Field label="Business category" htmlFor={`l-bc-${location?.id}`}><input id={`l-bc-${location?.id}`} name="business_category" maxLength={80} className="b-input" defaultValue={location?.business_category ?? 'Furniture/Home Goods'} /></Field>
        <Field label="Website" htmlFor={`l-web-${location?.id}`}><input id={`l-web-${location?.id}`} name="website" type="url" maxLength={200} className="b-input" defaultValue={location?.website ?? ''} placeholder="https://baydesignstore.com" /></Field>
      </div>

      <div className="rounded-2xl border border-stone/60 bg-linen/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Geofence</p>
            <p className="text-xs text-muted">Punch-ins are checked against this point. Stand inside the building and tap “Use my current location”.</p>
          </div>
          <button type="button" onClick={useCurrentLocation} className="b-btn-ghost b-btn-sm" disabled={locating}>
            {locating ? <Loader2 size={13} className="animate-spin" /> : <LocateFixed size={13} />} Use my current location
          </button>
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label="Latitude" htmlFor={`l-lat-${location?.id}`}><input ref={lat} id={`l-lat-${location?.id}`} name="latitude" inputMode="decimal" className="b-input font-mono" defaultValue={location?.latitude ?? ''} placeholder="26.2" /></Field>
          <Field label="Longitude" htmlFor={`l-lng-${location?.id}`}><input ref={lng} id={`l-lng-${location?.id}`} name="longitude" inputMode="decimal" className="b-input font-mono" defaultValue={location?.longitude ?? ''} placeholder="-81.8" /></Field>
          <Field label="Radius (m)" htmlFor={`l-rad-${location?.id}`}><input id={`l-rad-${location?.id}`} name="geofence_radius_m" type="number" min={25} max={5000} className="b-input" defaultValue={location?.geofence_radius_m ?? 150} /></Field>
        </div>
        {note && <p className="mt-2 text-xs text-muted">{note}</p>}
      </div>

      <label className="flex items-center gap-2.5 text-sm">
        <input type="checkbox" name="is_active" className="b-check" defaultChecked={location?.is_active ?? true} /> Active location
      </label>
      <div className="flex justify-end"><SubmitButton className="b-btn-brass" pendingLabel="Saving…">{location ? 'Save location' : 'Add location'}</SubmitButton></div>
    </ActionForm>
  );
}
