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
