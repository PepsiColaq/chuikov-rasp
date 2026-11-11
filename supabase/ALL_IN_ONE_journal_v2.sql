-- ============================================================
--  РАСПИСАНИЕ ЧУЙКОВА — МИГРАЦИИ ЖУРНАЛА v2
--  Один файл вместо трёх. Выполнять ЦЕЛИКОМ в Supabase → SQL Editor.
--
--  Порядок важен: roles_v2 переопределяет rasp_my_marks из journal_v2.
--  Файл идемпотентный: можно запускать повторно, данные не теряются.
--  Старые коды (group_codes, app_meta.admin_code_hash) НЕ трогаются.
-- ============================================================


-- ============================================================
--  1/3 · Мягкие лимиты входа и обратный отсчёт
--  (было: supabase/login_limits_v3.sql)
-- ============================================================

-- Мягче лимиты входа + возможность показать «сколько ждать».
-- Выполни один раз в Supabase → SQL Editor. Можно повторять.
--
-- Почему: в мобильных сетях IP общий (CGNAT). Восемь опечаток любых студентов
-- в одной сети блокировали вход ВСЕМ на 15 минут. rasp_login не трогаем —
-- меняем только политику внутри _login_fail / _login_locked.

-- 1) Политика по бакету: IP терпимее и отпускает быстрее, код строже.
create or replace function public._login_max(p_bucket text, p_max int default 8)
returns int
language sql
immutable
as $$
  select case
    when p_bucket like 'ip:%' then greatest(p_max, 30)
    else greatest(p_max, 10)
  end;
$$;

create or replace function public._login_lock_for(p_bucket text, p_lock interval default interval '15 minutes')
returns interval
language sql
immutable
as $$
  select case
    when p_bucket like 'ip:%' then least(p_lock, interval '5 minutes')
    else p_lock
  end;
$$;

-- 2) Те же функции, но с учётом политики (сигнатуры совместимы со старыми вызовами).
create or replace function public._login_fail(
  p_bucket text,
  p_max int default 8,
  p_lock interval default interval '15 minutes'
)
returns void
language plpgsql
as $$
declare
  v_max int := public._login_max(p_bucket, p_max);
  v_lock interval := public._login_lock_for(p_bucket, p_lock);
begin
  insert into login_attempts(bucket, fails, locked_until)
    values (p_bucket, 1, null)
  on conflict (bucket) do update
    set fails = case
          when login_attempts.locked_until is not null and login_attempts.locked_until > now()
            then login_attempts.fails
          when login_attempts.fails + 1 >= v_max then 0
          else login_attempts.fails + 1
        end,
        locked_until = case
          when login_attempts.locked_until is not null and login_attempts.locked_until > now()
            then login_attempts.locked_until
          when login_attempts.fails + 1 >= v_max then now() + v_lock
          else login_attempts.locked_until
        end;
end;
$$;

create or replace function public._login_locked(p_bucket text)
returns boolean
language plpgsql
as $$
declare
  v_locked timestamptz;
begin
  select locked_until into v_locked from login_attempts where bucket = p_bucket;
  return v_locked is not null and v_locked > now();
end;
$$;

-- 3) Сколько секунд осталось ждать этому устройству/сети.
--    Клиент вызывает после ошибки «слишком много попыток» и рисует таймер.
create or replace function public.rasp_login_wait()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip text := public._client_ip();
  v_ip_bucket text;
  v_left int := 0;
begin
  if v_ip is null or v_ip = 'unknown' then
    return json_build_object('seconds', 0);
  end if;
  v_ip_bucket := 'ip:' || v_ip;
  select greatest(0, ceil(extract(epoch from (locked_until - now()))))::int
    into v_left
  from login_attempts
  where bucket = v_ip_bucket and locked_until > now();
  return json_build_object('seconds', coalesce(v_left, 0));
end;
$$;

grant execute on function public.rasp_login_wait() to anon, authenticated;


-- ============================================================
--  2/3 · Несколько оценок на пару + построение
--  (было: supabase/journal_v2.sql)
-- ============================================================

-- Несколько оценок за одну пару + расход построения.
-- Выполни один раз в Supabase → SQL Editor. Можно повторять (идемпотентно).
--
-- Почему отдельная таблица: в journal_marks стоит unique(student_id, on_date,
-- slot_start, slot_end) — одна пара = одна запись. Вторую пятёрку туда
-- физически не положить. Явка остаётся в journal_marks, оценки переезжают сюда.

-- 1) Оценки: сколько угодно на пару, с типом и автором.
create table if not exists public.journal_grades (
  id text primary key,
  group_id text not null,
  student_id text not null references students(id) on delete cascade,
  on_date date not null,
  lesson_id text,
  slot_start text not null,
  slot_end text not null,
  subject text not null default '',
  value smallint not null check (value between 2 and 5),
  kind text not null default 'answer',
  comment text not null default '',
  author_label text not null default '',
  author_code_id text,
  created_at timestamptz not null default now()
);

create index if not exists journal_grades_slot_idx
  on journal_grades (group_id, on_date, slot_start, slot_end);

create index if not exists journal_grades_student_idx
  on journal_grades (student_id, on_date);

alter table journal_grades enable row level security;

-- 2) Переносим уже выставленные оценки (старая колонка journal_marks.grade).
--    Только те, для которых ещё нет записи — повторный запуск безопасен.
insert into journal_grades (
  id, group_id, student_id, on_date, lesson_id,
  slot_start, slot_end, subject, value, kind, comment,
  author_label, author_code_id, created_at
)
select
  'jg_' || substr(md5(m.id), 1, 20),
  m.group_id,
  m.student_id,
  m.on_date,
  m.lesson_id,
  m.slot_start,
  m.slot_end,
  coalesce(m.subject, ''),
  m.grade,
  'answer',
  coalesce(m.comment, ''),
  coalesce(m.author_label, ''),
  m.author_code_id,
  coalesce(m.updated_at, now())
from journal_marks m
where m.grade is not null
  and m.grade between 2 and 5
  and not exists (
    select 1 from journal_grades g
    where g.student_id = m.student_id
      and g.on_date = m.on_date
      and g.slot_start = m.slot_start
      and g.slot_end = m.slot_end
      and g.value = m.grade
  );

