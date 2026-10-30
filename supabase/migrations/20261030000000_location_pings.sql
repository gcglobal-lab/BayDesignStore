-- On-shift location trail: while someone is punched in and Base is open on their phone, it
-- sends a reading every couple of minutes (sooner when they move). Nothing is recorded off
-- the clock. Readings older than 90 days are deleted (see the trackLocation action).
-- status: 'ok' = a reading; 'denied' / 'unavailable' = the phone couldn't or wouldn't share one.

create table if not exists location_pings (
  id             bigint generated always as identity primary key,
  time_entry_id  uuid not null references time_entries(id) on delete cascade,
  employee_id    uuid not null references employees(id) on delete cascade,
  recorded_at    timestamptz not null,
  status         text not null default 'ok' check (status in ('ok', 'denied', 'unavailable')),
  lat            double precision check (lat between -90 and 90),
  lng            double precision check (lng between -180 and 180),
  accuracy_m     integer check (accuracy_m >= 0),
  speed_mps      real check (speed_mps >= 0),
  created_at     timestamptz not null default now(),
  check (status <> 'ok' or (lat is not null and lng is not null))
);
create index if not exists location_pings_entry_idx on location_pings (time_entry_id, recorded_at);
create index if not exists location_pings_employee_idx on location_pings (employee_id, recorded_at desc);
create index if not exists location_pings_created_idx on location_pings (created_at);

alter table public.location_pings enable row level security;
alter table public.location_pings force row level security;
revoke all on table public.location_pings from anon, authenticated;
