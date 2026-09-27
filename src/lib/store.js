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
import { supabase, supabaseConfigured, rpcErrorMessage } from './supabase.js'

const STORAGE_KEY = 'rasp_db_v4'
const DB_VERSION = 4
const SESSION_KEY = 'rasp_session_v2'
const CODE_SALT = 'chuikov-rasp-v1'

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
}

export function groupIdFromName(name) {
  return `g_${name.replace(/[^a-zA-Z0-9а-яА-ЯёЁ]+/gi, '_').toLowerCase()}`
}

function lessonId(groupId, l, i) {
  const sub = String(l.subject || '')
    .replace(/[^a-zA-Z0-9а-яА-ЯёЁ]+/gi, '_')
    .slice(0, 40)
  return `${groupId}_${l.day}_${String(l.start).replace(':', '')}_${i}_${sub}`.slice(0, 120)
}

function buildLocalSeed() {
  const groups = []
  const lessons = []
  for (const name of SCHEDULE_GROUPS) {
    const id = groupIdFromName(name)
    groups.push({
      id,
      name,
      faculty: facultyFromName(name),
      active: true,
      starostaCodeHash: CODE_HASHES.groups[name],
    })
    const rows = SCHEDULE_LESSONS[name] || []
    rows.forEach((l, i) => {
      lessons.push({
        id: lessonId(id, l, i),
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
    })
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
    remote: false,
  }
}

async function loadFromSupabase() {
  const [metaRes, groupsRes, lessonsRes, hwRes, ovrRes] = await Promise.all([
    supabase.rpc('rasp_public_meta'),
    supabase.from('groups').select('id,name,faculty,active').eq('active', true),
    supabase.from('lessons').select('*'),
    supabase.from('homework').select('*'),
    supabase.from('overrides').select('*'),
  ])
  for (const r of [metaRes, groupsRes, lessonsRes, hwRes, ovrRes]) {
    if (r.error) throw r.error
  }

  return {
    version: DB_VERSION,
    semesterLabel: metaRes.data?.semesterLabel || SEMESTER_LABEL,
    adminCodeHash: '',
    groups: (groupsRes.data || []).map((g) => ({
      id: g.id,
      name: g.name,
      faculty: g.faculty || '',
      active: g.active,
      starostaCodeHash: '',
    })),
    lessons: (lessonsRes.data || []).map((l) => ({
      id: l.id,
      groupId: l.group_id,
      day: l.day,
      start: l.start_time,
      end: l.end_time,
      subject: l.subject,
      teacher: l.teacher || '',
      room: l.room || '',
      remote: !!l.remote,
      weekType: l.week_type || 'every',
      pair: l.pair,
    })),
    homework: (hwRes.data || []).map((h) => ({
      id: h.id,
      groupId: h.group_id,
      subject: h.subject,
      text: h.body,
      dueDate: h.due_date || '',
      lessonId: h.lesson_id,
      createdAt: h.created_at,
    })),
    overrides: (ovrRes.data || []).map((o) => ({
      id: o.id,
      groupId: o.group_id,
      lessonId: o.lesson_id,
      date: o.on_date,
      type: o.type,
      newRoom: o.new_room || '',
      newSubject: o.new_subject || '',
      note: o.note || '',
    })),
    audit: [],
    remote: true,
  }
}

function loadRaw() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    return null
  }
}

function saveRaw(data) {
  if (data.remote) return // remote is source of truth
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

let db = null

export function isRemoteMode() {
  return !!(db && db.remote)
}

export function getConnectionError() {
  return db?.connectionError || null
}

export async function initStore() {
  if (supabaseConfigured) {
    try {
      db = await loadFromSupabase()
      // drop stale local copy so it doesn't confuse
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        /* ignore */
      }
      return db
    } catch (e) {
      console.warn('Supabase load failed', e)
      db = buildLocalSeed()
      db.remote = false
      db.connectionError =
        'Нет связи с общей базой. ДЗ сохранится только на этом устройстве. Обнови страницу.'
      return db
    }
  }
  db = loadRaw()
  if (!db || db.version !== DB_VERSION || db.remote) {
    db = buildLocalSeed()
    saveRaw(db)
  }
  db.connectionError = null
  return db
}

