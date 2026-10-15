import type { ReactNode } from 'react';
import Link from 'next/link';

export type SettingsSection = { key: string; label: string; description: string; icon: ReactNode; tone: string };

/**
 * Settings page frame: a section menu (icon tile + one-line description) on the left, the chosen
 * section on the right with its own header. Used by Workflow and Deliveries settings.
 */
export default function SettingsLayout({ title, subtitle, base, sections, active, children, footer }: { title: string; subtitle: string; base: string; sections: SettingsSection[]; active: string; children: ReactNode; footer?: ReactNode }) {
  const current = sections.find((s) => s.key === active) ?? sections[0];
  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-6">
        <h1 className="text-[1.9rem] font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-6 lg:self-start">
          <ul className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
            {sections.map((s) => {
              const on = s.key === current.key;
              return (
                <li key={s.key} className="flex-none lg:flex-auto">
                  <Link
                    href={`${base}?section=${s.key}`}
                    aria-current={on ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${on ? 'bg-surface shadow-sm ring-1 ring-stone/70' : 'hover:bg-surface/70'}`}
                  >
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-white" style={{ background: s.tone }}>{s.icon}</span>
                    <span className="min-w-0">
                      <span className={`block whitespace-nowrap text-sm ${on ? 'font-semibold text-ink' : 'font-medium text-ink/85'}`}>{s.label}</span>
                      <span className="hidden truncate text-xs text-muted lg:block">{s.description}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {footer && <div className="mt-4 hidden px-3 text-xs text-muted lg:block">{footer}</div>}
        </nav>
        <section className="min-w-0">
          <header className="mb-4 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: current.tone }}>{current.icon}</span>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{current.label}</h2>
              <p className="text-sm text-muted">{current.description}</p>
            </div>
          </header>
          {children}
        </section>
      </div>
    </div>
  );
}
