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
import {
  supabase,
  supabaseConfigured,
  rpcErrorMessage,
  withTimeout,
  toDirectStorageUrl,
} from './supabase.js'

const STORAGE_KEY = 'rasp_db_v4'
const DB_VERSION = 4
const OFFLINE_SNAP_KEY = 'rasp_offline_snap_v1'
const SESSION_KEY = 'rasp_session_v3'
const SESSION_LEGACY_KEY = 'rasp_session_v2'
const CODE_SALT = 'chuikov-rasp-v1'
/** «Вечная» сессия (клиент). Сервер: access_rooms_bans_session.sql → 100 years */
const SESSION_MS = 100 * 365 * 24 * 60 * 60 * 1000
const LOCAL_BAN_KEY = 'rasp_device_ban_v1'

const OFFLINE_MSG =
  'Сейчас нет интернета на телефоне — показаны сохранённые данные. Когда сеть появится, ДЗ и замены обновятся сами.'
const UPDATING_MSG = 'Обновляем данные…'

function networkLooksOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function saveOfflineSnap(data) {
  if (!data?.groups?.length) return
  try {
    localStorage.setItem(
      OFFLINE_SNAP_KEY,
      JSON.stringify({
        version: DB_VERSION,
        savedAt: Date.now(),
        semesterLabel: data.semesterLabel,
        siteEnabled: data.siteEnabled !== false,
        closedMessage: data.closedMessage || '',
        groups: data.groups,
        lessons: data.lessons,
        homework: data.homework,
        overrides: data.overrides,
      }),
    )
  } catch {
    /* quota */
  }
}

function loadOfflineSnap() {
  try {
    const raw = JSON.parse(localStorage.getItem(OFFLINE_SNAP_KEY) || 'null')
    if (!raw || !raw.groups?.length) return null
    return {
      version: DB_VERSION,
      semesterLabel: raw.semesterLabel || '',
      siteEnabled: raw.siteEnabled !== false,
      closedMessage: raw.closedMessage || '',
      adminCodeHash: '',
      groups: raw.groups,
      lessons: raw.lessons || [],
      homework: raw.homework || [],
      overrides: raw.overrides || [],
      audit: [],
      remote: false,
      offline: true,
      connectionError: OFFLINE_MSG,
      savedAt: raw.savedAt,
    }
  } catch {
    return null
  }
}

function readSessionRaw() {
  try {
    const cur = localStorage.getItem(SESSION_KEY)
    if (cur) return cur
    const legacy = sessionStorage.getItem(SESSION_LEGACY_KEY) || localStorage.getItem(SESSION_LEGACY_KEY)
    if (legacy) {
      localStorage.setItem(SESSION_KEY, legacy)
      try {
        sessionStorage.removeItem(SESSION_LEGACY_KEY)
        localStorage.removeItem(SESSION_LEGACY_KEY)
      } catch {
        /* ignore */
      }
      return legacy
    }
  } catch {
    /* ignore */
  }
  return null
}

function writeSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  try {
    sessionStorage.removeItem(SESSION_LEGACY_KEY)
  } catch {
    /* ignore */
  }
}

function clearSessionStorage() {
  try {
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(SESSION_LEGACY_KEY)
    sessionStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(SESSION_LEGACY_KEY)
  } catch {
    /* ignore */
  }
}

/** Раньше был broadcast через Realtime WS — через прокси рвался и лагал. Синк = опрос. */
export function startPeersChannel() {
  return null
}

export async function notifyPeers() {
  /* no-op: poll подхватит */
}

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
}

const ALLOWED_FILE_EXT = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif',
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'rtf', 'odt', 'odp',
])

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/jpg',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.presentation',
])

const MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text',
  odp: 'application/vnd.oasis.opendocument.presentation',
}

