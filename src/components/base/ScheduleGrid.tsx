'use client';

import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, Ban, CalendarDays, Check, CircleDashed, Copy, Eye, EyeOff, Info, LogIn, LogOut, Plus, Search, Trash2, X } from 'lucide-react';
import { ActionForm, Field, SubmitButton } from './forms';
import { Avatar } from './ui';
import { DatePicker } from './calendar/Calendar';
import { deleteShift, saveShift } from '@/app/base/(app)/schedule/actions';
import { addTimeOff } from '@/app/base/(app)/time-off/actions';
import { decideShiftRequest } from '@/app/base/(app)/manager/actions';
import { fmtDuration } from '@/lib/base/time';
import Select from '@/components/ui/Select';
import { confirmDialog, friendlyError, toast } from '@/components/ui/toast';
import { oneOf, usePersistentState } from '@/lib/usePersistentState';

export type GridShift = {
  id: string;
  employeeId: string | null;
  date: string;
  start: string;
  end: string;
  label: string;
  roleId: string | null;
  roleName: string | null;
  color: string;
  published: boolean;
  breakMinutes: number;
  notes: string | null;
  locationId: string | null;
  /** Someone punched in for it — like Homebase, it can't be edited any more. */
  locked: boolean;
  /** Admin view: it started a while ago and nobody punched in. */
  noShow: boolean;
};
export type GridTimeOff = { id: string; employeeId: string; date: string; label: string };
export type GridEvent = { id: string; title: string; dates: string[] };
export type GridRow = { id: string; name: string; firstName: string; lastName: string; role: string | null; hours: number; highlight?: boolean; /** Their store — new shifts start there. */ locationId?: string | null };
export type GridDay = { ymd: string; weekday: string; day: string; isToday: boolean };
/** A time card, shown in its day's cell. Only ever sent to admins. */
export type GridPunch = {
  id: string;
  employeeId: string;
  date: string;
  shiftId: string | null;
  clockIn: string;
  clockOut: string | null;
  inPlace: string | null;
  outPlace: string | null;
  workedMinutes: number;
  lateMinutes: number | null;
  manual: boolean;
  note: string | null;
};
export type GridFrequent = { start: string; end: string; roleId: string | null; label: string };
export type GridRequest = { id: string; shiftId: string; type: 'pickup' | 'cover'; requester: string; claimant: string | null; note: string | null };

type ShiftDraft = { start: string; end: string; roleId: string | null; locationId: string | null; breakMinutes: number; notes: string | null };
type Editing =
  | { kind: 'new'; employeeId: string | null; date: string; preset?: ShiftDraft; tab: 'shift' | 'off' }
  | { kind: 'edit'; shift: GridShift; tab: 'current' | 'notes' | 'approvals' | 'off' }
  /** Admin: one person's punch in / out report for a day. */
  | { kind: 'punches'; employeeId: string; date: string }
  | null;
type ViewBy = 'first' | 'last' | 'role' | 'hours';
const VIEW_BY = oneOf<ViewBy>('first', 'last', 'role', 'hours');
const NO_HIDDEN: string[] = [];
/** The name column that stays put while the days scroll. Collapsed borders scroll away from sticky cells, so its edge is a shadow. */
const STICKY = 'sticky left-0 bg-white shadow-[1px_0_0_rgb(var(--c-stone)/0.6)]';
const HIDDEN = { read: (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined), write: (v: string[]) => v };

function groupBy<T>(list: T[], key: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of list) {
    const k = key(x);
    const bucket = m.get(k);
    if (bucket) bucket.push(x);
    else m.set(k, [x]);
  }
  return m;
}

function ShiftChip({ s, onClick }: { s: GridShift; onClick?: (e: MouseEvent<HTMLElement>) => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`block w-full rounded-md px-2 py-1.5 text-left text-[0.72rem] leading-tight text-white shadow-sm transition-all ${onClick ? 'hover:-translate-y-px hover:shadow-md hover:brightness-110' : ''} ${s.published ? '' : 'opacity-80 outline-dashed outline-2 -outline-offset-2 outline-white/80'}`}
      style={{ backgroundColor: s.color }}
      title={s.notes ?? undefined}
    >
      <span className="block font-bold">{s.label}</span>
      <span className="block truncate font-medium opacity-95">{s.roleName ?? 'No role'}{!s.published && ' · Draft'}</span>
    </Tag>
  );
}

function TimeOffChip({ label }: { label: string }) {
  return (
    <div className="rounded-md bg-[#E9E4D8] px-2 py-1.5 text-[0.72rem] leading-tight text-[#3E3A33]">
      <span className="flex items-center gap-1 font-semibold"><Ban size={11} className="flex-none" /> Time-off</span>
      <span className="mt-0.5 flex items-center gap-1"><CalendarDays size={10} className="flex-none" /> {label}</span>
    </div>
  );
}

const PUNCH_TONE = 'bg-emerald-50 text-emerald-900 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-800';
const NO_SHOW_TONE = 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900';
const CLICKABLE = 'block w-full text-left transition-[filter] hover:brightness-95';

