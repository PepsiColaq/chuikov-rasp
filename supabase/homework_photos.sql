-- Photos for homework (run in SQL Editor once)

alter table homework add column if not exists images text[] not null default '{}';

-- Recreate add-homework RPC with images
drop function if exists public.rasp_add_homework(text, text, text, text, date, text);
drop function if exists public.rasp_add_homework(text, text, text, text, date, text, text[]);

create or replace function public.rasp_add_homework(
  p_token text,
  p_group_id text,
  p_subject text,
  p_body text,
  p_due_date date,
  p_lesson_id text,
  p_images text[] default '{}'
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_id text;
  v_imgs text[];
begin
  s := public._require_write(p_token, p_group_id);
  if length(trim(coalesce(p_subject, ''))) = 0 and (p_images is null or array_length(p_images, 1) is null) then
    raise exception 'Укажите текст ДЗ или фото';
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 and (p_images is null or coalesce(array_length(p_images, 1), 0) = 0) then
    raise exception 'Укажите текст ДЗ или прикрепите фото';
  end if;
  if length(coalesce(p_body, '')) > 1000 then raise exception 'ДЗ слишком длинное'; end if;

  v_imgs := coalesce(p_images, '{}');
  if coalesce(array_length(v_imgs, 1), 0) > 6 then
    raise exception 'Максимум 6 фото';
  end if;

  v_id := 'hw_' || encode(gen_random_bytes(8), 'hex');
  insert into homework(id, group_id, subject, body, due_date, lesson_id, images)
    values (
      v_id,
      p_group_id,
      left(trim(p_subject), 80),
      left(trim(coalesce(p_body, '')), 1000),
      p_due_date,
      p_lesson_id,
      v_imgs
    );
  insert into audit_log(action, group_id, detail, by_role)
    values ('homework_add', p_group_id, left(trim(p_subject), 80), s.role);
  return json_build_object('id', v_id);
end;
$$;

grant execute on function public.rasp_add_homework(text, text, text, text, date, text, text[]) to anon, authenticated;

-- Storage bucket for photos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hw-photos',
  'hw-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/jpg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "hw photos public read" on storage.objects;
drop policy if exists "hw photos upload" on storage.objects;
drop policy if exists "hw photos update" on storage.objects;

create policy "hw photos public read"
  on storage.objects for select
  using (bucket_id = 'hw-photos');

create policy "hw photos upload"
  on storage.objects for insert
  with check (
    bucket_id = 'hw-photos'
    and (storage.extension(name) = 'jpg'
      or storage.extension(name) = 'jpeg'
      or storage.extension(name) = 'png'
      or storage.extension(name) = 'webp'
      or storage.extension(name) = 'gif')
  );
