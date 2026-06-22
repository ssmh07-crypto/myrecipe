create table if not exists public.recipe_import_cache (
  cache_key text not null,
  pipeline_version text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (cache_key, pipeline_version),
  constraint recipe_import_cache_key_length check (char_length(cache_key) = 64),
  constraint recipe_import_cache_version_length check (char_length(pipeline_version) between 1 and 64),
  constraint recipe_import_cache_result_object check (jsonb_typeof(result) = 'object')
);

alter table public.recipe_import_cache enable row level security;

revoke all on public.recipe_import_cache from public, anon, authenticated;
grant select, insert, update on public.recipe_import_cache to service_role;

notify pgrst, 'reload schema';
