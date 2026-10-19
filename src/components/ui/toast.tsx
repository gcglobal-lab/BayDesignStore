'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

/**
 * Site-wide notifications and confirmations.
 *   toast.success('Saved') / toast.error('Couldn’t save') / toast.info('…')
 *   if (await confirmDialog({ title: 'Delete this row?', danger: true })) …
 * <Toaster /> (mounted once in the root layout) draws them, and also turns unexpected errors
 * anywhere on the page into a friendly toast instead of a silent failure.
 */

type Kind = 'success' | 'error' | 'info';
type Toast = { id: number; kind: Kind; message: string };
type Confirm = { title: string; message?: string; confirmLabel: string; cancelLabel: string; danger: boolean; resolve: (ok: boolean) => void };

let toasts: Toast[] = [];
let confirmState: Confirm | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function push(kind: Kind, message: string, ms?: number) {
  const text = message.trim();
  if (!text) return;
  // The same message twice in a row (e.g. several failed saves) shows once.
  if (toasts.some((t) => t.kind === kind && t.message === text)) return;
  const id = ++seq;
  toasts = [...toasts.slice(-3), { id, kind, message: text }];
  emit();
  window.setTimeout(() => dismiss(id), ms ?? (kind === 'error' ? 6500 : 3500));
}
function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message),
  info: (message: string) => push('info', message),
};

/** A styled replacement for window.confirm. Resolves true when the person confirms. */
export function confirmDialog(opts: { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    confirmState?.resolve(false);
    confirmState = {
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel ?? (opts.danger ? 'Delete' : 'Confirm'),
      cancelLabel: opts.cancelLabel ?? 'Cancel',
      danger: opts.danger ?? false,
      resolve: (ok) => {
        confirmState = null;
        emit();
        resolve(ok);
      },
    };
    emit();
  });
}

/** Turns a failed action result (or a thrown error) into an error toast. Returns true when it was OK. */
export function reportResult(res: { ok: boolean; message?: string } | null | undefined, fallback = 'Something went wrong — please try again.'): boolean {
  if (res?.ok) return true;
  toast.error(res?.message || fallback);
  return false;
}

/** Errors that are Next.js control flow (redirects, notFound), not failures. */
export const isControlFlow = (err: unknown) => {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === 'string' && /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK)/.test(digest);
};

export function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return 'You seem to be offline — check the connection and try again.';
  if (/chunk|loading css|dynamically imported module/i.test(msg)) return 'A new version of the site is ready — please refresh the page.';
  return 'Something went wrong — please try again. If it keeps happening, refresh the page.';
}

const ICON = { success: CheckCircle2, error: XCircle, info: Info };
const TONE = {
  success: 'border-emerald-500/30 [&_svg.lead]:text-emerald-400',
  error: 'border-red-500/35 [&_svg.lead]:text-red-400',
  info: 'border-sky-500/30 [&_svg.lead]:text-sky-400',
};

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => toasts, () => toasts);
  const confirm = useSyncExternalStore(subscribe, () => confirmState, () => confirmState);
  const okRef = useRef<HTMLButtonElement>(null);

  // Unexpected errors anywhere in the browser become a toast (and still reach the console).
  useEffect(() => {
    const ignore = (msg: string) => /ResizeObserver loop|Script error\.?$|_vercel\/(insights|speed-insights)/i.test(msg);
    const onError = (e: ErrorEvent) => {
      if (isControlFlow(e.error) || ignore(e.message ?? '')) return;
      toast.error(friendlyError(e.error ?? e.message));
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isControlFlow(e.reason) || ignore(String((e.reason as Error)?.message ?? e.reason ?? ''))) return;
      toast.error(friendlyError(e.reason));
    };
    const onOffline = () => toast.error('You’re offline — changes won’t save until the connection is back.');
    const onOnline = () => toast.success('Back online.');
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  useEffect(() => {
    if (!confirm) return;
    okRef.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        confirm.resolve(false);
      }
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [confirm]);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[300] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:left-auto sm:right-6 sm:items-end" aria-live="polite" role="status">
        {list.map((t) => {
          const Icon = ICON[t.kind];
          return (
            <div key={t.id} className={`toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-[#0f172a]/95 px-4 py-3 text-sm text-white shadow-[0_18px_40px_-12px_rgba(0,0,0,0.55)] backdrop-blur ${TONE[t.kind]}`}>
              <Icon size={18} className="lead mt-0.5 flex-none" />
              <p className="min-w-0 flex-1 leading-snug">{t.message}</p>
              <button type="button" onClick={() => dismiss(t.id)} className="-mr-1 rounded p-0.5 text-white/50 hover:text-white" aria-label="Dismiss">
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-[310] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
          <button type="button" className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={() => confirm.resolve(false)} aria-label={confirm.cancelLabel} />
          <div className="toast-in relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0f172a] p-5 text-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
            <div className="flex gap-3.5">
              <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-full ${confirm.danger ? 'bg-red-500/15 text-red-400' : 'bg-sky-500/15 text-sky-300'}`}>
                {confirm.danger ? <AlertTriangle size={19} /> : <Info size={19} />}
              </span>
              <div className="min-w-0 pt-1">
                <h2 id="confirm-title" className="text-[1.02rem] font-semibold leading-snug">{confirm.title}</h2>
                {confirm.message && <p className="mt-1.5 text-sm leading-relaxed text-white/65">{confirm.message}</p>}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => confirm.resolve(false)} className="rounded-lg border border-white/15 px-3.5 py-2 text-sm font-medium text-white/85 hover:bg-white/10">
                {confirm.cancelLabel}
              </button>
              <button
                ref={okRef}
                type="button"
                onClick={() => confirm.resolve(true)}
                className={`rounded-lg px-3.5 py-2 text-sm font-semibold text-white ${confirm.danger ? 'bg-red-600 hover:bg-red-500' : 'bg-sky-600 hover:bg-sky-500'}`}
              >
                {confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
