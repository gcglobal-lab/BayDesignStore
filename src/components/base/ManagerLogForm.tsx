'use client';

import { ActionForm, SubmitButton } from './forms';
import { addLogEntry } from '@/app/base/(app)/manager/actions';

export default function ManagerLogForm() {
  return (
    <ActionForm action={addLogEntry} resetOnSuccess className="space-y-2">
      <textarea name="body" required maxLength={2000} className="b-input min-h-[72px]" placeholder="Deliveries, issues, notes for the next shift…" aria-label="Manager log note" />
      <div className="flex justify-end">
        <SubmitButton className="b-btn-ghost b-btn-sm" pendingLabel="Saving…">Add note</SubmitButton>
      </div>
    </ActionForm>
  );
}
