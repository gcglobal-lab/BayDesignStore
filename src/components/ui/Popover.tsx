'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/**
 * A floating panel anchored to a button. It's rendered with fixed positioning at the top of the
 * nearest dialog / themed area, so it is never cut off by scrolling tables or pop-up windows, and
 * it flips above the button when there's no room below.
 */
export function Popover({
  anchor,
  open,
  onClose,
  children,
  align = 'start',
  width,
  matchWidth = false,
  className = '',
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: 'start' | 'end';
  width?: number;
  matchWidth?: boolean;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width?: number; maxHeight: number } | null>(null);
  const [host, setHost] = useState<Element | null>(null);

  const place = useCallback(() => {
    const a = anchor.current;
    if (!a) return;
    const r = a.getBoundingClientRect();
    const w = matchWidth ? Math.max(r.width, width ?? 0) : (width ?? panel.current?.offsetWidth ?? 240);
    const h = panel.current?.offsetHeight ?? 0;
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const flip = h > below && above > below;
    let left = align === 'end' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    setPos({ top: flip ? Math.max(8, r.top - 4 - Math.min(h, above)) : r.bottom + 4, left, width: matchWidth || width ? w : undefined, maxHeight: Math.max(160, (flip ? above : below) - 4) });
  }, [anchor, align, width, matchWidth]);

  useLayoutEffect(() => {
    if (!open) return;
    const a = anchor.current;
    setHost(a?.closest('dialog') ?? a?.closest('[data-theme]') ?? a?.closest('.base-theme') ?? document.body);
    place();
    const id = requestAnimationFrame(place);
    return () => cancelAnimationFrame(id);
  }, [open, place, anchor]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchor.current?.focus();
      }
    };
    const move = () => place();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', move);
    window.addEventListener('scroll', move, true);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', move);
      window.removeEventListener('scroll', move, true);
    };
  }, [open, onClose, place, anchor]);

  if (!open || !host) return null;
  return createPortal(
    <div
      ref={panel}
      className={`fixed z-[200] overflow-auto rounded-xl border border-stone/70 bg-surface p-1 text-ink shadow-[0_18px_50px_-12px_rgba(15,23,42,0.35)] ring-1 ring-black/5 ${className}`}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width, maxHeight: pos?.maxHeight, visibility: pos ? 'visible' : 'hidden' }}
    >
      {children}
    </div>,
    host,
  );
}
