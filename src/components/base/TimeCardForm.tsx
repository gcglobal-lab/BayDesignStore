'use client';

import { ActionForm, Field, SubmitButton } from './forms';
import { useDialog } from './Dialog';
import { deleteTimeCard, saveTimeCard } from '@/app/base/(app)/timesheets/actions';
import { DatePicker } from './calendar/Calendar';
import Select from '@/components/ui/Select';
import { confirmDialog, friendlyError, toast } from '@/components/ui/toast';

export type TimeCardValues = { id: string; employee_id: string; date: string; clock_in: string; clock_out: string; meal_minutes: number; notes: string };

export default function TimeCardForm({ employees, date, values }: { employees: { id: string; name: string }[]; date: string; values?: TimeCardValues }) {
  const { close } = useDialog();
  return (
    <ActionForm action={saveTimeCard} onSuccess={() => window.setTimeout(close, 600)}>
      {values && <input type="hidden" name="id" value={values.id} />}
      <Field label="Team member" htmlFor="tc-emp">
        <Select people id="tc-emp" name="employee_id" className="b-input" required defaultValue={values?.employee_id ?? ''} disabled={Boolean(values)}>
          <option value="" disabled>Choose…</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
        {values && <input type="hidden" name="employee_id" value={values.employee_id} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" htmlFor="tc-date"><DatePicker id="tc-date" name="date" required defaultValue={values?.date ?? date} /></Field>
        <Field label="Punch in" htmlFor="tc-in"><input id="tc-in" type="time" name="clock_in" required className="b-input" defaultValue={values?.clock_in ?? '09:00'} /></Field>
        <Field label="Punch out" htmlFor="tc-out" hint="Leave empty if still working."><input id="tc-out" type="time" name="clock_out" className="b-input" defaultValue={values?.clock_out ?? '17:00'} /></Field>
      </div>
      <Field label="Meal break (minutes, unpaid)" htmlFor="tc-meal"><input id="tc-meal" type="number" name="meal_minutes" min={0} max={240} step={5} className="b-input" defaultValue={values?.meal_minutes ?? 0} /></Field>
      <Field label="Reason for the change" htmlFor="tc-notes" hint="Saved with the time card for payroll records.">
        <input id="tc-notes" name="notes" maxLength={1000} className="b-input" defaultValue={values?.notes ?? ''} placeholder="e.g. Forgot to punch out" />
      </Field>
      <div className="flex items-center justify-between pt-2">
        {values ? (
          <button
            type="submit"
            formNoValidate
            formAction={async (fd) => {
              if (!(await confirmDialog({ title: 'Delete this time card?', message: 'This can’t be undone.', danger: true }))) return;
              try {
                await deleteTimeCard(fd);
                toast.success('Time card deleted.');
                close();
              } catch (e) {
                toast.error(friendlyError(e));
              }
            }}
            className="b-btn-danger"
          >
            Delete
          </button>
        ) : <span />}
        <SubmitButton className="b-btn-brass" pendingLabel="Saving…">{values ? 'Save time card' : 'Add time card'}</SubmitButton>
      </div>
    </ActionForm>
  );
}
