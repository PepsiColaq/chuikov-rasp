-- Причина бана (опционально). Выполни в Supabase SQL Editor.

alter table group_codes add column if not exists ban_reason text;
alter table device_bans add column if not exists reason text;

create or replace function public.rasp_device_status(p_visitor_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vid text;
  v_ban device_bans%rowtype;
  v_reason text;
begin
  v_vid := left(regexp_replace(trim(coalesce(p_visitor_id, '')), '[^a-zA-Z0-9_-]', '', 'g'), 64);
  if length(v_vid) < 8 then
    return json_build_object('banned', false);
  end if;
  select * into v_ban from device_bans where visitor_id = v_vid and active limit 1;
  if v_ban.visitor_id is null then
    return json_build_object('banned', false);
  end if;
  v_reason := left(trim(coalesce(v_ban.reason, '')), 200);
  if v_reason = '' and v_ban.code_id is not null then
    select left(trim(coalesce(ban_reason, '')), 200) into v_reason
    from group_codes where id = v_ban.code_id;
  end if;
  return json_build_object(
    'banned', true,
    'codeId', v_ban.code_id,
    'label', coalesce(v_ban.label, ''),
    'reason', coalesce(v_reason, ''),
    'at', v_ban.created_at
  );
end;
$$;

grant execute on function public.rasp_device_status(text) to anon, authenticated;

drop function if exists public.rasp_ban_code(text, text);
drop function if exists public.rasp_ban_code(text, text, text);

create or replace function public.rasp_ban_code(
  p_token text,
  p_code_id text,
  p_reason text default null
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_label text;
  v_reason text;
begin
  select * into s from sessions where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then raise exception 'Нужна админ-сессия'; end if;

  v_reason := left(trim(coalesce(p_reason, '')), 200);

  update group_codes
    set banned = true,
        ban_reason = nullif(v_reason, '')
  where id = p_code_id and active
  returning label into v_label;
  if not found then raise exception 'Код не найден'; end if;

  delete from sessions where code_id = p_code_id;

  insert into device_bans(visitor_id, code_id, label, reason, created_at, active)
  select cv.visitor_id, p_code_id, coalesce(v_label, ''), nullif(v_reason, ''), now(), true
  from code_visitors cv
  where cv.code_id = p_code_id
  on conflict (visitor_id) do update
    set active = true,
        code_id = excluded.code_id,
        label = excluded.label,
        reason = excluded.reason,
        created_at = now();

  insert into audit_log(action, detail, by_role)
    values (
      'code_ban',
      left(coalesce(v_label, p_code_id) || case when v_reason <> '' then ' · ' || v_reason else '' end, 80),
      'admin'
    );

  return json_build_object(
    'id', p_code_id,
    'banned', true,
    'label', coalesce(v_label, ''),
    'reason', v_reason,
    'devices', (select count(*)::int from device_bans where code_id = p_code_id and active)
  );
end;
$$;

grant execute on function public.rasp_ban_code(text, text, text) to anon, authenticated;

create or replace function public.rasp_unban_code(p_token text, p_code_id text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_label text;
begin
  select * into s from sessions where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then raise exception 'Нужна админ-сессия'; end if;
  update group_codes set banned = false, ban_reason = null where id = p_code_id
    returning label into v_label;
  if not found then raise exception 'Код не найден'; end if;

  update device_bans set active = false, reason = null where code_id = p_code_id;

  insert into audit_log(action, detail, by_role)
    values ('code_unban', left(coalesce(v_label, p_code_id), 64), 'admin');

  return json_build_object('id', p_code_id, 'banned', false, 'label', coalesce(v_label, ''));
end;
$$;

grant execute on function public.rasp_unban_code(text, text) to anon, authenticated;

-- список кодов: + banReason
create or replace function public.rasp_list_starosta_codes(p_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
begin
  select * into s from sessions where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then raise exception 'Нужна админ-сессия'; end if;
  return coalesce((
    select json_agg(row_obj order by banned_sort, sort_all, sort_name, created_at desc)
    from (
      select
        json_build_object(
          'id', gc.id,
          'groupId', case when gc.all_groups then '__all__' else gc.group_id end,
          'groupName', case when gc.all_groups then 'Все группы' else coalesce(g.name, gc.group_id) end,
          'allGroups', gc.all_groups,
          'label', gc.label,
          'roleTitle', coalesce(gc.role_title, ''),
          'code', coalesce(gc.code_plain, ''),
          'createdAt', gc.created_at,
          'active', gc.active,
          'canFreeRooms', coalesce(gc.can_free_rooms, false),
          'banned', coalesce(gc.banned, false),
          'banReason', coalesce(gc.ban_reason, '')
        ) as row_obj,
        case when coalesce(gc.banned, false) then 0 else 1 end as banned_sort,
        case when gc.all_groups then 0 else 1 end as sort_all,
        coalesce(g.name, '') as sort_name,
        gc.created_at
      from group_codes gc
      left join groups g on g.id = gc.group_id
      where gc.active
    ) q
  ), '[]'::json);
end;
$$;

grant execute on function public.rasp_list_starosta_codes(text) to anon, authenticated;
