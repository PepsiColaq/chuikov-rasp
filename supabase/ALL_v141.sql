-- ════════════════════════════════════════════════════════════════
-- НАЧАЛО: аватары всех студентов, факультеты в ленте, роль «Лента»   (avatars_and_news_scope.sql)
-- ════════════════════════════════════════════════════════════════
-- Аватар для ЛЮБОГО студента + подпись к фото в новостях.
-- Выполни один раз в Supabase → SQL Editor. Можно повторять.

alter table public.students
  add column if not exists avatar_url text;

alter table public.news
  add column if not exists faculties jsonb not null default '[]'::jsonb;

-- Новая роль группы: право вести ленту новостей.
alter table public.group_staff drop constraint if exists group_staff_kind_check;
alter table public.group_staff
  add constraint group_staff_kind_check check (kind in ('deputy', 'hw', 'news'));
-- ── Возможность «news» в _group_capability ────────────────────────────
create or replace function public._group_capability(p_token text, p_group_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_role text;
  v_kind text;
  v_all boolean := false;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then return null; end if;
  if s.role = 'admin' then return 'admin'; end if;

  if s.code_id is not null then
    select coalesce(all_groups, false) into v_all
    from group_codes where id = s.code_id and active;
    if coalesce(v_all, false) then return 'starosta'; end if;
  end if;
  if s.role in ('starosta', 'teacher') and s.group_id = p_group_id then
    return 'starosta';
  end if;

  if s.code_id is not null then
    select coalesce(role, 'student') into v_role
    from students where id = s.code_id and active and group_id = p_group_id;
    if v_role in ('starosta', 'teacher') then return 'starosta'; end if;
  end if;

  if s.code_id is not null then
    select kind into v_kind
    from group_staff
    where group_id = p_group_id and student_id = s.code_id
    order by case kind when 'deputy' then 0 when 'news' then 1 else 2 end
    limit 1;
    if v_kind = 'deputy' then return 'deputy'; end if;
    if v_kind = 'news' then return 'news'; end if;
    if v_kind = 'hw' then return 'hw'; end if;
  end if;

  if s.group_id = p_group_id then return 'student'; end if;
  return null;
end;
$$;

revoke all on function public._group_capability(text, text) from public;
grant execute on function public._group_capability(text, text) to anon, authenticated;

-- ── Аватар любого студента ────────────────────────────────────────────
create or replace function public.rasp_set_avatar(p_token text, p_url text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_url text;
  v_is_code boolean;
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
  elsif s.code_id is not null then
    select exists (select 1 from group_codes where id = s.code_id) into v_is_code;
    if v_is_code then
      update group_codes set avatar_url = v_url where id = s.code_id and active;
      if not found then raise exception 'Код не найден'; end if;
    else
      update students set avatar_url = v_url where id = s.code_id and active;
      if not found then raise exception 'Код не найден'; end if;
    end if;
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
  v_is_code boolean;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;

  if s.role = 'admin' then
    update app_meta set admin_avatar_url = null where id = 'main';
    update homework set author_avatar_url = null
      where author_code_id = 'admin' or (coalesce(author_code_id, '') = '' and author_label = 'admin');
  elsif s.code_id is not null then
    select exists (select 1 from group_codes where id = s.code_id) into v_is_code;
    if v_is_code then
      update group_codes set avatar_url = null where id = s.code_id;
    else
      update students set avatar_url = null where id = s.code_id;
    end if;
    update homework set author_avatar_url = null where author_code_id = s.code_id;
  else
    raise exception 'Нет прав';
  end if;

  insert into audit_log(action, group_id, detail, by_role)
    values ('avatar_clear', s.group_id, coalesce(s.code_id, 'admin'), s.role);
end;
$$;

grant execute on function public.rasp_clear_avatar(text) to anon, authenticated;

-- Выдача: закреплённые сверху, далее ручной порядок, далее свежие.
create or replace function public.rasp_news(
  p_group_id text default null,
  p_limit int default 40
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 40), 100));
begin
  return coalesce((
    select json_agg(json_build_object(
      'id', n.id,
      'groupId', n.group_id,
      'title', n.title,
      'body', n.body,
      'attachments', n.attachments,
      'faculties', n.faculties,
      'author', n.author_label,
      'pinned', n.pinned,
      'sortOrder', n.sort_order,
      'createdAt', n.created_at
    ) order by n.pinned desc, n.sort_order desc, n.created_at desc)
    from (
      select * from public.news
      where deleted = false
        and (group_id is null or group_id = p_group_id)
      order by pinned desc, sort_order desc, created_at desc
      limit v_limit
    ) n
  ), '[]'::json);
end;
$$;

revoke all on function public.rasp_news(text, int) from public;
grant execute on function public.rasp_news(text, int) to anon, authenticated;