function normalizeAttachments(raw, legacyImages = []) {
  const out = []
  const seen = new Set()
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const url = typeof item.url === 'string' ? item.url : ''
      if (!url.startsWith('https://') && !url.startsWith('http://')) continue
      if (seen.has(url)) continue
      seen.add(url)
      out.push({
        url,
        name: sanitizeText(item.name || 'файл', 120) || 'файл',
        mime: sanitizeText(item.mime || '', 120),
      })
    }
  }
  // Раньше images игнорировались, если attachments не пустой — из‑за этого
  // в сетке могло быть 4 превью (часть из кэша/images), а в lightbox 3.
  if (Array.isArray(legacyImages)) {
    for (const url of legacyImages) {
      if (typeof url !== 'string') continue
      if (!url.startsWith('https://') && !url.startsWith('http://')) continue
      if (seen.has(url)) continue
      seen.add(url)
      out.push({ url, name: 'фото', mime: 'image/jpeg' })
    }
  }
  return out.slice(0, 8)
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
    // Admin code never shipped for offline brute-force; remote login uses server.
    adminCodeHash: '',
    groups,
    lessons,
    overrides: [],
    homework: [],
    audit: [],
    remote: false,
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function loadFromSupabase() {
  // Пары всегда из seed (уже в телефоне). С сервера — только группы + ДЗ + замены.
  const seed = buildLocalSeed()

  // Группы не обязательны с сервера: при сбое берём seed
  let groups = seed.groups.map((g) => ({
    id: g.id,
    name: g.name,
    faculty: g.faculty || '',
    active: true,
    starostaCodeHash: '',
  }))
  let semesterLabel = SEMESTER_LABEL
  // Optimistic: не показываем «сайт выключен», пока сервер явно не сказал false.
  // Иначе при медленной сети/прокси мигает заглушка и админ-баннер.
  let siteEnabled = true
  let closedMessage = 'Сайт временно закрыт. Зайдите позже.'
  try {
    const snap = loadOfflineSnap()
    if (snap && typeof snap.siteEnabled === 'boolean') siteEnabled = snap.siteEnabled !== false
  } catch {
    /* ignore */
  }

  try {
    const [metaRes, groupsRes] = await withTimeout(
      Promise.all([
        supabase.rpc('rasp_public_meta'),
        supabase.from('groups').select('id,name,faculty,active').eq('active', true),
      ]),
      10000,
      'групп',
    )
    if (!groupsRes.error && groupsRes.data?.length) {
      groups = groupsRes.data.map((g) => ({
        id: g.id,
        name: g.name,
        faculty: g.faculty || '',
        active: g.active,
        starostaCodeHash: '',
      }))
    }
    let meta = metaRes.data
    if (typeof meta === 'string') {
      try {
        meta = JSON.parse(meta)
      } catch {
        /* keep */
      }
    }
    if (Array.isArray(meta)) meta = meta[0]
    if (meta?.semesterLabel) semesterLabel = meta.semesterLabel
    if (meta && typeof meta.siteEnabled === 'boolean') siteEnabled = meta.siteEnabled
    else if (meta && typeof meta.siteenabled === 'boolean') siteEnabled = meta.siteenabled
    if (meta?.closedMessage || meta?.closedmessage) {
      closedMessage = meta.closedMessage || meta.closedmessage
    }
  } catch {
    /* seed groups OK */
  }

  const groupIds = new Set(groups.map((g) => g.id))
  const lessons = seed.lessons.filter((l) => groupIds.has(l.groupId))

  let homework = []
  let overrides = []
  try {
    const [hwRes, ovrRes] = await withTimeout(
      Promise.all([
        supabase
          .from('homework')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase.from('overrides').select('id,group_id,lesson_id,on_date,type,new_room,new_subject,note'),
      ]),
      12000,
      'ДЗ',
    )
    if (!hwRes.error) {
      homework = (hwRes.data || []).map((h) => mapHomeworkRow(h))
    }
    if (!ovrRes.error) {
      overrides = (ovrRes.data || []).map((o) => ({
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
  } catch {
    const snap = loadOfflineSnap()
    homework = snap?.homework || []
    overrides = snap?.overrides || []
  }

  return {
    version: DB_VERSION,
    semesterLabel,
    siteEnabled,
    closedMessage,
    adminCodeHash: '',
    groups,
    lessons,
    homework,
    overrides,
    audit: [],
    remote: true,
    offline: false,
    savedAt: Date.now(),
  }
}

async function loadFromSupabaseWithRetry() {
  let lastErr
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await loadFromSupabase()
    } catch (e) {
      lastErr = e
      if (attempt < 3) await sleep(1200)
    }
  }
  throw lastErr
}

let reconnectTimer = null
function startBackgroundReconnect() {
  if (reconnectTimer || typeof window === 'undefined') return
  reconnectTimer = setInterval(() => {
    tryReconnect().then((ok) => {
      if (ok) {
        clearInterval(reconnectTimer)
        reconnectTimer = null
        window.dispatchEvent(new CustomEvent('rasp-reconnected'))
      }
    })
  }, 8000)
}

function baseFromSeedAndSnap() {
  const seed = buildLocalSeed()
  const snap = loadOfflineSnap()
  // Нет кэша → считаем сайт открытым (не мигаем заглушкой до ответа сервера).
  // В кэше false только если сервер уже подтверждал выключение.
  const siteEnabled = snap ? snap.siteEnabled !== false : true
  return {
    version: DB_VERSION,
    semesterLabel: snap?.semesterLabel || seed.semesterLabel,
    siteEnabled,
    closedMessage: snap?.closedMessage || 'Сайт временно закрыт. Зайдите позже.',
    adminCodeHash: seed.adminCodeHash || '',
    groups: snap?.groups?.length ? snap.groups : seed.groups,
    lessons: snap?.lessons?.length ? snap.lessons : seed.lessons,
    homework: snap?.homework || [],
    overrides: snap?.overrides || [],
    audit: [],
    remote: true,
    offline: false,
    connectionError: null,
    quietSync: true,
    savedAt: snap?.savedAt || null,
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
  if (data.remote) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

let db = null

export function isRemoteMode() {
  return !!(db && db.remote && !db.offline)
}

export function isOfflineMode() {
  // Баннер «нет связи» только когда браузер сам говорит, что сети нет
  return !!(db && (db.offline || networkLooksOffline()))
}

export function getConnectionError() {
  if (networkLooksOffline()) return OFFLINE_MSG
  // Не пугаем, если LTE есть, а сервер просто долго отвечает
  return null
}

export function getOfflineSavedAt() {
  return db?.savedAt || null
}

export function bootFromCache() {
  if (db?.groups?.length) return true
  db = baseFromSeedAndSnap()
  return true
}

export async function initStore() {
  if (supabaseConfigured) {
    if (!db?.groups?.length) db = baseFromSeedAndSnap()

    try {
      const remote = await loadFromSupabase()
      db = remote
      db.offline = false
      db.quietSync = false
      db.connectionError = null
      saveOfflineSnap(db)
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        /* ignore */
      }
      return db
    } catch (e) {
      console.warn('Supabase load failed', e)
      if (!db?.groups?.length) db = baseFromSeedAndSnap()
      db.quietSync = false
      // Расписание уже на экране из seed/кэша — не орём «нет связи» при живом LTE
      if (networkLooksOffline()) {
        db.offline = true
        db.connectionError = OFFLINE_MSG
      } else {
        db.offline = false
        db.connectionError = null
        db.remote = true
      }
      startBackgroundReconnect()
      return db
    }
  }
  db = loadRaw()
  if (!db || db.version !== DB_VERSION || db.remote) {
    db = buildLocalSeed()
    saveRaw(db)
  }
  db.connectionError = null
  db.offline = false
  return db
}

export async function goOfflineUi() {
  if (!db) return
  if (!networkLooksOffline()) {
    // LTE «есть», просто фоновый ретрай — без красной плашки
    startBackgroundReconnect()
    return
  }
  db.offline = true
  db.connectionError = OFFLINE_MSG
  startBackgroundReconnect()
}

export async function tryReconnect() {
  if (!supabaseConfigured) return false
  try {
    const next = await loadFromSupabase()
    db = next
    db.offline = false
    db.connectionError = null
    db.quietSync = false
    saveOfflineSnap(db)
    if (reconnectTimer) {
      clearInterval(reconnectTimer)
      reconnectTimer = null
    }
    return true
  } catch {
    return false
  }
}

export async function refreshMutable(groupIdHint = null) {
  if (!supabaseConfigured || !db) return false
  const gid =
    groupIdHint ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('rasp_selected_group_v3') : '') ||
    ''

  let hwQ = supabase.from('homework').select('*').order('created_at', { ascending: false }).limit(400)
  let ovrQ = supabase.from('overrides').select('*').order('on_date', { ascending: false }).limit(400)
  if (gid) {
    hwQ = hwQ.eq('group_id', gid)
    ovrQ = ovrQ.eq('group_id', gid)
  }

  const [hwRes, ovrRes] = await Promise.all([hwQ, ovrQ])
  if (hwRes.error) throw hwRes.error
  if (ovrRes.error) throw ovrRes.error

  const mappedHw = (hwRes.data || []).map((h) => mapHomeworkRow(h))
  const mappedOvr = (ovrRes.data || []).map((o) => ({
    id: o.id,
    groupId: o.group_id,
    lessonId: o.lesson_id,
    date: o.on_date,
    type: o.type,
    newRoom: o.new_room || '',
    newSubject: o.new_subject || '',
    note: o.note || '',
  }))

  if (gid) {
    // Keep other groups' cached rows; replace only current group (less load + no flicker).
    db.homework = [...(db.homework || []).filter((h) => h.groupId !== gid), ...mappedHw]
    db.overrides = [...(db.overrides || []).filter((o) => o.groupId !== gid), ...mappedOvr]
  } else {
    db.homework = mappedHw
    db.overrides = mappedOvr
  }
  db.remote = true
  db.offline = false
  db.connectionError = null
  db.savedAt = Date.now()
  saveOfflineSnap(db)
  return true
}

export function getDefaultGroupId() {
  // Не подставляем «любимую» группу — человек сам выбирает при входе
  return ''
}

export function getDb() {
  return db
}

/** Natural order: ПД1, ПД2 … ПД9, ПД10 (not ПД1, ПД10, ПД2) */
export function listGroups() {
  return [...db.groups]
    .filter((g) => g.active)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' }))
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

function normalizeTeacherKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.\u00a0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Уникальные ФИО преподавателей из расписания всех групп */
export function listTeachers() {
  if (!db?.lessons) return []
  const map = new Map()
  for (const l of db.lessons) {
    const name = String(l.teacher || '').trim()
    if (!name) continue
    const key = normalizeTeacherKey(name)
    if (!map.has(key)) map.set(key, name)
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' }))
}

function teacherMatchesQuery(teacher, query) {
  const t = normalizeTeacherKey(teacher)
  const q = normalizeTeacherKey(query)
  if (!q || !t) return false
  if (t === q) return true
  if (t.includes(q)) return true
  const last = t.split(' ')[0] || ''
  const qParts = q.split(' ').filter(Boolean)
  const qLast = qParts[0] || ''
  // Выбрано полное ФИО («батурин е в») — только эта фамилия
  if (qParts.length > 1) return last === qLast
  // Частичный ввод: «бат» → Батурин / Батриев; «батурин» → только Батурин
  return last.startsWith(q)
}

/** Подсказки ФИО по вводу */
export function suggestTeachers(query, limit = 10) {
  const q = normalizeTeacherKey(query)
  if (!q) return []
  return listTeachers()
    .filter((name) => teacherMatchesQuery(name, q))
    .slice(0, limit)
}

/**
 * Пары преподавателя на дату по всем группам (с учётом замен).
 * @returns {{ dayNum: number, slots: object[] }}
 */
export function findTeacherSlots(query, dateStr) {
  const q = normalizeTeacherKey(query)
  if (!db?.lessons || q.length < 1 || !dateStr) return { dayNum: 0, slots: [] }

  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).slice(0, 10))
  if (!m) return { dayNum: 0, slots: [] }
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
  const js = dt.getDay()
  const dayNum = js === 0 ? 7 : js

  // Если ввод совпадает с полным ФИО из базы — ищем только его
  const exactTeacher = listTeachers().find((name) => normalizeTeacherKey(name) === q)
  const qLast = q.split(' ').filter(Boolean)[0] || ''

  const groupsById = new Map((db.groups || []).map((g) => [g.id, g]))
  const slots = []

  for (const lesson of db.lessons) {
    if (Number(lesson.day) !== dayNum) continue
    const teacher = String(lesson.teacher || '').trim()
    if (!teacher) continue
    if (exactTeacher) {
      if (normalizeTeacherKey(teacher) !== q) continue
    } else if (q.split(' ').filter(Boolean).length > 1) {
      // «батурин е» и т.п. — по фамилии
      if (normalizeTeacherKey(teacher).split(' ')[0] !== qLast) continue
    } else if (!teacherMatchesQuery(teacher, q)) {
      continue
    }
    const ovList = getOverridesForDate(lesson.groupId, dateStr)
    const ov = ovList.find((o) => o.lessonId === lesson.id)
    const view = resolveLesson(lesson, ov)
    const group = groupsById.get(lesson.groupId)
    slots.push({
      teacher,
      start: lesson.start,
      end: lesson.end,
      subject: view.effectiveSubject,
      room: view.effectiveRoom || (lesson.remote ? 'дистанционно' : ''),
      groupName: group?.name || '',
      cancelled: !!view.cancelled,
      overrideType: view.overrideType,
      subjectChanged: view.overrideType === 'subject' || view.overrideType === 'subject_and_room',
      note: ov?.note || view.note || '',
      remote: !!lesson.remote && !view.effectiveRoom,
    })
  }

  slots.sort(
    (a, b) =>
      a.start.localeCompare(b.start) ||
      a.groupName.localeCompare(b.groupName, 'ru', { numeric: true }) ||
      a.teacher.localeCompare(b.teacher, 'ru'),
  )
  return { dayNum, slots }
}

/** Ближайшие дни с парами этого препода (включая fromDate). */
export function findTeacherUpcoming(query, fromDate, horizonDays = 14) {
  const q = normalizeTeacherKey(query)
  if (!q || !fromDate) return []
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fromDate).slice(0, 10))
  if (!m) return []
  const base = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
  const out = []
  for (let i = 0; i < horizonDays; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const { dayNum, slots } = findTeacherSlots(q, iso)
    if (!slots.length) continue
    out.push({ date: iso, dayNum, slots })
  }
  return out
}

function normalizeRoomKey(room) {
  return String(room || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim()
}

function isUsableRoom(room, remote) {
  const r = String(room || '').trim()
  if (!r) return false
  const key = normalizeRoomKey(r)
  if (!key) return false
  if (key === 'дистанционно' || key === 'дистант' || key === 'online' || key === 'онлайн') return false
  if (remote && !r) return false
  return true
}

/** Все аудитории из расписания (уникальные). */
export function listScheduleRooms() {
  if (!db?.lessons) return []
  const map = new Map()
  for (const l of db.lessons) {
    if (!isUsableRoom(l.room, l.remote)) continue
    const r = String(l.room).trim()
    const key = normalizeRoomKey(r)
    if (!map.has(key)) map.set(key, r)
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }))
}

