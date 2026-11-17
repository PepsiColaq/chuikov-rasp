// Тест на баг «оценка ставится, но не появляется».
//
// Что было: в paintRows стояло `gradesByStudent.get(student.id) || []`.
// Для студента без оценок это создавало временный массив, которого карта
// не знала. addGrade пушил в него — и после перерисовки оценка исчезала.
// В базе она при этом лежала, поэтому снаружи выглядело так, будто оценки
// вообще не ставятся.
//
// Тест воспроизводит именно эту последовательность: взять массив, запихнуть
// в него оценку, перечитав карту заново. Сломанный вариант тест не проходит.
import {
  ensureGrades,
  groupGradesByStudent,
  gradesKey,
  isSameTapPending,
  markTapStarted,
  markTapFinished,
} from '../src/lib/grade-cache.js'

const results = []
function check(label, ok, extra = '') {
  results.push({ label, ok: !!ok })
  console.log((ok ? '✅ ' : '❌ ') + label + (extra && !ok ? '  — ' + extra : ''))
}

console.log('Оценки в журнале — регрессия на «оценка не появляется»\n')

// 1. Главный сценарий: у студента не было оценок вообще.
{
  const map = new Map()
  const grades = ensureGrades(map, 'st_1')
  check('для студента без оценок вернулся массив', Array.isArray(grades))

  grades.push({ id: 'jg_1', studentId: 'st_1', value: 5, kind: 'answer' })

  // Перерисовка читает карту заново — как это делает paintRows.
  const afterRepaint = ensureGrades(map, 'st_1')
  check(
    'после перерисовки оценка на месте (это и был баг)',
    afterRepaint.length === 1 && afterRepaint[0].value === 5,
    `получили ${afterRepaint.length} оценок`,
  )
  check(
    'перерисовка вернула ТОТ ЖЕ массив, а не копию',
    afterRepaint === grades,
  )
}

// 2. Вторая оценка на ту же пару тоже видна.
{
  const map = groupGradesByStudent([{ studentId: 'st_2', value: 4 }])
  ensureGrades(map, 'st_2').push({ studentId: 'st_2', value: 5 })
  check('две оценки на одну пару видны обе', ensureGrades(map, 'st_2').length === 2)
}

// 3. Студент без оценок не ломает остальных.
{
  const map = groupGradesByStudent([{ studentId: 'st_3', value: 3 }])
  ensureGrades(map, 'st_4')
  check('пустой студент добавлен отдельно', map.has('st_4') && map.get('st_4').length === 0)
  check('у студента с оценкой ничего не пропало', map.get('st_3').length === 1)
}

// 4. Мусор в списке оценок не валит группировку.
{
  const map = groupGradesByStudent([null, undefined, {}, { studentId: 'st_5', value: 5 }])
  check('мусор отброшен, валидная оценка на месте', map.size === 1 && map.get('st_5').length === 1)
}

// 5. Ключ кеша различает пары и группы.
{
  const a = gradesKey('g_1', '2026-11-17', '09:00', '10:10')
  const b = gradesKey('g_1', '2026-11-17', '10:20', '11:30')
  const c = gradesKey('g_2', '2026-11-17', '09:00', '10:10')
  check('разные пары — разные ключи', a !== b)
  check('разные группы — разные ключи', a !== c)
  check('один и тот же слот — один ключ', a === gradesKey('g_1', '2026-11-17', '09:00', '10:10'))
}

// 6. Защита от двойного тапа: второй такой же тап отбивается, пока идёт первый.
{
  const guard = new Map()
  check('до начала — не заблокировано', !isSameTapPending(guard, 'st_1', 5, 'answer'))
  markTapStarted(guard, 'st_1', 5, 'answer')
  check('во время сохранения повторный тап блокируется', isSameTapPending(guard, 'st_1', 5, 'answer'))
  check(
    'другая оценка не блокируется',
    !isSameTapPending(guard, 'st_1', 4, 'answer'),
  )
  check(
    'другой тип работы не блокируется',
    !isSameTapPending(guard, 'st_1', 5, 'test'),
  )
  markTapFinished(guard, 'st_1', 5, 'answer')
  check('после сохранения можно ставить снова', !isSameTapPending(guard, 'st_1', 5, 'answer'))
}

const failed = results.filter((r) => !r.ok)
console.log('')
if (failed.length) {
  console.log(`❌ Провалено ${failed.length} из ${results.length}`)
  process.exit(1)
}
console.log(`✅ Все ${results.length} проверок прошли`)
