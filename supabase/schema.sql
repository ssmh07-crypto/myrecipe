create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz default now()
);

alter table public.profiles
add column if not exists display_name text;

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  title text not null,
  servings integer,
  image_url text,
  ingredients jsonb default '[]'::jsonb,
  seasonings jsonb default '[]'::jsonb,
  steps_text text,
  memo text,
  source_url text,
  source_type text default 'manual' not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.recipes add column if not exists servings integer;
alter table public.recipes add column if not exists image_url text;
alter table public.recipes add column if not exists ingredients jsonb default '[]'::jsonb;
alter table public.recipes add column if not exists seasonings jsonb default '[]'::jsonb;
alter table public.recipes add column if not exists steps_text text;
alter table public.recipes add column if not exists memo text;
alter table public.recipes add column if not exists source_url text;
alter table public.recipes add column if not exists source_type text default 'manual';
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

alter table public.recipes
alter column source_type set default 'manual';

alter table public.recipes
alter column source_type set not null;

alter table public.recipes
drop constraint if exists recipes_source_type_check;

alter table public.recipes
add constraint recipes_source_type_check
check (source_type in ('manual', 'imported'));

alter table public.recipes drop column if exists description;
alter table public.recipes drop column if exists cooking_time;
alter table public.recipes drop column if exists difficulty;
alter table public.recipes drop column if exists steps;
alter table public.recipes drop column if exists tips;
alter table public.recipes drop column if exists tags;
alter table public.recipes drop column if exists personal_note;
alter table public.recipes drop column if exists next_time_note;
alter table public.recipes drop column if exists youtube_video_id;
alter table public.recipes drop column if exists is_favorite;

create table if not exists public.recipe_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.recipe_folder_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  folder_id uuid references public.recipe_folders(id) on delete cascade not null,
  recipe_id uuid references public.recipes(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (folder_id, recipe_id)
);

alter table public.recipe_folder_items
drop constraint if exists recipe_folder_items_folder_id_recipe_id_key;

alter table public.recipe_folder_items
add constraint recipe_folder_items_folder_id_recipe_id_key unique (folder_id, recipe_id);

drop table if exists public.ai_suggestions;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

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
$$ language plpgsql security definer;

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

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

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
with check (auth.uid() = user_id);

drop policy if exists "recipe_folder_items_delete_own" on public.recipe_folder_items;
create policy "recipe_folder_items_delete_own"
on public.recipe_folder_items for delete
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', true)
on conflict (id) do update set public = true;

drop policy if exists "recipe_images_public_read" on storage.objects;
create policy "recipe_images_public_read"
on storage.objects for select
using (bucket_id = 'recipe-images');

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

notify pgrst, 'reload schema';
