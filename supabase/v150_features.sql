-- v150: настройки главной, построения по факультетам, автоотметка,
-- сессионное расписание из Excel.
-- Выполнить один раз в Supabase → SQL Editor. Файл можно запускать повторно.

-- ── 1. Новые поля настроек в app_meta ───────────────────────────────────
alter table public.app_meta
  add column if not exists home_no_lessons_text text not null default '';
alter table public.app_meta
  add column if not exists home_no_lessons_until timestamptz;
alter table public.app_meta
  add column if not exists formation_autofill boolean not null default false;
alter table public.app_meta
  add column if not exists formation_autofill_minutes int not null default 15;
alter table public.app_meta
  add column if not exists formation_autofill_needs_marks boolean not null default true;
alter table public.app_meta
  add column if not exists formation_faculties text[] not null default array['ПД', 'МЧС'];
alter table public.app_meta
  add column if not exists session_start date;
alter table public.app_meta
  add column if not exists session_end date;
alter table public.app_meta
  add column if not exists session_label text not null default '';

-- ── 2. Публичное чтение настроек (они всё равно видны на главной) ───────
create or replace function public.rasp_public_meta()
returns json
language sql
security definer
set search_path = public, extensions
as $$
  select json_build_object(
    'semesterLabel', semester_label,
    'siteEnabled', coalesce(site_enabled, true),
    'closedMessage', coalesce(
      nullif(trim(site_closed_message), ''),
      'Сайт временно закрыт. Зайдите позже.'
    ),
    'homeNoLessonsText', coalesce(home_no_lessons_text, ''),
    'homeNoLessonsUntil', home_no_lessons_until,
    'formationAutofill', coalesce(formation_autofill, false),
    'formationAutofillMinutes', coalesce(formation_autofill_minutes, 15),
    'formationAutofillNeedsMarks', coalesce(formation_autofill_needs_marks, true),
    'formationFaculties', coalesce(formation_faculties, array['ПД', 'МЧС']),
    'sessionStart', session_start,
    'sessionEnd', session_end,
    'sessionLabel', coalesce(session_label, '')
  )
  from app_meta
  where id = 'main';
$$;

grant execute on function public.rasp_public_meta() to anon, authenticated;

-- ── 3. Запись настроек: только админ ────────────────────────────────────
create or replace function public.rasp_set_app_settings(p_token text, p_patch jsonb)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_text text;
  v_until timestamptz;
begin
  select * into s from sessions where token = p_token;
  if s.token is null or s.expires_at < now() then
    raise exception 'Нужен вход админа';
  end if;
  if s.role <> 'admin' then
    raise exception 'Только админ меняет настройки сайта';
  end if;

  v_text := left(coalesce(p_patch->>'homeNoLessonsText', ''), 120);

  if p_patch ? 'homeNoLessonsUntil' then
    if coalesce(p_patch->>'homeNoLessonsUntil', '') = '' then
      v_until := null;
    else
      v_until := (p_patch->>'homeNoLessonsUntil')::timestamptz;
    end if;
  end if;

  update public.app_meta set
    home_no_lessons_text =
      case when p_patch ? 'homeNoLessonsText' then v_text else home_no_lessons_text end,
    home_no_lessons_until =
      case when p_patch ? 'homeNoLessonsUntil' then v_until else home_no_lessons_until end,
    formation_autofill =
      case when p_patch ? 'formationAutofill'
        then coalesce((p_patch->>'formationAutofill')::boolean, false)
        else formation_autofill end,
    formation_autofill_minutes =
      case when p_patch ? 'formationAutofillMinutes'
        then greatest(0, least(120, coalesce((p_patch->>'formationAutofillMinutes')::int, 15)))
        else formation_autofill_minutes end,
    formation_autofill_needs_marks =
      case when p_patch ? 'formationAutofillNeedsMarks'
        then coalesce((p_patch->>'formationAutofillNeedsMarks')::boolean, true)
        else formation_autofill_needs_marks end,
    formation_faculties =
      case when p_patch ? 'formationFaculties'
        then coalesce(
          (select array_agg(upper(trim(x)))
             from jsonb_array_elements_text(p_patch->'formationFaculties') as x
            where trim(x) <> ''),
          array['ПД', 'МЧС'])
        else formation_faculties end,
    session_start =
      case when p_patch ? 'sessionStart'
        then nullif(p_patch->>'sessionStart', '')::date
        else session_start end,
    session_end =
      case when p_patch ? 'sessionEnd'
        then nullif(p_patch->>'sessionEnd', '')::date
        else session_end end,
    session_label =
      case when p_patch ? 'sessionLabel'
        then left(coalesce(p_patch->>'sessionLabel', ''), 60)
        else session_label end
  where id = 'main';

  begin
    insert into audit_log(action, group_id, detail, actor_role)
    values ('app_settings', null, left(p_patch::text, 120), 'admin');
  exception when others then
    null;
  end;

  return public.rasp_public_meta();
