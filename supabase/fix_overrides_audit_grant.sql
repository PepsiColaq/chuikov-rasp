-- Hotfix: restore override types + revoke spammy audit RPC from anon.
-- Run once in Supabase SQL Editor (important if you already ran audit_actor_label.sql).

create or replace function public.rasp_set_override(
  p_token text, p_group_id text, p_lesson_id text, p_date date,
  p_type text, p_new_room text, p_new_subject text, p_note text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare s sessions%rowtype; v_id text;
begin
  s := public._require_write(p_token, p_group_id);
  if p_type not in ('room_only', 'subject', 'subject_and_room', 'cancelled') then
    raise exception 'Неверный тип замены';
  end if;
  delete from overrides
  where group_id = p_group_id and lesson_id = p_lesson_id and on_date = p_date;
  v_id := 'ovr_' || encode(gen_random_bytes(8), 'hex');
  insert into overrides(id, group_id, lesson_id, on_date, type, new_room, new_subject, note)
    values (
      v_id, p_group_id, p_lesson_id, p_date, p_type,
      left(trim(coalesce(p_new_room, '')), 32),
      left(trim(coalesce(p_new_subject, '')), 80),
      left(trim(coalesce(p_note, '')), 200)
    );
  perform public._write_audit(
    'override_set',
    p_group_id,
    left(public._actor_tag(s) || ' · ' || p_type || ' · ' || p_date::text, 200),
    s.role
  );
  return json_build_object('id', v_id);
end;
$$;

grant execute on function public.rasp_set_override(text, text, text, date, text, text, text, text)
  to anon, authenticated;

-- Prevent anonymous spam into audit_log
revoke execute on function public._write_audit(text, text, text, text, text) from anon, authenticated, public;
-- security definer callers (rasp_*) still work as owner
