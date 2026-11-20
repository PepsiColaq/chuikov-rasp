// «Часы сайта»: настоящие или подменённые через адрес.
//
// ?now=10:15              — сегодня, но время другое
// ?now=2026-11-17T10:15   — другой день и время
//
// Нужно, чтобы проверить подсветку идущей пары вечером или в выходной,
// когда занятий нет. Без параметра всё работает от настоящих часов.
//
// Модуль намеренно без импортов: его читают и app-state.js, и time.js,
// иначе получился бы цикл (time.js уже импортирует state).

function readClockOverride() {
  try {
    const raw = new URLSearchParams(location.search).get('now')
    if (!raw) return null
    const full = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/.exec(raw)
    if (full) {
      return {
        date: `${full[1]}-${full[2]}-${full[3]}`,
        minutes: Number(full[4]) * 60 + Number(full[5]),
      }
    }
    const hm = /^(\d{1,2}):(\d{2})$/.exec(raw)
    if (hm) return { date: null, minutes: Number(hm[1]) * 60 + Number(hm[2]) }
  } catch {
    /* нет URL / битый параметр — работаем от настоящих часов */
  }
  return null
}

export const CLOCK_OVERRIDE = readClockOverride()

/** Текущий момент по «часам сайта». */
export function clockNow() {
  if (!CLOCK_OVERRIDE) return new Date()
  const base = CLOCK_OVERRIDE.date ? new Date(`${CLOCK_OVERRIDE.date}T12:00:00`) : new Date()
  if (CLOCK_OVERRIDE.date) base.setHours(0, 0, 0, 0)
  base.setMinutes(CLOCK_OVERRIDE.minutes)
  return base
}

/** Минуты от полуночи по «часам сайта». */
export function clockMinutes() {
  if (CLOCK_OVERRIDE) return CLOCK_OVERRIDE.minutes
  const n = new Date()
  return n.getHours() * 60 + n.getMinutes()
}

/** «2026-11-17» по «часам сайта». */
export function clockDateISO() {
  if (CLOCK_OVERRIDE?.date) return CLOCK_OVERRIDE.date
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Подпись для плашки «время подменено»: null — часы настоящие. */
export function clockOverrideLabel() {
  if (!CLOCK_OVERRIDE) return null
  const hh = String(Math.floor(CLOCK_OVERRIDE.minutes / 60)).padStart(2, '0')
  const mm = String(CLOCK_OVERRIDE.minutes % 60).padStart(2, '0')
  return CLOCK_OVERRIDE.date ? `${CLOCK_OVERRIDE.date} ${hh}:${mm}` : `сегодня ${hh}:${mm}`
}
