-- v161: починка отката для действий, которые пишут журнал «напрямую».
--
-- Проблема, которую решает файл:
--   многие старые функции делают `insert into audit_log(...)` сами, а не
--   через _write_audit(). Такой insert не заполняет txid, поэтому запись
--   журнала не может найти свой снимок в audit_undo, и кнопка «Откатить»
--   не появляется. Именно это случилось с «Добавлено ДЗ».
--
-- Решение в два шага:
--   1) триггер на audit_log сам подставляет txid, если его нет.
--      Это чинит сразу ВСЕ функции — и старые, и будущие, без переписывания.
--   2) уже записанные строки связываются с готовыми снимками по точному
--      времени транзакции (в одной транзакции now() одинаковый).
--
-- Файл идемпотентный.

-- ── 1. Автозаполнение txid при вставке ───────────────────────────────────
create or replace function public._audit_fill_txid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.txid is null then
    new.txid := txid_current();
  end if;
  return new;
end;
$$;

drop trigger if exists audit_fill_txid on public.audit_log;
create trigger audit_fill_txid
  before insert on public.audit_log
  for each row
  execute function public._audit_fill_txid();

-- ── 2. Связываем старые записи с уже существующими снимками ──────────────
-- Первый способ — по времени: снимок и запись журнала создаются в одной
-- транзакции, поэтому at совпадает до микросекунды.
update public.audit_log a
set txid = u.txid
from public.audit_undo u
where a.txid is null
  and u.txid is not null
  and u.at = a.at
  and not exists (
    select 1 from public.audit_log b
    where b.txid = u.txid and b.id <> a.id
  );

-- Второй способ — по id записи, который функция пишет в detail.
-- Именно так выглядят «Добавлено ДЗ»: «Никита · предмет · hw_5ed4…».
-- Он надёжнее времени: id уникален.
update public.audit_log a
set txid = u.txid
from public.audit_undo u
where a.txid is null
  and u.txid is not null
  and u.new_row ? 'id'
  and a.detail like '%' || (u.new_row->>'id') || '%'
  and not exists (
    select 1 from public.audit_log b
    where b.txid = u.txid and b.id <> a.id
  );

-- Третий способ — по id удалённой записи (снимок op='delete').
update public.audit_log a
set txid = u.txid
from public.audit_undo u
where a.txid is null
  and u.txid is not null
  and u.old_row ? 'id'
  and a.detail like '%' || (u.old_row->>'id') || '%'
  and not exists (
    select 1 from public.audit_log b
    where b.txid = u.txid and b.id <> a.id
  );

-- ── 3. Имя автора для ДЗ и новостей берём из снимка ──────────────────────
create or replace function public._audit_actor_for(p_txid bigint)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.new_row->>'author_label' from public.audit_undo u
      where u.txid = p_txid and u.new_row ? 'author_label' limit 1),
    (select u.old_row->>'author_label' from public.audit_undo u
      where u.txid = p_txid and u.old_row ? 'author_label' limit 1)
  );
$$;

-- ── 5. Программы тоже снимаем ────────────────────────────────────────────
-- В v160 таблицу programs забыли, поэтому у сохранения программ не было
-- ни текста в карточке, ни возможности откатить.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'programs') then
    execute 'drop trigger if exists audit_capture on public.programs';
    execute 'create trigger audit_capture after insert or update or delete on public.programs
             for each row execute function public._audit_capture()';
  end if;
end;
$$;

-- ── 6. Проверка: сколько записей теперь имеют снимок ─────────────────────
do $$
declare
  v_null int;
  v_linked int;
begin
  select count(*) into v_null from public.audit_log where txid is null;
  select count(*) into v_linked from public.audit_log a
    where exists (select 1 from public.audit_undo u where u.txid = a.txid);
  raise notice 'записей без txid: %, записей со снимком: %', v_null, v_linked;
end;
$$;