-- 3) Чтение оценок пары (для журнала и для дневника студента).
create or replace function public.rasp_lesson_grades(
  p_token text,
  p_group_id text,
  p_date date,
  p_start text,
  p_end text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
begin
  s := public._journal_editor(p_token, p_group_id);
  return coalesce((
    select json_agg(json_build_object(
      'id', g.id,
      'studentId', g.student_id,
      'value', g.value,
      'kind', g.kind,
      'comment', g.comment,
      'author', g.author_label,
      'createdAt', g.created_at
    ) order by g.created_at)
    from journal_grades g
    where g.group_id = p_group_id
      and g.on_date = p_date
      and g.slot_start = p_start
      and g.slot_end = p_end
  ), '[]'::json);
end;
$$;

grant execute on function public.rasp_lesson_grades(text, text, date, text, text) to anon, authenticated;

-- 4) Добавить оценку (вторую, третью — сколько нужно).
create or replace function public.rasp_add_grade(
  p_token text,
  p_student_id text,
  p_date date,
  p_lesson_id text,
  p_start text,
  p_end text,
  p_subject text,
  p_value int,
  p_kind text default 'answer',
  p_comment text default ''
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_group text;
  v_kind text;
  v_id text;
  v_count int;
begin
  select group_id into v_group from students where id = p_student_id and active;
  if v_group is null then
    raise exception 'Студент не найден';
  end if;
  s := public._journal_editor(p_token, v_group);

  if p_value is null or p_value < 2 or p_value > 5 then
    raise exception 'Оценка от 2 до 5';
  end if;

  v_kind := lower(trim(coalesce(p_kind, 'answer')));
  if v_kind not in ('answer', 'test', 'independent', 'project', 'oral', 'other') then
    v_kind := 'answer';
  end if;

  select count(*) into v_count
  from journal_grades
  where student_id = p_student_id
    and on_date = p_date
    and slot_start = left(trim(coalesce(p_start, '')), 8)
    and slot_end = left(trim(coalesce(p_end, '')), 8);
  if v_count >= 10 then
    raise exception 'Слишком много оценок на одну пару';
  end if;

  v_id := 'jg_' || encode(gen_random_bytes(8), 'hex');
  insert into journal_grades(
    id, group_id, student_id, on_date, lesson_id, slot_start, slot_end,
    subject, value, kind, comment, author_label, author_code_id
  ) values (
    v_id, v_group, p_student_id, p_date, nullif(p_lesson_id, ''),
    left(trim(coalesce(p_start, '')), 8), left(trim(coalesce(p_end, '')), 8),
    left(trim(coalesce(p_subject, '')), 80), p_value, v_kind,
    left(trim(coalesce(p_comment, '')), 200),
    left(coalesce(s.label, s.role), 64), s.code_id
  );

  perform public._write_audit(
    'journal_grade', v_group,
    left(p_date::text || ' ' || coalesce(p_start, '') || ' +' || p_value::text, 200),
    s.role, null
  );

  return json_build_object('id', v_id, 'value', p_value, 'kind', v_kind);
end;
$$;

grant execute on function public.rasp_add_grade(text, text, date, text, text, text, text, int, text, text)
  to anon, authenticated;

-- 5) Удалить оценку (ошиблись кнопкой).
create or replace function public.rasp_delete_grade(p_token text, p_grade_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_group text;
  v_value int;
begin
  select group_id, value into v_group, v_value
  from journal_grades where id = p_grade_id;
  if v_group is null then
    raise exception 'Оценка не найдена';
  end if;
  s := public._journal_editor(p_token, v_group);
  delete from journal_grades where id = p_grade_id;
  perform public._write_audit(
    'journal_grade_delete', v_group,
    left(p_grade_id || ' ' || v_value::text, 200), s.role, null
  );
end;
$$;

grant execute on function public.rasp_delete_grade(text, text) to anon, authenticated;

-- 6) Дневник студента теперь читает оценки из новой таблицы.
--    Явка и комментарии по-прежнему из journal_marks, поэтому объединяем.
create or replace function public.rasp_my_marks(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
begin
  select * into s from sessions where token = p_token and role = 'student' and expires_at > now();
  if s.token is null or s.code_id is null then
    raise exception 'Нужен вход студента';
  end if;
  if not exists (select 1 from students where id = s.code_id and active) then
    delete from sessions where token = p_token;
    raise exception 'Код студента отключён';
  end if;

  return coalesce((
    with facts as (
      -- оценки (их может быть несколько на пару)
      select
        g.id,
        g.on_date as date,
        g.slot_start as start,
        g.slot_end as "end",
        g.subject,
        'present'::text as attendance,
        g.value as grade,
        g.comment,
        g.author_label as author,
        g.created_at as at
      from journal_grades g
      where g.student_id = s.code_id

      union all

      -- явка без оценки (пропуски, наряды, мероприятия)
      select
        m.id,
        m.on_date,
        m.slot_start,
        m.slot_end,
        m.subject,
        m.attendance,
        null::smallint,
        m.comment,
        m.author_label,
        m.updated_at
      from journal_marks m
      where m.student_id = s.code_id
        and m.grade is null
        and coalesce(m.attendance, '') <> ''
    )
    select json_agg(json_build_object(
      'id', f.id,
      'date', f.date,
      'start', f.start,
      'end', f."end",
      'subject', f.subject,
      'attendance', f.attendance,
      'grade', f.grade,
      'comment', f.comment,
      'author', f.author
    ) order by f.date desc, f.start)
    from facts f
  ), '[]'::json);
end;
$$;

grant execute on function public.rasp_my_marks(text) to anon, authenticated;

-- 7) Убираем оценку из старой таблицы: теперь она живёт в journal_grades.
--    rasp_upsert_mark продолжает писать явку/комментарий, но grade игнорирует.
create or replace function public.rasp_upsert_mark(
  p_token text,
  p_student_id text,
  p_date date,
  p_lesson_id text,
  p_start text,
  p_end text,
  p_subject text,
  p_attendance text,
  p_grade int,
  p_comment text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_group text;
  v_att text;
  v_comment text;
  v_subject text;
  v_start text;
  v_end text;
  v_id text;
begin
  select group_id into v_group from students where id = p_student_id and active;
  if v_group is null then
    raise exception 'Студент не найден';
  end if;
  s := public._journal_editor(p_token, v_group);

  v_att := lower(trim(coalesce(p_attendance, '')));
  if v_att in ('', 'none') then
    v_att := null;
  elsif v_att not in ('present', 'absent', 'sick', 'duty', 'event', 'excused') then
    raise exception 'Неизвестная явка';
  end if;
  v_comment := left(trim(coalesce(p_comment, '')), 200);
  v_subject := left(trim(coalesce(p_subject, '')), 80);
  v_start := left(trim(coalesce(p_start, '')), 8);
  v_end := left(trim(coalesce(p_end, '')), 8);
  if v_subject = '' or v_start = '' or v_end = '' or p_date is null then
    raise exception 'Нет пары или даты';
  end if;

  select id into v_id
  from journal_marks
  where student_id = p_student_id
    and on_date = p_date
    and slot_start = v_start
    and slot_end = v_end;

  if v_id is null then
    v_id := 'jm_' || encode(gen_random_bytes(6), 'hex');
    insert into journal_marks(
      id, group_id, student_id, on_date, lesson_id, slot_start, slot_end,
      subject, attendance, grade, comment, author_label, author_code_id
    ) values (
      v_id, v_group, p_student_id, p_date, nullif(p_lesson_id, ''), v_start, v_end,
      v_subject, v_att, null, v_comment, left(coalesce(s.label, s.role), 64), s.code_id
    );
  else
    update journal_marks set
      lesson_id = nullif(p_lesson_id, ''),
      subject = v_subject,
      attendance = v_att,
      grade = null,
      comment = v_comment,
      author_label = left(coalesce(s.label, s.role), 64),
      author_code_id = s.code_id,
      updated_at = now()
    where id = v_id;
  end if;

  return json_build_object('id', v_id, 'attendance', v_att, 'comment', v_comment);
end;
$$;

grant execute on function public.rasp_upsert_mark(text, text, date, text, text, text, text, text, int, text)
  to anon, authenticated;

-- 8) Построение: отдельная таблица вместо фейковой записи ДЗ.
create table if not exists public.formation_days (
  group_id text not null references groups(id) on delete cascade,
  on_date date not null,
  cancelled boolean not null default false,
  note text not null default '',
  updated_by text not null default '',
  updated_at timestamptz not null default now(),
  primary key (group_id, on_date)
);

