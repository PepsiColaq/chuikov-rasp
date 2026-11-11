-- Homework rating (▲/▼). Run once in Supabase SQL Editor.

alter table homework add column if not exists score int not null default 0;

create table if not exists hw_votes (
  homework_id text not null references homework(id) on delete cascade,
  visitor_id text not null,
  value smallint not null check (value in (-1, 1)),
  updated_at timestamptz not null default now(),
  primary key (homework_id, visitor_id)
);

create index if not exists hw_votes_hw_idx on hw_votes (homework_id);

alter table hw_votes enable row level security;

create or replace function public.rasp_vote_homework(
  p_visitor_id text,
  p_hw_id text,
  p_value int
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  vid text;
  v int;
  total int;
begin
  vid := left(regexp_replace(trim(coalesce(p_visitor_id, '')), '[^a-zA-Z0-9_-]', '', 'g'), 64);
  if length(vid) < 8 then
    raise exception 'Нет идентификатора голоса';
  end if;
  if p_value is null or p_value not in (-1, 1) then
    raise exception 'Неверный голос';
  end if;
  v := p_value;

  if not exists (select 1 from homework where id = p_hw_id) then
    raise exception 'ДЗ не найдено';
  end if;

  insert into hw_votes(homework_id, visitor_id, value, updated_at)
    values (p_hw_id, vid, v, now())
  on conflict (homework_id, visitor_id) do update
    set value = excluded.value,
        updated_at = now();

  select coalesce(sum(value), 0) into total from hw_votes where homework_id = p_hw_id;
  update homework set score = total where id = p_hw_id;

  return json_build_object('id', p_hw_id, 'score', total, 'myVote', v);
end;
$$;

grant execute on function public.rasp_vote_homework(text, text, int) to anon, authenticated;
