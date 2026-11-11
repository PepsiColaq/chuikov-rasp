-- Secure homework Storage uploads: only starosta/admin with valid session token.
-- Run in Supabase SQL Editor after deploy. Removes open anon INSERT policies.

create table if not exists public.hw_upload_tickets (
  id text primary key,
  group_id text not null,
  bucket_id text not null,
  object_path text not null unique,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists hw_upload_tickets_expires_idx
  on public.hw_upload_tickets (expires_at)
  where used = false;

alter table public.hw_upload_tickets enable row level security;
-- no public policies: only security definer functions touch this table

create or replace function public._hw_upload_path_allowed(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.hw_upload_tickets t
    where t.bucket_id = p_bucket
      and t.object_path = p_name
      and t.used = false
      and t.expires_at > now()
  );
$$;

revoke all on function public._hw_upload_path_allowed(text, text) from public;
grant execute on function public._hw_upload_path_allowed(text, text) to anon, authenticated;

create or replace function public._hw_mark_ticket_used()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.hw_upload_tickets
  set used = true
  where bucket_id = new.bucket_id
    and object_path = new.name
    and used = false;
  return new;
end;
$$;

drop trigger if exists hw_mark_ticket_used on storage.objects;
create trigger hw_mark_ticket_used
  after insert on storage.objects
  for each row
  when (new.bucket_id in ('hw-files', 'hw-photos'))
  execute function public._hw_mark_ticket_used();

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
    'pdf','doc','docx','ppt','pptx','xls','xlsx','txt','rtf','odt','odp'
  ) then
    raise exception 'Тип файла не разрешён';
  end if;

  -- cleanup old tickets (best-effort)
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

-- Remove open uploads; keep public read for existing homework links
drop policy if exists "hw photos upload" on storage.objects;
drop policy if exists "hw files upload" on storage.objects;
drop policy if exists "hw photos public read" on storage.objects;
drop policy if exists "hw files public read" on storage.objects;
drop policy if exists "hw storage public read" on storage.objects;
drop policy if exists "hw storage ticket upload" on storage.objects;

create policy "hw storage public read"
  on storage.objects for select
  using (bucket_id in ('hw-photos', 'hw-files'));

create policy "hw storage ticket upload"
  on storage.objects for insert
  with check (
    bucket_id in ('hw-photos', 'hw-files')
    and public._hw_upload_path_allowed(bucket_id, name)
  );
