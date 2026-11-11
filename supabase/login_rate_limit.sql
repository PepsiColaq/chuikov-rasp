-- Server-side brute-force protection for rasp_login
-- Run once in Supabase → SQL Editor.
-- Limits by: client IP (from headers) + attempted code hash.
-- 8 fails / 15 min per IP, 8 fails / 15 min per code.

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
begin
  if p_code is null or length(trim(p_code)) < 8 then
    raise exception 'Код слишком короткий';
  end if;

  v_ip := public._client_ip();
  v_hash := public.hash_access_code(p_code);
  v_ip_bucket := 'ip:' || v_ip;
  v_code_bucket := 'code:' || left(v_hash, 20);

  -- IP-лимит только если реально виден (через прокси без X-Forwarded-For иначе все в одном ведре)
  if v_ip is not null and v_ip <> 'unknown' and public._login_locked(v_ip_bucket) then
    raise exception 'Слишком много попыток с этого устройства/сети. Подождите ~15 минут.';
  end if;
  if public._login_locked(v_code_bucket) then
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
    insert into audit_log(action, by_role) values ('login_admin', 'admin');
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
    insert into audit_log(action, group_id, detail, by_role)
      values ('login_starosta', v_group_id, left(coalesce(v_label, ''), 64), 'starosta');
    return json_build_object(
      'role', 'starosta',
      'groupId', v_group_id,
      'token', v_token,
      'label', coalesce(v_label, '')
    );
  end if;

  if v_ip is not null and v_ip <> 'unknown' then
    perform public._login_fail(v_ip_bucket, 8, interval '15 minutes');
  end if;
  perform public._login_fail(v_code_bucket, 8, interval '15 minutes');

  raise exception 'Неверный код';
end;
$$;

grant execute on function public.rasp_login(text, text) to anon, authenticated;
grant execute on function public._client_ip() to anon, authenticated;
