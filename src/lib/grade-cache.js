// Оценки за пару: чистая логика, без DOM и без сети.
//
// Зачем отдельным модулем: здесь была ошибка, из-за которой первая оценка
// на пару не появлялась на экране, хотя в базе лежала. Внутри большого
// journal-ui.js это невозможно было проверить тестом — а так можно.
//
// Суть ошибки: код получал массив оценок так —
//   const grades = map.get(studentId) || []
// Для студента БЕЗ оценок создавался новый временный массив и в карту
// не попадал. Оценку пушили в него, перерисовка снова читала из карты
// undefined — и оценка «исчезала». Теперь массив регистрируется в карте.

/**
 * Массив оценок студента, гарантированно лежащий в карте.
 *
 * Важно: возвращается именно тот массив, который лежит в карте. Если его
 * потом пушить — изменения увидят все, кто читает карту заново.
 *
 * @param {Map<string, Array<object>>} map
 * @param {string} studentId
 * @returns {Array<object>}
 */
export function ensureGrades(map, studentId) {
  if (!map.has(studentId)) map.set(studentId, [])
  return map.get(studentId)
}

/**
 * Сгруппировать оценки по студентам.
 * @param {Array<{studentId:string}>} grades
 * @returns {Map<string, Array<object>>}
 */
export function groupGradesByStudent(grades) {
  const map = new Map()
  for (const g of grades || []) {
    if (!g || !g.studentId) continue
    ensureGrades(map, g.studentId).push(g)
  }
  return map
}

/** Ключ кеша для «оценки этой пары»: группа + дата + слот. */
export function gradesKey(groupId, date, start, end) {
  return `${groupId || ''}|${date || ''}|${start || ''}|${end || ''}`
}

/**
 * Идёт ли прямо сейчас сохранение этой же оценки.
 *
 * Нужно, чтобы повторный тап по «5», пока сервер ещё не ответил, не создал
 * вторую такую же запись. Именно так в базе оказались четыре одинаковые
 * пятёрки за 11 секунд.
 */
export function isSameTapPending(guardMap, studentId, value, kind) {
  return guardMap.get(`${studentId}|${value}|${kind}`) === true
}

export function markTapStarted(guardMap, studentId, value, kind) {
  guardMap.set(`${studentId}|${value}|${kind}`, true)
}

export function markTapFinished(guardMap, studentId, value, kind) {
  guardMap.delete(`${studentId}|${value}|${kind}`)
}
