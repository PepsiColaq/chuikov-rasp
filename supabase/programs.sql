-- Дополнительное образование и кружки/секции.
-- Выполни один раз в Supabase → SQL Editor. Можно повторять.
--
-- Одна таблица на оба раздела: p_kind = 'dpo' | 'club'.
-- Публиковать может админ, куратор, староста группы и редактор ленты.

create table if not exists public.programs (
  id text primary key,
  -- 'dpo' — дополнительное образование, 'club' — кружки и секции
  kind text not null check (kind in ('dpo', 'club')),
  -- null = видно всем группам
  group_id text references groups(id) on delete cascade,
  title text not null,
  subtitle text not null default '',
  body text not null default '',
  -- [{"url":"...","name":"фото","mime":"image/jpeg"}]
  attachments jsonb not null default '[]'::jsonb,
  -- [{"label":"Форма обучения","value":"Очная"},…] — таблица характеристик
  details jsonb not null default '[]'::jsonb,
  price text not null default '',
  duration text not null default '',
  contact text not null default '',
  video_url text not null default '',
  pinned boolean not null default false,
  deleted boolean not null default false,
  sort_order integer not null default 0,
  author_label text not null default '',
  author_code_id text,
  created_at timestamptz not null default now()
);

create index if not exists programs_kind_idx on public.programs (kind, deleted, sort_order desc);
create index if not exists programs_group_idx on public.programs (group_id);

alter table public.programs enable row level security;
drop policy if exists "no direct programs" on public.programs;
create policy "no direct programs" on public.programs for select using (false);

