create or replace function public.reorder_recipe_folders(p_folder_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  folder_count integer;
begin
  if auth.uid() is null
    or coalesce(cardinality(p_folder_ids), 0) > 100
    or cardinality(p_folder_ids) <> (
      select count(distinct folder_id)
      from unnest(p_folder_ids) as requested(folder_id)
    )
  then
    raise exception 'invalid folder order';
  end if;

  select count(*) into folder_count
  from public.recipe_folders
  where user_id = auth.uid();

  if folder_count <> coalesce(cardinality(p_folder_ids), 0)
    or folder_count <> (
      select count(*)
      from public.recipe_folders
      where user_id = auth.uid() and id = any(p_folder_ids)
    )
  then
    raise exception 'folder order must contain every owned folder exactly once';
  end if;

  update public.recipe_folders as folders
  set sort_order = requested.position - 1
  from unnest(p_folder_ids) with ordinality as requested(folder_id, position)
  where folders.id = requested.folder_id
    and folders.user_id = auth.uid();
end;
$$;

revoke all on function public.reorder_recipe_folders(uuid[]) from public, anon;
grant execute on function public.reorder_recipe_folders(uuid[]) to authenticated;

notify pgrst, 'reload schema';
