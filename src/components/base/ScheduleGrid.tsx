'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, CalendarDays, CircleDashed, Eye, EyeOff, Plus, Search, Trash2, X } from 'lucide-react';
import { ActionForm, Field, SubmitButton } from './forms';
import { Avatar } from './ui';
import { DatePicker } from './calendar/Calendar';
import { deleteShift, saveShift } from '@/app/base/(app)/schedule/actions';
import { fmtDuration } from '@/lib/base/time';
import Select from '@/components/ui/Select';
import { confirmDialog, friendlyError, toast } from '@/components/ui/toast';

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
};
export type GridTimeOff = { id: string; employeeId: string; date: string; label: string };
export type GridEvent = { id: string; title: string; dates: string[] };
export type GridRow = { id: string; name: string; firstName: string; lastName: string; role: string | null; hours: number; highlight?: boolean; /** Their store — new shifts start there. */ locationId?: string | null };
export type GridDay = { ymd: string; weekday: string; day: string; isToday: boolean };

type Editing = { kind: 'new'; employeeId: string | null; date: string } | { kind: 'edit'; shift: GridShift } | null;
type ViewBy = 'first' | 'last' | 'role' | 'hours';

function ShiftChip({ s, onClick }: { s: GridShift; onClick?: () => void }) {
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

export default function ScheduleGrid({
  days,
  rows,
  shifts,
  timeOff,
  events,
  roles,
  locations,
  canEdit,
  defaultLocationId,
  zone,
  weekStart,
}: {
  days: GridDay[];
  rows: GridRow[];
  shifts: GridShift[];
  timeOff: GridTimeOff[];
  events: GridEvent[];
  roles: { id: string; name: string; color: string }[];
  locations: { id: string; name: string }[];
  canEdit: boolean;
  defaultLocationId: string | null;
  zone: string;
  weekStart: number;
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const [viewBy, setViewBy] = useState<ViewBy>('first');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [hidden, setHidden] = useState<string[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('bdb-schedule-hidden') ?? '[]');
      if (Array.isArray(saved)) setHidden(saved.filter((x) => typeof x === 'string'));
    } catch {
      // Storage or parsing can fail (private mode); nothing to do.
    }
  }, []);
  const toggleHidden = (id: string) =>
    setHidden((h) => {
      const next = h.includes(id) ? h.filter((x) => x !== id) : [...h, id];
      try {
        window.localStorage.setItem('bdb-schedule-hidden', JSON.stringify(next));
      } catch {
      // Storage or parsing can fail (private mode); nothing to do.
    }
      return next;
    });

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (editing && !el.open) el.showModal();
    if (!editing && el.open) el.close();
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
  const current = editing?.kind === 'edit' ? editing.shift : null;
  const formKey = editing ? (editing.kind === 'edit' ? editing.shift.id : `${editing.employeeId}-${editing.date}`) : 'none';

  const cell = (employeeId: string | null, day: GridDay) => {
    const own = shifts.filter((s) => s.employeeId === employeeId && s.date === day.ymd);
    const off = employeeId ? timeOff.filter((t) => t.employeeId === employeeId && t.date === day.ymd) : [];
    return (
      <td key={day.ymd} className={`group relative h-[3.75rem] border-b border-l border-stone/50 p-1 align-top ${day.isToday ? 'bg-violet-50/40' : ''}`}>
        <div className="space-y-1">
          {off.map((t) => <TimeOffChip key={t.id} label={t.label} />)}
          {own.map((s) => <ShiftChip key={s.id} s={s} onClick={canEdit ? () => setEditing({ kind: 'edit', shift: s }) : undefined} />)}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing({ kind: 'new', employeeId, date: day.ymd })}
            className={`flex w-full items-center justify-center rounded-md border border-dashed border-violet-300 text-violet-500 opacity-0 transition-opacity hover:bg-violet-50 focus:opacity-100 group-hover:opacity-100 ${own.length || off.length ? 'mt-1 h-6' : 'absolute inset-1 w-auto'}`}
            aria-label={`Add shift on ${day.weekday} ${day.day}`}
          >
            <Plus size={15} />
          </button>
        )}
      </td>
    );
  };

  return (
    <>
      <div className="b-card overflow-x-auto !rounded-xl">
        <table className="w-full min-w-[1080px] table-fixed border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-[18rem] border-b border-stone/60 bg-white px-4 py-3 text-left font-normal">
                {searching ? (
                  <div className="flex items-center gap-2">
                    <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} className="b-input !py-1.5" placeholder="Search name or role" aria-label="Search team members" />
                    <button type="button" className="rounded-lg p-1.5 text-muted hover:bg-linen" onClick={() => { setSearching(false); setQuery(''); }} aria-label="Close search"><X size={16} /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <span>View by</span>
                    <Select value={viewBy} onChange={(e) => setViewBy(e.target.value as ViewBy)} className="b-input !w-auto !rounded-lg !py-1.5 !pr-8 font-medium text-ink">
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
                <th key={d.ymd} className="border-b border-l border-stone/60 bg-white px-2 py-3 text-center">
                  <span className={`inline-flex items-center rounded-full px-3.5 py-1 text-[0.95rem] font-semibold ${d.isToday ? 'text-violet-700 ring-2 ring-violet-500' : 'text-ink'}`}>
                    {d.weekday}, {d.day}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="sticky left-0 z-10 border-b border-stone/50 bg-white px-4 py-2.5 text-sm text-ink">
                <span className="flex items-center gap-2.5"><CalendarDays size={16} className="text-muted" /> Events ({events.length})</span>
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
              <td className="sticky left-0 z-10 border-b border-stone/50 bg-white px-4 py-2.5 text-sm text-ink">
                <span className="flex items-center gap-2.5">
                  <CircleDashed size={16} className="text-muted" />
                  <span>Open shifts ({openShifts.length})<span className="block text-[0.7rem] text-muted">{(openHours / 60).toFixed(2)} Hrs</span></span>
                </span>
              </td>
              {days.map((d) => cell(null, d))}
            </tr>
            <tr>
              <td colSpan={8} className="border-b border-stone/50 bg-linen/80 px-4 py-2 text-[0.82rem] font-medium text-muted">
                Team members ({visibleRows.length}{hidden.length ? ` of ${rows.length}` : ''})
                {hidden.length > 0 && (
                  <button type="button" onClick={() => { setHidden([]); try { window.localStorage.removeItem('bdb-schedule-hidden'); } catch {
      // Storage or parsing can fail (private mode); nothing to do.
    } }} className="ml-3 text-xs font-semibold text-violet-700 hover:underline">
                    Show {hidden.length} hidden
                  </button>
                )}
              </td>
            </tr>
            {visibleRows.map((r) => (
              <tr key={r.id} className={r.highlight ? 'bg-violet-50/30' : ''}>
                <td className="sticky left-0 z-10 border-b border-stone/50 bg-white px-4 py-2">
                  <div className="flex items-center gap-3">
                    <Avatar name={r.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{r.name}</p>
                      <p className="text-[0.68rem] text-muted">{fmtDuration(r.hours * 60)} hrs{r.role ? ` · ${r.role}` : ''}</p>
                    </div>
                    <button type="button" onClick={() => toggleHidden(r.id)} className="rounded-lg p-1.5 text-muted/70 hover:bg-linen hover:text-ink" aria-label={`Hide ${r.name} from this view`} title="Hide from this view">
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
          onClose={() => setEditing(null)}
          onClick={(e) => e.target === dialog.current && setEditing(null)}
          className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-3xl border border-stone/60 bg-ivory p-0 text-ink shadow-[0_40px_80px_-30px_rgba(23,23,58,0.45)] backdrop:bg-ink/40"
        >
          {editing && (
            <div>
              <div className="flex items-center justify-between border-b border-stone/50 px-6 py-5">
                <h2 className="b-h2">{current ? 'Edit shift' : 'Add shift'}</h2>
                <button type="button" onClick={() => setEditing(null)} className="b-btn-quiet -mr-2 !p-2" aria-label="Close"><X size={18} /></button>
              </div>
              <div className="px-6 py-5">
                <ActionForm key={formKey} action={saveShift} onSuccess={() => window.setTimeout(() => setEditing(null), 600)}>
                  {current && <input type="hidden" name="id" value={current.id} />}
                  <Field label="Team member" htmlFor="sh-emp">
                    <Select people id="sh-emp" name="employee_id" className="b-input" defaultValue={current ? current.employeeId ?? '' : editing.kind === 'new' ? editing.employeeId ?? '' : ''}>
                      <option value="">Open shift (anyone can request it)</option>
                      {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </Select>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Date" htmlFor="sh-date"><DatePicker id="sh-date" name="date" required defaultValue={current?.date ?? (editing.kind === 'new' ? editing.date : '')} zone={zone} weekStart={weekStart} /></Field>
                    <Field label="Start" htmlFor="sh-start"><input id="sh-start" type="time" name="start" required className="b-input" defaultValue={current?.start ?? '09:00'} /></Field>
                    <Field label="End" htmlFor="sh-end"><input id="sh-end" type="time" name="end" required className="b-input" defaultValue={current?.end ?? '17:00'} /></Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Role" htmlFor="sh-role">
                      <Select id="sh-role" name="role_id" className="b-input" defaultValue={current?.roleId ?? ''}>
                        <option value="">No role</option>
                        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Unpaid break (minutes)" htmlFor="sh-break"><input id="sh-break" type="number" name="break_minutes" min={0} max={240} step={5} className="b-input" defaultValue={current?.breakMinutes ?? 0} /></Field>
                  </div>
                  {locations.length > 1 && (
                    <Field label="Location" htmlFor="sh-loc">
                      <Select id="sh-loc" name="location_id" className="b-input" defaultValue={current?.locationId ?? (editing.kind === 'new' ? rows.find((r) => r.id === editing.employeeId)?.locationId : null) ?? defaultLocationId ?? ''}>
                        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </Select>
                    </Field>
                  )}
                  {locations.length === 1 && <input type="hidden" name="location_id" value={locations[0].id} />}
                  <Field label="Notes (optional)" htmlFor="sh-notes"><input id="sh-notes" name="notes" maxLength={500} className="b-input" defaultValue={current?.notes ?? ''} /></Field>
                  <label className="flex items-center gap-2.5 text-sm">
                    <input type="checkbox" name="publish" className="b-check" defaultChecked={current?.published ?? false} disabled={current?.published} />
                    {current?.published ? 'Published — the team can see this shift' : 'Publish now (otherwise it stays a draft)'}
                  </label>
                  {current?.published && <input type="hidden" name="publish" value="on" />}
                  <div className="flex items-center justify-between gap-2 pt-2">
                    {current ? (
                      <button
                        type="submit"
                        formNoValidate
                        formAction={async (fd) => {
                          if (!(await confirmDialog({ title: 'Delete this shift?', danger: true }))) return;
                          try {
                            await deleteShift(fd);
                            toast.success('Shift deleted.');
                            setEditing(null);
                          } catch (e) {
                            toast.error(friendlyError(e));
                          }
                        }}
                        className="b-btn-danger"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    ) : <span />}
                    <SubmitButton className="b-btn-brass" pendingLabel="Saving…">{current ? 'Save shift' : 'Add shift'}</SubmitButton>
                  </div>
                </ActionForm>
              </div>
            </div>
          )}
        </dialog>
      )}
    </>
  );
}
