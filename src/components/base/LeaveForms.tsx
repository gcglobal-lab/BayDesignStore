'use client';

import { ActionForm, SubmitButton } from './forms';
import { setAllLeaveAllowances, setDefaultPaidLeave, setLeaveAllowance } from '@/app/base/(app)/time-off/actions';

/** Set one person's paid-leave days for a year (inline, e.g. in the balances table). */
export function LeaveAllowanceForm({ employeeId, year, value, compact = false }: { employeeId: string; year: number; value: number; compact?: boolean }) {
  return (
    <ActionForm action={setLeaveAllowance} className={compact ? 'flex items-center gap-1.5' : 'space-y-2'}>
      <input type="hidden" name="employee_id" value={employeeId} />
      <input type="hidden" name="year" value={year} />
      <div className="flex items-center gap-1.5">
        <input
          name="paid_days"
          type="number"
          min={0}
          max={365}
          step={0.25}
          defaultValue={value}
          key={value}
          className="b-input !w-24 !py-1.5 text-right"
          aria-label={`Paid leave days for ${year}`}
        />
        <span className="text-xs text-muted">days</span>
        <SubmitButton className="b-btn-ghost b-btn-sm">Save</SubmitButton>
      </div>
    </ActionForm>
  );
}

/** Admin: same number of paid-leave days for everyone for one year. */
export function LeaveAllowanceAllForm({ year }: { year: number }) {
  return (
    <ActionForm action={setAllLeaveAllowances} className="space-y-2">
      <input type="hidden" name="year" value={year} />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm">Give everyone</span>
        <input name="paid_days" type="number" min={0} max={365} step={0.25} required className="b-input !w-24 !py-1.5 text-right" aria-label="Days for everyone" />
        <span className="text-sm">days for {year}</span>
        <SubmitButton className="b-btn-ghost b-btn-sm" confirm={`Set everyone’s ${year} paid leave to this number? It replaces what each person has now.`}>Apply</SubmitButton>
      </div>
    </ActionForm>
  );
}

/** Admin: the fixed yearly amount for anyone without their own allowance (applies from the new year). */
export function DefaultPaidLeaveForm({ value }: { value: number }) {
  return (
    <ActionForm action={setDefaultPaidLeave} className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <input name="paid_days" type="number" min={0} max={365} step={0.25} required defaultValue={value} key={value} className="b-input !w-24 !py-1.5 text-right" aria-label="Paid leave days per year" />
        <span className="text-sm">days per year</span>
        <SubmitButton className="b-btn-ghost b-btn-sm">Save</SubmitButton>
      </div>
    </ActionForm>
  );
}
