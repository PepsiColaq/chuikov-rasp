-- Emergency kill switch: turn site off/on for everyone (admin only).
-- Run in Supabase SQL Editor NOW, then refresh the site after deploy.

alter table public.app_meta
  add column if not exists site_enabled boolean not null default true;

alter table public.app_meta
  add column if not exists site_closed_message text
  not null default 'Сайт временно закрыт. Зайдите позже.';

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
    )
  )
  from app_meta
  where id = 'main';
$$;

grant execute on function public.rasp_public_meta() to anon, authenticated;

create or replace function public.rasp_set_site_enabled(
  p_token text,
  p_enabled boolean,
  p_message text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_msg text;
begin
  select * into s from sessions where token = p_token;
  if s.token is null or s.expires_at < now() then
    raise exception 'Нужен вход админа';
  end if;
  if s.role <> 'admin' then
    raise exception 'Только админ может включать/выключать сайт';
  end if;

  v_msg := nullif(trim(coalesce(p_message, '')), '');
  if v_msg is not null then
    v_msg := left(v_msg, 240);
  end if;

  update public.app_meta
  set
    site_enabled = coalesce(p_enabled, true),
    site_closed_message = coalesce(v_msg, site_closed_message)
  where id = 'main';

  begin
    insert into audit_log(action, group_id, detail, actor_role)
    values (
      case when coalesce(p_enabled, true) then 'site_on' else 'site_off' end,
      null,
      left(coalesce(v_msg, ''), 120),
      'admin'
    );
  exception when others then
    null;
  end;

  return json_build_object(
    'ok', true,
    'siteEnabled', coalesce(p_enabled, true),
    'closedMessage', (
      select coalesce(nullif(trim(site_closed_message), ''), 'Сайт временно закрыт. Зайдите позже.')
      from app_meta where id = 'main'
    )
  );
end;
$$;

revoke all on function public.rasp_set_site_enabled(text, boolean, text) from public;
grant execute on function public.rasp_set_site_enabled(text, boolean, text) to anon, authenticated;

-- Optional instant OFF right after running this file (uncomment if needed):
-- update public.app_meta set site_enabled = false where id = 'main';
