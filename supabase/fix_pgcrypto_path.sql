-- Make pgcrypto visible to all our RPCs
create extension if not exists pgcrypto with schema extensions;

alter function public.hash_access_code(text) set search_path to public, extensions;
alter function public.rasp_login(text, text) set search_path to public, extensions;
alter function public.rasp_session(text) set search_path to public, extensions;
alter function public.rasp_logout(text) set search_path to public, extensions;
alter function public._require_write(text, text) set search_path to public, extensions;
alter function public.rasp_add_homework(text, text, text, text, date, text) set search_path to public, extensions;
alter function public.rasp_delete_homework(text, text, text) set search_path to public, extensions;
alter function public.rasp_set_override(text, text, text, date, text, text, text, text) set search_path to public, extensions;
alter function public.rasp_clear_override(text, text, text) set search_path to public, extensions;
alter function public.rasp_create_group(text, text, text, text) set search_path to public, extensions;
alter function public.rasp_reset_code(text, text, text) set search_path to public, extensions;
alter function public.rasp_reset_semester(text, text) set search_path to public, extensions;
alter function public.rasp_public_meta() set search_path to public, extensions;

-- Sanity check login hash
select public.hash_access_code('Starosta0903!') as sample_hash;
