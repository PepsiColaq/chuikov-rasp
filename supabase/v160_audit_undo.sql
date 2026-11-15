-- v160: читаемый журнал безопасности + откат действий админа.
--
-- Зачем триггеры, а не правка всех функций:
--   audit_log хранит только текст, поэтому восстановить прежнее состояние
--   нечем. Вместо переписывания десятка больших функций («поставили метку»,
--   «удалили оценку», «сменили роль») ставим один универсальный триггер на
--   таблицы. Он пишет снимок строки перед/после изменения и помечает снимок
--   номером транзакции. Функция журнала пишет тот же номер, поэтому снимок
--   сам привязывается к нужной записи — без единой правки бизнес-логики.
--
-- Файл идемпотентный: можно запускать повторно.

-- ── 1. Новые поля журнала ────────────────────────────────────────────────
alter table public.audit_log add column if not exists txid bigint;
alter table public.audit_log add column if not exists undone_at timestamptz;
alter table public.audit_log add column if not exists undone_by text default '';

create index if not exists audit_log_txid_idx on public.audit_log (txid);

-- ── 2. Снимки изменений для отката ───────────────────────────────────────
create table if not exists public.audit_undo (
  id bigserial primary key,
  txid bigint not null,
  tbl text not null,
  op text not null,
  old_row jsonb,
  new_row jsonb,
  at timestamptz not null default now()
);

create index if not exists audit_undo_txid_idx on public.audit_undo (txid);
create index if not exists audit_undo_at_idx on public.audit_undo (at desc);

alter table public.audit_undo enable row level security;
-- Читать и писать может только сервер через security definer функции.
revoke all on public.audit_undo from anon, authenticated;

create or replace function public._audit_capture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_undo(txid, tbl, op, old_row, new_row)
  values (
    txid_current(),
    TG_TABLE_NAME,
    lower(TG_OP),
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(OLD) end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(NEW) end
  );
  return null;
end;
$$;

-- Вешаем на таблицы, действия с которыми админ может откатить.
do $$
declare
  t text;
begin
  foreach t in array array[
    'journal_marks', 'journal_grades', 'formation_marks',
    'homework', 'news', 'overrides', 'students'
  ]
  loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      execute format('drop trigger if exists audit_capture on public.%I', t);
      execute format(
        'create trigger audit_capture after insert or update or delete on public.%I
         for each row execute function public._audit_capture()', t
      );
    end if;
  end loop;
end;
$$;

-- ── 3. Починка испорченного текста ───────────────────────────────────────
-- Когда-то функция сохранения отметки попала в базу из файла, прочитанного
-- в неверной кодировке: «снята отметка» записалось как «СЃРЅСЏС‚Р° РѕС‚РјРµС‚РєР°».
-- Автоматическая перекодировка всей строки опасна (можно испортить нормальные
-- части), поэтому меняем только известные шаблоны — точно и предсказуемо.
create or replace function public._fix_mojibake(p_text text)
returns text
language sql
immutable
as $$
  select replace(
    replace(
      replace(
        replace(coalesce(p_text, ''),
          'СЃРЅСЏС‚Р°', 'снята'),
        'РѕС‚РјРµС‚РєР°', 'отметка'),
      'РѕС‚РјРµС‚РєСѓ', 'отметку'),
    'в†’', '→'
  );
$$;

-- ── 4. Журнал: пишем номер транзакции и починенный текст ─────────────────
-- Сигнатура не меняется — остальные функции продолжают работать как есть.
create or replace function public._write_audit(
  p_action text,
  p_group_id text default null,
  p_detail text default '',
  p_by_role text default '',
  p_visitor_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log(action, group_id, detail, by_role, ip, visitor_id, txid)
  values (
    left(coalesce(p_action, 'unknown'), 64),
    nullif(left(trim(coalesce(p_group_id, '')), 64), ''),
    left(public._fix_mojibake(coalesce(p_detail, '')), 200),
    left(coalesce(p_by_role, ''), 32),
    left(coalesce(public._client_ip(), 'unknown'), 64),
    left(regexp_replace(coalesce(p_visitor_id, ''), '[^a-zA-Z0-9_-]', '', 'g'), 64),
    txid_current()
  );
end;
$$;

revoke execute on function public._write_audit(text, text, text, text, text)
  from public, anon, authenticated;

-- ── 5. Разово чиним уже записанные строки ────────────────────────────────
update public.audit_log
set detail = public._fix_mojibake(detail)
where detail is distinct from public._fix_mojibake(detail);

-- Имя админа из настроек (для подписи «кто сделал»).
create or replace function public._admin_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(admin_display_name), ''), 'Админ')
  from public.app_meta where id = 'main';
$$;

