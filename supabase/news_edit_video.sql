-- ─────────────────────────────────────────────────────────────────────────────
--  Правка события в ленте + видео во вложениях
--  Выполни один раз в Supabase → SQL Editor. Можно повторять.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Разрешаем видео во вложениях (xlsx/pptx уже были, добавляем mp4/webm/mov/m4v)
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct m)
  from unnest(
    coalesce(allowed_mime_types, '{}'::text[]) || array[
      'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'
    ]
  ) as m
)
where id in ('hw-files', 'hw-photos');

-- Видео тяжелее фото: поднимаем лимит файла в хранилище до 60 МБ
update storage.buckets
set file_size_limit = 62914560
where id in ('hw-files', 'hw-photos');

-- 2) Билет на загрузку: разрешаем видео-расширения
create or replace function public.rasp_issue_hw_upload_ticket(
  p_token text,
  p_group_id text,
  p_ext text,
  p_folder text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_ext text;
  v_id text;
  v_folder text;
  v_path text;
  v_bucket text := 'hw-files';
begin
  s := public._require_write(p_token, p_group_id);

  v_ext := lower(trim(both from coalesce(p_ext, '')));
  v_ext := regexp_replace(v_ext, '[^a-z0-9]', '', 'g');
  if v_ext not in (
    'jpg','jpeg','png','webp','gif',
    'mp4','webm','mov','m4v',
    'pdf','doc','docx','ppt','pptx','xls','xlsx','txt','rtf','odt','odp'
  ) then
    raise exception 'Тип файла не разрешён';
  end if;

  delete from public.hw_upload_tickets
  where expires_at < now() - interval '1 day'
     or (used = true and created_at < now() - interval '1 day');

  v_id := encode(gen_random_bytes(16), 'hex');
  v_folder := coalesce(
    nullif(regexp_replace(trim(both from coalesce(p_folder, '')), '[^a-zA-Z0-9_]+', '', 'g'), ''),
    'g'
  );
  v_folder := left(v_folder, 48);
  v_path := v_folder || '/' || v_id || '.' || v_ext;

  insert into public.hw_upload_tickets (id, group_id, bucket_id, object_path, expires_at)
  values (v_id, p_group_id, v_bucket, v_path, now() + interval '10 minutes');

  return json_build_object(
    'ticketId', v_id,
    'bucket', v_bucket,
    'path', v_path,
    'expiresAt', (now() + interval '10 minutes')
  );
end;
$$;

revoke all on function public.rasp_issue_hw_upload_ticket(text, text, text, text) from public;
grant execute on function public.rasp_issue_hw_upload_ticket(text, text, text, text) to anon, authenticated;

-- 3) Правка опубликованного события.
--    Права те же, что на публикацию: админ, куратор группы, староста, зам,
--    редактор ленты. Менять можно всё: заголовок, текст, вложения, факультеты,
--    закрепление и принадлежность группе.
drop function if exists public.rasp_update_news(text, text, text, text, text, jsonb, boolean, jsonb);

create or replace function public.rasp_update_news(
  p_token text,
  p_id text,
  p_group_id text,
  p_title text,
  p_body text default '',
  p_attachments jsonb default '[]'::jsonb,
  p_pinned boolean default false,
  p_faculties jsonb default '[]'::jsonb
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s sessions%rowtype;
  v_editor sessions%rowtype;
  v_old_group text;
  v_title text;
  v_body text;
  v_atts jsonb;
  v_facs jsonb;
begin
  select * into s from sessions where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Нужен вход'; end if;

  select group_id into v_old_group
  from public.news
  where id = p_id and deleted = false;

  if not found then
    raise exception 'Событие не найдено';
  end if;

  -- Право на правку проверяем и по старой, и по новой группе:
  -- иначе можно было бы «перенести» чужое событие в свою группу.
  v_editor := public._require_news_write(p_token, v_old_group);
  if p_group_id is distinct from v_old_group then
    v_editor := public._require_news_write(p_token, p_group_id);
  end if;

  v_title := left(trim(coalesce(p_title, '')), 120);
  if v_title = '' then raise exception 'Нужен заголовок'; end if;
  v_body := left(trim(coalesce(p_body, '')), 4000);

  v_atts := coalesce((
    select jsonb_agg(jsonb_build_object(
      'url', item->>'url',
      'name', left(coalesce(item->>'name', 'файл'), 120),
      'mime', coalesce(item->>'mime', '')
    ))
    from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) item
    where coalesce(item->>'url', '') <> ''
  ), '[]'::jsonb);

  v_facs := coalesce((
    select jsonb_agg(distinct left(trim(value), 80))
    from jsonb_array_elements_text(coalesce(p_faculties, '[]'::jsonb)) value
    where trim(value) <> ''
  ), '[]'::jsonb);

  update public.news
  set title = v_title,
      body = v_body,
      attachments = v_atts,
      faculties = v_facs,
      pinned = coalesce(p_pinned, false),
      group_id = p_group_id
  where id = p_id and deleted = false;

  insert into audit_log(action, group_id, detail, by_role)
  values ('news_edit', p_group_id, left(v_title, 80), s.role);

  return json_build_object('id', p_id, 'title', v_title, 'pinned', coalesce(p_pinned, false));
end;
$$;

revoke all on function public.rasp_update_news(text, text, text, text, text, jsonb, boolean, jsonb) from public;
grant execute on function public.rasp_update_news(text, text, text, text, text, jsonb, boolean, jsonb) to anon, authenticated;
