-- Точное время и автор у каждой отметки: видно, кто и во сколько поставил
-- «+», «н», «б» или оценку — вплоть до секунд.
-- Выполни один раз в Supabase → SQL Editor. Можно повторять.

-- ── Построение: отдаём время и автора каждой отметки ───────────────────
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
        'comment', fm.comment,
        'author', fm.author_label,
        'updatedAt', fm.updated_at
      ) order by fm.student_id)
      from public.formation_marks fm
      where fm.group_id = p_group_id and fm.on_date = p_date
    ), '[]'::json)
  );
end;
$$;

revoke all on function public.rasp_formation_day(text, text, date) from public;
grant execute on function public.rasp_formation_day(text, text, date) to anon, authenticated;

-- ── Отметка построения: возвращаем автора и секунду записи ─────────────
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
  v_at timestamptz;
  v_label text;
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

  v_label := left(coalesce(nullif(trim(coalesce(s.label, '')), ''), s.role, 'Редактор'), 64);

  select id, updated_at into v_id, v_at from public.formation_marks
  where student_id = p_student_id and on_date = p_date;

  if v_att is null and trim(coalesce(p_comment, '')) = '' then
    delete from public.formation_marks where student_id = p_student_id and on_date = p_date;
    return json_build_object('deleted', true);
  end if;

  if v_id is null then
    v_id := 'fm_' || encode(gen_random_bytes(6), 'hex');
    insert into public.formation_marks(
      id, group_id, on_date, student_id, attendance, comment, author_label, updated_at
    ) values (
      v_id, v_group, p_date, p_student_id, v_att,
      left(trim(coalesce(p_comment, '')), 200), v_label, now()
    )
    returning updated_at into v_at;
  else
    update public.formation_marks set
      attendance = v_att,
      comment = left(trim(coalesce(p_comment, '')), 200),
      author_label = v_label,
      updated_at = now()
    where id = v_id
    returning updated_at into v_at;
  end if;

  return json_build_object(
    'id', v_id,
    'attendance', v_att,
    'author', v_label,
    'updatedAt', v_at
  );
end;
$$;

revoke all on function public.rasp_set_formation_mark(text, text, date, text, text) from public;
grant execute on function public.rasp_set_formation_mark(text, text, date, text, text) to anon, authenticated;

-- ── Отметка в журнале пары: возвращаем время обновления ────────────────
-- Тело функции прежнее (точная копия из journal.sql), добавлены только
-- два поля в ответ: updatedAt и createdAt.
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
  v_sur text;
  v_att text;
  v_grade smallint;
  v_comment text;
  v_subject text;
  v_start text;
  v_end text;
  v_old_att text;
  v_old_grade smallint;
  v_old_comment text;
  v_id text;
  v_at timestamptz;
  v_created timestamptz;
  v_label text;