/** Уникальные слоты пар на дату (по start–end из расписания этого дня недели). */
export function listDayPairSlots(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').slice(0, 10))
  if (!m || !db?.lessons) return []
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
  const js = dt.getDay()
  const dayNum = js === 0 ? 7 : js
  if (dayNum === 7) return []
  const map = new Map()
  for (const l of db.lessons) {
    if (Number(l.day) !== dayNum) continue
    const start = String(l.start || '').trim()
    const end = String(l.end || '').trim()
    if (!start || !end) continue
    const key = `${start}|${end}`
    if (!map.has(key)) map.set(key, { start, end, key })
  }
  return [...map.values()].sort((a, b) => a.start.localeCompare(b.start))
}

/**
 * Занятость аудиторий на дату в слоте start–end (с учётом замен).
 * @returns {{ dayNum: number, free: string[], busy: { room: string, lessons: object[] }[] }}
 */
export function findFreeRooms(dateStr, start, end) {
  const empty = { dayNum: 0, free: [], busy: [] }
  if (!db?.lessons || !dateStr || !start || !end) return empty
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).slice(0, 10))
  if (!m) return empty
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
  const js = dt.getDay()
  const dayNum = js === 0 ? 7 : js
  if (dayNum === 7) return { dayNum, free: [], busy: [] }

  const allRooms = listScheduleRooms()
  const groupsById = new Map((db.groups || []).map((g) => [g.id, g]))
  const busyMap = new Map()

  for (const lesson of db.lessons) {
    if (Number(lesson.day) !== dayNum) continue
    if (String(lesson.start) !== String(start) || String(lesson.end) !== String(end)) continue
    const ovList = getOverridesForDate(lesson.groupId, dateStr)
    const ov = ovList.find((o) => o.lessonId === lesson.id)
    const view = resolveLesson(lesson, ov)
    if (view.cancelled) continue
    const room = String(view.effectiveRoom || '').trim()
    if (!isUsableRoom(room, lesson.remote && !room)) continue
    const key = normalizeRoomKey(room)
    const group = groupsById.get(lesson.groupId)
    const row = {
      room,
      start: lesson.start,
      end: lesson.end,
      subject: view.effectiveSubject,
      teacher: String(lesson.teacher || '').trim(),
      groupName: group?.name || '',
    }
    if (!busyMap.has(key)) busyMap.set(key, { room, lessons: [] })
    busyMap.get(key).lessons.push(row)
  }

  const busy = [...busyMap.values()].sort((a, b) =>
    a.room.localeCompare(b.room, 'ru', { numeric: true }),
  )
  const busyKeys = new Set(busyMap.keys())
  const free = allRooms.filter((r) => !busyKeys.has(normalizeRoomKey(r)))

  return { dayNum, free, busy }
}

export function getHomework(groupId, { subject, fromDate } = {}) {
  return db.homework
    .filter((h) => {
      if (h.groupId !== groupId) return false
      if (subject && h.subject !== subject) return false
      if (fromDate && h.dueDate && h.dueDate < fromDate) return false
      return true
    })
    .sort((a, b) => {
      const ca = String(a.createdAt || '')
      const cb = String(b.createdAt || '')
      if (ca !== cb) return cb.localeCompare(ca)
      return String(b.id || '').localeCompare(String(a.id || ''))
    })
}

function pushAudit(entry) {
  db.audit.unshift({ id: uid('aud'), at: new Date().toISOString(), ...entry })
  db.audit = db.audit.slice(0, 200)
}

/** Sentinel для кода с правами на все группы (админка → «Все группы»). */
export const ALL_GROUPS_ID = '__all__'

function sessionCanWriteGroup(session, groupId) {
  if (!session) return false
  if (session.role === 'admin') return true
  if (session.role === 'starosta' && session.allGroups) return true
  return session.role === 'starosta' && session.groupId === groupId
}

function requireWrite(session, groupId) {
  if (networkLooksOffline()) {
    throw new Error('Нет интернета — сейчас только просмотр. Когда сеть появится, данные обновятся.')
  }
  if (!session) throw new Error('Нужен вход старосты или админа')
  if (sessionCanWriteGroup(session, groupId)) return
  throw new Error('Нет прав на эту группу')
}

export function getSession() {
  try {
    const raw = readSessionRaw()
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!s) return null
    if (s.expiresAt && Date.now() > s.expiresAt) {
      // старые 30-дневные сессии: тихо продлеваем локально (сервер всё равно проверит)
      s.expiresAt = Date.now() + SESSION_MS
      writeSession(s)
    }
    return s
  } catch {
    return null
  }
}

export function isLocalDeviceBanned() {
  try {
    const raw = localStorage.getItem(LOCAL_BAN_KEY)
    if (!raw) return false
    const j = JSON.parse(raw)
    return !!(j && j.banned)
  } catch {
    return !!localStorage.getItem(LOCAL_BAN_KEY)
  }
}

/** Текст причины бана с устройства (если админ указал). */
export function getLocalBanReason() {
  try {
    const raw = localStorage.getItem(LOCAL_BAN_KEY)
    if (!raw) return ''
    const j = JSON.parse(raw)
    return sanitizeText(j?.reason || '', 200)
  } catch {
    return ''
  }
}

export function markLocalDeviceBanned(extra = {}) {
  try {
    localStorage.setItem(
      LOCAL_BAN_KEY,
      JSON.stringify({ banned: true, at: Date.now(), ...extra }),
    )
  } catch {
    /* ignore */
  }
}

export function clearLocalDeviceBanned() {
  try {
    localStorage.removeItem(LOCAL_BAN_KEY)
  } catch {
    /* ignore */
  }
}

function looksLikeBanError(err) {
  const msg = String(err?.message || err || '').toLowerCase()
  return (
    msg.includes('закрыт') ||
    msg.includes('заблокирован') ||
    msg.includes('device') ||
    msg.includes('banned')
  )
}

function payloadCanFreeRooms(payload, role, fallback = false) {
  if (role === 'admin') return true
  return (
    payload?.canFreeRooms === true ||
    payload?.canfreerooms === true ||
    payload?.can_free_rooms === true ||
    !!fallback
  )
}

/** Сервер: бан этого браузера (visitor_id). */
export async function refreshDeviceBanStatus() {
  if (!supabaseConfigured || !supabase) return isLocalDeviceBanned()
  if (networkLooksOffline()) return isLocalDeviceBanned()
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('rasp_device_status', { p_visitor_id: getVisitorId() }),
      8000,
      'проверки устройства',
    )
    if (error) return isLocalDeviceBanned()
    let payload = data
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload)
      } catch {
        payload = null
      }
    }
    if (Array.isArray(payload)) payload = payload[0]
    if (payload?.banned === true) {
      markLocalDeviceBanned({
        codeId: payload.codeId || payload.codeid || null,
        label: payload.label || '',
        reason: sanitizeText(payload.reason || payload.banReason || payload.ban_reason || '', 200),
      })
      return true
    }
    clearLocalDeviceBanned()
    return false
  } catch {
    return isLocalDeviceBanned()
  }
}

/** Сервер сказал, что сессии больше нет (код отозван / бан) — чистим локально. */
export async function validateRemoteSession() {
  const s = getSession()
  if (!s?.token || !supabaseConfigured) return s
  if (networkLooksOffline()) return s
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('rasp_session', {
        p_token: s.token,
        p_visitor_id: getVisitorId(),
      }),
      8000,
      'проверки сессии',
    )
    if (error) return s
    let payload = data
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload)
      } catch {
        payload = null
      }
    }
    if (Array.isArray(payload)) payload = payload[0]
    if (!payload || !payload.token) {
      clearSessionStorage()
      try {
        await refreshDeviceBanStatus()
      } catch {
        /* ignore */
      }
      return null
    }
    const allGroups =
      payload.allGroups === true ||
      payload.allgroups === true ||
      payload.all_groups === true ||
      payload.role === 'admin' ||
      s.allGroups === true
    const next = {
      ...s,
      role: payload.role || s.role,
      groupId: payload.groupId || payload.groupid || s.groupId,
      allGroups: !!allGroups,
      canFreeRooms: payloadCanFreeRooms(payload, payload.role || s.role, s.canFreeRooms),
      label: payload.label != null ? sanitizeText(payload.label, 64) : s.label,
      roleTitle:
        payload.roleTitle != null || payload.roletitle != null || payload.role_title != null
          ? sanitizeText(payload.roleTitle || payload.roletitle || payload.role_title || '', 32)
          : s.roleTitle || '',
      codeId: payload.codeId || payload.codeid || s.codeId || null,
      avatarUrl:
        payload.avatarUrl != null || payload.avatarurl != null
          ? sanitizeText(payload.avatarUrl || payload.avatarurl || '', 500)
          : s.avatarUrl || '',
      expiresAt: Date.now() + SESSION_MS,
    }
    if (next.role === 'student') {
      next.roleTitle = 'Студент'
      next.studentId = next.codeId
      next.allGroups = false
      next.canFreeRooms = false
    }
    writeSession(next)
    return next
  } catch {
    return s
  }
}

export function canUseFreeRooms(session = getSession()) {
  if (!session) return false
  if (session.role === 'admin') return true
  return !!session.canFreeRooms
}

/** Сколько секунд ещё нельзя входить (0 — не заблокировано/миграция не применена). */
export async function fetchLoginWaitSeconds() {
  if (!supabaseConfigured || !supabase) return 0
  try {
    const { data, error } = await withTimeout(supabase.rpc('rasp_login_wait'), 6000, 'таймера входа')
    if (error) return 0
    let payload = data
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload)
      } catch {
        return 0
      }
    }
    if (Array.isArray(payload)) payload = payload[0]
    const sec = Number(payload?.seconds ?? payload?.Seconds ?? 0)
    return Number.isFinite(sec) && sec > 0 ? Math.ceil(sec) : 0
  } catch {
    return 0
  }
}

