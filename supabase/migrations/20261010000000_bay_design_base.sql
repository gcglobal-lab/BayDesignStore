-- =============================================================================
-- Bay Design Base — team scheduling, time off, availability and GPS time clock
-- =============================================================================
-- Run this in the Supabase SQL editor (or `supabase db push`) once the project
-- exists, then run supabase/seed.sql to load the current team and roles.
--
-- Security model
--   * The Next.js server is the ONLY client of this database. It connects with
--     the service-role key, which never reaches the browser.
--   * Row Level Security is enabled on every table with NO policies, and the
--     anon/authenticated roles have no grants — so even a leaked anon key can
--     read or write nothing.
--   * Login is handled by the app (no Supabase Auth sign-ups exist to abuse).
-- =============================================================================

-- gen_random_uuid() is built into Postgres 13+ (Supabase runs 15+), no extension needed.

-- ---------------------------------------------------------------- enums ------
create type access_level     as enum ('employee', 'manager', 'admin');
create type employee_status  as enum ('active', 'pending', 'terminated');
create type wage_type        as enum ('hourly', 'salary');
create type time_off_type    as enum ('unpaid', 'pto', 'sick');
create type time_off_reason  as enum ('vacation', 'personal', 'sick', 'family', 'other');
create type request_status   as enum ('pending', 'approved', 'denied', 'cancelled');
create type break_type       as enum ('rest', 'meal');
create type availability_kind as enum ('available', 'preferred', 'unavailable');
create type shift_request_type as enum ('pickup', 'cover');

-- ------------------------------------------------------------- helpers -------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------- company & locations ----
-- Settings ▸ Basic info / Company info / Time clock options / Overtime
create table company_settings (
  id                        smallint primary key default 1 check (id = 1),
  company_name              text not null default 'Bay Design Store Warehouse & Showroom',
  account_owner_name        text,
  phone                     text,
  timezone                  text not null default 'America/New_York',
  week_start                smallint not null default 1 check (week_start between 0 and 6), -- 0 = Sunday, 1 = Monday
  pay_period_days           smallint not null default 14 check (pay_period_days in (7, 14)),
  pay_period_anchor         date not null default date '2026-01-05',                          -- first day of any pay period
  daily_overtime_hours      numeric(4,2) check (daily_overtime_hours > 0),                   -- null = no daily overtime
  weekly_overtime_hours     numeric(5,2) default 40 check (weekly_overtime_hours > 0),
  require_location          boolean not null default true,   -- clock in/out must include a GPS fix
  enforce_geofence          boolean not null default false,  -- reject clock-ins outside every location's radius
  max_accuracy_m            integer not null default 150 check (max_accuracy_m between 10 and 5000),
  early_clock_in_minutes    integer not null default 15 check (early_clock_in_minutes between 0 and 240),
  late_grace_minutes        integer not null default 10 check (late_grace_minutes between 0 and 120),
  updated_at                timestamptz not null default now()
);
create trigger company_settings_updated before update on company_settings for each row execute function set_updated_at();

create table locations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(name) between 1 and 120),
  phone               text,
  address1            text,
  address2            text,
  city                text,
  state               text,
  postal_code         text,
  country             text not null default 'United States',
  timezone            text not null default 'America/New_York',
  business_type       text,
  business_category   text,
  website             text,
  latitude            double precision check (latitude between -90 and 90),
  longitude           double precision check (longitude between -180 and 180),
  geofence_radius_m   integer not null default 150 check (geofence_radius_m between 25 and 5000),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger locations_updated before update on locations for each row execute function set_updated_at();

-- ------------------------------------------------- departments & roles -------
-- Team ▸ Departments/Roles
create table departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 1 and 80),
  created_at  timestamptz not null default now()
);

create table job_roles (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 60),
  color          text not null default '#A8834F' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  department_id  uuid references departments(id) on delete set null,
  created_at     timestamptz not null default now()
);
create unique index job_roles_name_key on job_roles (lower(name));

