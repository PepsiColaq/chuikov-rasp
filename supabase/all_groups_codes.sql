-- Коды старосты/редактора на ВСЕ группы (all_groups).
-- Выполни один раз в Supabase → SQL Editor. Можно повторять.

alter table group_codes add column if not exists all_groups boolean not null default false;
alter table group_codes alter column group_id drop not null;

create index if not exists group_codes_all_groups_idx
  on group_codes(all_groups) where active and all_groups;

-- Добавление кода: p_group_id = '__all__' → власть во всех группах
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
  v_all boolean;
  v_gid text;
begin
  select * into s from sessions where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then raise exception 'Нужна админ-сессия'; end if;

  v_all := lower(trim(coalesce(p_group_id, ''))) in ('__all__', '*', 'all');
  if v_all then
    v_gid := null;
  else
    if not exists (select 1 from groups where id = p_group_id and active) then
      raise exception 'Группа не найдена';
    end if;
    v_gid := p_group_id;
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
  insert into group_codes(id, group_id, code_hash, code_plain, label, role_title, active, all_groups)
    values (v_id, v_gid, v_hash, left(v_plain, 64), v_label, v_role, true, v_all);

  if not v_all then
    update groups set starosta_code_hash = v_hash where id = v_gid;
  end if;

  insert into audit_log(action, group_id, detail, by_role)
    values (
      'starosta_code_add',
      v_gid,
      left(
        (case when v_all then 'все группы · ' else '' end)
          || v_label
          || case when v_role <> '' then ' · ' || v_role else '' end,
        80
      ),
      'admin'
    );

  return json_build_object(
    'id', v_id,
    'groupId', case when v_all then '__all__' else v_gid end,
    'allGroups', v_all,
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
    select json_agg(row_obj order by sort_all, sort_name, created_at desc)
    from (
      select
        json_build_object(
          'id', gc.id,
          'groupId', case when gc.all_groups then '__all__' else gc.group_id end,
          'groupName', case when gc.all_groups then 'Все группы' else coalesce(g.name, gc.group_id) end,
          'allGroups', gc.all_groups,
          'label', gc.label,
          'roleTitle', coalesce(gc.role_title, ''),
          'code', coalesce(gc.code_plain, ''),
          'createdAt', gc.created_at,
          'active', gc.active
        ) as row_obj,
        case when gc.all_groups then 0 else 1 end as sort_all,
        coalesce(g.name, '') as sort_name,
        gc.created_at
      from group_codes gc
      left join groups g on g.id = gc.group_id
      where gc.active
    ) q
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
  v_all boolean;
  v_role text;
begin
  select * into s from sessions where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then raise exception 'Нужна админ-сессия'; end if;
  v_role := left(trim(coalesce(p_role_title, '')), 32);
  select group_id, all_groups into v_group, v_all
  from group_codes where id = p_code_id and active;
  if not found then raise exception 'Код не найден'; end if;
  update group_codes set role_title = v_role where id = p_code_id;
  insert into audit_log(action, group_id, detail, by_role)
    values (
      'starosta_role_title',
      v_group,
      left(coalesce(nullif(v_role, ''), 'Староста'), 64),
      'admin'
    );
  return json_build_object(
    'id', p_code_id,
    'roleTitle', v_role,
    'groupId', case when v_all then '__all__' else v_group end,
    'allGroups', coalesce(v_all, false)
  );
end;
$$;

grant execute on function public.rasp_set_starosta_role_title(text, text, text) to anon, authenticated;

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
  v_all boolean;
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
      'allGroups', true,
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

  -- Сначала коды на все группы
  select gc.id, gc.group_id, gc.label, coalesce(gc.role_title, ''), true
    into v_code_id, v_group_id, v_label, v_role_title, v_all
  from group_codes gc
  where gc.code_hash = v_hash
    and gc.active
    and gc.all_groups
  limit 1;

  if v_code_id is null then
    select gc.id, gc.group_id, gc.label, coalesce(gc.role_title, ''), false
      into v_code_id, v_group_id, v_label, v_role_title, v_all
    from group_codes gc
    join groups g on g.id = gc.group_id
    where gc.code_hash = v_hash
      and gc.active
      and coalesce(gc.all_groups, false) = false
      and g.active
      and (p_group_id is null or gc.group_id = p_group_id)
    limit 1;
  end if;

  if v_code_id is not null then
    if v_ip is not null and v_ip <> 'unknown' then
      perform public._login_ok(v_ip_bucket);
    end if;
    perform public._login_ok(v_code_bucket);
    v_token := encode(gen_random_bytes(24), 'hex');
    v_label := left(trim(coalesce(v_label, '')), 64);
    v_role_title := left(trim(coalesce(v_role_title, '')), 32);
    insert into sessions(token, role, group_id, expires_at, label, code_id, code_hash)
      values (
        v_token,
        'starosta',
        case when v_all then null else v_group_id end,
        now() + interval '30 days',
        v_label,
        v_code_id,
        v_hash
      );
    perform public._write_audit(
      'login_starosta',
      case when v_all then null else v_group_id end,
      case when v_all then 'all · ' || v_label else v_label end,
      'starosta'
    );
    return json_build_object(
      'role', 'starosta',
      'groupId', case when v_all then null else v_group_id end,
      'allGroups', coalesce(v_all, false),
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
  v_all boolean;
begin
  if p_token is null then return null; end if;
  select * into s from sessions where token = p_token;
  if s.token is null or s.expires_at < now() then
    delete from sessions where token = p_token;
    return null;
  end if;

  v_all := false;
  if s.role = 'starosta' then
    v_ok := false;
    if s.code_id is not null then
      select exists (
        select 1 from group_codes gc
        where gc.id = s.code_id
          and gc.active
          and (
            gc.all_groups
            or exists (select 1 from groups g where g.id = gc.group_id and g.active)
          )
      ), coalesce((select gc.all_groups from group_codes gc where gc.id = s.code_id), false)
        into v_ok, v_all;
    elsif s.code_hash is not null and s.code_hash <> '' then
      select exists (
        select 1 from group_codes gc
        where gc.code_hash = s.code_hash
          and gc.active
          and (
            gc.all_groups
            or exists (select 1 from groups g where g.id = gc.group_id and g.active)
          )
      ), coalesce((
        select gc.all_groups from group_codes gc
        where gc.code_hash = s.code_hash and gc.active
        order by gc.all_groups desc limit 1
      ), false)
        into v_ok, v_all;
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
  elsif s.role = 'admin' then
    v_all := true;
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
    'allGroups', coalesce(v_all, false),
    'token', s.token,
    'label', coalesce(v_label, ''),
    'roleTitle', coalesce(v_role_title, 'Староста'),
    'codeId', s.code_id,
    'avatarUrl', coalesce(v_ava, '')
  );
end;
$$;

grant execute on function public.rasp_session(text) to anon, authenticated;

-- Права на запись в любую группу для all_groups-кода
create or replace function public._require_write(p_token text, p_group_id text)
returns sessions
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_on boolean;
  v_ok boolean;
  v_all boolean;
begin
  select * into s from sessions where token = p_token;
  if s.token is null or s.expires_at < now() then
    raise exception 'Нужен вход старосты или админа';
  end if;

  if s.role <> 'admin' then
    select coalesce(site_enabled, true) into v_on from app_meta where id = 'main';
    if v_on is distinct from true then
      raise exception 'Сайт временно закрыт';
    end if;
  end if;

  if s.role = 'admin' then
    return s;
  end if;

  if s.role = 'starosta' then
    v_all := false;
    v_ok := true;
    if s.code_id is not null then
      select gc.active, coalesce(gc.all_groups, false)
        into v_ok, v_all
      from group_codes gc
      where gc.id = s.code_id;
      if not found then v_ok := false; end if;
    elsif s.code_hash is not null and s.code_hash <> '' then
      select exists (
        select 1 from group_codes where code_hash = s.code_hash and active
      ), coalesce((
        select all_groups from group_codes
        where code_hash = s.code_hash and active
        order by all_groups desc limit 1
      ), false)
        into v_ok, v_all;
    elsif coalesce(s.label, '') <> '' then
      select exists (
        select 1 from group_codes
        where group_id = s.group_id and active and label = s.label
      ) into v_ok;
    end if;

    if not v_ok then
      delete from sessions where token = p_token;
      raise exception 'Доступ отозван — войдите снова';
    end if;

    if v_all or s.group_id = p_group_id then
      return s;
    end if;
  end if;

  raise exception 'Нет прав на эту группу';
end;
$$;

revoke all on function public._require_write(text, text) from public;
grant execute on function public._require_write(text, text) to anon, authenticated;

-- Отзыв: group_id может быть null у all_groups
create or replace function public.rasp_revoke_starosta_code(p_token text, p_code_id text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_group text;
  v_label text;
  v_hash text;
  v_id text;
  v_all boolean;
begin
  select * into s from sessions where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then raise exception 'Нужна админ-сессия'; end if;

  update group_codes
    set active = false
    where id = p_code_id and active
    returning id, group_id, label, code_hash, all_groups
      into v_id, v_group, v_label, v_hash, v_all;

  if v_id is null then raise exception 'Код не найден'; end if;

  delete from sessions where code_id = p_code_id;

  if v_hash is not null and v_hash <> '' then
    delete from sessions
      where role = 'starosta'
        and code_hash = v_hash
        and (
          coalesce(v_all, false)
          or group_id is not distinct from v_group
        );
  end if;

  if coalesce(trim(v_label), '') <> '' then
    delete from sessions
      where role = 'starosta'
        and coalesce(code_id, '') = ''
        and coalesce(code_hash, '') = ''
        and label = left(trim(v_label), 64)
        and (
          coalesce(v_all, false)
          or group_id is not distinct from v_group
        );
  end if;

  insert into audit_log(action, group_id, detail, by_role)
    values (
      'starosta_code_revoke',
      v_group,
      p_code_id || case when coalesce(v_all, false) then ' all' else '' end || ' sessions_purged',
      'admin'
    );
end;
$$;

grant execute on function public.rasp_revoke_starosta_code(text, text) to anon, authenticated;

create or replace function public.rasp_rename_starosta_label(p_token text, p_code_id text, p_label text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_name text;
  v_group text;
  v_old text;
  v_all boolean;
  v_id text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null or s.role <> 'admin' then
    raise exception 'Только админ';
  end if;

  v_name := left(trim(coalesce(p_label, '')), 64);
  if v_name = '' then raise exception 'Укажи имя'; end if;
  if p_code_id is null or trim(p_code_id) = '' then
    raise exception 'Нет кода';
  end if;

  select id, group_id, label, all_groups into v_id, v_group, v_old, v_all
  from group_codes where id = p_code_id and active;
  if v_id is null then raise exception 'Код не найден'; end if;

  update group_codes set label = v_name where id = p_code_id;
  update sessions set label = v_name
    where code_id = p_code_id and expires_at > now();
  update homework set author_label = v_name where author_code_id = p_code_id;

  insert into audit_log(action, group_id, detail, by_role)
    values (
      'starosta_label_rename',
      v_group,
      left(coalesce(v_old, '') || ' → ' || v_name, 120),
      'admin'
    );

  return json_build_object(
    'id', p_code_id,
    'label', v_name,
    'groupId', case when coalesce(v_all, false) then '__all__' else v_group end,
    'allGroups', coalesce(v_all, false)
  );
end;
$$;

grant execute on function public.rasp_rename_starosta_label(text, text, text) to anon, authenticated;
