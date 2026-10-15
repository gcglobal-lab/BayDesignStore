-- =============================================================================
-- Employee Portal V3 — Workflow (CRM) and Deliveries (dispatch)
-- =============================================================================
--   * employees.crm_role / deliveries_role: which of the two new apps each person
--     can open (Time is for everyone). Admins always have full access to all three.
--       crm_role:        none | user (works their own records, sees everything) | manager (everything + settings + delete)
--       deliveries_role: none | driver (own routes on their phone) | dispatcher (everything)
--   * Workflow: pipelines & stages, leads inbox, contacts, companies, deals,
--     activities (tasks, calls, meetings, notes, history), products, quotes,
--     automations and email templates.
--   * Deliveries: trucks, delivery orders with items, routes, status history,
--     proof of delivery (signature / photo) and a public tracking token.
--   Like every other table, only the server (service-role key) can read or write.
-- =============================================================================

alter table employees add column if not exists crm_role text not null default 'none'
  check (crm_role in ('none', 'user', 'manager'));
alter table employees add column if not exists deliveries_role text not null default 'none'
  check (deliveries_role in ('none', 'driver', 'dispatcher'));

-- =================================================================== CRM =====

create table crm_settings (
  id             smallint primary key default 1 check (id = 1),
  lead_sources   text[] not null default array['Website form', 'Website chat', 'Walk-in', 'Phone call', 'Referral', 'Designer referral', 'Social media', 'Event', 'Repeat customer', 'Other'],
  lost_reasons   text[] not null default array['Price', 'Chose a competitor', 'Timing / not ready', 'No response', 'Out of budget', 'Product not available', 'Other'],
  deal_tags      text[] not null default array['VIP', 'Designer', 'Trade', 'Hot', 'Install needed'],
  default_owner_id uuid references employees(id) on delete set null,   -- who gets new website leads (null = unassigned)
  quote_terms    text not null default 'Prices valid for 30 days. A 50% deposit confirms the order; the balance is due before delivery.',
  updated_at     timestamptz not null default now()
);
insert into crm_settings (id) values (1);

