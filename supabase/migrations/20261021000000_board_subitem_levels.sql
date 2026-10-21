-- Boards: each sub-item level has its own columns.
--
-- Until now sub-items (at every depth) showed the table's own columns, so adding or deleting a
-- column in a sub-item table changed the parent table too. Now sub-item columns carry a `level`
-- (1 = sub-items, 2 = their sub-items, …) and each level is set up independently.
--
-- Existing sub-items keep what they show: every level that already has sub-items gets copies of
-- the table's columns, and those sub-items' values (and files) move to the copies.

alter table crm_board_columns add column if not exists level smallint not null default 1 check (level between 1 and 20);
drop index if exists crm_board_columns_board_idx;
create index if not exists crm_board_columns_board_idx on crm_board_columns (board_id, scope, level, position);

do $$
declare
  lv record;
  src record;
  new_id uuid;
begin
  create temp table _depth on commit drop as
    with recursive t as (
      select id, board_id, 0 as depth from crm_board_items where parent_id is null
      union all
      select i.id, i.board_id, t.depth + 1 from crm_board_items i join t on i.parent_id = t.id
    )
    select id, board_id, depth from t where depth > 0;
  create temp table _map (board_id uuid, depth int, old_id uuid, new_id uuid) on commit drop;

  for lv in select distinct board_id, depth from _depth where depth <= 20 order by board_id, depth loop
    continue when exists (select 1 from crm_board_columns where board_id = lv.board_id and scope = 'subitem' and level = lv.depth);
    for src in
      select * from crm_board_columns
       where board_id = lv.board_id and scope = 'item' and not (type = 'formula' and settings->>'op' = 'subitems_sum')
       order by position
    loop
      insert into crm_board_columns (board_id, scope, level, name, type, settings, width, position)
      values (lv.board_id, 'subitem', lv.depth, src.name, src.type, src.settings, src.width, src.position)
      returning id into new_id;
      insert into _map values (lv.board_id, lv.depth, src.id, new_id);

      update crm_board_items
         set values = (values - src.id::text) || jsonb_build_object(new_id::text, values -> src.id::text)
       where id in (select id from _depth where board_id = lv.board_id and depth = lv.depth)
         and values ? src.id::text;
      update portal_files
         set column_id = new_id
       where column_id = src.id
         and item_id in (select id from _depth where board_id = lv.board_id and depth = lv.depth);
    end loop;

    -- Copied formulas point at the copies on their own level.
    update crm_board_columns c
       set settings = c.settings
         || coalesce((select jsonb_build_object('a', m.new_id) from _map m where m.board_id = lv.board_id and m.depth = lv.depth and m.old_id::text = c.settings->>'a'), '{}'::jsonb)
         || coalesce((select jsonb_build_object('b', m.new_id) from _map m where m.board_id = lv.board_id and m.depth = lv.depth and m.old_id::text = c.settings->>'b'), '{}'::jsonb)
     where c.board_id = lv.board_id and c.scope = 'subitem' and c.level = lv.depth and c.type = 'formula';
  end loop;
end $$;
