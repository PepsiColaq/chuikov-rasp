-- Новости колледжа для ленты на главной. С фото и листанием.
-- Читать может любой, публиковать — староста/преподаватель/админ.
-- Выполни один раз в Supabase → SQL Editor. Можно повторять.

create table if not exists public.news (
  id text primary key,
  -- null = новость для всех групп
  group_id text references groups(id) on delete cascade,
  title text not null,
  body text not null default '',
  -- [{"url":"...","name":"фото","mime":"image/jpeg"}]
  attachments jsonb not null default '[]'::jsonb,
  author_label text not null default '',
  author_code_id text,
  pinned boolean not null default false,
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists news_feed_idx on public.news (deleted, pinned desc, created_at desc);
create index if not exists news_group_idx on public.news (group_id);

alter table public.news enable row level security;
-- Прямой доступ закрыт: всё идёт через функции ниже.
drop policy if exists "no direct news" on public.news;
create policy "no direct news" on public.news for select using (false);

-- ── Чтение ────────────────────────────────────────────────────────────
-- Отдаём новости группы + общие (group_id is null).
create or replace function public.rasp_news(
  p_group_id text default null,
  p_limit int default 30
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 30), 100));
begin
  return coalesce((
    select json_agg(json_build_object(
      'id', n.id,
      'groupId', n.group_id,
      'title', n.title,
      'body', n.body,
      'attachments', n.attachments,
      'author', n.author_label,
      'pinned', n.pinned,
      'createdAt', n.created_at
    ) order by n.pinned desc, n.created_at desc)
    from (
      select * from public.news
      where deleted = false
        and (group_id is null or group_id = p_group_id)
      order by pinned desc, created_at desc
      limit v_limit
    ) n
  ), '[]'::json);
end;
$$;

revoke all on function public.rasp_news(text, int) from public;
grant execute on function public.rasp_news(text, int) to anon, authenticated;

-- ── Публикация ────────────────────────────────────────────────────────
-- p_group_id = null → для всех групп.
create or replace function public.rasp_add_news(
  p_token text,
  p_group_id text,
  p_title text,
  p_body text default '',
  p_attachments jsonb default '[]'::jsonb,
  p_pinned boolean default false
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_title text;
  v_body text;
  v_id text;
  v_label text;
  v_atts jsonb;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;

  -- Права: админ — всегда; староста/преподаватель — только своя группа.
  if s.role <> 'admin' then
    if s.role not in ('starosta', 'teacher') then
      raise exception 'Публиковать может староста, преподаватель или админ';
    end if;
    if p_group_id is not null and s.group_id is not null and s.group_id <> p_group_id then
      raise exception 'Это не твоя группа';
    end if;
  end if;

  v_title := left(trim(coalesce(p_title, '')), 120);
  if v_title = '' then raise exception 'Нужен заголовок'; end if;
  v_body := left(trim(coalesce(p_body, '')), 4000);

  -- Только то, что похоже на вложение: url + имя.
  v_atts := coalesce((
    select jsonb_agg(jsonb_build_object(
      'url', item->>'url',
      'name', left(coalesce(item->>'name', 'файл'), 120),
      'mime', coalesce(item->>'mime', '')
    ))
    from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) item
    where coalesce(item->>'url', '') <> ''
  ), '[]'::jsonb);

  v_label := public._session_display_label(s);
  v_id := 'news_' || encode(gen_random_bytes(10), 'hex');

  insert into public.news(id, group_id, title, body, attachments, author_label, author_code_id, pinned)
  values (v_id, p_group_id, v_title, v_body, v_atts, v_label, s.code_id, coalesce(p_pinned, false));

  insert into audit_log(action, group_id, detail, by_role)
  values ('news_add', p_group_id, left(v_title, 80), s.role);

  return json_build_object('id', v_id, 'title', v_title, 'pinned', coalesce(p_pinned, false));
end;
$$;

revoke all on function public.rasp_add_news(text, text, text, text, jsonb, boolean) from public;
grant execute on function public.rasp_add_news(text, text, text, text, jsonb, boolean) to anon, authenticated;

-- ── Удаление (мягкое) ─────────────────────────────────────────────────
create or replace function public.rasp_delete_news(p_token text, p_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_group text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;

  select group_id into v_group from public.news where id = p_id and deleted = false;
  if not found then raise exception 'Новость не найдена'; end if;

  if s.role <> 'admin' and (v_group is null or v_group <> s.group_id) then
    raise exception 'Можно удалять только новости своей группы';
  end if;

  update public.news set deleted = true where id = p_id;

  insert into audit_log(action, group_id, detail, by_role)
  values ('news_delete', v_group, p_id, s.role);

  return json_build_object('id', p_id, 'deleted', true);
end;
$$;

revoke all on function public.rasp_delete_news(text, text) from public;
grant execute on function public.rasp_delete_news(text, text) to anon, authenticated;
