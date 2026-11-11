-- Store starosta code label on session + put it into audit details.
-- So admin can see WHO (by code label) added/deleted HW.
-- Run in Supabase SQL Editor once.

alter table sessions add column if not exists label text not null default '';

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
    insert into sessions(token, role, group_id, expires_at, label)
      values (v_token, 'admin', null, now() + interval '30 days', 'admin');
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
    v_label := left(trim(coalesce(v_label, '')), 64);
    insert into sessions(token, role, group_id, expires_at, label)
      values (v_token, 'starosta', v_group_id, now() + interval '30 days', v_label);
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

-- Helper: who string for audit detail
create or replace function public._actor_tag(s sessions)
returns text
language sql
immutable
as $$
  select case
    when s.role = 'admin' then 'admin'
    when coalesce(s.label, '') <> '' then s.role || ':' || left(s.label, 40)
    else s.role
  end;
$$;

-- Patch homework add to include actor label
create or replace function public.rasp_add_homework(
  p_token text,
  p_group_id text,
  p_subject text,
  p_body text,
  p_due_date date,
  p_lesson_id text,
  p_images text[] default '{}',
  p_attachments jsonb default '[]'::jsonb
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_id text;
  v_imgs text[];
  v_att jsonb;
  v_len int;
begin
  s := public._require_write(p_token, p_group_id);
  if length(trim(coalesce(p_subject, ''))) = 0 then
    raise exception 'Укажите предмет';
  end if;

  v_imgs := coalesce(p_images, '{}');
  v_att := coalesce(p_attachments, '[]'::jsonb);
  if jsonb_typeof(v_att) <> 'array' then
    raise exception 'Неверный формат вложений';
  end if;
  v_len := jsonb_array_length(v_att);

  if length(trim(coalesce(p_body, ''))) = 0
     and coalesce(array_length(v_imgs, 1), 0) = 0
     and v_len = 0 then
    raise exception 'Укажите текст ДЗ или прикрепите файл';
  end if;
  if length(coalesce(p_body, '')) > 1000 then raise exception 'ДЗ слишком длинное'; end if;
  if coalesce(array_length(v_imgs, 1), 0) > 8 then raise exception 'Максимум 8 фото'; end if;
  if v_len > 8 then raise exception 'Максимум 8 файлов'; end if;

  v_id := 'hw_' || encode(gen_random_bytes(8), 'hex');
  insert into homework(id, group_id, subject, body, due_date, lesson_id, images, attachments)
    values (
      v_id,
      p_group_id,
      left(trim(p_subject), 80),
      left(trim(coalesce(p_body, '')), 1000),
      p_due_date,
      p_lesson_id,
      v_imgs,
      v_att
    );
  perform public._write_audit(
    'homework_add',
    p_group_id,
    left(public._actor_tag(s) || ' · ' || trim(p_subject) || ' · ' || v_id, 200),
    s.role
  );
  return json_build_object('id', v_id);
end;
$$;

grant execute on function public.rasp_add_homework(text, text, text, text, date, text, text[], jsonb) to anon, authenticated;

create or replace function public.rasp_delete_homework(p_token text, p_group_id text, p_hw_id text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare s sessions%rowtype;
begin
  s := public._require_write(p_token, p_group_id);
  delete from homework where id = p_hw_id and group_id = p_group_id;
  perform public._write_audit(
    'homework_delete',
    p_group_id,
    left(public._actor_tag(s) || ' · ' || coalesce(p_hw_id, ''), 200),
    s.role
  );
end;
$$;

grant execute on function public.rasp_delete_homework(text, text, text) to anon, authenticated;

create or replace function public.rasp_set_override(
  p_token text, p_group_id text, p_lesson_id text, p_date date,
  p_type text, p_new_room text, p_new_subject text, p_note text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare s sessions%rowtype; v_id text;
begin
  s := public._require_write(p_token, p_group_id);
  if p_type not in ('room_only', 'subject', 'subject_and_room', 'cancelled') then
    raise exception 'Неверный тип замены';
  end if;
  delete from overrides
  where group_id = p_group_id and lesson_id = p_lesson_id and on_date = p_date;
  v_id := 'ovr_' || encode(gen_random_bytes(8), 'hex');
  insert into overrides(id, group_id, lesson_id, on_date, type, new_room, new_subject, note)
    values (
      v_id, p_group_id, p_lesson_id, p_date, p_type,
      left(trim(coalesce(p_new_room, '')), 32),
      left(trim(coalesce(p_new_subject, '')), 80),
      left(trim(coalesce(p_note, '')), 200)
    );
  perform public._write_audit(
    'override_set',
    p_group_id,
    left(public._actor_tag(s) || ' · ' || p_type || ' · ' || p_date::text, 200),
    s.role
  );
  return json_build_object('id', v_id);
end;
$$;

grant execute on function public.rasp_set_override(text, text, text, date, text, text, text, text) to anon, authenticated;

create or replace function public.rasp_clear_override(p_token text, p_group_id text, p_override_id text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare s sessions%rowtype;
begin
  s := public._require_write(p_token, p_group_id);
  delete from overrides where id = p_override_id and group_id = p_group_id;
  perform public._write_audit(
    'override_clear',
    p_group_id,
    left(public._actor_tag(s) || ' · ' || coalesce(p_override_id, ''), 200),
    s.role
  );
end;
$$;

grant execute on function public.rasp_clear_override(text, text, text) to anon, authenticated;