export async function logout() {
  const s = getSession()
  if (s?.token && supabaseConfigured) {
    await supabase.rpc('rasp_logout', { p_token: s.token })
  }
  clearSessionStorage()
}

async function loginAsStudent(clean, who = '') {
  const { data, error } = await withTimeout(
    supabase.rpc('rasp_student_login', {
      p_code: clean,
      p_visitor_id: getVisitorId(),
      p_who: who || null,
    }),
    15000,
    'входа студента',
  )
  if (error) throw new Error(rpcErrorMessage(error))
  let payload = data
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      payload = null
    }
  }
  if (Array.isArray(payload)) payload = payload[0]
  if (payload?.needWho || payload?.needwho) {
    const err = new Error('Напиши фамилию — так поймём, чей это код.')
    err.needWho = true
    throw err
  }
  if (!payload?.token) throw new Error('Неверный код')
  const session = {
    role: 'student',
    groupId: payload.groupId || payload.groupid || null,
    studentId: payload.studentId || payload.studentid || payload.codeId || null,
    allGroups: false,
    canFreeRooms: false,
    token: payload.token,
    label: sanitizeText(payload.label || '', 64),
    roleTitle: 'Студент',
    codeId: payload.codeId || payload.codeid || payload.studentId || payload.studentid || null,
    avatarUrl: '',
    expiresAt: Date.now() + SESSION_MS,
  }
  writeSession(session)
  return session
}

export async function loginWithCode(code, groupIdHint = null, who = '') {
  const clean = sanitizeText(code, LIMITS.accessCode)
  const person = sanitizeText(who, 64)
  if (clean.length < LIMITS.minCodeLength) {
    throw new Error(`Код слишком короткий (мин. ${LIMITS.minCodeLength})`)
  }

  if (await refreshDeviceBanStatus()) {
    throw new Error('Доступ с этого устройства закрыт.')
  }

  if (supabaseConfigured) {
    if (networkLooksOffline()) {
      throw new Error('Нет интернета — вход нужен с сетью. Расписание можно смотреть и так.')
    }
    try {
      const { data: hint, error: hintErr } = await supabase.rpc('rasp_code_shared', { p_code: clean })
      const shared = hint?.shared === true || hint?.Shared === true
      if (!hintErr && shared && !person) {
        const err = new Error('Напиши фамилию — так поймём, чей это код.')
        err.needWho = true
        throw err
      }
    } catch (err) {
      if (err?.needWho) throw err
    }
    if (person) {
      try {
        return await loginAsStudent(clean, person)
      } catch (err) {
        if (err?.needWho) throw err
        if (!/неверный код/i.test(String(err?.message || ''))) throw err
      }
    }
    let lastErr = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { data, error } = await withTimeout(
          supabase.rpc('rasp_login', {
            p_code: clean,
            p_group_id: groupIdHint || null,
            p_visitor_id: getVisitorId(),
          }),
          15000,
          'входа',
        )
        if (error) throw new Error(rpcErrorMessage(error))
        let payload = data
        if (typeof payload === 'string') {
          try {
            payload = JSON.parse(payload)
          } catch {
            /* keep */
          }
        }
        // PostgREST иногда отдаёт json как массив из одного элемента
        if (Array.isArray(payload)) payload = payload[0]
        if (!payload || typeof payload !== 'object') throw new Error('Пустой ответ входа')
        const role = payload.role || payload.Role
        const groupId = payload.groupId || payload.groupid || payload.group_id || null
        const token = payload.token || payload.Token
        const label = sanitizeText(payload.label || payload.Label || '', 64)
        const roleTitle = sanitizeText(
          payload.roleTitle || payload.roletitle || payload.role_title || '',
          32,
        )
        const codeId = payload.codeId || payload.codeid || payload.code_id || null
        const avatarUrl = sanitizeText(payload.avatarUrl || payload.avatarurl || '', 500)
        const allGroups =
          role === 'admin' ||
          payload.allGroups === true ||
          payload.allgroups === true ||
          payload.all_groups === true
        if (!role || !token) throw new Error('Неверный код или сервер вернул пустой ответ')
        const session = {
          role,
          groupId,
          allGroups,
          canFreeRooms: payloadCanFreeRooms(payload, role),
          token,
          label,
          roleTitle,
          codeId,
          avatarUrl,
          expiresAt: Date.now() + SESSION_MS,
        }
        writeSession(session)
        try {
          const { data: live } = await supabase.rpc('rasp_session', {
            p_token: token,
            p_visitor_id: getVisitorId(),
          })
          let p = live
          if (typeof p === 'string') {
            try {
              p = JSON.parse(p)
            } catch {
              p = null
            }
          }
          if (Array.isArray(p)) p = p[0]
          if (p && typeof p === 'object') {
            session.codeId = p.codeId || p.codeid || session.codeId
            session.avatarUrl = sanitizeText(p.avatarUrl || p.avatarurl || '', 500)
            session.label = sanitizeText(p.label != null ? p.label : session.label, 64)
            session.roleTitle = sanitizeText(
              p.roleTitle != null || p.roletitle != null || p.role_title != null
                ? p.roleTitle || p.roletitle || p.role_title || ''
                : session.roleTitle,
              32,
            )
            session.allGroups =
              session.role === 'admin' ||
              p.allGroups === true ||
              p.allgroups === true ||
              p.all_groups === true ||
              session.allGroups
            session.canFreeRooms = payloadCanFreeRooms(p, session.role, session.canFreeRooms)
            writeSession(session)
          }
        } catch {
          /* ok */
        }
        // тихо подтянуть ДЗ после входа
        tryReconnect().then((ok) => {
          if (ok && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('rasp-reconnected'))
          }
        })
        return session
      } catch (e) {
        lastErr = e
        if (looksLikeBanError(e)) {
          markLocalDeviceBanned({ reason: String(e.message || '') })
          throw e
        }
        if (attempt < 3) await sleep(700 * attempt)
      }
    }
    if (lastErr && /неверный код/i.test(String(lastErr.message || ''))) {
      try {
        return await loginAsStudent(clean, person)
      } catch (studentErr) {
        if (looksLikeBanError(studentErr)) {
          markLocalDeviceBanned({ reason: String(studentErr.message || '') })
          throw studentErr
        }
        const studentMsg = String(studentErr.message || '')
        if (/rasp_student_login|does not exist|schema cache/i.test(studentMsg)) {
          throw lastErr
        }
        if (!/неверный код/i.test(studentMsg)) throw studentErr
      }
    }
    if (lastErr && /подождите|слишком много попыток/i.test(String(lastErr.message || ''))) {
      const left = await fetchLoginWaitSeconds()
      if (left > 0) {
        throw new Error(
          left >= 60
            ? `Слишком много попыток. Подождите ~${Math.ceil(left / 60)} мин.`
            : `Слишком много попыток. Подождите ${left} с.`,
        )
      }
    }
    throw lastErr || new Error('Не удалось войти')
  }

  const bucket = `login:${groupIdHint || 'any'}`
  const rate = checkRateLimit(bucket)
  if (!rate.ok) {
    throw new Error(`Слишком много попыток. Подождите ${Math.ceil(rate.retryAfterMs / 60000)} мин.`)
  }
  const hash = await hashAccessCode(clean, CODE_SALT)
  // Offline-only fallback: no admin hash in bundle. Only starosta hashes for local demo.
  if (db.adminCodeHash && timingSafeEqual(hash, db.adminCodeHash)) {
    clearRateLimit(bucket)
    const session = {
      role: 'admin',
      groupId: null,
      allGroups: true,
      label: 'Никитос',
      roleTitle: 'Админ',
      expiresAt: Date.now() + SESSION_MS,
    }
    writeSession(session)
    pushAudit({ action: 'login_admin' })
    saveRaw(db)
    return session
  }
  if (!db.globalStarostaCodes) db.globalStarostaCodes = []
  {
    const globalHit = db.globalStarostaCodes.find(
      (c) => c.active !== false && c.hash && timingSafeEqual(hash, c.hash),
    )
    if (globalHit) {
      clearRateLimit(bucket)
      const session = {
        role: 'starosta',
        groupId: null,
        allGroups: true,
        label: sanitizeText(globalHit.label || '', 64),
        roleTitle: sanitizeText(globalHit.roleTitle || '', 32),
        codeId: globalHit.id || null,
        expiresAt: Date.now() + SESSION_MS,
      }
      writeSession(session)
      pushAudit({ action: 'login_starosta', detail: 'all_groups' })
      saveRaw(db)
      return session
    }
  }
  const groups = groupIdHint ? [getGroup(groupIdHint)].filter(Boolean) : db.groups
  for (const g of groups) {
    const hashes = [
      g.starostaCodeHash,
      ...((g.starostaCodes || []).filter((c) => c.active !== false).map((c) => c.hash)),
    ].filter(Boolean)
    const codes = (g.starostaCodes || []).filter((c) => c.active !== false)
    const matched = codes.find((c) => c.hash && timingSafeEqual(hash, c.hash))
    const legacyOk = g.starostaCodeHash && timingSafeEqual(hash, g.starostaCodeHash)
    if (matched || legacyOk) {
      clearRateLimit(bucket)
      const session = {
        role: 'starosta',
        groupId: g.id,
        label: sanitizeText(matched?.label || '', 64),
        roleTitle: sanitizeText(matched?.roleTitle || '', 32),
        codeId: matched?.id || null,
        expiresAt: Date.now() + SESSION_MS,
      }
      writeSession(session)
      pushAudit({ action: 'login_starosta', groupId: g.id })
      saveRaw(db)
      return session
    }
  }
  const fail = registerFailedAttempt(bucket)
  if (fail.locked) throw new Error('Слишком много попыток. Вход заблокирован на 15 минут.')
  throw new Error('Неверный код')
}

