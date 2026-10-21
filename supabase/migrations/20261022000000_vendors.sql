-- Workflow ▸ Vendors: the suppliers the store buys from, with the emails orders go to.
-- cc / bcc hold one or more addresses separated by commas.

create table if not exists crm_vendors (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 160),
  vendor_number  text not null check (char_length(vendor_number) between 1 and 60),
  email          text not null check (char_length(email) <= 254),
  cc             text check (char_length(cc) <= 1000),
  bcc            text check (char_length(bcc) <= 1000),
  address        text not null check (char_length(address) <= 400),
  contact_email  text check (char_length(contact_email) <= 254),
  created_by     uuid references employees(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists crm_vendors_number_idx on crm_vendors (lower(vendor_number));
create index if not exists crm_vendors_name_idx on crm_vendors (lower(name));
drop trigger if exists crm_vendors_updated on crm_vendors;
create trigger crm_vendors_updated before update on crm_vendors for each row execute function set_updated_at();

alter table public.crm_vendors enable row level security;
alter table public.crm_vendors force row level security;
revoke all on table public.crm_vendors from anon, authenticated;
