-- Fix: digest lives in extensions schema; search_path=public hid it.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.hash_access_code(p_code text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(
    digest(convert_to('chuikov-rasp-v1:' || trim(p_code), 'UTF8'), 'sha256'),
    'hex'
  );
$$;

-- Quick check (optional): should return one row with true for admin hash match
-- select public.hash_access_code('AdminChuikov0903!') = (select admin_code_hash from app_meta where id = 'main');
