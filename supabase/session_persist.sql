-- Longer login sessions (30 days) so closing the browser doesn't log you out.
-- Run once in SQL Editor.

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
    delete from login_attempts where bucket = v_bucket;
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

  insert into login_attempts(bucket, fails, locked_until)
    values (v_bucket, 1, null)
  on conflict (bucket) do update
    set fails = case when login_attempts.fails + 1 >= 8 then 0 else login_attempts.fails + 1 end,
        locked_until = case when login_attempts.fails + 1 >= 8 then now() + interval '15 minutes' else login_attempts.locked_until end;

  raise exception 'Неверный код';
end;
$$;

grant execute on function public.rasp_login(text, text) to anon, authenticated;

-- prolong already-active sessions
update sessions
set expires_at = greatest(expires_at, now() + interval '30 days')
where expires_at > now();
