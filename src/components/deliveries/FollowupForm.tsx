'use client';

import { setFollowup } from '@/app/base/(app)/deliveries/orders/actions';
import { ActionForm, SubmitButton } from '@/components/base/forms';
import { followupLabel, type FollowupStatus } from '@/lib/deliveries/types';

/** Record the office's follow-up after a delivery. */
export default function FollowupForm({ id, status, note, compact = false }: { id: string; status: FollowupStatus; note: string | null; compact?: boolean }) {
  return (
    <ActionForm action={setFollowup} className={compact ? 'flex flex-wrap items-center gap-1.5' : 'space-y-2'}>
      <input type="hidden" name="id" value={id} />
      <select name="followup_status" defaultValue={status} className="b-input !w-auto !py-1 text-xs" aria-label="Follow-up">
        {(Object.keys(followupLabel) as FollowupStatus[]).map((k) => <option key={k} value={k}>{followupLabel[k]}</option>)}
      </select>
      <input name="followup_note" defaultValue={note ?? ''} maxLength={2000} placeholder="Note (e.g. called — happy)" className={`b-input !py-1 text-xs ${compact ? '!w-48' : ''}`} aria-label="Follow-up note" />
      <SubmitButton className="b-btn-ghost b-btn-sm">Save</SubmitButton>
    </ActionForm>
  );
}