-- ── 6. Чтение журнала: автор, снимок для отката, флаг canUndo ────────────
create or replace function public.rasp_list_audit(p_token text, p_limit int default 80)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  n int;
begin
  select * into s from sessions
  where token = p_token and role = 'admin' and expires_at > now();
  if not found then
    raise exception 'Нужен вход админа';
  end if;

  n := least(greatest(coalesce(p_limit, 80), 1), 300);

  return coalesce((
    select json_agg(row_to_json(x) order by x.at desc)
    from (
      select
        a.id,
        a.at,
        a.action,
        a.group_id as "groupId",
        a.detail,
        a.by_role as "byRole",
        coalesce(a.ip, '') as ip,
        coalesce(a.visitor_id, '') as "visitorId",
        a.undone_at as "undoneAt",
        coalesce(a.undone_by, '') as "undoneBy",
        -- Кто именно: подпись автора из снимка (её пишет сама таблица отметок
        -- и оценок), иначе имя админа из настроек, иначе роль.
        coalesce(
          (select u.new_row->>'author_label'
             from public.audit_undo u
            where u.txid = a.txid and u.new_row ? 'author_label'
            limit 1),
          (select u.old_row->>'author_label'
             from public.audit_undo u
            where u.txid = a.txid and u.old_row ? 'author_label'
            limit 1),
          case when a.by_role = 'admin'
               then nullif(trim(public._admin_name()), '')
               else nullif(a.by_role, '') end,
          '—'
        ) as actor,
        -- Снимок для отката: что было до и после, по таблицам.
        (
          select json_agg(json_build_object(
                   'tbl', u.tbl, 'op', u.op, 'old', u.old_row, 'new', u.new_row
                 ) order by u.id)
          from public.audit_undo u
          where u.txid = a.txid
        ) as undo,
        (
          a.by_role = 'admin'
          and a.undone_at is null
          and a.action in (
            'journal_mark', 'journal_grade', 'journal_grade_delete',
            'student_role', 'homework_add', 'homework_delete', 'news_add',
            'formation_mark', 'override_set'
          )
          and exists (select 1 from public.audit_undo u where u.txid = a.txid)
        ) as "canUndo",
        (a.action in (
          'login_fail', 'login_lock_ip', 'login_lock_code',
          'semester_reset', 'code_revoke', 'code_create'
        )) as suspicious
      from public.audit_log a
      order by a.at desc
      limit n
    ) x
  ), '[]'::json);
end;
$$;

grant execute on function public.rasp_list_audit(text, int) to anon, authenticated;

-- ── 7. Откат действия ────────────────────────────────────────────────────
-- Возвращает состояние «как было» по снимку транзакции.
-- Разрешено только админу и только для откатываемых действий.
create or replace function public.rasp_undo_audit(p_token text, p_audit_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  a public.audit_log%rowtype;
  u record;
  v_done int := 0;
  v_name text;
begin
  select * into s from sessions
  where token = p_token and role = 'admin' and expires_at > now();
  if not found then
    raise exception 'Нужен вход админа';
  end if;

  select * into a from public.audit_log where id = p_audit_id;
  if a.id is null then
    raise exception 'Запись журнала не найдена';
  end if;
  if a.by_role is distinct from 'admin' then
    raise exception 'Откатывать можно только действия админа';
  end if;
  if a.undone_at is not null then
    raise exception 'Это действие уже откатывали';
  end if;
  if a.action not in (
    'journal_mark', 'journal_grade', 'journal_grade_delete',
    'student_role', 'homework_add', 'homework_delete', 'news_add',
    'formation_mark', 'override_set'
  ) then
    raise exception 'Такое действие откатить нельзя';
  end if;
  if not exists (select 1 from public.audit_undo where txid = a.txid) then
    raise exception 'Нет снимка состояния — действие было до включения отката';
  end if;

  v_name := coalesce(nullif(trim(public._admin_name()), ''), 'Админ');

  -- Идём от последнего изменения к первому: иначе при нескольких правках
  -- одной строки в одной транзакции восстановится промежуточное состояние.
  for u in
    select * from public.audit_undo
    where txid = a.txid
    order by id desc
  loop
    begin
      if u.op = 'insert' then
        -- Строка появилась в этой транзакции — убираем её.
        execute format('delete from public.%I where id = $1', u.tbl)
          using (u.new_row->>'id');
      elsif u.op = 'delete' then
        -- Строку удалили — возвращаем как была.
        execute format(
          'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
          u.tbl, u.tbl
        ) using u.old_row;
      else
        -- Строку изменили — перезаписываем прежними значениями.
        execute format('delete from public.%I where id = $1', u.tbl)
          using (u.new_row->>'id');
        execute format(
          'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
          u.tbl, u.tbl
        ) using u.old_row;
      end if;
      v_done := v_done + 1;
    exception when others then
      -- Не роняем весь откат из-за одной строки: остальное всё равно вернём.
      null;
    end;
  end loop;

  update public.audit_log
  set undone_at = now(), undone_by = left(v_name, 64)
  where id = p_audit_id;

  perform public._write_audit(
    'audit_undo',
    a.group_id,
    left('отменено действие «' || a.action || '» от '
         || to_char(a.at, 'DD.MM.YYYY HH24:MI') || ' · строк: ' || v_done, 200),
    'admin',
    null
  );

  return json_build_object('ok', true, 'rows', v_done, 'by', v_name);
end;
$$;

grant execute on function public.rasp_undo_audit(text, bigint) to anon, authenticated;

-- ── 8. Чистка старых снимков ─────────────────────────────────────────────
-- Журнал читается максимум на 300 записей, снимки старше 60 дней не нужны
-- и только занимают место.
delete from public.audit_undo where at < now() - interval '60 days';
