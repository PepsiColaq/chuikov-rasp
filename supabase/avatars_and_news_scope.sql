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
