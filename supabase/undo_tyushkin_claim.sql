-- Откат массовой привязки: все ДЗ кроме админских снова без автора.
-- (Раньше безымянные ошибочно стали «Тюшкин».)
-- Выполни в Supabase → SQL Editor.

update homework
set
  author_code_id = null,
  author_label = '',
  author_avatar_url = null
where coalesce(author_code_id, '') is distinct from 'admin';

-- Админские оставить как Никитос
update homework
set author_label = coalesce(
  (select nullif(trim(admin_display_name), '') from app_meta where id = 'main'),
  'Никитос'
)
where author_code_id = 'admin';

-- Rename больше НЕ забирает чужие безымянные ДЗ
create or replace function public.rasp_rename_starosta_label(p_token text, p_code_id text, p_label text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_name text;
  v_group text;
  v_old text;
  v_n int := 0;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null or s.role <> 'admin' then
    raise exception 'Только админ';
  end if;

  v_name := left(trim(coalesce(p_label, '')), 64);
  if v_name = '' then raise exception 'Укажи имя'; end if;
  if p_code_id is null or trim(p_code_id) = '' then
    raise exception 'Нет кода';
  end if;

  select group_id, label into v_group, v_old
  from group_codes where id = p_code_id and active;
  if v_group is null then raise exception 'Код не найден'; end if;

  update group_codes set label = v_name where id = p_code_id;
  update sessions set label = v_name
    where code_id = p_code_id and expires_at > now();

  -- Только ДЗ, уже привязанные к этому коду (или со старым именем этого кода)
  update homework
    set author_label = v_name
    where author_code_id = p_code_id
       or (
         group_id = v_group
         and coalesce(trim(v_old), '') <> ''
         and lower(trim(coalesce(author_label, ''))) = lower(trim(v_old))
         and author_code_id = p_code_id
       );
  get diagnostics v_n = row_count;

  insert into audit_log(action, group_id, detail, by_role)
    values (
      'starosta_label_rename',
      v_group,
      left(coalesce(v_old, '') || ' → ' || v_name || ' · hw=' || v_n, 160),
      'admin'
    );

  return json_build_object(
    'id', p_code_id,
    'label', v_name,
    'groupId', v_group,
    'homeworkUpdated', v_n
  );
end;
$$;

grant execute on function public.rasp_rename_starosta_label(text, text, text) to anon, authenticated;

-- Явная привязка одного ДЗ к человеку (безопасно)
create or replace function public.rasp_set_homework_author(
  p_token text,
  p_hw_id text,
  p_code_id text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_group text;
  v_label text;
  v_ava text;
  v_hw_group text;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null or s.role <> 'admin' then
    raise exception 'Только админ';
  end if;

  select group_id into v_hw_group from homework where id = p_hw_id;
  if v_hw_group is null then raise exception 'ДЗ не найдено'; end if;

  if p_code_id is null or trim(p_code_id) = '' or p_code_id = 'admin' then
    v_label := coalesce(
      (select nullif(trim(admin_display_name), '') from app_meta where id = 'main'),
      'Никитос'
    );
    update homework
      set author_code_id = 'admin',
          author_label = v_label,
          author_avatar_url = (select nullif(trim(admin_avatar_url), '') from app_meta where id = 'main')
      where id = p_hw_id;
    return json_build_object('id', p_hw_id, 'label', v_label, 'codeId', 'admin');
  end if;

  select group_id, label, avatar_url into v_group, v_label, v_ava
  from group_codes where id = p_code_id and active;
  if v_group is null then raise exception 'Код не найден'; end if;
  if v_group <> v_hw_group then
    raise exception 'Код от другой группы';
  end if;

  v_label := left(trim(coalesce(v_label, '')), 64);
  if v_label = '' then raise exception 'У кода нет имени'; end if;

  update homework
    set author_code_id = p_code_id,
        author_label = v_label,
        author_avatar_url = nullif(trim(v_ava), '')
    where id = p_hw_id;

  insert into audit_log(action, group_id, detail, by_role)
    values ('homework_set_author', v_hw_group, left(p_hw_id || ' → ' || v_label, 160), 'admin');

  return json_build_object('id', p_hw_id, 'label', v_label, 'codeId', p_code_id);
end;
$$;

grant execute on function public.rasp_set_homework_author(text, text, text) to anon, authenticated;
