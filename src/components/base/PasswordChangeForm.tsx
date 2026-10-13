'use client';

import { ActionForm, Field, SubmitButton } from './forms';
import { changePassword } from '@/app/base/(app)/account/actions';

export default function PasswordChangeForm({ welcome }: { welcome: boolean }) {
  return (
    <ActionForm action={changePassword} resetOnSuccess className="max-w-md space-y-4">
      <Field label={welcome ? 'Temporary password (from your manager)' : 'Current password'} htmlFor="pw-current">
        <input id="pw-current" name="current" type="password" required maxLength={200} autoComplete="current-password" className="b-input" />
      </Field>
      <Field label="New password" htmlFor="pw-next" hint="At least 10 characters with letters and numbers. A short sentence works well.">
        <input id="pw-next" name="next" type="password" required minLength={10} maxLength={200} autoComplete="new-password" className="b-input" />
      </Field>
      <Field label="Confirm new password" htmlFor="pw-confirm">
        <input id="pw-confirm" name="confirm" type="password" required minLength={10} maxLength={200} autoComplete="new-password" className="b-input" />
      </Field>
      <SubmitButton className="b-btn-brass" pendingLabel="Saving…">{welcome ? 'Set my password' : 'Change password'}</SubmitButton>
    </ActionForm>
  );
}
