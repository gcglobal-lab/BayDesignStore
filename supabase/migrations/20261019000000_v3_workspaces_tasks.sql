-- =============================================================================
-- Workflow ▸ Workspace (monday.com-style) and Team Tasks
-- =============================================================================
--   * Workspaces hold folders (which can nest) and boards. Existing boards move into a
--     "Main workspace"; their old text folder becomes a real folder.
--   * Favourites per person.
--   * New column types: dropdown (coloured options), people (several people), files
--     (uploads kept in Supabase Storage, listed in portal_files), timeline (date range).
--   * Team Tasks: tasks for anyone in the company, with several assignees, status,
--     priority, progress, checklist, comments, files and lists (projects).
-- =============================================================================

create table crm_workspaces (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 80),
  description  text check (char_length(description) <= 2000),
  color        text not null default '#E2445C' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  visibility   text not null default 'everyone' check (visibility in ('everyone', 'members')),
  position     integer not null default 0,
  archived     boolean not null default false,
  created_by   uuid references employees(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger crm_workspaces_updated before update on crm_workspaces for each row execute function set_updated_at();

create table crm_workspace_members (
  workspace_id  uuid not null references crm_workspaces(id) on delete cascade,
  employee_id   uuid not null references employees(id) on delete cascade,
  role          text not null default 'member' check (role in ('owner', 'member', 'viewer')),
  primary key (workspace_id, employee_id)
);

create table crm_folders (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references crm_workspaces(id) on delete cascade,
  parent_id     uuid references crm_folders(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  color         text not null default '#676879' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position      integer not null default 0,
  created_at    timestamptz not null default now()
);
create index crm_folders_ws_idx on crm_folders (workspace_id, parent_id, position);

alter table crm_boards add column if not exists workspace_id uuid references crm_workspaces(id) on delete cascade;
alter table crm_boards add column if not exists folder_id uuid references crm_folders(id) on delete set null;

-- Move existing boards into a Main workspace, turning text folders into folders.
do $$
declare ws uuid;
begin
  insert into crm_workspaces (name, color, position) values ('Main workspace', '#E2445C', 0) returning id into ws;
  insert into crm_folders (workspace_id, name, position)
    select ws, f, row_number() over (order by f) from (select distinct folder as f from crm_boards where folder is not null) x;
  update crm_boards b set workspace_id = ws, folder_id = (select id from crm_folders where workspace_id = ws and name = b.folder limit 1);
end $$;
alter table crm_boards alter column workspace_id set not null;
create index crm_boards_ws_idx on crm_boards (workspace_id, folder_id, position);

-- Favourites ("viewer" = employee id, or env-admin for the built-in administrator).
create table crm_favorites (
  viewer    text not null check (char_length(viewer) <= 64),
  board_id  uuid not null references crm_boards(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (viewer, board_id)
);

-- New column types.
alter table crm_board_columns drop constraint if exists crm_board_columns_type_check;
alter table crm_board_columns add constraint crm_board_columns_type_check
  check (type in ('text', 'long_text', 'number', 'currency', 'date', 'status', 'person', 'email', 'phone', 'link', 'checkbox', 'formula', 'dropdown', 'people', 'files', 'timeline'));

-- ================================================================== tasks ====

create table task_lists (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  color       text not null default '#1264A3' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position    integer not null default 0,
  archived    boolean not null default false,
  created_by  uuid references employees(id) on delete set null,
  created_at  timestamptz not null default now()
);

create sequence task_number_seq start 101;
create table tasks (
  id            uuid primary key default gen_random_uuid(),
  number        integer not null unique default nextval('task_number_seq'),
  title         text not null check (char_length(title) between 1 and 200),
  description   text check (char_length(description) <= 10000),
  status        text not null default 'todo' check (status in ('todo', 'in_progress', 'review', 'blocked', 'done')),
  priority      text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  progress      smallint not null default 0 check (progress between 0 and 100),
  start_date    date,
  due_date      date,
  list_id       uuid references task_lists(id) on delete set null,
  assignee_ids  uuid[] not null default '{}',
  created_by    uuid references employees(id) on delete set null,
  creator_name  text,
  position      double precision not null default 0,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (due_date is null or start_date is null or due_date >= start_date)
);
create index tasks_status_idx on tasks (status, due_date);
create index tasks_assignees_idx on tasks using gin (assignee_ids);
create index tasks_creator_idx on tasks (created_by);
create trigger tasks_updated before update on tasks for each row execute function set_updated_at();

create table task_checklist (
  id        uuid primary key default gen_random_uuid(),
  task_id   uuid not null references tasks(id) on delete cascade,
  text      text not null check (char_length(text) between 1 and 300),
  done      boolean not null default false,
  position  integer not null default 0
);
create index task_checklist_task_idx on task_checklist (task_id, position);

create table task_comments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references tasks(id) on delete cascade,
  kind         text not null default 'comment' check (kind in ('comment', 'log')),
  body         text not null check (char_length(body) between 1 and 5000),
  author_id    uuid references employees(id) on delete set null,
  author_name  text,
  created_at   timestamptz not null default now()
);
create index task_comments_task_idx on task_comments (task_id, created_at desc);

-- ================================================================== files ====
-- Files attached to board cells and tasks. The bytes live in the private Storage bucket
-- "portal-files"; only the server (service role) can read or write them.

create table portal_files (
  id             uuid primary key default gen_random_uuid(),
  board_id       uuid references crm_boards(id) on delete cascade,
  item_id        uuid references crm_board_items(id) on delete cascade,
  column_id      uuid references crm_board_columns(id) on delete cascade,
  task_id        uuid references tasks(id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 200),
  mime           text not null default 'application/octet-stream',
  size           integer not null check (size >= 0),
  path           text not null unique,
  uploaded_by    uuid references employees(id) on delete set null,
  uploader_name  text,
  created_at     timestamptz not null default now()
);
create index portal_files_item_idx on portal_files (item_id, column_id);
create index portal_files_task_idx on portal_files (task_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('portal-files', 'portal-files', false, 26214400)
on conflict (id) do nothing;

do $$
declare t text;
begin
  foreach t in array array['crm_workspaces','crm_workspace_members','crm_folders','crm_favorites','task_lists','tasks','task_checklist','task_comments','portal_files'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on all sequences in schema public from anon, authenticated;
