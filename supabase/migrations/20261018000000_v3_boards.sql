-- =============================================================================
-- Workflow ▸ Boards (monday.com-style work boards)
-- =============================================================================
--   A board has groups (e.g. one per designer), items in each group (e.g. a client or a
--   sales order), and sub-items under an item (e.g. the pieces on that order). Columns are
--   defined per board — text, numbers, money, dates, status labels, people, formulas… —
--   and every cell value is stored in the item's `values` (column id → value).
--   Boards live in folders; each board has members (editors / viewers) unless it's open to
--   everyone with Workflow access. Admins and Workflow managers can open and manage all boards.
-- =============================================================================

create table crm_boards (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 120),
  description  text check (char_length(description) <= 5000),
  folder       text check (char_length(folder) <= 80),
  color        text not null default '#6366F1' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  visibility   text not null default 'everyone' check (visibility in ('everyone', 'members')),
  item_label   text not null default 'Item' check (char_length(item_label) between 1 and 40),     -- what a row is called ("Client", "Sales order")
  group_label  text not null default 'Group' check (char_length(group_label) between 1 and 40),   -- what a group is called ("Designer")
  position     integer not null default 0,
  archived     boolean not null default false,
  created_by   uuid references employees(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger crm_boards_updated before update on crm_boards for each row execute function set_updated_at();

create table crm_board_members (
  board_id     uuid not null references crm_boards(id) on delete cascade,
  employee_id  uuid not null references employees(id) on delete cascade,
  role         text not null default 'editor' check (role in ('editor', 'viewer')),
  primary key (board_id, employee_id)
);

create table crm_board_columns (
  id        uuid primary key default gen_random_uuid(),
  board_id  uuid not null references crm_boards(id) on delete cascade,
  scope     text not null default 'item' check (scope in ('item', 'subitem')),
  name      text not null check (char_length(name) between 1 and 60),
  type      text not null check (type in ('text', 'long_text', 'number', 'currency', 'date', 'status', 'person', 'email', 'phone', 'link', 'checkbox', 'formula')),
  settings  jsonb not null default '{}'::jsonb,   -- status: {labels:[{id,label,color}]}; formula: {op,a,b}
  width     smallint not null default 160 check (width between 60 and 600),
  position  integer not null default 0
);
create index crm_board_columns_board_idx on crm_board_columns (board_id, scope, position);

create table crm_board_groups (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references crm_boards(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  color       text not null default '#6366F1' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  employee_id uuid references employees(id) on delete set null,   -- optional: the designer this group is for
  position    integer not null default 0
);
create index crm_board_groups_board_idx on crm_board_groups (board_id, position);

create table crm_board_items (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references crm_boards(id) on delete cascade,
  group_id     uuid not null references crm_board_groups(id) on delete cascade,
  parent_id    uuid references crm_board_items(id) on delete cascade,   -- set = sub-item
  name         text not null check (char_length(name) between 1 and 200),
  description  text check (char_length(description) <= 10000),
  values       jsonb not null default '{}'::jsonb,
  contact_id   uuid references crm_contacts(id) on delete set null,
  position     double precision not null default 0,
  created_by   uuid references employees(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index crm_board_items_board_idx on crm_board_items (board_id, group_id, position);
create index crm_board_items_parent_idx on crm_board_items (parent_id, position);
create trigger crm_board_items_updated before update on crm_board_items for each row execute function set_updated_at();

-- Comments on an item, plus short automatic lines ("Status: Paid").
create table crm_board_updates (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references crm_board_items(id) on delete cascade,
  kind         text not null default 'comment' check (kind in ('comment', 'log')),
  body         text not null check (char_length(body) between 1 and 5000),
  author_id    uuid references employees(id) on delete set null,
  author_name  text,
  created_at   timestamptz not null default now()
);
create index crm_board_updates_item_idx on crm_board_updates (item_id, created_at desc);

-- Atomic single-cell update (no lost edits when two people type in the same row).
create or replace function crm_board_set_value(p_item uuid, p_column text, p_value jsonb)
returns void language sql as $$
  update crm_board_items
     set values = case when p_value is null or p_value = 'null'::jsonb then values - p_column else values || jsonb_build_object(p_column, p_value) end
   where id = p_item;
$$;
revoke execute on function crm_board_set_value(uuid, text, jsonb) from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['crm_boards','crm_board_members','crm_board_columns','crm_board_groups','crm_board_items','crm_board_updates'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