function storageFolder(groupId) {
  // Supabase Storage rejects non-ASCII object keys (e.g. g_0903_пд3/...)
  const raw = String(groupId || 'group')
  let h = 2166136261
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const ascii = raw.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32)
  return `${ascii || 'g'}_${(h >>> 0).toString(16)}`
}

export async function uploadHomeworkFiles(groupId, files) {
  if (!supabaseConfigured || !supabase) throw new Error('Нет связи с хранилищем файлов — нужен интернет и настройка Storage')
  const session = getSession()
  if (!session?.token) throw new Error('Войди кодом старосты или админа, чтобы прикрепить файл')
  requireWrite(session, groupId)

  const list = [...files].slice(0, 8)
  if (!list.length) return []
  const folder = storageFolder(groupId)
  const attachments = []
  for (const file of list) {
    if (file.size > 20 * 1024 * 1024) throw new Error(`«${file.name}»: максимум 20 МБ`)
    const rawExt = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!ALLOWED_FILE_EXT.has(rawExt)) {
      throw new Error(`Тип .${rawExt || '?'} не поддерживается. Можно: фото, pdf, doc/docx, ppt/pptx, xls/xlsx, txt`)
    }
    let uploadBlob = file
    let mime = (file.type && ALLOWED_MIME.has(file.type) ? file.type : null) || MIME_BY_EXT[rawExt] || 'application/octet-stream'
    let outExt = rawExt
    try {
      if (/^image\/(jpeg|jpg|png|webp)$/i.test(mime) || /^(jpe?g|png|webp)$/i.test(rawExt)) {
        const compressed = await compressImageFile(file)
        if (compressed) {
          uploadBlob = compressed.blob
          mime = compressed.mime
          outExt = compressed.ext
        }
      }
    } catch {
      /* keep original */
    }
    const safeName = sanitizeText(file.name, 120) || `file.${outExt}`

    let ticket = null
    let lastTicketErr = null
    for (let tAttempt = 1; tAttempt <= 3 && !ticket; tAttempt++) {
      try {
        const { data, error } = await withTimeout(
          supabase.rpc('rasp_issue_hw_upload_ticket', {
            p_token: session.token,
            p_group_id: groupId,
            p_ext: outExt,
            p_folder: folder,
          }),
          15000,
          'билета загрузки',
        )
        if (error) throw new Error(rpcErrorMessage(error))
        let payload = data
        if (typeof payload === 'string') {
          try {
            payload = JSON.parse(payload)
          } catch {
            /* keep */
          }
        }
        if (Array.isArray(payload)) payload = payload[0]
        const path = payload?.path || payload?.object_path
        const bucket = payload?.bucket || payload?.bucket_id || 'hw-files'
        if (!path) throw new Error('Сервер не выдал путь для файла')
        ticket = { path, bucket }
      } catch (e) {
        lastTicketErr = e
        if (tAttempt < 3) await sleep(600 * tAttempt)
      }
    }
    if (!ticket) {
      const msg = lastTicketErr?.message || 'Не удалось получить разрешение на загрузку'
      if (/нужен вход|нет прав|войти|сесси/i.test(msg)) throw new Error(msg)
      if (/не найдена|does not exist|PGRST|schema cache|issue_hw_upload/i.test(msg)) {
        throw new Error('На сервере ещё нет защиты загрузок: в Supabase SQL Editor запусти secure_storage_upload.sql')
      }
      throw new Error(msg)
    }

    let error = null
    let uploaded = false
    for (let attempt = 1; attempt <= 3 && !uploaded; attempt++) {
      const res = await supabase.storage.from(ticket.bucket).upload(ticket.path, uploadBlob, {
        contentType: mime,
        upsert: false,
      })
      if (!res.error) {
        const { data } = supabase.storage.from(ticket.bucket).getPublicUrl(ticket.path)
        if (data?.publicUrl) {
          attachments.push({
            url: toDirectStorageUrl(data.publicUrl),
            name: safeName,
            mime,
          })
        }
        error = null
        uploaded = true
        break
      }
      error = res.error
      if (attempt < 3) await sleep(800 * attempt)
    }
    if (!uploaded) {
      const msg = error?.message || 'Не удалось загрузить файл'
      if (/abort|timeout|network|fetch|Failed/i.test(msg)) {
        throw new Error(`«${safeName}»: слабая сеть или таймаут. Сожми фото / попробуй ещё раз.`)
      }
      if (/invalid key/i.test(msg)) {
        throw new Error('Ошибка пути файла — обнови страницу и попробуй снова')
      }
      if (/row-level security|policy|not allowed|403/i.test(msg)) {
        throw new Error('Нет прав на загрузку (нужен вход) или в Supabase не применён secure_storage_upload.sql')
      }
      if (/bucket|not found/i.test(msg)) {
        throw new Error('Хранилище ещё не настроено: в Supabase запусти SQL admin_files_codes.sql')
      }
      throw new Error(msg)
    }
  }
  return attachments
}

/** Сжать фото перед загрузкой (меньше срывов на LTE). */
async function compressImageFile(file, maxSide = 1600, quality = 0.82) {
  if (!file || typeof createImageBitmap === 'undefined') return null
  // Для обычных ДЗ мелкие файлы не трогаем; для аватаров (maxSide меньше) — всегда ужимаем.
  if (maxSide >= 1200 && file.size < 350 * 1024) return null
  const bmp = await createImageBitmap(file)
  let { width, height } = bmp
  const scale = Math.min(1, maxSide / Math.max(width, height))
  width = Math.round(width * scale)
  height = Math.round(height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bmp.close()
    return null
  }
  ctx.drawImage(bmp, 0, 0, width, height)
  bmp.close()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) return null
  if (maxSide >= 1200 && blob.size >= file.size) return null
  return { blob, mime: 'image/jpeg', ext: 'jpg' }
}

/** @deprecated use uploadHomeworkFiles */
export async function uploadHomeworkPhotos(groupId, files) {
  return uploadHomeworkFiles(groupId, files)
}

function mapHomeworkRow(h) {
  return {
    id: h.id,
    groupId: h.group_id,
    subject: h.subject,
    text: h.body || '',
    dueDate: h.due_date || '',
    lessonId: h.lesson_id,
    createdAt: h.created_at,
    images: Array.isArray(h.images) ? h.images.filter(Boolean) : [],
    attachments: normalizeAttachments(h.attachments, h.images),
    authorCodeId: h.author_code_id || '',
    authorLabel: h.author_label || '',
    authorAvatarUrl: h.author_avatar_url || '',
  }
}

export async function uploadProfileAvatar(file) {
  if (!supabaseConfigured || !supabase) throw new Error('Нужен интернет для загрузки фото')
  let session = getSession()
  if (!session?.token) throw new Error('Сначала войди')
  // Обновим сессию (codeId), чтобы староста без code_id в кэше тоже мог поставить фото
  try {
    const fresh = await validateRemoteSession()
    if (fresh?.token) session = fresh
  } catch {
    /* ignore */
  }
  if (!file) throw new Error('Выбери фото')
  if (file.size > 8 * 1024 * 1024) throw new Error('Фото больше 8 МБ')
  const mime0 = String(file.type || '')
  if (mime0 && !/^image\/(jpeg|jpg|png|webp)$/i.test(mime0)) {
    throw new Error('Нужен JPEG, PNG или WebP')
  }

  let uploadBlob = file
  let mime = mime0 || 'image/jpeg'
  let outExt = 'jpg'
  try {
    const compressed = await compressImageFile(file, 512, 0.85)
    if (compressed) {
      uploadBlob = compressed.blob
      mime = compressed.mime
      outExt = compressed.ext
    }
  } catch {
    /* keep original */
  }

  const groupId = session.groupId || (session.role === 'admin' ? 'admin' : '')
  if (!groupId && session.role !== 'admin') {
    throw new Error('Нет группы в сессии — перезайти кодом старосты')
  }
  const folder = `avatars_${storageFolder(groupId || 'admin')}`
  let ticket = null
  let lastTicketErr = null
  for (let tAttempt = 1; tAttempt <= 3 && !ticket; tAttempt++) {
    try {
      const { data, error } = await withTimeout(
        supabase.rpc('rasp_issue_hw_upload_ticket', {
          p_token: session.token,
          p_group_id: groupId || 'admin',
          p_ext: outExt,
          p_folder: folder,
        }),
        12000,
        'билета загрузки',
      )
      if (error) throw new Error(rpcErrorMessage(error))
      let payload = data
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload)
        } catch {
          /* keep */
        }
      }
      if (Array.isArray(payload)) payload = payload[0]
      ticket = payload
    } catch (e) {
      lastTicketErr = e
      if (tAttempt < 3) await sleep(400 * tAttempt)
    }
  }
  if (!ticket) throw lastTicketErr || new Error('Не удалось получить билет загрузки')

  const bucket = ticket.bucket || ticket.Bucket || 'hw-files'
  const path = ticket.path || ticket.Path || ticket.object_path
  if (!path) throw new Error('Пустой путь загрузки')

  const { error: upErr } = await supabase.storage.from(bucket).upload(path, uploadBlob, {
    contentType: mime,
    upsert: false,
  })
  if (upErr) throw new Error(upErr.message || 'Не удалось загрузить фото')

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path)
  const url = toDirectStorageUrl(pub?.publicUrl || '')
  if (!url) throw new Error('Нет публичной ссылки на фото')

  const { data, error } = await supabase.rpc('rasp_set_avatar', {
    p_token: session.token,
    p_url: url,
  })
  if (error) throw new Error(rpcErrorMessage(error))
  const avatarUrl = data?.avatarUrl || data?.avatarurl || url
  const codeId = data?.codeId || data?.codeid || session.codeId || null
  const next = { ...session, avatarUrl, codeId: codeId || session.codeId }
  writeSession(next)
  return next
}

