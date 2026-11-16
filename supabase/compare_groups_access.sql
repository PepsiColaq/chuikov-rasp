-- Доступ к сравнению групп: отдельный флаг у кода, как у «Свободных аудиторий».
--
-- Зачем: сравнение расписаний полезно не всем, а выборочно — старосте, куратору,
-- конкретному человеку. Поэтому у каждого кода свой переключатель, а не «всем».
--
-- Выполни один раз в Supabase → SQL Editor. Можно запускать повторно: всё
-- в idempotent-виде (add column if not exists / create or replace).
--
-- Важно: этот файл полностью повторяет rasp_login и rasp_session. Он должен
-- применяться ПОСЛЕ access_rooms_bans_session.sql — иначе тот перезапишет
-- функции и флаг снова пропадёт из ответа сервера.

-- ── 1. Поле у кода ──────────────────────────────────────────────────────
alter table group_codes
  add column if not exists can_compare_groups boolean not null default false;

-- ── 2. Выдать/забрать право ─────────────────────────────────────────────
create or replace function public.rasp_set_code_compare_groups(
  p_token text,
  p_code_id text,
  p_enabled boolean
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_label text;
begin
  select * into s from sessions
   where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then raise exception 'Нужна админ-сессия'; end if;

  update group_codes
     set can_compare_groups = coalesce(p_enabled, false)
   where id = p_code_id and active
  returning label into v_label;
  if not found then raise exception 'Код не найден'; end if;

  insert into audit_log(action, detail, by_role)
    values (
      case when coalesce(p_enabled, false) then 'compare_groups_grant' else 'compare_groups_revoke' end,
      left(coalesce(v_label, p_code_id), 64),
      'admin'
    );

  return json_build_object(
    'id', p_code_id,
    'canCompareGroups', coalesce(p_enabled, false),
    'label', coalesce(v_label, '')
  );
end;
$$;

grant execute on function public.rasp_set_code_compare_groups(text, text, boolean) to anon, authenticated;

-- ── 3. Список кодов: отдаём новый флаг админке ──────────────────────────
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
    select json_agg(row_obj order by banned_sort, sort_all, sort_name, created_at desc)
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
          'active', gc.active,
          'canFreeRooms', coalesce(gc.can_free_rooms, false),
          'canCompareGroups', coalesce(gc.can_compare_groups, false),
          'banned', coalesce(gc.banned, false)
        ) as row_obj,
        case when coalesce(gc.banned, false) then 0 else 1 end as banned_sort,
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

-- ── 4. Вход: возвращаем новый флаг ──────────────────────────────────────
drop function if exists public.rasp_login(text, text);
drop function if exists public.rasp_login(text, text, text);

create or replace function public.rasp_login(
  p_code text,
  p_group_id text default null,
  p_visitor_id text default null
)
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
  v_can_rooms boolean;
  v_can_compare boolean;
  v_banned boolean;
  v_token text;
  v_ip text;
  v_ip_bucket text;
  v_code_bucket text;
  v_admin_name text;
  v_vid text;
  v_dev_ban boolean;
begin
  if p_code is null or length(trim(p_code)) < 8 then
    raise exception 'Код слишком короткий';
  end if;

  v_vid := left(regexp_replace(trim(coalesce(p_visitor_id, '')), '[^a-zA-Z0-9_-]', '', 'g'), 64);
  v_ip := public._client_ip();
  v_hash := public.hash_access_code(p_code);
  v_ip_bucket := 'ip:' || v_ip;
  v_code_bucket := 'code:' || left(v_hash, 20);

  select exists(
    select 1 from device_bans where visitor_id = v_vid and active and length(v_vid) >= 8
  ) into v_dev_ban;
  if coalesce(v_dev_ban, false) then
    perform public._write_audit('login_device_ban', p_group_id, 'visitor=' || left(v_vid, 16), 'anon');
    raise exception 'Доступ с этого устройства закрыт.';
  end if;

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

  -- Админ
  if v_admin is not null and v_hash = v_admin then
    if v_ip is not null and v_ip <> 'unknown' then
      perform public._login_ok(v_ip_bucket);
    end if;
    perform public._login_ok(v_code_bucket);
    v_token := encode(gen_random_bytes(24), 'hex');
    insert into sessions(token, role, group_id, expires_at, label, code_id, code_hash)
      values (v_token, 'admin', null, now() + interval '100 years', v_admin_name, null, null);
    perform public._write_audit('login_admin', null, 'ok', 'admin');
    return json_build_object(
      'role', 'admin',
      'groupId', null,
      'allGroups', true,
      'canFreeRooms', true,
      'canCompareGroups', true,
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

  -- Код «на все группы» (куратор) ищется первым
  select gc.id, gc.group_id, gc.label, coalesce(gc.role_title, ''), true,
         coalesce(gc.can_free_rooms, false), coalesce(gc.can_compare_groups, false),
         coalesce(gc.banned, false)
    into v_code_id, v_group_id, v_label, v_role_title, v_all, v_can_rooms, v_can_compare, v_banned
  from group_codes gc
  where gc.code_hash = v_hash
    and gc.active
    and gc.all_groups
  limit 1;

  -- Иначе — код конкретной группы
  if v_code_id is null then
    select gc.id, gc.group_id, gc.label, coalesce(gc.role_title, ''), false,
           coalesce(gc.can_free_rooms, false), coalesce(gc.can_compare_groups, false),
           coalesce(gc.banned, false)
      into v_code_id, v_group_id, v_label, v_role_title, v_all, v_can_rooms, v_can_compare, v_banned
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
    if coalesce(v_banned, false) then
      if length(v_vid) >= 8 then
        insert into device_bans(visitor_id, code_id, label, created_at, active)
          values (v_vid, v_code_id, left(trim(coalesce(v_label, '')), 64), now(), true)
        on conflict (visitor_id) do update
          set active = true, code_id = excluded.code_id, label = excluded.label, created_at = now();
      end if;
      perform public._write_audit('login_code_ban', case when v_all then null else v_group_id end, left(coalesce(v_label, ''), 64), 'anon');
      raise exception 'Доступ закрыт. Код заблокирован.';
    end if;

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
        now() + interval '100 years',
        v_label,
        v_code_id,
        v_hash
      );
    perform public._touch_code_visitor(v_code_id, v_vid);
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
      'canFreeRooms', coalesce(v_can_rooms, false),
      'canCompareGroups', coalesce(v_can_compare, false),
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