-- Кто может публиковать: админ, староста, зам старосты, а также любой,
-- кому в «Моей группе» выдали право «Лента».
create or replace function public._require_news_write(p_token text, p_group_id text)
returns sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_cap text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;

  v_cap := public._group_capability(p_token, p_group_id);
  if v_cap in ('admin', 'starosta', 'deputy', 'news') then
    return s;
  end if;
  raise exception 'Публиковать события может староста, его зам или редактор ленты';
end;
$$;

revoke all on function public._require_news_write(text, text) from public;
grant execute on function public._require_news_write(text, text) to anon, authenticated;

-- ── Публикация: p_faculties — список факультетов, [] = все ────────────
create or replace function public.rasp_add_news(
  p_token text,
  p_group_id text,
  p_title text,
  p_body text default '',
  p_attachments jsonb default '[]'::jsonb,
  p_pinned boolean default false,
  p_faculties jsonb default '[]'::jsonb
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_title text;
  v_body text;
  v_id text;
  v_label text;
  v_atts jsonb;
  v_facs jsonb;
  v_count int;
begin
  s := public._require_news_write(p_token, p_group_id);

  v_title := left(trim(coalesce(p_title, '')), 120);
  if v_title = '' then raise exception 'Нужен заголовок'; end if;
  v_body := left(trim(coalesce(p_body, '')), 4000);

  v_atts := coalesce((
    select jsonb_agg(jsonb_build_object(
      'url', item->>'url',
      'name', left(coalesce(item->>'name', 'файл'), 120),
      'mime', coalesce(item->>'mime', '')
    ))
    from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) item
    where coalesce(item->>'url', '') <> ''
  ), '[]'::jsonb);

  -- Оставляем только «человеческие» названия, без мусора и дублей.
  v_facs := coalesce((
    select jsonb_agg(distinct left(trim(value), 80))
    from jsonb_array_elements_text(coalesce(p_faculties, '[]'::jsonb)) value
    where trim(value) <> ''
  ), '[]'::jsonb);

  -- Не больше 10 живых событий на группу: старые сами не удаляются,
  -- но публикация сверх лимита останавливается с понятным текстом.
  select count(*) into v_count
  from public.news
  where deleted = false and group_id is not distinct from p_group_id;
  if v_count >= 10 then
    raise exception 'В ленте уже 10 событий — удали лишние, чтобы добавить новое';
  end if;

  v_label := public._session_display_label(s);
  v_id := 'news_' || encode(gen_random_bytes(10), 'hex');

  insert into public.news(id, group_id, title, body, attachments, faculties, author_label, author_code_id, pinned)
  values (v_id, p_group_id, v_title, v_body, v_atts, v_facs, v_label, s.code_id, coalesce(p_pinned, false));

  insert into audit_log(action, group_id, detail, by_role)
  values ('news_add', p_group_id, left(v_title, 80), s.role);

  return json_build_object('id', v_id, 'title', v_title, 'pinned', coalesce(p_pinned, false));
end;
$$;

revoke all on function public.rasp_add_news(text, text, text, text, jsonb, boolean, jsonb) from public;
grant execute on function public.rasp_add_news(text, text, text, text, jsonb, boolean, jsonb) to anon, authenticated;

-- Старая сигнатура без факультетов — тонкая обёртка, чтобы не сломать старый клиент.
drop function if exists public.rasp_add_news(text, text, text, text, jsonb, boolean);
create or replace function public.rasp_add_news(
  p_token text,
  p_group_id text,
  p_title text,
  p_body text,
  p_attachments jsonb,
  p_pinned boolean
)
returns json
language sql
security definer
set search_path = public
as $$
  select public.rasp_add_news(p_token, p_group_id, p_title, p_body, p_attachments, p_pinned, '[]'::jsonb);
$$;

grant execute on function public.rasp_add_news(text, text, text, text, jsonb, boolean) to anon, authenticated;

