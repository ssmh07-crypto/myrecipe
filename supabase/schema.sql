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
  description text,
  image_url text,
  servings integer,
  cooking_time text,
  difficulty text,
  ingredients jsonb default '[]'::jsonb,
  seasonings jsonb default '[]'::jsonb,
  steps jsonb default '[]'::jsonb,
  tips jsonb default '[]'::jsonb,
  tags text[] default '{}',
  personal_note text,
  next_time_note text,
  source_url text,
  source_type text,
  youtube_video_id text,
  is_favorite boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  recipe_id uuid references public.recipes(id) on delete cascade,
  request_text text not null,
  suggestion jsonb not null,
  created_at timestamptz default now()
);

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
alter table public.ai_suggestions enable row level security;

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

drop policy if exists "ai_suggestions_select_own" on public.ai_suggestions;
create policy "ai_suggestions_select_own"
on public.ai_suggestions for select
using (auth.uid() = user_id);

drop policy if exists "ai_suggestions_insert_own" on public.ai_suggestions;
create policy "ai_suggestions_insert_own"
on public.ai_suggestions for insert
with check (auth.uid() = user_id);

drop policy if exists "ai_suggestions_delete_own" on public.ai_suggestions;
create policy "ai_suggestions_delete_own"
on public.ai_suggestions for delete
using (auth.uid() = user_id);
