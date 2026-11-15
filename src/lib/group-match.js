/**
 * Поиск группы, который прощает человека.
 *
 * Зачем: названия вида «0903-ПД5» набирают как угодно — «0903пд5», «0903 пд 5»,
 * «пд5», «0903-PD5» (латиницей), «903пд5» (без нуля), «0903-ПД-5» (лишнее тире).
 * Раньше работал только прямой `includes` по исходному имени, и половина этих
 * вариантов давала пустой список.
 *
 * Идея простая: и запрос, и имя группы приводим к одному «ключу» — только буквы
 * и цифры в верхнем регистре, латиница-двойник переводится в кириллицу. Дальше
 * сравниваем ключи по строгой лестнице совпадений: точное → с начала → внутри →
 * по порядку букв → с опечаткой.
 */

/** Латиница, которая на телефоне выглядит как кириллица. */
const LATIN_TO_CYR = {
  A: 'А',
  B: 'В',
  C: 'С',
  E: 'Е',
  H: 'Н',
  K: 'К',
  M: 'М',
  O: 'О',
  P: 'Р',
  T: 'Т',
  X: 'Х',
  Y: 'У',
}

/**
 * Ключ для сравнения: «0903-ПД5» → «0903ПД5».
 * Регистр, ё→е, латиница→кириллица, всё лишнее выкинуто.
 */
export function groupSearchKey(value) {
  const up = String(value || '')
    .toUpperCase()
    .replace(/Ё/g, 'Е')
    .replace(/[A-Z]/g, (ch) => LATIN_TO_CYR[ch] || ch)
  return up.replace(/[^0-9А-Я]/g, '')
}

/** Расстояние Левенштейна с ранним выходом, когда разница уже слишком велика. */
function editDistance(a, b, limit = 3) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  if (Math.abs(a.length - b.length) > limit) return limit + 1

  let prev = new Array(b.length + 1)
  let cur = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j

  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    let rowMin = cur[0]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (cur[j] < rowMin) rowMin = cur[j]
    }
    if (rowMin > limit) return limit + 1
    const swap = prev
    prev = cur
    cur = swap
  }
  return prev[b.length]
}

/** Все символы запроса встречаются в имени по порядку (0903ПД5 ⊇ 903ПД5). */
function isSubsequence(needle, haystack) {
  if (!needle) return false
  let i = 0
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) i++
  }
  return i === needle.length
}

const WORD_CHUNKS = /[А-ЯЁA-Z]+|\d+/g

/** «0903-ПД5» → ['0903', 'ПД', '5'] — для быстрых фильтров по факультету и курсу. */
export function splitGroupName(name) {
  return (String(name || '').toUpperCase().match(WORD_CHUNKS) || []).map((s) => s.replace(/Ё/g, 'Е'))
}

/** Факультет по имени группы (ПД, ПСА, МЧС…), без опоры на поле faculty. */
export function facultyKeyFromName(name) {
  const parts = splitGroupName(name)
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]
    if (!/^\d+$/.test(p) && /[А-Я]/.test(p)) return p
  }
  return parts[0] || ''
}

/** Курс-префикс: «0903-ПД5» → «0903», «0902Ю-ПСА1» → «0902Ю». */
export function courseKeyFromName(name) {
  const compact = String(name || '').toUpperCase().replace(/\s+/g, '')
  const m = /^(\d{4}[А-Я]?)/.exec(compact)
  return m ? m[1] : ''
}

/**
 * Совпадение одного названия с запросом.
 * @returns {{score:number, why:'exact'|'prefix'|'inside'|'order'|'typo'}|null}
 *   score: 0 — лучшее, чем больше — тем дальше.
 */
export function matchScore(name, queryKey) {
  if (!queryKey) return { score: 0, why: 'exact' }
  const key = groupSearchKey(name)
  if (!key) return null
  if (key === queryKey) return { score: 0, why: 'exact' }
  if (key.startsWith(queryKey)) return { score: 10, why: 'prefix' }
  const at = key.indexOf(queryKey)
  if (at > 0) return { score: 20 + Math.min(at, 9), why: 'inside' }
  if (isSubsequence(queryKey, key)) return { score: 40, why: 'order' }

  // Опечатка: разрешаем примерно одну ошибку на 4 символа, но не больше двух.
  // Короткие запросы («пд5») не штрафуем — иначе «пд1» полезет к «пд10».
  if (queryKey.length >= 4) {
    const limit = queryKey.length >= 8 ? 2 : 1
    const d = editDistance(queryKey, key, limit)
    if (d <= limit) return { score: 60 + d, why: 'typo' }
  }
  return null
}

/**
 * Отсортировать группы под запрос.
 * @param {Array<{id:string,name:string,faculty?:string}>} groups
 * @param {string} query
 * @param {{faculty?:string, course?:string}} filters
 * @returns {Array<{group:object, score:number, why:string}>}
 */
export function searchGroups(groups, query = '', filters = {}) {
  const queryKey = groupSearchKey(query)
  const faculty = String(filters.faculty || '').toUpperCase()
  const course = String(filters.course || '').toUpperCase()

  const out = []
  for (const group of Array.isArray(groups) ? groups : []) {
    if (!group) continue
    const name = String(group.name || '')
    if (faculty && facultyKeyFromName(name) !== faculty) continue
    if (course && courseKeyFromName(name) !== course) continue
    const hit = matchScore(name, queryKey)
    if (!hit) continue
    out.push({ group, score: hit.score, why: hit.why })
  }

  out.sort(
    (a, b) =>
      a.score - b.score ||
      a.group.name.localeCompare(b.group.name, 'ru', { numeric: true, sensitivity: 'base' }),
  )
  return out
}

/** Первая группа, которая совпала точно (для Enter в поиске). */
export function pickExactGroup(groups, query = '') {
  const key = groupSearchKey(query)
  if (!key) return null
  const found = (Array.isArray(groups) ? groups : []).find((g) => groupSearchKey(g?.name) === key)
  return found || null
}

/** Подсказка «возможно, ты имел в виду» — только когда прямых совпадений нет. */
export function suggestGroupName(groups, query = '') {
  const key = groupSearchKey(query)
  if (key.length < 3) return ''
  let best = null
  for (const group of Array.isArray(groups) ? groups : []) {
    const name = String(group?.name || '')
    if (!name) continue
    const d = editDistance(key, groupSearchKey(name), 3)
    if (d > 3) continue
    if (!best || d < best.d) best = { name, d }
  }
  return best ? best.name : ''
}

/** Уникальные факультеты в списке групп, в привычном порядке. */
export function listFacultyKeys(groups) {
  const order = ['ПД', 'МЧС', 'Ю', 'ПСА', 'ПСО', 'ИБАС', 'ЭБАС']
  const seen = new Set()
  for (const g of groups || []) {
    const f = facultyKeyFromName(g?.name)
    if (f) seen.add(f)
  }
  return [...seen].sort((a, b) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    return a.localeCompare(b, 'ru')
  })
}

/** Уникальные префиксы курса, по возрастанию. */
export function listCourseKeys(groups) {
  const seen = new Set()
  for (const g of groups || []) {
    const c = courseKeyFromName(g?.name)
    if (c) seen.add(c)
  }
  return [...seen].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }))
}
