-- =============================================================================
-- Bay Design Base V2 — admin-managed passwords, readable activity, chat inquiries
-- =============================================================================
--   * Passwords are created and changed only by an admin. Besides the scrypt hash
--     used to sign in, an encrypted copy (AES-256-GCM, key only on the server) is
--     kept so an admin can look up a team member's current password.
--     Nobody is asked to pick their own password any more.
--   * audit_log.summary: one readable sentence per activity ("Hemant Singh punched
--     in at Uptown"), shown in Settings ▸ Recent activity.
--   * inquiries.source: where an inquiry came from (contact form, website chat,
--     Base assistant).
--   * Extra indexes for the busiest queries.
-- =============================================================================

alter table employees add column if not exists password_secret text;
alter table employees alter column must_change_password set default false;
update employees set must_change_password = false where must_change_password;

alter table audit_log add column if not exists summary text check (char_length(summary) <= 500);
create index if not exists audit_log_actor_idx on audit_log (actor_id, created_at desc);
create index if not exists audit_log_action_idx on audit_log (action, created_at desc);

alter table inquiries add column if not exists source text not null default 'contact_form'
  check (source in ('contact_form', 'website_chat', 'base_chat'));

create index if not exists time_entries_open_idx on time_entries (clock_in_at) where clock_out_at is null;
create index if not exists time_entries_clock_out_idx on time_entries (clock_out_at);
create index if not exists time_off_dates_idx on time_off_requests (starts_on, ends_on);
