-- Имена на сайте: админ = «Никитос» (меняемое), старосты = пометка кода.
-- Смена пометки обновляет сессии и все ДЗ этого человека.
-- Выполни один раз в Supabase → SQL Editor (после profile_avatars.sql).

alter table app_meta add column if not exists admin_display_name text;
update app_meta
set admin_display_name = 'Никитос'
where id = 'main'
  and (admin_display_name is null or trim(admin_display_name) = '');

-- Живое имя для сессии
create or replace function public._session_display_label(s sessions)
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
    select nullif(trim(admin_display_name), '') into v from app_meta where id = 'main';
    return coalesce(v, 'Никитос');
  end if;
  if s.code_id is not null then
    select nullif(trim(label), '') into v from group_codes where id = s.code_id;
    if v is not null then return left(v, 64); end if;
  end if;
  v := nullif(trim(coalesce(s.label, '')), '');
  if v is not null and lower(v) not in ('admin', 'админ', 'староста') then
    return left(v, 64);
  end if;
  return 'Староста';
end;
$$;

-- Вход: админу сразу отдаём display name
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
      'codeId', null,
      'avatarUrl', coalesce(
        (select nullif(trim(admin_avatar_url), '') from app_meta where id = 'main'),
        ''
      )
    );
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
      'label', v_label,
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

-- Профиль сессии: живое имя + аватар
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

  -- подтянуть label в сессию, чтобы дальше было актуально
  if coalesce(s.label, '') is distinct from v_label then
    update sessions set label = v_label where token = p_token;
  end if;

  return json_build_object(
    'role', s.role,
    'groupId', s.group_id,
    'token', s.token,
    'label', coalesce(v_label, ''),
    'codeId', s.code_id,
    'avatarUrl', coalesce(v_ava, '')
  );
end;
$$;

grant execute on function public.rasp_session(text) to anon, authenticated;

-- ДЗ: автор = живое имя (не «Админ»/пусто)
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
  v_att jsonb := '[]'::jsonb;
  v_len int;
  elem jsonb;
  u text;
  cleaned jsonb := '[]'::jsonb;
  v_author_code text;
  v_author_label text;
  v_author_ava text;
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

  for elem in select * from jsonb_array_elements(v_att)
  loop
    u := coalesce(elem->>'url', '');
    if u <> '' and not (
      u ~* '^https://[a-z0-9.-]+\.supabase\.co/storage/v1/object/public/hw-'
      or u ~* '^https://[a-z0-9.-]+\.workers\.dev/storage/v1/object/public/hw-'
    ) then
      raise exception 'Недопустимая ссылка вложения';
    end if;
    cleaned := cleaned || jsonb_build_array(elem);
  end loop;
  v_att := cleaned;

  if length(trim(coalesce(p_body, ''))) = 0
     and coalesce(array_length(v_imgs, 1), 0) = 0
     and jsonb_array_length(v_att) = 0 then
    raise exception 'Укажите текст ДЗ или прикрепите файл';
  end if;
  if length(coalesce(p_body, '')) > 1000 then raise exception 'ДЗ слишком длинное'; end if;
  if coalesce(array_length(v_imgs, 1), 0) > 8 then raise exception 'Максимум 8 фото'; end if;
  if jsonb_array_length(v_att) > 8 then raise exception 'Максимум 8 файлов'; end if;

  if s.role = 'admin' then
    v_author_code := 'admin';
  else
    v_author_code := s.code_id;
  end if;
  v_author_label := public._session_display_label(s);
  v_author_ava := public._session_avatar(s);

  v_id := 'hw_' || encode(gen_random_bytes(8), 'hex');
  insert into homework(
    id, group_id, subject, body, due_date, lesson_id, images, attachments,
    author_code_id, author_label, author_avatar_url
  ) values (
    v_id,
    p_group_id,
    left(trim(p_subject), 80),
    left(trim(coalesce(p_body, '')), 1000),
    p_due_date,
    p_lesson_id,
    v_imgs,
    v_att,
    v_author_code,
    v_author_label,
    v_author_ava
  );

  begin
    insert into audit_log(action, group_id, detail, by_role)
      values (
        'homework_add',
        p_group_id,
        left(coalesce(v_author_label, s.role) || ' · ' || trim(p_subject) || ' · ' || v_id, 200),
        s.role
      );
  exception when others then
    insert into audit_log(action, group_id, detail, actor_role)
      values ('homework_add', p_group_id, left(trim(p_subject), 80), s.role);
  end;

  return json_build_object('id', v_id);
end;
$$;

grant execute on function public.rasp_add_homework(text, text, text, text, date, text, text[], jsonb) to anon, authenticated;

-- Админ: сменить своё отображаемое имя (везде, включая старые ДЗ)
create or replace function public.rasp_set_admin_display_name(p_token text, p_name text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_name text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null or s.role <> 'admin' then
    raise exception 'Только админ';
  end if;

  v_name := left(trim(coalesce(p_name, '')), 64);
  if v_name = '' then raise exception 'Укажи имя'; end if;

  update app_meta set admin_display_name = v_name where id = 'main';
  update sessions set label = v_name where role = 'admin' and expires_at > now();
  update homework
    set author_label = v_name
    where author_code_id = 'admin'
       or lower(trim(coalesce(author_label, ''))) in ('admin', 'админ');

  insert into audit_log(action, group_id, detail, by_role)
    values ('admin_display_name', null, left(v_name, 64), 'admin');

  return json_build_object('label', v_name);
end;
$$;

grant execute on function public.rasp_set_admin_display_name(text, text) to anon, authenticated;

-- Админ: сменить пометку кода → обновить сессии и все ДЗ этого человека
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

  select group_id, label into v_group, v_old
  from group_codes where id = p_code_id and active;
  if v_group is null then raise exception 'Код не найден'; end if;

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

  return json_build_object('id', p_code_id, 'label', v_name, 'groupId', v_group);
end;
$$;

grant execute on function public.rasp_rename_starosta_label(text, text, text) to anon, authenticated;

-- Бэкап имён на уже существующих ДЗ (где известен author_code_id)
update homework h
set author_label = left(trim(gc.label), 64)
from group_codes gc
where h.author_code_id = gc.id
  and coalesce(trim(gc.label), '') <> '';

update homework
set author_label = coalesce(
  (select nullif(trim(admin_display_name), '') from app_meta where id = 'main'),
  'Никитос'
)
where author_code_id = 'admin'
   or lower(trim(coalesce(author_label, ''))) in ('admin', 'админ');