export async function clearProfileAvatar() {
  const session = getSession()
  if (!session?.token) throw new Error('Сначала войди')
  if (supabaseConfigured) {
    const { error } = await supabase.rpc('rasp_clear_avatar', { p_token: session.token })
    if (error) throw new Error(rpcErrorMessage(error))
  }
  const next = { ...session, avatarUrl: '' }
  writeSession(next)
  return next
}

export async function addHomework(groupId, { subject, text, dueDate, lessonId, images = [], attachments = [] }) {
  const session = getSession()
  requireWrite(session, groupId)
  const subj = sanitizeText(subject, LIMITS.subject)
  const body = sanitizeText(text, LIMITS.homework)
  const due = sanitizeText(dueDate, 32)
  const atts = normalizeAttachments(attachments.length ? attachments : images.map((url) => ({ url, name: 'фото', mime: 'image/jpeg' })))
  const imgs = atts.filter((a) => (a.mime || '').startsWith('image/')).map((a) => a.url).slice(0, 8)
  if (!subj) throw new Error('Укажите предмет')
  if (!body && !atts.length) throw new Error('Укажите текст ДЗ или прикрепите файл')

  if (supabaseConfigured) {
    if (!session.token) throw new Error('Нет связи с общей базой — обнови страницу и войди снова')
    if (!db.remote) db = await loadFromSupabase()
    const { error } = await supabase.rpc('rasp_add_homework', {
      p_token: session.token,
      p_group_id: groupId,
      p_subject: subj,
      p_body: body || ' ',
      p_due_date: due || null,
      p_lesson_id: lessonId || null,
      p_images: imgs,
      p_attachments: atts,
    })
    if (error) {
      const msg = rpcErrorMessage(error)
      if (/could not find|does not exist|p_attachments|p_images/i.test(msg)) {
        throw new Error('База ещё без поддержки файлов: запусти в Supabase SQL файл admin_files_codes.sql')
      }
      throw new Error(msg)
    }
    await refreshMutable()
    await notifyPeers('homework')
    return
  }

  const item = {
    id: uid('hw'),
    groupId,
    subject: subj,
    text: body,
    dueDate: due,
    lessonId: lessonId || null,
    images: imgs,
    attachments: atts,
    createdAt: new Date().toISOString(),
    authorCodeId: session.codeId || (session.role === 'admin' ? 'admin' : ''),
    authorLabel:
      (session.label || '').trim() ||
      (session.role === 'admin' ? 'Никитос' : 'Староста'),
    authorAvatarUrl: session.avatarUrl || '',
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
    await notifyPeers('homework_delete')
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
    await notifyPeers('override')
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
    await notifyPeers('override_clear')
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
    starostaCodes: [
      {
        id: uid('gc'),
        hash: starostaCodeHash,
        code,
        label: 'основной',
        active: true,
        createdAt: new Date().toISOString(),
      },
    ],
  }
  db.groups.push(group)
  pushAudit({ action: 'group_create', groupId: group.id, detail: gName, by: 'admin' })
  saveRaw(db)
  return group
}

/** Скрыть группу из выбора (soft-delete). Админ. */
export async function deactivateGroup(groupId) {
  const session = getSession()
  if (!session || session.role !== 'admin') throw new Error('Только админ')
  if (!groupId) throw new Error('Не выбрана группа')

  if (supabaseConfigured) {
    if (!session.token) throw new Error('Нет связи с общей базой — обнови страницу и войди снова')
    const { data, error } = await withTimeout(
      supabase.rpc('rasp_deactivate_group', {
        p_token: session.token,
        p_group_id: groupId,
      }),
      12000,
      'удаления группы',
    )
    if (error) throw new Error(rpcErrorMessage(error))
    db = await loadFromSupabase()
    return parseRpcJson(data)
  }

  const g = db.groups.find((x) => x.id === groupId)
  if (!g) throw new Error('Группа не найдена')
  g.active = false
  pushAudit({ action: 'group_deactivate', groupId, detail: g.name, by: 'admin' })
  saveRaw(db)
  return { ok: true, id: groupId, name: g.name }
}

export async function addStarostaCode(groupId, newCode, label = '', roleTitle = '') {
  const session = getSession()
  if (!session || session.role !== 'admin') throw new Error('Только админ')
  const code = sanitizeText(newCode, LIMITS.accessCode)
  const note = sanitizeText(label, 64)
  const title = sanitizeText(roleTitle, 32)
  const allGroups = groupId === ALL_GROUPS_ID
  if (!note) throw new Error('Укажи имя (Кобзева…)')
  if (code.length < LIMITS.minCodeLength) throw new Error(`Код: мин. ${LIMITS.minCodeLength} символов`)

  if (supabaseConfigured) {
    if (!session.token) throw new Error('Нет связи с общей базой — обнови страницу и войди снова')
    const { data, error } = await supabase.rpc('rasp_add_starosta_code', {
      p_token: session.token,
      p_group_id: allGroups ? ALL_GROUPS_ID : groupId,
      p_code: code,
      p_label: note,
      p_role_title: title,
    })
    if (error) throw new Error(rpcErrorMessage(error))
    return data
  }
  const hash = await hashAccessCode(code, CODE_SALT)
  const id = uid('gc')
  if (allGroups) {
    if (!db.globalStarostaCodes) db.globalStarostaCodes = []
    db.globalStarostaCodes.push({
      id,
      hash,
      code,
      label: note,
      roleTitle: title,
      allGroups: true,
      active: true,
      createdAt: new Date().toISOString(),
    })
    pushAudit({ action: 'starosta_code_add', detail: `all · ${note}`, by: 'admin' })
    saveRaw(db)
    return { id, groupId: ALL_GROUPS_ID, allGroups: true, label: note, roleTitle: title, code }
  }
  const g = getGroup(groupId)
  if (!g) throw new Error('Группа не найдена')
  if (!g.starostaCodes) g.starostaCodes = []
  g.starostaCodes.push({
    id,
    hash,
    code: code,
    label: note,
    roleTitle: title,
    active: true,
    createdAt: new Date().toISOString(),
  })
  g.starostaCodeHash = hash
  pushAudit({ action: 'starosta_code_add', groupId, detail: note, by: 'admin' })
  saveRaw(db)
  return { id, groupId, allGroups: false, label: note, roleTitle: title, code }
}

export async function listStarostaCodes() {
  const session = getSession()
  if (!session || session.role !== 'admin') throw new Error('Только админ')
  if (supabaseConfigured) {
    if (!session.token) throw new Error('Нет связи с общей базой — обнови страницу и войди снова')
    const { data, error } = await supabase.rpc('rasp_list_starosta_codes', {
      p_token: session.token,
    })
    if (error) throw new Error(rpcErrorMessage(error))
    let rows = data
    if (typeof rows === 'string') {
      try {
        rows = JSON.parse(rows)
      } catch {
        rows = []
      }
    }
    if (!Array.isArray(rows)) return []
    return rows.map((r) => {
      const allGroups =
        r.allGroups === true || r.allgroups === true || r.all_groups === true || r.groupId === ALL_GROUPS_ID
      return {
        id: r.id,
        groupId: allGroups ? ALL_GROUPS_ID : r.groupId || r.group_id,
        groupName: allGroups ? 'Все группы' : r.groupName || r.group_name || '',
        allGroups,
        label: r.label || '',
        roleTitle: r.roleTitle || r.roletitle || r.role_title || '',
        code: r.code || r.code_plain || '',
        createdAt: r.createdAt || r.created_at || '',
        active: r.active !== false,
        canFreeRooms:
          r.canFreeRooms === true || r.canfreerooms === true || r.can_free_rooms === true,
        banned: r.banned === true,
        banReason: r.banReason || r.banreason || r.ban_reason || '',
      }
    })
  }
  const out = []
  for (const c of db.globalStarostaCodes || []) {
    if (c.active === false) continue
    out.push({
      id: c.id,
      groupId: ALL_GROUPS_ID,
      groupName: 'Все группы',
      allGroups: true,
      label: c.label || '',
      roleTitle: c.roleTitle || '',
      code: c.code || '',
      createdAt: c.createdAt,
      active: true,
      canFreeRooms: !!c.canFreeRooms,
      banned: !!c.banned,
      banReason: c.banReason || '',
    })
  }
  for (const g of db.groups) {
    for (const c of g.starostaCodes || []) {
      if (c.active === false) continue
      out.push({
        id: c.id,
        groupId: g.id,
        groupName: g.name,
        allGroups: false,
        label: c.label || '',
        roleTitle: c.roleTitle || '',
        code: c.code || '',
        createdAt: c.createdAt,
        active: true,
        canFreeRooms: !!c.canFreeRooms,
        banned: !!c.banned,
        banReason: c.banReason || '',
      })
    }
  }
  return out
}

