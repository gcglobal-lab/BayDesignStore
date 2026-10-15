-- =============================================================================
-- Deliveries — post-delivery
-- =============================================================================
--   * Customers rate the delivery (1–5 stars + comment) on their tracking page once it's done.
--   * The office follows up after delivery (or after a problem) and records the outcome.
-- =============================================================================

alter table dl_orders add column if not exists rating smallint check (rating between 1 and 5);
alter table dl_orders add column if not exists feedback text check (char_length(feedback) <= 2000);
alter table dl_orders add column if not exists feedback_at timestamptz;
alter table dl_orders add column if not exists followup_status text not null default 'pending'
  check (followup_status in ('pending', 'done', 'issue'));
alter table dl_orders add column if not exists followup_note text check (char_length(followup_note) <= 2000);
alter table dl_orders add column if not exists followup_at timestamptz;
alter table dl_orders add column if not exists followup_by uuid references employees(id) on delete set null;

create index if not exists dl_orders_completed_idx on dl_orders (completed_at desc) where status in ('delivered', 'failed');
create index if not exists dl_orders_rating_idx on dl_orders (feedback_at desc) where rating is not null;
