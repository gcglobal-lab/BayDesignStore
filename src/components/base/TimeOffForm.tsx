'use client';

import { useState } from 'react';
import { ActionForm, Field, SubmitButton } from './forms';
import { useDialog } from './Dialog';
import { addTimeOff, requestTimeOff } from '@/app/base/(app)/time-off/actions';
import { DatePicker } from './calendar/Calendar';
import Select from '@/components/ui/Select';

type LeaveType = 'vacation' | 'pto' | 'sick' | 'unpaid';

/** Paid-leave days left, by person ('me' for the signed-in employee), then by year. */
export type PaidLeft = Record<string, Record<string, number>>;

const TYPES: { value: LeaveType; label: string; paid: boolean }[] = [
  { value: 'vacation', label: 'Vacation (paid)', paid: true },
  { value: 'pto', label: 'Paid time off', paid: true },
  { value: 'sick', label: 'Sick leave (paid)', paid: false },
  { value: 'unpaid', label: 'Normal leave (unpaid)', paid: false },
];

const days = (n: number) => `${Math.round(n * 100) / 100} day${n === 1 ? '' : 's'}`;

/**
 * Request time off (employees) or add approved time off for someone (managers, when
 * `employees` is given). Vacation and paid time off come out of the paid-leave
 * balance and can't be picked once it reaches 0 (the server checks again).
 */
export default function TimeOffForm({
  today,
  employees,
  defaultType = 'vacation',
  paidLeft = {},
}: {
  today: string;
  employees?: { id: string; name: string }[];
  defaultType?: LeaveType;
  paidLeft?: PaidLeft;
}) {
  const [allDay, setAllDay] = useState(true);
  const [start, setStart] = useState(today);
  const [person, setPerson] = useState(employees ? '' : 'me');
  const left = paidLeft[person]?.[start.slice(0, 4)];
  const noPaid = left !== undefined && left <= 0;
  const [type, setType] = useState<LeaveType>(defaultType);
  const effectiveType = noPaid && TYPES.find((t) => t.value === type)?.paid ? 'sick' : type;
  const { close } = useDialog();

  return (
    <ActionForm action={employees ? addTimeOff : requestTimeOff} onSuccess={() => window.setTimeout(close, 900)}>
      {employees && (
        <Field label="Team member" htmlFor="to-employee">
          <Select people id="to-employee" name="employee_id" className="b-input" required value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="" disabled>Choose…</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
      )}

      <fieldset>
        <legend className="b-label">What kind of leave?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {TYPES.map((t) => {
            const disabled = t.paid && noPaid;
            return (
              <label
                key={t.value}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                  disabled ? 'cursor-not-allowed border-stone/50 bg-linen text-muted' : effectiveType === t.value ? 'border-brass bg-brass/10 font-medium' : 'cursor-pointer border-stone hover:border-ink/30'
                }`}
              >
                <input type="radio" name="type" value={t.value} className="accent-brass" checked={effectiveType === t.value} disabled={disabled} onChange={() => setType(t.value)} />
                <span>
                  {t.label}
                  {disabled && <span className="block text-[0.7rem] font-normal">No paid leave left</span>}
                </span>
              </label>
            );
          })}
        </div>
        {left !== undefined && (
          <p className={`mt-2 text-xs ${noPaid ? 'text-red-600' : 'text-muted'}`}>
            {noPaid
              ? `No paid leave left for ${start.slice(0, 4)} — sick leave and normal leave are still available.`
              : `${days(left)} of paid leave left for ${start.slice(0, 4)} (vacation and paid time off use it).`}
          </p>
        )}
      </fieldset>

      <Field label="Reason" htmlFor="to-reason">
        <Select id="to-reason" name="reason" className="b-input" defaultValue={defaultType === 'sick' ? 'sick' : 'vacation'} key={defaultType}>
          <option value="vacation">Vacation / holiday</option>
          <option value="personal">Personal</option>
          <option value="sick">Sick / medical</option>
          <option value="family">Family</option>
          <option value="other">Other</option>
        </Select>
      </Field>
      <label className="flex items-center gap-2.5 text-sm">
        <input type="checkbox" name="all_day" className="b-check" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        All day
      </label>
      {allDay ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First day off" htmlFor="to-start">
            <DatePicker id="to-start" name="starts_on" required value={start} onChange={setStart} />
          </Field>
          <Field label="Last day off" htmlFor="to-end">
            <DatePicker id="to-end" name="ends_on" required min={start} defaultValue={start} key={start} />
          </Field>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date" htmlFor="to-date">
            <DatePicker id="to-date" name="starts_on" required value={start} onChange={setStart} />
          </Field>
          <Field label="From" htmlFor="to-from"><input id="to-from" type="time" name="start_time" className="b-input" required defaultValue="12:00" /></Field>
          <Field label="To" htmlFor="to-to"><input id="to-to" type="time" name="end_time" className="b-input" required defaultValue="17:00" /></Field>
        </div>
      )}
      <Field label="Note (optional)" htmlFor="to-note">
        <textarea id="to-note" name="note" className="b-input min-h-[80px]" maxLength={1000} placeholder="Anything your manager should know" />
      </Field>
      <div className="flex justify-end">
        <SubmitButton className="b-btn-brass" pendingLabel="Saving…">{employees ? 'Add time off' : 'Send request'}</SubmitButton>
      </div>
    </ActionForm>
  );
}
