-- Управление кураторами и назначение старост. Продолжение curators.sql.
-- Выполни после curators.sql.

-- ── Список кураторов (только админ) ───────────────────────────────────
create or replace function public.rasp_curators_list(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;
  if s.role <> 'admin' then raise exception 'Только админ'; end if;

  return coalesce((
    select json_agg(json_build_object(
      'id', c.id,
      'groupId', c.group_id,
      'groupName', g.name,
      'label', c.label,
      'code', coalesce(c.code_plain, ''),
      'active', c.active,
      'createdAt', c.created_at
    ) order by c.created_at desc)
    from curators c
    left join groups g on g.id = c.group_id
    where c.active
  ), '[]'::json);
end;
$$;

revoke all on function public.rasp_curators_list(text) from public;
grant execute on function public.rasp_curators_list(text) to anon, authenticated;

-- ── Создать куратора (только админ) ───────────────────────────────────
-- p_group_id = null → куратор всех групп.
create or replace function public.rasp_curator_create(
  p_token text,
  p_group_id text,
  p_label text,
  p_code text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_code text;
  v_hash text;
  v_id text;
  v_label text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;
  if s.role <> 'admin' then raise exception 'Только админ может назначать кураторов'; end if;

  v_code := trim(coalesce(p_code, ''));
  if length(v_code) < 8 then raise exception 'Код короче 8 символов'; end if;

  v_label := left(trim(coalesce(p_label, '')), 60);
  if v_label = '' then raise exception 'Нужно имя куратора'; end if;

  if p_group_id is not null and not exists (select 1 from groups where id = p_group_id) then
    raise exception 'Группы нет';
  end if;

  v_hash := public.hash_access_code(v_code);

  if exists (select 1 from curators where code_hash = v_hash)
     or exists (select 1 from group_codes where code_hash = v_hash)
     or exists (select 1 from students where code_hash = v_hash and active) then
    raise exception 'Такой код уже занят';
  end if;

  v_id := 'cur_' || encode(gen_random_bytes(8), 'hex');
  insert into curators(id, group_id, code_hash, code_plain, label, created_by)
  values (v_id, p_group_id, v_hash, v_code, v_label, s.code_id);

  insert into audit_log(action, group_id, detail, by_role)
  values ('curator_add', p_group_id, left(v_label, 60), s.role);

  return json_build_object('id', v_id, 'label', v_label, 'code', v_code);
end;
$$;

revoke all on function public.rasp_curator_create(text, text, text, text) from public;
grant execute on function public.rasp_curator_create(text, text, text, text) to anon, authenticated;

-- ── Убрать куратора ───────────────────────────────────────────────────
create or replace function public.rasp_curator_revoke(p_token text, p_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;
  if s.role <> 'admin' then raise exception 'Только админ'; end if;

  update curators set active = false where id = p_id;
  if not found then raise exception 'Куратор не найден'; end if;

  -- Сессии этого кода больше не валидны.
  delete from sessions where code_id = p_id and role = 'curator';

  insert into audit_log(action, detail, by_role)
  values ('curator_revoke', p_id, s.role);

  return json_build_object('id', p_id, 'revoked', true);
end;
$$;

revoke all on function public.rasp_curator_revoke(text, text) from public;
grant execute on function public.rasp_curator_revoke(text, text) to anon, authenticated;

-- ── Назначить студента старостой (куратор или админ) ──────────────────
create or replace function public.rasp_set_starosta(p_token text, p_group_id text, p_student_id text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_cap text;
  v_label text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;

  v_cap := public._group_capability(p_token, p_group_id);
  if v_cap not in ('admin', 'curator') then
    raise exception 'Старост назначает куратор или админ';
  end if;

  if not exists (select 1 from students where id = p_student_id and group_id = p_group_id and active) then
    raise exception 'Такого студента нет в группе';
  end if;

  -- Староста в группе один: прежнему возвращаем обычную роль.
  update students set role = 'student'
  where group_id = p_group_id and role = 'starosta' and id <> p_student_id;

  update students set role = 'starosta' where id = p_student_id;

  -- Старосте больше не нужны делегированные права: он и так главный.
  delete from group_staff where group_id = p_group_id and student_id = p_student_id;

  select full_name into v_label from students where id = p_student_id;

  insert into audit_log(action, group_id, detail, by_role)
  values ('starosta_set', p_group_id, left(coalesce(v_label, p_student_id), 80), s.role);

  return json_build_object('studentId', p_student_id, 'role', 'starosta');
end;
$$;

revoke all on function public.rasp_set_starosta(text, text, text) from public;
grant execute on function public.rasp_set_starosta(text, text, text) to anon, authenticated;

-- ── Вход по коду куратора: обёртка над rasp_login ─────────────────────
-- Куратор авторизуется как обычный код: sessions.code_id = curators.id, role = 'curator'.
create or replace function public.rasp_curator_login(p_code text, p_visitor_id text default null)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_row curators%rowtype;
  v_token text;
  v_vid text;
  v_ban boolean;
begin
  if p_code is null or length(trim(p_code)) < 8 then
    raise exception 'Код слишком короткий';
  end if;

  v_vid := left(regexp_replace(trim(coalesce(p_visitor_id, '')), '[^a-zA-Z0-9_-]', '', 'g'), 64);
  select exists(
    select 1 from device_bans where visitor_id = v_vid and active and length(v_vid) >= 8
  ) into v_ban;
  if coalesce(v_ban, false) then raise exception 'Доступ с этого устройства закрыт.'; end if;

  v_hash := public.hash_access_code(trim(p_code));

  select * into v_row from curators where code_hash = v_hash and active;
  if v_row.id is null then raise exception 'Неверный код'; end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  insert into sessions(token, role, group_id, code_id, label, expires_at)
  values (
    v_token,
    'curator',
    v_row.group_id,
    v_row.id,
    v_row.label,
    now() + interval '30 days'
  );

  insert into audit_log(action, group_id, detail, by_role)
  values ('login', v_row.group_id, 'curator', 'curator');

  return json_build_object(
    'role', 'curator',
    'groupId', v_row.group_id,
    'token', v_token,
    'label', v_row.label,
    'codeId', v_row.id,
    'avatarUrl', ''
  );
end;
$$;

revoke all on function public.rasp_curator_login(text, text) from public;
grant execute on function public.rasp_curator_login(text, text) to anon, authenticated;
