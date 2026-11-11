-- Журнал оценок и посещаемости. Пилот: список 0903-ПД3.
-- Выполни один раз в Supabase → SQL Editor. Можно повторять.
-- Итоговые за семестр и Excel сюда не входят.

do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.sessions'::regclass
      and c.contype = 'c'
      and a.attname = 'role'
  loop
    execute format('alter table public.sessions drop constraint %I', r.conname);
  end loop;
end $$;

alter table sessions
  add constraint sessions_role_check check (role in ('admin', 'starosta', 'student'));

create table if not exists public.students (
  id text primary key,
  group_id text not null references groups(id) on delete cascade,
  full_name text not null,
  surname text not null,
  code_hash text,
  code_plain text,
  active boolean not null default true,
  sort_order int not null default 0
);

drop index if exists students_code_hash_idx;
create index if not exists students_code_hash_idx on students (code_hash);

create table if not exists public.journal_marks (
  id text primary key,
  group_id text not null,
  student_id text not null references students(id) on delete cascade,
  on_date date not null,
  lesson_id text,
  slot_start text not null,
  slot_end text not null,
  subject text not null,
  attendance text,
  grade smallint,
  comment text not null default '',
  author_label text not null default '',
  author_code_id text,
  updated_at timestamptz not null default now(),
  unique (student_id, on_date, slot_start, slot_end)
);

alter table students enable row level security;
alter table journal_marks enable row level security;

create or replace function public._journal_editor(p_token text, p_group_id text)
returns sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_all boolean := false;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then
    raise exception 'Нужен вход старосты, преподавателя или админа';
  end if;
  if s.role = 'admin' then
    return s;
  end if;
  if s.role <> 'starosta' then
    raise exception 'Оценки ставит староста, преподаватель или админ';
  end if;
  if s.code_id is not null then
    select coalesce(all_groups, false) into v_all
    from group_codes where id = s.code_id and active;
  end if;
  if v_all or s.group_id = p_group_id then
    return s;
  end if;
  raise exception 'Нет прав на эту группу';
end;
$$;

-- Список пилотной группы, если группа уже есть в базе
insert into students (id, group_id, full_name, surname, sort_order)
select v.id, g.id, v.full_name, v.surname, v.sort_order
from groups g
join (
  values
    ('st_0903pd3_01', 'Аредакова Ангелина Артуровна', 'Аредакова', 1),
    ('st_0903pd3_02', 'Бендас Анастасия', 'Бендас', 2),
    ('st_0903pd3_03', 'Боджгуа Аманда Руслановна', 'Боджгуа', 3),
    ('st_0903pd3_04', 'Брюкин Бекзод Михайлович', 'Брюкин', 4),
    ('st_0903pd3_05', 'Войцеховский Никита Владимирович', 'Войцеховский', 5),
    ('st_0903pd3_06', 'Вольская Виктория Андреевна', 'Вольская', 6),
    ('st_0903pd3_07', 'Денисенко Руслан Анатольевич', 'Денисенко', 7),
    ('st_0903pd3_08', 'Жирикова Милана Эдуардовна', 'Жирикова', 8),
    ('st_0903pd3_09', 'Исмаилов Алексей Александрович', 'Исмаилов', 9),
    ('st_0903pd3_10', 'Камышева Стефания Александровна', 'Камышева', 10),
    ('st_0903pd3_11', 'Клименко Семен Никитич', 'Клименко', 11),
    ('st_0903pd3_12', 'Кобзева Анастасия Антоновна', 'Кобзева', 12),
    ('st_0903pd3_13', 'Коробейникова Екатерина Дмитриевна', 'Коробейникова', 13),
    ('st_0903pd3_14', 'Крупенина Виктория Дмитриевна', 'Крупенина', 14),
    ('st_0903pd3_15', 'Ломакин Даниил Антонович', 'Ломакин', 15),
    ('st_0903pd3_16', 'Матвеев Матвей Геннадьевич', 'Матвеев', 16),
    ('st_0903pd3_17', 'Николаев Степан Андреевич', 'Николаев', 17),
    ('st_0903pd3_18', 'Пронин Владислав Александрович', 'Пронин', 18),
    ('st_0903pd3_19', 'Тюшкин Максим Андреевич', 'Тюшкин', 19),
    ('st_0903pd3_20', 'Цирульник Данила Андреевич', 'Цирульник', 20),
    ('st_0903pd3_21', 'Шакшуева Екатерина Игоревна', 'Шакшуева', 21),
    ('st_0903pd3_22', 'Ясинецкая Дарина Дмитриевна', 'Ясинецкая', 22)
) as v(id, full_name, surname, sort_order) on true
where g.name = '0903-ПД3' and g.active
on conflict (id) do update
  set full_name = excluded.full_name,
      surname = excluded.surname,
      sort_order = excluded.sort_order,
      group_id = excluded.group_id;

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