alter table public.formation_days enable row level security;

-- Переносим старые «отмены» из фейковых ДЗ.
insert into public.formation_days (group_id, on_date, cancelled, note, updated_by)
select h.group_id, h.due_date, true, 'перенесено из старой отметки', 'migration'
from homework h
where h.subject = '__formation_skip__'
  and h.due_date is not null
on conflict (group_id, on_date) do nothing;

create table if not exists public.formation_marks (
  id text primary key,
  group_id text not null references groups(id) on delete cascade,
  on_date date not null,
  student_id text not null references students(id) on delete cascade,
  attendance text,
  comment text not null default '',
  author_label text not null default '',
  updated_at timestamptz not null default now(),
  unique (student_id, on_date)
);

create index if not exists formation_marks_day_idx
  on formation_marks (group_id, on_date);

alter table public.formation_marks enable row level security;

create or replace function public.rasp_formation_day(p_token text, p_group_id text, p_date date)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_row public.formation_days%rowtype;
begin
  -- читать может любой вошедший в эту группу; гость увидит только «не отменено»
  begin
    s := public._journal_editor(p_token, p_group_id);
  exception when others then
    return json_build_object('cancelled', false, 'note', '', 'canEdit', false, 'marks', '[]'::json);
  end;

  select * into v_row from public.formation_days
  where group_id = p_group_id and on_date = p_date;

  return json_build_object(
    'cancelled', coalesce(v_row.cancelled, false),
    'note', coalesce(v_row.note, ''),
    'canEdit', true,
    'marks', coalesce((
      select json_agg(json_build_object(
        'studentId', fm.student_id,
        'attendance', fm.attendance,
        'comment', fm.comment
      ))
      from public.formation_marks fm
      where fm.group_id = p_group_id and fm.on_date = p_date
    ), '[]'::json)
  );
end;
$$;

grant execute on function public.rasp_formation_day(text, text, date) to anon, authenticated;

