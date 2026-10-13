'use client';

import { useRef, useState, type ReactNode } from 'react';
import { LocateFixed, Loader2 } from 'lucide-react';
import type { CompanySettings } from '@/lib/base/settings';
import type { Location } from '@/lib/base/types';
import { ActionForm, Field, SubmitButton } from './forms';
import { saveLocation, saveSettings } from '@/app/base/(app)/settings/actions';

const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="grid gap-4 border-b border-stone/50 py-6 first:pt-0 last:border-0 last:pb-0 lg:grid-cols-[220px_1fr] lg:gap-8">
      <div>
        <h3 className="font-medium">{title}</h3>
        {description && <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function CompanySettingsForm({ settings }: { settings: CompanySettings }) {
  return (
    <ActionForm action={saveSettings}>
      <Section title="Company info">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" htmlFor="s-name"><input id="s-name" name="company_name" required maxLength={120} className="b-input" defaultValue={settings.company_name} /></Field>
          <Field label="Account owner" htmlFor="s-owner"><input id="s-owner" name="account_owner_name" maxLength={120} className="b-input" defaultValue={settings.account_owner_name ?? ''} /></Field>
          <Field label="Phone number" htmlFor="s-phone"><input id="s-phone" name="phone" maxLength={40} className="b-input" defaultValue={settings.phone ?? ''} /></Field>
          <Field label="Timezone" htmlFor="s-tz">
            <select id="s-tz" name="timezone" className="b-input" defaultValue={settings.timezone}>
              {[...new Set([settings.timezone, ...TIMEZONES])].map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Time clock" description="How punch in / punch out works on phones.">
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" name="require_location" className="b-check mt-0.5" defaultChecked={settings.require_location} />
          <span><span className="font-medium">Require location</span><span className="block text-xs text-muted">People must share their GPS location to punch in or out.</span></span>
        </label>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" name="enforce_geofence" className="b-check mt-0.5" defaultChecked={settings.enforce_geofence} />
          <span><span className="font-medium">Only allow punching in on site</span><span className="block text-xs text-muted">Reject punch-ins outside every location’s geofence. When off (recommended — designers visit clients), they’re allowed and the street address is recorded.</span></span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Early punch-in (min)" htmlFor="s-early" hint="How early before a shift."><input id="s-early" name="early_clock_in_minutes" type="number" min={0} max={240} className="b-input" defaultValue={settings.early_clock_in_minutes} /></Field>
          <Field label="Late after (min)" htmlFor="s-late" hint="Grace period before “Late”."><input id="s-late" name="late_grace_minutes" type="number" min={0} max={120} className="b-input" defaultValue={settings.late_grace_minutes} /></Field>
        </div>
      </Section>

      <Section title="Overtime & pay periods">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Weekly overtime after (hours)" htmlFor="s-wot" hint="Federal (FLSA) rule: 40. Leave empty to turn off."><input id="s-wot" name="weekly_overtime_hours" type="number" step="0.5" min={1} max={168} className="b-input" defaultValue={settings.weekly_overtime_hours ?? ''} /></Field>
          <Field label="Daily overtime after (hours)" htmlFor="s-dot" hint="Not required in Florida. Leave empty to turn off."><input id="s-dot" name="daily_overtime_hours" type="number" step="0.5" min={1} max={24} className="b-input" defaultValue={settings.daily_overtime_hours ?? ''} /></Field>
          <Field label="Week starts on" htmlFor="s-ws">
            <select id="s-ws" name="week_start" className="b-input" defaultValue={settings.week_start}>
              {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </Field>
          <Field label="Pay period" htmlFor="s-pp">
            <select id="s-pp" name="pay_period_days" className="b-input" defaultValue={settings.pay_period_days}>
              <option value={7}>Weekly</option>
              <option value={14}>Every two weeks</option>
            </select>
          </Field>
          <Field label="A pay period starts on" htmlFor="s-anchor" hint="Any past first day of a pay period."><input id="s-anchor" name="pay_period_anchor" type="date" required className="b-input" defaultValue={settings.pay_period_anchor} /></Field>
        </div>
      </Section>
      <div className="flex justify-end pt-2"><SubmitButton className="b-btn-brass" pendingLabel="Saving…">Save settings</SubmitButton></div>
    </ActionForm>
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
          <select id={`l-tz-${location?.id}`} name="timezone" className="b-input" defaultValue={location?.timezone ?? 'America/New_York'}>
            {[...new Set([location?.timezone ?? 'America/New_York', ...TIMEZONES])].map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
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
