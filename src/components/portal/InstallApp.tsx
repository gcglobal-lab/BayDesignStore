'use client';

import { useEffect, useState } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

/**
 * "Install the app" for the Employee Portal. Chrome / Edge / Android: one tap opens the
 * browser's install window. iPhone / iPad: shows the Add to Home Screen steps (Apple has no
 * install button). Hidden once the app is installed, or in browsers that can't install it.
 */
export default function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [steps, setSteps] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    if (standalone) return;
    const ua = navigator.userAgent;
    setIos(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    const onPrompt = (e: Event) => {
      e.preventDefault(); // show our button instead of the browser's own banner
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || (!prompt && !ios)) return null;

  const install = async () => {
    if (!prompt) return setSteps(true);
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setPrompt(null);
  };

  return (
    <div className="mt-6 rounded-2xl border border-stone/70 bg-surface p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
          <Download size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Get the Employee Portal app</p>
          <p className="text-xs text-muted">Opens straight to this sign-in, full screen, from your home screen.</p>
        </div>
        <button type="button" onClick={() => void install()} className="b-btn-brass b-btn-sm flex-none">
          Install
        </button>
      </div>
      {steps && (
        <div className="mt-4 border-t border-stone/50 pt-3 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold">Add it to your Home Screen</p>
            <button type="button" onClick={() => setSteps(false)} className="rounded p-1 text-muted hover:bg-sand" aria-label="Close">
              <X size={14} />
            </button>
          </div>
          <ol className="space-y-2 text-muted">
            <li className="flex items-center gap-2">
              <span className="font-semibold text-ink">1.</span> Tap the Share button <Share size={15} className="text-ink" /> in Safari’s toolbar.
            </li>
            <li className="flex items-center gap-2">
              <span className="font-semibold text-ink">2.</span> Choose <span className="inline-flex items-center gap-1 font-medium text-ink"><SquarePlus size={15} /> Add to Home Screen</span>.
            </li>
            <li className="flex items-center gap-2">
              <span className="font-semibold text-ink">3.</span> Tap <span className="font-medium text-ink">Add</span>, then open it from your Home Screen.
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