create or replace function public.rasp_set_formation_cancelled(
  p_token text,
  p_group_id text,
  p_date date,
  p_cancelled boolean,
  p_note text default ''
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
begin
  s := public._require_write(p_token, p_group_id);
  insert into public.formation_days (group_id, on_date, cancelled, note, updated_by, updated_at)
    values (p_group_id, p_date, coalesce(p_cancelled, false), left(coalesce(p_note, ''), 200),
            left(coalesce(s.label, s.role), 64), now())
  on conflict (group_id, on_date) do update
    set cancelled = excluded.cancelled,
        note = excluded.note,
        updated_by = excluded.updated_by,
        updated_at = now();

  -- отменили построение — расход за этот день больше не нужен
  if coalesce(p_cancelled, false) then
    delete from public.formation_marks where group_id = p_group_id and on_date = p_date;
  end if;

  perform public._write_audit(
    case when coalesce(p_cancelled, false) then 'formation_cancel' else 'formation_return' end,
    p_group_id, p_date::text, s.role, null
  );
  return json_build_object('cancelled', coalesce(p_cancelled, false));
end;
$$;

grant execute on function public.rasp_set_formation_cancelled(text, text, date, boolean, text)
  to anon, authenticated;

create or replace function public.rasp_set_formation_mark(
  p_token text,
  p_student_id text,
  p_date date,
  p_attendance text,
  p_comment text default ''
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_group text;
  v_att text;
  v_id text;
  v_cancelled boolean;
begin
  select group_id into v_group from students where id = p_student_id and active;
  if v_group is null then
    raise exception 'Студент не найден';
  end if;
  s := public._require_write(p_token, v_group);

  select coalesce(cancelled, false) into v_cancelled
  from public.formation_days where group_id = v_group and on_date = p_date;
  if coalesce(v_cancelled, false) then
    raise exception 'Построение отменено — расход не ведётся';
  end if;

  v_att := lower(trim(coalesce(p_attendance, '')));
  if v_att in ('', 'none') then
    v_att := null;
  elsif v_att not in ('present', 'absent', 'sick', 'excused', 'duty') then
    raise exception 'Неизвестная явка';
  end if;

  select id into v_id from public.formation_marks
  where student_id = p_student_id and on_date = p_date;

  if v_att is null and trim(coalesce(p_comment, '')) = '' then
    delete from public.formation_marks where student_id = p_student_id and on_date = p_date;
    return json_build_object('deleted', true);
  end if;

  if v_id is null then
    v_id := 'fm_' || encode(gen_random_bytes(6), 'hex');
    insert into public.formation_marks(
      id, group_id, on_date, student_id, attendance, comment, author_label
    ) values (
      v_id, v_group, p_date, p_student_id, v_att,
      left(trim(coalesce(p_comment, '')), 200), left(coalesce(s.label, s.role), 64)
    );
  else
    update public.formation_marks set
      attendance = v_att,
      comment = left(trim(coalesce(p_comment, '')), 200),
      author_label = left(coalesce(s.label, s.role), 64),
      updated_at = now()
    where id = v_id;
  end if;

  return json_build_object('id', v_id, 'attendance', v_att);
end;
$$;

grant execute on function public.rasp_set_formation_mark(text, text, date, text, text)
  to anon, authenticated;


-- ============================================================
--  3/3 · Роли студентов, доп. админы, безопасная сессия
--  (было: supabase/roles_v2.sql)
-- ============================================================

-- Роли: студент получает права старосты, админов можно назначать отдельно.
-- Выполни один раз в Supabase → SQL Editor. Можно повторять.
--
-- ВАЖНО: старые коды НЕ удаляются и НЕ меняются.
--   • group_codes (коды старост) — работают как раньше;
--   • app_meta.admin_code_hash (главный админ-код) — работает как раньше;
--   • новый путь — students.role и таблица admin_codes.

-- 1) Роль у студента. Его личный код открывает права автоматически.
alter table public.students
  add column if not exists role text not null default 'student';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'students_role_check' and conrelid = 'public.students'::regclass
  ) then
    alter table public.students
      add constraint students_role_check
      check (role in ('student', 'starosta', 'teacher'));
  end if;
end $$;

create index if not exists students_role_idx
  on public.students (group_id, role) where role <> 'student';

-- 2) Дополнительные админы. Главный админ-код остаётся в app_meta.
create table if not exists public.admin_codes (
  id text primary key,
  code_hash text not null unique,
  code_plain text,
  label text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text not null default ''
);

alter table public.admin_codes enable row level security;

-- 3) Права на журнал: студент с ролью проходит наравне со старостой.
create or replace function public._journal_editor(p_token text, p_group_id text)
returns sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_all boolean := false;
  v_role text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then
    raise exception 'Нужен вход старосты, преподавателя или админа';
  end if;

  if s.role = 'admin' then
    return s;
  end if;

  -- студент (или староста-студент): роль хранится в students, код — его собственный
  if s.role in ('student', 'starosta') and s.code_id is not null then
    select role into v_role from public.students
    where id = s.code_id and active;
    if coalesce(v_role, 'student') in ('starosta', 'teacher') then
      return s;
    end if;
  end if;

  if s.role not in ('starosta', 'teacher') then
    raise exception 'Оценки ставит староста, преподаватель или админ';
  end if;

  if s.code_id is not null then
    select coalesce(all_groups, false) into v_all
    from public.group_codes where id = s.code_id and active;
  end if;
  if v_all or s.group_id = p_group_id then
    return s;
  end if;

  raise exception 'Нет прав на эту группу';
end;
$$;

-- 4) Запись ДЗ/замен: студент с ролью тоже проходит.
create or replace function public._require_write(p_token text, p_group_id text)
returns sessions
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_on boolean;
  v_role text;
  v_all boolean := false;
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

  -- повышенный студент пишет в свою группу
  if s.role in ('student', 'starosta') and s.code_id is not null then
    select role into v_role from public.students where id = s.code_id and active;
    if coalesce(v_role, 'student') in ('starosta', 'teacher') and s.group_id = p_group_id then
      return s;
    end if;
    select coalesce(all_groups, false) into v_all
    from public.group_codes where id = s.code_id and active;
    if coalesce(v_all, false) then
      return s;
    end if;
  end if;

  if s.role = 'starosta' then
    if s.code_id is not null then
      select coalesce(all_groups, false) into v_all
      from public.group_codes where id = s.code_id and active;
    end if;
    if coalesce(v_all, false) or s.group_id = p_group_id then
      return s;
    end if;
  end if;

  raise exception 'Нет прав на эту группу';
end;
$$;

