-- =============================================================================
-- Website inquiries and newsletter sign-ups
-- =============================================================================
--   * inquiries: every "Send Message" from the website's contact form, shown in
--     Bay Design Base ▸ Inquiries. An email alert is also sent (Resend); whether
--     it went out is recorded so nothing is lost if email fails.
--   * newsletter_subscribers: emails from the footer sign-up box.
--   Like every other table, only the server (service-role key) can read or write.
-- =============================================================================

create type inquiry_status as enum ('new', 'read', 'replied', 'archived');

create table inquiries (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 120),
  email         text not null check (char_length(email) <= 254),
  phone         text check (char_length(phone) <= 40),
  interest      text check (char_length(interest) <= 80),
  message       text not null check (char_length(message) between 1 and 5000),
  status        inquiry_status not null default 'new',
  page          text check (char_length(page) <= 200),
  ip            text,
  user_agent    text,
  email_sent    boolean not null default false,
  email_error   text,
  handled_by    uuid references employees(id) on delete set null,
  handled_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index inquiries_status_idx on inquiries (status, created_at desc);
create index inquiries_ip_idx on inquiries (ip, created_at desc);

create table newsletter_subscribers (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (char_length(email) <= 254),
  ip          text,
  created_at  timestamptz not null default now()
);
create unique index newsletter_subscribers_email_key on newsletter_subscribers (lower(email));

do $$
declare t text;
begin
  foreach t in array array['inquiries', 'newsletter_subscribers'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