-- ── Чтение ────────────────────────────────────────────────────────────
create or replace function public.rasp_programs(
  p_kind text default null,
  p_group_id text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  return coalesce((
    select json_agg(json_build_object(
      'id', p.id,
      'kind', p.kind,
      'groupId', p.group_id,
      'title', p.title,
      'subtitle', p.subtitle,
      'body', p.body,
      'attachments', p.attachments,
      'details', p.details,
      'price', p.price,
      'duration', p.duration,
      'contact', p.contact,
      'videoUrl', p.video_url,
      'pinned', p.pinned,
      'sortOrder', p.sort_order,
      'author', p.author_label,
      'createdAt', p.created_at
    ) order by p.pinned desc, p.sort_order desc, p.created_at desc)
    from public.programs p
    where p.deleted = false
      and (p_kind is null or p.kind = p_kind)
      and (p.group_id is null or p.group_id = p_group_id)
  ), '[]'::json);
end;
$$;

revoke all on function public.rasp_programs(text, text) from public;
grant execute on function public.rasp_programs(text, text) to anon, authenticated;

-- ── Добавление / изменение ────────────────────────────────────────────
-- p_id = null → создать, иначе обновить существующую запись.
create or replace function public.rasp_program_save(
  p_token text,
  p_id text,
  p_kind text,
  p_group_id text,
  p_title text,
  p_subtitle text default '',
  p_body text default '',
  p_attachments jsonb default '[]'::jsonb,
  p_details jsonb default '[]'::jsonb,
  p_price text default '',
  p_duration text default '',
  p_contact text default '',
  p_video_url text default '',
  p_pinned boolean default false
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
  v_title text;
  v_id text;
  v_atts jsonb;
  v_det jsonb;
  v_label text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;
  if v_kind not in ('dpo', 'club') then raise exception 'Неизвестный раздел'; end if;

  v_cap := public._group_capability(p_token, p_group_id);
  if coalesce(v_cap, '') not in ('admin', 'curator', 'starosta', 'deputy', 'news') then
    raise exception 'Добавлять может админ, куратор, староста или редактор ленты';
  end if;

  v_title := left(trim(coalesce(p_title, '')), 160);
  if v_title = '' then raise exception 'Нужен заголовок'; end if;

  v_atts := coalesce((
    select jsonb_agg(jsonb_build_object(
      'url', item->>'url',
      'name', left(coalesce(item->>'name', 'файл'), 120),
      'mime', coalesce(item->>'mime', '')
    ))
    from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) item
    where coalesce(item->>'url', '') <> ''
  ), '[]'::jsonb);

  v_det := coalesce((
    select jsonb_agg(jsonb_build_object(
      'label', left(coalesce(item->>'label', ''), 80),
      'value', left(coalesce(item->>'value', ''), 400)
    ))
    from jsonb_array_elements(coalesce(p_details, '[]'::jsonb)) item
    where coalesce(item->>'label', '') <> '' or coalesce(item->>'value', '') <> ''
  ), '[]'::jsonb);

  v_label := public._session_display_label(s);

  if p_id is null or trim(p_id) = '' then
    v_id := 'prg_' || encode(gen_random_bytes(10), 'hex');
    insert into public.programs(
      id, kind, group_id, title, subtitle, body, attachments, details,
      price, duration, contact, video_url, pinned, author_label, author_code_id
    ) values (
      v_id, v_kind, p_group_id, v_title, left(coalesce(p_subtitle, ''), 300),
      left(coalesce(p_body, ''), 12000), v_atts, v_det,
      left(coalesce(p_price, ''), 120), left(coalesce(p_duration, ''), 120),
      left(coalesce(p_contact, ''), 300), left(coalesce(p_video_url, ''), 500),
      coalesce(p_pinned, false), v_label, s.code_id
    );
  else
    v_id := p_id;
    update public.programs set
      kind = v_kind,
      group_id = p_group_id,
      title = v_title,
      subtitle = left(coalesce(p_subtitle, ''), 300),
      body = left(coalesce(p_body, ''), 12000),
      attachments = v_atts,
      details = v_det,
      price = left(coalesce(p_price, ''), 120),
      duration = left(coalesce(p_duration, ''), 120),
      contact = left(coalesce(p_contact, ''), 300),
      video_url = left(coalesce(p_video_url, ''), 500),
      pinned = coalesce(p_pinned, false)
    where id = v_id and deleted = false;
    if not found then raise exception 'Запись не найдена'; end if;
  end if;

  insert into audit_log(action, group_id, detail, by_role)
  values ('program_save', p_group_id, v_kind || ':' || left(v_title, 60), s.role);

  return json_build_object('id', v_id, 'title', v_title);
end;
$$;

revoke all on function public.rasp_program_save(text, text, text, text, text, text, text, jsonb, jsonb, text, text, text, text, boolean) from public;
grant execute on function public.rasp_program_save(text, text, text, text, text, text, text, jsonb, jsonb, text, text, text, text, boolean) to anon, authenticated;

-- ── Удаление (мягкое) ─────────────────────────────────────────────────
create or replace function public.rasp_program_delete(p_token text, p_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_group text;
  v_cap text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;

  select group_id into v_group from public.programs where id = p_id and deleted = false;
  if not found then raise exception 'Запись не найдена'; end if;

  v_cap := public._group_capability(p_token, v_group);
  if coalesce(v_cap, '') not in ('admin', 'curator', 'starosta', 'deputy', 'news') then
    raise exception 'Нет прав';
  end if;

  update public.programs set deleted = true where id = p_id;

  insert into audit_log(action, group_id, detail, by_role)
  values ('program_delete', v_group, p_id, s.role);

  return json_build_object('id', p_id, 'deleted', true);
end;
$$;

revoke all on function public.rasp_program_delete(text, text) from public;
grant execute on function public.rasp_program_delete(text, text) to anon, authenticated;

-- ── Порядок: как у новостей ───────────────────────────────────────────
create or replace function public.rasp_program_move(p_token text, p_id text, p_dir int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_kind text;
  v_group text;
  v_ids text[];
  v_i int;
  v_j int;
  v_tmp text;
  v_len int;
  k int;
  v_cap text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;

  select kind, group_id into v_kind, v_group
  from public.programs where id = p_id and deleted = false;
  if not found then raise exception 'Запись не найдена'; end if;

  v_cap := public._group_capability(p_token, v_group);
  if coalesce(v_cap, '') not in ('admin', 'curator', 'starosta', 'deputy', 'news') then
    raise exception 'Нет прав';
  end if;

  select array_agg(id order by sort_order desc, created_at desc) into v_ids
  from public.programs
  where deleted = false and kind = v_kind and group_id is not distinct from v_group;

  v_len := coalesce(array_length(v_ids, 1), 0);
  if v_len < 2 then return json_build_object('moved', false); end if;

  v_i := array_position(v_ids, p_id);
  if v_i is null then return json_build_object('moved', false); end if;

  v_j := v_i - sign(coalesce(p_dir, 1));
  if v_j < 1 or v_j > v_len then return json_build_object('moved', false); end if;

  v_tmp := v_ids[v_i];
  v_ids[v_i] := v_ids[v_j];
  v_ids[v_j] := v_tmp;

  for k in 1..v_len loop
    update public.programs set sort_order = v_len - k + 1 where id = v_ids[k];
  end loop;

  return json_build_object('moved', true);
end;
$$;

revoke all on function public.rasp_program_move(text, text, int) from public;
grant execute on function public.rasp_program_move(text, text, int) to anon, authenticated;

-- ── Предзаполнение: дополнительное профессиональное образование ────────
-- Записи создаются один раз: повторный запуск ничего не дублирует.
-- Видео лежит в репозитории: public/video/dpo-intro.mp4 → путь ниже относительный.
insert into public.programs (
  id, kind, group_id, title, subtitle, body, attachments, details,
  price, duration, contact, video_url, pinned, author_label
)
values
  (
    'prg_dpo_bpla',
    'dpo',
    null,
    'Оператор наземных средств управления БПЛА',
    'Дополнительное профессиональное образование · набор открыт',
    'Процесс обучения предусматривает изучение основ законодательства об использовании беспилотных летательных аппаратов, их устройства, правил эксплуатации и пилотирования, основ и навыков пилотирования, управления системами.',
    '[]'::jsonb,
    '[{"label":"Форма обучения","value":"Очная с применением дистанционных образовательных технологий"},{"label":"Продолжительность","value":"Сертификат — 6 недель (76 часов); диплом — 11 недель (252 часа)"},{"label":"Документ по окончании","value":"Сертификат или диплом"}]'::jsonb,
    '15 000 ₽ / 59 900 ₽',
    '6 недель / 11 недель',
    'Сысоев Алексей Алексеевич · 8 (916)-286-61-75 · кабинет 211',
    'video/dpo-intro.mp4',
    true,
    'Колледж Чуйкова'
  ),
  (
    'prg_dpo_first_aid',
    'dpo',
    null,
    'Обучение лиц, обязанных и (или) имеющих право оказывать первую помощь',
    'Свидетельство о повышении квалификации',
    'Программа для тех, кто по закону обязан или имеет право оказывать первую помощь: алгоритмы действий, оценка состояния пострадавшего, остановка кровотечения, сердечно-лёгочная реанимация, психологическая поддержка.',
    '[]'::jsonb,
    '[{"label":"Форма обучения","value":"Очная с применением дистанционных образовательных технологий"},{"label":"Продолжительность","value":"2 недели (16 часов)"},{"label":"Документ по окончании","value":"Свидетельство о повышении квалификации"}]'::jsonb,
    '2 500 ₽',
    '2 недели (16 часов)',
    'Сысоев Алексей Алексеевич · 8 (916)-286-61-75 · кабинет 211',
    '',
    false,
    'Колледж Чуйкова'
  ),
  (
    'prg_dpo_tactical_med',
    'dpo',
    null,
    'Основы тактической медицины',
    'Короткий интенсив с сертификатом',
    'Базовая тактическая медицина: работа в зоне условного поражения, само- и взаимопомощь, жгуты и гемостатические средства, эвакуация пострадавшего.',
    '[]'::jsonb,
    '[{"label":"Форма обучения","value":"Очная с применением дистанционных образовательных технологий"},{"label":"Продолжительность","value":"2 недели (24 часа)"},{"label":"Документ по окончании","value":"Сертификат"}]'::jsonb,
    '4 700 ₽',
    '2 недели (24 часа)',
    'Сысоев Алексей Алексеевич · 8 (916)-286-61-75 · кабинет 211',
    '',
    false,
    'Колледж Чуйкова'
  ),
  (
    'prg_dpo_english',
    'dpo',
    null,
    'Английский язык — средство общения и познания',
    'Разговорный курс с сертификатом',
    'Курс для тех, кому английский нужен в работе и учёбе: разговорная практика, деловая переписка, понимание текстов и речи на слух.',
    '[]'::jsonb,
    '[{"label":"Форма обучения","value":"Очная с применением дистанционных образовательных технологий"},{"label":"Продолжительность","value":"10 недель (60 часов)"},{"label":"Документ по окончании","value":"Сертификат"}]'::jsonb,
    '18 900 ₽',
    '10 недель (60 часов)',
    'Сысоев Алексей Алексеевич · 8 (916)-286-61-75 · кабинет 211',
    '',
    false,
    'Колледж Чуйкова'
  )
on conflict (id) do nothing;