grant execute on function public.rasp_login(text, text, text) to anon, authenticated;

-- ── 5. Проверка сессии: отдаём новый флаг ───────────────────────────────
drop function if exists public.rasp_session(text);
drop function if exists public.rasp_session(text, text);

create or replace function public.rasp_session(p_token text, p_visitor_id text default null)
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
  v_can_rooms boolean := false;
  v_can_compare boolean := false;
  v_banned boolean := false;
  v_vid text;
begin
  if p_token is null then return null; end if;
  select * into s from sessions where token = p_token;
  if s.token is null or s.expires_at < now() then
    delete from sessions where token = p_token;
    return null;
  end if;

  v_vid := left(regexp_replace(trim(coalesce(p_visitor_id, '')), '[^a-zA-Z0-9_-]', '', 'g'), 64);

  v_all := false;
  if s.role = 'starosta' then
    v_ok := false;
    if s.code_id is not null then
      select exists (
        select 1 from group_codes gc
        where gc.id = s.code_id
          and gc.active
          and not coalesce(gc.banned, false)
          and (
            gc.all_groups
            or exists (select 1 from groups g where g.id = gc.group_id and g.active)
          )
      ),
      coalesce((select gc.all_groups from group_codes gc where gc.id = s.code_id), false),
      coalesce((select gc.can_free_rooms from group_codes gc where gc.id = s.code_id), false),
      coalesce((select gc.can_compare_groups from group_codes gc where gc.id = s.code_id), false),
      coalesce((select gc.banned from group_codes gc where gc.id = s.code_id), false)
        into v_ok, v_all, v_can_rooms, v_can_compare, v_banned;
      if coalesce(v_banned, false) and length(v_vid) >= 8 then
        insert into device_bans(visitor_id, code_id, label, created_at, active)
          values (
            v_vid,
            s.code_id,
            left(trim(coalesce(s.label, '')), 64),
            now(),
            true
          )
        on conflict (visitor_id) do update
          set active = true, code_id = excluded.code_id, label = excluded.label, created_at = now();
      end if;
    elsif s.code_hash is not null and s.code_hash <> '' then
      select exists (
        select 1 from group_codes gc
        where gc.code_hash = s.code_hash
          and gc.active
          and not coalesce(gc.banned, false)
          and (
            gc.all_groups
            or exists (select 1 from groups g where g.id = gc.group_id and g.active)
          )
      ), coalesce((
        select gc.all_groups from group_codes gc
        where gc.code_hash = s.code_hash and gc.active
        order by gc.all_groups desc limit 1
      ), false),
      coalesce((
        select gc.can_free_rooms from group_codes gc
        where gc.code_hash = s.code_hash and gc.active
        order by gc.all_groups desc limit 1
      ), false),
      coalesce((
        select gc.can_compare_groups from group_codes gc
        where gc.code_hash = s.code_hash and gc.active
        order by gc.all_groups desc limit 1
      ), false)
        into v_ok, v_all, v_can_rooms, v_can_compare;
    else
      if coalesce(s.label, '') <> '' then
        select exists (
          select 1 from group_codes gc
          join groups g on g.id = gc.group_id
          where gc.group_id = s.group_id and gc.active and g.active and gc.label = s.label
            and not coalesce(gc.banned, false)
        ) into v_ok;

        select
          coalesce(gc.all_groups, false),
          coalesce(gc.can_free_rooms, false),
          coalesce(gc.can_compare_groups, false)
          into v_all, v_can_rooms, v_can_compare
        from group_codes gc
        join groups g on g.id = gc.group_id
        where gc.group_id = s.group_id and gc.active and g.active and gc.label = s.label
          and not coalesce(gc.banned, false)
        order by gc.all_groups desc
        limit 1;
      else
        v_ok := true;
      end if;
    end if;
    if not v_ok then
      delete from sessions where token = p_token;
      return null;
    end if;
    perform public._touch_code_visitor(s.code_id, v_vid);
  elsif s.role = 'admin' then
    v_all := true;
    v_can_rooms := true;
    v_can_compare := true;
  end if;

  -- продлеваем «вечную» сессию при каждом чеке
  update sessions set expires_at = greatest(expires_at, now() + interval '100 years')
  where token = p_token;

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
    'canFreeRooms', coalesce(v_can_rooms, false) or s.role = 'admin',
    'canCompareGroups', coalesce(v_can_compare, false) or s.role = 'admin',
    'token', s.token,
    'label', coalesce(v_label, ''),
    'roleTitle', coalesce(v_role_title, 'Староста'),
    'codeId', s.code_id,
    'avatarUrl', coalesce(v_ava, '')
  );
end;
$$;

grant execute on function public.rasp_session(text, text) to anon, authenticated;

-- Продлить уже активные сессии
update sessions
set expires_at = greatest(expires_at, now() + interval '100 years')
where expires_at > now();