export async function setCodeFreeRooms(codeId, enabled) {
  const session = getSession()
  if (!session || session.role !== 'admin') throw new Error('Только админ')
  if (supabaseConfigured) {
    if (!session.token) throw new Error('Нет связи с общей базой — обнови страницу и войди снова')
    const { data, error } = await supabase.rpc('rasp_set_code_free_rooms', {
      p_token: session.token,
      p_code_id: codeId,
      p_enabled: !!enabled,
    })
    if (error) throw new Error(rpcErrorMessage(error))
    return data
  }
  for (const c of db.globalStarostaCodes || []) {
    if (c.id === codeId && c.active !== false) {
      c.canFreeRooms = !!enabled
      saveRaw(db)
      return { id: codeId, canFreeRooms: !!enabled }
    }
  }
  for (const g of db.groups) {
    const c = (g.starostaCodes || []).find((x) => x.id === codeId && x.active !== false)
    if (c) {
      c.canFreeRooms = !!enabled
      saveRaw(db)
      return { id: codeId, canFreeRooms: !!enabled }
    }
  }
  throw new Error('Код не найден')
}

export async function banStarostaCode(codeId, reason = '') {
  const session = getSession()
  if (!session || session.role !== 'admin') throw new Error('Только админ')
  const note = sanitizeText(reason, 200)
  if (supabaseConfigured) {
    if (!session.token) throw new Error('Нет связи с общей базой — обнови страницу и войди снова')
    const { data, error } = await supabase.rpc('rasp_ban_code', {
      p_token: session.token,
      p_code_id: codeId,
      p_reason: note || null,
    })
    if (error) throw new Error(rpcErrorMessage(error))
    return data
  }
  for (const c of db.globalStarostaCodes || []) {
    if (c.id === codeId && c.active !== false) {
      c.banned = true
      c.banReason = note
      saveRaw(db)
      return { id: codeId, banned: true, reason: note }
    }
  }
  for (const g of db.groups) {
    const c = (g.starostaCodes || []).find((x) => x.id === codeId && x.active !== false)
    if (c) {
      c.banned = true
      c.banReason = note
      saveRaw(db)
      return { id: codeId, banned: true, reason: note }
    }
  }
  throw new Error('Код не найден')
}

export async function unbanStarostaCode(codeId) {
  const session = getSession()
  if (!session || session.role !== 'admin') throw new Error('Только админ')
  if (supabaseConfigured) {
    if (!session.token) throw new Error('Нет связи с общей базой — обнови страницу и войди снова')
    const { data, error } = await supabase.rpc('rasp_unban_code', {
      p_token: session.token,
      p_code_id: codeId,
    })
    if (error) throw new Error(rpcErrorMessage(error))
    return data
  }
  for (const c of db.globalStarostaCodes || []) {
    if (c.id === codeId) {
      c.banned = false
      c.banReason = ''
      saveRaw(db)
      return { id: codeId, banned: false }
    }
  }
  for (const g of db.groups) {
    const c = (g.starostaCodes || []).find((x) => x.id === codeId)
    if (c) {
      c.banned = false
      c.banReason = ''
      saveRaw(db)
      return { id: codeId, banned: false }
    }
  }
  throw new Error('Код не найден')
}

export async function setStarostaRoleTitle(codeId, roleTitle = '') {
  const session = getSession()
  if (!session || session.role !== 'admin') throw new Error('Только админ')
  const title = sanitizeText(roleTitle, 32)
  if (supabaseConfigured) {
    if (!session.token) throw new Error('Нет связи с общей базой — обнови страницу и войди снова')
    const { data, error } = await supabase.rpc('rasp_set_starosta_role_title', {
      p_token: session.token,
      p_code_id: codeId,
      p_role_title: title,
    })
    if (error) throw new Error(rpcErrorMessage(error))
    return data
  }
  for (const c of db.globalStarostaCodes || []) {
    if (c.id === codeId && c.active !== false) {
      c.roleTitle = title
      pushAudit({ action: 'starosta_role_title', detail: `all · ${title || 'Староста'}`, by: 'admin' })
      saveRaw(db)
      return { id: codeId, roleTitle: title, groupId: ALL_GROUPS_ID, allGroups: true }
    }
  }
  for (const g of db.groups) {
    const c = (g.starostaCodes || []).find((x) => x.id === codeId && x.active !== false)
    if (c) {
      c.roleTitle = title
      pushAudit({ action: 'starosta_role_title', groupId: g.id, detail: title || 'Староста', by: 'admin' })
      saveRaw(db)
      return { id: codeId, roleTitle: title, groupId: g.id }
    }
  }
  throw new Error('Код не найден')
}

export async function revokeStarostaCode(codeId) {
  const session = getSession()
  if (!session || session.role !== 'admin') throw new Error('Только админ')
  if (supabaseConfigured) {
    if (!session.token) throw new Error('Нет связи с общей базой — обнови страницу и войди снова')
    const { error } = await supabase.rpc('rasp_revoke_starosta_code', {
      p_token: session.token,
      p_code_id: codeId,
    })
    if (error) throw new Error(rpcErrorMessage(error))
    return
  }
  for (const c of db.globalStarostaCodes || []) {
    if (c.id === codeId) {
      c.active = false
      pushAudit({ action: 'starosta_code_revoke', detail: `all · ${codeId}`, by: 'admin' })
      saveRaw(db)
      return
    }
  }
  for (const g of db.groups) {
    const c = (g.starostaCodes || []).find((x) => x.id === codeId)
    if (c) {
      c.active = false
      pushAudit({ action: 'starosta_code_revoke', groupId: g.id, detail: codeId, by: 'admin' })
      saveRaw(db)
      return
    }
  }
  throw new Error('Код не найден')
}

export async function renameStarostaLabel(codeId, label) {
  const session = getSession()
  if (!session || session.role !== 'admin') throw new Error('Только админ')
  const note = sanitizeText(label, 64)
  if (!note) throw new Error('Укажи имя человека')
  if (supabaseConfigured) {
    if (!session.token) throw new Error('Нет связи с общей базой — обнови страницу и войди снова')
    const { data, error } = await supabase.rpc('rasp_rename_starosta_label', {
      p_token: session.token,
      p_code_id: codeId,
      p_label: note,
    })
    if (error) throw new Error(rpcErrorMessage(error))
    await refreshMutable()
    await notifyPeers('label_rename')
    return data
  }
  for (const c of db.globalStarostaCodes || []) {
    if (c.id === codeId && c.active !== false) {
      c.label = note
      for (const h of db.homework || []) {
        if (h.authorCodeId === codeId) h.authorLabel = note
      }
      pushAudit({ action: 'starosta_label_rename', detail: `all · ${note}`, by: 'admin' })
      saveRaw(db)
      return { id: codeId, label: note, groupId: ALL_GROUPS_ID, allGroups: true }
    }
  }
  for (const g of db.groups) {
    const c = (g.starostaCodes || []).find((x) => x.id === codeId && x.active !== false)
    if (c) {
      c.label = note
      for (const h of db.homework || []) {
        if (h.authorCodeId === codeId) h.authorLabel = note
      }
      pushAudit({ action: 'starosta_label_rename', groupId: g.id, detail: note, by: 'admin' })
      saveRaw(db)
      return { id: codeId, label: note, groupId: g.id }
    }
  }
  throw new Error('Код не найден')
}

export async function setAdminDisplayName(name) {
  const session = getSession()
  if (!session || session.role !== 'admin') throw new Error('Только админ')
  const note = sanitizeText(name, 64)
  if (!note) throw new Error('Укажи имя')
  if (supabaseConfigured) {
    if (!session.token) throw new Error('Нет связи с общей базой — обнови страницу и войди снова')
    const { data, error } = await supabase.rpc('rasp_set_admin_display_name', {
      p_token: session.token,
      p_name: note,
    })
    if (error) throw new Error(rpcErrorMessage(error))
    const next = { ...session, label: note }
    writeSession(next)
    await refreshMutable()
    await notifyPeers('admin_name')
    return next
  }
  for (const h of db.homework || []) {
    if (h.authorCodeId === 'admin' || /^(admin|админ)$/i.test(String(h.authorLabel || '').trim())) {
      h.authorLabel = note
    }
  }
  const next = { ...session, label: note }
  writeSession(next)
  pushAudit({ action: 'admin_display_name', detail: note, by: 'admin' })
  saveRaw(db)
  return next
}

/** Админ: указать автора конкретного ДЗ (по code_id или admin). */
export async function setHomeworkAuthor(hwId, codeId) {
  const session = getSession()
  if (!session || session.role !== 'admin') throw new Error('Только админ')
  if (!hwId) throw new Error('Нет ДЗ')
  const cid = codeId == null || codeId === '' ? 'admin' : String(codeId)
  if (supabaseConfigured) {
    if (!session.token) throw new Error('Нет связи с общей базой — обнови страницу и войди снова')
    const { data, error } = await supabase.rpc('rasp_set_homework_author', {
      p_token: session.token,
      p_hw_id: hwId,
      p_code_id: cid,
    })
    if (error) {
      const msg = rpcErrorMessage(error)
      if (/could not find|does not exist|PGRST202/i.test(msg)) {
        throw new Error('Нужно выполнить SQL undo_tyushkin_claim.sql в Supabase')
      }
      throw new Error(msg)
    }
    await refreshMutable()
    await notifyPeers('homework_author')
    return data
  }
  const h = (db.homework || []).find((x) => x.id === hwId)
  if (!h) throw new Error('ДЗ не найдено')
  if (cid === 'admin') {
    h.authorCodeId = 'admin'
    h.authorLabel = (session.label || '').trim() || 'Никитос'
  } else {
    let found = null
    for (const g of db.groups) {
      const c = (g.starostaCodes || []).find((x) => x.id === cid && x.active !== false)
      if (c) {
        found = c
        break
      }
    }
    if (!found) throw new Error('Код не найден')
    h.authorCodeId = cid
    h.authorLabel = (found.label || '').trim() || 'Староста'
  }
  saveRaw(db)
  return { id: hwId, label: h.authorLabel, codeId: h.authorCodeId }
}

