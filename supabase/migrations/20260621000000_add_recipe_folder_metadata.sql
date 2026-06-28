alter table public.recipe_folders
  add column if not exists description text,
  add column if not exists sort_order integer not null default 0;

with ranked_folders as (
  select
    id,
    row_number() over (partition by user_id order by created_at, id) - 1 as position
  from public.recipe_folders
)
update public.recipe_folders as folders
set sort_order = ranked_folders.position
from ranked_folders
where folders.id = ranked_folders.id;

alter table public.recipe_folders
  drop constraint if exists recipe_folders_description_length_check;

alter table public.recipe_folders
  add constraint recipe_folders_description_length_check
  check (description is null or char_length(description) <= 500);

create index if not exists recipe_folders_user_sort_idx
  on public.recipe_folders (user_id, sort_order, created_at);
