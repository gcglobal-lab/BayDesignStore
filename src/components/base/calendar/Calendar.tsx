'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  MONTHS,
  MONTHS_SHORT,
  addMonths,
  firstOfMonth,
  fmtRange,
  fmtYmd,
  isYmd,
  lastOfMonth,
  monthGrid,
  monthKey,
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
  'z-[80] overflow-auto rounded-3xl border border-stone/70 bg-white/95 p-4 text-ink shadow-[0_30px_70px_-25px_rgba(23,23,58,0.55)] ring-1 ring-black/5 backdrop-blur-xl sm:p-5';

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
                      ? 'font-medium text-indigo-900 hover:bg-white/70'
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
      <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-stone bg-white text-ink transition-colors hover:border-brass/60 hover:text-brass-dark" onClick={() => onMonth(addMonths(month, -1))} aria-label="Previous month">
        <ChevronLeft size={17} />
      </button>
      {children}
      <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-stone bg-white text-ink transition-colors hover:border-brass/60 hover:text-brass-dark" onClick={() => onMonth(addMonths(month, 1))} aria-label="Next month">
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

/**
 * A date field with a large pop-up calendar. Works like an <input type="date">: it submits
 * `name` as yyyy-MM-dd and supports defaultValue (uncontrolled) or value + onChange.
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
  placeholder = 'Pick a date',
  weekStart = 1,
  zone = DEFAULT_ZONE,
  className = '',
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
  className?: string;
}) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const [open, setOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const today = todayIn(zone);
  const [month, setMonth] = useState(() => (isYmd(current) ? current : today).slice(0, 8) + '01');
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setChoosing(false);
  }, []);
  const { style } = useAnchored(open, anchor, panel, close);
  const autoId = useId();

  const set = (d: string) => {
    if (value === undefined) setInner(d);
    onChange?.(d);
  };

  return (
    <div className={`relative ${className}`}>
      {/* Real input so the form submits the value and `required` is enforced. */}
      <input
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        name={name}
        value={current}
        required={required}
        onChange={() => {}}
        onFocus={() => anchor.current?.focus()}
      />
      <button
        ref={anchor}
        id={id ?? autoId}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!open) setMonth((isYmd(current) ? current : today).slice(0, 8) + '01');
          setOpen(!open);
        }}
        className={trigger ? 'block text-left' : `b-input flex items-center justify-between gap-2 text-left ${open ? '!border-brass ring-2 ring-brass/20' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {trigger ? (
          trigger(current ? fmtYmd(current, 'long') : placeholder)
        ) : (
          <>
            <span className={current ? '' : 'text-muted/70'}>{current ? fmtYmd(current, 'long') : placeholder}</span>
            <CalendarDays size={17} className="flex-none text-brass" />
          </>
        )}
      </button>

      {open && (
        <div ref={panel} style={style} className={panelClass} role="dialog" aria-label="Choose a date">
          {choosing ? (
            <MonthYearChooser
              month={month}
              onPick={(m) => {
                setMonth(m);
                setChoosing(false);
              }}
            />
          ) : (
            <>
              <MonthNav month={month} onMonth={setMonth}>
                <button type="button" className="rounded-full px-3 py-1.5 text-[0.95rem] font-semibold tracking-tight transition-colors hover:bg-linen" onClick={() => setChoosing(true)}>
                  {MONTHS[parts(month)[1] - 1]} {parts(month)[0]}
                </button>
              </MonthNav>
              <MonthView
                month={month}
                weekStart={weekStart}
                today={today}
                from={isYmd(current) ? current : null}
                to={isYmd(current) ? current : null}
                min={min}
                max={max}
                onPick={(d) => {
                  set(d);
                  close();
                }}
              />
            </>
          )}
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-stone/50 pt-3">
            <button
              type="button"
              className="b-btn-ghost b-btn-sm"
              disabled={Boolean((min && today < min) || (max && today > max))}
              onClick={() => {
                set(today);
                close();
              }}
            >
              Today
            </button>
            {!required && current && (
              <button
                type="button"
                className="b-btn-quiet b-btn-sm"
                onClick={() => {
                  set('');
                  close();
                }}
              >
                <X size={13} /> Clear
              </button>
            )}
          </div>
        </div>
      )}
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
                    <button type="button" className="rounded-full p-1.5 hover:bg-white" onClick={() => setYear(year - 1)} aria-label="Previous year"><ChevronLeft size={14} /></button>
                    <span className="min-w-[3rem] text-center text-sm font-semibold">{year}</span>
                    <button type="button" className="rounded-full p-1.5 hover:bg-white" onClick={() => setYear(year + 1)} aria-label="Next year"><ChevronRight size={14} /></button>
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
                            ? 'bg-white text-violet-700 ring-2 ring-inset ring-violet-400'
                            : 'bg-white text-ink hover:bg-sand'
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
                    <div key={k} className={`rounded-2xl border px-3.5 py-2 transition-colors ${active ? 'border-violet-400 bg-violet-50' : 'border-stone/70 bg-white'}`}>
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

