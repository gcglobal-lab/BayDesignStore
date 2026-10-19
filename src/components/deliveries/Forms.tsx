'use client';

import { Copy, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { autoPlanDay, saveRoute } from '@/app/base/(app)/deliveries/dispatch/actions';
import { addOrderNote } from '@/app/base/(app)/deliveries/orders/actions';
import { saveDlSettings } from '@/app/base/(app)/deliveries/settings/actions';
import { saveTruck } from '@/app/base/(app)/deliveries/trucks/actions';
import { ActionForm, Field, SubmitButton } from '@/components/base/forms';
import type { Person } from '@/lib/crm/types';
import type { DlSettings, Route, Truck } from '@/lib/deliveries/types';
import Select from '@/components/ui/Select';
import { toast } from '@/components/ui/toast';

export function RouteForm({ date, trucks, drivers, route, defaultStart, suggestedName }: { date: string; trucks: Truck[]; drivers: Person[]; route?: Route; defaultStart: string; suggestedName?: string }) {
  return (
    <ActionForm action={saveRoute} resetOnSuccess={!route} className="space-y-4">
      {route && <input type="hidden" name="id" value={route.id} />}
      <input type="hidden" name="route_date" value={route?.route_date ?? date} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Route name" htmlFor="r-name"><input id="r-name" name="name" className="b-input" required maxLength={80} defaultValue={route?.name ?? suggestedName} placeholder="e.g. Truck 1 — Naples / Marco" /></Field>
        <Field label="Leaves the warehouse at" htmlFor="r-start"><input id="r-start" name="start_time" type="time" className="b-input" defaultValue={route?.start_time.slice(0, 5) ?? defaultStart} /></Field>
        <Field label="Truck" htmlFor="r-truck">
          <Select id="r-truck" name="truck_id" className="b-input" defaultValue={route?.truck_id ?? trucks[0]?.id ?? ''}>
            <option value="">— None —</option>
            {trucks.filter((t) => t.active || t.id === route?.truck_id).map((t) => <option key={t.id} value={t.id}>{t.name} · {t.capacity_stops} stops</option>)}
          </Select>
        </Field>
        <Field label="Driver" htmlFor="r-driver">
          <Select people id="r-driver" name="driver_id" className="b-input" defaultValue={route?.driver_id ?? ''}>
            <option value="">— Choose —</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Helper (optional)" htmlFor="r-helper">
          <Select people id="r-helper" name="helper_id" className="b-input" defaultValue={route?.helper_id ?? ''}>
            <option value="">— None —</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Notes for the crew" htmlFor="r-notes"><textarea id="r-notes" name="notes" className="b-input min-h-[60px]" maxLength={1000} defaultValue={route?.notes ?? ''} /></Field>
      {drivers.length === 0 && <p className="text-xs text-amber-700">Nobody has Deliveries access yet — give drivers access in Time ▸ Settings ▸ App access.</p>}
      <div className="flex justify-end"><SubmitButton className="b-btn-brass">{route ? 'Save route' : 'Add route'}</SubmitButton></div>
    </ActionForm>
  );
}

export function AutoPlanButton({ date }: { date: string }) {
  return (
    <ActionForm action={autoPlanDay} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="date" value={date} />
      <SubmitButton className="b-btn-brass" pendingLabel="Planning…"><Sparkles size={15} /> Auto-plan day</SubmitButton>
    </ActionForm>
  );
}

export function TruckForm({ truck }: { truck?: Truck }) {
  return (
    <ActionForm action={saveTruck} resetOnSuccess={!truck} className="space-y-4">
      {truck && <input type="hidden" name="id" value={truck.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="t-name"><input id="t-name" name="name" className="b-input" required maxLength={80} defaultValue={truck?.name} placeholder="Box truck 1" /></Field>
        <Field label="Plate" htmlFor="t-plate"><input id="t-plate" name="plate" className="b-input" maxLength={20} defaultValue={truck?.plate ?? ''} /></Field>
        <Field label="Stops per day (capacity)" htmlFor="t-cap"><input id="t-cap" name="capacity_stops" type="number" min={1} max={60} className="b-input" defaultValue={truck?.capacity_stops ?? 10} /></Field>
        <Field label="Colour on the map" htmlFor="t-color"><input id="t-color" name="color" type="color" className="h-10 w-full cursor-pointer rounded-xl border border-stone bg-surface" defaultValue={truck?.color ?? '#6366F1'} /></Field>
      </div>
      <Field label="Notes" htmlFor="t-notes"><textarea id="t-notes" name="notes" className="b-input min-h-[60px]" maxLength={1000} defaultValue={truck?.notes ?? ''} placeholder="Lift gate, dollies, blankets…" /></Field>
      {truck && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" className="b-check" defaultChecked={truck.active} /> In service</label>}
      <div className="flex justify-end"><SubmitButton className="b-btn-brass">{truck ? 'Save' : 'Add truck'}</SubmitButton></div>
    </ActionForm>
  );
}

export function DlSettingsForm({ settings }: { settings: DlSettings }) {
  return (
    <ActionForm action={saveDlSettings} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Warehouse name" htmlFor="ds-name"><input id="ds-name" name="depot_name" className="b-input" required maxLength={80} defaultValue={settings.depot_name} /></Field>
        <Field label="Warehouse address (trucks start and end here)" htmlFor="ds-addr" hint={settings.depot_lat != null ? '✓ Found on the map' : 'Empty = use the store marked as warehouse in Time ▸ Settings'}>
          <input id="ds-addr" name="depot_address" className="b-input" maxLength={250} defaultValue={settings.depot_address} placeholder="Street, City, FL Zip" />
        </Field>
        <Field label="Trucks usually leave at" htmlFor="ds-start"><input id="ds-start" name="default_start" type="time" className="b-input" defaultValue={settings.default_start} /></Field>
        <Field label="Default delivery window (hours)" htmlFor="ds-win"><input id="ds-win" name="window_hours" type="number" min={1} max={12} className="b-input" defaultValue={settings.window_hours} /></Field>
        <Field label="Average driving speed (mph)" htmlFor="ds-mph" hint="Used for arrival times (ETAs)."><input id="ds-mph" name="avg_speed_mph" type="number" min={5} max={70} className="b-input" defaultValue={settings.avg_speed_mph} /></Field>
      </div>
      <Field label="Reasons a delivery can fail (one per line)" htmlFor="ds-reasons"><textarea id="ds-reasons" name="failure_reasons" className="b-input min-h-[140px]" defaultValue={settings.failure_reasons.join('\n')} /></Field>
      <Field label="Message on the customer’s tracking page" htmlFor="ds-msg"><textarea id="ds-msg" name="tracking_message" className="b-input min-h-[60px]" maxLength={500} defaultValue={settings.tracking_message} /></Field>
      <div className="flex justify-end"><SubmitButton className="b-btn-brass">Save settings</SubmitButton></div>
    </ActionForm>
  );
}

export function OrderNoteForm({ id }: { id: string }) {
  return (
    <ActionForm action={addOrderNote} resetOnSuccess className="flex gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="note" className="b-input" maxLength={500} placeholder="Add a note to the history…" required />
      <SubmitButton className="b-btn-ghost">Add</SubmitButton>
    </ActionForm>
  );
}

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="b-btn-ghost b-btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          toast.success('Tracking link copied.');
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.info(`Couldn’t copy automatically — the link is ${url}`);
        }
      }}
    >
      <Copy size={13} /> {copied ? 'Copied!' : 'Copy link'}
    </button>
  );
}
