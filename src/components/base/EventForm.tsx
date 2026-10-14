'use client';

import { ActionForm, Field, SubmitButton } from './forms';
import { useDialog } from './Dialog';
import { addEvent } from '@/app/base/(app)/manager/actions';
import { DatePicker } from './calendar/Calendar';

export default function EventForm({ today }: { today: string }) {
  const { close } = useDialog();
  return (
    <ActionForm action={addEvent} onSuccess={() => window.setTimeout(close, 700)}>
      <Field label="Title" htmlFor="ev-title">
        <input id="ev-title" name="title" className="b-input" required maxLength={120} placeholder="e.g. Trunk show, inventory count" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts" htmlFor="ev-start"><DatePicker id="ev-start" name="starts_on" required defaultValue={today} /></Field>
        <Field label="Ends" htmlFor="ev-end"><DatePicker id="ev-end" name="ends_on" defaultValue={today} /></Field>
      </div>
      <Field label="Details (optional)" htmlFor="ev-desc">
        <textarea id="ev-desc" name="description" className="b-input min-h-[72px]" maxLength={1000} />
      </Field>
      <div className="flex justify-end"><SubmitButton className="b-btn-brass">Add event</SubmitButton></div>
    </ActionForm>
  );
}
