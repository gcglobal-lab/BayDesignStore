'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, KeyRound } from 'lucide-react';
import type { ActionResult } from '@/lib/base/actionResult';
import { ActionForm, Field, SubmitButton } from './forms';
import { createEmployee, updateEmployee } from '@/app/base/(app)/team/actions';

type Option = { id: string; name: string; color?: string };
export type EmployeeFormValues = {
  id?: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  login_id: string;
  access_level: 'employee' | 'manager' | 'admin';
  location_id: string | null;
  title: string | null;
  is_contractor: boolean;
  birthday: string | null;
  hire_date: string | null;
  role_ids: string[];
  primary_role_id: string | null;
};

const suggestLogin = (first: string, last: string) =>
  [first, last]
    .map((s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ''))
    .filter(Boolean)
    .join('.');

export function SecretReveal({ result }: { result: ActionResult }) {
  const [copied, setCopied] = useState(false);
  const password = result?.data?.password;
  if (!password) return null;
  return (
    <div className="rounded-2xl border border-brass/40 bg-sand/40 p-4">
      <p className="flex items-center gap-2 text-sm font-medium"><KeyRound size={15} className="text-brass" /> Temporary password — shown only once</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="flex-1 rounded-xl bg-white px-3 py-2 font-mono text-base tracking-wider">{password}</code>
        <button
          type="button"
          className="b-btn-ghost b-btn-sm"
          onClick={() => {
            navigator.clipboard?.writeText(password);
            setCopied(true);
          }}
        >
          <Copy size={13} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export default function EmployeeForm({
  values,
  roles,
  locations,
  canSetLevel,
  isSelf = false,
}: {
  values?: EmployeeFormValues;
  roles: Option[];
  locations: Option[];
  canSetLevel: boolean;
  isSelf?: boolean;
}) {
  const router = useRouter();
  const editing = Boolean(values?.id);
  const [first, setFirst] = useState(values?.first_name ?? '');
  const [last, setLast] = useState(values?.last_name ?? '');
  const [login, setLogin] = useState(values?.login_id ?? '');
  const [loginTouched, setLoginTouched] = useState(editing);
  const [selected, setSelected] = useState<string[]>(values?.role_ids ?? []);
  const [primary, setPrimary] = useState<string | null>(values?.primary_role_id ?? null);
  const [passwordMode, setPasswordMode] = useState<'generate' | 'custom' | 'later'>('generate');
  const loginValue = loginTouched ? login : suggestLogin(first, last);

  return (
    <ActionForm action={editing ? updateEmployee : createEmployee} className="space-y-8">
      {(result) => (
        <>
          {editing && <input type="hidden" name="id" value={values!.id} />}
          {!editing && result?.ok && result.data?.id && (
            <div className="space-y-3">
              <SecretReveal result={result} />
              <div className="flex gap-2">
                <button type="button" className="b-btn-primary" onClick={() => router.push(`/base/team/${result.data!.id}`)}>View profile</button>
                <button type="button" className="b-btn-ghost" onClick={() => router.push('/base/team')}>Back to roster</button>
              </div>
            </div>
          )}

          <fieldset className="space-y-4">
            <legend className="b-eyebrow mb-3">Personal details</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" htmlFor="first_name"><input id="first_name" name="first_name" className="b-input" required maxLength={80} value={first} onChange={(e) => setFirst(e.target.value)} /></Field>
              <Field label="Last name" htmlFor="last_name"><input id="last_name" name="last_name" className="b-input" maxLength={80} value={last} onChange={(e) => setLast(e.target.value)} /></Field>
              <Field label="Email" htmlFor="email"><input id="email" name="email" type="email" className="b-input" maxLength={254} defaultValue={values?.email ?? ''} autoComplete="off" /></Field>
              <Field label="Phone" htmlFor="phone"><input id="phone" name="phone" type="tel" className="b-input" maxLength={40} defaultValue={values?.phone ?? ''} placeholder="(239) 555-0123" /></Field>
              <Field label="Birthday (optional)" htmlFor="birthday"><input id="birthday" name="birthday" type="date" className="b-input" defaultValue={values?.birthday ?? ''} /></Field>
              <Field label="Hire date (optional)" htmlFor="hire_date"><input id="hire_date" name="hire_date" type="date" className="b-input" defaultValue={values?.hire_date ?? ''} /></Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="b-eyebrow mb-3">Access</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Login ID" htmlFor="login_id" hint="Used to sign in, together with their password.">
                <input
                  id="login_id"
                  name="login_id"
                  className="b-input font-mono"
                  required
                  pattern="[a-z0-9._\-]{3,64}"
                  maxLength={64}
                  autoCapitalize="none"
                  spellCheck={false}
                  value={loginValue}
                  onChange={(e) => {
                    setLoginTouched(true);
                    setLogin(e.target.value.toLowerCase());
                  }}
                />
              </Field>
              <Field label="Access level" htmlFor="access_level" hint={!canSetLevel ? 'Only an admin can change access levels.' : isSelf ? 'You can’t change your own access level.' : 'Managers see the whole team; employees only see their own information.'}>
                <select id="access_level" name="access_level" className="b-input" defaultValue={values?.access_level ?? 'employee'} disabled={!canSetLevel || isSelf}>
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
                {(!canSetLevel || isSelf) && <input type="hidden" name="access_level" value={values?.access_level ?? 'employee'} />}
              </Field>
            </div>
            {!editing && (
              <div className="rounded-2xl border border-stone/60 bg-white/70 p-4">
                <p className="text-sm font-medium">Password</p>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  {(['generate', 'custom', 'later'] as const).map((mode) => (
                    <label key={mode} className="flex items-center gap-2">
                      <input type="radio" name="password_mode" value={mode} checked={passwordMode === mode} onChange={() => setPasswordMode(mode)} className="accent-brass" />
                      {mode === 'generate' ? 'Generate a temporary password' : mode === 'custom' ? 'Type one' : 'Set later'}
                    </label>
                  ))}
                </div>
                {passwordMode === 'custom' && (
                  <input name="password" type="text" className="b-input mt-3 font-mono" minLength={10} maxLength={200} required autoComplete="off" placeholder="At least 10 characters, letters and numbers" />
                )}
                <p className="mt-2 text-xs text-muted">They’ll be asked to choose their own password the first time they sign in.</p>
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="b-eyebrow mb-3">Work</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Location" htmlFor="location_id">
                <select id="location_id" name="location_id" className="b-input" defaultValue={values?.location_id ?? locations[0]?.id ?? ''}>
                  <option value="">—</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
              <Field label="Title (optional)" htmlFor="title" hint="Shown under their name, e.g. “Account Owner”.">
                <input id="title" name="title" className="b-input" maxLength={80} defaultValue={values?.title ?? ''} />
              </Field>
            </div>
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" name="is_contractor" className="b-check" defaultChecked={values?.is_contractor} /> Contractor (not on payroll)
            </label>
            <div>
              <p className="b-label">Roles {selected.length > 1 && <span className="font-normal">· click ★ to choose the primary role</span>}</p>
              <div className="flex flex-wrap gap-2">
                {roles.map((r) => {
                  const on = selected.includes(r.id);
                  const isPrimary = on && (primary ?? selected[0]) === r.id;
                  return (
                    <span key={r.id} className={`inline-flex items-center overflow-hidden rounded-full border text-xs font-medium transition-colors ${on ? 'border-transparent text-white' : 'border-stone bg-white text-ink hover:border-ink/40'}`} style={on ? { backgroundColor: r.color } : undefined}>
                      <label className="flex cursor-pointer items-center gap-1.5 py-1.5 pl-3 pr-2">
                        <input
                          type="checkbox"
                          name="role_ids"
                          value={r.id}
                          checked={on}
                          className="sr-only"
                          onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id)))}
                        />
                        {!on && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />}
                        {r.name}
                      </label>
                      {on && selected.length > 1 && (
                        <button type="button" onClick={() => setPrimary(r.id)} className={`pr-2.5 ${isPrimary ? 'opacity-100' : 'opacity-50 hover:opacity-90'}`} aria-label={`Make ${r.name} the primary role`}>
                          ★
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
              <input type="hidden" name="primary_role_id" value={selected.includes(primary ?? '') ? primary! : selected[0] ?? ''} />
            </div>
            {!editing && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Wage (optional)" htmlFor="wage_amount">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
                    <input id="wage_amount" name="wage_amount" type="number" min="0" step="0.01" className="b-input pl-7" />
                  </div>
                </Field>
                <Field label="Wage type" htmlFor="wage_type">
                  <select id="wage_type" name="wage_type" className="b-input" defaultValue="hourly">
                    <option value="hourly">Per hour</option>
                    <option value="salary">Per year (salary)</option>
                  </select>
                </Field>
              </div>
            )}
          </fieldset>

          <div className="flex justify-end gap-2 border-t border-stone/50 pt-5">
            <SubmitButton className="b-btn-brass" pendingLabel="Saving…">{editing ? 'Save changes' : 'Add team member'}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
