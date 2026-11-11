-- Исправление «Моя группа»: сессия старосты/админа может не иметь group_id
-- (админ, код «все группы»), поэтому группа передаётся параметром с клиента.
-- Выполни один раз в Supabase → SQL Editor. Можно повторять.

-- Старая версия принимала только токен — удаляем, чтобы не было двусмысленности.
drop function if exists public.rasp_groupmates(text);

create or replace function public.rasp_groupmates(p_token text, p_group_id text default null)
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
  if s.token is null then
    raise exception 'Нужен вход';
  end if;

  -- Порядок: явно переданная группа → своя у сессии → группа студента по его коду.
  v_group := nullif(trim(coalesce(p_group_id, '')), '');
  if v_group is null then
    v_group := s.group_id;
  end if;
  if v_group is null and s.code_id is not null then
    select group_id into v_group from students where id = s.code_id and active;
  end if;

  if v_group is null then
    return json_build_object(
      'groupId', null,
      'groupName', null,
      'me', null,
      'students', '[]'::json
    );
  end if;

  return json_build_object(
    'groupId', v_group,
    'groupName', (select name from groups where id = v_group),
    'me', case when s.code_id is null then null else (
      select json_build_object(
        'phone', coalesce(contact_phone, ''),
        'email', coalesce(contact_email, ''),
        'telegram', coalesce(contact_telegram, ''),
        'visible', coalesce(contact_visible, false)
      ) from students where id = s.code_id
    ) end,
    'students', coalesce((
      select json_agg(json_build_object(
        'id', st.id,
        'fullName', st.full_name,
        'surname', st.surname,
        'role', coalesce(st.role, 'student'),
        'isMe', st.id = s.code_id,
        'phone', case when st.id = s.code_id or st.contact_visible then coalesce(st.contact_phone, '') else '' end,
        'email', case when st.id = s.code_id or st.contact_visible then coalesce(st.contact_email, '') else '' end,
        'telegram', case when st.id = s.code_id or st.contact_visible then coalesce(st.contact_telegram, '') else '' end
      ) order by st.sort_order, st.surname)
      from students st
      where st.group_id = v_group and st.active
    ), '[]'::json)
  );
end;
$$;

grant execute on function public.rasp_groupmates(text, text) to anon, authenticated;
