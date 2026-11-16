// Сравнение расписаний двух групп: когда они могут пересечься.
//
// Модуль намеренно без импортов: на вход приходят уже разрешённые пары
// (с учётом замен) и построения, на выходе — готовые интервалы. Так логику
// можно проверить отдельно от интерфейса и не тянуть за собой store/supabase.
//
// Термины:
//   class     — очная пара в колледже
//   home      — дистанционная пара (человек дома, в колледже его нет)
//   formation — построение (на плацу, в колледже)
//   free      — свободен

/** Меньше этого перемена не считается поводом «встретиться». */
export const MIN_BREAK_MINUTES = 5

/** «09:30» → 570. Возвращает null, если время не похоже на время. */
export function parseHHMM(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value == null ? '' : value).trim())
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null
  if (h > 23 || mi > 59) return null
  return h * 60 + mi
}

/** 570 → «09:30» */
export function minutesToHHMM(total) {
  const t = Math.max(0, Math.min(24 * 60, Math.round(Number(total) || 0)))
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/**
 * Построение по расписанию: за N минут до первой очной пары.
 *
 * Отмену построения знает только сервер и только для «своих» групп,
 * поэтому здесь её нет — она подмешивается отдельно (см. compare.js).
 *
 * @param {Array<{start:string,end?:string,cancelled?:boolean,remote?:boolean,subject?:string}>} views
 * @param {{groupName?:string, faculty?:string, faculties?:string[], lead?:number}} opts
 */
export function planFormation(views, opts = {}) {
  const faculties = (Array.isArray(opts.faculties) ? opts.faculties : [])
    .map((f) => String(f || '').trim().toUpperCase())
    .filter(Boolean)
  if (!faculties.length) return { show: false, reason: 'faculty' }

  const byField = String(opts.faculty || '').trim().toUpperCase()
  const name = String(opts.groupName || '').toUpperCase()
  const allowed = (byField && faculties.includes(byField)) || faculties.some((f) => name.includes(f))
  if (!allowed) return { show: false, reason: 'faculty' }

  const inPerson = (Array.isArray(views) ? views : []).filter(
    (v) => v && !v.cancelled && !v.remote && parseHHMM(v.start) != null,
  )
  if (!inPerson.length) return { show: false, reason: 'no_campus' }

  const first = inPerson.reduce((best, v) =>
    parseHHMM(v.start) < parseHHMM(best.start) ? v : best,
  )
  const leadRaw = Number(opts.lead)
  const lead = Number.isFinite(leadRaw) ? Math.max(0, Math.min(120, Math.round(leadRaw))) : 15
  const anchor = parseHHMM(first.start)
  const formStart = Math.max(0, anchor - lead)

  return {
    show: true,
    formStart: minutesToHHMM(formStart),
    anchorStart: first.start,
    leadMinutes: lead,
    subject: first.subject || '',
    skipped: false,
  }
}

/** Занятость группы за день: очные пары, дистант и построение отдельными блоками. */
export function dayBlocks(views, formation) {
  const blocks = []
  for (const v of Array.isArray(views) ? views : []) {
    if (!v || v.cancelled) continue
    const start = parseHHMM(v.start)
    const end = parseHHMM(v.end || v.start)
    if (start == null || end == null || end <= start) continue
    blocks.push({
      start,
      end,
      kind: v.remote ? 'home' : 'class',
      subject: String(v.subject || '').trim(),
      room: String(v.room || '').trim(),
    })
  }
  if (formation?.show && !formation.skipped) {
    const from = parseHHMM(formation.formStart)
    const to = parseHHMM(formation.anchorStart)
    if (from != null && to != null && to > from) {
      blocks.push({
        start: from,
        end: to,
        kind: 'formation',
        subject: 'Построение',
        room: '',
      })
    }
  }
  blocks.sort((a, b) => a.start - b.start || a.end - b.end)
  return blocks
}

/** Что происходит у группы в эту минуту. Построение важнее пары, пара — дистанта. */
function stateAt(blocks, minute) {
  let state = 'free'
  for (const b of blocks) {
    if (minute < b.start || minute >= b.end) continue
    if (b.kind === 'formation') return 'formation'
    if (b.kind === 'class') state = 'class'
    else if (state !== 'class') state = 'home'
  }
  return state
}

/** Кабинеты, в которых группа в эту минуту. */
function roomsAt(blocks, minute) {
  const out = []
  for (const b of blocks) {
    if (b.kind !== 'class') continue
    if (minute < b.start || minute >= b.end) continue
    if (b.room) out.push(b.room)
  }
  return out
}

/**
 * Тип интервала для пары «мы — они».
 * break     — оба свободны (общая перемена)
 * formation — оба на построении
 * room      — оба на паре в одном кабинете
 * class     — оба на парах, но в разных кабинетах
 * home      — кто-то на дистанте, в колледже его нет
 * mixed     — один свободен, другой занят
 */
function classify(a, b, roomsA, roomsB) {
  if (a === 'formation' && b === 'formation') return 'formation'
  if (a === 'class' && b === 'class') {
    const shared = roomsA.some((r) => roomsB.includes(r))
    return shared ? 'room' : 'class'
  }
  if (a === 'free' && b === 'free') return 'break'
  if (a === 'home' || b === 'home') return 'home'
  return 'mixed'
}

/**
 * Сравнить два дня.
 *
 * @param {{blocks:Array}} mine  — результат dayBlocks для моей группы
 * @param {{blocks:Array}} other — то же для второй группы
 * @param {number} [minBreak]    — минимальная длина перемены, которая считается
 * @returns {{
 *   empty: boolean,
 *   dayStart: number, dayEnd: number,
 *   segments: Array<{start:number,end:number,kind:string,a:string,b:string,rooms:string[]}>,
 *   meetings: Array<{start:number,end:number,minutes:number,kind:string,rooms:string[]}>,
 *   counts: {break:number, formation:number, room:number, total:number}
 * }}
 */
export function compareDays({ mine, other, minBreak = MIN_BREAK_MINUTES } = {}) {
  const aBlocks = Array.isArray(mine?.blocks) ? mine.blocks : []
  const bBlocks = Array.isArray(other?.blocks) ? other.blocks : []
  const all = aBlocks.concat(bBlocks)

  if (!all.length) {
    return {
      empty: true,
      dayStart: 0,
      dayEnd: 0,
      spanA: null,
      spanB: null,
      segments: [],
      meetings: [],
      counts: { break: 0, formation: 0, room: 0, total: 0 },
    }
  }

  const dayStart = Math.min(...all.map((b) => b.start))
  const dayEnd = Math.max(...all.map((b) => b.end))

  // Свой учебный день каждой группы: от первой активности до последней.
  // Нужен, чтобы не выдать за «общую перемену» время, когда один уже ушёл
  // домой: после своей последней пары человек в колледже не остаётся.
  const spanOf = (blocks) =>
    blocks.length
      ? { start: Math.min(...blocks.map((b) => b.start)), end: Math.max(...blocks.map((b) => b.end)) }
      : null
  const spanA = spanOf(aBlocks)
  const spanB = spanOf(bBlocks)
  const insideBoth = (minute) =>
    !!spanA && !!spanB && minute >= spanA.start && minute < spanA.end && minute >= spanB.start && minute < spanB.end

  // Границы всех блоков режут день на куски с постоянным состоянием обеих групп:
  // внутри такого куска ничего не меняется, значит его можно оценить одной точкой.
  const points = new Set([dayStart, dayEnd])
  for (const b of all) {
    if (b.start > dayStart && b.start < dayEnd) points.add(b.start)
    if (b.end > dayStart && b.end < dayEnd) points.add(b.end)
  }
  const edges = [...points].sort((x, y) => x - y)

  const segments = []
  for (let i = 0; i < edges.length - 1; i++) {
    const start = edges[i]
    const end = edges[i + 1]
    if (end <= start) continue
    const mid = (start + end) / 2
    const a = stateAt(aBlocks, mid)
    const b = stateAt(bBlocks, mid)
    const kind = classify(a, b, roomsAt(aBlocks, mid), roomsAt(bBlocks, mid))
    const rooms = roomsAt(aBlocks, mid).filter((r) => roomsAt(bBlocks, mid).includes(r))
    const prev = segments[segments.length - 1]
    if (prev && prev.kind === kind && prev.end === start) {
      // Склеиваем соседние куски одного типа — иначе перемена 70 мин
      // распалась бы на десяток строк между парами.
      prev.end = end
      for (const r of rooms) if (!prev.rooms.includes(r)) prev.rooms.push(r)
      continue
    }
    segments.push({ start, end, kind, a, b, rooms, inside: insideBoth(mid) })
  }

  const meetings = []
  for (const seg of segments) {
    const minutes = seg.end - seg.start
    if (seg.kind === 'break') {
      if (!seg.inside) continue
      if (minutes < minBreak) continue
      meetings.push({ start: seg.start, end: seg.end, minutes, kind: 'break', rooms: [] })
      continue
    }
    if (seg.kind === 'formation' || seg.kind === 'room') {
      meetings.push({ start: seg.start, end: seg.end, minutes, kind: seg.kind, rooms: seg.rooms })
    }
  }
  meetings.sort((x, y) => x.start - y.start)

  const counts = { break: 0, formation: 0, room: 0, total: meetings.length }
  for (const m of meetings) counts[m.kind] += 1

  return { empty: false, dayStart, dayEnd, spanA, spanB, segments, meetings, counts }
}
