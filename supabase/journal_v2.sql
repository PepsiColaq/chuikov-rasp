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
