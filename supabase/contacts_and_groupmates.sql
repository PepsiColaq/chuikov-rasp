-- Контакты по желанию: студент сам вписывает телефон/почту и сам решает, видно ли их группе.
-- По умолчанию — пусто и скрыто. Ничего не импортируется из внешних файлов.
-- Выполни один раз в Supabase → SQL Editor. Можно повторять.

alter table students add column if not exists contact_phone text not null default '';
alter table students add column if not exists contact_email text not null default '';
alter table students add column if not exists contact_telegram text not null default '';
alter table students add column if not exists contact_visible boolean not null default false;

-- Студент правит свои контакты сам. Чужие — не может.
create or replace function public.rasp_set_my_contacts(
  p_token text,
  p_phone text default '',
  p_email text default '',
  p_telegram text default '',
  p_visible boolean default false
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  v_phone text;
  v_email text;
  v_tg text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then
    raise exception 'Нужен вход';
  end if;
  if s.code_id is null then
    raise exception 'Контакты есть только у студента с личным кодом';
  end if;
  if not exists (select 1 from students where id = s.code_id and active) then
    raise exception 'Студент не найден';
  end if;

  v_phone := left(trim(coalesce(p_phone, '')), 32);
  v_email := left(trim(coalesce(p_email, '')), 96);
  v_tg := left(trim(coalesce(p_telegram, '')), 64);

  if v_email <> '' and position('@' in v_email) = 0 then
    raise exception 'Почта без @ — похоже на опечатку';
  end if;

  update students
     set contact_phone = v_phone,
         contact_email = v_email,
         contact_telegram = v_tg,
         contact_visible = coalesce(p_visible, false)
   where id = s.code_id;

  return json_build_object(
    'phone', v_phone,
    'email', v_email,
    'telegram', v_tg,
    'visible', coalesce(p_visible, false)
  );
end;
$$;

grant execute on function public.rasp_set_my_contacts(text, text, text, text, boolean) to anon, authenticated;

-- Одногруппники + контакты тех, кто их открыл. Свои контакты видны всегда.
create or replace function public.rasp_groupmates(p_token text)
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

  v_group := s.group_id;
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

grant execute on function public.rasp_groupmates(text) to anon, authenticated;
