'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AtSign, Briefcase, Check, Copy, DollarSign, Eye, EyeOff, KeyRound, Mail, Phone, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import type { ActionResult } from '@/lib/base/actionResult';
import { ActionForm, Field, SubmitButton } from './forms';
import { DatePicker } from './calendar/Calendar';
import { IconInput, RolePicker, Section, type RoleOption } from './EmployeeFormParts';
import { createEmployee, updateEmployee } from '@/app/base/(app)/team/actions';

export type EmployeeFormValues = {
  id?: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  login_id: string;
  access_level: 'employee' | 'manager' | 'admin';
  location_id?: string | null;
  title?: string | null;
  is_contractor: boolean;
  birthday: string | null;
  hire_date: string | null;
  role_ids: string[];
  primary_role_id: string | null;
  /** Admins only: the current password (null when none is stored). */
  password?: string | null;
};

const suggestLogin = (first: string, last: string) =>
  [first, last]
    .map((s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ''))
    .filter(Boolean)
    .join('.');

export function makePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let out = '';
  bytes.forEach((b, i) => {
    if (i > 0 && i % 4 === 0) out += '-';
    out += alphabet[b % alphabet.length];
  });
  return /\d/.test(out) ? out : `${out.slice(0, -1)}7`;
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="b-btn-ghost b-btn-sm"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : label}
    </button>
  );
}

/** Login ID + password to hand to the team member, after saving. */
export function SecretReveal({ result }: { result: ActionResult }) {
  const password = result?.data?.password;
  if (!result?.ok || !password) return null;
  return (
    <div className="rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50 to-white p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><KeyRound size={15} /> Sign-in details</p>
      <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-inset ring-emerald-200">
          <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">Login ID</p>
          <p className="font-mono">{result.data?.login ?? '—'}</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-inset ring-emerald-200">
          <div className="min-w-0 flex-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">Password</p>
            <p className="truncate font-mono tracking-wide">{password}</p>
          </div>
          <CopyButton text={`Login ID: ${result.data?.login ?? ''}\nPassword: ${password}`} />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">You can always see and change it later in Team ▸ Roster.</p>
    </div>
  );
}

/** Admin-only password box: visible text, generate, copy. On edit it's only submitted if changed. */
export function PasswordField({ current, editing }: { current: string | null | undefined; editing: boolean }) {
  const [value, setValue] = useState(current ?? '');
  const [show, setShow] = useState(true);
  const changed = value !== (current ?? '');
  return (
    <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/80 to-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold"><KeyRound size={15} className="text-violet-600" /> Password</p>
        <span className="b-badge-blue"><ShieldCheck size={11} /> Only admins see this</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <input
            // Only sent when it was typed or generated, so saving other details never resets it.
            name={editing && !changed ? undefined : 'password'}
            type={show ? 'text' : 'password'}
            className="b-input pr-10 font-mono tracking-wide"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={200}
            autoComplete="off"
            spellCheck={false}
            placeholder={editing ? (current === null ? 'No password stored — type one' : 'Type a new password') : 'Type a password or generate one'}
          />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <button type="button" className="b-btn-ghost b-btn-sm" onClick={() => setValue(makePassword())}><RefreshCw size={13} /> Generate</button>
        {value && <CopyButton text={value} />}
      </div>
      <p className="mt-2 text-xs text-muted">
        {editing
          ? changed
            ? 'Saving sets this new password and signs them out on their other devices.'
            : current === null
              ? 'This person has a password that was set before passwords were stored, so it can’t be shown. Type or generate a new one to see it here.'
              : current === ''
                ? 'No password yet — they can’t sign in. Type or generate one, then save.'
                : 'This is their current password. Change it and save to update it.'
          : 'At least 6 characters. Leave empty to add a password later.'}
      </p>
    </div>
  );
}