create table crm_pipelines (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  position    integer not null default 0,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

create table crm_stages (
  id           uuid primary key default gen_random_uuid(),
  pipeline_id  uuid not null references crm_pipelines(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  color        text not null default '#6366F1' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  probability  smallint not null default 10 check (probability between 0 and 100),
  rot_days     smallint check (rot_days between 1 and 365),  -- deals idle longer than this are flagged
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);
create index crm_stages_pipeline_idx on crm_stages (pipeline_id, position);

create table crm_companies (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 160),
  industry     text check (char_length(industry) <= 80),
  website      text check (char_length(website) <= 200),
  phone        text check (char_length(phone) <= 40),
  email        text check (char_length(email) <= 254),
  address1     text check (char_length(address1) <= 200),
  city         text check (char_length(city) <= 80),
  state        text check (char_length(state) <= 40),
  postal_code  text check (char_length(postal_code) <= 20),
  notes        text check (char_length(notes) <= 5000),
  owner_id     uuid references employees(id) on delete set null,
  created_by   uuid references employees(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index crm_companies_name_idx on crm_companies (lower(name));
create trigger crm_companies_updated before update on crm_companies for each row execute function set_updated_at();

create table crm_contacts (
  id                uuid primary key default gen_random_uuid(),
  first_name        text not null check (char_length(first_name) between 1 and 80),
  last_name         text not null default '' check (char_length(last_name) <= 80),
  email             text check (char_length(email) <= 254),
  phone             text check (char_length(phone) <= 40),
  title             text check (char_length(title) <= 120),
  company_id        uuid references crm_companies(id) on delete set null,
  lifecycle         text not null default 'lead' check (lifecycle in ('lead', 'prospect', 'customer', 'past_customer', 'designer', 'vendor', 'other')),
  source            text check (char_length(source) <= 80),
  owner_id          uuid references employees(id) on delete set null,
  address1          text check (char_length(address1) <= 200),
  address2          text check (char_length(address2) <= 200),
  city              text check (char_length(city) <= 80),
  state             text check (char_length(state) <= 40),
  postal_code       text check (char_length(postal_code) <= 20),
  tags              text[] not null default '{}',
  notes             text check (char_length(notes) <= 5000),
  do_not_contact    boolean not null default false,
  last_activity_at  timestamptz,
  created_by        uuid references employees(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index crm_contacts_email_idx on crm_contacts (lower(email));
create index crm_contacts_name_idx on crm_contacts (lower(first_name), lower(last_name));
create index crm_contacts_company_idx on crm_contacts (company_id);
create index crm_contacts_owner_idx on crm_contacts (owner_id);
create trigger crm_contacts_updated before update on crm_contacts for each row execute function set_updated_at();

create table crm_deals (
  id                uuid primary key default gen_random_uuid(),
  title             text not null check (char_length(title) between 1 and 160),
  pipeline_id       uuid not null references crm_pipelines(id) on delete cascade,
  stage_id          uuid not null references crm_stages(id) on delete restrict,
  contact_id        uuid references crm_contacts(id) on delete set null,
  company_id        uuid references crm_companies(id) on delete set null,
  owner_id          uuid references employees(id) on delete set null,
  value             numeric(12,2) not null default 0 check (value >= 0),
  expected_close    date,
  status            text not null default 'open' check (status in ('open', 'won', 'lost')),
  lost_reason       text check (char_length(lost_reason) <= 200),
  priority          text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  source            text check (char_length(source) <= 80),
  tags              text[] not null default '{}',
  notes             text check (char_length(notes) <= 5000),
  position          double precision not null default 0,       -- order inside a pipeline column
  stage_changed_at  timestamptz not null default now(),
  closed_at         timestamptz,
  created_by        uuid references employees(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index crm_deals_board_idx on crm_deals (pipeline_id, status, stage_id, position);
create index crm_deals_contact_idx on crm_deals (contact_id);
create index crm_deals_company_idx on crm_deals (company_id);
create index crm_deals_owner_idx on crm_deals (owner_id, status);
create index crm_deals_closed_idx on crm_deals (closed_at);
create trigger crm_deals_updated before update on crm_deals for each row execute function set_updated_at();

-- Leads inbox: unqualified requests (website form, website chat, walk-ins…) before they become deals.
create table crm_leads (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null check (char_length(title) between 1 and 160),
  name               text not null check (char_length(name) between 1 and 160),
  email              text check (char_length(email) <= 254),
  phone              text check (char_length(phone) <= 40),
  company_name       text check (char_length(company_name) <= 160),
  message            text check (char_length(message) <= 5000),
  source             text check (char_length(source) <= 80),
  status             text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'disqualified', 'converted')),
  estimated_value    numeric(12,2) check (estimated_value >= 0),
  owner_id           uuid references employees(id) on delete set null,
  contact_id         uuid references crm_contacts(id) on delete set null,
  deal_id            uuid references crm_deals(id) on delete set null,
  inquiry_id         uuid unique references inquiries(id) on delete set null,
  disqualify_reason  text check (char_length(disqualify_reason) <= 200),
  created_by         uuid references employees(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index crm_leads_status_idx on crm_leads (status, created_at desc);
create index crm_leads_email_idx on crm_leads (lower(email));
create trigger crm_leads_updated before update on crm_leads for each row execute function set_updated_at();

-- Tasks, calls, meetings, emails and notes — plus 'log' lines written by the app (stage changes, won/lost…).
create table crm_activities (
  id           uuid primary key default gen_random_uuid(),
  type         text not null check (type in ('task', 'call', 'meeting', 'email', 'note', 'log')),
  subject      text not null check (char_length(subject) between 1 and 200),
  body         text check (char_length(body) <= 5000),
  due_at       timestamptz,
  done         boolean not null default false,
  done_at      timestamptz,
  priority     text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  outcome      text check (char_length(outcome) <= 200),
  assignee_id  uuid references employees(id) on delete set null,
  contact_id   uuid references crm_contacts(id) on delete cascade,
  company_id   uuid references crm_companies(id) on delete cascade,
  deal_id      uuid references crm_deals(id) on delete cascade,
  lead_id      uuid references crm_leads(id) on delete cascade,
  created_by   uuid references employees(id) on delete set null,
  author_name  text,
  created_at   timestamptz not null default now()
);
create index crm_activities_open_idx on crm_activities (done, due_at) where type in ('task', 'call', 'meeting', 'email');
create index crm_activities_assignee_idx on crm_activities (assignee_id, done, due_at);
create index crm_activities_contact_idx on crm_activities (contact_id, created_at desc);
create index crm_activities_deal_idx on crm_activities (deal_id, created_at desc);
create index crm_activities_company_idx on crm_activities (company_id, created_at desc);
create index crm_activities_lead_idx on crm_activities (lead_id, created_at desc);

create table crm_products (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 160),
  sku          text check (char_length(sku) <= 60),
  category     text check (char_length(category) <= 80),
  description  text check (char_length(description) <= 2000),
  unit_price   numeric(12,2) not null default 0 check (unit_price >= 0),
  cost         numeric(12,2) check (cost >= 0),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index crm_products_name_idx on crm_products (lower(name));
create trigger crm_products_updated before update on crm_products for each row execute function set_updated_at();

create sequence crm_quote_number_seq start 1001;
create table crm_quotes (
  id            uuid primary key default gen_random_uuid(),
  number        integer not null unique default nextval('crm_quote_number_seq'),
  title         text not null check (char_length(title) between 1 and 160),
  status        text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined', 'expired')),
  deal_id       uuid references crm_deals(id) on delete set null,
  contact_id    uuid references crm_contacts(id) on delete set null,
  company_id    uuid references crm_companies(id) on delete set null,
  owner_id      uuid references employees(id) on delete set null,
  valid_until   date,
  discount_pct  numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  tax_pct       numeric(5,2) not null default 6 check (tax_pct between 0 and 30),
  delivery_fee  numeric(12,2) not null default 0 check (delivery_fee >= 0),
  notes         text check (char_length(notes) <= 5000),
  terms         text check (char_length(terms) <= 5000),
  sent_at       timestamptz,
  decided_at    timestamptz,
  created_by    uuid references employees(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index crm_quotes_deal_idx on crm_quotes (deal_id);
create index crm_quotes_status_idx on crm_quotes (status, created_at desc);
create trigger crm_quotes_updated before update on crm_quotes for each row execute function set_updated_at();

create table crm_quote_items (
  id            uuid primary key default gen_random_uuid(),
  quote_id      uuid not null references crm_quotes(id) on delete cascade,
  product_id    uuid references crm_products(id) on delete set null,
  description   text not null check (char_length(description) between 1 and 300),
  quantity      numeric(10,2) not null default 1 check (quantity > 0),
  unit_price    numeric(12,2) not null default 0 check (unit_price >= 0),
  discount_pct  numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  position      integer not null default 0
);
create index crm_quote_items_quote_idx on crm_quote_items (quote_id, position);

-- "When <trigger>, do <action>" rules, run by the app right after the event.
create table crm_automations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 120),
  trigger        text not null check (trigger in ('lead_created', 'deal_created', 'deal_stage_changed', 'deal_won', 'deal_lost', 'quote_accepted')),
  stage_id       uuid references crm_stages(id) on delete cascade,   -- deal_stage_changed: only when entering this stage
  action         text not null check (action in ('create_task', 'assign_owner', 'add_tag', 'set_priority')),
  task_type      text check (task_type in ('task', 'call', 'meeting', 'email')),
  task_subject   text check (char_length(task_subject) <= 200),
  task_due_days  smallint check (task_due_days between 0 and 365),
  assignee_id    uuid references employees(id) on delete set null,  -- create_task: null = record owner; assign_owner: who
  value          text check (char_length(value) <= 80),             -- add_tag: tag; set_priority: low|normal|high
  active         boolean not null default true,
  run_count      integer not null default 0,
  last_run_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index crm_automations_trigger_idx on crm_automations (trigger) where active;

create table crm_email_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  subject     text not null check (char_length(subject) between 1 and 200),
  body        text not null check (char_length(body) between 1 and 5000),
  created_at  timestamptz not null default now()
);

-- Starter data: one pipeline for a furniture & interior design store.
with p as (
  insert into crm_pipelines (name, position, is_default) values ('Sales', 0, true) returning id
)
insert into crm_stages (pipeline_id, name, color, probability, rot_days, position)
select p.id, s.name, s.color, s.probability, s.rot_days, s.position
from p, (values
  ('New',                 '#0EA5E9', 10, 3,  0),
  ('Contacted',           '#6366F1', 20, 5,  1),
  ('Showroom visit / consult', '#8B5CF6', 40, 7,  2),
  ('Proposal / quote sent', '#EC4899', 60, 7,  3),
  ('Negotiation',         '#F59E0B', 80, 10, 4),
  ('Order placed',        '#10B981', 95, 14, 5)
) as s(name, color, probability, rot_days, position);

with p as (
  insert into crm_pipelines (name, position, is_default) values ('Design projects', 1, false) returning id
)
insert into crm_stages (pipeline_id, name, color, probability, rot_days, position)
select p.id, s.name, s.color, s.probability, s.rot_days, s.position
from p, (values
  ('Discovery call',   '#0EA5E9', 15, 5,  0),
  ('Site measure',     '#6366F1', 30, 10, 1),
  ('Concept & moodboard', '#8B5CF6', 50, 14, 2),
  ('Design presentation', '#EC4899', 70, 14, 3),
  ('Approved & ordering', '#10B981', 90, 21, 4)
) as s(name, color, probability, rot_days, position);

insert into crm_email_templates (name, subject, body) values
  ('Thank you for your inquiry', 'Thank you for contacting Bay Design Store',
   'Hi {{first_name}},\n\nThank you for reaching out to Bay Design Store. I''d love to help with your project. When would be a good time for a quick call or a visit to our showroom at 326 13th Avenue South, Naples?\n\nWarm regards,\n{{my_name}}\nBay Design Store'),
  ('Quote follow-up', 'Following up on your quote',
   'Hi {{first_name}},\n\nI wanted to follow up on the quote I sent over. Do you have any questions, or would you like to make any changes? I''m happy to help.\n\nBest,\n{{my_name}}\nBay Design Store'),
  ('Delivery scheduled', 'Your Bay Design Store delivery',
   'Hi {{first_name}},\n\nGreat news — your order is ready. Our team will contact you to confirm the delivery window. Please reply with any access notes (gate codes, elevators, parking).\n\nThank you,\n{{my_name}}\nBay Design Store');

insert into crm_automations (name, trigger, action, task_type, task_subject, task_due_days) values
  ('Call every new lead within a day', 'lead_created', 'create_task', 'call', 'Call the new lead', 1),
  ('Follow up 3 days after a quote is sent', 'deal_stage_changed', 'create_task', 'email', 'Follow up on the quote', 3),
  ('Schedule delivery when a deal is won', 'deal_won', 'create_task', 'task', 'Schedule the delivery', 1);
update crm_automations a set stage_id = s.id
from crm_stages s join crm_pipelines p on p.id = s.pipeline_id
where a.trigger = 'deal_stage_changed' and p.is_default and s.position = 3;

-- ============================================================= Deliveries ====

create table dl_settings (
  id                    smallint primary key default 1 check (id = 1),
  depot_name            text not null default 'Warehouse',
  depot_address         text not null default '',
  depot_lat             double precision check (depot_lat between -90 and 90),
  depot_lng             double precision check (depot_lng between -180 and 180),
  default_start         time not null default '08:00',
  window_hours          smallint not null default 3 check (window_hours between 1 and 12),
  avg_speed_mph         smallint not null default 28 check (avg_speed_mph between 5 and 70),
  failure_reasons       text[] not null default array['Customer not home', 'Wrong address', 'Item damaged', 'Did not fit / access issue', 'Customer refused', 'Ran out of time', 'Other'],
  tracking_message      text not null default 'Our white-glove team will call about 30 minutes before arriving.',
  updated_at            timestamptz not null default now()
);
insert into dl_settings (id) values (1);

create table dl_trucks (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 80),
  plate          text check (char_length(plate) <= 20),
  capacity_stops smallint not null default 10 check (capacity_stops between 1 and 60),
  color          text not null default '#6366F1' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  notes          text check (char_length(notes) <= 1000),
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

create table dl_routes (
  id              uuid primary key default gen_random_uuid(),
  route_date      date not null,
  name            text not null check (char_length(name) between 1 and 80),
  truck_id        uuid references dl_trucks(id) on delete set null,
  driver_id       uuid references employees(id) on delete set null,
  helper_id       uuid references employees(id) on delete set null,
  status          text not null default 'planned' check (status in ('planned', 'dispatched', 'in_progress', 'completed')),
  start_time      time not null default '08:00',
  notes           text check (char_length(notes) <= 1000),
  distance_miles  numeric(8,1),
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index dl_routes_date_idx on dl_routes (route_date);
create index dl_routes_driver_idx on dl_routes (driver_id, route_date);

create sequence dl_order_number_seq start 5001;
create table dl_orders (
  id              uuid primary key default gen_random_uuid(),
  number          integer not null unique default nextval('dl_order_number_seq'),
  service_type    text not null default 'delivery' check (service_type in ('delivery', 'delivery_install', 'white_glove', 'pickup', 'return', 'service_call')),
  status          text not null default 'unscheduled' check (status in ('unscheduled', 'scheduled', 'en_route', 'arrived', 'delivered', 'failed', 'cancelled')),
  customer_name   text not null check (char_length(customer_name) between 1 and 160),
  phone           text check (char_length(phone) <= 40),
  email           text check (char_length(email) <= 254),
  address1        text not null check (char_length(address1) between 1 and 200),
  address2        text check (char_length(address2) <= 200),
  city            text check (char_length(city) <= 80),
  state           text check (char_length(state) <= 40),
  postal_code     text check (char_length(postal_code) <= 20),
  lat             double precision check (lat between -90 and 90),
  lng             double precision check (lng between -180 and 180),
  contact_id      uuid references crm_contacts(id) on delete set null,
  deal_id         uuid references crm_deals(id) on delete set null,
  scheduled_date  date,
  window_start    time,
  window_end      time,
  route_id        uuid references dl_routes(id) on delete set null,
  stop_order      integer,
  eta             timestamptz,
  duration_min    smallint not null default 30 check (duration_min between 5 and 480),
  priority        text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  instructions    text check (char_length(instructions) <= 2000),   -- shown to the driver
  internal_notes  text check (char_length(internal_notes) <= 2000),
  balance_due     numeric(12,2) not null default 0 check (balance_due >= 0),  -- to collect on delivery
  tracking_token  text not null unique default replace(gen_random_uuid()::text, '-', ''),
  arrived_at      timestamptz,
  completed_at    timestamptz,
  failed_reason   text check (char_length(failed_reason) <= 200),
  recipient_name  text check (char_length(recipient_name) <= 120),
  driver_notes    text check (char_length(driver_notes) <= 2000),
  created_by      uuid references employees(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (window_end is null or window_start is null or window_end > window_start)
);
create index dl_orders_date_idx on dl_orders (scheduled_date, status);
create index dl_orders_route_idx on dl_orders (route_id, stop_order);
create index dl_orders_status_idx on dl_orders (status, created_at desc);
create index dl_orders_contact_idx on dl_orders (contact_id);
create trigger dl_orders_updated before update on dl_orders for each row execute function set_updated_at();

create table dl_order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references dl_orders(id) on delete cascade,
  description  text not null check (char_length(description) between 1 and 200),
  sku          text check (char_length(sku) <= 60),
  quantity     smallint not null default 1 check (quantity between 1 and 999),
  assembly     boolean not null default false,
  delivered    boolean not null default false,
  notes        text check (char_length(notes) <= 500),
  position     integer not null default 0
);
create index dl_order_items_order_idx on dl_order_items (order_id, position);

-- Status history (also what the customer's tracking page shows).
create table dl_events (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references dl_orders(id) on delete cascade,
  status       text not null,
  note         text check (char_length(note) <= 500),
  actor_id     uuid references employees(id) on delete set null,
  actor_label  text,
  lat          double precision,
  lng          double precision,
  created_at   timestamptz not null default now()
);
create index dl_events_order_idx on dl_events (order_id, created_at);

-- Proof of delivery: a signature and/or photos, stored as small compressed images.
create table dl_proofs (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references dl_orders(id) on delete cascade,
  kind        text not null check (kind in ('signature', 'photo')),
  data_url    text not null check (char_length(data_url) <= 1500000 and data_url like 'data:image/%'),
  created_by  uuid references employees(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index dl_proofs_order_idx on dl_proofs (order_id);

-- ------------------------------------------------- lock everything down -----
do $$
declare t text;
begin
  foreach t in array array[
    'crm_settings','crm_pipelines','crm_stages','crm_companies','crm_contacts','crm_deals','crm_leads',
    'crm_activities','crm_products','crm_quotes','crm_quote_items','crm_automations','crm_email_templates',
    'dl_settings','dl_trucks','dl_routes','dl_orders','dl_order_items','dl_events','dl_proofs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on all sequences in schema public from anon, authenticated;
