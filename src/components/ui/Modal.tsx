'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** A controlled pop-up window on the native <dialog> (focus trap, Esc, backdrop click). */
export default function Modal({ open, onClose, title, description, children, wide = false }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-2xl border border-stone/60 bg-surface p-0 text-ink shadow-[0_40px_80px_-30px_rgba(0,0,0,0.45)] backdrop:bg-black/40 backdrop:backdrop-blur-[2px]`}
    >
      {open && (
        <>
          <div className="flex items-start justify-between gap-4 border-b border-stone/60 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="-mr-2 rounded-lg p-2 text-muted hover:bg-sand/70" aria-label="Close"><X size={18} /></button>
          </div>
          <div className="max-h-[75vh] overflow-y-auto px-6 py-5">{children}</div>
        </>
      )}
    </dialog>
  );
}
