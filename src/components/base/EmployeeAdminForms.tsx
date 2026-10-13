'use client';

import { useState } from 'react';
import { ActionForm, Field, SubmitButton } from './forms';
import { SecretReveal } from './EmployeeForm';
import { setEmployeePassword, setWage } from '@/app/base/(app)/team/actions';

export function PasswordForm({ id, hasPassword }: { id: string; hasPassword: boolean }) {
  const [custom, setCustom] = useState(false);
  return (
    <ActionForm action={setEmployeePassword} resetOnSuccess>
      {(result) => (
        <>
          <input type="hidden" name="id" value={id} />
          <p className="text-sm text-muted">
            {hasPassword ? 'Resetting signs them out on every device.' : 'They can’t sign in until a password is set.'} They’ll choose their own password at their next sign-in.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="b-check" checked={custom} onChange={(e) => setCustom(e.target.checked)} /> Type a password instead of generating one
          </label>
          {custom && <input name="password" className="b-input font-mono" minLength={10} maxLength={200} required autoComplete="off" placeholder="At least 10 characters" />}
          <SecretReveal result={result} />
          <SubmitButton className="b-btn-primary" pendingLabel="Saving…" confirm={hasPassword ? 'Reset this password and sign them out everywhere?' : undefined}>
            {hasPassword ? 'Reset password' : 'Set password'}
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function WageForm({ id, today }: { id: string; today: string }) {
  return (
    <ActionForm action={setWage} resetOnSuccess>
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Amount" htmlFor="w-amount">
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
            <input id="w-amount" name="amount" type="number" min="0" step="0.01" required className="b-input pl-7" />
          </div>
        </Field>
        <Field label="Type" htmlFor="w-type">
          <select id="w-type" name="wage_type" className="b-input" defaultValue="hourly">
            <option value="hourly">Per hour</option>
            <option value="salary">Per year</option>
          </select>
        </Field>
        <Field label="Effective" htmlFor="w-eff"><input id="w-eff" name="effective_from" type="date" required defaultValue={today} className="b-input" /></Field>
      </div>
      <SubmitButton className="b-btn-ghost" pendingLabel="Saving…">Save wage</SubmitButton>
    </ActionForm>
  );
}
