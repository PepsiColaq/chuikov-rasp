-- One-shot migration: admin code, multi starosta codes, HW file attachments
-- Run in Supabase SQL Editor

create extension if not exists pgcrypto with schema extensions;

-- 1) Admin code = NikitosBrateevec1455
update app_meta
set admin_code_hash = public.hash_access_code('NikitosBrateevec1455')
where id = 'main';

-- 2) Multiple starosta codes per group
create table if not exists group_codes (
  id text primary key,
  group_id text not null references groups(id) on delete cascade,
  code_hash text not null,
  label text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists group_codes_hash_uidx on group_codes(code_hash);
create index if not exists group_codes_group_idx on group_codes(group_id) where active;

alter table group_codes enable row level security;
drop policy if exists "no public group_codes" on group_codes;
-- no public select: only via security definer RPCs

-- migrate legacy single hash into group_codes
insert into group_codes (id, group_id, code_hash, label, active)
select
  'gc_legacy_' || id,
  id,
  starosta_code_hash,
  'основной',
  true
from groups
where coalesce(starosta_code_hash, '') <> ''
  and not exists (
    select 1 from group_codes gc where gc.code_hash = groups.starosta_code_hash
  );

-- 3) Homework attachments (files + photos)
alter table homework add column if not exists images text[] not null default '{}';
alter table homework add column if not exists attachments jsonb not null default '[]'::jsonb;

-- 4) Login: admin + any active group code
create or replace function public.rasp_login(p_code text, p_group_id text default null)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_admin text;
  v_group_id text;
  v_token text;
  v_bucket text;
  v_fails int;
  v_locked timestamptz;
begin
  if p_code is null or length(trim(p_code)) < 8 then
    raise exception 'Код слишком короткий';
  end if;

  v_bucket := coalesce(p_group_id, 'any');
  select fails, locked_until into v_fails, v_locked from login_attempts where bucket = v_bucket;
  if v_locked is not null and v_locked > now() then
    raise exception 'Слишком много попыток. Подождите.';
  end if;

  v_hash := public.hash_access_code(p_code);
  select admin_code_hash into v_admin from app_meta where id = 'main';

  if v_admin is not null and v_hash = v_admin then
    delete from login_attempts where bucket = v_bucket;
    v_token := encode(gen_random_bytes(24), 'hex');
    insert into sessions(token, role, group_id, expires_at)
      values (v_token, 'admin', null, now() + interval '12 hours');
    insert into audit_log(action, by_role) values ('login_admin', 'admin');
    return json_build_object('role','admin','groupId',null,'token',v_token);
  end if;

  select gc.group_id into v_group_id
  from group_codes gc
  join groups g on g.id = gc.group_id
  where gc.code_hash = v_hash
    and gc.active
    and g.active
    and (p_group_id is null or gc.group_id = p_group_id)
  limit 1;

  -- legacy fallback: groups.starosta_code_hash
  if v_group_id is null then
    select g.id into v_group_id
    from groups g
    where g.starosta_code_hash = v_hash
      and g.active
      and (p_group_id is null or g.id = p_group_id)
    limit 1;
  end if;

  if v_group_id is not null then
    delete from login_attempts where bucket = v_bucket;
    v_token := encode(gen_random_bytes(24), 'hex');
    insert into sessions(token, role, group_id, expires_at)
      values (v_token, 'starosta', v_group_id, now() + interval '12 hours');
    insert into audit_log(action, group_id, by_role) values ('login_starosta', v_group_id, 'starosta');
    return json_build_object('role','starosta','groupId',v_group_id,'token',v_token);
  end if;

  insert into login_attempts(bucket, fails, locked_until)
    values (v_bucket, 1, null)
  on conflict (bucket) do update
    set fails = case when login_attempts.fails + 1 >= 8 then 0 else login_attempts.fails + 1 end,
        locked_until = case when login_attempts.fails + 1 >= 8 then now() + interval '15 minutes' else login_attempts.locked_until end;

  raise exception 'Неверный код';
end;
$$;

grant execute on function public.rasp_login(text, text) to anon, authenticated;

-- 5) Admin: add starosta code (keeps old codes — several starostas per group)
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
begin
  select * into s from sessions where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then raise exception 'Нужна админ-сессия'; end if;
  if not exists (select 1 from groups where id = p_group_id and active) then
    raise exception 'Группа не найдена';
  end if;
  if length(trim(coalesce(p_code, ''))) < 8 then
    raise exception 'Код слишком короткий (мин. 8)';
  end if;

  v_hash := public.hash_access_code(p_code);
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
  insert into group_codes(id, group_id, code_hash, label, active)
    values (v_id, p_group_id, v_hash, left(trim(coalesce(p_label, '')), 64), true);

  -- also keep legacy column in sync with latest code (optional convenience)
  update groups set starosta_code_hash = v_hash where id = p_group_id;

  insert into audit_log(action, group_id, detail, by_role)
    values ('starosta_code_add', p_group_id, left(trim(coalesce(p_label, '')), 64), 'admin');

  return json_build_object('id', v_id, 'groupId', p_group_id, 'label', left(trim(coalesce(p_label, '')), 64));
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

