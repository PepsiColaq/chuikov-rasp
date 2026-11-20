// Дата, время, подписи: «сейчас идёт», «через 20 минут», границы недели,
// формат «14 ноября», сокращения ФИО и телефонов.
//
// Всё это раньше было разбросано по main.js между экранами. Одна функция
// на каждый случай — чтобы форматы не расходились между вкладками.

import { state } from './app-state.js'
import { DAY_SWAP_MOTION, ROLE_RU } from './constants.js'
import { motionOk } from './ui-feedback.js'
import { getSession } from './store.js'
import { DAY_NAMES } from '../data/seed.js'
import { clockDateISO, clockMinutes, clockNow, clockOverrideLabel } from './clock.js'

// Часы сайта (настоящие или подменённые через ?now=) живут в clock.js:
// этот модуль импортирует state, поэтому держать там ещё и часы — значит
// получить цикл. Здесь только реэкспорт, чтобы остальной код не менялся.

/** «09:00» → минуты от полуночи */
export function hhmmToMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export function nowMinutesOfDay() {
  return clockMinutes()
}

export { clockNow, clockOverrideLabel }

/** Сегодняшняя дата «2026-11-17» по часам сайта. */
export function todayISO() {
  return clockDateISO()
}

export function shortSubjectLabel(name, max = 36) {
  const s = String(name || '').trim()
  if (s.length <= max) return s
  return `${s.slice(0, Math.max(1, max - 1)).trim()}…`
}