export async function refreshMutable() {
  if (!supabaseConfigured || !db?.remote) return
  const [hwRes, ovrRes] = await Promise.all([
    supabase.from('homework').select('*'),
    supabase.from('overrides').select('*'),
  ])
  if (hwRes.error) throw hwRes.error
  if (ovrRes.error) throw ovrRes.error
  db.homework = (hwRes.data || []).map((h) => ({
    id: h.id,
    groupId: h.group_id,
    subject: h.subject,
    text: h.body,
    dueDate: h.due_date || '',
    lessonId: h.lesson_id,
    createdAt: h.created_at,
  }))
  db.overrides = (ovrRes.data || []).map((o) => ({
    id: o.id,
    groupId: o.group_id,
    lessonId: o.lesson_id,
    date: o.on_date,
    type: o.type,
    newRoom: o.new_room || '',
    newSubject: o.new_subject || '',
    note: o.note || '',
  }))
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
      if (fromDate && h.dueDate && h.dueDate < fromDate) return false
      return true
    })
    .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')))
}

function pushAudit(entry) {
  db.audit.unshift({ id: uid('aud'), at: new Date().toISOString(), ...entry })
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

export async function logout() {
  const s = getSession()
  if (s?.token && supabaseConfigured) {
    await supabase.rpc('rasp_logout', { p_token: s.token })
  }
  sessionStorage.removeItem(SESSION_KEY)
}

export async function loginWithCode(code, groupIdHint = null) {
  const clean = sanitizeText(code, LIMITS.accessCode)
  if (clean.length < LIMITS.minCodeLength) {
    throw new Error(`Код слишком короткий (мин. ${LIMITS.minCodeLength})`)
  }

  if (supabaseConfigured) {
    const { data, error } = await supabase.rpc('rasp_login', {
      p_code: clean,
      p_group_id: groupIdHint || null,
    })
    if (error) throw new Error(rpcErrorMessage(error))
    // ensure we're on remote data after login
    if (!db.remote) {
      db = await loadFromSupabase()
    }
    const session = {
      role: data.role,
      groupId: data.groupId,
      token: data.token,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    return session
  }

  const bucket = `login:${groupIdHint || 'any'}`
  const rate = checkRateLimit(bucket)
  if (!rate.ok) {
    throw new Error(`Слишком много попыток. Подождите ${Math.ceil(rate.retryAfterMs / 60000)} мин.`)
  }
  const hash = await hashAccessCode(clean, CODE_SALT)
  if (timingSafeEqual(hash, db.adminCodeHash)) {
    clearRateLimit(bucket)
    const session = { role: 'admin', groupId: null, expiresAt: Date.now() + 12 * 60 * 60 * 1000 }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    pushAudit({ action: 'login_admin' })
    saveRaw(db)
    return session
  }
  const groups = groupIdHint ? [getGroup(groupIdHint)].filter(Boolean) : db.groups
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
  if (fail.locked) throw new Error('Слишком много попыток. Вход заблокирован на 15 минут.')
  throw new Error('Неверный код')
}

export async function addHomework(groupId, { subject, text, dueDate, lessonId }) {
  const session = getSession()
  requireWrite(session, groupId)
  const subj = sanitizeText(subject, LIMITS.subject)
  const body = sanitizeText(text, LIMITS.homework)
  const due = sanitizeText(dueDate, 32)
  if (!subj || !body) throw new Error('Укажите предмет и текст ДЗ')

  if (supabaseConfigured) {
    if (!session.token) throw new Error('Нет связи с общей базой — обнови страницу и войди снова')
    if (!db.remote) db = await loadFromSupabase()
    const { error } = await supabase.rpc('rasp_add_homework', {
      p_token: session.token,
      p_group_id: groupId,
      p_subject: subj,
      p_body: body,
      p_due_date: due || null,
      p_lesson_id: lessonId || null,
    })
    if (error) throw new Error(rpcErrorMessage(error))
    await refreshMutable()
    return
  }

  const item = {
    id: uid('hw'),
    groupId,
    subject: subj,
    text: body,
    dueDate: due,
    lessonId: lessonId || null,
    createdAt: new Date().toISOString(),
  }
  db.homework.push(item)
  pushAudit({ action: 'homework_add', groupId, detail: subj, by: session.role })
  saveRaw(db)
  return item
}

export async function deleteHomework(groupId, hwId) {
  const session = getSession()
  requireWrite(session, groupId)
  if (supabaseConfigured) {
    if (!session.token) throw new Error('Нет связи с общей базой — обнови страницу и войди снова')
    const { error } = await supabase.rpc('rasp_delete_homework', {
      p_token: session.token,
      p_group_id: groupId,
      p_hw_id: hwId,
    })
    if (error) throw new Error(rpcErrorMessage(error))
    await refreshMutable()
    return
  }
  const before = db.homework.length
  db.homework = db.homework.filter((h) => !(h.id === hwId && h.groupId === groupId))
  if (db.homework.length === before) throw new Error('ДЗ не найдено')
  pushAudit({ action: 'homework_delete', groupId, detail: hwId, by: session.role })
  saveRaw(db)
}

export async function setOverride(groupId, payload) {
  const session = getSession()
  requireWrite(session, groupId)
  const date = sanitizeText(payload.date, 32)
  const lessonId = sanitizeText(payload.lessonId, 120)
  const type = payload.type
  const allowed = ['room_only', 'subject', 'subject_and_room', 'cancelled']
  if (!allowed.includes(type)) throw new Error('Неверный тип замены')
  if (!date || !lessonId) throw new Error('Укажите дату и пару')

  if (supabaseConfigured) {
    if (!session.token) throw new Error('Нет связи с общей базой — обнови страницу и войди снова')
    if (!db.remote) db = await loadFromSupabase()
    const { error } = await supabase.rpc('rasp_set_override', {
      p_token: session.token,
      p_group_id: groupId,
      p_lesson_id: lessonId,
      p_date: date,
      p_type: type,
      p_new_room: sanitizeText(payload.newRoom || '', LIMITS.room),
      p_new_subject: sanitizeText(payload.newSubject || '', LIMITS.subject),
      p_note: sanitizeText(payload.note || '', 200),
    })
    if (error) throw new Error(rpcErrorMessage(error))
    await refreshMutable()
    return
  }

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
  pushAudit({ action: 'override_set', groupId, detail: `${type} ${date}`, by: session.role })
  saveRaw(db)
  return row
}

export async function clearOverride(groupId, overrideId) {
  const session = getSession()
  requireWrite(session, groupId)
  if (supabaseConfigured) {
    if (!session.token) throw new Error('Нет связи с общей базой — обнови страницу и войди снова')
    const { error } = await supabase.rpc('rasp_clear_override', {
      p_token: session.token,
      p_group_id: groupId,
      p_override_id: overrideId,
    })
    if (error) throw new Error(rpcErrorMessage(error))
    await refreshMutable()
    return
  }
  db.overrides = db.overrides.filter((o) => !(o.id === overrideId && o.groupId === groupId))
  pushAudit({ action: 'override_clear', groupId, detail: overrideId, by: session.role })
  saveRaw(db)
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

  if (supabaseConfigured) {
    if (!session.token) throw new Error('Нет связи с общей базой — обнови страницу и войди снова')
    const { data, error } = await supabase.rpc('rasp_create_group', {
      p_token: session.token,
      p_name: gName,
      p_faculty: sanitizeText(faculty || '', 32),
      p_starosta_code: code,
    })
    if (error) throw new Error(rpcErrorMessage(error))
    db = await loadFromSupabase()
    return { id: data.id, name: data.name }
  }

  const starostaCodeHash = await hashAccessCode(code, CODE_SALT)
  const group = {
    id: groupIdFromName(gName),
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
  const code = sanitizeText(newCode, LIMITS.accessCode)
  if (code.length < LIMITS.minCodeLength) throw new Error(`Код: мин. ${LIMITS.minCodeLength} символов`)

  if (supabaseConfigured) {
    if (!session.token) throw new Error('Нет связи с общей базой — обнови страницу и войди снова')
    const { error } = await supabase.rpc('rasp_reset_code', {
      p_token: session.token,
      p_group_id: groupId,
      p_new_code: code,
    })
    if (error) throw new Error(rpcErrorMessage(error))
    return
  }
  const g = getGroup(groupId)
  if (!g) throw new Error('Группа не найдена')
  g.starostaCodeHash = await hashAccessCode(code, CODE_SALT)
  pushAudit({ action: 'code_reset', groupId, by: 'admin' })
  saveRaw(db)
}

export async function resetSemester(groupId) {
  const session = getSession()
  if (!session || session.role !== 'admin') throw new Error('Только админ')
  if (supabaseConfigured) {
    if (!session.token) throw new Error('Нет связи с общей базой — обнови страницу и войди снова')
    const { error } = await supabase.rpc('rasp_reset_semester', {
      p_token: session.token,
      p_group_id: groupId,
    })
    if (error) throw new Error(rpcErrorMessage(error))
    db = await loadFromSupabase()
    return
  }
  db.lessons = db.lessons.filter((l) => l.groupId !== groupId)
  db.overrides = db.overrides.filter((o) => o.groupId !== groupId)
  db.homework = db.homework.filter((h) => h.groupId !== groupId)
  pushAudit({ action: 'semester_reset', groupId, by: 'admin' })
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