-- ── Список ролей: добавляем newsEditors ───────────────────────────────
create or replace function public.rasp_staff_list(p_token text, p_group_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap text;
begin
  v_cap := public._group_capability(p_token, p_group_id);
  if v_cap is null then raise exception 'Нет доступа к группе'; end if;

  return json_build_object(
    'me', v_cap,
    'deputyLimit', 4,
    'deputies', coalesce((
      select json_agg(json_build_object(
        'id', gs.id, 'studentId', gs.student_id,
        'fullName', st.full_name, 'surname', st.surname
      ) order by st.surname)
      from group_staff gs join students st on st.id = gs.student_id
      where gs.group_id = p_group_id and gs.kind = 'deputy'
    ), '[]'::json),
    'hwEditors', coalesce((
      select json_agg(json_build_object(
        'id', gs.id, 'studentId', gs.student_id,
        'fullName', st.full_name, 'surname', st.surname
      ) order by st.surname)
      from group_staff gs join students st on st.id = gs.student_id
      where gs.group_id = p_group_id and gs.kind = 'hw'
    ), '[]'::json),
    'newsEditors', coalesce((
      select json_agg(json_build_object(
        'id', gs.id, 'studentId', gs.student_id,
        'fullName', st.full_name, 'surname', st.surname
      ) order by st.surname)
      from group_staff gs join students st on st.id = gs.student_id
      where gs.group_id = p_group_id and gs.kind = 'news'
    ), '[]'::json),
    'students', coalesce((
      select json_agg(json_build_object(
        'id', st.id, 'fullName', st.full_name, 'surname', st.surname,
        'role', coalesce(st.role, 'student')
      ) order by st.sort_order, st.surname)
      from students st where st.group_id = p_group_id and st.active
    ), '[]'::json)
  );
end;
$$;

revoke all on function public.rasp_staff_list(text, text) from public;
grant execute on function public.rasp_staff_list(text, text) to anon, authenticated;

-- ── Назначение ролей: deputy (макс 4) | hw | news ─────────────────────
create or replace function public.rasp_staff_set(
  p_token text,
  p_group_id text,
  p_student_id text,
  p_kind text,
  p_on boolean default true
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_cap text;
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_count int;
  v_id text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;
  if v_kind not in ('deputy', 'hw', 'news') then raise exception 'Неизвестная роль'; end if;

  v_cap := public._group_capability(p_token, p_group_id);
  if v_cap not in ('admin', 'starosta', 'deputy') then
    raise exception 'Назначать может староста, его зам или админ';
  end if;
  -- Замов назначает только староста или админ: зам не расширяет свои права.
  if v_kind = 'deputy' and v_cap not in ('admin', 'starosta') then
    raise exception 'Замов назначает староста или админ';
  end if;

  if not exists (
    select 1 from students where id = p_student_id and group_id = p_group_id and active
  ) then
    raise exception 'Такого студента нет в группе';
  end if;

  if coalesce(p_on, true) then
    if v_kind = 'deputy' then
      select count(*) into v_count from group_staff where group_id = p_group_id and kind = 'deputy';
      if v_count >= 4 then raise exception 'Замов уже 4 — сначала сними одного'; end if;
    end if;
    if not exists (
      select 1 from group_staff
      where group_id = p_group_id and student_id = p_student_id and kind = v_kind
    ) then
      v_id := 'gs_' || encode(gen_random_bytes(8), 'hex');
      insert into group_staff(id, group_id, student_id, kind, granted_by)
      values (v_id, p_group_id, p_student_id, v_kind, s.code_id);
    end if;
  else
    delete from group_staff
    where group_id = p_group_id and student_id = p_student_id and kind = v_kind;
  end if;

  insert into audit_log(action, group_id, detail, by_role)
  values (
    case when coalesce(p_on, true) then 'staff_add' else 'staff_remove' end,
    p_group_id, v_kind || ':' || p_student_id, s.role
  );

  return public.rasp_staff_list(p_token, p_group_id);
end;
$$;

revoke all on function public.rasp_staff_set(text, text, text, text, boolean) from public;
grant execute on function public.rasp_staff_set(text, text, text, text, boolean) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════
-- ДАЛЬШЕ: кураторы (роль, права, журнал, лента)   (curators.sql)
-- ════════════════════════════════════════════════════════════════
-- Кураторы: админ назначает куратора, куратор — старост и права внутри своих групп.
-- Выполни один раз в Supabase → SQL Editor. Можно повторять.
--
-- Иерархия:
--   админ    → назначает кураторов, всё остальное;
--   куратор  → назначает старост своих групп, выдаёт права (зам/ДЗ/лента);
--   староста → выдаёт права (зам/ДЗ/лента), ведёт журнал и построение.

-- ── Разрешаем роль 'curator' в сессиях ────────────────────────────────
alter table public.sessions drop constraint if exists sessions_role_check;
alter table public.sessions
  add constraint sessions_role_check check (role in ('admin', 'starosta', 'student', 'curator'));
create table if not exists public.curators (
  id text primary key,
  -- null = все группы колледжа
  group_id text references groups(id) on delete cascade,
  -- код доступа куратора (хранится как хеш, как и остальные коды)
  code_hash text not null unique,
  code_plain text,
  label text not null default 'Куратор',
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists curators_group_idx on public.curators (group_id, active);
create index if not exists curators_hash_idx on public.curators (code_hash);

alter table public.curators enable row level security;
drop policy if exists "no direct curators" on public.curators;
create policy "no direct curators" on public.curators for select using (false);

-- ── Возможность куратора для группы ───────────────────────────────────
-- 'curator' — куратор этой группы или всех групп.
create or replace function public._curator_for(p_token text, p_group_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_ok boolean;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then return false; end if;
  if s.role = 'admin' then return true; end if;
  if s.code_id is null then return false; end if;

  select exists (
    select 1 from curators c
    where c.id = s.code_id
      and c.active
      and (c.group_id is null or c.group_id = p_group_id)
  ) into v_ok;

  return coalesce(v_ok, false);
end;
$$;

revoke all on function public._curator_for(text, text) from public;
grant execute on function public._curator_for(text, text) to anon, authenticated;

-- ── Capability: добавляем куратора выше старосты ──────────────────────
create or replace function public._group_capability(p_token text, p_group_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_role text;
  v_kind text;
  v_all boolean := false;
  v_cur boolean;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then return null; end if;
  if s.role = 'admin' then return 'admin'; end if;

  -- Куратор: главнее старосты, но не админ.
  v_cur := public._curator_for(p_token, p_group_id);
  if coalesce(v_cur, false) then return 'curator'; end if;

  if s.code_id is not null then
    select coalesce(all_groups, false) into v_all
    from group_codes where id = s.code_id and active;
    if coalesce(v_all, false) then return 'starosta'; end if;
  end if;
  if s.role in ('starosta', 'teacher') and s.group_id = p_group_id then
    return 'starosta';
  end if;

  if s.code_id is not null then
    select coalesce(role, 'student') into v_role
    from students where id = s.code_id and active and group_id = p_group_id;
    if v_role in ('starosta', 'teacher') then return 'starosta'; end if;
  end if;

  if s.code_id is not null then
    select kind into v_kind
    from group_staff
    where group_id = p_group_id and student_id = s.code_id
    order by case kind when 'deputy' then 0 when 'news' then 1 else 2 end
    limit 1;
    if v_kind = 'deputy' then return 'deputy'; end if;
    if v_kind = 'news' then return 'news'; end if;
    if v_kind = 'hw' then return 'hw'; end if;
  end if;

  if s.group_id = p_group_id then return 'student'; end if;
  return null;
end;
$$;

revoke all on function public._group_capability(text, text) from public;
grant execute on function public._group_capability(text, text) to anon, authenticated;

-- ── Куратор пишет в журнал и ведёт ленту ──────────────────────────────
create or replace function public._journal_editor(p_token text, p_group_id text)
returns sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_cap text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then
    raise exception 'Нужен вход старосты, преподавателя или админа';
  end if;

  v_cap := public._group_capability(p_token, p_group_id);
  if v_cap in ('admin', 'curator', 'starosta', 'deputy') then
    return s;
  end if;

  raise exception 'Оценки ставит староста, его зам, куратор или админ';
end;
$$;

revoke all on function public._journal_editor(text, text) from public;
grant execute on function public._journal_editor(text, text) to anon, authenticated;

-- ── rasp_staff_set: куратор тоже может назначать ──────────────────────
create or replace function public.rasp_staff_set(
  p_token text,
  p_group_id text,
  p_student_id text,
  p_kind text,
  p_on boolean default true
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_cap text;
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_count int;
  v_id text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;
  if v_kind not in ('deputy', 'hw', 'news') then raise exception 'Неизвестная роль'; end if;

  v_cap := public._group_capability(p_token, p_group_id);
  if v_cap not in ('admin', 'curator', 'starosta', 'deputy') then
    raise exception 'Назначать может староста, его зам, куратор или админ';
  end if;
  -- Замов назначают староста, куратор или админ: зам не расширяет свои права.
  if v_kind = 'deputy' and v_cap not in ('admin', 'curator', 'starosta') then
    raise exception 'Замов назначает староста, куратор или админ';
  end if;

  if not exists (
    select 1 from students where id = p_student_id and group_id = p_group_id and active
  ) then
    raise exception 'Такого студента нет в группе';
  end if;

  if coalesce(p_on, true) then
    if v_kind = 'deputy' then
      select count(*) into v_count from group_staff where group_id = p_group_id and kind = 'deputy';
      if v_count >= 4 then raise exception 'Замов уже 4 — сначала сними одного'; end if;
    end if;
    if not exists (
      select 1 from group_staff
      where group_id = p_group_id and student_id = p_student_id and kind = v_kind
    ) then
      v_id := 'gs_' || encode(gen_random_bytes(8), 'hex');
      insert into group_staff(id, group_id, student_id, kind, granted_by)
      values (v_id, p_group_id, p_student_id, v_kind, s.code_id);
    end if;
  else
    delete from group_staff
    where group_id = p_group_id and student_id = p_student_id and kind = v_kind;
  end if;

  insert into audit_log(action, group_id, detail, by_role)
  values (
    case when coalesce(p_on, true) then 'staff_add' else 'staff_remove' end,
    p_group_id, v_kind || ':' || p_student_id, s.role
  );

  return public.rasp_staff_list(p_token, p_group_id);
end;
$$;

revoke all on function public.rasp_staff_set(text, text, text, text, boolean) from public;
grant execute on function public.rasp_staff_set(text, text, text, text, boolean) to anon, authenticated;

-- ── Куратор ведёт ленту ───────────────────────────────────────────────
-- Переопределяем проверку из avatars_and_news_scope.sql: этот файл
-- выполняется позже, поэтому версия ниже и остаётся действующей.
create or replace function public._require_news_write(p_token text, p_group_id text)
returns sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_cap text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;

  v_cap := public._group_capability(p_token, p_group_id);
  if v_cap in ('admin', 'curator', 'starosta', 'deputy', 'news') then
    return s;
  end if;
  raise exception 'Публиковать события может староста, его зам или редактор ленты';
end;
$$;

revoke all on function public._require_news_write(text, text) from public;
grant execute on function public._require_news_write(text, text) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════
-- ДАЛЬШЕ: админ выдаёт кураторов, куратор назначает старосту   (curators_admin.sql)
-- ════════════════════════════════════════════════════════════════
-- Управление кураторами и назначение старост. Продолжение curators.sql.
-- Выполни после curators.sql.

-- ── Список кураторов (только админ) ───────────────────────────────────
create or replace function public.rasp_curators_list(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;
  if s.role <> 'admin' then raise exception 'Только админ'; end if;

  return coalesce((
    select json_agg(json_build_object(
      'id', c.id,
      'groupId', c.group_id,
      'groupName', g.name,
      'label', c.label,
      'code', coalesce(c.code_plain, ''),
      'active', c.active,
      'createdAt', c.created_at
    ) order by c.created_at desc)
    from curators c
    left join groups g on g.id = c.group_id
    where c.active
  ), '[]'::json);
end;
$$;

revoke all on function public.rasp_curators_list(text) from public;
grant execute on function public.rasp_curators_list(text) to anon, authenticated;

-- ── Создать куратора (только админ) ───────────────────────────────────
-- p_group_id = null → куратор всех групп.
create or replace function public.rasp_curator_create(
  p_token text,
  p_group_id text,
  p_label text,
  p_code text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_code text;
  v_hash text;
  v_id text;
  v_label text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;
  if s.role <> 'admin' then raise exception 'Только админ может назначать кураторов'; end if;

  v_code := trim(coalesce(p_code, ''));
  if length(v_code) < 8 then raise exception 'Код короче 8 символов'; end if;

  v_label := left(trim(coalesce(p_label, '')), 60);
  if v_label = '' then raise exception 'Нужно имя куратора'; end if;

  if p_group_id is not null and not exists (select 1 from groups where id = p_group_id) then
    raise exception 'Группы нет';
  end if;

  v_hash := public.hash_access_code(v_code);

  if exists (select 1 from curators where code_hash = v_hash)
     or exists (select 1 from group_codes where code_hash = v_hash)
     or exists (select 1 from students where code_hash = v_hash and active) then
    raise exception 'Такой код уже занят';
  end if;

  v_id := 'cur_' || encode(gen_random_bytes(8), 'hex');
  insert into curators(id, group_id, code_hash, code_plain, label, created_by)
  values (v_id, p_group_id, v_hash, v_code, v_label, s.code_id);

  insert into audit_log(action, group_id, detail, by_role)
  values ('curator_add', p_group_id, left(v_label, 60), s.role);

  return json_build_object('id', v_id, 'label', v_label, 'code', v_code);
end;
$$;

revoke all on function public.rasp_curator_create(text, text, text, text) from public;
grant execute on function public.rasp_curator_create(text, text, text, text) to anon, authenticated;

-- ── Убрать куратора ───────────────────────────────────────────────────
create or replace function public.rasp_curator_revoke(p_token text, p_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;
  if s.role <> 'admin' then raise exception 'Только админ'; end if;

  update curators set active = false where id = p_id;
  if not found then raise exception 'Куратор не найден'; end if;

  -- Сессии этого кода больше не валидны.
  delete from sessions where code_id = p_id and role = 'curator';

  insert into audit_log(action, detail, by_role)
  values ('curator_revoke', p_id, s.role);

  return json_build_object('id', p_id, 'revoked', true);
end;
$$;

revoke all on function public.rasp_curator_revoke(text, text) from public;
grant execute on function public.rasp_curator_revoke(text, text) to anon, authenticated;

-- ── Назначить студента старостой (куратор или админ) ──────────────────
create or replace function public.rasp_set_starosta(p_token text, p_group_id text, p_student_id text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_cap text;
  v_label text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;

  v_cap := public._group_capability(p_token, p_group_id);
  if v_cap not in ('admin', 'curator') then
    raise exception 'Старост назначает куратор или админ';
  end if;

  if not exists (select 1 from students where id = p_student_id and group_id = p_group_id and active) then
    raise exception 'Такого студента нет в группе';
  end if;

  -- Староста в группе один: прежнему возвращаем обычную роль.
  update students set role = 'student'
  where group_id = p_group_id and role = 'starosta' and id <> p_student_id;

  update students set role = 'starosta' where id = p_student_id;

  -- Старосте больше не нужны делегированные права: он и так главный.
  delete from group_staff where group_id = p_group_id and student_id = p_student_id;

  select full_name into v_label from students where id = p_student_id;

  insert into audit_log(action, group_id, detail, by_role)
  values ('starosta_set', p_group_id, left(coalesce(v_label, p_student_id), 80), s.role);

  return json_build_object('studentId', p_student_id, 'role', 'starosta');
end;
$$;

revoke all on function public.rasp_set_starosta(text, text, text) from public;
grant execute on function public.rasp_set_starosta(text, text, text) to anon, authenticated;

-- ── Вход по коду куратора: обёртка над rasp_login ─────────────────────
-- Куратор авторизуется как обычный код: sessions.code_id = curators.id, role = 'curator'.
create or replace function public.rasp_curator_login(p_code text, p_visitor_id text default null)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_row curators%rowtype;
  v_token text;
  v_vid text;
  v_ban boolean;
begin
  if p_code is null or length(trim(p_code)) < 8 then
    raise exception 'Код слишком короткий';
  end if;

  v_vid := left(regexp_replace(trim(coalesce(p_visitor_id, '')), '[^a-zA-Z0-9_-]', '', 'g'), 64);
  select exists(
    select 1 from device_bans where visitor_id = v_vid and active and length(v_vid) >= 8
  ) into v_ban;
  if coalesce(v_ban, false) then raise exception 'Доступ с этого устройства закрыт.'; end if;

  v_hash := public.hash_access_code(trim(p_code));

  select * into v_row from curators where code_hash = v_hash and active;
  if v_row.id is null then raise exception 'Неверный код'; end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  insert into sessions(token, role, group_id, code_id, label, expires_at)
  values (
    v_token,
    'curator',
    v_row.group_id,
    v_row.id,
    v_row.label,
    now() + interval '30 days'
  );

  insert into audit_log(action, group_id, detail, by_role)
  values ('login', v_row.group_id, 'curator', 'curator');

  return json_build_object(
    'role', 'curator',
    'groupId', v_row.group_id,
    'token', v_token,
    'label', v_row.label,
    'codeId', v_row.id,
    'avatarUrl', ''
  );
end;
$$;

revoke all on function public.rasp_curator_login(text, text) from public;
grant execute on function public.rasp_curator_login(text, text) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════
-- ДАЛЬШЕ: доп. образование и кружки + 4 программы колледжа   (programs.sql)
-- ════════════════════════════════════════════════════════════════
-- Дополнительное образование и кружки/секции.
-- Выполни один раз в Supabase → SQL Editor. Можно повторять.
--
-- Одна таблица на оба раздела: p_kind = 'dpo' | 'club'.
-- Публиковать может админ, куратор, староста группы и редактор ленты.

create table if not exists public.programs (
  id text primary key,
  -- 'dpo' — дополнительное образование, 'club' — кружки и секции
  kind text not null check (kind in ('dpo', 'club')),
  -- null = видно всем группам
  group_id text references groups(id) on delete cascade,
  title text not null,
  subtitle text not null default '',
  body text not null default '',
  -- [{"url":"...","name":"фото","mime":"image/jpeg"}]
  attachments jsonb not null default '[]'::jsonb,
  -- [{"label":"Форма обучения","value":"Очная"},…] — таблица характеристик
  details jsonb not null default '[]'::jsonb,
  price text not null default '',
  duration text not null default '',
  contact text not null default '',
  video_url text not null default '',
  pinned boolean not null default false,
  deleted boolean not null default false,
  sort_order integer not null default 0,
  author_label text not null default '',
  author_code_id text,
  created_at timestamptz not null default now()
);

create index if not exists programs_kind_idx on public.programs (kind, deleted, sort_order desc);
create index if not exists programs_group_idx on public.programs (group_id);

alter table public.programs enable row level security;
drop policy if exists "no direct programs" on public.programs;
create policy "no direct programs" on public.programs for select using (false);

-- ── Чтение ────────────────────────────────────────────────────────────
create or replace function public.rasp_programs(
  p_kind text default null,
  p_group_id text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  return coalesce((
    select json_agg(json_build_object(
      'id', p.id,
      'kind', p.kind,
      'groupId', p.group_id,
      'title', p.title,
      'subtitle', p.subtitle,
      'body', p.body,
      'attachments', p.attachments,
      'details', p.details,
      'price', p.price,
      'duration', p.duration,
      'contact', p.contact,
      'videoUrl', p.video_url,
      'pinned', p.pinned,
      'sortOrder', p.sort_order,
      'author', p.author_label,
      'createdAt', p.created_at
    ) order by p.pinned desc, p.sort_order desc, p.created_at desc)
    from public.programs p
    where p.deleted = false
      and (p_kind is null or p.kind = p_kind)
      and (p.group_id is null or p.group_id = p_group_id)
  ), '[]'::json);
end;
$$;

revoke all on function public.rasp_programs(text, text) from public;
grant execute on function public.rasp_programs(text, text) to anon, authenticated;

-- ── Добавление / изменение ────────────────────────────────────────────
-- p_id = null → создать, иначе обновить существующую запись.
create or replace function public.rasp_program_save(
  p_token text,
  p_id text,
  p_kind text,
  p_group_id text,
  p_title text,
  p_subtitle text default '',
  p_body text default '',
  p_attachments jsonb default '[]'::jsonb,
  p_details jsonb default '[]'::jsonb,
  p_price text default '',
  p_duration text default '',
  p_contact text default '',
  p_video_url text default '',
  p_pinned boolean default false
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_cap text;
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_title text;
  v_id text;
  v_atts jsonb;
  v_det jsonb;
  v_label text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;
  if v_kind not in ('dpo', 'club') then raise exception 'Неизвестный раздел'; end if;

  v_cap := public._group_capability(p_token, p_group_id);
  if coalesce(v_cap, '') not in ('admin', 'curator', 'starosta', 'deputy', 'news') then
    raise exception 'Добавлять может админ, куратор, староста или редактор ленты';
  end if;

  v_title := left(trim(coalesce(p_title, '')), 160);
  if v_title = '' then raise exception 'Нужен заголовок'; end if;

  v_atts := coalesce((
    select jsonb_agg(jsonb_build_object(
      'url', item->>'url',
      'name', left(coalesce(item->>'name', 'файл'), 120),
      'mime', coalesce(item->>'mime', '')
    ))
    from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) item
    where coalesce(item->>'url', '') <> ''
  ), '[]'::jsonb);

  v_det := coalesce((
    select jsonb_agg(jsonb_build_object(
      'label', left(coalesce(item->>'label', ''), 80),
      'value', left(coalesce(item->>'value', ''), 400)
    ))
    from jsonb_array_elements(coalesce(p_details, '[]'::jsonb)) item
    where coalesce(item->>'label', '') <> '' or coalesce(item->>'value', '') <> ''
  ), '[]'::jsonb);

  v_label := public._session_display_label(s);

  if p_id is null or trim(p_id) = '' then
    v_id := 'prg_' || encode(gen_random_bytes(10), 'hex');
    insert into public.programs(
      id, kind, group_id, title, subtitle, body, attachments, details,
      price, duration, contact, video_url, pinned, author_label, author_code_id
    ) values (
      v_id, v_kind, p_group_id, v_title, left(coalesce(p_subtitle, ''), 300),
      left(coalesce(p_body, ''), 12000), v_atts, v_det,
      left(coalesce(p_price, ''), 120), left(coalesce(p_duration, ''), 120),
      left(coalesce(p_contact, ''), 300), left(coalesce(p_video_url, ''), 500),
      coalesce(p_pinned, false), v_label, s.code_id
    );
  else
    v_id := p_id;
    update public.programs set
      kind = v_kind,
      group_id = p_group_id,
      title = v_title,
      subtitle = left(coalesce(p_subtitle, ''), 300),
      body = left(coalesce(p_body, ''), 12000),
      attachments = v_atts,
      details = v_det,
      price = left(coalesce(p_price, ''), 120),
      duration = left(coalesce(p_duration, ''), 120),
      contact = left(coalesce(p_contact, ''), 300),
      video_url = left(coalesce(p_video_url, ''), 500),
      pinned = coalesce(p_pinned, false)
    where id = v_id and deleted = false;
    if not found then raise exception 'Запись не найдена'; end if;
  end if;

  insert into audit_log(action, group_id, detail, by_role)
  values ('program_save', p_group_id, v_kind || ':' || left(v_title, 60), s.role);

  return json_build_object('id', v_id, 'title', v_title);
end;
$$;

revoke all on function public.rasp_program_save(text, text, text, text, text, text, text, jsonb, jsonb, text, text, text, text, boolean) from public;
grant execute on function public.rasp_program_save(text, text, text, text, text, text, text, jsonb, jsonb, text, text, text, text, boolean) to anon, authenticated;

-- ── Удаление (мягкое) ─────────────────────────────────────────────────
create or replace function public.rasp_program_delete(p_token text, p_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_group text;
  v_cap text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;

  select group_id into v_group from public.programs where id = p_id and deleted = false;
  if not found then raise exception 'Запись не найдена'; end if;

  v_cap := public._group_capability(p_token, v_group);
  if coalesce(v_cap, '') not in ('admin', 'curator', 'starosta', 'deputy', 'news') then
    raise exception 'Нет прав';
  end if;

  update public.programs set deleted = true where id = p_id;

  insert into audit_log(action, group_id, detail, by_role)
  values ('program_delete', v_group, p_id, s.role);

  return json_build_object('id', p_id, 'deleted', true);
end;
$$;

revoke all on function public.rasp_program_delete(text, text) from public;
grant execute on function public.rasp_program_delete(text, text) to anon, authenticated;

-- ── Порядок: как у новостей ───────────────────────────────────────────
create or replace function public.rasp_program_move(p_token text, p_id text, p_dir int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_kind text;
  v_group text;
  v_ids text[];
  v_i int;
  v_j int;
  v_tmp text;
  v_len int;
  k int;
  v_cap text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;

  select kind, group_id into v_kind, v_group
  from public.programs where id = p_id and deleted = false;
  if not found then raise exception 'Запись не найдена'; end if;

  v_cap := public._group_capability(p_token, v_group);
  if coalesce(v_cap, '') not in ('admin', 'curator', 'starosta', 'deputy', 'news') then
    raise exception 'Нет прав';
  end if;

  select array_agg(id order by sort_order desc, created_at desc) into v_ids
  from public.programs
  where deleted = false and kind = v_kind and group_id is not distinct from v_group;

  v_len := coalesce(array_length(v_ids, 1), 0);
  if v_len < 2 then return json_build_object('moved', false); end if;

  v_i := array_position(v_ids, p_id);
  if v_i is null then return json_build_object('moved', false); end if;

  v_j := v_i - sign(coalesce(p_dir, 1));
  if v_j < 1 or v_j > v_len then return json_build_object('moved', false); end if;

  v_tmp := v_ids[v_i];
  v_ids[v_i] := v_ids[v_j];
  v_ids[v_j] := v_tmp;

  for k in 1..v_len loop
    update public.programs set sort_order = v_len - k + 1 where id = v_ids[k];
  end loop;

  return json_build_object('moved', true);
end;
$$;

revoke all on function public.rasp_program_move(text, text, int) from public;
grant execute on function public.rasp_program_move(text, text, int) to anon, authenticated;

-- ── Предзаполнение: дополнительное профессиональное образование ────────
-- Записи создаются один раз: повторный запуск ничего не дублирует.
-- Видео лежит в репозитории: public/video/dpo-intro.mp4 → путь ниже относительный.
insert into public.programs (
  id, kind, group_id, title, subtitle, body, attachments, details,
  price, duration, contact, video_url, pinned, author_label
)
values
  (
    'prg_dpo_bpla',
    'dpo',
    null,
    'Оператор наземных средств управления БПЛА',
    'Дополнительное профессиональное образование · набор открыт',
    'Процесс обучения предусматривает изучение основ законодательства об использовании беспилотных летательных аппаратов, их устройства, правил эксплуатации и пилотирования, основ и навыков пилотирования, управления системами.',
    '[]'::jsonb,
    '[{"label":"Форма обучения","value":"Очная с применением дистанционных образовательных технологий"},{"label":"Продолжительность","value":"Сертификат — 6 недель (76 часов); диплом — 11 недель (252 часа)"},{"label":"Документ по окончании","value":"Сертификат или диплом"}]'::jsonb,
    '15 000 ₽ / 59 900 ₽',
    '6 недель / 11 недель',
    'Сысоев Алексей Алексеевич · 8 (916)-286-61-75 · кабинет 211',
    'video/dpo-intro.mp4',
    true,
    'Колледж Чуйкова'
  ),
  (
    'prg_dpo_first_aid',
    'dpo',
    null,
    'Обучение лиц, обязанных и (или) имеющих право оказывать первую помощь',
    'Свидетельство о повышении квалификации',
    'Программа для тех, кто по закону обязан или имеет право оказывать первую помощь: алгоритмы действий, оценка состояния пострадавшего, остановка кровотечения, сердечно-лёгочная реанимация, психологическая поддержка.',
    '[]'::jsonb,
    '[{"label":"Форма обучения","value":"Очная с применением дистанционных образовательных технологий"},{"label":"Продолжительность","value":"2 недели (16 часов)"},{"label":"Документ по окончании","value":"Свидетельство о повышении квалификации"}]'::jsonb,
    '2 500 ₽',
    '2 недели (16 часов)',
    'Сысоев Алексей Алексеевич · 8 (916)-286-61-75 · кабинет 211',
    '',
    false,
    'Колледж Чуйкова'
  ),
  (
    'prg_dpo_tactical_med',
    'dpo',
    null,
    'Основы тактической медицины',
    'Короткий интенсив с сертификатом',
    'Базовая тактическая медицина: работа в зоне условного поражения, само- и взаимопомощь, жгуты и гемостатические средства, эвакуация пострадавшего.',
    '[]'::jsonb,
    '[{"label":"Форма обучения","value":"Очная с применением дистанционных образовательных технологий"},{"label":"Продолжительность","value":"2 недели (24 часа)"},{"label":"Документ по окончании","value":"Сертификат"}]'::jsonb,
    '4 700 ₽',
    '2 недели (24 часа)',
    'Сысоев Алексей Алексеевич · 8 (916)-286-61-75 · кабинет 211',
    '',
    false,
    'Колледж Чуйкова'
  ),
  (
    'prg_dpo_english',
    'dpo',
    null,
    'Английский язык — средство общения и познания',
    'Разговорный курс с сертификатом',
    'Курс для тех, кому английский нужен в работе и учёбе: разговорная практика, деловая переписка, понимание текстов и речи на слух.',
    '[]'::jsonb,
    '[{"label":"Форма обучения","value":"Очная с применением дистанционных образовательных технологий"},{"label":"Продолжительность","value":"10 недель (60 часов)"},{"label":"Документ по окончании","value":"Сертификат"}]'::jsonb,
    '18 900 ₽',
    '10 недель (60 часов)',
    'Сысоев Алексей Алексеевич · 8 (916)-286-61-75 · кабинет 211',
    '',
    false,
    'Колледж Чуйкова'
  )
on conflict (id) do nothing;