/** «7 мин» / «2 ч 10 мин» — минуты в скобках не читаются, часы понятнее. */
export function humanMins(total) {
  const m = Math.max(0, Math.round(Number(total) || 0))
  if (m < 1) return 'меньше минуты'
  if (m < 60) return `${m} мин`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} ч ${rest} мин` : `${h} ч`
}

/** Дата дня недели с учётом сдвига недель UI (0 = эта, -1 = прошлая, +1 = следующая). */
export function dateForWeekday(dayNum, offset = state.weekOffset) {
  const now = clockNow()
  const jsDay = now.getDay() || 7
  const d = new Date(now)
  d.setHours(12, 0, 0, 0)
  d.setDate(now.getDate() + (Number(dayNum) - jsDay) + Number(offset) * 7)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Дата дня недели относительно календарной «этой» недели (не зависит от weekOffset в UI). */
export function calendarDateForWeekday(dayNum, weekFromToday = 0) {
  return dateForWeekday(dayNum, weekFromToday)
}

/** Вычесть минуты из «HH:MM». */
export function subtractMinutes(hhmm, mins) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim())
  if (!m) return ''
  let total = Number(m[1]) * 60 + Number(m[2]) - Number(mins)
  if (!Number.isFinite(total) || total < 0) total = 0
  const h = Math.floor(total / 60)
  const mi = total % 60
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}

export function weekRangeLabel() {
  const mon = formatDateRu(dateForWeekday(1))
  const end = formatDateRu(dateForWeekday(5))
  if (state.weekOffset === 0) return `Эта неделя · ${mon}–${end}`
  if (state.weekOffset === -1) return `Прошлая · ${mon}–${end}`
  if (state.weekOffset === 1) return `Следующая · ${mon}–${end}`
  if (state.weekOffset < 0) return `−${Math.abs(state.weekOffset)} нед. · ${mon}–${end}`
  return `+${state.weekOffset} нед. · ${mon}–${end}`
}

/** Show dates as ДД.ММ.ГГГГ (storage stays YYYY-MM-DD). */
export function formatDateRu(iso) {
  if (!iso) return ''
  const s = String(iso).slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return `${m[3]}.${m[2]}.${m[1]}`
  const m2 = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s)
  if (m2) return s
  return s
}

export function weekdayFromISO(iso) {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).slice(0, 10))
  if (!m) return null
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(dt.getTime())) return null
  const js = dt.getDay() // 0=вс … 6=сб
  return js === 0 ? 7 : js
}

export function weekdayNumFromIso(iso) {
  const s = String(iso || '').slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return 0
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0)
  const js = d.getDay()
  return js === 0 ? 7 : js
}

export function canEdit(groupId) {
  const s = getSession()
  if (!s) return false
  if (s.role === 'admin') return true
  // Куратор ведёт свои группы (или все, если groupId пустой) — как староста.
  if (s.role === 'curator') return !s.groupId || s.groupId === groupId
  if (s.role === 'starosta' && s.allGroups) return true
  return s.role === 'starosta' && s.groupId === groupId
}

export function normalizeSuggestKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.\s]+/g, ' ')
    .trim()
}

/**
 * Телефон в виде «+7 900 000 00 00».
 * Плюс и код страны подставляются сами: человек вводит только цифры.
 */
export function formatPhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits[0] === '8') digits = '7' + digits.slice(1)
  if (digits[0] !== '7') digits = '7' + digits
  digits = digits.slice(0, 11)
  const rest = digits.slice(1)
  let out = '+7'
  if (rest.length) out += ` ${rest.slice(0, 3)}`
  if (rest.length > 3) out += ` ${rest.slice(3, 6)}`
  if (rest.length > 6) out += ` ${rest.slice(6, 8)}`
  if (rest.length > 8) out += ` ${rest.slice(8, 10)}`
  return out
}

/** Карточка «идёт сейчас / следующая пара / на сегодня всё». */
/** Относительное время для ленты: «только что», «2 ч назад», «вчера». */
export function relativeTime(iso) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const diff = Date.now() - t
  if (diff < 0) return 'скоро'
  const min = Math.round(diff / 60000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  const hrs = Math.round(min / 60)
  if (hrs < 24) return `${hrs} ч назад`
  const days = Math.round(hrs / 24)
  if (days === 1) return 'вчера'
  if (days < 7) return `${days} дн назад`
  return formatDateRu(String(iso).slice(0, 10))
}

export function shortPersonName(full) {
  const parts = String(full || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length < 2) return String(full || '').trim()
  const initials = parts
    .slice(1)
    .map((part) => part[0])
    .filter(Boolean)
    .join('. ')
  return initials ? `${parts[0]} ${initials}.` : parts[0]
}

export function typeLabel(t) {
  return (
    {
      room_only: 'Смена кабинета',
      subject: 'Другая пара',
      subject_and_room: 'Другая пара + кабинет',
      cancelled: 'Пары не будет',
    }[t] || t
  )
}

export function teacherDateLabel(dateStr) {
  const dayOfDate = weekdayFromISO(dateStr)
  return dayOfDate ? `Дата (${DAY_NAMES[dayOfDate] || ''})` : 'Дата'
}

/** Дата «2026-11-09» → «09.11.2026» с защитой от мусора. */
export function auditDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!m) return String(iso || '')
  return m[3] + '.' + m[2] + '.' + m[1]
}

/** Убираем из строки внутренние id, если они всё же просочились. */
export function stripIds(text) {
  return String(text || '')
    .replace(/\b(hw|news|jg|jm|fm|ovr|adm|gc|st)_[A-Za-z0-9А-Яа-я_]{4,}\b/g, '')
    .replace(/\bsessions_purged\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s·,\-–—]+|[\s·,\-–—]+$/g, '')
    .trim()
}

export function roleRu(role) {
  return ROLE_RU[String(role || '').toLowerCase()] || String(role || '')
}

/** Класс панели при смене дня (направление + уважение reduce-motion) */
export function daySwapPanelClass(base = 'panel', { allow = true } = {}) {
  if (!allow || !DAY_SWAP_MOTION || !motionOk() || !state.daySwap) return base
  return `${base} day-swap day-swap-${state.daySwap}`
}

/** F5 / pull-reload — без заставки. Полное закрытие Chrome → type=navigate → с анимацией. */
export function isPageReload() {
  try {
    const nav = performance.getEntriesByType?.('navigation')?.[0]
    if (nav) return nav.type === 'reload'
    return performance.navigation?.type === 1
  } catch {
    return false
  }
}