end;
$$;

revoke all on function public.rasp_set_app_settings(text, jsonb) from public;
grant execute on function public.rasp_set_app_settings(text, jsonb) to anon, authenticated;

-- ── 4. Сессионные пары: дата + время, отдельно от недельного шаблона ────
create table if not exists public.session_lessons (
  id text primary key,
  group_id text not null references groups(id) on delete cascade,
  on_date date not null,
  start_time text not null,
  end_time text not null,
  subject text not null,
  teacher text not null default '',
  room text not null default '',
  kind text not null default '',
  remote boolean not null default false,
  batch_id text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists session_lessons_group_date_idx
  on public.session_lessons (group_id, on_date);
create index if not exists session_lessons_date_idx
  on public.session_lessons (on_date);
create index if not exists session_lessons_batch_idx
  on public.session_lessons (batch_id);

alter table public.session_lessons enable row level security;

drop policy if exists "public read session lessons" on public.session_lessons;
create policy "public read session lessons" on public.session_lessons
  for select using (true);

grant select on public.session_lessons to anon, authenticated;

-- ── 5. Импорт пачек строк из Excel ──────────────────────────────────────
create or replace function public.rasp_import_session(
  p_token text,
  p_batch text,
  p_rows jsonb,
  p_replace boolean default true
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  r jsonb;
  v_ok int := 0;
  v_skip int := 0;
  v_batch text := left(coalesce(nullif(trim(p_batch), ''), 'imp_' || encode(gen_random_bytes(4), 'hex')), 40);
  v_id text;
  v_dates date[];
  v_groups text[];
begin
  select * into s from sessions where token = p_token;
  if s.token is null or s.expires_at < now() then
    raise exception 'Нужен вход';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Нет строк для импорта';
  end if;

  select array_agg(distinct (x->>'date')::date), array_agg(distinct x->>'groupId')
    into v_dates, v_groups
    from jsonb_array_elements(p_rows) as x
   where coalesce(x->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$';

  if coalesce(p_replace, false) and v_dates is not null then
    delete from public.session_lessons sl
     where sl.on_date = any(v_dates)
       and sl.group_id = any(v_groups);
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      perform public._require_write(p_token, r->>'groupId');
    exception when others then
      v_skip := v_skip + 1;
      continue;
    end;

    if coalesce(r->>'subject', '') = ''
       or coalesce(r->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or coalesce(r->>'start', '') !~ '^\d{2}:\d{2}$' then
      v_skip := v_skip + 1;
      continue;
    end if;

    v_id := 'sl_' || encode(gen_random_bytes(8), 'hex');
    insert into public.session_lessons(
      id, group_id, on_date, start_time, end_time, subject, teacher, room, kind, remote, batch_id
    ) values (
      v_id,
      r->>'groupId',
      (r->>'date')::date,
      r->>'start',
      coalesce(nullif(r->>'end', ''), r->>'start'),
      left(r->>'subject', 120),
      left(coalesce(r->>'teacher', ''), 80),
      left(coalesce(r->>'room', ''), 32),
      left(coalesce(r->>'kind', ''), 40),
      coalesce((r->>'remote')::boolean, false),
      v_batch
    );
    v_ok := v_ok + 1;
  end loop;

  begin
    insert into audit_log(action, group_id, detail, actor_role)
    values ('session_import', null,
            format('%s пар, пропущено %s, пачка %s', v_ok, v_skip, v_batch), 'admin');
  exception when others then
    null;
  end;

  return json_build_object('imported', v_ok, 'skipped', v_skip, 'batch', v_batch);
end;
$$;

revoke all on function public.rasp_import_session(text, text, jsonb, boolean) from public;
grant execute on function public.rasp_import_session(text, text, jsonb, boolean) to anon, authenticated;

-- ── 6. Отмена последнего импорта ────────────────────────────────────────
create or replace function public.rasp_delete_session_batch(p_token text, p_batch text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_deleted int := 0;
begin
  select * into s from sessions where token = p_token;
  if s.token is null or s.expires_at < now() then
    raise exception 'Нужен вход';
  end if;
  if s.role <> 'admin' then
    raise exception 'Только админ может отменить импорт';
  end if;

  delete from public.session_lessons where batch_id = p_batch;
  get diagnostics v_deleted = row_count;
  return json_build_object('deleted', v_deleted, 'batch', p_batch);
end;
$$;

revoke all on function public.rasp_delete_session_batch(text, text) from public;
grant execute on function public.rasp_delete_session_batch(text, text) to anon, authenticated;

-- ── 7. Автоотметка «н» на построении ────────────────────────────────────
-- Ставит «н» всем, у кого нет отметки, когда наступило время построения
-- (первая очная пара минус formation_autofill_minutes). Идемпотентно.
create or replace function public.rasp_formation_autofill(
  p_token text,
  p_group_id text,
  p_date date
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_enabled boolean;
  v_minutes int;
  v_need_marks boolean;
  v_faculties text[];
  v_faculty text;
  v_name text;
  v_first text;
  v_marks int;
  v_filled int := 0;
begin
  select * into s from sessions where token = p_token;
  if s.token is null or s.expires_at < now() then
    raise exception 'Нужен вход';
  end if;
  perform public._require_write(p_token, p_group_id);

  select coalesce(formation_autofill, false),
         coalesce(formation_autofill_minutes, 15),
         coalesce(formation_autofill_needs_marks, true),
         coalesce(formation_faculties, array['ПД', 'МЧС'])
    into v_enabled, v_minutes, v_need_marks, v_faculties
    from public.app_meta where id = 'main';

  if not v_enabled then
    return json_build_object('filled', 0, 'skipped', 'off');
  end if;

  select coalesce(faculty, ''), name into v_faculty, v_name
    from public.groups where id = p_group_id;
  if v_faculty is null then
    return json_build_object('filled', 0, 'skipped', 'no_group');
  end if;

  -- Факультет решаем по полю, а если оно пустое — по названию группы.
  if not (upper(v_faculty) = any (v_faculties))
     and not exists (
       select 1 from unnest(v_faculties) f
        where upper(coalesce(v_name, '')) like '%' || upper(f) || '%'
     ) then
    return json_build_object('filled', 0, 'skipped', 'faculty');
  end if;

  if p_date <> current_date then
    return json_build_object('filled', 0, 'skipped', 'not_today');
  end if;

  if exists (select 1 from public.formation_days
              where group_id = p_group_id and on_date = p_date and cancelled) then
    return json_build_object('filled', 0, 'skipped', 'cancelled');
  end if;

  -- Первая пара дня: сессионная, иначе по недельному шаблону.
  select min(t.start_time) into v_first from (
    select start_time from public.session_lessons
     where group_id = p_group_id and on_date = p_date
    union all
    select start_time from public.lessons
     where group_id = p_group_id
       and day = extract(isodow from p_date)::int
  ) t;

  if v_first is null then
    return json_build_object('filled', 0, 'skipped', 'no_lessons');
  end if;

  if now() < (p_date::timestamp + v_first::time - make_interval(mins => v_minutes)) then
    return json_build_object('filled', 0, 'skipped', 'early');
  end if;

  select count(*) into v_marks from public.formation_marks
   where group_id = p_group_id and on_date = p_date;
  if v_need_marks and v_marks = 0 then
    -- Никто ещё не отмечал: не превращаем весь список в «н» вслепую.
    return json_build_object('filled', 0, 'skipped', 'no_marks');
  end if;

  insert into public.formation_marks(
    id, group_id, on_date, student_id, attendance, comment, author_label, updated_at
  )
  select 'fm_' || encode(gen_random_bytes(6), 'hex'),
         p_group_id, p_date, st.id, 'absent', 'авто: не отмечен', 'Авто', now()
    from public.students st
   where st.group_id = p_group_id
     and st.active
     and coalesce(st.role, 'student') = 'student'
     and not exists (
       select 1 from public.formation_marks fm
        where fm.student_id = st.id and fm.on_date = p_date
     );

  get diagnostics v_filled = row_count;
  if v_filled > 0 then
    begin
      insert into audit_log(action, group_id, detail, actor_role)
      values ('formation_autofill', p_group_id, format('%s чел.', v_filled), 'auto');
    exception when others then
      null;
    end;
  end if;

  return json_build_object('filled', v_filled, 'skipped', '');
end;
$$;

revoke all on function public.rasp_formation_autofill(text, text, date) from public;
grant execute on function public.rasp_formation_autofill(text, text, date) to anon, authenticated;

-- ── 8. Что осталось сделать руками ─────────────────────────────────────
-- 1) Открыть сайт, зайти админом → Профиль → Админка → «Расписание из Excel».
-- 2) Загрузить xlsx, проверить превью, нажать «Импортировать».
-- 3) Если у групп МЧС в таблице groups пустой faculty — вписать «МЧС»
--    в админке (Группы) или оставить как есть: автоотметка и построение
--    найдут факультет по названию группы.
