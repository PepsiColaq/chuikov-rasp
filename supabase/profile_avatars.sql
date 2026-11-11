-- Аватары старост/админа + автор на ДЗ.
-- Выполни один раз в Supabase → SQL Editor (после revoke_kills_sessions.sql).

alter table group_codes add column if not exists avatar_url text;
alter table app_meta add column if not exists admin_avatar_url text;

alter table homework add column if not exists author_code_id text;
alter table homework add column if not exists author_label text not null default '';
alter table homework add column if not exists author_avatar_url text;

create index if not exists homework_author_code_idx on homework (author_code_id);

-- URL аватара только из нашего storage
create or replace function public._rasp_is_avatar_url(p_url text)
returns boolean
language sql
immutable
as $$
  select
    p_url is not null
    and length(p_url) between 12 and 500
    and (
      p_url ~* '^https://[a-z0-9.-]+\.supabase\.co/storage/v1/object/public/hw-'
      or p_url ~* '^https://[a-z0-9.-]+\.workers\.dev/storage/v1/object/public/hw-'
    );
$$;

create or replace function public._session_avatar(s sessions)
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
    select nullif(trim(admin_avatar_url), '') into v from app_meta where id = 'main';
    return v;
  end if;
  if s.code_id is not null then
    select nullif(trim(avatar_url), '') into v from group_codes where id = s.code_id and active;
    return v;
  end if;
  return null;
end;
$$;

-- Профиль сессии (codeId + avatar) — для клиента
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

  return json_build_object(
    'role', s.role,
    'groupId', s.group_id,
    'token', s.token,
    'label', coalesce(s.label, ''),
    'codeId', s.code_id,
    'avatarUrl', coalesce(v_ava, '')
  );
end;
$$;

grant execute on function public.rasp_session(text) to anon, authenticated;

-- Поставить / сменить аватар
create or replace function public.rasp_set_avatar(p_token text, p_url text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_url text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;

  v_url := trim(coalesce(p_url, ''));
  if not public._rasp_is_avatar_url(v_url) then
    raise exception 'Недопустимый адрес фото';
  end if;

  if s.role = 'admin' then
    update app_meta set admin_avatar_url = v_url where id = 'main';
    update homework set author_avatar_url = v_url
      where author_code_id = 'admin' or (coalesce(author_code_id, '') = '' and author_label = 'admin');
  elsif s.role = 'starosta' and s.code_id is not null then
    update group_codes set avatar_url = v_url where id = s.code_id and active;
    if not found then raise exception 'Код не найден'; end if;
    update homework set author_avatar_url = v_url where author_code_id = s.code_id;
  else
    raise exception 'Нет прав';
  end if;

  insert into audit_log(action, group_id, detail, by_role)
    values ('avatar_set', s.group_id, left(v_url, 120), s.role);

  return json_build_object('avatarUrl', v_url);
end;
$$;

grant execute on function public.rasp_set_avatar(text, text) to anon, authenticated;

create or replace function public.rasp_clear_avatar(p_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;

  if s.role = 'admin' then
    update app_meta set admin_avatar_url = null where id = 'main';
    update homework set author_avatar_url = null
      where author_code_id = 'admin' or (coalesce(author_code_id, '') = '' and author_label = 'admin');
  elsif s.role = 'starosta' and s.code_id is not null then
    update group_codes set avatar_url = null where id = s.code_id and active;
    update homework set author_avatar_url = null where author_code_id = s.code_id;
  else
    raise exception 'Нет прав';
  end if;

  insert into audit_log(action, group_id, detail, by_role)
    values ('avatar_clear', s.group_id, coalesce(s.code_id, 'admin'), s.role);
end;
$$;

grant execute on function public.rasp_clear_avatar(text) to anon, authenticated;

-- ДЗ с автором (метка + code_id + аватар на момент публикации)
drop function if exists public.rasp_add_homework(text, text, text, text, date, text);
drop function if exists public.rasp_add_homework(text, text, text, text, date, text, text[]);
drop function if exists public.rasp_add_homework(text, text, text, text, date, text, text[], jsonb);

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

  -- allowlist attachment URLs (как в hardening)
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
    v_author_label := 'Админ';
  else
    v_author_code := s.code_id;
    v_author_label := left(trim(coalesce(s.label, '')), 64);
    if v_author_label = '' then v_author_label := 'Староста'; end if;
  end if;
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
