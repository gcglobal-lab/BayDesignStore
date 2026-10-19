'use client';

import { useActionState, useEffect, useRef, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import type { ActionResult } from '@/lib/base/actionResult';
import { confirmDialog, friendlyError, isControlFlow, toast } from '@/components/ui/toast';

export function SubmitButton({ children, className = 'b-btn-primary', pendingLabel, confirm }: { children: ReactNode; className?: string; pendingLabel?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  const confirmed = useRef(false);
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={
        confirm
          ? (e) => {
              // Ask with the site's own dialog, then submit the same button for real.
              if (confirmed.current) {
                confirmed.current = false;
                return;
              }
              e.preventDefault();
              const button = e.currentTarget;
              confirmDialog({ title: confirm, danger: /delete|remove|sign .* out|cancel|archive|terminate/i.test(confirm), confirmLabel: /delete/i.test(confirm) ? 'Delete' : 'Yes, continue' }).then((ok) => {
                if (!ok) return;
                confirmed.current = true;
                button.form?.requestSubmit(button);
              });
            }
          : undefined
      }
    >
      {pending && <Loader2 size={14} className="animate-spin" />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

export function FormMessage({ result }: { result: ActionResult }) {
  if (!result?.message) return null;
  return (
    <p
      role={result.ok ? 'status' : 'alert'}
      className={`flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-sm ${result.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}
    >
      {result.ok ? <CheckCircle2 size={16} className="mt-0.5 flex-none" /> : <AlertCircle size={16} className="mt-0.5 flex-none" />}
      <span>{result.message}</span>
    </p>
  );
}

/**
 * A form bound to a server action that returns an ActionResult. The result appears as a toast
 * (errors also stay inline next to the fields); a save that crashes or can't reach the server
 * shows a friendly error instead of breaking the page. `onSuccess` runs once per successful submission.
 */
export function ActionForm({
  action,
  children,
  className = 'space-y-4',
  resetOnSuccess = false,
  onSuccess,
  showMessage = true,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  children: ReactNode | ((result: ActionResult) => ReactNode);
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (result: ActionResult) => void;
  showMessage?: boolean;
}) {
  const [result, formAction] = useActionState(async (prev: ActionResult, fd: FormData): Promise<ActionResult> => {
    try {
      return await action(prev, fd);
    } catch (err) {
      if (isControlFlow(err)) throw err; // redirects after a successful save
      console.error(err);
      return { ok: false, message: friendlyError(err) };
    }
  }, null);
  const formRef = useRef<HTMLFormElement>(null);
  const handled = useRef<ActionResult>(null);

  useEffect(() => {
    if (!result || handled.current === result) return;
    handled.current = result;
    if (result.message) (result.ok ? toast.success : toast.error)(result.message);
    if (!result.ok) return;
    if (resetOnSuccess) formRef.current?.reset();
    onSuccess?.(result);
  }, [result, resetOnSuccess, onSuccess]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {typeof children === 'function' ? children(result) : children}
      {showMessage && !result?.ok && <FormMessage result={result} />}
    </form>
  );
}

export function Field({ label, htmlFor, hint, children, className = '' }: { label: string; htmlFor?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="b-label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[0.72rem] text-muted">{hint}</p>}
    </div>
  );
}