create or replace function public.rasp_revoke_starosta_code(p_token text, p_code_id text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_group text;
begin
  select * into s from sessions where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then raise exception 'Нужна админ-сессия'; end if;
  update group_codes set active = false
    where id = p_code_id and active
    returning group_id into v_group;
  if v_group is null then raise exception 'Код не найден'; end if;
  insert into audit_log(action, group_id, detail, by_role)
    values ('starosta_code_revoke', v_group, p_code_id, 'admin');
end;
$$;

grant execute on function public.rasp_revoke_starosta_code(text, text) to anon, authenticated;

-- keep reset_code as "add another code" alias for compatibility
create or replace function public.rasp_reset_code(p_token text, p_group_id text, p_new_code text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.rasp_add_starosta_code(p_token, p_group_id, p_new_code, 'сброс');
end;
$$;

-- create_group also inserts into group_codes
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
  v_code_id text;
begin
  select * into s from sessions where token = p_token and role = 'admin' and expires_at > now();
  if s.token is null then raise exception 'Нужна админ-сессия'; end if;
  if length(trim(p_name)) = 0 then raise exception 'Укажите название группы'; end if;
  if length(trim(p_starosta_code)) < 8 then raise exception 'Код слишком короткий'; end if;

  v_hash := public.hash_access_code(p_starosta_code);
  if exists (select 1 from group_codes where code_hash = v_hash)
     or exists (select 1 from groups where starosta_code_hash = v_hash) then
    raise exception 'Такой код уже используется';
  end if;

  v_id := 'g_' || encode(gen_random_bytes(6), 'hex');
  insert into groups(id, name, faculty, starosta_code_hash)
    values (v_id, left(trim(p_name), 48), left(coalesce(p_faculty,''), 32), v_hash);

  v_code_id := 'gc_' || encode(gen_random_bytes(8), 'hex');
  insert into group_codes(id, group_id, code_hash, label, active)
    values (v_code_id, v_id, v_hash, 'основной', true);

  insert into audit_log(action, group_id, detail, by_role)
    values ('group_create', v_id, trim(p_name), 'admin');
  return json_build_object('id', v_id, 'name', left(trim(p_name), 48));
end;
$$;

-- 6) Homework RPC with attachments jsonb
drop function if exists public.rasp_add_homework(text, text, text, text, date, text);
drop function if exists public.rasp_add_homework(text, text, text, text, date, text, text[]);
drop function if exists public.rasp_add_homework(text, text, text, text, date, text, text[], jsonb);

create or replace function public.rasp_add_homework(
  p_token text,
  p_group_id text,
  p_subject text,
  p_body text,
  p_due_date date,
  p_lesson_id text,
  p_images text[] default '{}',
  p_attachments jsonb default '[]'::jsonb
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_id text;
  v_imgs text[];
  v_att jsonb;
  v_len int;
begin
  s := public._require_write(p_token, p_group_id);
  if length(trim(coalesce(p_subject, ''))) = 0 then
    raise exception 'Укажите предмет';
  end if;

  v_imgs := coalesce(p_images, '{}');
  v_att := coalesce(p_attachments, '[]'::jsonb);
  if jsonb_typeof(v_att) <> 'array' then
    raise exception 'Неверный формат вложений';
  end if;
  v_len := jsonb_array_length(v_att);

  if length(trim(coalesce(p_body, ''))) = 0
     and coalesce(array_length(v_imgs, 1), 0) = 0
     and v_len = 0 then
    raise exception 'Укажите текст ДЗ или прикрепите файл';
  end if;
  if length(coalesce(p_body, '')) > 1000 then raise exception 'ДЗ слишком длинное'; end if;
  if coalesce(array_length(v_imgs, 1), 0) > 8 then raise exception 'Максимум 8 фото'; end if;
  if v_len > 8 then raise exception 'Максимум 8 файлов'; end if;

  v_id := 'hw_' || encode(gen_random_bytes(8), 'hex');
  insert into homework(id, group_id, subject, body, due_date, lesson_id, images, attachments)
    values (
      v_id,
      p_group_id,
      left(trim(p_subject), 80),
      left(trim(coalesce(p_body, '')), 1000),
      p_due_date,
      p_lesson_id,
      v_imgs,
      v_att
    );
  insert into audit_log(action, group_id, detail, by_role)
    values ('homework_add', p_group_id, left(trim(p_subject), 80), s.role);
  return json_build_object('id', v_id);
end;
$$;

grant execute on function public.rasp_add_homework(text, text, text, text, date, text, text[], jsonb) to anon, authenticated;

-- 7) Storage bucket for homework files
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hw-files',
  'hw-files',
  true,
  20971520,
  array[
    'image/jpeg','image/png','image/webp','image/gif','image/jpg',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/rtf',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.presentation'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- also keep/repair hw-photos for older clients
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hw-photos',
  'hw-photos',
  true,
  20971520,
  array[
    'image/jpeg','image/png','image/webp','image/gif','image/jpg',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "hw photos public read" on storage.objects;
drop policy if exists "hw photos upload" on storage.objects;
drop policy if exists "hw files public read" on storage.objects;
drop policy if exists "hw files upload" on storage.objects;

create policy "hw photos public read"
  on storage.objects for select
  using (bucket_id in ('hw-photos', 'hw-files'));

create policy "hw photos upload"
  on storage.objects for insert
  with check (
    bucket_id in ('hw-photos', 'hw-files')
    and storage.extension(name) in (
      'jpg','jpeg','png','webp','gif',
      'pdf','doc','docx','ppt','pptx','xls','xlsx','txt','rtf','odt','odp'
    )
  );

create policy "hw files public read"
  on storage.objects for select
  using (bucket_id = 'hw-files');

create policy "hw files upload"
  on storage.objects for insert
  with check (
    bucket_id = 'hw-files'
    and storage.extension(name) in (
      'jpg','jpeg','png','webp','gif',
      'pdf','doc','docx','ppt','pptx','xls','xlsx','txt','rtf','odt','odp'
    )
  );
