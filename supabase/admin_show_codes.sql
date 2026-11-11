-- Admin can view issued starosta codes (plaintext kept for admin recovery).
-- Run once in Supabase SQL Editor. Safe to re-run.

alter table group_codes add column if not exists code_plain text;

create or replace function public.rasp_add_starosta_code(
  p_token text,
  p_group_id text,
  p_code text,
  p_label text default ''
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_id text;
  v_hash text;
  v_plain text;
begin
  select * into s from sessions where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then raise exception 'Нужна админ-сессия'; end if;
  if not exists (select 1 from groups where id = p_group_id and active) then
    raise exception 'Группа не найдена';
  end if;
  v_plain := trim(coalesce(p_code, ''));
  if length(v_plain) < 8 then
    raise exception 'Код слишком короткий (мин. 8)';
  end if;

  v_hash := public.hash_access_code(v_plain);
  if exists (select 1 from group_codes where code_hash = v_hash) then
    raise exception 'Такой код уже используется';
  end if;
  if exists (select 1 from groups where starosta_code_hash = v_hash) then
    raise exception 'Такой код уже используется';
  end if;
  if v_hash = (select admin_code_hash from app_meta where id = 'main') then
    raise exception 'Нельзя использовать админ-код';
  end if;

  v_id := 'gc_' || encode(gen_random_bytes(8), 'hex');
  insert into group_codes(id, group_id, code_hash, code_plain, label, active)
    values (v_id, p_group_id, v_hash, left(v_plain, 64), left(trim(coalesce(p_label, '')), 64), true);

  update groups set starosta_code_hash = v_hash where id = p_group_id;

  insert into audit_log(action, group_id, detail, by_role)
    values ('starosta_code_add', p_group_id, left(trim(coalesce(p_label, '')), 64), 'admin');

  return json_build_object(
    'id', v_id,
    'groupId', p_group_id,
    'label', left(trim(coalesce(p_label, '')), 64),
    'code', left(v_plain, 64)
  );
end;
$$;

grant execute on function public.rasp_add_starosta_code(text, text, text, text) to anon, authenticated;

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
    select json_agg(json_build_object(
      'id', gc.id,
      'groupId', gc.group_id,
      'groupName', g.name,
      'label', gc.label,
      'code', coalesce(gc.code_plain, ''),
      'createdAt', gc.created_at,
      'active', gc.active
    ) order by g.name, gc.created_at desc)
    from group_codes gc
    join groups g on g.id = gc.group_id
    where gc.active
  ), '[]'::json);
end;
$$;

grant execute on function public.rasp_list_starosta_codes(text) to anon, authenticated;

-- New groups: also store plaintext of first starosta code
create or replace function public.rasp_create_group(
  p_token text, p_name text, p_faculty text, p_starosta_code text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_id text;
  v_hash text;
  v_plain text;
  v_code_id text;
begin
  select * into s from sessions where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then raise exception 'Нужна админ-сессия'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Укажите название'; end if;
  v_plain := trim(coalesce(p_starosta_code, ''));
  if length(v_plain) < 8 then raise exception 'Код слишком короткий'; end if;

  v_hash := public.hash_access_code(v_plain);
  if exists (select 1 from group_codes where code_hash = v_hash)
     or exists (select 1 from groups where starosta_code_hash = v_hash) then
    raise exception 'Такой код уже используется';
  end if;
  if v_hash = (select admin_code_hash from app_meta where id = 'main') then
    raise exception 'Нельзя использовать админ-код';
  end if;

  v_id := 'g_' || encode(gen_random_bytes(6), 'hex');
  insert into groups(id, name, faculty, starosta_code_hash)
    values (v_id, left(trim(p_name), 48), left(coalesce(p_faculty, ''), 32), v_hash);

  v_code_id := 'gc_' || encode(gen_random_bytes(8), 'hex');
  insert into group_codes(id, group_id, code_hash, code_plain, label, active)
    values (v_code_id, v_id, v_hash, left(v_plain, 64), 'основной', true);

  insert into audit_log(action, group_id, detail, by_role)
    values ('group_create', v_id, left(trim(p_name), 48), 'admin');

  return json_build_object('id', v_id, 'name', left(trim(p_name), 48));
end;
$$;

grant execute on function public.rasp_create_group(text, text, text, text) to anon, authenticated;
