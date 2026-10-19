'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { friendlyError, toast } from './toast';

/**
 * What a page shows when it fails to load: a short explanation, "Try again" (re-fetches just
 * this part of the page) and a reference code that matches the server log.
 */
export default function ErrorScreen({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    toast.error('This page didn’t load properly.');
  }, [error]);
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-500">
        <AlertTriangle size={26} />
      </span>
      <h1 className="mt-5 text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">{friendlyError(error)}</p>
      <div className="mt-6 flex gap-2">
        <button type="button" onClick={() => retry()} className="inline-flex items-center gap-2 rounded-lg bg-[#1264A3] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0e5690]">
          <RotateCw size={15} /> Try again
        </button>
        <button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-stone px-4 py-2 text-sm font-medium hover:bg-sand/60">
          Reload page
        </button>
      </div>
      {error.digest && <p className="mt-6 text-[0.7rem] text-muted">Reference: {error.digest}</p>}
    </div>
  );
}