export default function EmployeeForm({
  values,
  roles,
  canSetLevel,
  isAdmin = false,
  isSelf = false,
  onSaved,
}: {
  values?: EmployeeFormValues;
  roles: RoleOption[];
  /** Kept for callers; the store is assigned from the roster / profile, not this form. */
  locations?: unknown;
  canSetLevel: boolean;
  /** Admins can see and set passwords. */
  isAdmin?: boolean;
  isSelf?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(values?.id);
  const [first, setFirst] = useState(values?.first_name ?? '');
  const [last, setLast] = useState(values?.last_name ?? '');
  const [login, setLogin] = useState(values?.login_id ?? '');
  const [loginTouched, setLoginTouched] = useState(editing);
  const [level, setLevel] = useState<EmployeeFormValues['access_level']>(values?.access_level ?? 'employee');
  const [selected, setSelected] = useState<string[]>(values?.role_ids ?? []);
  const [primary, setPrimary] = useState<string | null>(values?.primary_role_id ?? null);
  const [wageType, setWageType] = useState<'hourly' | 'salary'>('hourly');
  const loginValue = loginTouched ? login : suggestLogin(first, last);
  const levelLocked = !canSetLevel || isSelf;
  const name = `${first} ${last}`.trim();
  const chosenRoles = selected.map((id) => roles.find((r) => r.id === id)).filter(Boolean) as RoleOption[];

  return (
    <ActionForm action={editing ? updateEmployee : createEmployee} className="space-y-5" onSuccess={onSaved}>
      {(result) => (
        <>
          {editing && <input type="hidden" name="id" value={values!.id} />}
          <input type="hidden" name="access_level" value={level} />

          {/* Live preview of the person being added */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-5 text-white shadow-[0_24px_50px_-28px_rgba(91,33,182,0.9)] sm:p-6">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-fuchsia-300/20 blur-2xl" />
            <div className="relative flex flex-wrap items-center gap-4">
              <span className="flex h-16 w-16 flex-none items-center justify-center rounded-2xl bg-white/20 text-2xl font-bold tracking-wide ring-2 ring-white/40 backdrop-blur">
                {(first[0] ?? '') + (last[0] ?? '') || <UserRound size={26} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-white/70">{editing ? 'Team member' : level === 'manager' ? 'New manager' : 'New employee'}</p>
                <p className="truncate text-2xl font-semibold tracking-tight">{name || 'Their name'}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 font-mono">{loginValue || 'login.id'}</span>
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 font-semibold capitalize">{level}</span>
                  {chosenRoles.map((r) => (
                    <span key={r.id} className="rounded-full px-2.5 py-0.5 font-semibold ring-1 ring-white/40" style={{ backgroundColor: r.color }}>{r.name}</span>
                  ))}
                </p>
              </div>
            </div>
          </div>

          <Section step={1} title={editing ? 'Access' : 'Add as'} hint="What they can see and do in the Time app. Workflow and Deliveries access is set below.">
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                { v: 'employee', label: 'Employee', hint: 'Own shifts, time clock and time off', icon: UserRound },
                { v: 'manager', label: 'Manager', hint: 'Schedule, approvals and the whole team', icon: Briefcase },
              ] as const).map((o) => {
                const on = level === o.v;
                const disabled = levelLocked || (o.v !== 'employee' && !canSetLevel);
                return (
                  <button
                    key={o.v}
                    type="button"
                    disabled={disabled && !on}
                    onClick={() => !levelLocked && setLevel(o.v)}
                    className={`group flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all ${
                      on ? 'border-violet-500 bg-violet-50 shadow-[0_12px_26px_-18px_rgba(124,58,237,0.9)]' : 'border-stone/70 bg-white hover:border-violet-300 disabled:cursor-not-allowed disabled:opacity-50'
                    }`}
                  >
                    <span className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl transition-colors ${on ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white' : 'bg-linen text-violet-500'}`}><o.icon size={20} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink">{o.label}</span>
                      <span className="block text-xs text-muted">{o.hint}</span>
                    </span>
                    <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 ${on ? 'border-violet-500 bg-violet-500 text-white' : 'border-stone'}`}>{on && <Check size={12} strokeWidth={3} />}</span>
                  </button>
                );
              })}
            </div>
            {editing && isAdmin && !isSelf && (
              <label className="mt-3 flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" className="b-check" checked={level === 'admin'} onChange={(e) => setLevel(e.target.checked ? 'admin' : 'manager')} /> Admin (full access, including settings and passwords)
              </label>
            )}
            {levelLocked && <p className="mt-2 text-xs text-muted">{isSelf ? 'You can’t change your own access level.' : 'Only an admin can add or change managers.'}</p>}
          </Section>

          <Section step={2} title="About them">
            <div className="grid gap-4 sm:grid-cols-2">
              <IconInput icon={UserRound} id="first_name" name="first_name" label="First name" required maxLength={80} value={first} onChange={(e) => setFirst(e.target.value)} placeholder="Jessica" />
              <IconInput icon={UserRound} id="last_name" name="last_name" label="Last name" maxLength={80} value={last} onChange={(e) => setLast(e.target.value)} placeholder="Babiltz" />
              <IconInput icon={Mail} id="email" name="email" type="email" label="Email" maxLength={254} defaultValue={values?.email ?? ''} autoComplete="off" placeholder="name@baydesignstore.com" />
              <IconInput icon={Phone} id="phone" name="phone" type="tel" label="Phone" maxLength={40} defaultValue={values?.phone ?? ''} placeholder="(239) 555-0123" />
              <Field label="Birthday (optional)" htmlFor="birthday"><DatePicker id="birthday" name="birthday" defaultValue={values?.birthday ?? ''} /></Field>
              <Field label="Hire date (optional)" htmlFor="hire_date"><DatePicker id="hire_date" name="hire_date" defaultValue={values?.hire_date ?? ''} /></Field>
            </div>
          </Section>

          <Section step={3} title="Role" hint="Pick from the dropdown, or press New role to make one.">
            <RolePicker roles={roles} selected={selected} setSelected={setSelected} primary={primary} setPrimary={setPrimary} />
            <label className="mt-4 flex items-center gap-2.5 text-sm">
              <input type="checkbox" name="is_contractor" className="b-check" defaultChecked={values?.is_contractor} /> Contractor (not on payroll)
            </label>
          </Section>

          <Section step={4} title="Sign-in" hint={isAdmin ? 'They sign in with this login ID and password.' : 'An admin sets the password.'}>
            <div className="space-y-4">
              <IconInput
                icon={AtSign}
                id="login_id"
                name="login_id"
                label="Login ID"
                className="font-mono"
                required
                pattern="[a-z0-9._\-]{3,64}"
                maxLength={64}
                autoCapitalize="none"
                spellCheck={false}
                value={loginValue}
                hint="Filled in from their name — change it if you like."
                onChange={(e) => {
                  setLoginTouched(true);
                  setLogin(e.target.value.toLowerCase());
                }}
              />
              {isAdmin ? (
                <PasswordField current={values?.password} editing={editing} />
              ) : (
                !editing && <p className="rounded-2xl bg-linen px-4 py-3 text-xs text-muted">They’ll show as “No password yet” in the roster until an admin sets one.</p>
              )}
            </div>
          </Section>

          {!editing && (
            <Section step={5} title="Pay (optional)">
              <div className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="wage_type" value={wageType} />
                <div className="inline-flex rounded-2xl bg-linen p-1">
                  {(['hourly', 'salary'] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setWageType(t)} className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${wageType === t ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
                      {t === 'hourly' ? 'Per hour' : 'Per year'}
                    </button>
                  ))}
                </div>
                <label className="relative block w-44">
                  <span className="sr-only">Wage</span>
                  <DollarSign size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-violet-400" />
                  <input name="wage_amount" type="number" min="0" step="0.01" className="b-input !rounded-2xl !py-3 pl-10" placeholder={wageType === 'hourly' ? '22.00' : '52,000'} />
                </label>
              </div>
            </Section>
          )}

          {result?.ok && <SecretReveal result={result} />}
          {!editing && result?.ok && result.data?.id && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="b-btn-primary" onClick={() => router.push(`/base/team/${result.data!.id}`)}>View profile</button>
              <button type="button" className="b-btn-ghost" onClick={() => router.push('/base/team')}>Back to roster</button>
            </div>
          )}

          <div className="sticky bottom-0 z-10 -mx-1 flex justify-end gap-2 rounded-2xl bg-gradient-to-t from-ivory via-ivory/95 to-transparent px-1 pb-1 pt-4">
            <SubmitButton className="b-btn-brass !rounded-2xl !px-6 !py-3 !text-[0.95rem]" pendingLabel="Saving…">
              {editing ? 'Save changes' : level === 'manager' ? 'Add manager' : 'Add employee'}
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
