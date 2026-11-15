/**
 * Разбор расписания колледжа из таблицы (.xlsx), которую присылают из деканата.
 *
 * Шаблон всегда один и тот же, поэтому парсер детерминированный — никакой
 * «умной» модели, которая может придумать пару. Структура листа:
 *
 *   ... «РАСПИСАНИЕ» ... «ЛЕТНЯЯ СЕССИЯ» ...
 *   | Группа 0901-Ю1 | Группа 0901-Ю2 | ... (по одной колонке на группу)
 *   | Понедельник 04.05.2026 | Ауд. 317 | ...
 *   |                         | ОБЩЕСТВОЗНАНИЕ
 *   |                         | Головятенко А.Ю.
 *   |                         | 0.375            ← время дробью Excel
 *   |                         | Экзамен
 *
 * Лист разбит на 2–3 «блока» (колонка с датой + колонки групп). Блоки
 * находим по колонкам, где вообще встречаются даты, — так файл не развалится,
 * если в следующий раз блоков будет два или четыре.
 */

import { groupSearchKey } from './group-match.js'

const KIND_RE = /^(экзамен|дифф\.?\s*зач[её]т|дифференцированный\s*зач[её]т|зач[её]т|контрольная\s*работа|курсовая\s*работа|курсовой\s*проект|практика|пробный)$/i
const TEACHER_RE = /^[А-ЯЁ][а-яё\-]+(?:\s+[А-ЯЁ][а-яё\-]+)?\s+[А-ЯЁ]\.\s*[А-ЯЁ]?\.?$/
const ROOM_RE = /^(ауд\.?|каб\.?|аудитория|спорт(ивный)?\s*зал|зал|мастерская|лаборатория)/i
const DATE_RE = /(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/

/** 0.375 → 09:00. Дробь Excel — доля суток. */
export function timeFromFraction(raw) {
  const s = String(raw || '').trim().replace(',', '.')
  if (!s || !/^\d+(\.\d+)?$/.test(s)) return ''
  const frac = Number(s)
  if (!Number.isFinite(frac) || frac < 0 || frac >= 2) return ''
  // Убираем возможную целую часть (дата + время), берём только время суток.
  const dayPart = frac % 1
  if (!dayPart) return ''
  let minutes = Math.round(dayPart * 24 * 60)
  // Шаблон печатает время с точностью до секунд — округляем до 5 минут.
  minutes = Math.round(minutes / 5) * 5
  if (minutes >= 24 * 60) minutes = 0
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0')
  const mm = String(minutes % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/** «9:00», «09.00», «9» → «09:00». Пустая строка, если не время. */
export function timeFromText(raw) {
  const s = String(raw || '').trim()
  const m = /^(\d{1,2})\s*[:.\-]\s*(\d{2})$/.exec(s)
  if (m) {
    const hh = Number(m[1])
    const mm = Number(m[2])
    if (hh < 24 && mm < 60) return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }
  return ''
}

export function timeFromAny(raw) {
  return timeFromText(raw) || timeFromFraction(raw)
}

function addMinutes(hhmm, mins) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '')
  if (!m) return ''
  const total = Number(m[1]) * 60 + Number(m[2]) + mins
  const hh = String(Math.floor((total % 1440) / 60)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/** «Ауд. 317» → «317»; «Спортивный зал» оставляем как есть. */
function cleanRoom(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  const m = /^(?:ауд\.?|каб\.?|аудитория)\s*(.+)$/i.exec(s)
  if (m) return m[1].trim()
  return s.replace(/\s+/g, ' ')
}

function parseDate(raw) {
  const m = DATE_RE.exec(String(raw || ''))
  if (!m) return ''
  let y = Number(m[3])
  if (y < 100) y += 2000
  const d = Number(m[1])
  const mo = Number(m[2])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return ''
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function shiftIso(iso, days) {
  if (!iso || !days) return iso
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysBetween(a, b) {
  const ma = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a || '')
  const mb = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b || '')
  if (!ma || !mb) return 0
  const da = new Date(Number(ma[1]), Number(ma[2]) - 1, Number(ma[3]), 12, 0, 0)
  const db = new Date(Number(mb[1]), Number(mb[2]) - 1, Number(mb[3]), 12, 0, 0)
  return Math.round((db - da) / 86400000)
}

/** Заголовок вида «Группа   0901-Ю1 » → «0901-Ю1». */
function groupNameFromCell(raw) {
  const s = String(raw || '').replace(/\u00a0/g, ' ').trim()
  if (!s) return ''
  const m = /группа\s*(.*)$/i.exec(s)
  const tail = (m ? m[1] : s).replace(/\s+/g, ' ').trim()
  if (!tail) return ''
  // Иногда в ячейке «Группа 0901-Ю1 1 курс» — берём первый «токен-название».
  const token = /[0-9A-ZА-ЯЁ][0-9A-ZА-ЯЁ\-/.]*/i.exec(tail)
  return token ? token[0].replace(/[.\-/]+$/, '') : tail
}

/** Классификация пяти строк пары: ауд / предмет / препод / время / вид. */
function classifyCell(text) {
  const s = String(text || '').trim()
  if (!s) return { kind: '' }
  const time = timeFromAny(s)
  if (time) return { kind: 'time', value: time }
  if (KIND_RE.test(s)) return { kind: 'kind', value: s }
  if (ROOM_RE.test(s)) return { kind: 'room', value: cleanRoom(s) }
  if (TEACHER_RE.test(s)) return { kind: 'teacher', value: s }
  // «Иванов И.И.» без пробела после точки, «Иванов И. И.»
  if (/^[А-ЯЁ][а-яё\-]+\s+[А-ЯЁ]\.\s*[А-ЯЁ]\.$/.test(s.replace(/\s+/g, ' '))) {
    return { kind: 'teacher', value: s.replace(/\s+/g, ' ') }
  }
  return { kind: 'subject', value: s }
}

/**
 * Найти блоки: колонки-даты и колонки-группы.
 * @returns {{groupRow:number, groups:Array, dateCols:number[]}}
 */
function detectStructure(rows) {
  let groupRow = -1
  let bestCount = 0
  const maxScan = Math.min(rows.length, 40)
  for (let r = 0; r < maxScan; r++) {
    const line = rows[r] || []
    let count = 0
    for (const cell of line) if (/группа/i.test(String(cell || ''))) count++
    if (count > bestCount) {
      bestCount = count
      groupRow = r
    }
  }
  if (groupRow < 0 || bestCount < 2) {
    throw new Error(
      'Не узнал шаблон: в файле нет строки с названиями групп («Группа 0901-ПД1»). Проверь, что это расписание колледжа.',
    )
  }

  const header = rows[groupRow] || []
  const groupCols = []
  header.forEach((cell, col) => {
    if (!/группа/i.test(String(cell || ''))) return
    const name = groupNameFromCell(cell)
    if (!name) return
    groupCols.push({ col, raw: String(cell), name })
  })

  // Колонки с датами — это начала блоков.
  const dateColsSet = new Set()
  for (let r = groupRow + 1; r < rows.length; r++) {
    const line = rows[r] || []
    line.forEach((cell, col) => {
      if (!cell) return
      if (!DATE_RE.test(String(cell))) return
      // В колонке группы дат быть не должно, но подстрахуемся.
      if (groupCols.some((g) => g.col === col)) return
      dateColsSet.add(col)
    })
  }
  const dateCols = [...dateColsSet].sort((a, b) => a - b)
  if (!dateCols.length) throw new Error('В файле нет дат вида «04.05.2026» — нечего импортировать.')

  for (const g of groupCols) {
    let start = -1
    for (const d of dateCols) if (d < g.col) start = d
    g.blockStart = start >= 0 ? start : dateCols[0]
  }

  return { groupRow, groups: groupCols, dateCols }
}

/**
 * Разобрать книгу.
 *
 * @param {{rows:string[][]}} book — результат readXlsx()
 * @param {{
 *   siteGroups?: Array<{id:string,name:string}>,
 *   shiftDays?: number,
 *   onlyGroupIds?: Set<string>|string[]|null,
 *   lessonMinutes?: number,
 * }} opts
 */
export function parseScheduleBook(book, opts = {}) {
  const rows = book?.rows || []
  const siteGroups = Array.isArray(opts.siteGroups) ? opts.siteGroups : []
  const lessonMinutes = Number(opts.lessonMinutes || 70)
  const shift = Number(opts.shiftDays || 0)
  const only = opts.onlyGroupIds
    ? new Set(Array.isArray(opts.onlyGroupIds) ? opts.onlyGroupIds : [...opts.onlyGroupIds])
    : null

  const { groupRow, groups, dateCols } = detectStructure(rows)

  // Карта «ключ названия → группа сайта».
  const siteByKey = new Map()
  for (const g of siteGroups) {
    const key = groupSearchKey(g.name)
    if (key && !siteByKey.has(key)) siteByKey.set(key, g)
  }

  const groupMap = groups.map((g) => ({
    ...g,
    key: groupSearchKey(g.name),
    site: siteByKey.get(groupSearchKey(g.name)) || null,
    count: 0,
  }))

  // Даты по каждому блоку: колонка → [{row, iso}]
  const datesByBlock = new Map()
  for (const col of dateCols) {
    const list = []
    for (let r = groupRow + 1; r < rows.length; r++) {
      const cell = (rows[r] || [])[col]
      if (!cell) continue
      const iso = parseDate(cell)
      if (!iso) continue
      list.push({ row: r, iso })
    }
    datesByBlock.set(col, list)
  }

  const lessons = []
  const warnings = []
  const seen = new Set()
  const allDates = new Set()
  let skipped = 0

  /** Сколько строк относится к этой дате: до следующей строки-даты, максимум 5. */
  const spanOf = (dates, i) => {
    const cur = dates[i]
    const next = dates[i + 1]
    const limit = next ? next.row - cur.row : 6
    return Math.max(1, Math.min(5, limit))
  }

  for (const g of groupMap) {
    const dates = datesByBlock.get(g.blockStart) || []
    if (!g.site) {
      // Группа есть в файле, но её нет на сайте — считаем пары, чтобы показать
      // в отчёте («пропущено 12 пар: нет группы»), но не создаём ничего молча.
      dates.forEach((d, i) => {
        const span = spanOf(dates, i)
        for (let k = 0; k < span; k++) {
          const cls = classifyCell((rows[d.row + k] || [])[g.col])
          if (cls.kind === 'subject') g.count++
        }
      })
      continue
    }

    dates.forEach((d, i) => {
      const span = spanOf(dates, i)
      const iso = shiftIso(d.iso, shift)
      // Аудитория стоит в самой строке даты, остальные четыре — ниже.
      const head = classifyCell((rows[d.row] || [])[g.col])
      const parsed = {
        room: head.kind === 'room' ? head.value : '',
        subject: '',
        teacher: '',
        start: '',
        kind: '',
      }
      for (let k = 1; k < span; k++) {
        const cls = classifyCell((rows[d.row + k] || [])[g.col])
        if (cls.kind === 'room') parsed.room = cls.value
        else if (cls.kind === 'subject') parsed.subject = cls.value
        else if (cls.kind === 'teacher') parsed.teacher = cls.value
        else if (cls.kind === 'time') parsed.start = cls.value
        else if (cls.kind === 'kind') parsed.kind = cls.value
      }
      if (!parsed.subject || !parsed.start) {
        // Пустая ячейка — обычное дело (в этот день у группы нет пары).
        if (parsed.subject) skipped++
        return
      }
      if (only && !only.has(g.site.id)) {
        skipped++
        return
      }
      const start = parsed.start
      const end = addMinutes(start, lessonMinutes)
      const uid = `${g.site.id}|${iso}|${start}|${parsed.subject}`
      if (seen.has(uid)) return
      seen.add(uid)
      allDates.add(iso)
      lessons.push({
        groupId: g.site.id,
        groupName: g.site.name,
        date: iso,
        start,
        end,
        subject: parsed.subject,
        teacher: parsed.teacher,
        room: parsed.room,
        kind: parsed.kind,
        remote: false,
      })
      g.count++
    })
  }

  const dateList = [...allDates].sort()
  const unknown = groupMap
    .filter((g) => !g.site)
    .map((g) => ({ raw: g.raw, name: g.name, count: g.count }))

  if (unknown.length) {
    warnings.push(
      `На сайте нет ${unknown.length} гр.: ${unknown
        .slice(0, 6)
        .map((g) => g.name)
        .join(', ')}${unknown.length > 6 ? '…' : ''}. Их пары пропущены — эти группы не создаются автоматически.`,
    )
  }
  if (!lessons.length) {
    warnings.push('Не нашёл ни одной пары. Проверь, что в файле заполнены предмет и время.')
  }

  const labelGuess = (() => {
    for (let r = 0; r < Math.min(rows.length, groupRow); r++) {
      for (const cell of rows[r] || []) {
        const s = String(cell || '').replace(/\s+/g, ' ').trim()
        if (/сесси/i.test(s) && s.length <= 40) return s
      }
    }
    return ''
  })()

  return {
    ok: lessons.length > 0,
    groups: groupMap.map((g) => ({
      raw: g.raw,
      name: g.name,
      siteId: g.site?.id || '',
      siteName: g.site?.name || '',
      count: g.count,
    })),
    unknownGroups: unknown,
    dates: dateList,
    lessons,
    skipped,
    warnings,
    labelGuess,
    blocks: dateCols.length,
    groupRow: groupRow + 1,
  }
}

/**
 * Сдвиг дат: по режиму.
 *  - 'asFile' — оставить как в файле
 *  - 'shift'  — прибавить shiftDays
 *  - 'toDate' — первая дата файла становится startIso (остальные на тот же сдвиг)
 * @returns {number} сколько дней прибавить
 */
export function resolveShift(report, { mode = 'asFile', startIso = '', shiftDays = 0 } = {}) {
  if (mode === 'shift') return Number(shiftDays) || 0
  if (mode === 'toDate') {
    const first = report?.dates?.[0]
    if (!first || !startIso) return 0
    return daysBetween(first, startIso)
  }
  return 0
}

/** Сгруппировать пары по датам — для превью «день → сколько пар». */
export function groupByDate(lessons) {
  const map = new Map()
  for (const l of lessons || []) {
    if (!map.has(l.date)) map.set(l.date, [])
    map.get(l.date).push(l)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, list]) => ({
      date,
      count: list.length,
      groups: [...new Set(list.map((l) => l.groupName))].length,
    }))
}
