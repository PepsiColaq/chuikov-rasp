-- Чистка дублей оценок, накопившихся из-за бага «оценка не появляется».
--
-- Почему появились: в интерфейсе первая оценка на пару не отображалась
-- (массив терялся при перерисовке), поэтому человек жал «5» ещё раз и ещё
-- раз. В базе оказались одинаковые записи с разницей в секунды — например
-- четыре пятёрки одному студенту за 11 секунд.
--
-- Что делает этот скрипт:
--   1) ПОКАЗЫВАЕТ список дублей (ничего не удаляя);
--   2) удаляет лишние, оставляя самую раннюю запись в каждой группе.
--
-- Дубль = тот же студент, та же дата, тот же слот, та же оценка, тот же тип
-- И созданы в пределах 2 минут друг от друга. Разные типы работ («ответ»
-- и «тест») дублями НЕ считаются — это законно разные оценки.
--
-- Безопасно запускать повторно: после первого запуска удалять будет нечего.

-- ─────────────────────────────────────────────────────────────────
-- ШАГ 1. Посмотреть, что будет удалено. Выполни и прочитай список.
-- ─────────────────────────────────────────────────────────────────
with ranked as (
  select
    id,
    student_id,
    on_date,
    slot_start,
    slot_end,
    value,
    kind,
    created_at,
    row_number() over (
      partition by student_id, on_date, slot_start, slot_end, value, kind,
                   date_trunc('minute', created_at) - (extract(second from created_at)::int / 120) * interval '2 minutes'
      order by created_at
    ) as rn
  from public.journal_grades
)
select
  id,
  student_id,
  on_date,
  slot_start,
  slot_end,
  value,
  kind,
  created_at
from ranked
where rn > 1
order by student_id, on_date, created_at;

-- ─────────────────────────────────────────────────────────────────
-- ШАГ 2. Удалить лишние. Выполняй, только посмотрев список из шага 1.
-- ─────────────────────────────────────────────────────────────────
with ranked as (
  select
    id,
    row_number() over (
      partition by student_id, on_date, slot_start, slot_end, value, kind,
                   date_trunc('minute', created_at) - (extract(second from created_at)::int / 120) * interval '2 minutes'
      order by created_at
    ) as rn
  from public.journal_grades
)
delete from public.journal_grades g
using ranked r
where g.id = r.id
  and r.rn > 1;

-- Проверка после чистки: должно остаться по одной записи на пару/оценку/тип.
select
  student_id,
  on_date,
  slot_start,
  value,
  kind,
  count(*) as сколько
from public.journal_grades
group by student_id, on_date, slot_start, value, kind
having count(*) > 1
order by сколько desc;
