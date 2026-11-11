-- Security audit: IP on events + failed logins + admin log viewer.
-- Run in Supabase → SQL Editor (можно одним файлом; helpers включены).

alter table audit_log add column if not exists ip text default '';
alter table audit_log add column if not exists visitor_id text default '';

create index if not exists audit_log_at_idx on audit_log (at desc);
create index if not exists audit_log_action_idx on audit_log (action);

create table if not exists login_attempts (
  bucket text primary key,
  fails int not null default 0,
  locked_until timestamptz
);
alter table login_attempts enable row level security;

create or replace function public._client_ip()
returns text
language plpgsql
stable
as $$
declare
  h json;
  ip text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    h := null;
  end;
  if h is null then
    return 'unknown';
  end if;
  ip := coalesce(
    nullif(trim(h->>'cf-connecting-ip'), ''),
    nullif(trim(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1)), ''),
    nullif(trim(h->>'x-real-ip'), ''),
    'unknown'
  );
  return left(ip, 64);
end;
$$;

create or replace function public._login_locked(p_bucket text)
returns boolean
language plpgsql
as $$
declare
  v_locked timestamptz;
begin
  select locked_until into v_locked from login_attempts where bucket = p_bucket;
  return v_locked is not null and v_locked > now();
end;
$$;

create or replace function public._login_fail(p_bucket text, p_max int default 8, p_lock interval default interval '15 minutes')
returns void
language plpgsql
as $$
begin
  insert into login_attempts(bucket, fails, locked_until)
    values (p_bucket, 1, null)
  on conflict (bucket) do update
    set fails = case
          when login_attempts.locked_until is not null and login_attempts.locked_until > now()
            then login_attempts.fails
          when login_attempts.fails + 1 >= p_max then 0
          else login_attempts.fails + 1
        end,
        locked_until = case
          when login_attempts.locked_until is not null and login_attempts.locked_until > now()
            then login_attempts.locked_until
          when login_attempts.fails + 1 >= p_max then now() + p_lock
          else login_attempts.locked_until
        end;
end;
$$;

create or replace function public._login_ok(p_bucket text)
returns void
language sql
as $$
  delete from login_attempts where bucket = p_bucket;
$$;

create or replace function public._write_audit(
  p_action text,
  p_group_id text default null,
  p_detail text default '',
  p_by_role text default '',
  p_visitor_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log(action, group_id, detail, by_role, ip, visitor_id)
  values (
    left(coalesce(p_action, 'unknown'), 64),
    nullif(left(trim(coalesce(p_group_id, '')), 64), ''),
    left(coalesce(p_detail, ''), 200),
    left(coalesce(p_by_role, ''), 32),
    left(coalesce(public._client_ip(), 'unknown'), 64),
    left(regexp_replace(coalesce(p_visitor_id, ''), '[^a-zA-Z0-9_-]', '', 'g'), 64)
  );
end;
$$;

-- List for admin only
create or replace function public.rasp_list_audit(p_token text, p_limit int default 80)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  n int;
begin
  select * into s from sessions
  where token = p_token and role = 'admin' and expires_at > now();
  if not found then
    raise exception 'Нужен вход админа';
  end if;

  n := least(greatest(coalesce(p_limit, 80), 1), 200);

  return coalesce((
    select json_agg(row_to_json(x))
    from (
      select
        id,
        at,
        action,
        group_id as "groupId",
        detail,
        by_role as "byRole",
        coalesce(ip, '') as ip,
        coalesce(visitor_id, '') as "visitorId",
        (action in (
          'login_fail', 'login_lock_ip', 'login_lock_code',
          'semester_reset', 'code_revoke', 'code_create'
        )) as suspicious
      from audit_log
      order by at desc
      limit n
    ) x
  ), '[]'::json);
end;
$$;

grant execute on function public.rasp_list_audit(text, int) to anon, authenticated;
-- _write_audit только из других security definer функций, не с клиента
revoke execute on function public._write_audit(text, text, text, text, text) from public, anon, authenticated;

-- Login with rate limit + audit of fails / locks / success
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
    insert into sessions(token, role, group_id, expires_at)
      values (v_token, 'admin', null, now() + interval '30 days');
    perform public._write_audit('login_admin', null, 'ok', 'admin');
    return json_build_object('role','admin','groupId',null,'token',v_token,'label','');
  end if;

  select gc.group_id, gc.label into v_group_id, v_label
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
    insert into sessions(token, role, group_id, expires_at)
      values (v_token, 'starosta', v_group_id, now() + interval '30 days');
    perform public._write_audit(
      'login_starosta', v_group_id, left(coalesce(v_label, ''), 64), 'starosta'
    );
    return json_build_object(
      'role', 'starosta',
      'groupId', v_group_id,
      'token', v_token,
      'label', coalesce(v_label, '')
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
