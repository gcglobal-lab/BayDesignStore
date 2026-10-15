'use client';

import { Children, isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type ReactElement, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Popover } from './Popover';

type Opt = { value: string; label: string; disabled: boolean; group?: string; color?: string };

const textOf = (n: ReactNode): string =>
  typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(textOf).join('') : isValidElement(n) ? textOf((n.props as { children?: ReactNode }).children) : '';

/** Reads <option> / <optgroup> children, exactly as a native <select> would. */
function parse(children: ReactNode, group?: string): Opt[] {
  const out: Opt[] = [];
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) {
      if (Array.isArray(c)) out.push(...parse(c, group));
      return;
    }
    const el = c as ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean; label?: string; 'data-color'?: string }>;
    if (el.type === 'option') {
      const label = textOf(el.props.children);
      out.push({ value: el.props.value === undefined ? label : String(el.props.value), label, disabled: Boolean(el.props.disabled), group, color: el.props['data-color'] });
    } else if (el.type === 'optgroup') out.push(...parse(el.props.children, el.props.label));
    else out.push(...parse(el.props.children, group));
  });
  return out;
}

const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

/**
 * A styled replacement for <select> — same props and <option> children — with a proper list,
 * type-to-search for long lists, keyboard support and optional avatars for people.
 * A hidden native <select> carries the value, so forms, `required` and resets keep working.
 */
export default function Select({
  name,
  value: controlled,
  defaultValue,
  onChange,
  children,
  className = 'b-input',
  required,
  disabled,
  id,
  people = false,
  searchable,
  placeholder = 'Choose…',
  ...rest
}: {
  name?: string;
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  /** Show initials avatars next to names (team pickers). */
  people?: boolean;
  searchable?: boolean;
  placeholder?: string;
  'aria-label'?: string;
  key?: string;
}) {
  const options = useMemo(() => parse(children), [children]);
  const first = options.find((o) => !o.disabled)?.value ?? '';
  const initial = String(controlled ?? defaultValue ?? first);
  const [inner, setInner] = useState(initial);
  const value = controlled !== undefined ? String(controlled) : inner;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const native = useRef<HTMLSelectElement>(null);
  const listId = useId();
  const showSearch = searchable ?? options.length > 8;
  const selected = options.find((o) => o.value === value);
  const shown = useMemo(() => (q.trim() ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())) : options), [options, q]);

  // Form reset (e.g. after saving) puts the original choice back.
  useEffect(() => {
    const form = native.current?.form;
    if (!form) return;
    const reset = () => setInner(String(defaultValue ?? first));
    form.addEventListener('reset', reset);
    return () => form.removeEventListener('reset', reset);
  }, [defaultValue, first]);

  const close = useCallback(() => {
    setOpen(false);
    setQ('');
  }, []);

  const pick = (o: Opt) => {
    if (o.disabled) return;
    flushSync(() => setInner(o.value));
    close();
    button.current?.focus();
    if (native.current) {
      native.current.value = o.value;
      onChange?.({ target: native.current, currentTarget: native.current } as ChangeEvent<HTMLSelectElement>);
    }
  };

  const openList = () => {
    if (disabled) return;
    setActive(Math.max(0, shown.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(shown.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (shown[active]) pick(shown[active]);
    } else if (e.key === 'Tab') close();
  };

  let lastGroup: string | undefined;
  return (
    <>
      <select
        ref={native}
        name={name}
        value={value}
        required={required}
        disabled={disabled}
        onChange={() => {}}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute h-px w-px opacity-0"
      >
        {options.map((o) => <option key={`${o.group ?? ''}${o.value}`} value={o.value}>{o.label}</option>)}
      </select>
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={rest['aria-label']}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKey}
        className={`${className} b-select-trigger flex items-center gap-2 text-left`}
      >
        {people && selected && selected.value && <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-brass/15 text-[0.55rem] font-bold text-brass-dark">{initials(selected.label)}</span>}
        {selected?.color && <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: selected.color }} />}
        <span className={`min-w-0 flex-1 truncate ${selected ? '' : 'text-muted/70'}`}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={15} className={`flex-none text-muted transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      <Popover anchor={button} open={open} onClose={close} matchWidth width={200}>
        {showSearch && (
          <label className="sticky top-0 z-10 mb-1 flex items-center gap-2 rounded-lg bg-linen px-2.5 py-1.5">
            <Search size={13} className="text-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKey}
              placeholder="Search…"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
        )}
        <ul id={listId} role="listbox" className="space-y-0.5">
          {shown.map((o, i) => {
            const header = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            const on = o.value === value;
            return (
              <li key={`${o.group ?? ''}${o.value}`}>
                {header && <p className="px-2.5 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-wider text-muted">{header}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  disabled={o.disabled}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${i === active ? 'bg-brass/10' : ''} ${on ? 'font-semibold text-brass-dark' : 'text-ink'}`}
                >
                  {people && o.value && <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brass/15 text-[0.6rem] font-bold text-brass-dark">{initials(o.label)}</span>}
                  {o.color && <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: o.color }} />}
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {on && <Check size={14} className="flex-none" />}
                </button>
              </li>
            );
          })}
          {shown.length === 0 && <li className="px-2.5 py-3 text-center text-sm text-muted">No matches</li>}
        </ul>
      </Popover>
    </>
  );
}
