-- ============================================================
-- v163_roles_and_layout.sql
-- Три исправления:
--   1) староста и куратор тоже могут снять роль «староста» (раньше — только админ);
--   2) роль старосты видна в списке ролей группы, а не только в журнале;
--   3) сервер сам гасит все сессии человека, когда его роль понижают.
--
-- Куда: Supabase → SQL Editor → вставить всё → Run.
-- Можно запускать повторно.
-- ============================================================

-- ── 1. Смена роли: не только админ ────────────────────────────
-- Раньше функция требовала admin-сессию, поэтому староста, случайно
-- выдав кому-то роль, не мог её снять — приходилось звать админа.
-- Теперь роль меняет тот, кто управляет группой: админ, куратор
-- этой группы или староста этой группы.

create or replace function public.rasp_set_student_role(
  p_token text,
  p_student_id text,
  p_role text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_role text;
  v_group text;
  v_name text;
  v_cap text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then
    raise exception 'Нужен вход';
  end if;

  select group_id, surname into v_group, v_name
  from students where id = p_student_id and active;
  if v_group is null then
    raise exception 'Студент не найден';
  end if;

  -- Кто может менять роли в этой группе.
  v_cap := public._group_capability(p_token, v_group);
  if s.role <> 'admin' and v_cap not in ('admin', 'starosta') then
    raise exception 'Менять роли может староста группы или админ';
  end if;

  v_role := lower(trim(coalesce(p_role, '')));
  if v_role not in ('student', 'starosta', 'teacher') then
    raise exception 'Неизвестная роль';
  end if;

  -- Нельзя разжаловать самого себя: иначе староста случайно
  -- останется без прав посреди работы.
  if p_student_id = s.code_id and v_role = 'student' then
    raise exception 'Нельзя снять роль с самого себя';
  end if;

  update students set role = v_role where id = p_student_id;

  -- Понижение — сразу гасим его сессии, чтобы старые права не висели.
  if v_role = 'student' then
    delete from sessions where code_id = p_student_id;
    delete from group_staff where group_id = v_group and student_id = p_student_id;
  end if;

  perform public._write_audit(
    'student_role', v_group,
    left(coalesce(v_name, '') || ' → ' || v_role, 200), s.role, null
  );
  return json_build_object('id', p_student_id, 'role', v_role);
end;
$$;

revoke all on function public.rasp_set_student_role(text, text, text) from public;
grant execute on function public.rasp_set_student_role(text, text, text) to anon, authenticated;


-- ── 2. Список ролей: отдаём роль из students ──────────────────
-- Карточка ролей показывает «Староста» только по записям group_staff,
-- а настоящая роль лежит в students.role. Из-за этого старосту
-- не было видно в списке «снять …», и снять было нечем.
-- Возвращаем полный ответ, добавляя роль каждому студенту.

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
        'surname', st.surname,
        'role', coalesce(st.role, 'student')
      ) order by st.surname)
      from group_staff gs join students st on st.id = gs.student_id
      where gs.group_id = p_group_id and gs.kind = 'deputy'
    ), '[]'::json),
    'hwEditors', coalesce((
      select json_agg(json_build_object(
        'id', gs.id,
        'studentId', gs.student_id,
        'fullName', st.full_name,
        'surname', st.surname,
        'role', coalesce(st.role, 'student')
      ) order by st.surname)
      from group_staff gs join students st on st.id = gs.student_id
      where gs.group_id = p_group_id and gs.kind = 'hw'
    ), '[]'::json),
    'newsEditors', coalesce((
      select json_agg(json_build_object(
        'id', gs.id,
        'studentId', gs.student_id,
        'fullName', st.full_name,
        'surname', st.surname,
        'role', coalesce(st.role, 'student')
      ) order by st.surname)
      from group_staff gs join students st on st.id = gs.student_id
      where gs.group_id = p_group_id and gs.kind = 'news'
    ), '[]'::json),
    'students', coalesce((
      select json_agg(json_build_object(
        'id', st.id,
        'fullName', st.full_name,
        'surname', st.surname,
        'role', coalesce(st.role, 'student')
      ) order by st.sort_order, st.surname)
      from students st
      where st.group_id = p_group_id and st.active
    ), '[]'::json)
  );
end;
$$;

revoke all on function public.rasp_staff_list(text, text) from public;
grant execute on function public.rasp_staff_list(text, text) to anon, authenticated;


notify pgrst, 'reload schema';


-- ============================================================
-- ПРОВЕРКА
-- ============================================================
-- 1) кто сейчас староста в группе 0903-ПД3 (должна быть одна строка):
--    select id, full_name, role from public.students
--    where group_id = 'g_0903_пд3' and role <> 'student';
--
-- 2) список ролей отдаёт поле role (должно быть 'role' в ключах):
--    select public.rasp_staff_list('<твой_токен>', 'g_0903_пд3');

-- ============================================================
-- ОТКАТ (вернуть «только админ»)
-- ============================================================
-- Версию функции до этой миграции смотри в supabase/roles_v2.sql.
