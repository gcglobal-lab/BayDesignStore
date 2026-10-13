'use client';

import { useEffect, useRef, useState } from 'react';
import { Ban, CalendarDays, Plus, Trash2, X } from 'lucide-react';
import { ActionForm, Field, SubmitButton } from './forms';
import { Avatar } from './ui';
import { deleteShift, saveShift } from '@/app/base/(app)/schedule/actions';
import { fmtDuration } from '@/lib/base/time';

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
export type GridRow = { id: string; name: string; hours: number; highlight?: boolean };
export type GridDay = { ymd: string; weekday: string; day: string; isToday: boolean };

type Editing = { kind: 'new'; employeeId: string | null; date: string } | { kind: 'edit'; shift: GridShift } | null;

function ShiftChip({ s, onClick }: { s: GridShift; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`block w-full rounded-lg px-2 py-1 text-left text-[0.7rem] leading-tight text-white shadow-sm transition-transform ${onClick ? 'hover:-translate-y-px hover:shadow-md' : ''} ${s.published ? '' : 'opacity-75 outline-dashed outline-2 -outline-offset-2 outline-white/70'}`}
      style={{ backgroundColor: s.color }}
      title={s.notes ?? undefined}
    >
      <span className="block font-semibold">{s.label}</span>
      <span className="block truncate opacity-90">{s.roleName ?? 'No role'}{!s.published && ' · Draft'}</span>
    </Tag>
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
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (editing && !el.open) el.showModal();
    if (!editing && el.open) el.close();
  }, [editing]);

  const openShifts = shifts.filter((s) => s.employeeId === null);
  const current = editing?.kind === 'edit' ? editing.shift : null;
  const formKey = editing ? (editing.kind === 'edit' ? editing.shift.id : `${editing.employeeId}-${editing.date}`) : 'none';

  const cell = (employeeId: string | null, day: GridDay) => {
    const own = shifts.filter((s) => s.employeeId === employeeId && s.date === day.ymd);
    const off = employeeId ? timeOff.filter((t) => t.employeeId === employeeId && t.date === day.ymd) : [];
    return (
      <td key={day.ymd} className={`group relative h-[3.6rem] border-b border-l border-stone/40 p-1 align-top ${day.isToday ? 'bg-brass/[0.04]' : ''}`}>
        <div className="space-y-1">
          {off.map((t) => (
            <div key={t.id} className="flex items-center gap-1 rounded-lg bg-sand px-2 py-1 text-[0.68rem] leading-tight text-muted">
              <Ban size={11} className="flex-none" /> <span><span className="block font-semibold text-ink/70">Time off</span>{t.label}</span>
            </div>
          ))}
          {own.map((s) => <ShiftChip key={s.id} s={s} onClick={canEdit ? () => setEditing({ kind: 'edit', shift: s }) : undefined} />)}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing({ kind: 'new', employeeId, date: day.ymd })}
            className={`flex w-full items-center justify-center rounded-lg text-muted opacity-0 transition-opacity hover:bg-linen hover:text-ink focus:opacity-100 group-hover:opacity-100 ${own.length || off.length ? 'mt-1 h-5' : 'absolute inset-1 w-auto'}`}
            aria-label={`Add shift on ${day.weekday} ${day.day}`}
          >
            <Plus size={14} />
          </button>
        )}
      </td>
    );
  };

  return (
    <>
      <div className="b-card overflow-x-auto">
        <table className="w-full min-w-[1040px] table-fixed border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-56 border-b border-stone/50 bg-white px-4 py-3 text-left text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">Team member</th>
              {days.map((d) => (
                <th key={d.ymd} className="border-b border-l border-stone/40 px-2 py-3 text-center font-medium">
                  <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 ${d.isToday ? 'bg-ink text-ivory' : ''}`}>
                    {d.weekday}, {d.day}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-linen/40">
              <td className="sticky left-0 z-10 border-b border-stone/40 bg-ivory px-4 py-2 text-xs text-muted">
                <span className="flex items-center gap-2"><CalendarDays size={14} /> Events ({events.length})</span>
              </td>
              {days.map((d) => (
                <td key={d.ymd} className="border-b border-l border-stone/40 p-1 align-top">
                  {events.filter((e) => e.dates.includes(d.ymd)).map((e) => (
                    <div key={e.id} className="truncate rounded-md bg-sea/10 px-2 py-0.5 text-[0.68rem] font-medium text-sea" title={e.title}>{e.title}</div>
                  ))}
                </td>
              ))}
            </tr>
            <tr className="bg-linen/40">
              <td className="sticky left-0 z-10 border-b border-stone/40 bg-ivory px-4 py-2 text-xs text-muted">
                Open shifts ({openShifts.length})
              </td>
              {days.map((d) => cell(null, d))}
            </tr>
            <tr>
              <td colSpan={8} className="border-b border-stone/40 bg-white px-4 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">Team members ({rows.length})</td>
            </tr>
            {rows.map((r) => (
              <tr key={r.id} className={r.highlight ? 'bg-brass/[0.05]' : ''}>
                <td className="sticky left-0 z-10 border-b border-stone/40 bg-white px-4 py-2">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={r.name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="text-[0.68rem] text-muted">{fmtDuration(r.hours * 60)}</p>
                    </div>
                  </div>
                </td>
                {days.map((d) => cell(r.id, d))}
              </tr>
            ))}
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
                    <select id="sh-emp" name="employee_id" className="b-input" defaultValue={current ? current.employeeId ?? '' : editing.kind === 'new' ? editing.employeeId ?? '' : ''}>
                      <option value="">Open shift (anyone can request it)</option>
                      {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Date" htmlFor="sh-date"><input id="sh-date" type="date" name="date" required className="b-input" defaultValue={current?.date ?? (editing.kind === 'new' ? editing.date : '')} /></Field>
                    <Field label="Start" htmlFor="sh-start"><input id="sh-start" type="time" name="start" required className="b-input" defaultValue={current?.start ?? '09:00'} /></Field>
                    <Field label="End" htmlFor="sh-end"><input id="sh-end" type="time" name="end" required className="b-input" defaultValue={current?.end ?? '17:00'} /></Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Role" htmlFor="sh-role">
                      <select id="sh-role" name="role_id" className="b-input" defaultValue={current?.roleId ?? ''}>
                        <option value="">No role</option>
                        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Unpaid break (minutes)" htmlFor="sh-break"><input id="sh-break" type="number" name="break_minutes" min={0} max={240} step={5} className="b-input" defaultValue={current?.breakMinutes ?? 0} /></Field>
                  </div>
                  {locations.length > 1 && (
                    <Field label="Location" htmlFor="sh-loc">
                      <select id="sh-loc" name="location_id" className="b-input" defaultValue={current?.locationId ?? defaultLocationId ?? ''}>
                        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
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
                          if (!window.confirm('Delete this shift?')) return;
                          await deleteShift(fd);
                          setEditing(null);
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