-- ------------------------------------------------------------ employees -----
-- Team ▸ Roster
create table employees (
  id                    uuid primary key default gen_random_uuid(),
  first_name            text not null check (char_length(first_name) between 1 and 80),
  last_name             text not null default '' check (char_length(last_name) <= 80),
  email                 text check (email is null or (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone                 text,
  login_id              text not null check (login_id ~ '^[a-z0-9._-]{3,64}$'),
  password_hash         text,                       -- scrypt; null = cannot sign in yet
  access_level          access_level not null default 'employee',
  status                employee_status not null default 'pending',
  location_id           uuid references locations(id) on delete set null,
  title                 text,                       -- e.g. "Account Owner", shown under the name
  is_contractor         boolean not null default false,
  birthday              date,
  hire_date             date,
  must_change_password  boolean not null default true,
  session_version       integer not null default 1, -- bump to sign the person out everywhere
  last_login_at         timestamptz,
  terminated_at         timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index employees_login_id_key on employees (lower(login_id));
create unique index employees_email_key on employees (lower(email)) where email is not null;
create index employees_status_idx on employees (status);
create trigger employees_updated before update on employees for each row execute function set_updated_at();

create table department_managers (
  department_id  uuid not null references departments(id) on delete cascade,
  employee_id    uuid not null references employees(id) on delete cascade,
  primary key (department_id, employee_id)
);

create table employee_roles (
  employee_id  uuid not null references employees(id) on delete cascade,
  role_id      uuid not null references job_roles(id) on delete cascade,
  is_primary   boolean not null default false,
  primary key (employee_id, role_id)
);
create index employee_roles_role_idx on employee_roles (role_id);

-- Wage history: the current wage is the latest row with effective_from <= today.
create table employee_wages (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references employees(id) on delete cascade,
  wage_type       wage_type not null default 'hourly',
  amount          numeric(10,2) not null check (amount >= 0),  -- per hour, or per year for salary
  effective_from  date not null default current_date,
  created_by      uuid references employees(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index employee_wages_employee_idx on employee_wages (employee_id, effective_from desc);

-- -------------------------------------------------------------- shifts -------
-- Shifts ▸ Schedule. employee_id null = open shift.
create table shifts (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid references employees(id) on delete cascade,
  location_id    uuid references locations(id) on delete set null,
  role_id        uuid references job_roles(id) on delete set null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  break_minutes  integer not null default 0 check (break_minutes between 0 and 240),
  notes          text check (char_length(notes) <= 500),
  published_at   timestamptz,                -- null = draft, only managers see it
  created_by     uuid references employees(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '24 hours')
);
create index shifts_starts_idx on shifts (starts_at);
create index shifts_employee_idx on shifts (employee_id, starts_at);
create trigger shifts_updated before update on shifts for each row execute function set_updated_at();

-- My Week ▸ Open Shifts / Incoming & Your Requests
create table shift_requests (
  id            uuid primary key default gen_random_uuid(),
  type          shift_request_type not null,     -- pickup = claim an open shift, cover = give my shift away
  shift_id      uuid not null references shifts(id) on delete cascade,
  requester_id  uuid not null references employees(id) on delete cascade,
  claimant_id   uuid references employees(id) on delete cascade, -- cover: the teammate taking it
  status        request_status not null default 'pending',
  note          text check (char_length(note) <= 500),
  decided_by    uuid references employees(id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index shift_requests_status_idx on shift_requests (status, created_at);
create unique index shift_requests_one_pending on shift_requests (shift_id, requester_id) where status = 'pending';

-- Schedule ▸ Events row / Home ▸ Upcoming
create table events (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid references locations(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 120),
  description  text check (char_length(description) <= 1000),
  starts_on    date not null,
  ends_on      date not null,
  created_by   uuid references employees(id) on delete set null,
  created_at   timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index events_dates_idx on events (starts_on, ends_on);

-- ------------------------------------------------------------ time off ------
-- Shifts ▸ Time Off
create table time_off_policies (
  id                uuid primary key default gen_random_uuid(),
  type              time_off_type not null,
  name              text not null check (char_length(name) between 1 and 80),
  annual_hours      numeric(6,2) check (annual_hours >= 0),
  accrual_per_hour  numeric(6,4) check (accrual_per_hour >= 0),   -- hours earned per hour worked
  carryover_hours   numeric(6,2) check (carryover_hours >= 0),
  created_at        timestamptz not null default now()
);

create table time_off_requests (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references employees(id) on delete cascade,
  type          time_off_type not null default 'unpaid',
  reason        time_off_reason not null default 'other',
  starts_on     date not null,
  ends_on       date not null,
  all_day       boolean not null default true,
  start_time    time,                          -- partial-day requests
  end_time      time,
  hours         numeric(6,2) not null check (hours >= 0),
  status        request_status not null default 'pending',
  note          text check (char_length(note) <= 1000),
  manager_note  text check (char_length(manager_note) <= 1000),
  reviewed_by   uuid references employees(id) on delete set null,
  reviewed_at   timestamptz,
  created_by    uuid references employees(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (all_day or (start_time is not null and end_time is not null and end_time > start_time))
);
create index time_off_employee_idx on time_off_requests (employee_id, starts_on);
create index time_off_status_idx on time_off_requests (status, starts_on);

-- -------------------------------------------------------- availability ------
-- Shifts ▸ My Availability / Team Availability. Each submission is a request
-- that a manager approves; the latest approved one in effect is "Current".
create table availability_requests (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references employees(id) on delete cascade,
  effective_from  date not null,
  status          request_status not null default 'pending',
  note            text check (char_length(note) <= 500),
  reviewed_by     uuid references employees(id) on delete set null,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index availability_requests_employee_idx on availability_requests (employee_id, effective_from desc);

create table availability_slots (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references availability_requests(id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),   -- ISO: 1 = Monday … 7 = Sunday
  kind        availability_kind not null default 'preferred',
  all_day     boolean not null default false,
  start_time  time,
  end_time    time,
  check (all_day or (start_time is not null and end_time is not null and end_time > start_time))
);
create index availability_slots_request_idx on availability_slots (request_id);

-- --------------------------------------------------------- time clock -------
-- Timesheets. Every clock in/out stores the GPS fix the phone reported, how far
-- it was from the nearest location and whether it fell inside the geofence.
create table time_entries (
  id                     uuid primary key default gen_random_uuid(),
  employee_id            uuid not null references employees(id) on delete cascade,
  shift_id               uuid references shifts(id) on delete set null,
  location_id            uuid references locations(id) on delete set null,
  clock_in_at            timestamptz not null,
  clock_out_at           timestamptz,
  clock_in_lat           double precision check (clock_in_lat between -90 and 90),
  clock_in_lng           double precision check (clock_in_lng between -180 and 180),
  clock_in_accuracy_m    real check (clock_in_accuracy_m >= 0),
  clock_in_distance_m    real,
  clock_in_in_geofence   boolean,
  clock_in_ip            inet,
  clock_in_user_agent    text,
  clock_out_lat          double precision check (clock_out_lat between -90 and 90),
  clock_out_lng          double precision check (clock_out_lng between -180 and 180),
  clock_out_accuracy_m   real check (clock_out_accuracy_m >= 0),
  clock_out_distance_m   real,
  clock_out_in_geofence  boolean,
  clock_out_ip           inet,
  clock_out_user_agent   text,
  source                 text not null default 'web' check (source in ('web', 'manual')),
  notes                  text check (char_length(notes) <= 1000),
  edited_by              uuid references employees(id) on delete set null,
  edited_at              timestamptz,
  created_at             timestamptz not null default now(),
  check (clock_out_at is null or clock_out_at > clock_in_at)
);
-- A person can only be on the clock once at a time — enforced by the database.
create unique index time_entries_one_open on time_entries (employee_id) where clock_out_at is null;
create index time_entries_clock_in_idx on time_entries (clock_in_at);
create index time_entries_employee_idx on time_entries (employee_id, clock_in_at desc);

create table time_entry_breaks (
  id             uuid primary key default gen_random_uuid(),
  time_entry_id  uuid not null references time_entries(id) on delete cascade,
  type           break_type not null default 'rest',
  started_at     timestamptz not null,
  ended_at       timestamptz,
  check (ended_at is null or ended_at > started_at)
);
create unique index time_entry_breaks_one_open on time_entry_breaks (time_entry_id) where ended_at is null;

-- Settings ▸ Manager Log
create table manager_log (
  id           uuid primary key default gen_random_uuid(),
  log_date     date not null,
  body         text not null check (char_length(body) between 1 and 2000),
  author_id    uuid references employees(id) on delete set null,
  author_name  text not null,
  created_at   timestamptz not null default now()
);
create index manager_log_date_idx on manager_log (log_date desc);

-- --------------------------------------------------------------- security ---
create table login_attempts (
  id          bigint generated always as identity primary key,
  identifier  text not null,      -- lower-cased login id that was tried
  ip          text,
  success     boolean not null,
  created_at  timestamptz not null default now()
);
create index login_attempts_identifier_idx on login_attempts (identifier, created_at desc);
create index login_attempts_ip_idx on login_attempts (ip, created_at desc);

create table audit_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid references employees(id) on delete set null,
  actor_label  text not null,
  action       text not null,
  entity       text,
  entity_id    text,
  details      jsonb,
  ip           text,
  created_at   timestamptz not null default now()
);
create index audit_log_created_idx on audit_log (created_at desc);

-- ------------------------------------------------- lock everything down -----
do $$
declare t text;
begin
  foreach t in array array[
    'company_settings','locations','departments','job_roles','employees','department_managers',
    'employee_roles','employee_wages','shifts','shift_requests','events','time_off_policies',
    'time_off_requests','availability_requests','availability_slots','time_entries',
    'time_entry_breaks','manager_log','login_attempts','audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- Old login attempts are only useful for rate limiting; keep 30 days.
-- (Optional) schedule with pg_cron:  select cron.schedule('purge-login-attempts', '0 4 * * *',
--   $$delete from login_attempts where created_at < now() - interval '30 days'$$);

insert into company_settings (account_owner_name, phone) values ('Luis Orbegoso', '(239) 330-5420');
