-- Baseline captured from the production schema before CLI migration tracking.
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz default now()
);

alter table public.profiles
add column if not exists display_name text;

alter table public.profiles add column if not exists plan text default 'free';
alter table public.profiles add column if not exists premium_started_at timestamptz;
alter table public.profiles add column if not exists premium_expires_at timestamptz;

update public.profiles
set plan = 'free'
where plan is null or plan = '';

alter table public.profiles
drop constraint if exists profiles_plan_check;

alter table public.profiles
add constraint profiles_plan_check
check (plan in ('free', 'premium'));

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  title text not null,
  servings integer,
  difficulty text default '쉬움',
  image_url text,
  image_path text,
  ingredients jsonb default '[]'::jsonb,
  seasonings jsonb default '[]'::jsonb,
  steps_text text,
  step_images jsonb default '[]'::jsonb,
  step_image_paths jsonb default '[]'::jsonb,
  memo text,
  source_url text,
  source_type text default 'manual' not null,
  is_favorite boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.recipes add column if not exists servings integer;
alter table public.recipes add column if not exists difficulty text default '쉬움';
alter table public.recipes add column if not exists image_url text;
alter table public.recipes add column if not exists image_path text;
alter table public.recipes add column if not exists ingredients jsonb default '[]'::jsonb;
alter table public.recipes add column if not exists seasonings jsonb default '[]'::jsonb;
alter table public.recipes add column if not exists steps_text text;
alter table public.recipes add column if not exists step_images jsonb default '[]'::jsonb;
alter table public.recipes add column if not exists step_image_paths jsonb default '[]'::jsonb;
alter table public.recipes add column if not exists memo text;
alter table public.recipes add column if not exists source_url text;
alter table public.recipes add column if not exists source_type text default 'manual';
alter table public.recipes add column if not exists is_favorite boolean default false;
alter table public.recipes add column if not exists updated_at timestamptz default now();

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recipes' and column_name = 'steps'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'recipes' and column_name = 'steps' and data_type = 'jsonb'
    ) then
      execute $sql$
        update public.recipes
        set steps_text = array_to_string(array(select jsonb_array_elements_text(steps)), E'\n')
        where steps_text is null and jsonb_typeof(coalesce(steps, '[]'::jsonb)) = 'array'
      $sql$;
    else
      execute $sql$
        update public.recipes
        set steps_text = array_to_string(steps, E'\n')
        where steps_text is null
      $sql$;
    end if;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recipes' and column_name = 'personal_note'
  ) then
    execute $sql$
      update public.recipes
      set memo = trim(both E'\n' from concat_ws(E'\n', personal_note, next_time_note))
      where memo is null and (personal_note is not null or next_time_note is not null)
    $sql$;
  end if;
end $$;

update public.recipes
set source_type = 'imported'
where source_type in ('url', 'youtube', 'text');

update public.recipes
set source_type = 'manual'
where source_type is null or source_type = '';

update public.recipes set difficulty = 'Easy' where difficulty = '쉬움' or difficulty is null or difficulty = '';
update public.recipes set difficulty = 'Medium' where difficulty = '보통';
update public.recipes set difficulty = 'Hard' where difficulty = '어려움';

update public.recipes
set image_path = split_part(image_url, '/storage/v1/object/public/recipe-images/', 2),
    image_url = null
where image_path is null
  and image_url like '%/storage/v1/object/public/recipe-images/%';

update public.recipes
set step_image_paths = (
      select coalesce(jsonb_agg(
        case
          when value like '%/storage/v1/object/public/recipe-images/%'
            then to_jsonb(split_part(value, '/storage/v1/object/public/recipe-images/', 2))
          else '""'::jsonb
        end order by ordinality
      ), '[]'::jsonb)
      from jsonb_array_elements_text(coalesce(step_images, '[]'::jsonb)) with ordinality
    ),
    step_images = (
      select coalesce(jsonb_agg(
        case
          when value like '%/storage/v1/object/public/recipe-images/%' then '""'::jsonb
          else to_jsonb(value)
        end order by ordinality
      ), '[]'::jsonb)
      from jsonb_array_elements_text(coalesce(step_images, '[]'::jsonb)) with ordinality
    )
where jsonb_typeof(coalesce(step_images, '[]'::jsonb)) = 'array'
  and exists (
    select 1
    from jsonb_array_elements_text(coalesce(step_images, '[]'::jsonb)) as image(value)
    where value like '%/storage/v1/object/public/recipe-images/%'
  );

alter table public.recipes
alter column source_type set default 'manual';

alter table public.recipes
alter column source_type set not null;

alter table public.recipes
drop constraint if exists recipes_source_type_check;

