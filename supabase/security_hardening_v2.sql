-- Security hardening: kill-switch on writes, attachment URL allowlist, TG dialog state.
-- Run once in Supabase SQL Editor after support_tickets.sql / site_kill_switch.sql.

-- 1) Kill-switch: non-admin cannot write when site is off
create or replace function public._require_write(p_token text, p_group_id text)
returns sessions
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_on boolean;
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
    return s;
  end if;
  raise exception 'Нет прав на эту группу';
end;
$$;

revoke all on function public._require_write(text, text) from public;
grant execute on function public._require_write(text, text) to anon, authenticated;

-- 2) Helper: only storage URLs for this project
create or replace function public._rasp_is_hw_storage_url(p_url text)
returns boolean
language sql
immutable
as $$
  select
    p_url ~* '^https://[a-z0-9.-]+\.supabase\.co/storage/v1/object/public/hw-'
    or p_url ~* '^https://[a-z0-9.-]+\.workers\.dev/storage/v1/object/public/hw-';
$$;

-- 3) rasp_add_homework with attachment URL allowlist
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
begin
  s := public._require_write(p_token, p_group_id);
  if length(trim(coalesce(p_subject, ''))) = 0 then
    raise exception 'Укажите предмет';
  end if;

  v_imgs := coalesce(p_images, '{}');
  -- filter images to storage URLs only
  v_imgs := array(
    select x from unnest(v_imgs) as x
    where public._rasp_is_hw_storage_url(x)
  );

  if jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) <> 'array' then
    raise exception 'Неверный формат вложений';
  end if;

  for elem in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb))
  loop
    u := elem->>'url';
    if u is null or not public._rasp_is_hw_storage_url(u) then
      continue;
    end if;
    cleaned := cleaned || jsonb_build_array(
      jsonb_build_object(
        'url', u,
        'name', left(coalesce(elem->>'name', 'файл'), 120),
        'mime', left(coalesce(elem->>'mime', ''), 80)
      )
    );
  end loop;
  v_att := cleaned;
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

  begin
    insert into audit_log(action, group_id, detail, actor_role)
      values ('homework_add', p_group_id, left(trim(p_subject), 80), s.role);
  exception when undefined_column then
    insert into audit_log(action, group_id, detail, by_role)
      values ('homework_add', p_group_id, left(trim(p_subject), 80), s.role);
  when others then
    null;
  end;

  return json_build_object('id', v_id);
end;
$$;

grant execute on function public.rasp_add_homework(text, text, text, text, date, text, text[], jsonb) to anon, authenticated;

-- 4) Durable Telegram dialog state (awaiting question / admin reply target)
create table if not exists public.tg_chat_state (
  chat_id text primary key,
  mode text not null default 'idle',
  reply_ticket_id text,
  reply_user_id text,
  admin_index int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.tg_chat_state enable row level security;
