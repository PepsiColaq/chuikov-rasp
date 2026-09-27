import {
  hashAccessCode,
  timingSafeEqual,
  sanitizeText,
  LIMITS,
  checkRateLimit,
  registerFailedAttempt,
  clearRateLimit,
} from './security.js'
import {
  CODE_HASHES,
  SEMESTER_LABEL,
  SCHEDULE_GROUPS,
  SCHEDULE_LESSONS,
  facultyFromName,
} from '../data/seed.js'

const STORAGE_KEY = 'rasp_db_v3'
const DB_VERSION = 3
const SESSION_KEY = 'rasp_session_v1'
const CODE_SALT = 'chuikov-rasp-v1'

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
}

function groupIdFromName(name) {
  return `g_${name.replace(/[^a-zA-Z0-9а-яА-ЯёЁ]+/gi, '_').toLowerCase()}`
}

async function buildSeed() {
  const groups = []
  const lessons = []

  for (const name of SCHEDULE_GROUPS) {
    const id = groupIdFromName(name)
    const starostaCodeHash = CODE_HASHES.groups[name]
    if (!starostaCodeHash) throw new Error(`Нет хэша кода для группы ${name}`)
    groups.push({
      id,
      name,
      faculty: facultyFromName(name),
      active: true,
      starostaCodeHash,
    })
    const rows = SCHEDULE_LESSONS[name] || []
    for (const l of rows) {
      lessons.push({
        id: uid('les'),
        groupId: id,
        day: Number(l.day),
        start: l.start,
        end: l.end,
        subject: l.subject,
        teacher: l.teacher || '',
        room: l.room || '',
        remote: !!l.remote,
        weekType: l.weekType || 'every',
        pair: l.pair || null,
      })
    }
  }

  return {
    version: DB_VERSION,
    semesterLabel: SEMESTER_LABEL,
    adminCodeHash: CODE_HASHES.admin,
    groups,
    lessons,
    overrides: [],
    homework: [],
    audit: [],
  }
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveRaw(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

let db = null

export async function initStore() {
  db = loadRaw()
  if (!db || db.version !== DB_VERSION) {
    db = await buildSeed()
    saveRaw(db)
  }
  return db
}

export function getDefaultGroupId() {
  const g = db.groups.find((x) => x.name === '0903-ПД3')
  return g ? g.id : db.groups[0]?.id || ''
}

export function getDb() {
  return db
}

export function listGroups() {
  return [...db.groups].filter((g) => g.active).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export function getGroup(id) {
  return db.groups.find((g) => g.id === id) || null
}

export function findGroupByName(name) {
  const n = sanitizeText(name, LIMITS.groupName).toLowerCase()
  return db.groups.find((g) => g.name.toLowerCase() === n) || null
}

export function getLessons(groupId, day) {
  return db.lessons
    .filter((l) => l.groupId === groupId && (day == null || l.day === day))
    .sort((a, b) => a.start.localeCompare(b.start))
}

export function getOverridesForDate(groupId, dateStr) {
  return db.overrides.filter((o) => o.groupId === groupId && o.date === dateStr)
}

export function getHomework(groupId, { subject, fromDate } = {}) {
  return db.homework
    .filter((h) => {
      if (h.groupId !== groupId) return false
      if (subject && h.subject !== subject) return false
      if (fromDate && h.dueDate < fromDate) return false
      return true
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

function pushAudit(entry) {
  db.audit.unshift({
    id: uid('aud'),
    at: new Date().toISOString(),
    ...entry,
  })
  db.audit = db.audit.slice(0, 200)
}

function requireWrite(session, groupId) {
  if (!session) throw new Error('Нужен вход старосты или админа')
  if (session.role === 'admin') return
  if (session.role === 'starosta' && session.groupId === groupId) return
  throw new Error('Нет прав на эту группу')
}

export function getSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')
    if (!s) return null
    if (s.expiresAt && Date.now() > s.expiresAt) {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    return s
  } catch {
    return null
  }
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY)
}

export async function loginWithCode(code, groupIdHint = null) {
  const clean = sanitizeText(code, LIMITS.accessCode)
  if (clean.length < LIMITS.minCodeLength) {
    throw new Error(`Код слишком короткий (мин. ${LIMITS.minCodeLength})`)
  }

  const bucket = `login:${groupIdHint || 'any'}`
  const rate = checkRateLimit(bucket)
  if (!rate.ok) {
    throw new Error(`Слишком много попыток. Подождите ${Math.ceil(rate.retryAfterMs / 60000)} мин.`)
  }

  const hash = await hashAccessCode(clean, CODE_SALT)

  if (timingSafeEqual(hash, db.adminCodeHash)) {
    clearRateLimit(bucket)
    const session = {
      role: 'admin',
      groupId: null,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    pushAudit({ action: 'login_admin', groupId: null })
    saveRaw(db)
    return session
  }

  const groups = groupIdHint
    ? [getGroup(groupIdHint)].filter(Boolean)
    : db.groups

  for (const g of groups) {
    if (timingSafeEqual(hash, g.starostaCodeHash)) {
      clearRateLimit(bucket)
      const session = {
        role: 'starosta',
        groupId: g.id,
        expiresAt: Date.now() + 12 * 60 * 60 * 1000,
      }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
      pushAudit({ action: 'login_starosta', groupId: g.id })
      saveRaw(db)
      return session
    }
  }

  const fail = registerFailedAttempt(bucket)
  if (fail.locked) {
    throw new Error('Слишком много попыток. Вход заблокирован на 15 минут.')
  }
  throw new Error('Неверный код')
}

export function addHomework(groupId, { subject, text, dueDate, lessonId }) {
  const session = getSession()
  requireWrite(session, groupId)
  const item = {
    id: uid('hw'),
    groupId,
    subject: sanitizeText(subject, LIMITS.subject),
    text: sanitizeText(text, LIMITS.homework),
    dueDate: sanitizeText(dueDate, 32),
    lessonId: lessonId || null,
    createdAt: new Date().toISOString(),
  }
  if (!item.subject || !item.text) throw new Error('Укажите предмет и текст ДЗ')
  db.homework.push(item)
  pushAudit({
    action: 'homework_add',
    groupId,
    detail: item.subject,
    by: session.role,
  })
  saveRaw(db)
  return item
}

export function deleteHomework(groupId, hwId) {
  const session = getSession()
  requireWrite(session, groupId)
  const before = db.homework.length
  db.homework = db.homework.filter((h) => !(h.id === hwId && h.groupId === groupId))
  if (db.homework.length === before) throw new Error('ДЗ не найдено')
  pushAudit({ action: 'homework_delete', groupId, detail: hwId, by: session.role })
  saveRaw(db)
}

/**
 * type: room_only | subject | subject_and_room | cancelled
 */
export function setOverride(groupId, payload) {
  const session = getSession()
  requireWrite(session, groupId)
  const date = sanitizeText(payload.date, 32)
  const lessonId = sanitizeText(payload.lessonId, 64)
  const type = payload.type
  const allowed = ['room_only', 'subject', 'subject_and_room', 'cancelled']
  if (!allowed.includes(type)) throw new Error('Неверный тип замены')
  if (!date || !lessonId) throw new Error('Укажите дату и пару')

  db.overrides = db.overrides.filter(
    (o) => !(o.groupId === groupId && o.date === date && o.lessonId === lessonId),
  )

  const row = {
    id: uid('ovr'),
    groupId,
    date,
    lessonId,
    type,
    newRoom: sanitizeText(payload.newRoom || '', LIMITS.room),
    newSubject: sanitizeText(payload.newSubject || '', LIMITS.subject),
    note: sanitizeText(payload.note || '', 200),
  }
  db.overrides.push(row)
  pushAudit({
    action: 'override_set',
    groupId,
    detail: `${type} ${date}`,
    by: session.role,
  })
  saveRaw(db)
  return row
}

export function clearOverride(groupId, overrideId) {
  const session = getSession()
  requireWrite(session, groupId)
  db.overrides = db.overrides.filter((o) => !(o.id === overrideId && o.groupId === groupId))
  pushAudit({ action: 'override_clear', groupId, detail: overrideId, by: session.role })
  saveRaw(db)
}

export function updateLessonRoom(groupId, lessonId, room) {
  const session = getSession()
  requireWrite(session, groupId)
  const lesson = db.lessons.find((l) => l.id === lessonId && l.groupId === groupId)
  if (!lesson) throw new Error('Пара не найдена')
  lesson.room = sanitizeText(room, LIMITS.room)
  pushAudit({
    action: 'room_update',
    groupId,
    detail: `${lesson.subject} → ${lesson.room}`,
    by: session.role,
  })
  saveRaw(db)
  return lesson
}

export async function createGroup({ name, faculty, starostaCode }) {
  const session = getSession()
  if (!session || session.role !== 'admin') throw new Error('Только админ')
  const gName = sanitizeText(name, LIMITS.groupName)
  if (!gName) throw new Error('Укажите название группы')
  if (findGroupByName(gName)) throw new Error('Такая группа уже есть')
  const code = sanitizeText(starostaCode, LIMITS.accessCode)
  if (code.length < LIMITS.minCodeLength) {
    throw new Error(`Код старосты: мин. ${LIMITS.minCodeLength} символов`)
  }
  const starostaCodeHash = await hashAccessCode(code, CODE_SALT)
  const group = {
    id: uid('g'),
    name: gName,
    faculty: sanitizeText(faculty || '', 32),
    active: true,
    starostaCodeHash,
  }
  db.groups.push(group)
  pushAudit({ action: 'group_create', groupId: group.id, detail: gName, by: 'admin' })
  saveRaw(db)
  return group
}

export async function resetStarostaCode(groupId, newCode) {
  const session = getSession()
  if (!session || session.role !== 'admin') throw new Error('Только админ')
  const g = getGroup(groupId)
  if (!g) throw new Error('Группа не найдена')
  const code = sanitizeText(newCode, LIMITS.accessCode)
  if (code.length < LIMITS.minCodeLength) {
    throw new Error(`Код: мин. ${LIMITS.minCodeLength} символов`)
  }
  g.starostaCodeHash = await hashAccessCode(code, CODE_SALT)
  pushAudit({ action: 'code_reset', groupId, by: 'admin' })
  saveRaw(db)
}

export function resetSemester(groupId) {
  const session = getSession()
  if (!session || session.role !== 'admin') throw new Error('Только админ')
  const g = getGroup(groupId)
  if (!g) throw new Error('Группа не найдена')
  db.lessons = db.lessons.filter((l) => l.groupId !== groupId)
  db.overrides = db.overrides.filter((o) => o.groupId !== groupId)
  db.homework = db.homework.filter((h) => h.groupId !== groupId)
  pushAudit({ action: 'semester_reset', groupId, by: 'admin' })
  saveRaw(db)
}

export function importLessons(groupId, lessons) {
  const session = getSession()
  if (!session || (session.role !== 'admin' && !(session.role === 'starosta' && session.groupId === groupId))) {
    throw new Error('Нет прав')
  }
  for (const raw of lessons) {
    db.lessons.push({
      id: uid('les'),
      groupId,
      day: Number(raw.day),
      start: sanitizeText(raw.start, 8),
      end: sanitizeText(raw.end, 8),
      subject: sanitizeText(raw.subject, LIMITS.subject),
      room: sanitizeText(raw.room || '', LIMITS.room),
      remote: !!raw.remote,
      weekType: raw.weekType || 'every',
    })
  }
  pushAudit({ action: 'lessons_import', groupId, detail: String(lessons.length), by: session.role })
  saveRaw(db)
}

export function getAudit(limit = 50) {
  const session = getSession()
  if (!session || session.role !== 'admin') return []
  return db.audit.slice(0, limit)
}

export function getSemesterLabel() {
  return db.semesterLabel || ''
}

/** Effective lesson view for a date: merge base + override */
export function resolveLesson(lesson, override) {
  if (!override) {
    return {
      ...lesson,
      effectiveSubject: lesson.subject,
      effectiveRoom: lesson.room,
      cancelled: false,
      overrideType: null,
    }
  }
  if (override.type === 'cancelled') {
    return {
      ...lesson,
      effectiveSubject: lesson.subject,
      effectiveRoom: lesson.room,
      cancelled: true,
      overrideType: 'cancelled',
      note: override.note,
    }
  }
  if (override.type === 'room_only') {
    return {
      ...lesson,
      effectiveSubject: lesson.subject,
      effectiveRoom: override.newRoom || lesson.room,
      cancelled: false,
      overrideType: 'room_only',
      oldRoom: lesson.room,
    }
  }
  if (override.type === 'subject') {
    return {
      ...lesson,
      effectiveSubject: override.newSubject || lesson.subject,
      effectiveRoom: lesson.room,
      cancelled: false,
      overrideType: 'subject',
      oldSubject: lesson.subject,
    }
  }
  // subject_and_room
  return {
    ...lesson,
    effectiveSubject: override.newSubject || lesson.subject,
    effectiveRoom: override.newRoom || lesson.room,
    cancelled: false,
    overrideType: 'subject_and_room',
    oldSubject: lesson.subject,
    oldRoom: lesson.room,
  }
}

export { CODE_SALT }
