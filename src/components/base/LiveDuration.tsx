'use client';

import { useEffect, useState } from 'react';
import { fmtDuration } from '@/lib/base/time';

/**
 * Worked time (HH:MM) that keeps counting while people are on the clock, without a page
 * refresh. `minutes` is the total the server worked out at `serverNow`; `running` is how many
 * of the time cards in that total are still accruing (punched in and not on an unpaid meal
 * break) — each adds a minute per minute. The first render matches the server exactly (no
 * hydration mismatch); it starts ticking once the page is live.
 */
export default function LiveDuration({ minutes, running = 0, serverNow }: { minutes: number; running?: number; serverNow: number }) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [running, serverNow]);

  return <>{fmtDuration(minutes + (running * Math.max(0, now - serverNow)) / 60_000)}</>;
}
