'use client';

import { useState, type ComponentType, type InputHTMLAttributes, type ReactNode } from 'react';
import { Check, ChevronDown, Plus, Search, Star, X } from 'lucide-react';
import { createRole } from '@/app/base/(app)/team/roles/actions';

export type RoleOption = { id: string; name: string; color?: string; work_type?: string };

export const WORK_TYPE_LABEL: Record<string, string> = {
  showroom: 'Showroom clock',
  designer: 'Designer clock',
  warehouse: 'Warehouse clock',
  driver: 'Driver clock',
};

/** A numbered form section with a title — the employee form is built from these. */
export function Section({ step, title, hint, children }: { step: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="relative rounded-3xl border border-stone/60 bg-white/90 p-5 shadow-[0_18px_40px_-34px_rgba(23,23,58,0.5)] sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-sm font-bold text-white shadow-md">{step}</span>
        <div>
          <h3 className="text-[1.05rem] font-semibold tracking-tight text-ink">{title}</h3>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** A text field with an icon inside on the left. */
export function IconInput({ icon: Icon, label, id, hint, ...input }: { icon: ComponentType<{ size?: number; className?: string }>; label: string; id: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-xs font-semibold text-ink/70">{label}</span>
      <span className="relative block">
        <Icon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-violet-400" />
        <input id={id} {...input} className={`b-input !rounded-2xl !py-3 pl-10 ${input.className ?? ''}`} />
      </span>
      {hint && <span className="mt-1 block text-[0.7rem] text-muted">{hint}</span>}
    </label>
  );
}

const ROLE_COLORS = ['#C0354E', '#2F7FC1', '#6366F1', '#4E6B69', '#5B4A8B', '#0EA5E9', '#5F7F6E', '#94593A', '#DB2777', '#F59E0B'];

/**
 * Role picker: a dropdown field you can click or type in (roles with colour dots and their
 * time clock), plus a "New role" button that creates a role right here. Chosen roles show as
 * coloured pills; ★ marks the primary role, which decides the time clock.
 */
export function RolePicker({ roles: initialRoles, selected, setSelected, primary, setPrimary }: {
  roles: RoleOption[];
  selected: string[];
  setSelected: (fn: (s: string[]) => string[]) => void;
  primary: string | null;
  setPrimary: (id: string) => void;
}) {
  const [added, setAdded] = useState<RoleOption[]>([]);
  const roles = [...initialRoles, ...added.filter((a) => !initialRoles.some((r) => r.id === a.id))].sort((a, b) => a.name.localeCompare(b.name));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [color, setColor] = useState(ROLE_COLORS[2]);
  const [workType, setWorkType] = useState('showroom');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const effectivePrimary = selected.includes(primary ?? '') ? primary : (selected[0] ?? null);
  const q = query.trim().toLowerCase();
  const matches = roles.filter((r) => !q || r.name.toLowerCase().includes(q));
  const exact = roles.some((r) => r.name.toLowerCase() === q);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const startCreating = (name: string) => {
    setNewName(name);
    setCreating(true);
    setOpen(false);
    setError(null);
  };

  async function create() {
    if (!newName.trim()) return setError('Type a name for the role.');
    setSaving(true);
    setError(null);
    const fd = new FormData();
    fd.set('name', newName.trim());
    fd.set('color', color);
    fd.set('work_type', workType);
    fd.set('department_id', '');
    const res = await createRole(null, fd);
    setSaving(false);
    if (!res?.ok || !res.data?.id) return setError(res?.message ?? 'Couldn’t create the role.');
    setAdded((a) => [...a, { id: res.data!.id, name: res.data!.name, color: res.data!.color, work_type: workType }]);
    setSelected((s) => [...s, res.data!.id]);
    setNewName('');
    setQuery('');
    setCreating(false);
  }

  return (
    <div>
      {/* Dropdown field + New role */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-violet-400" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'Enter') {
                e.preventDefault();
                if (matches[0]) {
                  toggle(matches[0].id);
                  setQuery('');
                } else if (q) startCreating(query.trim());
              }
            }}
            placeholder="Choose a role…"
            className={`w-full rounded-2xl border bg-white py-3 pl-11 pr-11 text-sm outline-none transition-all ${open ? 'border-violet-400 ring-4 ring-violet-100' : 'border-stone hover:border-violet-300'}`}
            aria-label="Choose a role"
            aria-expanded={open}
            role="combobox"
          />
          <button type="button" onClick={() => setOpen(!open)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-muted hover:bg-linen hover:text-ink" aria-label={open ? 'Close role list' : 'Open role list'}>
            <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => (creating ? setCreating(false) : startCreating(query.trim()))}
          className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${creating ? 'bg-ink text-ivory' : 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-[0_10px_22px_-12px_rgba(91,33,182,0.9)] hover:brightness-110'}`}
        >
          {creating ? <X size={16} /> : <Plus size={16} />} {creating ? 'Cancel' : 'New role'}
        </button>
      </div>

      {/* The list */}
      {open && (
        <div className="mt-2 overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-[0_24px_50px_-30px_rgba(79,70,229,0.6)]">
          <ul className="grid max-h-64 gap-1 overflow-y-auto p-2 sm:grid-cols-2" role="listbox" aria-multiselectable="true">
            {matches.map((r) => {
              const on = selected.includes(r.id);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => toggle(r.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${on ? 'bg-violet-50 ring-1 ring-inset ring-violet-200' : 'hover:bg-linen'}`}
                  >
                    <span className="h-3.5 w-3.5 flex-none rounded-full" style={{ backgroundColor: r.color ?? '#6366F1', boxShadow: `0 0 0 3px ${r.color ?? '#6366F1'}22` }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{r.name}</span>
                      {r.work_type && <span className="block text-[0.68rem] text-muted">{WORK_TYPE_LABEL[r.work_type] ?? r.work_type}</span>}
                    </span>
                    <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-md border ${on ? 'border-violet-500 bg-violet-500 text-white' : 'border-stone'}`}>{on && <Check size={13} strokeWidth={3} />}</span>
                  </button>
                </li>
              );
            })}
            {matches.length === 0 && <li className="px-3 py-4 text-sm text-muted sm:col-span-2">No role called “{query}”.</li>}
          </ul>
          <div className="flex items-center justify-between gap-2 border-t border-stone/60 bg-linen/50 px-3 py-2">
            {q && !exact ? (
              <button type="button" onClick={() => startCreating(query.trim())} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold text-violet-700 hover:bg-white">
                <Plus size={15} /> Create “{query.trim()}”
              </button>
            ) : (
              <span className="px-2 text-xs text-muted">Tick as many roles as you need.</span>
            )}
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-3 py-1.5 text-sm font-semibold text-ink hover:bg-white">Done</button>
          </div>
        </div>
      )}

      {/* New role */}
      {creating && (
        <div className="mt-3 space-y-3 rounded-2xl border-2 border-dashed border-violet-300 bg-gradient-to-br from-violet-50 to-white p-4">
          <p className="text-sm font-semibold text-ink">New role</p>
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} placeholder="e.g. Sales Associate" className="b-input !rounded-xl" aria-label="New role name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                create();
              }
            }}
          />
          <div>
            <p className="mb-1.5 text-xs font-semibold text-ink/70">Colour</p>
            <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Role colour">
              {ROLE_COLORS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)} className={`h-7 w-7 rounded-full transition-transform ${color === c ? 'scale-110 ring-2 ring-ink/70 ring-offset-2' : 'hover:scale-110'}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-ink/70">Time clock</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {Object.entries(WORK_TYPE_LABEL).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setWorkType(k)} className={`rounded-xl px-2 py-2 text-xs font-semibold transition-colors ${workType === k ? 'bg-ink text-ivory' : 'bg-white text-ink ring-1 ring-inset ring-stone hover:ring-violet-300'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold text-white" style={{ backgroundColor: color }}>{newName.trim() || 'Preview'}</span>
            <button type="button" className="b-btn-brass b-btn-sm" disabled={saving || !newName.trim()} onClick={create}>{saving ? 'Creating…' : 'Create & add'}</button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}

      {/* Chosen roles */}
      <div className="mt-3 flex min-h-[3rem] flex-wrap items-center gap-2 rounded-2xl bg-linen/60 p-2.5">
        {selected.length === 0 && <span className="px-1.5 text-sm text-muted">No role chosen yet.</span>}
        {selected.map((id) => {
          const r = roles.find((x) => x.id === id);
          if (!r) return null;
          const isPrimary = effectivePrimary === id;
          return (
            <span key={id} className={`inline-flex items-center gap-1 rounded-full py-1 pl-1 pr-1.5 text-sm font-semibold text-white shadow-sm ${isPrimary ? 'outline outline-2 outline-offset-2' : ''}`} style={{ backgroundColor: r.color ?? '#6366F1', outlineColor: r.color ?? '#6366F1' }}>
              <input type="hidden" name="role_ids" value={id} />
              <button type="button" onClick={() => setPrimary(id)} className="rounded-full p-1 hover:bg-white/20" aria-label={`Make ${r.name} the primary role`} title={isPrimary ? 'Primary role — decides the time clock' : 'Make primary'}>
                <Star size={13} fill={isPrimary ? 'currentColor' : 'none'} />
              </button>
              {r.name}
              <button type="button" onClick={() => toggle(id)} className="ml-0.5 rounded-full p-1 opacity-80 hover:bg-white/20 hover:opacity-100" aria-label={`Remove ${r.name}`}>
                <X size={13} />
              </button>
            </span>
          );
        })}
      </div>
      <input type="hidden" name="primary_role_id" value={effectivePrimary ?? ''} />
      <p className="mt-2 text-xs text-muted">The ★ role is the main one — it decides which time clock they see.</p>
    </div>
  );
}
