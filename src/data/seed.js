import schedule from './schedule.json'
import codeHashes from './code-hashes.json'

export const DAY_NAMES = {
  1: 'Понедельник',
  2: 'Вторник',
  3: 'Среда',
  4: 'Четверг',
  5: 'Пятница',
  6: 'Суббота',
}

export const DAY_SHORT = {
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
}

export const CODE_HASHES = codeHashes
export const SEMESTER_LABEL = schedule.semesterLabel || '2026–2027 · 1 полугодие'
export const SCHEDULE_GROUPS = schedule.groups
export const SCHEDULE_LESSONS = schedule.lessons
export const DEFAULT_GROUP_NAME = '0903-ПД3'

export function facultyFromName(name) {
  const n = name.toUpperCase()
  if (n.includes('ПД')) return 'ПД'
  if (n.includes('ПСА')) return 'ПСА'
  if (n.includes('ПСО')) return 'ПСО'
  if (n.includes('ЭБАС')) return 'ЭБАС'
  if (n.includes('ИБАС')) return 'ИБАС'
  if (n.includes('-Ю') || n.includes('Ю-')) return 'Ю'
  return ''
}

export function breakMinutes(prevEnd, nextStart) {
  const [ph, pm] = prevEnd.split(':').map(Number)
  const [nh, nm] = nextStart.split(':').map(Number)
  return nh * 60 + nm - (ph * 60 + pm)
}
