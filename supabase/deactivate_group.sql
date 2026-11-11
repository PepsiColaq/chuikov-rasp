-- Soft-delete group (hide from picker). Admin only.
-- Run in Supabase SQL Editor.

create or replace function public.rasp_deactivate_group(p_token text, p_group_id text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  g groups%rowtype;
begin
  select * into s from sessions
  where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then
    raise exception 'Нужен вход админа';
  end if;

  select * into g from groups where id = p_group_id;
  if g.id is null then
    raise exception 'Группа не найдена';
  end if;

  update groups set active = false where id = p_group_id;

  begin
    update group_codes set active = false where group_id = p_group_id;
  exception when undefined_table then
    null;
  end;

  begin
    insert into audit_log(action, group_id, detail, actor_role)
    values ('group_deactivate', p_group_id, left(coalesce(g.name, ''), 80), 'admin');
  exception when undefined_column then
    insert into audit_log(action, group_id, detail, by_role)
    values ('group_deactivate', p_group_id, left(coalesce(g.name, ''), 80), 'admin');
  when others then
    null;
  end;

  return json_build_object('ok', true, 'id', p_group_id, 'name', g.name);
end;
$$;

revoke all on function public.rasp_deactivate_group(text, text) from public;
grant execute on function public.rasp_deactivate_group(text, text) to anon, authenticated;
