-- Auto-cleanup: homework + files + overrides older than 8 weeks.
-- Safe: never touches current ±6 week window. Run once in SQL Editor.

alter table public.app_meta
  add column if not exists last_cleanup_at timestamptz;

create or replace function public._hw_storage_refs_from_row(h homework)
returns table(bucket_id text, object_path text)
language plpgsql
stable
as $$
declare
  u text;
  m text[];
  elem jsonb;
begin
  foreach u in array coalesce(h.images, '{}'::text[])
  loop
    m := regexp_match(u, '/storage/v1/object/public/(hw-files|hw-photos)/(.+)$');
    if m is not null then
      bucket_id := m[1];
      object_path := m[2];
      return next;
    end if;
  end loop;

  begin
    for elem in select * from jsonb_array_elements(coalesce(h.attachments, '[]'::jsonb))
    loop
      u := elem->>'url';
      if u is null then continue; end if;
      m := regexp_match(u, '/storage/v1/object/public/(hw-files|hw-photos)/(.+)$');
      if m is not null then
        bucket_id := m[1];
        object_path := m[2];
        return next;
      end if;
    end loop;
  exception when others then
    null;
  end;
end;
$$;

-- Core delete. p_weeks fixed floor 8 for auto; admin may pass 8..26.
create or replace function public._rasp_run_cleanup(p_weeks int)
returns json
language plpgsql
security definer
set search_path = public, storage, extensions
as $$
declare
  v_weeks int;
  v_cut date;
  v_hw int := 0;
  v_ovr int := 0;
  v_files int := 0;
  r record;
begin
  -- Never tighter than 8 weeks (UI allows ±6).
  v_weeks := greatest(8, least(coalesce(p_weeks, 8), 26));
  v_cut := (current_date - (v_weeks * 7));

  for r in
    select distinct f.bucket_id, f.object_path
    from homework h
    cross join lateral public._hw_storage_refs_from_row(h) f
    where (h.due_date is not null and h.due_date < v_cut)
       or (h.due_date is null and h.created_at::date < v_cut)
  loop
    delete from storage.objects o
    where o.bucket_id = r.bucket_id and o.name = r.object_path;
    if found then v_files := v_files + 1; end if;
  end loop;

  delete from homework h
  where (h.due_date is not null and h.due_date < v_cut)
     or (h.due_date is null and h.created_at::date < v_cut);
  get diagnostics v_hw = row_count;

  delete from overrides o
  where o.on_date < v_cut;
  get diagnostics v_ovr = row_count;

  begin
    delete from public.hw_upload_tickets
    where expires_at < now() - interval '1 day'
       or (used = true and created_at < now() - interval '1 day');
  exception when undefined_table then
    null;
  end;

  update public.app_meta
  set last_cleanup_at = now()
  where id = 'main';

  begin
    insert into audit_log(action, group_id, detail, actor_role)
    values (
      'cleanup_old',
      null,
      format('weeks=%s cut=%s hw=%s ovr=%s files=%s', v_weeks, v_cut, v_hw, v_ovr, v_files),
      'system'
    );
  exception when others then
    null;
  end;

  return json_build_object(
    'ok', true,
    'skipped', false,
    'weeks', v_weeks,
    'cutDate', v_cut,
    'homeworkDeleted', v_hw,
    'overridesDeleted', v_ovr,
    'filesDeleted', v_files
  );
end;
$$;

revoke all on function public._rasp_run_cleanup(int) from public;

-- Called by any client ~daily. No-op if ran in last 20 hours.
create or replace function public.rasp_auto_cleanup()
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_last timestamptz;
begin
  select last_cleanup_at into v_last from public.app_meta where id = 'main';
  if v_last is not null and v_last > now() - interval '20 hours' then
    return json_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'recent',
      'lastCleanupAt', v_last
    );
  end if;
  return public._rasp_run_cleanup(8);
end;
$$;

revoke all on function public.rasp_auto_cleanup() from public;
grant execute on function public.rasp_auto_cleanup() to anon, authenticated;

-- Admin force cleanup (default 8 weeks).
create or replace function public.rasp_cleanup_old_data(
  p_token text,
  p_weeks int default 8
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
begin
  select * into s from sessions where token = p_token;
  if s.token is null or s.expires_at < now() then
    raise exception 'Нужен вход админа';
  end if;
  if s.role <> 'admin' then
    raise exception 'Только админ может чистить старые данные';
  end if;
  return public._rasp_run_cleanup(coalesce(p_weeks, 8));
end;
$$;

revoke all on function public.rasp_cleanup_old_data(text, int) from public;
grant execute on function public.rasp_cleanup_old_data(text, int) to anon, authenticated;
