import type { ReactNode } from 'react';

const avatarTones = [
  'bg-indigo-100 text-indigo-700',
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-700',
  'bg-teal-100 text-teal-700',
  'bg-pink-100 text-pink-700',
  'bg-amber-100 text-amber-700',
];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const tone = avatarTones[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % avatarTones.length];
  const dims = size === 'xs' ? 'h-5 w-5 text-[0.5rem]' : size === 'sm' ? 'h-7 w-7 text-[0.62rem]' : size === 'lg' ? 'h-14 w-14 text-base' : 'h-9 w-9 text-xs';
  return (
    <span className={`inline-flex flex-none items-center justify-center rounded-full font-semibold tracking-wide ${dims} ${tone}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/**
 * The top of every Base page: eyebrow, title, description and actions. `plain` is the
 * Homebase-style version (big title, toolbar on the right, no banner) used by the
 * schedule, time off, availability and manager pages.
 */
export function PageHeader({ eyebrow, title, description, actions, plain = false }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode; plain?: boolean }) {
  if (plain) {
    return (
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[1.9rem] font-semibold leading-tight tracking-tight text-ink sm:text-[2.1rem]">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    );
  }
  return (
    <div className="relative mb-6 overflow-hidden rounded-3xl border border-sky-300 bg-gradient-to-br from-sky-200 via-sky-100 to-blue-200 px-5 py-6 shadow-[0_14px_34px_-30px_rgba(14,116,144,0.45)] sm:mb-8 sm:px-8 sm:py-7">
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {eyebrow && <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brass">{eyebrow}</p>}
          <h1 className="bg-gradient-to-r from-ink via-brass-dark to-[#7C3AED] bg-clip-text font-display text-[2rem] font-semibold leading-tight text-transparent sm:text-[2.4rem]">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-linen text-brass">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '', pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`b-card ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 rounded-t-2xl border-b border-stone/50 bg-gradient-to-r from-linen via-ivory to-white px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="h-6 w-1 flex-none rounded-full bg-gradient-to-b from-brass-light to-brass-dark" aria-hidden="true" />
            {typeof title === 'string' ? <h2 className="b-h2">{title}</h2> : title}
          </div>
          {actions}
        </header>
      )}
      <div className={pad ? 'b-card-pad' : ''}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        {hint && <p className="text-[0.7rem] text-muted">{hint}</p>}
      </div>
      <p className="font-display text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

export const roleChipStyle = (color: string | null | undefined) => ({ backgroundColor: color ?? '#A8834F' });

export function StatusBadge({ status }: { status: string }) {
  const cls = status === 'approved' ? 'b-badge-green' : status === 'pending' ? 'b-badge-amber' : status === 'denied' ? 'b-badge-red' : 'b-badge-gray';
  return <span className={`${cls} capitalize`}>{status}</span>;
}