create or replace function public.rasp_add_student(
  p_token text,
  p_group_id text,
  p_full_name text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_name text;
  v_sur text;
  v_id text;
  v_ord int;
begin
  s := public._journal_editor(p_token, p_group_id);
  v_name := left(trim(coalesce(p_full_name, '')), 120);
  if length(v_name) < 2 then
    raise exception 'Напиши фамилию и имя';
  end if;
  v_sur := split_part(v_name, ' ', 1);
  select coalesce(max(sort_order), 0) + 1 into v_ord from students where group_id = p_group_id;
  v_id := 'st_' || encode(gen_random_bytes(6), 'hex');
  insert into students(id, group_id, full_name, surname, sort_order)
  values (v_id, p_group_id, v_name, v_sur, v_ord);
  perform public._write_audit('student_add', p_group_id, left(v_name, 80), s.role, null);
  return json_build_object('id', v_id, 'fullName', v_name, 'surname', v_sur, 'hasCode', false, 'code', '');
end;
$$;

grant execute on function public.rasp_add_student(text, text, text) to anon, authenticated;

create or replace function public.rasp_set_student_code(
  p_token text,
  p_student_id text,
  p_code text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_group text;
  v_name text;
  v_plain text;
  v_hash text;
begin
  v_plain := trim(coalesce(p_code, ''));
  if length(v_plain) < 8 then
    raise exception 'Код слишком короткий (мин. 8)';
  end if;
  select group_id, surname into v_group, v_name from students where id = p_student_id and active;
  if v_group is null then
    raise exception 'Студент не найден';
  end if;
  s := public._journal_editor(p_token, v_group);
  v_hash := public.hash_access_code(v_plain);
  update students set code_hash = v_hash, code_plain = left(v_plain, 64) where id = p_student_id;
  perform public._write_audit('student_code', v_group, left(v_name, 64), s.role, null);
  return json_build_object(
    'id', p_student_id,
    'code', left(v_plain, 64),
    'shared', exists (
      select 1 from students o where o.id <> p_student_id and o.active and o.code_hash = v_hash
    ) or exists (select 1 from group_codes gc where gc.code_hash = v_hash)
      or v_hash = (select admin_code_hash from app_meta where id = 'main')
  );
end;
$$;

grant execute on function public.rasp_set_student_code(text, text, text) to anon, authenticated;

drop function if exists public.rasp_student_login(text, text);

create or replace function public.rasp_code_shared(p_code text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_students int;
  v_staff boolean;
begin
  if p_code is null or length(trim(p_code)) < 8 then
    return json_build_object('shared', false);
  end if;
  v_hash := public.hash_access_code(trim(p_code));
  select count(*) into v_students from students where code_hash = v_hash and active;
  v_staff := v_hash = (select admin_code_hash from app_meta where id = 'main')
    or exists (select 1 from group_codes where code_hash = v_hash and active);
  return json_build_object('shared', v_students > 1 or (v_students >= 1 and v_staff));
end;
$$;

grant execute on function public.rasp_code_shared(text) to anon, authenticated;

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
  select id, group_id, full_name into v_id, v_group, v_name
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

create or replace function public.rasp_journal_marks(
  p_token text,
  p_group_id text,
  p_date date
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
      'id', m.id,
      'studentId', m.student_id,
      'date', m.on_date,
      'lessonId', m.lesson_id,
      'start', m.slot_start,
      'end', m.slot_end,
      'subject', m.subject,
      'attendance', m.attendance,
      'grade', m.grade,
      'comment', m.comment,
      'author', m.author_label,
      'updatedAt', m.updated_at
    ))
    from journal_marks m
    where m.group_id = p_group_id and m.on_date = p_date
  ), '[]'::json);