/** Admin only, past weeks: the actual punch in / out under the scheduled shift. Opens the punch report. */
function PunchChip({ p, onClick }: { p: GridPunch; onClick: (e: MouseEvent<HTMLElement>) => void }) {
  const tip = [p.inPlace && `In at ${p.inPlace}`, p.outPlace && `Out at ${p.outPlace}`, p.manual && 'Added by hand', p.note].filter(Boolean).join('\n');
  return (
    <button type="button" onClick={onClick} className={`${CLICKABLE} rounded-md px-2 py-1 text-[0.68rem] leading-tight ${PUNCH_TONE}`} title={tip || 'Punch report'}>
      <span className="flex flex-wrap items-center gap-x-1 font-semibold"><LogIn size={10} className="flex-none" /> {p.clockIn}<span className="font-normal opacity-70">–</span>{p.clockOut ?? <span className="font-medium text-emerald-700 dark:text-emerald-300">on clock</span>}</span>
      <span className="mt-0.5 block truncate opacity-80">
        {fmtDuration(p.workedMinutes)} hrs{p.lateMinutes ? <span className="font-semibold text-amber-700 dark:text-amber-300"> · {p.lateMinutes}m late</span> : null}{p.manual ? ' · manual' : ''}
      </span>
    </button>
  );
}

/** Admin only, this week and later: a small marker in place of the times — the details are in the punch report. */
function PunchBadge({ punches, onClick }: { punches: GridPunch[]; onClick: (e: MouseEvent<HTMLElement>) => void }) {
  const onClock = punches.some((p) => !p.clockOut);
  const late = punches.some((p) => p.lateMinutes);
  return (
    <button type="button" onClick={onClick} className={`${CLICKABLE} flex items-center gap-1 rounded-md px-2 py-1 text-[0.68rem] font-semibold leading-tight ${PUNCH_TONE}`} title="Punch in / out report">
      <LogIn size={10} className="flex-none" /> {onClock ? 'On the clock' : 'Punched'}
      {late && <span className="ml-auto h-1.5 w-1.5 flex-none rounded-full bg-amber-500" aria-label="Late" />}
    </button>
  );
}

function NoShowChip({ onClick }: { onClick: (e: MouseEvent<HTMLElement>) => void }) {
  return (
    <button type="button" onClick={onClick} className={`${CLICKABLE} flex items-center gap-1 rounded-md px-2 py-1 text-[0.68rem] font-semibold leading-tight ${NO_SHOW_TONE}`} title="Punch in / out report">
      <AlertTriangle size={10} className="flex-none" /> No punch-in
    </button>
  );
}

/** The time cards for one shift or one person's day: in / out, where, worked, late, manual, note. */
function PunchList({ punches, noShow, scheduled }: { punches: GridPunch[]; noShow: boolean; scheduled?: string }) {
  if (punches.length === 0) {
    return (
      <p className={`rounded-xl px-3.5 py-3 text-sm ${noShow ? 'bg-red-50 font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300' : 'bg-linen text-muted'}`}>
        {noShow ? 'No punch-in for this shift.' : 'No time card yet.'}
      </p>
    );
  }
  return (
    <ul className="space-y-2 text-sm">
      {punches.map((p) => (
        <li key={p.id} className="rounded-xl border border-stone/60 px-3.5 py-3">
          <p className="flex items-center gap-2 font-semibold"><LogIn size={14} className="text-emerald-600" /> In {p.clockIn}{p.lateMinutes ? <span className="b-badge-amber">{p.lateMinutes}m late</span> : null}{p.manual && <span className="b-badge-gray">Manual</span>}</p>
          {p.inPlace && <p className="ml-6 text-xs text-muted">{p.inPlace}</p>}
          <p className="mt-1.5 flex items-center gap-2 font-semibold"><LogOut size={14} className="text-rose-600" /> {p.clockOut ? `Out ${p.clockOut}` : 'Still on the clock'}</p>
          {p.outPlace && <p className="ml-6 text-xs text-muted">{p.outPlace}</p>}
          <p className="mt-1.5 text-xs text-muted">Worked {fmtDuration(p.workedMinutes)} hrs{scheduled ? ` · scheduled ${scheduled}` : ''}</p>
          {p.note && <p className="mt-1.5 rounded-lg bg-linen px-2.5 py-1.5 text-xs italic text-ink">“{p.note}”</p>}
        </li>
      ))}
    </ul>
  );
}

