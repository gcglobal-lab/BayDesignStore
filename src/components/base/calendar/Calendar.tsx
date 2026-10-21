'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  MONTHS,
  MONTHS_SHORT,
  addMonths,
  firstOfMonth,
  fmtNumeric,
  fmtRange,
  fmtYmd,
  isYmd,
  lastOfMonth,
  monthGrid,
  monthKey,
  parseTypedDate,
  parts,
  todayIn,
  weekdayNames,
  type Ymd,
} from './dates';

const DEFAULT_ZONE = 'America/New_York';

/* ------------------------------------------------------------------ popover */

/**
 * Keeps a floating panel next to its trigger. Uses fixed positioning so it isn't clipped by
 * scrolling containers (it also works inside <dialog> pop-ups); flips above when there's no
 * room below, and becomes a bottom sheet on phones.
 */
function useAnchored(open: boolean, anchor: RefObject<HTMLElement | null>, panel: RefObject<HTMLElement | null>, onClose: () => void) {
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });

  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect();
    const p = panel.current;
    if (!a || !p) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw < 640) {
      setStyle({ position: 'fixed', left: 8, right: 8, bottom: 8, maxHeight: vh - 16 });
      return;
    }
    const w = p.offsetWidth;
    const h = p.offsetHeight;
    const left = Math.max(8, Math.min(a.left, vw - w - 8));
    const below = a.bottom + 8;
    const top = below + h > vh - 8 && a.top - h - 8 > 8 ? a.top - h - 8 : Math.max(8, Math.min(below, vh - h - 8));
    setStyle({ position: 'fixed', left, top });
  }, [anchor, panel]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose, anchor, panel]);

  return { style, place };
}

const panelClass =
  'z-[80] overflow-auto rounded-3xl border border-stone/70 bg-surface/95 p-4 text-ink shadow-[0_30px_70px_-25px_rgba(23,23,58,0.55)] ring-1 ring-black/5 backdrop-blur-xl sm:p-5';

/* -------------------------------------------------------------- month view */

type MonthProps = {
  month: Ymd; // first of the month
  weekStart: number;
  today: Ymd;
  from: Ymd | null;
  to: Ymd | null;
  hover?: Ymd | null;
  min?: Ymd;
  max?: Ymd;
  onPick: (d: Ymd) => void;
  onHover?: (d: Ymd | null) => void;
  showTitle?: boolean;
};

