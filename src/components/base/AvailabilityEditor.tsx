'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ActionForm, Field, SubmitButton } from './forms';
import { submitAvailability } from '@/app/base/(app)/availability/actions';

type Kind = 'available' | 'preferred' | 'unavailable';
export type EditorSlot = { weekday: number; kind: Kind; all_day: boolean; start_time: string | null; end_time: string | null };

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const KIND_STYLE: Record<Kind, string> = {
  preferred: 'bg-[#E9E0F2] text-[#4F3A6B] border-[#CDBBE0]',
  available: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  unavailable: 'bg-red-50 text-red-700 border-red-200',
};
const HOURS = [0, 3, 6, 9, 12, 15, 18, 21];

const toMinutes = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : 0);
const hourLabel = (h: number) => (h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`);

/** Weekly availability: a timeline per day (like Homebase) plus the editable time ranges. */
export default function AvailabilityEditor({ initial, defaultEffective }: { initial: EditorSlot[]; defaultEffective: string }) {
  const [slots, setSlots] = useState<EditorSlot[]>(initial.map((s) => ({ ...s, start_time: s.start_time?.slice(0, 5) ?? null, end_time: s.end_time?.slice(0, 5) ?? null })));

  const update = (i: number, patch: Partial<EditorSlot>) => setSlots((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const add = (weekday: number) => setSlots((all) => [...all, { weekday, kind: 'preferred', all_day: false, start_time: '09:00', end_time: '17:00' }]);
  const remove = (i: number) => setSlots((all) => all.filter((_, j) => j !== i));

  return (
    <ActionForm action={submitAvailability} className="space-y-6">
      <input type="hidden" name="slots" value={JSON.stringify(slots)} />

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="ml-28 grid grid-cols-8 pb-2 text-[0.65rem] font-medium text-muted">
            {HOURS.map((h) => <span key={h}>{hourLabel(h)}</span>)}
          </div>
          <ul className="divide-y divide-stone/40 rounded-2xl border border-stone/60 bg-white">
            {DAYS.map((day, d) => {
              const weekday = d + 1;
              const daySlots = slots.map((s, i) => ({ s, i })).filter(({ s }) => s.weekday === weekday);
              return (
                <li key={day} className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex w-[6.25rem] flex-none items-center justify-between">
                      <span className="text-sm font-medium">{day}</span>
                      <button type="button" onClick={() => add(weekday)} className="rounded-full p-1 text-muted hover:bg-linen hover:text-ink" aria-label={`Add time on ${day}`}>
                        <Plus size={16} />
                      </button>
                    </div>
                    <div className="relative h-8 flex-1 rounded-lg bg-[repeating-linear-gradient(90deg,#F4EEE5_0,#F4EEE5_1px,transparent_1px,transparent_12.5%)]">
                      {daySlots.map(({ s, i }) => {
                        const left = s.all_day ? 0 : (toMinutes(s.start_time) / 1440) * 100;
                        const width = s.all_day ? 100 : Math.max(2, ((toMinutes(s.end_time) - toMinutes(s.start_time)) / 1440) * 100);
                        return (
                          <span key={i} className={`absolute inset-y-0.5 overflow-hidden whitespace-nowrap rounded-md border px-1.5 text-[0.62rem] font-semibold leading-7 capitalize ${KIND_STYLE[s.kind]}`} style={{ left: `${left}%`, width: `${width}%` }}>
                            {s.kind}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  {daySlots.length > 0 && (
                    <div className="ml-[7rem] mt-2 space-y-2">
                      {daySlots.map(({ s, i }) => (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                          <select value={s.kind} onChange={(e) => update(i, { kind: e.target.value as Kind })} className="b-input !w-auto !py-1.5 text-xs" aria-label="Type">
                            <option value="preferred">Preferred</option>
                            <option value="available">Available</option>
                            <option value="unavailable">Unavailable</option>
                          </select>
                          <label className="flex items-center gap-1.5 text-xs">
                            <input type="checkbox" className="b-check" checked={s.all_day} onChange={(e) => update(i, { all_day: e.target.checked })} /> All day
                          </label>
                          {!s.all_day && (
                            <>
                              <input type="time" value={s.start_time ?? ''} onChange={(e) => update(i, { start_time: e.target.value })} className="b-input !w-auto !py-1.5 text-xs" aria-label="From" required />
                              <span className="text-xs text-muted">to</span>
                              <input type="time" value={s.end_time ?? ''} onChange={(e) => update(i, { end_time: e.target.value })} className="b-input !w-auto !py-1.5 text-xs" aria-label="To" required />
                            </>
                          )}
                          <button type="button" onClick={() => remove(i)} className="rounded-full p-1.5 text-muted hover:bg-red-50 hover:text-red-600" aria-label="Remove">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[200px_1fr_auto] sm:items-end">
        <Field label="Effective from" htmlFor="av-eff">
          <input id="av-eff" type="date" name="effective_from" className="b-input" required defaultValue={defaultEffective} min={defaultEffective} />
        </Field>
        <Field label="Note for your manager (optional)" htmlFor="av-note">
          <input id="av-note" name="note" className="b-input" maxLength={500} placeholder="e.g. Classes on Tuesday evenings" />
        </Field>
        <div className="flex gap-2">
          <button type="button" className="b-btn-ghost" onClick={() => setSlots([])}>Clear</button>
          <SubmitButton className="b-btn-brass" pendingLabel="Sending…">Notify manager</SubmitButton>
        </div>
      </div>
    </ActionForm>
  );
}