/** Homebase-style segmented tabs. */
function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-xl bg-linen p-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${value === t.value ? 'bg-white text-ink shadow-sm ring-1 ring-stone/70' : 'text-muted hover:text-ink'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-center gap-2.5 text-sm font-medium">
      <span className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-violet-600' : 'bg-stone'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[1.375rem]' : 'left-0.5'}`} />
      </span>
      {label}
    </button>
  );
}

function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <p className={`flex items-start gap-1.5 text-[0.8rem] font-medium ${tone === 'info' ? 'text-sky-700 dark:text-sky-300' : 'text-amber-700 dark:text-amber-300'}`}>
      <Info size={15} className="mt-px flex-none" /> {children}
    </p>
  );
}

/**
 * The shift fields shared by "Add shift" and an existing shift's "Current" tab: frequent
 * shifts, times, role (Downtown / Uptown …) with its colour, the days to apply it to, notes.
 */
function ShiftFields({
  draft,
  days,
  date,
  multiDay,
  disabled,
  roles,
  locations,
  defaultLocationId,
  frequent,
  firstName,
}: {
  draft: ShiftDraft;
  days: GridDay[];
  date: string;
  multiDay: boolean;
  disabled: boolean;
  roles: { id: string; name: string; color: string }[];
  locations: { id: string; name: string }[];
  defaultLocationId: string | null;
  frequent: GridFrequent[];
  firstName: string | null;
}) {
  const [start, setStart] = useState(draft.start);
  const [end, setEnd] = useState(draft.end);
  const [roleId, setRoleId] = useState(draft.roleId ?? '');
  const [picked, setPicked] = useState<string[]>([date]);
  const color = roles.find((r) => r.id === roleId)?.color ?? '#6F675D';
  const toggleDay = (ymd: string) => setPicked((p) => (multiDay ? (p.includes(ymd) ? (p.length > 1 ? p.filter((d) => d !== ymd) : p) : [...p, ymd]) : [ymd]));
  const isFrequent = (f: GridFrequent) => f.start === start && f.end === end && (f.roleId ?? '') === roleId;

  return (
    <fieldset disabled={disabled} className="space-y-4 disabled:opacity-60">
      {frequent.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          {frequent.map((f) => {
            const on = isFrequent(f);
            return (
              <button
                key={`${f.start}-${f.end}-${f.roleId}`}
                type="button"
                onClick={() => { setStart(f.start); setEnd(f.end); setRoleId(f.roleId ?? ''); }}
                className={`rounded-2xl border bg-white p-3 text-left shadow-sm transition-colors dark:bg-transparent ${on ? 'border-violet-500 ring-1 ring-violet-500' : 'border-stone/70 hover:border-violet-300'}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-bold text-ink">{f.label}</span>
                  <span className={`grid h-4 w-4 flex-none place-items-center rounded-full border-2 ${on ? 'border-violet-600 bg-violet-600 text-white' : 'border-violet-900/60'}`}>{on && <Check size={10} strokeWidth={3} />}</span>
                </span>
                <span className="mt-0.5 block truncate text-sm text-muted">{roles.find((r) => r.id === f.roleId)?.name ?? 'No role'}</span>
                <span className="mt-1 flex items-center gap-1 text-[0.72rem] font-semibold text-sky-700 dark:text-sky-300"><Info size={12} /> Frequent{firstName ? ` for ${firstName}` : ''}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input type="time" name="start" required aria-label="Start time" className="b-input" value={start} onChange={(e) => setStart(e.target.value)} />
        <span className="text-muted">-</span>
        <input type="time" name="end" required aria-label="End time" className="b-input" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>

      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Select name="role_id" className="b-input" value={roleId} onChange={(e) => setRoleId(e.target.value)} aria-label="Role" disabled={disabled}>
            <option value="">No role</option>
            {roles.map((r) => <option key={r.id} value={r.id} data-color={r.color}>{r.name}</option>)}
          </Select>
        </div>
        <span className="grid h-[2.6rem] w-14 flex-none place-items-center rounded-xl border border-stone/70" title="Shift colour (from the role)">
          <span className="h-6 w-6 rounded-full" style={{ backgroundColor: color }} />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {locations.length > 1 ? (
          <Select name="location_id" className="b-input" defaultValue={draft.locationId ?? defaultLocationId ?? ''} aria-label="Location" disabled={disabled}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        ) : (
          <input type="hidden" name="location_id" value={locations[0]?.id ?? ''} />
        )}
        <label className={`flex items-center gap-2 text-sm text-muted ${locations.length > 1 ? '' : 'col-span-2'}`}>
          Unpaid break
          <input type="number" name="break_minutes" min={0} max={240} step={5} className="b-input !w-20" defaultValue={draft.breakMinutes} aria-label="Unpaid break in minutes" />
          min
        </label>
      </div>

      <div>
        <p className="b-label">Apply to:</p>
        <div className="flex flex-wrap gap-1.5">
          {days.map((d) => {
            const on = picked.includes(d.ymd);
            return (
              <button
                key={d.ymd}
                type="button"
                onClick={() => toggleDay(d.ymd)}
                aria-pressed={on}
                className={`h-11 w-11 rounded-full border text-[0.8rem] font-medium transition-colors ${on ? 'border-violet-600 bg-violet-600 font-semibold text-white' : 'border-violet-300 text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/40'}`}
              >
                {d.weekday}
              </button>
            );
          })}
        </div>
        {picked.map((d) => <input key={d} type="hidden" name="date" value={d} />)}
      </div>

      <div>
        <label htmlFor="sh-notes" className="b-label">Shift Notes:</label>
        <textarea id="sh-notes" name="notes" rows={3} maxLength={500} className="b-input resize-none" defaultValue={draft.notes ?? ''} placeholder="Leave a note for your employee, like the address of a job site, and they’ll see it when they clock in." />
      </div>
    </fieldset>
  );
}

const LEAVE_CATEGORIES = [
  { value: 'unpaid', label: 'Unpaid time off' },
  { value: 'pto', label: 'Paid time off' },
  { value: 'vacation', label: 'Vacation (paid)' },
  { value: 'sick', label: 'Sick leave' },
] as const;
const spanDays = (from: string, to: string) => Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1);
const hmMinutes = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
};

