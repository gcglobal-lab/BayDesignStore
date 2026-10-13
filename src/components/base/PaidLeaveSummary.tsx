import type { LeaveBalance } from '@/lib/base/leave';
import { fmtDays } from '@/lib/base/types';
import { Card } from './ui';

/** "7 days of 10 days left" with a bar — shown to employees on Time Off and Home. */
export default function PaidLeaveSummary({ balance, actions }: { balance: LeaveBalance; actions?: React.ReactNode }) {
  const pct = balance.allowance > 0 ? Math.max(0, Math.min(100, (balance.remaining / balance.allowance) * 100)) : 0;
  const none = balance.remaining <= 0;
  return (
    <Card title={`Paid leave · ${balance.year}`} actions={actions}>
      <p className="font-display text-3xl font-semibold leading-none">
        {none ? 'None left' : fmtDays(balance.remaining)}
        <span className="ml-2 text-sm font-normal text-muted">of {fmtDays(balance.allowance)} left</span>
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-linen">
        <div className={`h-full rounded-full ${none ? 'bg-red-500' : 'bg-gradient-to-r from-brass-light to-brass'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">
        {fmtDays(balance.used)} taken{balance.pending ? ` · ${fmtDays(balance.pending)} waiting for approval` : ''}. Vacation and paid time off use these days
        {none ? '; you can still request sick leave or normal (unpaid) leave.' : '.'}
      </p>
    </Card>
  );
}
