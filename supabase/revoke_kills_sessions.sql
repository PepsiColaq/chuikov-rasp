-- При отзыве кода старосты сразу гасим ВСЕ сессии этого кода.
-- Также новые входы пишут code_id / code_hash, чтобы потом точно находить сессии.
-- Выполни один раз в Supabase → SQL Editor.

alter table sessions add column if not exists code_id text;
alter table sessions add column if not exists code_hash text;

create index if not exists sessions_code_id_idx on sessions (code_id);
create index if not exists sessions_code_hash_idx on sessions (code_hash);

-- Вход: сохраняем id и хэш кода на сессии (30 дней, rate-limit, label — как раньше)
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
  v_code_id text;
  v_token text;
  v_ip text;
  v_ip_bucket text;
  v_code_bucket text;
  v_was_lock boolean;
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

  if v_admin is not null and v_hash = v_admin then
    if v_ip is not null and v_ip <> 'unknown' then
      perform public._login_ok(v_ip_bucket);
    end if;
    perform public._login_ok(v_code_bucket);
    v_token := encode(gen_random_bytes(24), 'hex');
    insert into sessions(token, role, group_id, expires_at, label, code_id, code_hash)
      values (v_token, 'admin', null, now() + interval '30 days', 'admin', null, null);
    perform public._write_audit('login_admin', null, 'ok', 'admin');
    return json_build_object('role','admin','groupId',null,'token',v_token,'label','');
  end if;

  select gc.id, gc.group_id, gc.label into v_code_id, v_group_id, v_label
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
    insert into sessions(token, role, group_id, expires_at, label, code_id, code_hash)
      values (v_token, 'starosta', v_group_id, now() + interval '30 days', v_label, v_code_id, v_hash);
    perform public._write_audit('login_starosta', v_group_id, v_label, 'starosta');
    return json_build_object(
      'role', 'starosta',
      'groupId', v_group_id,
      'token', v_token,
      'label', v_label
    );
  end if;

  v_was_lock := false;
  if v_ip is not null and v_ip <> 'unknown' then
    perform public._login_fail(v_ip_bucket, 8, interval '15 minutes');
    if public._login_locked(v_ip_bucket) then
      v_was_lock := true;
      perform public._write_audit('login_lock_ip', p_group_id, 'after fails ip=' || v_ip, 'anon');
    end if;
  end if;
  perform public._login_fail(v_code_bucket, 8, interval '15 minutes');
  if public._login_locked(v_code_bucket) then
    v_was_lock := true;
    perform public._write_audit('login_lock_code', p_group_id, 'after fails code-prefix=' || left(v_hash, 8), 'anon');
  end if;

  perform public._write_audit(
    'login_fail',
    p_group_id,
    'bad code-prefix=' || left(v_hash, 8) || case when v_was_lock then ' LOCKED' else '' end,
    'anon'
  );

  raise exception 'Неверный код';
end;
$$;

grant execute on function public.rasp_login(text, text) to anon, authenticated;

-- Отзыв кода = код неактивен + все сессии этого кода удалены
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
  v_killed int := 0;
begin
  select * into s from sessions where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then raise exception 'Нужна админ-сессия'; end if;

  update group_codes
    set active = false
    where id = p_code_id and active
    returning group_id, label, code_hash into v_group, v_label, v_hash;

  if v_group is null then raise exception 'Код не найден'; end if;

  -- 1) по id кода (новые сессии)
  delete from sessions where code_id = p_code_id;
  get diagnostics v_killed = row_count;

  -- 2) по хэшу кода (если записан)
  if v_hash is not null and v_hash <> '' then
    delete from sessions
      where role = 'starosta'
        and group_id = v_group
        and code_hash = v_hash;
  end if;

  -- 3) старые сессии без code_id/code_hash — по метке (Дил / Дил кенту и т.п.)
  if coalesce(trim(v_label), '') <> '' then
    delete from sessions
      where role = 'starosta'
        and group_id = v_group
        and coalesce(code_id, '') = ''
        and coalesce(code_hash, '') = ''
        and label = left(trim(v_label), 64);
  end if;

  insert into audit_log(action, group_id, detail, by_role)
    values (
      'starosta_code_revoke',
      v_group,
      p_code_id || ' sessions_purged',
      'admin'
    );
end;
$$;

grant execute on function public.rasp_revoke_starosta_code(text, text) to anon, authenticated;

-- Проверка сессии: если код отозван — сессия мертва
create or replace function public.rasp_session(p_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_ok boolean;
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
      -- legacy: код с такой меткой ещё активен в этой группе
      if coalesce(s.label, '') <> '' then
        select exists (
          select 1 from group_codes gc
          join groups g on g.id = gc.group_id
          where gc.group_id = s.group_id
            and gc.active and g.active
            and gc.label = s.label
        ) into v_ok;
      else
        -- без метки — оставляем, пока не истечёт (не можем надёжно сопоставить)
        v_ok := true;
      end if;
    end if;

    if not v_ok then
      delete from sessions where token = p_token;
      return null;
    end if;
  end if;

  return json_build_object(
    'role', s.role,
    'groupId', s.group_id,
    'token', s.token,
    'label', coalesce(s.label, '')
  );
end;
$$;

grant execute on function public.rasp_session(text) to anon, authenticated;

-- Запись тоже падает, если код отозван (на случай пока клиент ещё не опросил rasp_session)
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

  if s.role = 'starosta' and s.group_id = p_group_id then
    v_ok := true;
    if s.code_id is not null then
      select exists (
        select 1 from group_codes where id = s.code_id and active
      ) into v_ok;
    elsif s.code_hash is not null and s.code_hash <> '' then
      select exists (
        select 1 from group_codes where code_hash = s.code_hash and active
      ) into v_ok;
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
    return s;
  end if;

  raise exception 'Нет прав на эту группу';
end;
$$;

revoke all on function public._require_write(text, text) from public;
grant execute on function public._require_write(text, text) to anon, authenticated;