end;
$$;

grant execute on function public.rasp_journal_marks(text, text, date) to anon, authenticated;

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
    raise exception 'Нет пары или даты';
  end if;

  select id, attendance, grade, comment
    into v_id, v_old_att, v_old_grade, v_old_comment
  from journal_marks
  where student_id = p_student_id and on_date = p_date and slot_start = v_start and slot_end = v_end;

  if v_id is not null
     and v_old_att is not distinct from v_att
     and v_old_grade is not distinct from v_grade
     and coalesce(v_old_comment, '') = v_comment then
    return json_build_object('id', v_id, 'unchanged', true);
  end if;

  if v_id is null then
    v_id := 'jm_' || encode(gen_random_bytes(6), 'hex');
    insert into journal_marks(
      id, group_id, student_id, on_date, lesson_id, slot_start, slot_end,
      subject, attendance, grade, comment, author_label, author_code_id
    ) values (
      v_id, v_group, p_student_id, p_date, nullif(p_lesson_id, ''), v_start, v_end,
      v_subject, v_att, v_grade, v_comment, left(coalesce(s.label, s.role), 64), s.code_id
    );
  else
    update journal_marks set
      lesson_id = nullif(p_lesson_id, ''),
      subject = v_subject,
      attendance = v_att,
      grade = v_grade,
      comment = v_comment,
      author_label = left(coalesce(s.label, s.role), 64),
      author_code_id = s.code_id,
      updated_at = now()
    where id = v_id;
  end if;

  perform public._write_audit(
    'journal_mark',
    v_group,
    left(
      v_sur || ' ' || p_date::text || ' ' || v_start
      || ' ' || coalesce(v_old_att, '—') || '/' || coalesce(v_old_grade::text, '—')
      || '→' || v_att || '/' || coalesce(v_grade::text, '—')
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
    'author', left(coalesce(s.label, s.role), 64)
  );
end;
$$;

alter table journal_marks alter column attendance drop not null;
alter table journal_marks alter column attendance drop default;

grant execute on function public.rasp_upsert_mark(text, text, date, text, text, text, text, text, int, text)
  to anon, authenticated;

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
    select json_agg(json_build_object(
      'id', m.id,
      'date', m.on_date,
      'start', m.slot_start,
      'end', m.slot_end,
      'subject', m.subject,
      'attendance', m.attendance,
      'grade', m.grade,
      'comment', m.comment,
      'author', m.author_label
    ) order by m.on_date desc, m.slot_start)
    from journal_marks m
    where m.student_id = s.code_id
  ), '[]'::json);
end;
$$;

grant execute on function public.rasp_my_marks(text) to anon, authenticated;

create or replace function public.rasp_student_set_own_code(p_token text, p_code text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_plain text;
  v_hash text;
begin
  select * into s from sessions where token = p_token and role = 'student' and expires_at > now();
  if s.token is null or s.code_id is null then
    raise exception 'Нужен вход студента';
  end if;
  v_plain := trim(coalesce(p_code, ''));
  if length(v_plain) < 8 then
    raise exception 'Код слишком короткий (мин. 8)';
  end if;
  v_hash := public.hash_access_code(v_plain);
  update students set code_hash = v_hash, code_plain = left(v_plain, 64) where id = s.code_id;
  update sessions set code_hash = v_hash where token = p_token;
  perform public._write_audit('student_code_self', s.group_id, left(coalesce(s.label, ''), 64), 'student', null);
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.rasp_student_set_own_code(text, text) to anon, authenticated;