begin
  select group_id, surname into v_group, v_sur from students where id = p_student_id and active;
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
  if p_grade is null or p_grade = 0 then
    v_grade := null;
  elsif p_grade between 2 and 5 then
    v_grade := p_grade;
  else
    raise exception 'Оценка от 2 до 5';
  end if;
  v_comment := left(trim(coalesce(p_comment, '')), 200);
  v_subject := left(trim(coalesce(p_subject, '')), 80);
  v_start := left(trim(coalesce(p_start, '')), 8);
  v_end := left(trim(coalesce(p_end, '')), 8);
  if v_subject = '' or v_start = '' or v_end = '' or p_date is null then
    raise exception 'Не хватает данных пары';
  end if;

  v_label := left(coalesce(nullif(trim(coalesce(s.label, '')), ''), s.role, 'Редактор'), 64);

  select id, attendance, grade, comment, updated_at
    into v_id, v_old_att, v_old_grade, v_old_comment, v_at
  from journal_marks
  where student_id = p_student_id and on_date = p_date and slot_start = v_start and slot_end = v_end;

  if v_id is not null
     and v_old_att is not distinct from v_att
     and v_old_grade is not distinct from v_grade
     and coalesce(v_old_comment, '') = v_comment then
    return json_build_object(
      'id', v_id, 'unchanged', true,
      'author', v_label, 'updatedAt', v_at
    );
  end if;

  if v_id is null then
    v_id := 'jm_' || encode(gen_random_bytes(6), 'hex');
    insert into journal_marks(
      id, group_id, student_id, on_date, lesson_id, slot_start, slot_end,
      subject, attendance, grade, comment, author_label, author_code_id, updated_at
    ) values (
      v_id, v_group, p_student_id, p_date, nullif(p_lesson_id, ''), v_start, v_end,
      v_subject, v_att, v_grade, v_comment, v_label, s.code_id, now()
    )
    returning updated_at into v_at;
    v_created := v_at;
  else
    update journal_marks set
      lesson_id = nullif(p_lesson_id, ''),
      subject = v_subject,
      attendance = v_att,
      grade = v_grade,
      comment = v_comment,
      author_label = v_label,
      author_code_id = s.code_id,
      updated_at = now()
    where id = v_id
    returning updated_at into v_at;
    v_created := v_at;
  end if;

  perform public._write_audit(
    'journal_mark',
    v_group,
    left(
      v_sur || ' ' || p_date::text || ' ' || v_start
      || ' ' || coalesce(v_old_att, '-') || '/' || coalesce(v_old_grade::text, '-')
      || '→' || v_att || '/' || coalesce(v_grade::text, '-')
      || case when v_comment <> '' then ' ' || v_comment else '' end,
      200
    ),
    s.role,
    null
  );

  return json_build_object(
    'id', v_id,
    'studentId', p_student_id,
    'attendance', v_att,
    'grade', v_grade,
    'comment', v_comment,
    'author', v_label,
    'updatedAt', v_at,
    'createdAt', v_created
  );
end;
$$;

revoke all on function public.rasp_upsert_mark(text, text, date, text, text, text, text, text, int, text) from public;
grant execute on function public.rasp_upsert_mark(text, text, date, text, text, text, text, text, int, text)
  to anon, authenticated;

-- ── Оценка: возвращаем точное время создания и автора ──────────────────
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
  v_at timestamptz;
  v_label text;
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
    raise exception 'Слишком много оценок на пару';
  end if;

  v_label := left(coalesce(nullif(trim(coalesce(s.label, '')), ''), s.role, 'Редактор'), 64);
  v_id := 'jg_' || encode(gen_random_bytes(8), 'hex');
  insert into journal_grades(
    id, group_id, student_id, on_date, lesson_id, slot_start, slot_end,
    subject, value, kind, comment, author_label, author_code_id, created_at
  ) values (
    v_id, v_group, p_student_id, p_date, nullif(p_lesson_id, ''),
    left(trim(coalesce(p_start, '')), 8), left(trim(coalesce(p_end, '')), 8),
    left(trim(coalesce(p_subject, '')), 80), p_value, v_kind,
    left(trim(coalesce(p_comment, '')), 200), v_label, s.code_id, now()
  )
  returning created_at into v_at;

  perform public._write_audit(
    'journal_grade', v_group,
    left(p_date::text || ' ' || coalesce(p_start, '') || ' +' || p_value::text, 200),
    s.role, null
  );

  return json_build_object(
    'id', v_id,
    'value', p_value,
    'kind', v_kind,
    'author', v_label,
    'createdAt', v_at
  );
end;
$$;

revoke all on function public.rasp_add_grade(text, text, date, text, text, text, text, int, text, text) from public;
grant execute on function public.rasp_add_grade(text, text, date, text, text, text, text, int, text, text)
  to anon, authenticated;

-- ── Список оценок пары: author и createdAt уже есть, добавляем точное time
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

revoke all on function public.rasp_lesson_grades(text, text, date, text, text) from public;
grant execute on function public.rasp_lesson_grades(text, text, date, text, text) to anon, authenticated;