function MonthView({ month, weekStart, today, from, to, hover, min, max, onPick, onHover, showTitle }: MonthProps) {
  const days = monthGrid(month, weekStart);
  const key = monthKey(month);
  const [y, m] = parts(month);
  // While picking the end date, preview the range up to the hovered day.
  const end = to ?? (from && hover && hover >= from ? hover : null);

  return (
    <div className="w-full sm:w-[19.5rem]" onPointerLeave={() => onHover?.(null)}>
      {showTitle && <p className="mb-3 text-center text-[0.95rem] font-semibold tracking-tight">{MONTHS[m - 1]} {y}</p>}
      <div className="grid grid-cols-7 text-center text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
        {weekdayNames(weekStart).map((w) => <span key={w} className="py-1.5">{w.slice(0, 2)}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1" role="grid">
        {days.map((d) => {
          const out = monthKey(d) !== key;
          const disabled = (min && d < min) || (max && d > max);
          const isStart = from === d;
          const isEnd = end === d;
          const inRange = Boolean(from && end && d > from && d < end);
          const edge = isStart || isEnd;
          const band = from && end && from !== end && (inRange || (isStart && d < end) || (isEnd && d > from));
          return (
            <div
              key={d}
              className={`relative flex h-11 items-center justify-center ${band ? 'bg-gradient-to-r from-violet-100 to-indigo-100' : ''} ${isStart && band ? 'rounded-l-full' : ''} ${isEnd && band ? 'rounded-r-full' : ''} ${out ? 'opacity-35' : ''}`}
            >
              <button
                type="button"
                disabled={Boolean(disabled)}
                onClick={() => onPick(d)}
                onPointerEnter={() => onHover?.(d)}
                aria-pressed={edge}
                aria-label={fmtYmd(d, 'long')}
                className={`relative h-10 w-10 rounded-full text-sm tabular-nums transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-30 ${
                  edge
                    ? 'bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 font-semibold text-white shadow-[0_8px_18px_-8px_rgba(124,58,237,0.9)]'
                    : inRange
                      ? 'font-medium text-indigo-900 hover:bg-surface/70'
                      : 'hover:bg-sand/80'
                } ${d === today && !edge ? 'font-semibold text-brass-dark ring-2 ring-inset ring-brass/50' : ''}`}
              >
                {Number(d.slice(8))}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Month header with arrows; the title opens a month/year chooser. */
function MonthNav({ month, onMonth, children }: { month: Ymd; onMonth: (m: Ymd) => void; children?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-stone bg-surface text-ink transition-colors hover:border-brass/60 hover:text-brass-dark" onClick={() => onMonth(addMonths(month, -1))} aria-label="Previous month">
        <ChevronLeft size={17} />
      </button>
      {children}
      <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-stone bg-surface text-ink transition-colors hover:border-brass/60 hover:text-brass-dark" onClick={() => onMonth(addMonths(month, 1))} aria-label="Next month">
        <ChevronRight size={17} />
      </button>
    </div>
  );
}

function MonthYearChooser({ month, onPick }: { month: Ymd; onPick: (m: Ymd) => void }) {
  const [year, setYear] = useState(parts(month)[0]);
  const current = parts(month);
  return (
    <div className="w-full sm:w-[19.5rem]">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" className="b-btn-quiet !p-2" onClick={() => setYear(year - 1)} aria-label="Previous year"><ChevronLeft size={16} /></button>
        <span className="text-base font-semibold">{year}</span>
        <button type="button" className="b-btn-quiet !p-2" onClick={() => setYear(year + 1)} aria-label="Next year"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {MONTHS_SHORT.map((label, i) => {
          const on = current[0] === year && current[1] === i + 1;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onPick(firstOfMonth(year, i))}
              className={`rounded-2xl py-3 text-sm font-medium transition-colors ${on ? 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white' : 'bg-linen hover:bg-sand'}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- date picker */

const monthOf = (d: Ymd) => d.slice(0, 8) + '01';
const TYPE_HINT = 'Type a date like 10/22/2026, Oct 22 or “tomorrow”.';

/** The month grid with its header, the month/year chooser and the Today / Clear buttons. */
function CalendarPanel({
  value,
  month,
  onMonth,
  today,
  min,
  max,
  weekStart,
  onPick,
  onClear,
}: {
  value: string;
  month: Ymd;
  onMonth: (m: Ymd) => void;
  today: Ymd;
  min?: string;
  max?: string;
  weekStart: number;
  onPick: (d: Ymd) => void;
  onClear?: () => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const picked = isYmd(value) ? value : null;
  return (
    <>
      {choosing ? (
        <MonthYearChooser
          month={month}
          onPick={(m) => {
            onMonth(m);
            setChoosing(false);
          }}
        />
      ) : (
        <>
          <MonthNav month={month} onMonth={onMonth}>
            <button type="button" className="rounded-full px-3 py-1.5 text-[0.95rem] font-semibold tracking-tight transition-colors hover:bg-linen" onClick={() => setChoosing(true)}>
              {MONTHS[parts(month)[1] - 1]} {parts(month)[0]}
            </button>
          </MonthNav>
          <MonthView month={month} weekStart={weekStart} today={today} from={picked} to={picked} min={min} max={max} onPick={onPick} />
        </>
      )}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-stone/50 pt-3">
        <button type="button" className="b-btn-ghost b-btn-sm" disabled={Boolean((min && today < min) || (max && today > max))} onClick={() => onPick(today)}>
          Today
        </button>
        {onClear && picked && (
          <button type="button" className="b-btn-quiet b-btn-sm" onClick={onClear}>
            <X size={13} /> Clear
          </button>
        )}
      </div>
    </>
  );
}

/** What has been typed into a date box, and what date (if any) it reads as. */
function useTypedDate(today: Ymd, min?: string, max?: string) {
  const [draft, setDraft] = useState<string | null>(null);
  const read = draft === null ? null : parseTypedDate(draft, today);
  const parsed = read && !(min && read < min) && !(max && read > max) ? read : null;
  const cleared = draft !== null && draft.trim() === '';
  return { draft, setDraft, parsed, cleared, invalid: draft !== null && !cleared && !parsed };
}

/**
 * A date field: type a date straight in (10/22/2026, Oct 22, tomorrow…) or click the calendar
 * icon for the large pop-up calendar. Works like an <input type="date">: it submits `name` as
 * yyyy-MM-dd and supports defaultValue (uncontrolled) or value + onChange. With `trigger`, the
 * whole control is a button (e.g. a toolbar pill) that opens the calendar.
 */
export function DatePicker({
  name,
  id,
  value,
  defaultValue = '',
  onChange,
  min,
  max,
  required,
  disabled,
  placeholder,
  weekStart = 1,
  zone = DEFAULT_ZONE,
  className = '',
  fieldClassName = '',
  compact = false,
  autoFocus,
  'aria-label': ariaLabel,
  trigger,
}: {
  /** Replaces the default field look, e.g. a toolbar pill. Receives the formatted value. */
  trigger?: (label: string) => ReactNode;
  name?: string;
  id?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  weekStart?: number;
  zone?: string;
  /** On the outer wrapper (width, margins). */
  className?: string;
  /** On the field itself (e.g. a red border). */
  fieldClassName?: string;
  /** A slightly shorter field, for filter bars and toolbars. */
  compact?: boolean;
  autoFocus?: boolean;
  'aria-label'?: string;
}) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const today = todayIn(zone);
  const [month, setMonth] = useState(() => monthOf(isYmd(current) ? current : today));
  const typed = useTypedDate(today, min, max);
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const text = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const { style } = useAnchored(open, anchor, panel, close);
  const autoId = useId();
  const fieldId = id ?? autoId;
  const showError = typed.invalid && !focused;

  const set = (d: string) => {
    if (value === undefined) setInner(d);
    if (d !== current) onChange?.(d);
  };
  const pick = (d: string) => {
    set(d);
    typed.setDraft(null);
    close();
  };
  /** Applies what was typed; false while it isn't a date yet. */
  const commit = () => {
    if (typed.draft === null) return true;
    if (typed.cleared || typed.parsed) {
      set(typed.parsed ?? '');
      typed.setDraft(null);
      return true;
    }
    return false;
  };
  const toggle = () => {
    if (!open) setMonth(monthOf(typed.parsed ?? (isYmd(current) ? current : today)));
    setOpen(!open);
  };

  // A half-typed date stops the form from submitting (with a hint) instead of sending the old one.
  useEffect(() => {
    hidden.current?.setCustomValidity(typed.invalid ? TYPE_HINT : '');
  }, [typed.invalid]);
  // When the form is reset (e.g. after saving), go back to the starting date like a native field.
  const { setDraft } = typed;
  useEffect(() => {
    const form = hidden.current?.form;
    if (!form || value !== undefined) return;
    const onReset = () => {
      setInner(defaultValue);
      setDraft(null);
    };
    form.addEventListener('reset', onReset);
    return () => form.removeEventListener('reset', onReset);
  }, [value, defaultValue, setDraft]);

  const calendar = open && (
    <div ref={panel} style={style} className={panelClass} role="dialog" aria-label="Choose a date">
      <CalendarPanel value={typed.parsed ?? current} month={month} onMonth={setMonth} today={today} min={min} max={max} weekStart={weekStart} onPick={pick} onClear={required ? undefined : () => pick('')} />
    </div>
  );

  if (trigger) {
    return (
      <div className={`relative ${className}`}>
        {name && <input type="hidden" name={name} value={current} />}
        <div ref={anchor}>
          <button id={fieldId} type="button" disabled={disabled} onClick={toggle} className="block text-left" aria-haspopup="dialog" aria-expanded={open}>
            {trigger(current ? fmtYmd(current, 'long') : (placeholder ?? 'Pick a date'))}
          </button>
        </div>
        {calendar}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* The value the form submits (yyyy-MM-dd); also enforces `required` and blocks half-typed dates. */}
      <input
        ref={hidden}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        name={name}
        value={current}
        required={required}
        onChange={() => {}}
        onFocus={() => text.current?.focus()}
      />
      <div
        ref={anchor}
        className={`b-input relative flex items-center gap-1 !py-0 !pr-1 ${disabled ? 'bg-linen' : ''} ${showError ? '!border-red-400 ring-2 ring-red-200' : open || focused ? '!border-brass ring-2 ring-brass/20' : ''} ${fieldClassName}`}
      >
        <input
          ref={text}
          id={fieldId}
          type="text"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          autoFocus={autoFocus}
          value={typed.draft ?? (focused ? fmtNumeric(current) : fmtYmd(current, 'weekday'))}
          placeholder={placeholder ?? 'MM/DD/YYYY'}
          aria-label={ariaLabel}
          aria-invalid={showError || undefined}
          aria-describedby={showError ? `${fieldId}-hint` : undefined}
          onFocus={(e) => {
            setFocused(true);
            const el = e.target;
            requestAnimationFrame(() => el.select());
          }}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          onChange={(e) => {
            typed.setDraft(e.target.value);
            const d = parseTypedDate(e.target.value, today);
            if (d) setMonth(monthOf(d));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // A real date applies (and, in a form, Enter still submits it); otherwise stay put.
              if (!commit()) e.preventDefault();
              else if (open) {
                e.preventDefault();
                close();
              }
            } else if (e.key === 'Escape' && typed.draft !== null && !open) {
              e.preventDefault();
              typed.setDraft(null);
            } else if (e.key === 'ArrowDown' && !open) {
              e.preventDefault();
              toggle();
            }
          }}
          className={`min-w-0 flex-1 bg-transparent ${compact ? 'py-2' : 'py-2.5'} text-inherit outline-none placeholder:text-muted/60 disabled:cursor-not-allowed`}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={toggle}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-brass transition-colors hover:bg-sand/70 disabled:opacity-50"
          aria-label="Open calendar"
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <CalendarDays size={17} />
        </button>
      </div>
      {showError && (
        <p id={`${fieldId}-hint`} className="mt-1 text-[0.72rem] text-red-600">
          {TYPE_HINT}
        </p>
      )}
      {calendar}
    </div>
  );
}

/**
 * For a table cell's pop-up: a box to type a date into, with the calendar right under it.
 * Enter or a click on a day saves; a valid typed date also saves when the pop-up closes.
 */
export function DateEditor({ value, onSave, label, zone = DEFAULT_ZONE, weekStart = 1 }: { value: string; onSave: (v: string | null) => void; label?: string; zone?: string; weekStart?: number }) {
  const today = todayIn(zone);
  const [month, setMonth] = useState(() => monthOf(isYmd(value) ? value : today));
  const typed = useTypedDate(today);
  const [tried, setTried] = useState(false);
  // Clicking away with a date typed in keeps it, like the other cells.
  const latest = useRef({ parsed: typed.parsed, value, onSave, done: false });
  Object.assign(latest.current, { parsed: typed.parsed, value, onSave });
  useEffect(() => {
    const ref = latest.current;
    return () => {
      if (!ref.done && ref.parsed && ref.parsed !== ref.value) ref.onSave(ref.parsed);
    };
  }, []);
  const save = (v: string | null) => {
    latest.current.done = true;
    onSave(v);
  };
  const submit = () => {
    if (typed.draft === null) return save(isYmd(value) ? value : null);
    if (typed.cleared) return save(null);
    if (typed.parsed) return save(typed.parsed);
    setTried(true);
  };
  const error = tried && typed.invalid;
  return (
    <div className="w-[19.5rem] max-w-full p-1.5">
      <input
        autoFocus
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={typed.draft ?? fmtNumeric(value)}
        placeholder="MM/DD/YYYY"
        aria-label={label}
        aria-invalid={error || undefined}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          typed.setDraft(e.target.value);
          setTried(false);
          const d = parseTypedDate(e.target.value, today);
          if (d) setMonth(monthOf(d));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
          // Esc closes the pop-up without keeping what was typed.
          if (e.key === 'Escape') latest.current.done = true;
        }}
        className={`b-input !py-2 ${error ? '!border-red-400 ring-2 ring-red-200' : ''}`}
      />
      <p className={`mb-3 mt-1 px-0.5 text-[0.7rem] ${error ? 'text-red-600' : 'text-muted'}`}>
        {error ? TYPE_HINT : typed.parsed ? `${fmtYmd(typed.parsed, 'long')} — press Enter to save` : 'Type a date and press Enter, or pick a day.'}
      </p>
      <CalendarPanel value={typed.parsed ?? value} month={month} onMonth={setMonth} today={today} weekStart={weekStart} onPick={(d) => save(d)} onClear={isYmd(value) ? () => save(null) : undefined} />
    </div>
  );
}

/**
 * For a timeline cell's pop-up: type the start and end dates, or click a start day and then an
 * end day on the calendar (the days in between light up).
 */
export function RangeEditor({
  value,
  onSave,
  zone = DEFAULT_ZONE,
  weekStart = 1,
}: {
  value: { from: string; to: string } | null;
  onSave: (v: { from: string; to: string } | null) => void;
  zone?: string;
  weekStart?: number;
}) {
  const today = todayIn(zone);
  const [from, setFrom] = useState<Ymd | null>(value?.from ?? null);
  const [to, setTo] = useState<Ymd | null>(value?.to ?? null);
  const [hover, setHover] = useState<Ymd | null>(null);
  const [month, setMonth] = useState(() => monthOf(value?.from ?? today));
  const [texts, setTexts] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });

  const pick = (d: Ymd) => {
    setTexts({ from: null, to: null });
    if (!from || to) {
      setFrom(d);
      setTo(null);
    } else if (d < from) setFrom(d);
    else setTo(d);
  };
  const type = (k: 'from' | 'to', raw: string) => {
    setTexts((t) => ({ ...t, [k]: raw }));
    const d = parseTypedDate(raw, today);
    if (!d) return;
    if (k === 'from') setFrom(d);
    else setTo(d);
    setMonth(monthOf(d));
  };
  const ordered = from && to ? (to < from ? { from: to, to: from } : { from, to }) : null;
  const span = ordered ? Math.round((Date.parse(`${ordered.to}T00:00:00Z`) - Date.parse(`${ordered.from}T00:00:00Z`)) / 86_400_000) + 1 : 0;

  return (
    <div className="w-[19.5rem] max-w-full p-1.5">
      <div className="mb-3 grid grid-cols-2 gap-2">
        {(['from', 'to'] as const).map((k) => {
          const v = k === 'from' ? from : to;
          const raw = texts[k];
          const bad = raw !== null && raw.trim() !== '' && !parseTypedDate(raw, today);
          return (
            <label key={k} className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">
              {k === 'from' ? 'Start' : 'End'}
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                autoFocus={k === 'from'}
                value={raw ?? fmtNumeric(v)}
                placeholder="MM/DD/YYYY"
                aria-invalid={bad || undefined}
                onFocus={(e) => e.target.select()}
                onChange={(e) => type(k, e.target.value)}
                onBlur={() => setTexts((t) => ({ ...t, [k]: null }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && ordered) {
                    e.preventDefault();
                    onSave(ordered);
                  }
                }}
                className={`b-input mt-1 !py-1.5 font-normal normal-case tracking-normal ${bad ? '!border-red-400 ring-2 ring-red-200' : ''}`}
              />
            </label>
          );
        })}
      </div>
      <MonthNav month={month} onMonth={setMonth}>
        <span className="text-sm font-semibold">
          {MONTHS[parts(month)[1] - 1]} {parts(month)[0]}
        </span>
      </MonthNav>
      <MonthView month={month} weekStart={weekStart} today={today} from={from} to={to} hover={hover} onPick={pick} onHover={setHover} />
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-stone/50 pt-3">
        {value ? (
          <button type="button" className="b-btn-quiet b-btn-sm text-red-600" onClick={() => onSave(null)}>
            Clear
          </button>
        ) : (
          <span className="text-[0.7rem] text-muted">{from && !to ? 'Now pick the end day' : 'Pick a start day'}</span>
        )}
        <span className="text-[0.7rem] text-muted">{span ? `${span} day${span === 1 ? '' : 's'}` : ''}</span>
        <button type="button" disabled={!ordered} className="b-btn-brass b-btn-sm" onClick={() => ordered && onSave(ordered)}>
          Save
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- date range picker */

export type RangePreset = { key: string; label: string; from: string; to: string };

/**
 * Pick a from → to range on a two-month calendar. Click the first day, move across the
 * calendar (every day in between lights up) and click the last day. The calendar stays
 * open until you press Apply, so the range can be adjusted. Month chips select a whole
 * month in one click; pick days afterwards for part of a month.
 */
export function DateRangePicker({
  from,
  to,
  onChange,
  presets = [],
  fromName,
  toName,
  weekStart = 1,
  zone = DEFAULT_ZONE,
  maxDays,
  className = '',
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  presets?: RangePreset[];
  fromName?: string;
  toName?: string;
  weekStart?: number;
  zone?: string;
  maxDays?: number;
  className?: string;
}) {
  const today = todayIn(zone);
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState<Ymd | null>(from || null);
  const [draftTo, setDraftTo] = useState<Ymd | null>(to || null);
  const [hover, setHover] = useState<Ymd | null>(null);
  const [month, setMonth] = useState(() => (from || today).slice(0, 8) + '01');
  const [year, setYear] = useState(() => parts(from || today)[0]);
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const { style, place } = useAnchored(open, anchor, panel, close);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, month, place]);

  function start() {
    setDraftFrom(from || null);
    setDraftTo(to || null);
    setMonth((from || today).slice(0, 8) + '01');
    setYear(parts(from || today)[0]);
    setOpen(true);
  }

  function pick(d: Ymd) {
    // First click (or a click after a finished range) starts a new range; the second ends it.
    if (!draftFrom || draftTo) {
      setDraftFrom(d);
      setDraftTo(null);
    } else if (d < draftFrom) {
      setDraftFrom(d);
    } else {
      setDraftTo(d);
    }
  }

  function selectMonth(m0: number) {
    const f = firstOfMonth(year, m0);
    setDraftFrom(f);
    setDraftTo(lastOfMonth(year, m0));
    setMonth(f);
  }

  const span = draftFrom && draftTo ? Math.round((Date.parse(`${draftTo}T00:00:00Z`) - Date.parse(`${draftFrom}T00:00:00Z`)) / 86_400_000) + 1 : 0;
  const tooLong = Boolean(maxDays && span > maxDays);
  const canApply = Boolean(draftFrom && draftTo && !tooLong);
  const fullMonth = (m0: number) => draftFrom === firstOfMonth(year, m0) && draftTo === lastOfMonth(year, m0);
  const partOfMonth = (m0: number) => !fullMonth(m0) && draftFrom && draftTo && draftFrom.slice(0, 7) === `${year}-${String(m0 + 1).padStart(2, '0')}` && draftTo.slice(0, 7) === draftFrom.slice(0, 7);

  function apply() {
    if (!canApply) return;
    onChange({ from: draftFrom!, to: draftTo! });
    setOpen(false);
  }

  return (
    <div className={`relative ${className}`}>
      {fromName && <input type="hidden" name={fromName} value={from} />}
      {toName && <input type="hidden" name={toName} value={to} />}
      <button
        ref={anchor}
        type="button"
        onClick={() => (open ? setOpen(false) : start())}
        className={`b-input flex items-center gap-2.5 text-left ${open ? '!border-brass ring-2 ring-brass/20' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarRange size={17} className="flex-none text-brass" />
        <span className="flex-1 truncate font-medium">{fmtRange(from || null, to || null)}</span>
      </button>

      {open && (
        <div ref={panel} style={style} className={`${panelClass} w-auto sm:max-w-[min(56rem,calc(100vw-16px))]`} role="dialog" aria-label="Choose a date range">
          <div className="flex flex-col gap-5 lg:flex-row">
            {presets.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 lg:w-44 lg:flex-none lg:flex-col lg:overflow-visible lg:border-r lg:border-stone/50 lg:pb-0 lg:pr-4">
                <p className="mb-1 hidden text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted lg:block">Quick ranges</p>
                {presets.map((p) => {
                  const on = p.from === draftFrom && p.to === draftTo;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => {
                        setDraftFrom(p.from);
                        setDraftTo(p.to);
                        setMonth(p.from.slice(0, 8) + '01');
                        setYear(parts(p.from)[0]);
                      }}
                      className={`whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm transition-colors ${on ? 'bg-ink font-medium text-ivory' : 'text-ink hover:bg-linen'}`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="min-w-0 flex-1">
              {/* Month chips: a whole month in one click */}
              <div className="mb-4 rounded-2xl bg-linen/70 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted">Month</p>
                  <div className="flex items-center gap-1">
                    <button type="button" className="rounded-full p-1.5 hover:bg-surface" onClick={() => setYear(year - 1)} aria-label="Previous year"><ChevronLeft size={14} /></button>
                    <span className="min-w-[3rem] text-center text-sm font-semibold">{year}</span>
                    <button type="button" className="rounded-full p-1.5 hover:bg-surface" onClick={() => setYear(year + 1)} aria-label="Next year"><ChevronRight size={14} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
                  {MONTHS_SHORT.map((label, i) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => selectMonth(i)}
                      title={`All of ${MONTHS[i]} ${year}`}
                      className={`relative rounded-xl py-2 text-xs font-semibold transition-all ${
                        fullMonth(i)
                          ? 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm'
                          : partOfMonth(i)
                            ? 'bg-surface text-violet-700 ring-2 ring-inset ring-violet-400'
                            : 'bg-surface text-ink hover:bg-sand'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[0.7rem] text-muted">Tap a month for the full month, or pick days below for part of a month.</p>
              </div>

              {/* From / To status */}
              <div className="mb-4 grid grid-cols-2 gap-2">
                {(['from', 'to'] as const).map((k) => {
                  const v = k === 'from' ? draftFrom : draftTo;
                  const active = k === 'from' ? !draftFrom || Boolean(draftTo) : Boolean(draftFrom) && !draftTo;
                  return (
                    <div key={k} className={`rounded-2xl border px-3.5 py-2 transition-colors ${active ? 'border-violet-400 bg-violet-50' : 'border-stone/70 bg-surface'}`}>
                      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted">{k === 'from' ? 'From' : 'To'}</p>
                      <p className={`text-sm font-semibold ${v ? 'text-ink' : 'text-muted/70'}`}>{v ? fmtYmd(v, 'long') : active ? (k === 'from' ? 'Click a start day' : 'Now click an end day') : '—'}</p>
                    </div>
                  );
                })}
              </div>

              <MonthNav month={month} onMonth={setMonth}>
                <span className="text-sm font-medium text-muted">{span ? `${span} day${span === 1 ? '' : 's'} selected` : 'Select a range'}</span>
              </MonthNav>
              <div className="flex flex-col gap-6 sm:flex-row">
                <MonthView month={month} weekStart={weekStart} today={today} from={draftFrom} to={draftTo} hover={hover} onPick={pick} onHover={setHover} showTitle />
                <div className="hidden sm:block">
                  <MonthView month={addMonths(month, 1)} weekStart={weekStart} today={today} from={draftFrom} to={draftTo} hover={hover} onPick={pick} onHover={setHover} showTitle />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-stone/50 pt-3">
                <p className={`text-xs ${tooLong ? 'text-red-600' : 'text-muted'}`}>{tooLong ? `Pick ${maxDays} days or fewer.` : draftFrom && draftTo ? fmtRange(draftFrom, draftTo) : 'Click a start day, then an end day.'}</p>
                <div className="flex gap-2">
                  <button type="button" className="b-btn-quiet b-btn-sm" onClick={() => setOpen(false)}>Cancel</button>
                  <button type="button" className="b-btn-brass b-btn-sm" disabled={!canApply} onClick={apply}>Apply</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

