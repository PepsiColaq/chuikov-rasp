-- Староста без code_id в сессии всё равно может поставить аватар
-- (ищем код по code_hash / label / group_id).
-- Выполни в Supabase → SQL Editor.

create or replace function public.rasp_set_avatar(p_token text, p_url text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_url text;
  v_code text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;

  v_url := trim(coalesce(p_url, ''));
  if not public._rasp_is_avatar_url(v_url) then
    raise exception 'Недопустимый адрес фото';
  end if;

  if s.role = 'admin' then
    update app_meta set admin_avatar_url = v_url where id = 'main';
    update homework set author_avatar_url = v_url
      where author_code_id = 'admin'
         or lower(trim(coalesce(author_label, ''))) in ('admin', 'админ');
  elsif s.role = 'starosta' then
    v_code := s.code_id;
    if v_code is null and s.code_hash is not null and s.code_hash <> '' then
      select id into v_code
      from group_codes
      where code_hash = s.code_hash and active
      order by created_at desc nulls last
      limit 1;
    end if;
    if v_code is null and coalesce(s.label, '') <> '' and s.group_id is not null then
      select id into v_code
      from group_codes
      where group_id = s.group_id and active and label = s.label
      order by created_at desc nulls last
      limit 1;
    end if;
    if v_code is null and s.group_id is not null then
      if (select count(*)::int from group_codes where group_id = s.group_id and active) = 1 then
        select id into v_code
        from group_codes
        where group_id = s.group_id and active
        limit 1;
      end if;
    end if;
    if v_code is null then
      raise exception 'Нет прав: перезайти кодом старосты и попробуй снова';
    end if;
    -- подклеим code_id в сессию на будущее
    update sessions set code_id = v_code where token = s.token and code_id is null;

    update group_codes set avatar_url = v_url where id = v_code and active;
    if not found then raise exception 'Код не найден'; end if;
    update homework set author_avatar_url = v_url where author_code_id = v_code;
  else
    raise exception 'Нет прав';
  end if;

  insert into audit_log(action, group_id, detail, by_role)
    values ('avatar_set', s.group_id, left(v_url, 120), s.role);

  return json_build_object('avatarUrl', v_url, 'codeId', coalesce(v_code, 'admin'));
end;
$$;

grant execute on function public.rasp_set_avatar(text, text) to anon, authenticated;

create or replace function public.rasp_clear_avatar(p_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_code text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;

  if s.role = 'admin' then
    update app_meta set admin_avatar_url = null where id = 'main';
    update homework set author_avatar_url = null
      where author_code_id = 'admin'
         or lower(trim(coalesce(author_label, ''))) in ('admin', 'админ');
  elsif s.role = 'starosta' then
    v_code := s.code_id;
    if v_code is null and s.code_hash is not null and s.code_hash <> '' then
      select id into v_code from group_codes
      where code_hash = s.code_hash and active
      order by created_at desc nulls last limit 1;
    end if;
    if v_code is null and coalesce(s.label, '') <> '' and s.group_id is not null then
      select id into v_code from group_codes
      where group_id = s.group_id and active and label = s.label
      order by created_at desc nulls last limit 1;
    end if;
    if v_code is null then
      raise exception 'Нет прав: перезайти кодом старосты';
    end if;
    update group_codes set avatar_url = null where id = v_code and active;
    update homework set author_avatar_url = null where author_code_id = v_code;
  else
    raise exception 'Нет прав';
  end if;

  insert into audit_log(action, group_id, detail, by_role)
    values ('avatar_clear', s.group_id, coalesce(v_code, s.code_id, 'admin'), s.role);
end;
$$;

grant execute on function public.rasp_clear_avatar(text) to anon, authenticated;
