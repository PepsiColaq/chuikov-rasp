-- Support inbox: student TG messages → admin site + bot.
-- Run in Supabase SQL Editor.

create table if not exists public.support_tickets (
  id text primary key default substring(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  tg_user_id text not null,
  tg_username text not null default '',
  tg_name text not null default '',
  body text not null,
  status text not null default 'open'
    check (status in ('open', 'answered', 'closed')),
  answer text not null default '',
  pending_send boolean not null default false,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create index if not exists support_tickets_status_created_idx
  on public.support_tickets (status, created_at desc);

create index if not exists support_tickets_pending_send_idx
  on public.support_tickets (pending_send)
  where pending_send = true;

alter table public.support_tickets enable row level security;

create or replace function public._rasp_require_admin(p_token text)
returns sessions
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
begin
  select * into s from sessions
  where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then
    raise exception 'Нужен вход админа';
  end if;
  return s;
end;
$$;

create or replace function public.rasp_support_list(p_token text, p_limit int default 50)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  n int;
begin
  s := public._rasp_require_admin(p_token);
  n := greatest(1, least(coalesce(p_limit, 50), 100));
  return json_build_object(
    'ok', true,
    'openCount', (select count(*)::int from support_tickets where status = 'open'),
    'total', (select count(*)::int from support_tickets where status <> 'closed'),
    'items', coalesce((
      select json_agg(row_to_json(x))
      from (
        select
          id,
          tg_user_id as "tgUserId",
          tg_username as "tgUsername",
          tg_name as "tgName",
          body,
          status,
          answer,
          pending_send as "pendingSend",
          created_at as "createdAt",
          answered_at as "answeredAt"
        from support_tickets
        where status <> 'closed'
        order by
          case when status = 'open' then 0 else 1 end,
          created_at desc
        limit n
      ) x
    ), '[]'::json)
  );
end;
$$;

create or replace function public.rasp_support_reply(
  p_token text,
  p_id text,
  p_text text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  t support_tickets%rowtype;
  v_text text;
begin
  s := public._rasp_require_admin(p_token);
  v_text := left(trim(coalesce(p_text, '')), 3500);
  if v_text = '' then
    raise exception 'Пустой ответ';
  end if;

  select * into t from support_tickets where id = p_id and status <> 'closed';
  if t.id is null then
    raise exception 'Обращение не найдено';
  end if;

  update support_tickets
  set
    status = 'answered',
    answer = v_text,
    pending_send = true,
    answered_at = now()
  where id = t.id
  returning * into t;

  return json_build_object(
    'ok', true,
    'id', t.id,
    'tgUserId', t.tg_user_id,
    'answer', t.answer,
    'pendingSend', t.pending_send
  );
end;
$$;

create or replace function public.rasp_support_delete(p_token text, p_id text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
begin
  s := public._rasp_require_admin(p_token);
  update support_tickets
  set status = 'closed', pending_send = false
  where id = p_id and status <> 'closed';
  if not found then
    raise exception 'Обращение не найдено';
  end if;
  return json_build_object('ok', true, 'id', p_id);
end;
$$;

create or replace function public.rasp_support_delete_all(p_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  n int;
begin
  s := public._rasp_require_admin(p_token);
  with u as (
    update support_tickets
    set status = 'closed', pending_send = false
    where status <> 'closed'
    returning 1
  )
  select count(*)::int into n from u;
  return json_build_object('ok', true, 'deleted', coalesce(n, 0));
end;
$$;

revoke all on function public._rasp_require_admin(text) from public;
revoke all on function public.rasp_support_list(text, int) from public;
revoke all on function public.rasp_support_reply(text, text, text) from public;
revoke all on function public.rasp_support_delete(text, text) from public;
revoke all on function public.rasp_support_delete_all(text) from public;

grant execute on function public.rasp_support_list(text, int) to anon, authenticated;
grant execute on function public.rasp_support_reply(text, text, text) to anon, authenticated;
grant execute on function public.rasp_support_delete(text, text) to anon, authenticated;
grant execute on function public.rasp_support_delete_all(text) to anon, authenticated;
