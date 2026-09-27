-- Chuikov schedule — run in Supabase SQL Editor (once).
create extension if not exists pgcrypto;

-- Stable text ids (match frontend)
create table if not exists groups (
  id text primary key,
  name text not null unique,
  faculty text default '',
  active boolean not null default true,
  starosta_code_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists app_meta (
  id text primary key default 'main',
  admin_code_hash text not null,
  semester_label text not null default ''
);

create table if not exists lessons (
  id text primary key,
  group_id text not null references groups(id) on delete cascade,
  day smallint not null check (day between 1 and 6),
  start_time text not null,
  end_time text not null,
  subject text not null,
  teacher text default '',
  room text default '',
  remote boolean not null default false,
  week_type text not null default 'every',
  pair smallint
);

create table if not exists overrides (
  id text primary key,
  group_id text not null references groups(id) on delete cascade,
  lesson_id text not null references lessons(id) on delete cascade,
  on_date date not null,
  type text not null check (type in ('room_only','subject','subject_and_room','cancelled')),
  new_room text default '',
  new_subject text default '',
  note text default '',
  unique (group_id, lesson_id, on_date)
);

create table if not exists homework (
  id text primary key,
  group_id text not null references groups(id) on delete cascade,
  subject text not null,
  body text not null,
  due_date date,
  lesson_id text references lessons(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  action text not null,
  group_id text,
  detail text default '',
  by_role text default ''
);

create table if not exists sessions (
  token text primary key,
  role text not null check (role in ('admin','starosta')),
  group_id text,
  expires_at timestamptz not null
);

create table if not exists login_attempts (
  bucket text primary key,
  fails int not null default 0,
  locked_until timestamptz
);

alter table groups enable row level security;
alter table lessons enable row level security;
alter table overrides enable row level security;
alter table homework enable row level security;
alter table audit_log enable row level security;
alter table app_meta enable row level security;
alter table sessions enable row level security;
alter table login_attempts enable row level security;

drop policy if exists "public read groups" on groups;
drop policy if exists "public read lessons" on lessons;
drop policy if exists "public read overrides" on overrides;
drop policy if exists "public read homework" on homework;
drop policy if exists "public read app_meta" on app_meta;

create policy "public read groups" on groups for select using (active = true);
create policy "public read lessons" on lessons for select using (true);
create policy "public read overrides" on overrides for select using (true);
create policy "public read homework" on homework for select using (true);

create or replace view public_app_info as
  select id, semester_label from app_meta;

grant select on public_app_info to anon, authenticated;
grant select on groups, lessons, homework, overrides to anon, authenticated;

create or replace function public.rasp_public_meta()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object('semesterLabel', semester_label) from app_meta where id = 'main';
$$;

grant execute on function public.rasp_public_meta() to anon, authenticated;

create or replace function public.hash_access_code(p_code text)
returns text
language sql
immutable
as $$
  select encode(digest('chuikov-rasp-v1:' || trim(p_code), 'sha256'), 'hex');
$$;

create or replace function public.rasp_login(p_code text, p_group_id text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_admin text;
  v_group groups%rowtype;
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

  if p_group_id is not null then
    select * into v_group from groups where id = p_group_id and active;
  else
    select * into v_group from groups where starosta_code_hash = v_hash and active limit 1;
  end if;

  if v_group.id is not null and v_group.starosta_code_hash = v_hash then
    delete from login_attempts where bucket = v_bucket;
    v_token := encode(gen_random_bytes(24), 'hex');
    insert into sessions(token, role, group_id, expires_at)
      values (v_token, 'starosta', v_group.id, now() + interval '12 hours');
    insert into audit_log(action, group_id, by_role) values ('login_starosta', v_group.id, 'starosta');
    return json_build_object('role','starosta','groupId',v_group.id,'token',v_token);
  end if;

  insert into login_attempts(bucket, fails, locked_until)
    values (v_bucket, 1, null)
  on conflict (bucket) do update
    set fails = case when login_attempts.fails + 1 >= 8 then 0 else login_attempts.fails + 1 end,
        locked_until = case when login_attempts.fails + 1 >= 8 then now() + interval '15 minutes' else login_attempts.locked_until end;

  raise exception 'Неверный код';
end;
$$;

create or replace function public.rasp_session(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare s sessions%rowtype;
begin
  if p_token is null then return null; end if;
  select * into s from sessions where token = p_token;
  if s.token is null or s.expires_at < now() then
    delete from sessions where token = p_token;
    return null;
  end if;
  return json_build_object('role', s.role, 'groupId', s.group_id, 'token', s.token);
end;
$$;

create or replace function public.rasp_logout(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from sessions where token = p_token;
end;
$$;

create or replace function public._require_write(p_token text, p_group_id text)
returns sessions
language plpgsql
security definer
set search_path = public
as $$
declare s sessions%rowtype;
begin
  select * into s from sessions where token = p_token;
  if s.token is null or s.expires_at < now() then
    raise exception 'Нужен вход старосты или админа';
  end if;
  if s.role = 'admin' then return s; end if;
  if s.role = 'starosta' and s.group_id = p_group_id then return s; end if;
  raise exception 'Нет прав на эту группу';
end;
$$;

create or replace function public.rasp_add_homework(
  p_token text, p_group_id text, p_subject text, p_body text, p_due_date date, p_lesson_id text
) returns json
language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype; v_id text;
begin
  s := public._require_write(p_token, p_group_id);
  if length(trim(p_subject)) = 0 or length(trim(p_body)) = 0 then
    raise exception 'Укажите предмет и текст ДЗ';
  end if;
  if length(p_body) > 1000 then raise exception 'ДЗ слишком длинное'; end if;
  v_id := 'hw_' || encode(gen_random_bytes(8), 'hex');
  insert into homework(id, group_id, subject, body, due_date, lesson_id)
    values (v_id, p_group_id, left(trim(p_subject),80), left(trim(p_body),1000), p_due_date, p_lesson_id);
  insert into audit_log(action, group_id, detail, by_role)
    values ('homework_add', p_group_id, left(trim(p_subject),80), s.role);
  return json_build_object('id', v_id);
end;
$$;

create or replace function public.rasp_delete_homework(p_token text, p_group_id text, p_hw_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype;
begin
  s := public._require_write(p_token, p_group_id);
  delete from homework where id = p_hw_id and group_id = p_group_id;
  insert into audit_log(action, group_id, detail, by_role)
    values ('homework_delete', p_group_id, p_hw_id, s.role);
end;
$$;

create or replace function public.rasp_set_override(
  p_token text, p_group_id text, p_lesson_id text, p_date date,
  p_type text, p_new_room text, p_new_subject text, p_note text
) returns json
language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype; v_id text;
begin
  s := public._require_write(p_token, p_group_id);
  if p_type not in ('room_only','subject','subject_and_room','cancelled') then
    raise exception 'Неверный тип замены';
  end if;
  delete from overrides where group_id = p_group_id and lesson_id = p_lesson_id and on_date = p_date;
  v_id := 'ovr_' || encode(gen_random_bytes(8), 'hex');
  insert into overrides(id, group_id, lesson_id, on_date, type, new_room, new_subject, note)
    values (v_id, p_group_id, p_lesson_id, p_date, p_type,
      left(coalesce(p_new_room,''),32), left(coalesce(p_new_subject,''),80), left(coalesce(p_note,''),200));
  insert into audit_log(action, group_id, detail, by_role)
    values ('override_set', p_group_id, p_type || ' ' || p_date::text, s.role);
  return json_build_object('id', v_id);
end;
$$;

create or replace function public.rasp_clear_override(p_token text, p_group_id text, p_override_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype;
begin
  s := public._require_write(p_token, p_group_id);
  delete from overrides where id = p_override_id and group_id = p_group_id;
  insert into audit_log(action, group_id, detail, by_role)
    values ('override_clear', p_group_id, p_override_id, s.role);
end;
$$;

create or replace function public.rasp_create_group(
  p_token text, p_name text, p_faculty text, p_starosta_code text
) returns json
language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype; v_id text;
begin
  select * into s from sessions where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then raise exception 'Только админ'; end if;
  if length(trim(p_starosta_code)) < 8 then raise exception 'Код слишком короткий'; end if;
  v_id := 'g_' || lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9а-яА-ЯёЁ]+', '_', 'g'));
  insert into groups(id, name, faculty, starosta_code_hash)
    values (v_id, left(trim(p_name),48), left(coalesce(p_faculty,''),32), public.hash_access_code(p_starosta_code));
  insert into audit_log(action, group_id, detail, by_role)
    values ('group_create', v_id, trim(p_name), 'admin');
  return json_build_object('id', v_id, 'name', trim(p_name));
end;
$$;

create or replace function public.rasp_reset_code(p_token text, p_group_id text, p_new_code text)
returns void
language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype;
begin
  select * into s from sessions where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then raise exception 'Только админ'; end if;
  if length(trim(p_new_code)) < 8 then raise exception 'Код слишком короткий'; end if;
  update groups set starosta_code_hash = public.hash_access_code(p_new_code) where id = p_group_id;
  insert into audit_log(action, group_id, by_role) values ('code_reset', p_group_id, 'admin');
end;
$$;

create or replace function public.rasp_reset_semester(p_token text, p_group_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype;
begin
  select * into s from sessions where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then raise exception 'Только админ'; end if;
  delete from homework where group_id = p_group_id;
  delete from overrides where group_id = p_group_id;
  delete from lessons where group_id = p_group_id;
  insert into audit_log(action, group_id, by_role) values ('semester_reset', p_group_id, 'admin');
end;
$$;

grant execute on function public.rasp_login(text, text) to anon, authenticated;
grant execute on function public.rasp_session(text) to anon, authenticated;
grant execute on function public.rasp_logout(text) to anon, authenticated;
grant execute on function public.rasp_add_homework(text, text, text, text, date, text) to anon, authenticated;
grant execute on function public.rasp_delete_homework(text, text, text) to anon, authenticated;
grant execute on function public.rasp_set_override(text, text, text, date, text, text, text, text) to anon, authenticated;
grant execute on function public.rasp_clear_override(text, text, text) to anon, authenticated;
grant execute on function public.rasp_create_group(text, text, text, text) to anon, authenticated;
grant execute on function public.rasp_reset_code(text, text, text) to anon, authenticated;
grant execute on function public.rasp_reset_semester(text, text) to anon, authenticated;
