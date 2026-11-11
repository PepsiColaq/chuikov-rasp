-- Revoke ALL starosta codes. Admin code stays (NikitosBrateevec1455).
-- Run once in Supabase SQL Editor, then create codes yourself in the admin panel.

delete from group_codes;

-- kill legacy single-hash login (old Starosta0903! etc.)
update groups set starosta_code_hash = 'revoked_' || id;

-- login: only active rows in group_codes (no legacy hash match)
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
  v_token text;
  v_bucket text;
  v_fails int;
  v_locked timestamptz;
begin
  if p_code is null or length(trim(p_code)) < 8 then
    raise exception 'Код слишком короткий';
  end if;

  v_bucket := coalesce(p_group_id, 'any');
  select fails, locked_until into v_fails, v_locked from login_attempts where bucket = v_bucket;
  if v_locked is not null and v_locked > now() then
    raise exception 'Слишком много попыток. Подождите.';
  end if;

  v_hash := public.hash_access_code(p_code);
  select admin_code_hash into v_admin from app_meta where id = 'main';

  if v_admin is not null and v_hash = v_admin then
    delete from login_attempts where bucket = v_bucket;
    v_token := encode(gen_random_bytes(24), 'hex');
    insert into sessions(token, role, group_id, expires_at)
      values (v_token, 'admin', null, now() + interval '12 hours');
    insert into audit_log(action, by_role) values ('login_admin', 'admin');
    return json_build_object('role','admin','groupId',null,'token',v_token);
  end if;

  select gc.group_id into v_group_id
  from group_codes gc
  join groups g on g.id = gc.group_id
  where gc.code_hash = v_hash
    and gc.active
    and g.active
    and (p_group_id is null or gc.group_id = p_group_id)
  limit 1;

  if v_group_id is not null then
    delete from login_attempts where bucket = v_bucket;
    v_token := encode(gen_random_bytes(24), 'hex');
    insert into sessions(token, role, group_id, expires_at)
      values (v_token, 'starosta', v_group_id, now() + interval '12 hours');
    insert into audit_log(action, group_id, by_role) values ('login_starosta', v_group_id, 'starosta');
    return json_build_object('role','starosta','groupId',v_group_id,'token',v_token);
  end if;

  insert into login_attempts(bucket, fails, locked_until)
    values (v_bucket, 1, null)
  on conflict (bucket) do update
    set fails = case when login_attempts.fails + 1 >= 8 then 0 else login_attempts.fails + 1 end,
        locked_until = case when login_attempts.fails + 1 >= 8 then now() + interval '15 minutes' else login_attempts.locked_until end;

  raise exception 'Неверный код';
end;
$$;

-- add code only into group_codes for the chosen group_id
create or replace function public.rasp_add_starosta_code(
  p_token text,
  p_group_id text,
  p_code text,
  p_label text default ''
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_id text;
  v_hash text;
  v_name text;
begin
  select * into s from sessions where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then raise exception 'Нужна админ-сессия'; end if;

  select name into v_name from groups where id = p_group_id and active;
  if v_name is null then raise exception 'Группа не найдена'; end if;

  if length(trim(coalesce(p_code, ''))) < 8 then
    raise exception 'Код слишком короткий (мин. 8)';
  end if;

  v_hash := public.hash_access_code(p_code);
  if exists (select 1 from group_codes where code_hash = v_hash and active) then
    raise exception 'Такой код уже используется';
  end if;
  if v_hash = (select admin_code_hash from app_meta where id = 'main') then
    raise exception 'Нельзя использовать админ-код';
  end if;

  -- reactivate if same hash was revoked earlier
  update group_codes
    set active = true, group_id = p_group_id, label = left(trim(coalesce(p_label, '')), 64)
    where code_hash = v_hash
    returning id into v_id;

  if v_id is null then
    v_id := 'gc_' || encode(gen_random_bytes(8), 'hex');
    insert into group_codes(id, group_id, code_hash, label, active)
      values (v_id, p_group_id, v_hash, left(trim(coalesce(p_label, '')), 64), true);
  end if;

  insert into audit_log(action, group_id, detail, by_role)
    values (
      'starosta_code_add',
      p_group_id,
      left(trim(v_name || ' · ' || coalesce(p_label, '')), 80),
      'admin'
    );

  return json_build_object(
    'id', v_id,
    'groupId', p_group_id,
    'groupName', v_name,
    'label', left(trim(coalesce(p_label, '')), 64)
  );
end;
$$;
