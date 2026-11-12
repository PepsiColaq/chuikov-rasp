-- ─────────────────────────────────────────────────────────────────────────────
--  Снятие отметки в журнале пары
--  Выполни один раз в Supabase → SQL Editor. Можно повторять.
--
--  Раньше пустая отметка сохранялась как «плюс», и снять её было невозможно.
--  Теперь: пустая явка + нет оценки + нет комментария = строку удаляем.
-- ─────────────────────────────────────────────────────────────────────────────

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

  -- ── Пустая отметка: ничего не оставляем, строку удаляем ──────────────────
  if v_att is null and v_grade is null and v_comment = '' then
    if v_id is not null then
      delete from journal_marks where id = v_id;
      perform public._write_audit(
        'journal_mark',
        v_group,
        left(v_sur || ' ' || p_date::text || ' ' || v_start || ' снята отметка', 200),
        s.role,
        null
      );
    end if;
    return json_build_object('deleted', true, 'attendance', null);
  end if;

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
      || '→' || coalesce(v_att, '-') || '/' || coalesce(v_grade::text, '-')
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

-- ── Разово подчищаем уже накопившиеся пустые строки ──────────────────────
-- (отметка без явки, без оценки и без комментария — их не должно быть вовсе)
delete from public.journal_marks
where coalesce(attendance, '') = ''
  and grade is null
  and coalesce(comment, '') = '';