export async function resetStarostaCode(groupId, newCode) {
  return addStarostaCode(groupId, newCode, 'сброс')
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

const VISITOR_KEY = 'rasp_vid_v1'
const TRACKED_SESSION_KEY = 'rasp_tracked_session'

export function getVisitorId() {
  try {
    let id = localStorage.getItem(VISITOR_KEY)
    if (!id || id.length < 8) {
      id = `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
      localStorage.setItem(VISITOR_KEY, id)
    }
    return id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
  } catch {
    return `v_tmp_${Date.now().toString(36)}`
  }
}

function visitorId() {
  return getVisitorId()
}

/** Один раз за сессию вкладки — анонимный счётчик посещений */
export async function trackVisit(groupId = null) {
  if (!supabaseConfigured || !supabase) return
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(TRACKED_SESSION_KEY)) {
      return
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(TRACKED_SESSION_KEY, '1')
    }
    await supabase.rpc('rasp_track_visit', {
      p_visitor_id: visitorId(),
      p_group_id: groupId || null,
    })
  } catch {
    /* ignore — статистика не критична */
  }
}

const CLEANUP_LOCAL_KEY = 'rasp_cleanup_ping_v1'

/** Раз в сутки тихо чистит ДЗ/замены старше 8 недель (сервер сам пропускает, если уже чистил). */
export async function maybeAutoCleanup() {
  if (!supabaseConfigured || !supabase) return null
  try {
    const now = Date.now()
    const prev = Number(localStorage.getItem(CLEANUP_LOCAL_KEY) || 0)
    if (prev && now - prev < 12 * 60 * 60 * 1000) return null
    localStorage.setItem(CLEANUP_LOCAL_KEY, String(now))
    const { data, error } = await withTimeout(supabase.rpc('rasp_auto_cleanup'), 20000, 'очистки')
    if (error) return null
    let payload = data
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload)
      } catch {
        /* keep */
      }
    }
    if (Array.isArray(payload)) payload = payload[0]
    return payload && typeof payload === 'object' ? payload : null
  } catch {
    return null
  }
}

/** Админ: принудительная очистка старше N недель (мин. 8). */
export async function cleanupOldData(weeks = 8) {
  if (!supabaseConfigured || !supabase) throw new Error('Нет связи с сервером')
  const session = getSession()
  if (!session?.token || session.role !== 'admin') throw new Error('Нужен вход админа')
  const { data, error } = await withTimeout(
    supabase.rpc('rasp_cleanup_old_data', {
      p_token: session.token,
      p_weeks: Math.max(8, Number(weeks) || 8),
    }),
    30000,
    'очистки',
  )
  if (error) throw new Error(rpcErrorMessage(error))
  let payload = data
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      /* keep */
    }
  }
  if (Array.isArray(payload)) payload = payload[0]
  return payload
}

/** Только для админа */
export async function fetchSiteStats() {
  if (!supabaseConfigured || !supabase) return null
  const s = getSession()
  if (!s || s.role !== 'admin' || !s.token) return null
  const { data, error } = await supabase.rpc('rasp_site_stats', { p_token: s.token })
  if (error) throw new Error(rpcErrorMessage(error))
  let payload = data
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      /* keep */
    }
  }
  return payload && typeof payload === 'object' ? payload : null
}

function parseRpcJson(data) {
  let payload = data
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      /* keep */
    }
  }
  if (Array.isArray(payload)) payload = payload[0]
  return payload
}

/** Обращения в поддержку (админ) */
export async function fetchSupportTickets(limit = 50) {
  if (!supabaseConfigured || !supabase) return { openCount: 0, total: 0, items: [] }
  const s = getSession()
  if (!s || s.role !== 'admin' || !s.token) throw new Error('Нужен вход админа')
  const { data, error } = await withTimeout(
    supabase.rpc('rasp_support_list', { p_token: s.token, p_limit: limit }),
    12000,
    'обращений',
  )
  if (error) throw new Error(rpcErrorMessage(error))
  const payload = parseRpcJson(data) || {}
  const items = Array.isArray(payload.items) ? payload.items : []
  return {
    openCount: Number(payload.openCount ?? payload.opencount ?? 0),
    total: Number(payload.total ?? items.length),
    items: items.map((t) => ({
      id: t.id,
      tgUserId: String(t.tgUserId || t.tg_user_id || ''),
      tgUsername: t.tgUsername || t.tg_username || '',
      tgName: t.tgName || t.tg_name || '',
      body: t.body || '',
      status: t.status || 'open',
      answer: t.answer || '',
      pendingSend: !!(t.pendingSend ?? t.pending_send),
      createdAt: t.createdAt || t.created_at || '',
      answeredAt: t.answeredAt || t.answered_at || '',
    })),
  }
}

export async function replySupportTicket(id, text) {
  if (!supabaseConfigured || !supabase) throw new Error('Нет связи с сервером')
  const s = getSession()
  if (!s?.token || s.role !== 'admin') throw new Error('Нужен вход админа')
  const { data, error } = await withTimeout(
    supabase.rpc('rasp_support_reply', {
      p_token: s.token,
      p_id: id,
      p_text: text,
    }),
    12000,
    'ответа',
  )
  if (error) throw new Error(rpcErrorMessage(error))
  return parseRpcJson(data)
}

export async function deleteSupportTicket(id) {
  if (!supabaseConfigured || !supabase) throw new Error('Нет связи с сервером')
  const s = getSession()
  if (!s?.token || s.role !== 'admin') throw new Error('Нужен вход админа')
  const { error } = await withTimeout(
    supabase.rpc('rasp_support_delete', { p_token: s.token, p_id: id }),
    12000,
    'удаления',
  )
  if (error) throw new Error(rpcErrorMessage(error))
}

export async function deleteAllSupportTickets() {
  if (!supabaseConfigured || !supabase) throw new Error('Нет связи с сервером')
  const s = getSession()
  if (!s?.token || s.role !== 'admin') throw new Error('Нужен вход админа')
  const { data, error } = await withTimeout(
    supabase.rpc('rasp_support_delete_all', { p_token: s.token }),
    15000,
    'удаления обращений',
  )
  if (error) throw new Error(rpcErrorMessage(error))
  return parseRpcJson(data)
}

/** Журнал действий с сервера (только админ) */
export async function fetchAuditLog(limit = 80) {
  if (!supabaseConfigured || !supabase) return []
  const s = getSession()
  if (!s || s.role !== 'admin' || !s.token) return []
  const { data, error } = await supabase.rpc('rasp_list_audit', {
    p_token: s.token,
    p_limit: limit,
  })
  if (error) throw new Error(rpcErrorMessage(error))
  let rows = data
  if (typeof rows === 'string') {
    try {
      rows = JSON.parse(rows)
    } catch {
      rows = []
    }
  }
  if (!Array.isArray(rows)) return []
  return rows.map((a) => ({
    id: a.id,
    at: a.at,
    action: a.action || '',
    groupId: a.groupId || a.group_id || '',
    detail: a.detail || '',
    byRole: a.byRole || a.by_role || '',
    ip: a.ip || '',
    visitorId: a.visitorId || a.visitor_id || '',
    suspicious: !!(a.suspicious),
  }))
}

export function getSemesterLabel() {
  return db.semesterLabel || ''
}

export function isSiteEnabled() {
  // До инициализации не показываем заглушку.
  if (!db) return true
  return db.siteEnabled !== false
}

export function getClosedMessage() {
  return (
    (db && db.closedMessage) ||
    'Сайт временно закрыт. Зайдите позже.'
  )
}

/** Подтянуть флаг «сайт включён» без полной перезагрузки данных. */
export async function refreshSiteGate() {
  if (!supabaseConfigured || !supabase) return isSiteEnabled()
  try {
    const { data, error } = await withTimeout(supabase.rpc('rasp_public_meta'), 8000, 'статуса сайта')
    if (error) {
      // Сеть моргнула — НЕ переключаем статус (иначе мигает «сайт выключен»).
      return isSiteEnabled()
    }
    let meta = data
    if (typeof meta === 'string') {
      try {
        meta = JSON.parse(meta)
      } catch {
        /* keep */
      }
    }
    if (Array.isArray(meta)) meta = meta[0]
    if (!db) return true
    // Меняем флаг только при явном boolean с сервера.
    if (meta && typeof meta.siteEnabled === 'boolean') db.siteEnabled = meta.siteEnabled
    else if (meta && typeof meta.siteenabled === 'boolean') db.siteEnabled = meta.siteenabled
    if (meta?.closedMessage || meta?.closedmessage) {
      db.closedMessage = meta.closedMessage || meta.closedmessage
    }
    if (meta?.semesterLabel) db.semesterLabel = meta.semesterLabel
    saveOfflineSnap(db)
    return db.siteEnabled !== false
  } catch {
    return isSiteEnabled()
  }
}

export async function setSiteEnabled(enabled, message = null) {
  if (!supabaseConfigured || !supabase) throw new Error('Нет связи с сервером')
  const session = getSession()
  if (!session?.token || session.role !== 'admin') throw new Error('Нужен вход админа')
  const { data, error } = await withTimeout(
    supabase.rpc('rasp_set_site_enabled', {
      p_token: session.token,
      p_enabled: !!enabled,
      p_message: message || null,
    }),
    15000,
    'переключения сайта',
  )
  if (error) throw new Error(rpcErrorMessage(error))
  let payload = data
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      /* keep */
    }
  }
  if (Array.isArray(payload)) payload = payload[0]
  if (db) {
    db.siteEnabled = !!enabled
    if (payload?.closedMessage || payload?.closedmessage) {
      db.closedMessage = payload.closedMessage || payload.closedmessage
    }
    saveOfflineSnap(db)
  }
  return payload
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
