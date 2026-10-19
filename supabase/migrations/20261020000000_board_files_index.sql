-- Board pages load their attached files by board.
create index if not exists portal_files_board_idx on public.portal_files (board_id);
