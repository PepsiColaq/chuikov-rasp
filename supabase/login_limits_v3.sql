-- Мягче лимиты входа + возможность показать «сколько ждать».
-- Выполни один раз в Supabase → SQL Editor. Можно повторять.
--
-- Почему: в мобильных сетях IP общий (CGNAT). Восемь опечаток любых студентов
-- в одной сети блокировали вход ВСЕМ на 15 минут. rasp_login не трогаем —
-- меняем только политику внутри _login_fail / _login_locked.

-- 1) Политика по бакету: IP терпимее и отпускает быстрее, код строже.
create or replace function public._login_max(p_bucket text, p_max int default 8)
returns int
language sql
immutable
as $$
  select case
    when p_bucket like 'ip:%' then greatest(p_max, 30)
    else greatest(p_max, 10)
  end;
$$;

create or replace function public._login_lock_for(p_bucket text, p_lock interval default interval '15 minutes')
returns interval
language sql
immutable
as $$
  select case
    when p_bucket like 'ip:%' then least(p_lock, interval '5 minutes')
    else p_lock
  end;
$$;

-- 2) Те же функции, но с учётом политики (сигнатуры совместимы со старыми вызовами).
create or replace function public._login_fail(
  p_bucket text,
  p_max int default 8,
  p_lock interval default interval '15 minutes'
)
returns void
language plpgsql
as $$
declare
  v_max int := public._login_max(p_bucket, p_max);
  v_lock interval := public._login_lock_for(p_bucket, p_lock);
begin
  insert into login_attempts(bucket, fails, locked_until)
    values (p_bucket, 1, null)
  on conflict (bucket) do update
    set fails = case
          when login_attempts.locked_until is not null and login_attempts.locked_until > now()
            then login_attempts.fails
          when login_attempts.fails + 1 >= v_max then 0
          else login_attempts.fails + 1
        end,
        locked_until = case
          when login_attempts.locked_until is not null and login_attempts.locked_until > now()
            then login_attempts.locked_until
          when login_attempts.fails + 1 >= v_max then now() + v_lock
          else login_attempts.locked_until
        end;
end;
$$;

create or replace function public._login_locked(p_bucket text)
returns boolean
language plpgsql
as $$
declare
  v_locked timestamptz;
begin
  select locked_until into v_locked from login_attempts where bucket = p_bucket;
  return v_locked is not null and v_locked > now();
end;
$$;

-- 3) Сколько секунд осталось ждать этому устройству/сети.
--    Клиент вызывает после ошибки «слишком много попыток» и рисует таймер.
create or replace function public.rasp_login_wait()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip text := public._client_ip();
  v_ip_bucket text;
  v_left int := 0;
begin
  if v_ip is null or v_ip = 'unknown' then
    return json_build_object('seconds', 0);
  end if;
  v_ip_bucket := 'ip:' || v_ip;
  select greatest(0, ceil(extract(epoch from (locked_until - now()))))::int
    into v_left
  from login_attempts
  where bucket = v_ip_bucket and locked_until > now();
  return json_build_object('seconds', coalesce(v_left, 0));
end;
$$;

grant execute on function public.rasp_login_wait() to anon, authenticated;
