'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

const DialogContext = createContext<{ close: () => void }>({ close: () => {} });
export const useDialog = () => useContext(DialogContext);

/** A modal built on the native <dialog> element (focus trapping, Esc to close, backdrop). */
export function Dialog({
  trigger,
  title,
  description,
  children,
  triggerClassName = 'b-btn-primary',
  wide = false,
  defaultOpen = false,
}: {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  triggerClassName?: string;
  wide?: boolean;
  defaultOpen?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      <dialog
        ref={ref}
        onClose={close}
        onClick={(e) => e.target === ref.current && close()}
        className={`m-auto w-[calc(100%-2rem)] ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-3xl border border-stone/60 bg-ivory p-0 text-ink shadow-[0_40px_80px_-30px_rgba(23,23,58,0.45)] backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]`}
      >
        {open && (
          <DialogContext.Provider value={{ close }}>
            <div className="flex items-start justify-between gap-4 border-b border-stone/50 px-6 py-5">
              <div>
                <h2 className="b-h2">{title}</h2>
                {description && <p className="mt-1 text-sm text-muted">{description}</p>}
              </div>
              <button type="button" onClick={close} className="b-btn-quiet -mr-2 !p-2" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto px-6 py-5">{children}</div>
          </DialogContext.Provider>
        )}
      </dialog>
    </>
  );
}