-- 5) Вход по коду дополнительного админа.
--    Переопределяем rasp_login: сначала app_meta (как было), потом admin_codes.
--    Если admin_codes не заполнена — поведение идентично прежнему.
create or replace function public.rasp_login(
  p_code text,
  p_group_id text default null,
  p_visitor_id text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_admin text;
  v_admin_name text;
  v_admin_row public.admin_codes%rowtype;
  v_group_id text;
  v_label text;
  v_role_title text;
  v_code_id text;
  v_all boolean;
  v_can_rooms boolean;
  v_banned boolean;
  v_token text;
  v_ip text;
  v_ip_bucket text;
  v_code_bucket text;
  v_vid text;
  v_dev_ban boolean;
  v_student_id text;
  v_student_role text;
begin
  if p_code is null or length(trim(p_code)) < 8 then
    raise exception 'Код слишком короткий';
  end if;

  v_vid := left(regexp_replace(trim(coalesce(p_visitor_id, '')), '[^a-zA-Z0-9_-]', '', 'g'), 64);
  v_ip := public._client_ip();
  v_hash := public.hash_access_code(p_code);
  v_ip_bucket := 'ip:' || v_ip;
  v_code_bucket := 'code:' || left(v_hash, 20);

  select exists(
    select 1 from device_bans where visitor_id = v_vid and active and length(v_vid) >= 8
  ) into v_dev_ban;
  if coalesce(v_dev_ban, false) then
    perform public._write_audit('login_device_ban', p_group_id, 'visitor=' || left(v_vid, 16), 'anon');
    raise exception 'Доступ с этого устройства закрыт.';
  end if;

  if v_ip is not null and v_ip <> 'unknown' and public._login_locked(v_ip_bucket) then
    perform public._write_audit('login_lock_ip', p_group_id, 'blocked ip=' || v_ip, 'anon');
    raise exception 'Слишком много попыток с этого устройства/сети. Подождите ~15 минут.';
  end if;
  if public._login_locked(v_code_bucket) then
    perform public._write_audit('login_lock_code', p_group_id, 'blocked code-prefix=' || left(v_hash, 8), 'anon');
    raise exception 'Слишком много попыток для этого кода. Подождите ~15 минут.';
  end if;

  select admin_code_hash into v_admin from app_meta where id = 'main';
  select coalesce(nullif(trim(admin_display_name), ''), 'Админ') into v_admin_name
    from app_meta where id = 'main';

  -- (A) главный админ-код — как раньше
  if v_admin is not null and v_hash = v_admin then
    if v_ip is not null and v_ip <> 'unknown' then
      perform public._login_ok(v_ip_bucket);
    end if;
    perform public._login_ok(v_code_bucket);
    v_token := encode(gen_random_bytes(24), 'hex');
    insert into sessions(token, role, group_id, expires_at, label, code_id, code_hash)
      values (v_token, 'admin', null, now() + interval '100 years', v_admin_name, null, null);
    perform public._write_audit('login_admin', null, 'ok', 'admin');
    return json_build_object(
      'role', 'admin',
      'groupId', null,
      'allGroups', true,
      'canFreeRooms', true,
      'token', v_token,
      'label', v_admin_name,
      'roleTitle', 'Админ',
      'codeId', null,
      'avatarUrl', coalesce(
        (select nullif(trim(admin_avatar_url), '') from app_meta where id = 'main'),
        ''
      )
    );
  end if;

  -- (B) дополнительный админ — новая ветка, не мешает старой
  select * into v_admin_row from public.admin_codes
  where code_hash = v_hash and active limit 1;
  if v_admin_row.id is not null then
    if v_ip is not null and v_ip <> 'unknown' then
      perform public._login_ok(v_ip_bucket);
    end if;
    perform public._login_ok(v_code_bucket);
    v_token := encode(gen_random_bytes(24), 'hex');
    insert into sessions(token, role, group_id, expires_at, label, code_id, code_hash)
      values (v_token, 'admin', null, now() + interval '100 years',
              coalesce(nullif(trim(v_admin_row.label), ''), 'Админ'), v_admin_row.id, v_hash);
    perform public._write_audit('login_admin_extra', null, left(v_admin_row.label, 64), 'admin');
    return json_build_object(
      'role', 'admin',
      'groupId', null,
      'allGroups', true,
      'canFreeRooms', true,
      'token', v_token,
      'label', coalesce(nullif(trim(v_admin_row.label), ''), 'Админ'),
      'roleTitle', 'Админ',
      'codeId', v_admin_row.id
    );
  end if;

  -- (C) код старосты группы — как раньше.
  -- Сначала код «все группы» (у него group_id = null, обычный join его отбросил бы).
  select gc.id, gc.group_id, gc.label, coalesce(gc.role_title, ''), true,
         coalesce(gc.can_free_rooms, false), coalesce(gc.banned, false)
    into v_code_id, v_group_id, v_label, v_role_title, v_all, v_can_rooms, v_banned
  from group_codes gc
  where gc.code_hash = v_hash
    and gc.active
    and coalesce(gc.all_groups, false)
  limit 1;

  if v_code_id is null then
    select gc.id, gc.group_id, gc.label, coalesce(gc.role_title, ''), false,
           coalesce(gc.can_free_rooms, false), coalesce(gc.banned, false)
      into v_code_id, v_group_id, v_label, v_role_title, v_all, v_can_rooms, v_banned
    from group_codes gc
    join groups g on g.id = gc.group_id
    where gc.code_hash = v_hash
      and gc.active
      and coalesce(gc.all_groups, false) = false
      and g.active
      and (p_group_id is null or gc.group_id = p_group_id)
    limit 1;
  end if;

  if v_code_id is not null then
    if coalesce(v_banned, false) then
      if length(v_vid) >= 8 then
        insert into device_bans(visitor_id, code_id, label, created_at, active)
          values (v_vid, v_code_id, left(trim(coalesce(v_label, '')), 64), now(), true)
        on conflict (visitor_id) do update
          set active = true, code_id = excluded.code_id, label = excluded.label, created_at = now();
      end if;
      perform public._write_audit(
        'login_code_banned',
        case when v_all then null else v_group_id end,
        left(coalesce(v_label, ''), 64),
        'anon'
      );
      raise exception 'Этот код заблокирован';
    end if;

    if v_ip is not null and v_ip <> 'unknown' then
      perform public._login_ok(v_ip_bucket);
    end if;
    perform public._login_ok(v_code_bucket);
    v_token := encode(gen_random_bytes(24), 'hex');
    insert into sessions(token, role, group_id, expires_at, label, code_id, code_hash)
      values (v_token, 'starosta',
              case when v_all then null else v_group_id end,
              now() + interval '100 years',
              left(coalesce(v_label, ''), 64), v_code_id, v_hash);
    perform public._touch_code_visitor(v_code_id, v_vid);
    perform public._write_audit(
      'login_starosta',
      case when v_all then null else v_group_id end,
      case when v_all then 'all · ' || left(coalesce(v_label, ''), 56) else left(coalesce(v_label, ''), 64) end,
      'starosta'
    );
    return json_build_object(
      'role', 'starosta',
      'groupId', case when v_all then null else v_group_id end,
      'allGroups', coalesce(v_all, false),
      'canFreeRooms', coalesce(v_can_rooms, false),
      'token', v_token,
      'label', left(coalesce(v_label, ''), 64),
      'roleTitle', left(coalesce(v_role_title, ''), 32),
      'codeId', v_code_id,
      'avatarUrl', coalesce(
        (select nullif(trim(avatar_url), '') from group_codes where id = v_code_id),
        ''
      )
    );
  end if;

  -- (D) код студента с повышенной ролью — тоже староста
  select st.id, st.group_id, st.full_name, st.role
    into v_student_id, v_group_id, v_label, v_student_role
  from students st
  where st.code_hash = v_hash and st.active and st.role in ('starosta', 'teacher')
  limit 1;

  if v_student_id is not null then
    if v_ip is not null and v_ip <> 'unknown' then
      perform public._login_ok(v_ip_bucket);
    end if;
    perform public._login_ok(v_code_bucket);
    v_token := encode(gen_random_bytes(24), 'hex');
    insert into sessions(token, role, group_id, expires_at, label, code_id, code_hash)
      values (v_token, 'starosta', v_group_id, now() + interval '100 years',
              left(v_label, 64), v_student_id, v_hash);
    perform public._write_audit('login_student_starosta', v_group_id, left(v_label, 64), 'starosta');
    return json_build_object(
      'role', 'starosta',
      'groupId', v_group_id,
      'allGroups', false,
      'canFreeRooms', false,
      'token', v_token,
      'label', left(v_label, 64),
      'roleTitle', case when v_student_role = 'teacher' then 'Преподаватель' else 'Староста' end,
      'codeId', v_student_id
    );
  end if;

  perform public._login_fail(v_ip_bucket, 8, interval '15 minutes');
  perform public._login_fail(v_code_bucket, 8, interval '15 minutes');
  raise exception 'Неверный код';
end;
$$;

grant execute on function public.rasp_login(text, text, text) to anon, authenticated;

-- 6) Управление ролями и админами (только действующий админ).
create or replace function public.rasp_set_student_role(
  p_token text,
  p_student_id text,
  p_role text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_role text;
  v_group text;
  v_name text;
begin
  select * into s from sessions
  where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then
    raise exception 'Нужна админ-сессия';
  end if;

  v_role := lower(trim(coalesce(p_role, '')));
  if v_role not in ('student', 'starosta', 'teacher') then
    raise exception 'Неизвестная роль';
  end if;

  select group_id, surname into v_group, v_name
  from students where id = p_student_id and active;
  if v_group is null then
    raise exception 'Студент не найден';
  end if;

  update students set role = v_role where id = p_student_id;

  -- понижение — сразу гасим его сессии, чтобы права не висели
  if v_role = 'student' then
    delete from sessions where code_id = p_student_id and role = 'starosta';
  end if;

  perform public._write_audit(
    'student_role', v_group,
    left(coalesce(v_name, '') || ' → ' || v_role, 200), s.role, null
  );
  return json_build_object('id', p_student_id, 'role', v_role);
end;
$$;

grant execute on function public.rasp_set_student_role(text, text, text) to anon, authenticated;

create or replace function public.rasp_list_admins(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
begin
  select * into s from sessions
  where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then
    raise exception 'Нужна админ-сессия';
  end if;

  return json_build_object(
    'main', coalesce((select admin_display_name from app_meta where id = 'main'), 'Админ'),
    'extra', coalesce((
      select json_agg(json_build_object(
        'id', a.id,
        'label', a.label,
        'code', coalesce(a.code_plain, ''),
        'active', a.active,
        'createdAt', a.created_at
      ) order by a.created_at)
      from admin_codes a
    ), '[]'::json)
  );
end;
$$;

grant execute on function public.rasp_list_admins(text) to anon, authenticated;

create or replace function public.rasp_add_admin(
  p_token text,
  p_code text,
  p_label text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_plain text;
  v_hash text;
  v_id text;
  v_label text;
begin
  select * into s from sessions
  where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then
    raise exception 'Нужна админ-сессия';
  end if;

  v_plain := trim(coalesce(p_code, ''));
  if length(v_plain) < 8 then
    raise exception 'Код слишком короткий (мин. 8)';
  end if;
  v_label := left(trim(coalesce(p_label, '')), 64);
  if v_label = '' then
    raise exception 'Укажи имя админа';
  end if;

  v_hash := public.hash_access_code(v_plain);
  if exists (select 1 from admin_codes where code_hash = v_hash) then
    raise exception 'Такой код уже выдан';
  end if;
  if exists (select 1 from group_codes where code_hash = v_hash) then
    raise exception 'Такой код уже используется старостой';
  end if;
  if exists (select 1 from students where code_hash = v_hash and active) then
    raise exception 'Такой код уже используется студентом';
  end if;
  if v_hash = (select admin_code_hash from app_meta where id = 'main') then
    raise exception 'Это главный админ-код';
  end if;

  v_id := 'adm_' || encode(gen_random_bytes(6), 'hex');
  insert into admin_codes(id, code_hash, code_plain, label, active, created_by)
    values (v_id, v_hash, left(v_plain, 64), v_label, true, left(coalesce(s.label, s.role), 64));

  perform public._write_audit('admin_add', null, v_label, s.role, null);
  return json_build_object('id', v_id, 'label', v_label, 'code', left(v_plain, 64), 'active', true);
end;
$$;

grant execute on function public.rasp_add_admin(text, text, text) to anon, authenticated;

create or replace function public.rasp_revoke_admin(p_token text, p_admin_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_label text;
begin
  select * into s from sessions
  where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then
    raise exception 'Нужна админ-сессия';
  end if;

  -- нельзя отозвать главный админ-код: он живёт в app_meta, не здесь
  select label into v_label from admin_codes where id = p_admin_id;
  if v_label is null then
    raise exception 'Админ не найден';
  end if;

  update admin_codes set active = false where id = p_admin_id;
  delete from sessions where code_id = p_admin_id and role = 'admin';
  perform public._write_audit('admin_revoke', null, v_label, s.role, null);
end;
$$;

grant execute on function public.rasp_revoke_admin(text, text) to anon, authenticated;

-- 7) Список студентов отдаёт роль — для переключателя в админке.
create or replace function public.rasp_list_students(p_token text, p_group_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
begin
  s := public._journal_editor(p_token, p_group_id);
  return coalesce((
    select json_agg(json_build_object(
      'id', st.id,
      'fullName', st.full_name,
      'surname', st.surname,
      'hasCode', st.code_hash is not null,
      'role', coalesce(st.role, 'student'),
      'shared', st.code_hash is not null and (
        exists (select 1 from students o where o.id <> st.id and o.active and o.code_hash = st.code_hash)
        or exists (select 1 from group_codes gc where gc.code_hash = st.code_hash)
        or st.code_hash = (select admin_code_hash from app_meta where id = 'main')
      ),
      'code', coalesce(st.code_plain, '')
    ) order by st.sort_order, st.surname)
    from students st
    where st.group_id = p_group_id and st.active
  ), '[]'::json);
end;
$$;

grant execute on function public.rasp_list_students(text, text) to anon, authenticated;

-- 8) Сессия старосты, который на самом деле студент.
--    Без этого блока rasp_session ищет code_id только в group_codes,
--    не находит студента и УДАЛЯЕТ сессию при каждом открытии сайта.
--    Переопределяем функции с той же сигнатурой — старые коды не затрагиваются.

create or replace function public.rasp_session(p_token text, p_visitor_id text default null)
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
  v_role_title text;
  v_all boolean;
  v_can_rooms boolean := false;
  v_banned boolean := false;
  v_vid text;
  v_student_role text;
begin
  if p_token is null then return null; end if;
  select * into s from sessions where token = p_token;
  if s.token is null or s.expires_at < now() then
    delete from sessions where token = p_token;
    return null;
  end if;

  v_vid := left(regexp_replace(trim(coalesce(p_visitor_id, '')), '[^a-zA-Z0-9_-]', '', 'g'), 64);

  v_all := false;
  if s.role = 'starosta' then
    v_ok := false;

    -- (1) код принадлежит студенту с повышенной ролью
    if s.code_id is not null then
      select role into v_student_role
      from public.students
      where id = s.code_id and active;
      if coalesce(v_student_role, 'student') in ('starosta', 'teacher') then
        v_ok := true;
        v_all := false;
        v_can_rooms := false;
      end if;
    end if;

    -- (2) обычный код старосты группы (прежняя логика)
    if not v_ok then
      if s.code_id is not null then
        select exists (
          select 1 from group_codes gc
          where gc.id = s.code_id
            and gc.active
            and not coalesce(gc.banned, false)
            and (
              gc.all_groups
              or exists (select 1 from groups g where g.id = gc.group_id and g.active)
            )
        ),
        coalesce((select gc.all_groups from group_codes gc where gc.id = s.code_id), false),
        coalesce((select gc.can_free_rooms from group_codes gc where gc.id = s.code_id), false),
        coalesce((select gc.banned from group_codes gc where gc.id = s.code_id), false)
          into v_ok, v_all, v_can_rooms, v_banned;
        if coalesce(v_banned, false) and length(v_vid) >= 8 then
          insert into device_bans(visitor_id, code_id, label, created_at, active)
            values (
              v_vid,
              s.code_id,
              left(trim(coalesce(s.label, '')), 64),
              now(),
              true
            )
          on conflict (visitor_id) do update
            set active = true, code_id = excluded.code_id, label = excluded.label, created_at = now();
        end if;
      elsif s.code_hash is not null and s.code_hash <> '' then
        select exists (
          select 1 from group_codes gc
          where gc.code_hash = s.code_hash
            and gc.active
            and not coalesce(gc.banned, false)
            and (
              gc.all_groups
              or exists (select 1 from groups g where g.id = gc.group_id and g.active)
            )
        ), coalesce((
          select gc.all_groups from group_codes gc
          where gc.code_hash = s.code_hash and gc.active
          order by gc.all_groups desc limit 1
        ), false),
        coalesce((
          select gc.can_free_rooms from group_codes gc
          where gc.code_hash = s.code_hash and gc.active
          order by gc.all_groups desc limit 1
        ), false)
          into v_ok, v_all, v_can_rooms;
      else
        if coalesce(s.label, '') <> '' then
          select exists (
            select 1 from group_codes gc
            join groups g on g.id = gc.group_id
            where gc.group_id = s.group_id and gc.active and g.active and gc.label = s.label
              and not coalesce(gc.banned, false)
          ) into v_ok;
        else
          v_ok := true;
        end if;
      end if;
    end if;

    if not v_ok then
      delete from sessions where token = p_token;
      return null;
    end if;
    perform public._touch_code_visitor(s.code_id, v_vid);
  elsif s.role = 'admin' then
    v_all := true;
    v_can_rooms := true;
  end if;

  -- продлеваем «вечную» сессию при каждом чеке
  update sessions set expires_at = greatest(expires_at, now() + interval '100 years')
  where token = p_token;

  v_ava := public._session_avatar(s);
  v_label := public._session_display_label(s);
  v_role_title := public._session_role_title(s);

  if coalesce(s.label, '') is distinct from v_label then
    update sessions set label = v_label where token = p_token;
  end if;

  return json_build_object(
    'role', s.role,
    'groupId', s.group_id,
    'allGroups', coalesce(v_all, false),
    'canFreeRooms', coalesce(v_can_rooms, false) or s.role = 'admin',
    'token', s.token,
    'label', coalesce(v_label, ''),
    'roleTitle', coalesce(v_role_title, 'Староста'),
    'codeId', s.code_id,
    'avatarUrl', coalesce(v_ava, '')
  );
end;
$$;

grant execute on function public.rasp_session(text, text) to anon, authenticated;

-- Живое имя: для студента-старосты берём его ФИО из students, а не «Староста».
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

    select nullif(trim(full_name), '') into v
    from public.students
    where id = s.code_id and active and coalesce(role, 'student') in ('starosta', 'teacher');
    if v is not null then return left(v, 64); end if;
  end if;
  v := nullif(trim(coalesce(s.label, '')), '');
  if v is not null and lower(v) not in ('admin', 'админ', 'староста') then
    return left(v, 64);
  end if;
  return 'Староста';
end;
$$;

-- Подпись: у студента с ролью teacher — «Преподаватель».
create or replace function public._session_role_title(s sessions)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text;
  v_student_role text;
begin
  if s.role = 'admin' then
    return 'Админ';
  end if;
  if s.code_id is not null then
    select nullif(trim(role_title), '') into v from group_codes where id = s.code_id;
    if v is not null then return left(v, 32); end if;

    select coalesce(role, 'student') into v_student_role
    from public.students where id = s.code_id and active;
    if v_student_role = 'teacher' then return 'Преподаватель'; end if;
    if v_student_role = 'starosta' then return 'Староста'; end if;
  end if;
  return 'Староста';
end;
$$;

-- Аватар: у студента своей колонки нет — отдаём пусто, чтобы не падало.
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
    if v is not null then return v; end if;
  end if;
  return null;
end;
$$;

-- 9) Вход студента, у которого повышена роль.
--    Клиент сначала пробует rasp_student_login (когда ввели фамилию).
--    Без этого староста-студент получал role='student' и терял журнал.

create or replace function public.rasp_student_login(
  p_code text,
  p_visitor_id text default null,
  p_who text default null
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_id text;
  v_group text;
  v_name text;
  v_token text;
  v_vid text;
  v_ban boolean;
  v_who text;
  v_count int;
  v_role text;
begin
  if p_code is null or length(trim(p_code)) < 8 then
    raise exception 'Код слишком короткий';
  end if;
  v_vid := left(regexp_replace(trim(coalesce(p_visitor_id, '')), '[^a-zA-Z0-9_-]', '', 'g'), 64);
  select exists(
    select 1 from device_bans where visitor_id = v_vid and active and length(v_vid) >= 8
  ) into v_ban;
  if coalesce(v_ban, false) then
    raise exception 'Доступ с этого устройства закрыт.';
  end if;
  v_hash := public.hash_access_code(trim(p_code));
  v_who := lower(replace(trim(coalesce(p_who, '')), 'ё', 'е'));
  select count(*) into v_count from students where code_hash = v_hash and active;
  if v_count = 0 then
    raise exception 'Неверный код';
  end if;
  if v_count > 1 and v_who = '' then
    return json_build_object('needWho', true);
  end if;
  select id, group_id, full_name, coalesce(role, 'student')
    into v_id, v_group, v_name, v_role
  from students
  where code_hash = v_hash and active
    and (
      v_who = ''
      or lower(replace(surname, 'ё', 'е')) = v_who
      or lower(replace(full_name, 'ё', 'е')) = v_who
    )
  limit 1;
  if v_id is null then
    raise exception 'Неверный код';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  if v_role in ('starosta', 'teacher') then
    insert into sessions(token, role, group_id, expires_at, label, code_id, code_hash)
      values (v_token, 'starosta', v_group, now() + interval '100 years',
              left(v_name, 64), v_id, v_hash);
    perform public._write_audit('login_student_starosta', v_group, left(v_name, 64), 'starosta', v_vid);
    return json_build_object(
      'role', 'starosta',
      'groupId', v_group,
      'studentId', v_id,
      'allGroups', false,
      'canFreeRooms', false,
      'token', v_token,
      'label', left(v_name, 64),
      'roleTitle', case when v_role = 'teacher' then 'Преподаватель' else 'Староста' end,
      'codeId', v_id
    );
  end if;

  insert into sessions(token, role, group_id, expires_at, label, code_id, code_hash)
    values (v_token, 'student', v_group, now() + interval '100 years', left(v_name, 64), v_id, v_hash);
  perform public._write_audit('login_student', v_group, left(v_name, 64), 'student', v_vid);
  return json_build_object(
    'role', 'student',
    'groupId', v_group,
    'studentId', v_id,
    'allGroups', false,
    'canFreeRooms', false,
    'token', v_token,
    'label', v_name,
    'roleTitle', 'Студент',
    'codeId', v_id
  );
end;
$$;

grant execute on function public.rasp_student_login(text, text, text) to anon, authenticated;

-- 10) Свой дневник для студента с повышенной ролью.
--     Сессия у него role='starosta', а rasp_my_marks требовал строго 'student',
--     поэтому «Мои оценки» у старосты-студента падали с «Нужен вход студента».

create or replace function public.rasp_my_marks(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_student_id text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then
    raise exception 'Нужен вход студента';
  end if;

  -- id студента: либо прямой вход студента, либо староста-студент по своему коду
  if s.role = 'student' then
    v_student_id := s.code_id;
  elsif s.code_id is not null then
    select id into v_student_id
    from public.students
    where id = s.code_id and active;
  end if;

  if v_student_id is null then
    raise exception 'Нужен вход студента';
  end if;
  if not exists (select 1 from students where id = v_student_id and active) then
    delete from sessions where token = p_token;
    raise exception 'Код студента отключён';
  end if;

  return coalesce((
    with facts as (
      select
        g.id,
        g.on_date as date,
        g.slot_start as start,
        g.slot_end as "end",
        g.subject,
        'present'::text as attendance,
        g.value as grade,
        g.comment,
        g.author_label as author,
        g.created_at as at
      from journal_grades g
      where g.student_id = v_student_id

      union all

      select
        m.id,
        m.on_date,
        m.slot_start,
        m.slot_end,
        m.subject,
        m.attendance,
        null::smallint,
        m.comment,
        m.author_label,
        m.updated_at
      from journal_marks m
      where m.student_id = v_student_id
        and m.grade is null
        and coalesce(m.attendance, '') <> ''
    )
    select json_agg(json_build_object(
      'id', f.id,
      'date', f.date,
      'start', f.start,
      'end', f."end",
      'subject', f.subject,
      'attendance', f.attendance,
      'grade', f.grade,
      'comment', f.comment,
      'author', f.author
    ) order by f.date desc, f.start)
    from facts f
  ), '[]'::json);
end;
$$;

grant execute on function public.rasp_my_marks(text) to anon, authenticated;