alter table public.recipes
add constraint recipes_source_type_check
check (source_type in ('manual', 'imported'));

alter table public.recipes drop constraint if exists recipes_content_check;
alter table public.recipes add constraint recipes_content_check check (
  char_length(trim(title)) between 1 and 200
  and servings between 1 and 100
  and difficulty in ('Easy', 'Medium', 'Hard')
  and jsonb_typeof(ingredients) = 'array'
  and jsonb_typeof(seasonings) = 'array'
  and jsonb_typeof(step_images) = 'array'
  and jsonb_typeof(step_image_paths) = 'array'
  and char_length(coalesce(steps_text, '')) <= 50000
  and char_length(coalesce(memo, '')) <= 10000
) not valid;

alter table public.recipes drop column if exists description;
alter table public.recipes drop column if exists cooking_time;
alter table public.recipes drop column if exists steps;
alter table public.recipes drop column if exists tips;
alter table public.recipes drop column if exists tags;
alter table public.recipes drop column if exists personal_note;
alter table public.recipes drop column if exists next_time_note;
alter table public.recipes drop column if exists youtube_video_id;

create table if not exists public.recipe_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  name text not null,
  image_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.recipe_folders add column if not exists image_url text;

alter table public.recipe_folders drop constraint if exists recipe_folders_name_check;
alter table public.recipe_folders add constraint recipe_folders_name_check
check (char_length(trim(name)) between 1 and 100) not valid;

create table if not exists public.recipe_folder_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  folder_id uuid references public.recipe_folders(id) on delete cascade not null,
  recipe_id uuid references public.recipes(id) on delete cascade not null,
  created_at timestamptz default now()
);

alter table public.recipes drop constraint if exists recipes_user_id_fkey;
alter table public.recipes add constraint recipes_user_id_fkey
foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.recipe_folders drop constraint if exists recipe_folders_user_id_fkey;
alter table public.recipe_folders add constraint recipe_folders_user_id_fkey
foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.recipe_folder_items drop constraint if exists recipe_folder_items_user_id_fkey;
alter table public.recipe_folder_items add constraint recipe_folder_items_user_id_fkey
foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.recipe_folder_items
drop constraint if exists recipe_folder_items_folder_id_recipe_id_key;

delete from public.recipe_folder_items a
using public.recipe_folder_items b
where a.id > b.id
  and a.user_id = b.user_id
  and a.recipe_id = b.recipe_id;

alter table public.recipe_folder_items
add constraint recipe_folder_items_folder_id_recipe_id_key unique (user_id, recipe_id);

drop table if exists public.ai_suggestions;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = '';

drop trigger if exists recipes_set_updated_at on public.recipes;
create trigger recipes_set_updated_at
before update on public.recipes
for each row execute function public.set_updated_at();

drop trigger if exists recipe_folders_set_updated_at on public.recipe_folders;
create trigger recipe_folders_set_updated_at
before update on public.recipe_folders
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_folders enable row level security;
alter table public.recipe_folder_items enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

drop policy if exists "recipes_select_own" on public.recipes;
create policy "recipes_select_own"
on public.recipes for select
using (auth.uid() = user_id);

drop policy if exists "recipes_insert_own" on public.recipes;
create policy "recipes_insert_own"
on public.recipes for insert
with check (auth.uid() = user_id);

drop policy if exists "recipes_update_own" on public.recipes;
create policy "recipes_update_own"
on public.recipes for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "recipes_delete_own" on public.recipes;
create policy "recipes_delete_own"
on public.recipes for delete
using (auth.uid() = user_id);

drop policy if exists "recipe_folders_select_own" on public.recipe_folders;
create policy "recipe_folders_select_own"
on public.recipe_folders for select
using (auth.uid() = user_id);

drop policy if exists "recipe_folders_insert_own" on public.recipe_folders;
create policy "recipe_folders_insert_own"
on public.recipe_folders for insert
with check (auth.uid() = user_id);

drop policy if exists "recipe_folders_update_own" on public.recipe_folders;
create policy "recipe_folders_update_own"
on public.recipe_folders for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "recipe_folders_delete_own" on public.recipe_folders;
create policy "recipe_folders_delete_own"
on public.recipe_folders for delete
using (auth.uid() = user_id);

drop policy if exists "recipe_folder_items_select_own" on public.recipe_folder_items;
create policy "recipe_folder_items_select_own"
on public.recipe_folder_items for select
using (auth.uid() = user_id);

drop policy if exists "recipe_folder_items_insert_own" on public.recipe_folder_items;
create policy "recipe_folder_items_insert_own"
on public.recipe_folder_items for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.recipe_folders as owned_folder
    where owned_folder.id = recipe_folder_items.folder_id
      and owned_folder.user_id = auth.uid()
  )
  and exists (
    select 1 from public.recipes as owned_recipe
    where owned_recipe.id = recipe_folder_items.recipe_id
      and owned_recipe.user_id = auth.uid()
  )
);

