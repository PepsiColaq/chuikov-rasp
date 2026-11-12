-- Делегирование прав внутри группы.
-- Выполни один раз в Supabase → SQL Editor. Можно повторять.
--
-- Кто что может:
--   • админ                — всё, в любой группе;
--   • староста группы      — журнал/построение/замены + назначает до 4 «замов»;
--   • зам (deputy)         — журнал, построение, замены (но не назначает замов);
--   • редактор ДЗ (hw)     — добавляет ДЗ; назначает неограниченно староста и замы;
--   • студент              — только смотрит.

create table if not exists public.group_staff (
  id text primary key,
  group_id text not null references groups(id) on delete cascade,
  student_id text not null references students(id) on delete cascade,
  -- 'deputy' — права старосты без назначения замов; 'hw' — только домашние задания
  kind text not null check (kind in ('deputy', 'hw')),
  granted_by text,
  created_at timestamptz not null default now(),
  unique (group_id, student_id, kind)
);

create index if not exists group_staff_group_idx on public.group_staff (group_id, kind);

alter table public.group_staff enable row level security;
drop policy if exists "no direct staff" on public.group_staff;
create policy "no direct staff" on public.group_staff for select using (false);

-- ── Кто я в этой группе ────────────────────────────────────────────────
-- Возвращает: admin | starosta | deputy | hw | student
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

  -- Староста группы или код «все группы».
  if s.code_id is not null then
    select coalesce(all_groups, false) into v_all
    from group_codes where id = s.code_id and active;
    if coalesce(v_all, false) then return 'starosta'; end if;
  end if;
  if s.role in ('starosta', 'teacher') and s.group_id = p_group_id then
    return 'starosta';
  end if;

  -- Студент: смотрим его роль в students и делегирование.
  if s.code_id is not null then
    select coalesce(role, 'student') into v_role
    from students where id = s.code_id and active and group_id = p_group_id;
    if v_role in ('starosta', 'teacher') then return 'starosta'; end if;
  end if;

  if s.code_id is not null then
    select kind into v_kind
    from group_staff
    where group_id = p_group_id and student_id = s.code_id
    order by case kind when 'deputy' then 0 else 1 end
    limit 1;
    if v_kind = 'deputy' then return 'deputy'; end if;
    if v_kind = 'hw' then return 'hw'; end if;
  end if;

  if s.group_id = p_group_id then return 'student'; end if;
  return null;
end;
$$;

revoke all on function public._group_capability(text, text) from public;
grant execute on function public._group_capability(text, text) to anon, authenticated;

-- ── Журнал и построение: староста, зам или админ ──────────────────────
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
  if v_cap in ('admin', 'starosta', 'deputy') then
    return s;
  end if;

  raise exception 'Оценки ставит староста, его зам или админ';
end;
$$;

revoke all on function public._journal_editor(text, text) from public;
grant execute on function public._journal_editor(text, text) to anon, authenticated;

-- ── ДЗ и замены: сюда же попадают редакторы ДЗ ────────────────────────
create or replace function public._require_write(p_token text, p_group_id text)
returns sessions
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_cap text;
  v_on boolean;
begin
  select * into s from sessions where token = p_token;
  if s.token is null or s.expires_at < now() then
    raise exception 'Нужен вход старосты или админа';
  end if;

  v_cap := public._group_capability(p_token, p_group_id);
  if v_cap is null then
    raise exception 'Нет прав на эту группу';
  end if;

  if v_cap <> 'admin' then
    select coalesce(site_enabled, true) into v_on from app_meta where id = 'main';
    if v_on is distinct from true then
      raise exception 'Сайт временно закрыт';
    end if;
  end if;

  -- Смотреть может любой из группы, писать — все, кроме обычного студента.
  if v_cap = 'student' then
    raise exception 'Нет прав на эту группу';
  end if;

  return s;
end;
$$;

revoke all on function public._require_write(text, text) from public;
grant execute on function public._require_write(text, text) to anon, authenticated;

-- ── Список делегированных ролей группы ────────────────────────────────
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
        'id', gs.id,
        'studentId', gs.student_id,
        'fullName', st.full_name,
        'surname', st.surname
      ) order by st.surname)
      from group_staff gs join students st on st.id = gs.student_id
      where gs.group_id = p_group_id and gs.kind = 'deputy'
    ), '[]'::json),
    'hwEditors', coalesce((
      select json_agg(json_build_object(
        'id', gs.id,
        'studentId', gs.student_id,
        'fullName', st.full_name,
        'surname', st.surname
      ) order by st.surname)
      from group_staff gs join students st on st.id = gs.student_id
      where gs.group_id = p_group_id and gs.kind = 'hw'
    ), '[]'::json)
  );
end;
$$;

revoke all on function public.rasp_staff_list(text, text) from public;
grant execute on function public.rasp_staff_list(text, text) to anon, authenticated;

-- ── Назначить / снять ─────────────────────────────────────────────────
-- kind = 'deputy': только админ или староста, не больше 4 на группу.
-- kind = 'hw'    : админ, староста или зам, без ограничения.
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
  if v_kind not in ('deputy', 'hw') then raise exception 'Неизвестная роль'; end if;

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
      if v_count >= 4 then
        raise exception 'Замов уже 4 — сначала сними одного';
      end if;
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
    p_group_id,
    v_kind || ':' || p_student_id,
    s.role
  );

  return public.rasp_staff_list(p_token, p_group_id);
end;
$$;

revoke all on function public.rasp_staff_set(text, text, text, text, boolean) from public;
grant execute on function public.rasp_staff_set(text, text, text, text, boolean) to anon, authenticated;
