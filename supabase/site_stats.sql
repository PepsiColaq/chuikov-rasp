-- Anonymous site usage stats (no names/phones — only random visitor id).
-- Run once in Supabase → SQL Editor.

create table if not exists site_visits (
  day date not null,
  visitor_id text not null,
  hits int not null default 1,
  last_seen timestamptz not null default now(),
  group_id text,
  primary key (day, visitor_id)
);

create index if not exists site_visits_day_idx on site_visits (day);

alter table site_visits enable row level security;
-- no direct table access for anon; only via RPC

create or replace function public.rasp_track_visit(p_visitor_id text, p_group_id text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  vid text;
begin
  vid := left(trim(coalesce(p_visitor_id, '')), 64);
  if length(vid) < 8 then
    return;
  end if;
  -- only safe chars
  if vid !~ '^[a-zA-Z0-9_-]+$' then
    return;
  end if;

  insert into site_visits(day, visitor_id, hits, last_seen, group_id)
  values (current_date, vid, 1, now(), nullif(left(trim(coalesce(p_group_id, '')), 64), ''))
  on conflict (day, visitor_id) do update
    set hits = site_visits.hits + 1,
        last_seen = now(),
        group_id = coalesce(
          nullif(left(trim(coalesce(p_group_id, '')), 64), ''),
          site_visits.group_id
        );
end;
$$;

grant execute on function public.rasp_track_visit(text, text) to anon, authenticated;

create or replace function public.rasp_site_stats(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_today_u int;
  v_today_h int;
  v_yday_u int;
  v_d7_u int;
  v_d30_u int;
begin
  select * into s from sessions
  where token = p_token and role = 'admin' and expires_at > now();
  if not found then
    raise exception 'Нужен вход админа';
  end if;

  select count(*), coalesce(sum(hits), 0)
    into v_today_u, v_today_h
  from site_visits where day = current_date;

  select count(*) into v_yday_u
  from site_visits where day = current_date - 1;

  select count(distinct visitor_id) into v_d7_u
  from site_visits where day >= current_date - 6;

  select count(distinct visitor_id) into v_d30_u
  from site_visits where day >= current_date - 29;

  return json_build_object(
    'todayUnique', v_today_u,
    'todayHits', v_today_h,
    'yesterdayUnique', v_yday_u,
    'last7Unique', v_d7_u,
    'last30Unique', v_d30_u
  );
end;
$$;

grant execute on function public.rasp_site_stats(text) to anon, authenticated;