drop policy if exists "recipe_folder_items_delete_own" on public.recipe_folder_items;
create policy "recipe_folder_items_delete_own"
on public.recipe_folder_items for delete
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', false)
on conflict (id) do update set public = false;

drop policy if exists "recipe_images_public_read" on storage.objects;
drop policy if exists "recipe_images_select_own" on storage.objects;
create policy "recipe_images_select_own"
on storage.objects for select
using (
  bucket_id = 'recipe-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "recipe_images_insert_own" on storage.objects;
create policy "recipe_images_insert_own"
on storage.objects for insert
with check (
  bucket_id = 'recipe-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "recipe_images_update_own" on storage.objects;
create policy "recipe_images_update_own"
on storage.objects for update
using (
  bucket_id = 'recipe-images'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'recipe-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "recipe_images_delete_own" on storage.objects;
create policy "recipe_images_delete_own"
on storage.objects for delete
using (
  bucket_id = 'recipe-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create table if not exists public.meal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  client_id text not null,
  meal_date date not null,
  entry_type text not null,
  recipe_id uuid references public.recipes(id) on delete set null,
  title text not null,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint meal_entries_entry_type_check check (entry_type in ('recipe', 'manual')),
  constraint meal_entries_user_client_key unique (user_id, client_id)
);

alter table public.meal_entries drop constraint if exists meal_entries_content_check;
alter table public.meal_entries add constraint meal_entries_content_check check (
  char_length(client_id) between 1 and 100
  and char_length(trim(title)) between 1 and 200
  and char_length(coalesce(note, '')) <= 2000
) not valid;

create index if not exists meal_entries_user_date_idx
on public.meal_entries (user_id, meal_date);

drop trigger if exists meal_entries_set_updated_at on public.meal_entries;
create trigger meal_entries_set_updated_at
before update on public.meal_entries
for each row execute function public.set_updated_at();

alter table public.meal_entries enable row level security;

drop policy if exists "meal_entries_select_own" on public.meal_entries;
create policy "meal_entries_select_own"
on public.meal_entries for select
using (auth.uid() = user_id);

drop policy if exists "meal_entries_insert_own" on public.meal_entries;
create policy "meal_entries_insert_own"
on public.meal_entries for insert
with check (
  auth.uid() = user_id
  and (
    recipe_id is null
    or exists (
      select 1 from public.recipes as owned_recipe
      where owned_recipe.id = meal_entries.recipe_id
        and owned_recipe.user_id = auth.uid()
    )
  )
);

drop policy if exists "meal_entries_update_own" on public.meal_entries;
create policy "meal_entries_update_own"
on public.meal_entries for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and (
    recipe_id is null
    or exists (
      select 1 from public.recipes as owned_recipe
      where owned_recipe.id = meal_entries.recipe_id
        and owned_recipe.user_id = auth.uid()
    )
  )
);

drop policy if exists "meal_entries_delete_own" on public.meal_entries;
create policy "meal_entries_delete_own"
on public.meal_entries for delete
using (auth.uid() = user_id);

create index if not exists recipes_user_created_idx on public.recipes (user_id, created_at desc);
create index if not exists recipe_folders_user_created_idx on public.recipe_folders (user_id, created_at);
create index if not exists recipe_folder_items_user_recipe_idx on public.recipe_folder_items (user_id, recipe_id);

create table if not exists public.recipe_import_usage (
  id bigint generated by default as identity primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz not null default now()
);

create index if not exists recipe_import_usage_user_created_idx
on public.recipe_import_usage (user_id, created_at desc);

alter table public.recipe_import_usage enable row level security;
revoke all on public.recipe_import_usage from anon, authenticated;

create or replace function public.consume_recipe_import_quota(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  daily_count integer;
  monthly_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select count(*) filter (where created_at >= now() - interval '1 day'),
         count(*) filter (where created_at >= now() - interval '30 days')
    into daily_count, monthly_count
  from public.recipe_import_usage
  where user_id = p_user_id
    and created_at >= now() - interval '30 days';

  if daily_count >= 10 then return 'daily_limit'; end if;
  if monthly_count >= 100 then return 'monthly_limit'; end if;

  insert into public.recipe_import_usage (user_id) values (p_user_id);
  return 'ok';
end;
$$;

revoke all on function public.consume_recipe_import_quota(uuid) from public, anon, authenticated;
grant execute on function public.consume_recipe_import_quota(uuid) to service_role;

notify pgrst, 'reload schema';
