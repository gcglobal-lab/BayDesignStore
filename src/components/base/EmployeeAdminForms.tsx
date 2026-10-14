'use client';

import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Trash2, Wand2 } from 'lucide-react';
import { ActionForm, Field, SubmitButton } from './forms';
import { CopyButton, PasswordField, SecretReveal } from './EmployeeForm';
import { DatePicker } from './calendar/Calendar';
import { deleteEmployeePassword, generateMissingPasswords, setEmployeePassword, setWage } from '@/app/base/(app)/team/actions';

/** Admin only: see, change or remove someone's password. */
export function PasswordPanel({ id, current, hasPassword }: { id: string; current: string | null; hasPassword: boolean }) {
  return (
    <div className="space-y-4">
      <ActionForm action={setEmployeePassword} className="space-y-3">
        {(result) => (
          <>
            <input type="hidden" name="id" value={id} />
            <PasswordField current={hasPassword ? current : ''} editing={false} />
            <SecretReveal result={result} />
            <SubmitButton className="b-btn-primary" pendingLabel="Saving…">
              <KeyRound size={14} /> {hasPassword ? 'Save new password' : 'Set password'}
            </SubmitButton>
            <p className="text-xs text-muted">Empty + save generates one. Saving signs them out on their other devices.</p>
          </>
        )}
      </ActionForm>
      {hasPassword && (
        <form action={deleteEmployeePassword} className="border-t border-stone/50 pt-4">
          <input type="hidden" name="id" value={id} />
          <SubmitButton className="b-btn-danger b-btn-sm" confirm="Remove this password? They won’t be able to sign in until you set a new one.">
            <Trash2 size={13} /> Remove password
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

/** A password in a table cell: hidden until clicked, with copy. */
export function PasswordCell({ password, hasPassword }: { password: string | null; hasPassword: boolean }) {
  const [show, setShow] = useState(false);
  if (!hasPassword) return <span className="b-badge-amber">No password yet</span>;
  if (!password) return <span className="text-xs text-muted" title="Set before passwords were stored — set a new one to see it">Not stored · set new</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <code className={`rounded-lg px-2 py-1 font-mono text-xs ${show ? 'bg-violet-50 text-violet-900 ring-1 ring-inset ring-violet-200' : 'bg-linen text-muted'}`}>{show ? password : '••••••••'}</code>
      <button type="button" onClick={() => setShow(!show)} className="rounded-lg p-1 text-muted hover:bg-linen hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      {show && <CopyButton text={password} />}
    </span>
  );
}

export function GenerateMissingPasswords({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <ActionForm action={generateMissingPasswords} className="flex flex-wrap items-center gap-3" showMessage>
      <SubmitButton className="b-btn-ghost" pendingLabel="Creating…" confirm={`Create a password for the ${count} team member${count === 1 ? '' : 's'} who don’t have one?`}>
        <Wand2 size={15} /> Passwords for {count} without one
      </SubmitButton>
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
        <Field label="Effective" htmlFor="w-eff"><DatePicker id="w-eff" name="effective_from" required defaultValue={today} /></Field>
      </div>
      <SubmitButton className="b-btn-ghost" pendingLabel="Saving…">Save wage</SubmitButton>
    </ActionForm>
  );
}
