-- Ручной порядок новостей + дата публикации в выдаче.
-- Выполни один раз в Supabase → SQL Editor. Можно повторять.

alter table public.news
  add column if not exists sort_order integer not null default 0;

-- Выдача: закреплённые сверху, внутри — ручной порядок, потом свежие.
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
      'sortOrder', n.sort_order,
      'createdAt', n.created_at
    ) order by n.pinned desc, n.sort_order desc, n.created_at desc)
    from (
      select * from public.news
      where deleted = false
        and (group_id is null or group_id = p_group_id)
      order by pinned desc, sort_order desc, created_at desc
      limit v_limit
    ) n
  ), '[]'::json);
end;
$$;

revoke all on function public.rasp_news(text, int) from public;
grant execute on function public.rasp_news(text, int) to anon, authenticated;

-- Перемещение: p_dir = 1 — выше, -1 — ниже.
-- Порядок пересчитывается целиком, поэтому «дырки» в sort_order не мешают.
create or replace function public.rasp_move_news(
  p_token text,
  p_id text,
  p_dir int
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_group text;
  v_pinned boolean;
  v_ids text[];
  v_i int;
  v_j int;
  v_tmp text;
  v_len int;
  k int;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;

  select group_id, pinned into v_group, v_pinned
  from public.news where id = p_id and deleted = false;
  if not found then raise exception 'Новость не найдена'; end if;

  if s.role <> 'admin' and (v_group is null or v_group <> coalesce(s.group_id, '')) then
    raise exception 'Можно менять порядок только в своей группе';
  end if;

  -- Берём только свой блок закреплённых/обычных: закреплённые всегда сверху.
  select array_agg(id order by sort_order desc, created_at desc)
  into v_ids
  from public.news
  where deleted = false
    and pinned = v_pinned
    and (group_id is null or group_id = v_group);

  v_len := coalesce(array_length(v_ids, 1), 0);
  if v_len < 2 then
    return json_build_object('moved', false);
  end if;

  v_i := array_position(v_ids, p_id);
  if v_i is null then
    return json_build_object('moved', false);
  end if;

  v_j := v_i - sign(coalesce(p_dir, 1));
  if v_j < 1 or v_j > v_len then
    return json_build_object('moved', false);
  end if;

  v_tmp := v_ids[v_i];
  v_ids[v_i] := v_ids[v_j];
  v_ids[v_j] := v_tmp;

  for k in 1..v_len loop
    update public.news
    set sort_order = v_len - k + 1
    where id = v_ids[k];
  end loop;

  return json_build_object('moved', true, 'position', v_j);
end;
$$;

revoke all on function public.rasp_move_news(text, text, int) from public;
grant execute on function public.rasp_move_news(text, text, int) to anon, authenticated;
