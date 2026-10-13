-- =============================================================================
-- Bay Design Base — paid leave balances
-- =============================================================================
--   * New leave type "vacation". Vacation and PTO are paid and come out of the
--     person's paid-leave allowance for the year the leave starts in; sick leave
--     (paid) and unpaid leave don't.
--   * leave_allowances: paid-leave days per person per year. A missing row means
--     the company default (company_settings.paid_leave_days_per_year) — so from
--     the new year everyone automatically gets the fixed yearly amount, while for
--     2026 an admin enters what each person has left.
--   * Remaining = allowance − approved − pending (pending is held so nobody can
--     request more than they have). 1 day = 8 hours.
-- =============================================================================

alter type time_off_type add value if not exists 'vacation';

alter table company_settings
  add column paid_leave_days_per_year numeric(5,2) not null default 10 check (paid_leave_days_per_year between 0 and 365);

create table leave_allowances (
  employee_id  uuid not null references employees(id) on delete cascade,
  year         smallint not null check (year between 2000 and 2100),
  paid_days    numeric(5,2) not null check (paid_days between 0 and 365),
  updated_by   uuid references employees(id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (employee_id, year)
);
create trigger leave_allowances_updated before update on leave_allowances for each row execute function set_updated_at();

alter table public.leave_allowances enable row level security;
alter table public.leave_allowances force row level security;
revoke all on table public.leave_allowances from anon, authenticated;
