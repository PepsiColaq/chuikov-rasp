-- Синяя подпись в профиле (Командир / Замком…) отдельно от имени (Кобзева).
-- Выполни один раз в Supabase → SQL Editor. Можно повторять.

alter table group_codes add column if not exists role_title text not null default '';

-- Живая синяя подпись для сессии
create or replace function public._session_role_title(s sessions)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text;
begin
  if s.role = 'admin' then
    return 'Админ';
  end if;
  if s.code_id is not null then
    select nullif(trim(role_title), '') into v from group_codes where id = s.code_id;
    if v is not null then return left(v, 32); end if;
  end if;
  return 'Староста';
end;
$$;

drop function if exists public.rasp_add_starosta_code(text, text, text, text);

create or replace function public.rasp_add_starosta_code(
  p_token text,
  p_group_id text,
  p_code text,
  p_label text default '',
  p_role_title text default ''
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_id text;
  v_hash text;
  v_plain text;
  v_label text;
  v_role text;
begin
  select * into s from sessions where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then raise exception 'Нужна админ-сессия'; end if;
  if not exists (select 1 from groups where id = p_group_id and active) then
    raise exception 'Группа не найдена';
  end if;
  v_plain := trim(coalesce(p_code, ''));
  if length(v_plain) < 8 then
    raise exception 'Код слишком короткий (мин. 8)';
  end if;

  v_label := left(trim(coalesce(p_label, '')), 64);
  if v_label = '' then
    raise exception 'Укажи имя (как в профиле)';
  end if;
  v_role := left(trim(coalesce(p_role_title, '')), 32);

  v_hash := public.hash_access_code(v_plain);
  if exists (select 1 from group_codes where code_hash = v_hash) then
    raise exception 'Такой код уже используется';
  end if;
  if exists (select 1 from groups where starosta_code_hash = v_hash) then
    raise exception 'Такой код уже используется';
  end if;
  if v_hash = (select admin_code_hash from app_meta where id = 'main') then
    raise exception 'Нельзя использовать админ-код';
  end if;

  v_id := 'gc_' || encode(gen_random_bytes(8), 'hex');
  insert into group_codes(id, group_id, code_hash, code_plain, label, role_title, active)
    values (v_id, p_group_id, v_hash, left(v_plain, 64), v_label, v_role, true);

  update groups set starosta_code_hash = v_hash where id = p_group_id;

  insert into audit_log(action, group_id, detail, by_role)
    values (
      'starosta_code_add',
      p_group_id,
      left(v_label || case when v_role <> '' then ' · ' || v_role else '' end, 80),
      'admin'
    );

  return json_build_object(
    'id', v_id,
    'groupId', p_group_id,
    'label', v_label,
    'roleTitle', v_role,
    'code', left(v_plain, 64)
  );
end;
$$;

grant execute on function public.rasp_add_starosta_code(text, text, text, text, text) to anon, authenticated;

create or replace function public.rasp_list_starosta_codes(p_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
begin
  select * into s from sessions where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then raise exception 'Нужна админ-сессия'; end if;
  return coalesce((
    select json_agg(json_build_object(
      'id', gc.id,
      'groupId', gc.group_id,
      'groupName', g.name,
      'label', gc.label,
      'roleTitle', coalesce(gc.role_title, ''),
      'code', coalesce(gc.code_plain, ''),
      'createdAt', gc.created_at,
      'active', gc.active
    ) order by g.name, gc.created_at desc)
    from group_codes gc
    join groups g on g.id = gc.group_id
    where gc.active
  ), '[]'::json);
end;
$$;

grant execute on function public.rasp_list_starosta_codes(text) to anon, authenticated;

create or replace function public.rasp_set_starosta_role_title(
  p_token text,
  p_code_id text,
  p_role_title text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_group text;
  v_role text;
begin
  select * into s from sessions where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then raise exception 'Нужна админ-сессия'; end if;
  v_role := left(trim(coalesce(p_role_title, '')), 32);
  select group_id into v_group from group_codes where id = p_code_id and active;
  if v_group is null then raise exception 'Код не найден'; end if;
  update group_codes set role_title = v_role where id = p_code_id;
  insert into audit_log(action, group_id, detail, by_role)
    values ('starosta_role_title', v_group, left(coalesce(nullif(v_role, ''), 'Староста'), 64), 'admin');
  return json_build_object(
    'id', p_code_id,
    'roleTitle', v_role,
    'groupId', v_group
  );
end;
$$;

grant execute on function public.rasp_set_starosta_role_title(text, text, text) to anon, authenticated;

-- Вход: отдаём roleTitle
create or replace function public.rasp_login(p_code text, p_group_id text default null)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_admin text;
  v_group_id text;
  v_label text;
  v_role_title text;
  v_code_id text;
  v_token text;
  v_ip text;
  v_ip_bucket text;
  v_code_bucket text;
  v_admin_name text;
begin
  if p_code is null or length(trim(p_code)) < 8 then
    raise exception 'Код слишком короткий';
  end if;

  v_ip := public._client_ip();
  v_hash := public.hash_access_code(p_code);
  v_ip_bucket := 'ip:' || v_ip;
  v_code_bucket := 'code:' || left(v_hash, 20);

  if v_ip is not null and v_ip <> 'unknown' and public._login_locked(v_ip_bucket) then
    perform public._write_audit('login_lock_ip', p_group_id, 'blocked ip=' || v_ip, 'anon');
    raise exception 'Слишком много попыток с этого устройства/сети. Подождите ~15 минут.';
  end if;
  if public._login_locked(v_code_bucket) then
    perform public._write_audit('login_lock_code', p_group_id, 'blocked code-prefix=' || left(v_hash, 8), 'anon');
    raise exception 'Слишком много попыток для этого кода. Подождите ~15 минут.';
  end if;

  select admin_code_hash into v_admin from app_meta where id = 'main';
  select coalesce(nullif(trim(admin_display_name), ''), 'Никитос') into v_admin_name
    from app_meta where id = 'main';

  if v_admin is not null and v_hash = v_admin then
    if v_ip is not null and v_ip <> 'unknown' then
      perform public._login_ok(v_ip_bucket);
    end if;
    perform public._login_ok(v_code_bucket);
    v_token := encode(gen_random_bytes(24), 'hex');
    insert into sessions(token, role, group_id, expires_at, label, code_id, code_hash)
      values (v_token, 'admin', null, now() + interval '30 days', v_admin_name, null, null);
    perform public._write_audit('login_admin', null, 'ok', 'admin');
    return json_build_object(
      'role', 'admin',
      'groupId', null,
      'token', v_token,
      'label', v_admin_name,
      'roleTitle', 'Админ',
      'codeId', null,
      'avatarUrl', coalesce(
        (select nullif(trim(admin_avatar_url), '') from app_meta where id = 'main'),
        ''
      )
    );
  end if;

  select gc.id, gc.group_id, gc.label, coalesce(gc.role_title, '')
    into v_code_id, v_group_id, v_label, v_role_title
  from group_codes gc
  join groups g on g.id = gc.group_id
  where gc.code_hash = v_hash
    and gc.active
    and g.active
    and (p_group_id is null or gc.group_id = p_group_id)
  limit 1;

  if v_group_id is not null then
    if v_ip is not null and v_ip <> 'unknown' then
      perform public._login_ok(v_ip_bucket);
    end if;
    perform public._login_ok(v_code_bucket);
    v_token := encode(gen_random_bytes(24), 'hex');
    v_label := left(trim(coalesce(v_label, '')), 64);
    v_role_title := left(trim(coalesce(v_role_title, '')), 32);
    insert into sessions(token, role, group_id, expires_at, label, code_id, code_hash)
      values (v_token, 'starosta', v_group_id, now() + interval '30 days', v_label, v_code_id, v_hash);
    perform public._write_audit('login_starosta', v_group_id, v_label, 'starosta');
    return json_build_object(
      'role', 'starosta',
      'groupId', v_group_id,
      'token', v_token,
      'label', v_label,
      'roleTitle', v_role_title,
      'codeId', v_code_id,
      'avatarUrl', coalesce(
        (select nullif(trim(avatar_url), '') from group_codes where id = v_code_id),
        ''
      )
    );
  end if;

  if v_ip is not null and v_ip <> 'unknown' then
    perform public._login_fail(v_ip_bucket);
  end if;
  perform public._login_fail(v_code_bucket);
  perform public._write_audit('login_fail', p_group_id, 'bad code', 'anon');
  raise exception 'Неверный код';
end;
$$;

grant execute on function public.rasp_login(text, text) to anon, authenticated;

create or replace function public.rasp_session(p_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_ok boolean;
  v_ava text;
  v_label text;
  v_role_title text;
begin
  if p_token is null then return null; end if;
  select * into s from sessions where token = p_token;
  if s.token is null or s.expires_at < now() then
    delete from sessions where token = p_token;
    return null;
  end if;

  if s.role = 'starosta' then
    v_ok := false;
    if s.code_id is not null then
      select exists (
        select 1 from group_codes gc
        join groups g on g.id = gc.group_id
        where gc.id = s.code_id and gc.active and g.active
      ) into v_ok;
    elsif s.code_hash is not null and s.code_hash <> '' then
      select exists (
        select 1 from group_codes gc
        join groups g on g.id = gc.group_id
        where gc.code_hash = s.code_hash and gc.active and g.active
      ) into v_ok;
    else
      if coalesce(s.label, '') <> '' then
        select exists (
          select 1 from group_codes gc
          join groups g on g.id = gc.group_id
          where gc.group_id = s.group_id and gc.active and g.active and gc.label = s.label
        ) into v_ok;
      else
        v_ok := true;
      end if;
    end if;
    if not v_ok then
      delete from sessions where token = p_token;
      return null;
    end if;
  end if;

  v_ava := public._session_avatar(s);
  v_label := public._session_display_label(s);
  v_role_title := public._session_role_title(s);

  if coalesce(s.label, '') is distinct from v_label then
    update sessions set label = v_label where token = p_token;
  end if;

  return json_build_object(
    'role', s.role,
    'groupId', s.group_id,
    'token', s.token,
    'label', coalesce(v_label, ''),
    'roleTitle', coalesce(v_role_title, 'Староста'),
    'codeId', s.code_id,
    'avatarUrl', coalesce(v_ava, '')
  );
end;
$$;

grant execute on function public.rasp_session(text) to anon, authenticated;