/** The Time off tab: approved straight away (managers and admins). With `shiftId`, it replaces that shift. */
function TimeOffPanel({ employeeId, date, shiftId, shift, zone, weekStart, onDone }: { employeeId: string; date: string; shiftId?: string; shift?: GridShift; zone: string; weekStart: number; onDone: () => void }) {
  const [start, setStart] = useState(date);
  const [end, setEnd] = useState(date);
  const [wholeDay, setWholeDay] = useState(true);
  const [from, setFrom] = useState(shift?.start ?? '09:00');
  const [to, setTo] = useState(shift?.end ?? '17:00');
  const [editHours, setEditHours] = useState(false);
  const lastDay = end < start ? start : end;
  const computed = wholeDay ? spanDays(start, lastDay) * 8 : Math.max(0, hmMinutes(to) - hmMinutes(from)) / 60;

  return (
    <ActionForm action={addTimeOff} onSuccess={() => window.setTimeout(onDone, 500)}>
      <input type="hidden" name="employee_id" value={employeeId} />
      {shiftId && <input type="hidden" name="shift_id" value={shiftId} />}
      {shiftId && <Notice tone="warn">Saving removes the scheduled shift and puts this time off in its place.</Notice>}
      <Field label="Category" htmlFor="to-type">
        <Select id="to-type" name="type" className="b-input" defaultValue="unpaid">
          {LEAVE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
      </Field>
      <Field label="Reason" htmlFor="to-reason">
        <Select id="to-reason" name="reason" className="b-input" defaultValue="vacation">
          <option value="vacation">Vacation</option>
          <option value="personal">Personal</option>
          <option value="sick">Sick</option>
          <option value="family">Family</option>
          <option value="other">Other</option>
        </Select>
      </Field>
      <Field label="Note" htmlFor="to-note">
        <textarea id="to-note" name="note" rows={2} maxLength={1000} className="b-input resize-y" placeholder="Leave a note" />
      </Field>
      {wholeDay ? (
        <div className="grid grid-cols-[1fr_1fr_6.5rem] items-end gap-2">
          <Field label="Start Date" htmlFor="to-start"><DatePicker id="to-start" name="starts_on" required value={start} onChange={(v) => { setStart(v); if (end < v) setEnd(v); }} zone={zone} weekStart={weekStart} /></Field>
          <Field label="End Date" htmlFor="to-end"><DatePicker id="to-end" name="ends_on" required min={start} value={lastDay} onChange={setEnd} zone={zone} weekStart={weekStart} /></Field>
          <HoursField computed={computed} editing={editHours} onEdit={() => setEditHours(true)} />
        </div>
      ) : (
        <>
          <Field label="Date" htmlFor="to-day"><DatePicker id="to-day" name="starts_on" required value={start} onChange={setStart} zone={zone} weekStart={weekStart} /></Field>
          <div className="grid grid-cols-[1fr_1fr_6.5rem] items-end gap-2">
            <Field label="From" htmlFor="to-from"><input id="to-from" type="time" name="start_time" required className="b-input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To" htmlFor="to-to"><input id="to-to" type="time" name="end_time" required className="b-input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <HoursField computed={computed} editing={editHours} onEdit={() => setEditHours(true)} />
          </div>
        </>
      )}
      <Switch checked={wholeDay} onChange={setWholeDay} label="Whole Day" />
      {wholeDay && <input type="hidden" name="all_day" value="on" />}
      <div className="flex justify-end pt-1">
        <SubmitButton className="b-btn-brass" pendingLabel="Saving…">{shiftId ? 'Make it time off' : 'Add'}</SubmitButton>
      </div>
    </ActionForm>
  );
}

function HoursField({ computed, editing, onEdit }: { computed: number; editing: boolean; onEdit: () => void }) {
  return (
    <div>
      <span className="b-label">Total Hours</span>
      <div className="flex items-center gap-1.5">
        {editing ? (
          <input type="number" name="hours" min={0.25} step={0.25} className="b-input !px-2" defaultValue={computed.toFixed(2)} aria-label="Total hours" autoFocus />
        ) : (
          <>
            <input readOnly tabIndex={-1} className="b-input !bg-linen !px-2 text-muted" value={computed.toFixed(2)} aria-label="Total hours" />
            <button type="button" onClick={onEdit} className="text-sm font-semibold text-violet-700 hover:underline dark:text-violet-300">Edit</button>
          </>
        )}
      </div>
    </div>
  );
}

export default function ScheduleGrid({
  days,
  rows,
  shifts,
  timeOff,
  events,
  punches = [],
  frequent = {},
  requests = [],
  roles,
  locations,
  canEdit,
  isAdmin = false,
  inlinePunches = true,
  defaultLocationId,
  zone,
  weekStart,
}: {
  days: GridDay[];
  rows: GridRow[];
  shifts: GridShift[];
  timeOff: GridTimeOff[];
  events: GridEvent[];
  punches?: GridPunch[];
  frequent?: Record<string, GridFrequent[]>;
  requests?: GridRequest[];
  roles: { id: string; name: string; color: string }[];
  locations: { id: string; name: string }[];
  canEdit: boolean;
  isAdmin?: boolean;
  /**
   * Past weeks show each punch in / out right in the grid. The running week (and later) only marks the
   * cell — the times change all day — and a click opens the punch report.
   */
  inlinePunches?: boolean;
  defaultLocationId: string | null;
  zone: string;
  weekStart: number;
}) {
  const [editing, setEditing] = useState<Editing>(null);
  // "View by" and who's hidden are remembered in this browser.
  const [viewBy, setViewBy] = usePersistentState<ViewBy>('bdb-schedule-viewby', 'first', VIEW_BY);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [hidden, setHidden] = usePersistentState<string[]>('bdb-schedule-hidden', NO_HIDDEN, HIDDEN);
  const dialog = useRef<HTMLDialogElement>(null);
  // The popover opens beside the cell that was clicked, like Homebase.
  const anchor = useRef<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const toggleHidden = (id: string) => setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));
  const open = (next: NonNullable<Editing>, e?: MouseEvent<HTMLElement>) => {
    if (e) anchor.current = (e.currentTarget.closest('td') ?? e.currentTarget).getBoundingClientRect();
    setEditing(next);
  };
  const close = () => setEditing(null);

  // Open before paint and place it at once, so it never flashes in the middle of the screen.
  useLayoutEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (!editing) {
      if (el.open) el.close();
      return;
    }
    if (!el.open) el.showModal();
    const place = () => {
      const a = anchor.current;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (!a || vw < 640) return setPos(null);
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let left = a.right + 8;
      if (left + w > vw - 8) left = a.left - w - 8;
      if (left < 8) left = Math.max(8, (vw - w) / 2);
      const top = Math.max(8, Math.min(a.top - 24, vh - h - 8));
      setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }));
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editing]);

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => !hidden.includes(r.id) && (!q || r.name.toLowerCase().includes(q) || r.role?.toLowerCase().includes(q)));
    const sorted = [...list].sort((a, b) =>
      viewBy === 'last'
        ? (a.lastName || a.firstName).localeCompare(b.lastName || b.firstName)
        : viewBy === 'role'
          ? (a.role ?? '~').localeCompare(b.role ?? '~') || a.firstName.localeCompare(b.firstName)
          : viewBy === 'hours'
            ? b.hours - a.hours
            : a.firstName.localeCompare(b.firstName),
    );
    // The signed-in person stays on top.
    return [...sorted.filter((r) => r.highlight), ...sorted.filter((r) => !r.highlight)];
  }, [rows, hidden, query, viewBy]);

  const openShifts = shifts.filter((s) => s.employeeId === null);
  const openHours = openShifts.reduce((sum, s) => {
    const [sh, sm] = s.start.split(':').map(Number);
    const [eh, em] = s.end.split(':').map(Number);
    let mins = eh * 60 + em - (sh * 60 + sm);
    if (mins <= 0) mins += 24 * 60;
    return sum + Math.max(0, mins - s.breakMinutes);
  }, 0);

  // person|day → their shifts, time off and punches, built once instead of scanning the week for every cell.
  const shiftsByCell = useMemo(() => groupBy(shifts, (s) => `${s.employeeId}|${s.date}`), [shifts]);
  const offByCell = useMemo(() => groupBy(timeOff, (t) => `${t.employeeId}|${t.date}`), [timeOff]);
  const punchesByCell = useMemo(() => groupBy(punches, (p) => `${p.employeeId}|${p.date}`), [punches]);

  const cell = (employeeId: string | null, day: GridDay) => {
    const own = shiftsByCell.get(`${employeeId}|${day.ymd}`) ?? [];
    const off = employeeId ? (offByCell.get(`${employeeId}|${day.ymd}`) ?? []) : [];
    const punched = employeeId ? (punchesByCell.get(`${employeeId}|${day.ymd}`) ?? []) : [];
    // A punch sits under its shift (or under the day's only shift when it wasn't linked); unscheduled punches go last.
    const sitsUnder = (p: GridPunch, s: GridShift) => p.shiftId === s.id || (!p.shiftId && own.length === 1);
    const loose = punched.filter((p) => !own.some((s) => sitsUnder(p, s)));
    const report = (e: MouseEvent<HTMLElement>) => employeeId && open({ kind: 'punches', employeeId, date: day.ymd }, e);
    const noShow = own.some((s) => s.noShow) && punched.length === 0;
    return (
      <td key={day.ymd} className={`group relative h-[3.75rem] border-b border-l border-stone/50 p-1 align-top ${day.isToday ? 'bg-violet-50/40' : ''}`}>
        <div className="space-y-1">
          {off.map((t) => <TimeOffChip key={t.id} label={t.label} />)}
          {own.map((s) => {
            const mine = punched.filter((p) => sitsUnder(p, s));
            return (
              <div key={s.id} className="space-y-0.5">
                <ShiftChip s={s} onClick={canEdit ? (e) => open({ kind: 'edit', shift: s, tab: 'current' }, e) : undefined} />
                {inlinePunches && mine.map((p) => <PunchChip key={p.id} p={p} onClick={report} />)}
                {inlinePunches && s.noShow && mine.length === 0 && <NoShowChip onClick={report} />}
              </div>
            );
          })}
          {inlinePunches && loose.map((p) => <PunchChip key={p.id} p={p} onClick={report} />)}
          {!inlinePunches && (punched.length > 0 ? <PunchBadge punches={punched} onClick={report} /> : noShow && <NoShowChip onClick={report} />)}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={(e) => open({ kind: 'new', employeeId, date: day.ymd, tab: 'shift' }, e)}
            className={`flex w-full items-center justify-center rounded-md border border-dashed border-violet-300 text-violet-500 opacity-0 transition-opacity hover:bg-violet-50 focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-30 ${own.length || off.length || punched.length ? 'mt-1 h-6' : 'absolute inset-1 w-auto'}`}
            aria-label={`Add shift on ${day.weekday} ${day.day}`}
          >
            <Plus size={15} />
          </button>
        )}
      </td>
    );
  };

  const person = editing ? rows.find((r) => r.id === (editing.kind === 'edit' ? editing.shift.employeeId : editing.employeeId)) : undefined;
  const formKey = !editing
    ? 'none'
    : editing.kind === 'edit'
      ? `${editing.shift.id}-${editing.tab}`
      : editing.kind === 'punches'
        ? `punches-${editing.employeeId}-${editing.date}`
        : `${editing.employeeId}-${editing.date}-${editing.tab}-${editing.preset ? 'copy' : ''}`;

  return (
    <>
      {/*
        The scroller is positioned on purpose: on iPhone Safari, positioned cells inside a scroller
        that isn't stayed put while you swiped (the dates in the header moved, the shifts didn't).
        On phones the name column is narrower so the days get most of the screen.
      */}
      <div className="b-card relative isolate overflow-x-auto overscroll-x-contain !rounded-xl">
        <table className="w-full min-w-[60rem] table-fixed border-collapse text-sm sm:min-w-[1080px]">
          <thead>
            <tr>
              <th className={`${STICKY} z-20 w-[10.5rem] border-b border-stone/60 px-2 py-3 text-left font-normal sm:w-[18rem] sm:px-4`}>
                {searching ? (
                  <div className="flex items-center gap-2">
                    <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} className="b-input !py-1.5" placeholder="Search name or role" aria-label="Search team members" />
                    <button type="button" className="rounded-lg p-1.5 text-muted hover:bg-linen" onClick={() => { setSearching(false); setQuery(''); }} aria-label="Close search"><X size={16} /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-sm text-muted sm:gap-2">
                    <span className="hidden sm:inline">View by</span>
                    <Select value={viewBy} onChange={(e) => setViewBy(e.target.value as ViewBy)} className="b-input !w-auto min-w-0 !rounded-lg !py-1.5 !pl-2.5 !pr-8 font-medium text-ink sm:!pl-3.5" aria-label="View by">
                      <option value="first">First name</option>
                      <option value="last">Last name</option>
                      <option value="role">Role</option>
                      <option value="hours">Scheduled hours</option>
                    </Select>
                    <button type="button" className="rounded-lg p-1.5 hover:bg-linen hover:text-ink" onClick={() => setSearching(true)} aria-label="Search team members"><Search size={17} /></button>
                  </div>
                )}
              </th>
              {days.map((d) => (
                <th key={d.ymd} className="border-b border-l border-stone/60 bg-white px-1 py-3 text-center sm:px-2">
                  <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[0.85rem] font-semibold sm:px-3.5 sm:text-[0.95rem] ${d.isToday ? 'text-violet-700 ring-2 ring-violet-500' : 'text-ink'}`}>
                    {d.weekday}, {d.day}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={`${STICKY} z-10 border-b border-stone/50 px-2 py-2.5 text-sm text-ink sm:px-4`}>
                <span className="flex items-center gap-2.5"><CalendarDays size={16} className="flex-none text-muted" /> Events ({events.length})</span>
              </td>
              {days.map((d) => (
                <td key={d.ymd} className="border-b border-l border-stone/50 p-1 align-top">
                  {events.filter((e) => e.dates.includes(d.ymd)).map((e) => (
                    <div key={e.id} className="truncate rounded-md bg-sea/15 px-2 py-1 text-[0.7rem] font-semibold text-sea" title={e.title}>{e.title}</div>
                  ))}
                </td>
              ))}
            </tr>
            <tr>
              <td className={`${STICKY} z-10 border-b border-stone/50 px-2 py-2.5 text-sm text-ink sm:px-4`}>
                <span className="flex items-center gap-2.5">
                  <CircleDashed size={16} className="flex-none text-muted" />
                  <span>Open shifts ({openShifts.length})<span className="block text-[0.7rem] text-muted">{(openHours / 60).toFixed(2)} Hrs</span></span>
                </span>
              </td>
              {days.map((d) => cell(null, d))}
            </tr>
            <tr>
              <td colSpan={8} className="border-b border-stone/50 bg-linen/80 px-2 py-2 text-[0.82rem] font-medium text-muted sm:px-4">
                {/* Sticky so the label stays in view while the days scroll sideways. */}
                <span className="sticky left-2 sm:left-4">
                  Team members ({visibleRows.length}{hidden.length ? ` of ${rows.length}` : ''})
                  {hidden.length > 0 && (
                    <button type="button" onClick={() => setHidden([])} className="ml-3 text-xs font-semibold text-violet-700 hover:underline">
                      Show {hidden.length} hidden
                    </button>
                  )}
                </span>
              </td>
            </tr>
            {visibleRows.map((r) => (
              <tr key={r.id} className={r.highlight ? 'bg-violet-50/30' : ''}>
                <td className={`${STICKY} z-10 border-b border-stone/50 px-2 py-2 sm:px-4`}>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="hidden sm:contents"><Avatar name={r.name} size="sm" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{r.name}</p>
                      <p className="truncate text-[0.68rem] text-muted">{fmtDuration(r.hours * 60)} hrs{r.role ? ` · ${r.role}` : ''}</p>
                    </div>
                    <button type="button" onClick={() => toggleHidden(r.id)} className="flex-none rounded-lg p-1 text-muted/70 hover:bg-linen hover:text-ink sm:p-1.5" aria-label={`Hide ${r.name} from this view`} title="Hide from this view">
                      <Eye size={16} />
                    </button>
                  </div>
                </td>
                {days.map((d) => cell(r.id, d))}
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted">
                  <EyeOff size={18} className="mx-auto mb-2" /> Nobody to show — clear the search or show hidden people.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <dialog
          ref={dialog}
          onClose={close}
          onClick={(e) => e.target === dialog.current && close()}
          style={pos ? { margin: 0, inset: 'auto', top: pos.top, left: pos.left } : undefined}
          className={`${pos ? '' : 'm-auto'} max-h-[calc(100dvh-1rem)] w-[calc(100%-2rem)] max-w-[27rem] overflow-y-auto rounded-2xl border border-stone/60 bg-ivory p-0 text-ink shadow-[0_24px_60px_-20px_rgba(23,23,58,0.45)] backdrop:bg-ink/15`}
        >
          {editing && (
            <div key={formKey} className="space-y-4 px-5 pb-5 pt-4">
              <div className="flex items-center gap-3">
                <Avatar name={person?.name ?? 'Open shift'} size="md" />
                <h2 className="min-w-0 flex-1 truncate font-display text-xl font-semibold">{person?.name ?? 'Open shift'}</h2>
                {editing.kind === 'edit' && <EditIcons shift={editing.shift} isAdmin={isAdmin} onClose={close} onCopy={() => setEditing({ kind: 'new', employeeId: editing.shift.employeeId, date: editing.shift.date, tab: 'shift', preset: editing.shift })} />}
                <button type="button" onClick={close} className="rounded-lg p-1.5 text-ink hover:bg-linen" aria-label="Close"><X size={19} /></button>
              </div>

              {editing.kind === 'punches' ? (
                <PunchReport
                  day={days.find((d) => d.ymd === editing.date)}
                  date={editing.date}
                  shifts={shiftsByCell.get(`${editing.employeeId}|${editing.date}`) ?? []}
                  punches={punchesByCell.get(`${editing.employeeId}|${editing.date}`) ?? []}
                />
              ) : editing.kind === 'new' ? (
                <>
                  {editing.employeeId && (
                    <Tabs value={editing.tab} onChange={(tab) => setEditing({ ...editing, tab })} tabs={[{ value: 'shift', label: 'Add Shift' }, { value: 'off', label: 'Time off' }]} />
                  )}
                  {editing.tab === 'off' && editing.employeeId ? (
                    <TimeOffPanel employeeId={editing.employeeId} date={editing.date} zone={zone} weekStart={weekStart} onDone={close} />
                  ) : (
                    <ActionForm action={saveShift} onSuccess={() => window.setTimeout(close, 500)}>
                      <input type="hidden" name="employee_id" value={editing.employeeId ?? ''} />
                      <ShiftFields
                        draft={editing.preset ?? { start: '09:00', end: '17:00', roleId: null, locationId: person?.locationId ?? null, breakMinutes: 0, notes: null }}
                        days={days}
                        date={editing.date}
                        multiDay
                        disabled={false}
                        roles={roles}
                        locations={locations}
                        defaultLocationId={defaultLocationId}
                        frequent={editing.employeeId && !editing.preset ? (frequent[editing.employeeId] ?? []) : []}
                        firstName={person?.firstName ?? null}
                      />
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-sm text-muted">
                          <input type="checkbox" name="publish" className="b-check" /> Publish now
                        </label>
                        <SubmitButton className="b-btn-brass" pendingLabel="Saving…">Add</SubmitButton>
                      </div>
                    </ActionForm>
                  )}
                </>
              ) : (
                <EditPanel
                  editing={editing}
                  setTab={(tab) => setEditing({ ...editing, tab })}
                  rows={rows}
                  days={days}
                  roles={roles}
                  locations={locations}
                  defaultLocationId={defaultLocationId}
                  punches={punches.filter((p) => p.shiftId === editing.shift.id || (!p.shiftId && p.employeeId === editing.shift.employeeId && p.date === editing.shift.date))}
                  requests={requests.filter((r) => r.shiftId === editing.shift.id)}
                  isAdmin={isAdmin}
                  zone={zone}
                  weekStart={weekStart}
                  onDone={close}
                />
              )}
            </div>
          )}
        </dialog>
      )}
    </>
  );
}

/** Admin: everything one person punched on one day, under the shift each punch belongs to. */
function PunchReport({ day, date, shifts, punches }: { day?: GridDay; date: string; shifts: GridShift[]; punches: GridPunch[] }) {
  const sitsUnder = (p: GridPunch, s: GridShift) => p.shiftId === s.id || (!p.shiftId && shifts.length === 1);
  const loose = punches.filter((p) => !shifts.some((s) => sitsUnder(p, s)));
  const worked = punches.reduce((sum, p) => sum + p.workedMinutes, 0);
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold">Punch report{day ? ` · ${day.weekday} ${day.day}` : ''}</p>
        {punches.length > 0 && <p className="text-sm text-muted">{fmtDuration(worked)} hrs worked</p>}
      </div>
      {shifts.map((s) => (
        <div key={s.id} className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ backgroundColor: s.color }} /> Scheduled {s.label}
            <span className="font-normal text-muted">· {s.roleName ?? 'No role'}</span>
          </p>
          <PunchList punches={punches.filter((p) => sitsUnder(p, s))} noShow={s.noShow} />
        </div>
      ))}
      {(loose.length > 0 || shifts.length === 0) && (
        <div className="space-y-2">
          {shifts.length > 0 && <p className="text-sm font-semibold">Not on a scheduled shift</p>}
          <PunchList punches={loose} noShow={false} />
        </div>
      )}
      <Link href={`/base/timesheets?date=${date}`} className="inline-block text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300">Open in Timesheets →</Link>
    </div>
  );
}

/** Trash and duplicate, next to the close button on an existing shift. */
function EditIcons({ shift, isAdmin, onClose, onCopy }: { shift: GridShift; isAdmin: boolean; onClose: () => void; onCopy: () => void }) {
  const canChange = !shift.locked && (isAdmin || !shift.published);
  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this shift?', danger: true, confirmLabel: 'Delete' }))) return;
    const fd = new FormData();
    fd.set('id', shift.id);
    try {
      const res = await deleteShift(fd);
      if (res?.ok) {
        toast.success(res.message ?? 'Shift deleted.');
        onClose();
      } else toast.error(res?.message ?? 'Couldn’t delete the shift.');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };
  return (
    <>
      <button type="button" onClick={remove} disabled={!canChange} className="rounded-lg p-1.5 text-ink hover:bg-linen disabled:text-stone disabled:hover:bg-transparent" aria-label="Delete shift" title={canChange ? 'Delete shift' : 'You can’t delete this shift'}>
        <Trash2 size={18} />
      </button>
      <button type="button" onClick={onCopy} className="rounded-lg p-1.5 text-ink hover:bg-linen" aria-label="Duplicate shift" title="Duplicate shift">
        <Copy size={18} />
      </button>
    </>
  );
}

function EditPanel({
  editing,
  setTab,
  rows,
  days,
  roles,
  locations,
  defaultLocationId,
  punches,
  requests,
  isAdmin,
  zone,
  weekStart,
  onDone,
}: {
  editing: Extract<Editing, { kind: 'edit' }>;
  setTab: (tab: Extract<Editing, { kind: 'edit' }>['tab']) => void;
  rows: GridRow[];
  days: GridDay[];
  roles: { id: string; name: string; color: string }[];
  locations: { id: string; name: string }[];
  defaultLocationId: string | null;
  punches: GridPunch[];
  requests: GridRequest[];
  isAdmin: boolean;
  zone: string;
  weekStart: number;
  onDone: () => void;
}) {
  const s = editing.shift;
  const canChange = !s.locked && (isAdmin || !s.published);
  const canMakeTimeOff = isAdmin && !s.locked && Boolean(s.employeeId);
  const waiting = requests.length;

  if (editing.tab === 'off' && s.employeeId) {
    return (
      <>
        <button type="button" onClick={() => setTab('current')} className="text-sm font-semibold text-violet-700 hover:underline dark:text-violet-300">← Back to the shift</button>
        <TimeOffPanel employeeId={s.employeeId} date={s.date} shiftId={s.id} shift={s} zone={zone} weekStart={weekStart} onDone={onDone} />
      </>
    );
  }

  return (
    <>
      <Tabs
        value={editing.tab}
        onChange={setTab}
        tabs={[
          { value: 'current', label: 'Current' },
          { value: 'notes', label: 'Notes' },
          { value: 'approvals', label: waiting ? `Approvals (${waiting})` : 'Approvals' },
        ]}
      />

      {editing.tab === 'current' && (
        <ActionForm action={saveShift} onSuccess={() => window.setTimeout(onDone, 500)}>
          <input type="hidden" name="id" value={s.id} />
          {s.locked ? (
            <Notice>Shifts with existing time cards can’t be edited</Notice>
          ) : !canChange ? (
            <Notice>Only an admin can change a published shift. Use duplicate to add a copy.</Notice>
          ) : null}
          <fieldset disabled={!canChange} className="disabled:opacity-60">
            <Select people name="employee_id" className="b-input" defaultValue={s.employeeId ?? ''} aria-label="Team member" disabled={!canChange}>
              <option value="">Open shift (anyone can request it)</option>
              {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </fieldset>
          <ShiftFields
            draft={s}
            days={days}
            date={s.date}
            multiDay={false}
            disabled={!canChange}
            roles={roles}
            locations={locations}
            defaultLocationId={defaultLocationId}
            frequent={[]}
            firstName={null}
          />
          {s.published ? <input type="hidden" name="publish" value="on" /> : (
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" name="publish" className="b-check" disabled={!canChange} /> Publish now
            </label>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canMakeTimeOff && (
              <button type="button" onClick={() => setTab('off')} className="b-btn-ghost mr-auto">
                <Ban size={14} /> Make it time off
              </button>
            )}
            {canChange && <SubmitButton className="b-btn-brass" pendingLabel="Saving…">Save</SubmitButton>}
            <button type="button" onClick={onDone} className="b-btn-ghost">Cancel</button>
          </div>
        </ActionForm>
      )}

      {editing.tab === 'notes' && (
        <div className="space-y-3 text-sm">
          <div>
            <p className="b-label">Shift notes</p>
            <p className="whitespace-pre-wrap rounded-xl bg-linen px-3.5 py-3 text-ink">{s.notes || <span className="text-muted">No notes on this shift.</span>}</p>
          </div>
          {isAdmin && punches.some((p) => p.note) && (
            <div>
              <p className="b-label">From the time card</p>
              {punches.filter((p) => p.note).map((p) => <p key={p.id} className="rounded-xl bg-linen px-3.5 py-3 italic text-ink">“{p.note}”</p>)}
            </div>
          )}
        </div>
      )}

      {editing.tab === 'approvals' && (
        <div className="space-y-4 text-sm">
          {isAdmin && (
            <div>
              <p className="b-label">Punch in and out</p>
              <PunchList punches={punches} noShow={s.noShow} scheduled={s.label} />
              <Link href={`/base/timesheets?date=${s.date}`} className="mt-2 inline-block text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300">Open in Timesheets →</Link>
            </div>
          )}
          <div>
            <p className="b-label">Shift requests</p>
            {requests.length === 0 ? (
              <p className="rounded-xl bg-linen px-3.5 py-3 text-muted">Nothing waiting for approval.</p>
            ) : (
              <ul className="space-y-2">
                {requests.map((r) => (
                  <li key={r.id} className="rounded-xl border border-stone/60 px-3.5 py-3">
                    <p className="font-medium">
                      {r.type === 'pickup' ? `${r.requester} wants to pick up this shift` : r.claimant ? `${r.requester} → ${r.claimant} (cover)` : `${r.requester} is looking for cover`}
                    </p>
                    {r.note && <p className="mt-0.5 text-xs italic text-muted">“{r.note}”</p>}
                    <div className="mt-2 flex gap-2">
                      {(['approved', 'denied'] as const).map((decision) => (
                        <form key={decision} action={async (fd) => { await decideShiftRequest(fd); onDone(); }}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="decision" value={decision} />
                          <SubmitButton className={decision === 'approved' ? 'b-btn-brass b-btn-sm' : 'b-btn-ghost b-btn-sm'}>{decision === 'approved' ? 'Approve' : 'Deny'}</SubmitButton>
                        </form>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
