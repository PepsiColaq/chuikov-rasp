import './styles.css'
import { el } from './lib/security.js'
import { breakMinutes, DAY_NAMES, DAY_SHORT } from './data/seed.js'
import {
  initStore,
  listGroups,
  getGroup,
  getLessons,
  getOverridesForDate,
  getHomework,
  resolveLesson,
  getSession,
  loginWithCode,
  logout,
  validateRemoteSession,
  addHomework,
  deleteHomework,
  uploadHomeworkFiles,
  uploadProfileAvatar,
  clearProfileAvatar,
  setOverride,
  clearOverride,
  createGroup,
  deactivateGroup,
  addStarostaCode,
  listStarostaCodes,
  revokeStarostaCode,
  renameStarostaLabel,
  setStarostaRoleTitle,
  ALL_GROUPS_ID,
  setAdminDisplayName,
  resetSemester,
  getAudit,
  getSemesterLabel,
  getDb,
  isRemoteMode,
  isOfflineMode,
  getConnectionError,
  bootFromCache,
  refreshMutable,
  startPeersChannel,
  goOfflineUi,
  tryReconnect,
  trackVisit,
  fetchSiteStats,
  maybeAutoCleanup,
  cleanupOldData,
  isSiteEnabled,
  getClosedMessage,
  refreshSiteGate,
  setSiteEnabled,
  fetchSupportTickets,
  replySupportTicket,
  deleteSupportTicket,
  deleteAllSupportTickets,
  fetchAuditLog,
  suggestTeachers,
  findTeacherSlots,
  findTeacherUpcoming,
  listDayPairSlots,
  findFreeRooms,
  suggestRooms,
  findRoomSlots,
  listScheduleRooms,
  canUseFreeRooms,
  setCodeFreeRooms,
  banStarostaCode,
  unbanStarostaCode,
  isLocalDeviceBanned,
  getLocalBanReason,
  refreshDeviceBanStatus,
  getNews,
  refreshNews,
  addNews,
  deleteNews,
  moveNews,
  getPrograms,
  refreshPrograms,
  saveProgram,
  deleteProgram,
  moveProgram,
} from './lib/store.js'
import {
  canGradeGroup,
  getFormationDay,
  setFormationCancelled,
  setFormationMark,
  listAdmins,
  addAdmin,
  revokeAdmin,
  newStudentCode,
  listMyMarks,
  groupmates,
  setMyContacts,
  listStudents,
  setOwnStudentCode,
  staffList,
  staffSet,
  curatorsList,
  curatorCreate,
  curatorRevoke,
} from './lib/journal.js'
import { renderGradesTab, renderJournalOverlay, personSurname, personRest } from './journal-ui.js'
import { supabaseConfigured, supabase, storageUrlCandidates, fetchStorageObjectUrl } from './lib/supabase.js'
import { privacyParagraphs, termsParagraphs } from './lib/legal.js'

const SELECTED_GROUP_KEY = 'rasp_selected_group_v3'
const THEME_KEY = 'rasp_theme_v1'
const WEEK_MAX = 6
const splashStartedAt =
  typeof performance !== 'undefined' ? performance.now() : Date.now()

const state = {
  tab: 'home',
  /** Подрежим вкладки «Учёба»: 'grades' — журнал и оценки, 'hw' — домашка */
  studyMode: 'grades',
  /** Подэкран профиля: '' — сам профиль, 'overrides' — замены, 'group' — моя группа */
  moreScreen: '',
  /** Открыт ли календарь на месяц в «Расписании» */
  calendarOpen: false,
  /** Сдвиг месяца в календаре относительно текущего: 0 — этот, -1 — прошлый */
  calendarMonthOffset: 0,
  groupId: localStorage.getItem(SELECTED_GROUP_KEY) || '',
  day: ((d) => (d === 0 || d === 6 ? 1 : d))(new Date().getDay()),
  weekOffset: 0,
  prevGroupId: '',
  expandedHw: new Set(),
  /** id пары, у которой `.hw-body` ещё без `is-open` (анимация раскрытия) */
  hwExpandAnimId: null,
  /** На вкладке ДЗ: после рендера проскроллить к дню `{ notify: bool }` */
  hwDaySeek: null,
  /** Одноразовый флаг: следующий рендер вкладки показать каскадом */
  cascade: true,
  /** Направление анимации смены дня: 'left' | 'right' | null */
  daySwap: null,
  adminCodeGroupId: '',
  /** id кода с раскрытой формой имени/роли (без prompt) */
  adminCodeEditId: '',
  /** id кода с подтверждением отзыва в карточке */
  adminCodeRevokeId: '',
  /** id доп. админа с подтверждением отзыва в карточке */
  adminRemoveId: '',
  /** Последний выданный админ-код — переживает перерисовку панели */
  adminIssuedNote: '',
  /** Раскрытые секции админки (как ДЗ): codes | admins | support | site | audit | groups | stats */
  adminOpen: new Set(),
  /** id секции, у которой идёт анимация раскрытия */
  adminExpandAnimId: null,
  overrideDraft: null,
  showInstallHelp: false,
  highlightLogin: false,
  loginNeedWho: false,
  loginCodeDraft: '',
  loginWhoDraft: '',
  legalDoc: null,
  teacherQuery: '',
  teacherDate: '',
  /** 'teacher' | 'room' — что ищем во вкладке «Преп.» */
  teacherMode: 'teacher',
  roomQuery: '',
  roomDate: '',
  /** Админ: дата для свободных аудиторий */
  freeRoomsDate: '',
  /** Слот пары «HH:MM|HH:MM» */
  freeRoomsSlot: '',
  /** Подсвечивать чип «Сейчас» */
  freeRoomsNow: true,
  /** Поиск в выдаче доступа к аудиториям / банах */
  roomsAccessQuery: '',
  bansQuery: '',
  /** id кода с формой «забанить + причина» */
  adminBanId: '',
  /** Журнал пары: { groupId, date, lessonId, start, end, subject } */
  journal: null,
  /** current | final */
  gradesMode: 'current',
  /** Раскрытый предмет в «Текущих оценках» */
  openSubject: '',
  gradeTip: '',
  /** Сторона «+оценка»: какой вид работы выбран */
  gradeKind: 'answer',
  /** id студента, у которого открыт выбор оценки */
  gradeAddFor: '',
  /** Статус построения на текущий день: { cancelled, note, canEdit, marks } */
  formationDay: null,
  /** Открытый экран расхода построения: { groupId, date, formStart, anchorStart } */
  formationMarks: null,
  /** Новости на главной: индекс открытой карточки, открыт ли компоузер */
  newsIndex: 0,
  newsCompose: false,
  /** Черновик новости между перерисовками: { title, body, pinned, attachments } */
  newsDraft: null,
  /** Черновик программы в редакторе или null, если редактор закрыт */
  programDraft: null,
  message: null,
  error: null,
}

function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', t)
  try {
    localStorage.setItem(THEME_KEY, t)
  } catch {
    /* ignore */
  }
}

applyTheme(localStorage.getItem(THEME_KEY) || 'light')

/** Chrome/Android native install prompt (iOS does not support this API) */
let deferredInstallPrompt = null
let installPromptReady = false

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredInstallPrompt = e
    installPromptReady = true
  })
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null
    installPromptReady = false
    state.showInstallHelp = false
    flash('Ярлык добавлен на экран')
  })
}

function isStandaloneApp() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

function isIosDevice() {
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isAndroidDevice() {
  return /Android/i.test(navigator.userAgent || '')
}

async function tryNativeInstall() {
  if (!deferredInstallPrompt) return false
  const promptEvent = deferredInstallPrompt
  deferredInstallPrompt = null
  installPromptReady = false
  promptEvent.prompt()
  const choice = await promptEvent.userChoice
  if (choice?.outcome === 'accepted') {
    flash('Добавляем на экран…')
    return true
  }
  flash('Установка отменена', true)
  return false
}

function renderInstallCard() {
  if (isStandaloneApp()) {
    return el('div', { className: 'card' }, [
      el('h3', { text: 'На экране телефона' }),
      el('p', { className: 'muted', text: 'Уже открыто как ярлык — всё ок.' }),
    ])
  }

  const box = el('div', { className: 'card' })
  box.append(el('h3', { text: 'На экран телефона' }))
  box.append(
    el('p', {
      className: 'muted',
      text: 'Не App Store — просто ярлык сайта. Нажми кнопку: на Android часто откроется установка сразу, на iPhone покажем куда нажать. Если ярлык уже был со старым именем «Чуйков» — удали его и добавь снова.',
    }),
  )

  const btn = el('button', {
    type: 'button',
    className: 'btn',
    text: isIosDevice() ? 'Как добавить на экран' : 'Добавить на экран',
    onClick: async () => {
      if (await tryNativeInstall()) return
      state.showInstallHelp = !state.showInstallHelp
      render()
    },
  })
  box.append(btn)

  if (installPromptReady && !isIosDevice()) {
    box.append(
      el('p', {
        className: 'muted',
        style: 'margin-top:8px',
        text: 'Браузер готов установить ярлык одним нажатием.',
      }),
    )
  }

  if (state.showInstallHelp || isIosDevice()) {
    if (isIosDevice()) {
      box.append(
        el('div', { className: 'install-steps' }, [
          el('p', { className: 'install-steps-title', text: 'iPhone (только Safari):' }),
          el('ol', {}, [
            el('li', { text: 'Открой этот сайт в Safari (не в Chrome).' }),
            el('li', { text: 'Нажми кнопку «Поделиться» (квадрат со стрелкой вверх) внизу.' }),
            el('li', { text: 'Пролистай и нажми «На экран «Домой»».' }),
            el('li', { text: 'Подтверди «Добавить» — появится иконка «Расписание».' }),
          ]),
          el('p', {
            className: 'muted',
            text: 'Apple не даёт сайтам сделать это автоматически — только через «Поделиться».',
          }),
        ]),
      )
    } else if (isAndroidDevice()) {
      box.append(
        el('div', { className: 'install-steps' }, [
          el('p', { className: 'install-steps-title', text: 'Android:' }),
          el('ol', {}, [
            el('li', { text: 'Нажми кнопку «Добавить на экран» выше — если браузер предложит установку, подтверди.' }),
            el('li', {
              text: 'Если окна не было: меню ⋮ справа сверху → «Установить приложение» или «Добавить на главный экран».',
            }),
            el('li', { text: 'Лучше открывать в Chrome.' }),
          ]),
        ]),
      )
    } else {
      box.append(
        el('div', { className: 'install-steps' }, [
          el('p', {
            className: 'muted',
            text: 'На компьютере: в Chrome меню → «Установить Расписание…» или значок ⊕ в адресной строке.',
          }),
        ]),
      )
    }
  }

  return box
}

function textNode(s) {
  return document.createTextNode(s == null ? '' : String(s))
}

function normalizePeopleQuery(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim()
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** «09:00» → минуты от полуночи */
function hhmmToMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function nowMinutesOfDay() {
  const n = new Date()
  return n.getHours() * 60 + n.getMinutes()
}

/**
 * Статус «сейчас / дальше» для сегодняшнего дня.
 * @returns {{ kind:'now'|'next'|'done', lesson?: object, view?: object, minsLeft?: number, minsUntil?: number, progress?: number } | null}
 */
function getScheduleNowStatus(groupId, dateStr, lessons) {
  if (!groupId || dateStr !== todayISO()) return null
  const list = Array.isArray(lessons) ? lessons : []
  if (!list.length) return null
  const overs = getOverridesForDate(groupId, dateStr)
  const active = []
  for (const lesson of list) {
    const ov = overs.find((o) => o.lessonId === lesson.id)
    const view = resolveLesson(lesson, ov)
    if (view.cancelled) continue
    const start = hhmmToMinutes(lesson.start)
    const end = hhmmToMinutes(lesson.end || lesson.start)
    if (start == null || end == null || end <= start) continue
    active.push({ lesson, view, start, end })
  }
  if (!active.length) return null
  const now = nowMinutesOfDay()
  const current = active.find((x) => now >= x.start && now < x.end)
  if (current) {
    const span = current.end - current.start
    const elapsed = Math.max(0, now - current.start)
    return {
      kind: 'now',
      lesson: current.lesson,
      view: current.view,
      minsLeft: Math.max(1, current.end - now),
      progress: Math.min(1, Math.max(0, elapsed / span)),
    }
  }
  const upcoming = active.find((x) => x.start > now)
  if (upcoming) {
    return {
      kind: 'next',
      lesson: upcoming.lesson,
      view: upcoming.view,
      minsUntil: Math.max(1, upcoming.start - now),
    }
  }
  return { kind: 'done' }
}

function shortSubjectLabel(name, max = 36) {
  const s = String(name || '').trim()
  if (s.length <= max) return s
  return `${s.slice(0, Math.max(1, max - 1)).trim()}…`
}

/** «7 мин» / «2 ч 10 мин» — минуты в скобках не читаются, часы понятнее. */
function humanMins(total) {
  const m = Math.max(0, Math.round(Number(total) || 0))
  if (m < 1) return 'меньше минуты'
  if (m < 60) return `${m} мин`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} ч ${rest} мин` : `${h} ч`
}

/**
 * Строка «Сейчас / Дальше» над расписанием.
 * Только для сегодняшнего дня: для пятницы в понедельник отсчёт «через 7 часов»
 * был бы бессмыслицей — до неё не 7 часов, а четыре дня.
 */
function renderNowStrip(status, formation = null, dateStr = '') {
  if (!dateStr || dateStr !== todayISO()) return null
  if (formation?.show && !formation.skipped) {
    const formMin = hhmmToMinutes(formation.formStart)
    const until = formMin == null ? null : formMin - nowMinutesOfDay()
    if (until != null && until > 0) {
      return el('div', { className: 'now-strip now-strip-next', dataset: { nowStrip: '1' } }, [
        el('p', {
          className: 'now-strip-text',
          text: `Дальше · Построение · через ${humanMins(until)} (${formation.formStart})`,
        }),
      ])
    }
  }
  if (!status) return null
  if (status.kind === 'done') {
    return el('div', { className: 'now-strip now-strip-done', text: 'На сегодня пары закончились' })
  }
  const subject = shortSubjectLabel(
    status.view?.effectiveSubject || status.lesson?.subject || 'пара',
  )
  if (status.kind === 'now') {
    const bar = el('div', { className: 'now-strip-bar' }, [
      el('div', {
        className: 'now-strip-bar-fill',
        style: `width:${Math.round((status.progress || 0) * 100)}%`,
      }),
    ])
    return el('div', { className: 'now-strip now-strip-live', dataset: { nowStrip: '1' } }, [
      el('p', {
        className: 'now-strip-text',
        text: `Сейчас · ${subject} · до конца ${humanMins(status.minsLeft)}`,
      }),
      bar,
    ])
  }
  if (status.kind === 'next') {
    return el('div', { className: 'now-strip now-strip-next', dataset: { nowStrip: '1' } }, [
      el('p', {
        className: 'now-strip-text',
        text: `Дальше · ${subject} · через ${humanMins(status.minsUntil)}`,
      }),
    ])
  }
  return null
}

/** Замена ещё актуальна для вкладки «Замены» (будущие + сегодня до конца пары). На «Пара́х» показывается всегда. */
function overrideIsActiveForList(o, lesson) {
  const today = todayISO()
  if (!o?.date) return false
  if (o.date > today) return true
  if (o.date < today) return false
  const end = lesson?.end || lesson?.start
  if (!end) return true
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(end).trim())
  if (!m) return true
  const now = new Date()
  const endAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(m[1]), Number(m[2]), 0, 0)
  return now.getTime() < endAt.getTime()
}

/** Дата дня недели с учётом сдвига недель UI (0 = эта, -1 = прошлая, +1 = следующая). */
function dateForWeekday(dayNum, offset = state.weekOffset) {
  const now = new Date()
  const jsDay = now.getDay() || 7
  const d = new Date(now)
  d.setHours(12, 0, 0, 0)
  d.setDate(now.getDate() + (Number(dayNum) - jsDay) + Number(offset) * 7)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Дата дня недели относительно календарной «этой» недели (не зависит от weekOffset в UI). */
function calendarDateForWeekday(dayNum, weekFromToday = 0) {
  return dateForWeekday(dayNum, weekFromToday)
}

/** Вычесть минуты из «HH:MM». */
function subtractMinutes(hhmm, mins) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim())
  if (!m) return ''
  let total = Number(m[1]) * 60 + Number(m[2]) - Number(mins)
  if (!Number.isFinite(total) || total < 0) total = 0
  const h = Math.floor(total / 60)
  const mi = total % 60
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}

/**
 * Срок «на следующую пару» этого предмета: ближайшая дата, когда предмет снова в расписании группы
 * (строго после сегодня; если сегодня — после текущего слота).
 */
function dueDateForNextLesson(groupId, lesson) {
  const today = todayISO()
  const subject = lesson?.subject || ''
  const day0 = Number(lesson?.day)
  const start0 = lesson?.start || ''
  const sameSubject = getLessons(groupId).filter((l) => l.subject === subject)
  const pool = sameSubject.length ? sameSubject : lesson ? [lesson] : []
  const candidates = []

  for (let w = 0; w <= 4; w++) {
    for (const l of pool) {
      const day = Number(l.day)
      if (!day) continue
      const date = calendarDateForWeekday(day, w)
      if (date < today) continue
      if (date === today) {
        if (l.id && lesson?.id && l.id === lesson.id) continue
        if (day === day0 && l.start && start0 && l.start <= start0) continue
      }
      candidates.push({ date, start: l.start || '' })
    }
  }

  candidates.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
  if (candidates.length) return candidates[0].date
  if (day0) return calendarDateForWeekday(day0, 1)
  return today
}

function weekRangeLabel() {
  const mon = formatDateRu(dateForWeekday(1))
  const end = formatDateRu(dateForWeekday(5))
  if (state.weekOffset === 0) return `Эта неделя · ${mon}–${end}`
  if (state.weekOffset === -1) return `Прошлая · ${mon}–${end}`
  if (state.weekOffset === 1) return `Следующая · ${mon}–${end}`
  if (state.weekOffset < 0) return `−${Math.abs(state.weekOffset)} нед. · ${mon}–${end}`
  return `+${state.weekOffset} нед. · ${mon}–${end}`
}

/** Show dates as ДД.ММ.ГГГГ (storage stays YYYY-MM-DD). */
function formatDateRu(iso) {
  if (!iso) return ''
  const s = String(iso).slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return `${m[3]}.${m[2]}.${m[1]}`
  const m2 = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s)
  if (m2) return s
  return s
}

function canEdit(groupId) {
  const s = getSession()
  if (!s) return false
  if (s.role === 'admin') return true
  // Куратор ведёт свои группы (или все, если groupId пустой) — как староста.
  if (s.role === 'curator') return !s.groupId || s.groupId === groupId
  if (s.role === 'starosta' && s.allGroups) return true
  return s.role === 'starosta' && s.groupId === groupId
}

function ensureOverrideDraft() {
  if (!state.overrideDraft) {
    state.overrideDraft = {
      date: todayISO(),
      lessonId: '',
      type: 'room_only',
      newSubject: '',
      newRoom: '',
      note: '',
    }
  }
  return state.overrideDraft
}

// Тосты живут поверх layout (на body), поэтому не сдвигают контент и переживают render().
let toastWrap = null
function ensureToastWrap() {
  if (toastWrap && document.body.contains(toastWrap)) return toastWrap
  toastWrap = el('div', { className: 'toast-wrap', 'aria-live': 'polite', 'aria-atomic': 'true' })
  document.body.append(toastWrap)
  return toastWrap
}

function showToast(text, isError = false) {
  const msg = (text || '').toString().trim()
  if (!msg) return
  const wrap = ensureToastWrap()
  const toast = el('div', { className: `toast${isError ? ' toast-error' : ''}`, role: 'status' }, [
    textNode(msg),
  ])
  wrap.append(toast)
  if (motionOk()) {
    requestAnimationFrame(() => toast.classList.add('is-in'))
  } else {
    toast.classList.add('is-in')
  }
  const dismiss = () => {
    if (toast.dataset.gone === '1') return
    toast.dataset.gone = '1'
    toast.classList.remove('is-in')
    toast.classList.add('is-out')
    window.setTimeout(() => toast.remove(), 280)
  }
  toast.addEventListener('click', dismiss)
  window.setTimeout(dismiss, 2800)
}

// Оставлено для совместимости: баннер больше не рисуем, сообщения идут тостами.
function paintFlashSlot() {
  const slot = document.getElementById('flash-slot')
  if (slot) slot.replaceChildren()
}

function flash(text, isError = false) {
  showToast(text, isError)
  render({ force: true })
}

function selectGroup(id) {
  state.groupId = id
  state.prevGroupId = ''
  state.newsIndex = 0
  // Программы старосты привязаны к группе — при смене группы перечитываем.
  programsLoaded.clear()
  localStorage.setItem(SELECTED_GROUP_KEY, id)
  state.tab = 'schedule'
  state.cascade = true
  render({ force: true })
  refreshNews(id)
    .then(() => {
      if (state.groupId !== id) return
      if (!refreshTabPanes(['home'])) return
    })
    .catch(() => {})
}

function pickGroupWithFeel(id, btn) {
  hapticTap()
  if (btn) {
    btn.classList.add('is-picked')
    btn.setAttribute('aria-pressed', 'true')
  }
  const wait = motionOk() || UI_FEEL ? 160 : 0
  window.setTimeout(() => selectGroup(id), wait)
}

function openGroupPicker() {
  if (state.groupId) state.prevGroupId = state.groupId
  state.groupId = ''
  render()
}

function cancelGroupPicker() {
  const backId = state.prevGroupId
  state.prevGroupId = ''
  if (backId && getGroup(backId)) {
    state.groupId = backId
    localStorage.setItem(SELECTED_GROUP_KEY, backId)
  }
  render()
}

function typeLabel(t) {
  return (
    {
      room_only: 'Смена кабинета',
      subject: 'Другая пара',
      subject_and_room: 'Другая пара + кабинет',
      cancelled: 'Пары не будет',
    }[t] || t
  )
}

function shortPersonName(full) {
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

function sessionPillText(session) {
  if (!session) return 'Войти'
  // Поле метки приходит с сервера и может быть null — на экран это попадать не должно.
  session = { ...session, label: String(session.label || '').replace(/^null$/i, '').trim() }
  if (session.role === 'admin') {
    const who = shortPersonName((session.label || '').trim() || 'Никитос')
    return `${who} · выйти`
  }
  if (session.role === 'student') {
    const who = shortPersonName((session.label || '').trim() || 'Студент')
    return `${who} · выйти`
  }
  if (session.role === 'curator') {
    const who = shortPersonName((session.label || '').trim())
    return who ? `${who} · выйти` : 'Куратор · выйти'
  }
  const who = shortPersonName((session.label || '').trim())
  return who ? `${who} · выйти` : 'Староста · выйти'
}

async function confirmAndLogout() {
  if (!confirm('Выйти с этого устройства?\nЧтобы снова править ДЗ и замены, нужен будет код.')) {
    return false
  }
  await logout()
  flash('Вы вышли')
  return true
}

function renderTop(group) {
  const session = getSession()
  const sub = tabLeadText(state.tab, group)
  return el('header', { className: 'topbar' }, [
    el('div', { className: 'topbar-left' }, [
      el('div', { className: 'brand', text: `Колледж Чуйкова · ${getSemesterLabel()}` }),
      el('button', {
        type: 'button',
        className: 'group-title-btn',
        title: 'Сменить группу',
        onClick: () => openGroupPicker(),
      }, [el('h1', { text: group ? group.name : 'Группа' })]),
      el('p', { className: 'topbar-sub', text: sub || '\u00a0' }),
    ]),
    session
      ? el('button', {
          className: 'session-pill',
          type: 'button',
          text: sessionPillText(session),
          onClick: () => {
            void confirmAndLogout()
          },
        })
      : el('button', {
          className: 'session-pill',
          type: 'button',
          text: 'Войти',
          onClick: () => {
            state.tab = 'more'
            state.moreScreen = ''
            state.highlightLogin = true
            render()
          },
        }),
  ])
}

/** Подзаголовок под названием группы — один уровень на всех вкладках */
function tabLeadText(tab, group) {
  if (tab === 'home') return 'Главная'
  if (tab === 'schedule') return 'Расписание'
  if (tab === 'grades') return state.studyMode === 'hw' ? 'Домашнее задание' : 'Журнал и оценки'
  if (tab === 'more')
    return state.moreScreen === 'overrides'
      ? 'Замены'
      : state.moreScreen === 'group'
        ? 'Моя группа'
        : state.moreScreen === 'contacts'
          ? 'Мои контакты'
          : 'Профиль и настройки'
  if (tab === 'teachers') return 'Справочник: преподаватель или аудитория'
  if (tab === 'hw') return 'Домашнее задание'
  if (tab === 'overrides') return 'Замены'
  return ''
}

function renderDays() {
  const group = getGroup(state.groupId)
  const hasSat = group
    ? getLessons(group.id, 6).length > 0
    : false
  const days = hasSat ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]
  return el('div', { className: 'week-block' }, [
    el('div', { className: 'week-nav' }, [
      el('button', {
        type: 'button',
        className: 'week-nav-btn',
        text: '←',
        title: 'Прошлая неделя',
        disabled: state.weekOffset <= -WEEK_MAX,
        onClick: () => {
          if (state.weekOffset > -WEEK_MAX) {
            state.weekOffset -= 1
            if (!refreshTabPanes(['schedule', 'hw'])) render({ force: true })
            else softUpdateNav()
          }
        },
      }),
      el('button', {
        type: 'button',
        className: 'week-nav-label',
        text: weekRangeLabel(),
        onClick: () => {
          state.weekOffset = 0
          if (!refreshTabPanes(['schedule', 'hw'])) render({ force: true })
          else softUpdateNav()
        },
      }),
      el('button', {
        type: 'button',
        className: 'week-nav-btn',
        text: '→',
        title: 'Следующая неделя',
        disabled: state.weekOffset >= WEEK_MAX,
        onClick: () => {
          if (state.weekOffset < WEEK_MAX) {
            state.weekOffset += 1
            if (!refreshTabPanes(['schedule', 'hw'])) render({ force: true })
            else softUpdateNav()
          }
        },
      }),
    ]),
    el(
      'div',
      { className: 'days' },
      days.map((d) =>
        el('button', {
          type: 'button',
          className: state.day === d ? 'active' : '',
          text: DAY_SHORT[d],
          onClick: () => {
            hapticTap()
            const prev = state.day
            if (d === prev) return
            if (DAY_SWAP_MOTION && motionOk()) {
              state.daySwap = d > prev ? 'right' : 'left'
            } else {
              state.daySwap = null
            }
            state.day = d
            if (isHwView() && HW_TAB_BY_DAY) state.hwDaySeek = { notify: true }
            if (!refreshTabPanes(['schedule', 'hw'])) render({ force: true })
            else {
              softUpdateNav()
              maybeSeekHwDay()
            }
          },
        }),
      ),
    ),
  ])
}

/** Кликабельный номер аудитории: открывает вкладку «Преп.» в режиме аудитории. */
function roomLink(room) {
  const value = String(room || '').trim()
  if (!value) return null
  return el('button', {
    type: 'button',
    className: 'room-link',
    text: `ауд. ${value}`,
    title: 'Показать, кто ещё в этом кабинете',
    onClick: (e) => {
      e.stopPropagation()
      e.preventDefault()
      state.teacherMode = 'room'
      state.roomQuery = value
      state.roomDate = todayISO()
      gotoTab('teachers', { animate: true })
    },
  })
}

function lessonMeta(lesson, view) {
  if (view.cancelled) {
    return el('div', { className: 'lesson-meta' }, [
      el('span', { className: 'badge warn', text: 'пары не будет' }),
    ])
  }
  if (view.overrideType === 'room_only') {
    return el('div', { className: 'lesson-meta' }, [
      el('span', { className: 'strike', text: `ауд. ${view.oldRoom || '—'}` }),
      textNode(' → '),
      roomLink(view.effectiveRoom) || textNode(`ауд. ${view.effectiveRoom} `),
      el('span', { className: 'badge warn', text: 'замена' }),
    ])
  }
  if (view.overrideType === 'subject' || view.overrideType === 'subject_and_room') {
    return el('div', { className: 'lesson-meta' }, [
      textNode(view.oldSubject ? `было: ${view.oldSubject}` : ''),
      view.effectiveRoom ? textNode(' · ') : textNode(' '),
      view.effectiveRoom ? roomLink(view.effectiveRoom) : null,
      el('span', { className: 'badge warn', text: 'замена' }),
    ])
  }
  if (lesson.remote) {
    return el('div', { className: 'lesson-meta' }, [
      el('span', { className: 'badge remote', text: 'дистант / онлайн' }),
      lesson.teacher ? textNode(` · ${lesson.teacher}`) : null,
    ])
  }
  const nodes = []
  const link = roomLink(view.effectiveRoom)
  if (link) nodes.push(link)
  if (lesson.teacher) nodes.push(textNode(`${link ? ' · ' : ''}${lesson.teacher}`))
  return el(
    'div',
    { className: 'lesson-meta' },
    nodes.length ? nodes : [textNode('кабинет не указан')],
  )
}

function safeStorageUrl(url) {
  const list = storageUrlCandidates(url)
  return list[0] || null
}

function isImageMime(mime, name = '') {
  if ((mime || '').startsWith('image/')) return true
  return /\.(jpe?g|png|webp|gif|heic|heif|bmp|avif)$/i.test(String(name || ''))
}

/** Все рабочие URL для одного вложения (не выкидывать фото из галереи) */
function attachmentImageCandidates(a) {
  const raw = typeof a === 'string' ? a : a?.url
  if (!raw || typeof raw !== 'string') return []
  const out = []
  const add = (u) => {
    if (u && typeof u === 'string' && !out.includes(u)) out.push(u)
  }
  for (const c of storageUrlCandidates(raw)) add(c)
  try {
    const u = new URL(raw)
    if (u.protocol === 'https:' || u.protocol === 'http:') add(u.href)
  } catch {
    /* ignore */
  }
  return out
}

function bindImgCandidates(img, candidates) {
  const list = (candidates || []).filter(Boolean)
  let i = 0
  img.src = list[0] || ''
  img.addEventListener('error', () => {
    i += 1
    if (i < list.length) img.src = list[i]
    else img.alt = 'Не удалось загрузить фото'
  })
}

/** Для xlsx/docx/pdf — скачать через failover (иначе на телефоне «не открывается»). */
function bindFileDownload(anchor, originalUrl, fileName) {
  const candidates = storageUrlCandidates(originalUrl)
  if (!candidates.length) return
  anchor.href = candidates[0]
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  let busy = false
  anchor.addEventListener('click', async (e) => {
    e.preventDefault()
    if (busy) return
    busy = true
    const prev = anchor.textContent
    try {
      anchor.textContent = 'Загрузка…'
      const obj = await fetchStorageObjectUrl(originalUrl)
      const a = document.createElement('a')
      a.href = obj
      a.download = fileName || 'file'
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(obj), 60_000)
    } catch {
      if (candidates[1]) window.open(candidates[1], '_blank', 'noopener')
      else flash('Не удалось скачать файл', true)
    } finally {
      anchor.textContent = prev
      busy = false
    }
  })
}

function looksLikeHwImage(a) {
  return (
    isImageMime(a.mime, a.name) ||
    isImageMime('', a.url || '') ||
    isImageMime('', a.candidates?.[0] || '')
  )
}

/** Список фото-кандидатов из attachments (+ legacy images) — как в сетке превью. */
function collectHwPhotoEntries(attachments, legacyImages) {
  const list = []
  if (Array.isArray(attachments)) {
    for (const a of attachments) {
      const candidates = attachmentImageCandidates(a)
      if (!a?.url && !candidates.length) continue
      list.push({
        url: a.url || candidates[0],
        name: a.name || 'файл',
        mime: a.mime || '',
        candidates,
      })
    }
  }
  if (Array.isArray(legacyImages)) {
    for (const url of legacyImages) {
      const candidates = attachmentImageCandidates(url)
      if (!candidates.length) continue
      const key = candidates[0] || url
      if (list.some((x) => (x.candidates?.[0] || x.url) === key || x.url === url)) continue
      list.push({ url, name: 'фото', mime: 'image/jpeg', candidates })
    }
  }
  return list.filter(looksLikeHwImage).map((a) => ({
    ...a,
    candidates: a.candidates?.length ? a.candidates : attachmentImageCandidates(a),
  }))
}

/**
 * @param {object} [galleryCtx]
 * @param {string[][]} [galleryCtx.shared] — общая галерея блока автора (все ДЗ подряд)
 * @param {number} [galleryCtx.offset] — индекс первого фото этого вложения в shared
 */
function renderHwAttachments(attachments, legacyImages, galleryCtx = null) {
  const photos = collectHwPhotoEntries(attachments, legacyImages)
  const files = []
  if (Array.isArray(attachments)) {
    for (const a of attachments) {
      const candidates = attachmentImageCandidates(a)
      if (!a?.url && !candidates.length) continue
      const entry = {
        url: a.url || candidates[0],
        name: a.name || 'файл',
        mime: a.mime || '',
        candidates,
      }
      if (!looksLikeHwImage(entry)) files.push(entry)
    }
  }
  if (!photos.length && !files.length) return null

  const kids = []
  if (photos.length) {
    const localGallery = photos.map((a) => a.candidates)
    const shared = Array.isArray(galleryCtx?.shared) && galleryCtx.shared.length
      ? galleryCtx.shared
      : null
    const offset = shared ? Math.max(0, Number(galleryCtx.offset) || 0) : 0
    kids.push(
      el(
        'div',
        { className: 'hw-photos' },
        photos.map((a, idx) => {
          const candidates = localGallery[idx]
          const img = el('img', {
            alt: a.name,
            loading: 'lazy',
            decoding: 'async',
          })
          bindImgCandidates(img, candidates)
          if (UI_MOTION && (shared || localGallery).length) {
            const openGallery = shared || localGallery
            const openIndex = shared ? offset + idx : idx
            return el(
              'button',
              {
                type: 'button',
                className: 'hw-photo-btn',
                'data-cands': JSON.stringify(candidates),
                'data-gallery-index': String(openIndex),
                onClick: (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  // 1) Общая галерея автора (несколько ДЗ → одни превью)
                  if (shared?.length) {
                    openHwLightbox(shared, openIndex)
                    return
                  }
                  // 2) Все кнопки в блоке автора / карточке (DOM + data-cands)
                  const scope =
                    e.currentTarget.closest('.hw-author-block') ||
                    e.currentTarget.closest('.hw-card') ||
                    e.currentTarget.closest('.hw-photos')
                  const buttons = scope
                    ? [...scope.querySelectorAll('.hw-photo-btn')]
                    : [e.currentTarget]
                  const start = Math.max(0, buttons.indexOf(e.currentTarget))
                  const fromDom = buttons.map((btn) => {
                    try {
                      const raw = btn.getAttribute('data-cands')
                      if (raw) {
                        const parsed = JSON.parse(raw)
                        if (Array.isArray(parsed) && parsed.filter(Boolean).length) {
                          return parsed.filter(Boolean)
                        }
                      }
                    } catch {
                      /* ignore */
                    }
                    const im = btn.querySelector('img')
                    const src = im?.currentSrc || im?.src || ''
                    return src && !src.startsWith('data:') ? [src] : []
                  })
                  if (fromDom.some((c) => c.length)) {
                    openHwLightbox(fromDom, start)
                    return
                  }
                  openHwLightbox(openGallery, openIndex)
                },
              },
              [img],
            )
          }
          return el(
            'a',
            {
              href: candidates[0] || '#',
              target: '_blank',
              rel: 'noopener noreferrer',
            },
            [img],
          )
        }),
      ),
    )
  }
  if (files.length) {
    kids.push(
      el(
        'div',
        { className: 'hw-files' },
        files.map((a) => {
          const candidates = storageUrlCandidates(a.url)
          const link = el('a', {
            className: 'hw-file-link',
            href: candidates[0] || '#',
            text: a.name,
          })
          bindFileDownload(link, a.url, a.name)
          return link
        }),
      ),
    )
  }
  return el('div', { className: 'hw-attachments' }, kids)
}

let hwLightboxEl = null
let hwLightboxKeyHandler = null

function closeHwLightbox({ animate = true } = {}) {
  const box = hwLightboxEl
  if (!box) return
  if (hwLightboxKeyHandler) {
    document.removeEventListener('keydown', hwLightboxKeyHandler)
    hwLightboxKeyHandler = null
  }
  const finish = () => {
    box.remove()
    if (hwLightboxEl === box) hwLightboxEl = null
    document.documentElement.classList.remove('hw-lightbox-open')
  }
  if (animate && motionOk()) {
    box.classList.remove('is-open')
    box.classList.add('is-closing')
    window.setTimeout(finish, 220)
  } else {
    finish()
  }
}

function openHwLightbox(urlsOrCandidates, startIndex = 0) {
  // urlsOrCandidates: string[] ИЛИ string[][] (несколько кандидатов на фото)
  const rawList = Array.isArray(urlsOrCandidates) ? urlsOrCandidates : []
  const list = rawList
    .map((item) => {
      if (Array.isArray(item)) return item.filter(Boolean)
      if (typeof item === 'string' && item) return [item]
      return []
    })
    .filter((c) => c.length > 0)
  if (!list.length) return
  closeHwLightbox({ animate: false })

  let index = Math.max(0, Math.min(startIndex, list.length - 1))
  let scale = 1
  let tx = 0
  let ty = 0
  let gest = null
  let trackBusy = false

  const overlay = el('div', {
    className: 'hw-lightbox',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Просмотр фото',
  })
  const stage = el('div', { className: 'hw-lightbox-stage' })
  const track = el('div', { className: 'hw-lightbox-track' })
  const slides = list.map((candidates) => {
    const slide = el('div', { className: 'hw-lightbox-slide' })
    const image = el('img', {
      className: 'hw-lightbox-img',
      alt: 'Фото ДЗ',
      draggable: 'false',
    })
    bindImgCandidates(image, candidates)
    slide.append(image)
    track.append(slide)
    return { slide, img: image }
  })
  const counter = el('p', {
    className: 'hw-lightbox-counter',
    text: list.length > 1 ? `${index + 1} / ${list.length}` : '',
  })
  const closeBtn = el('button', {
    type: 'button',
    className: 'hw-lightbox-close',
    'aria-label': 'Закрыть',
    text: '×',
    onClick: (e) => {
      e.stopPropagation()
      closeHwLightbox()
    },
  })

  const slideW = () => {
    const w = stage.clientWidth || overlay.clientWidth || document.documentElement.clientWidth || window.innerWidth || 360
    return Math.max(1, Math.round(w))
  }
  const stageCenter = () => {
    const r = stage.getBoundingClientRect()
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
  }
  const curImg = () => slides[index]?.img

  const sizeSlides = () => {
    const w = slideW()
    // Явная ширина слайда = ширина сцены (не % от трека — иначе все слайды схлопываются)
    slides.forEach(({ slide }) => {
      slide.style.flex = `0 0 ${w}px`
      slide.style.width = `${w}px`
      slide.style.minWidth = `${w}px`
      slide.style.maxWidth = `${w}px`
    })
    track.style.width = `${w * slides.length}px`
  }

  const setTrack = (i, dragPx = 0, { animate = false } = {}) => {
    const w = slideW()
    const soft = motionOk()
    track.style.transition = animate
      ? soft
        ? 'transform 0.34s cubic-bezier(.2,.85,.25,1)'
        : 'transform 0.28s cubic-bezier(.22,.9,.3,1)'
      : 'none'
    track.style.transform = `translate3d(${-i * w + dragPx}px,0,0)`
  }

  const applyZoom = (withTransition = false) => {
    const img = curImg()
    if (!img) return
    img.style.transition = withTransition
      ? 'transform 0.22s cubic-bezier(.2,.85,.25,1)'
      : 'none'
    img.style.transform = `translate3d(${tx}px,${ty}px,0) scale(${scale})`
  }

  const resetZoomOn = (img) => {
    if (!img) return
    img.style.transition = 'none'
    img.style.transform = 'translate3d(0,0,0) scale(1)'
    img.style.opacity = '1'
  }

  const clampPan = () => {
    if (scale <= 1.02) {
      tx = 0
      ty = 0
      return
    }
    const maxX = (stage.clientWidth * (scale - 1)) / 2 + 48
    const maxY = (stage.clientHeight * (scale - 1)) / 2 + 48
    tx = Math.max(-maxX, Math.min(maxX, tx))
    ty = Math.max(-maxY, Math.min(maxY, ty))
  }

  const resetView = () => {
    scale = 1
    tx = 0
    ty = 0
    applyZoom(true)
    overlay.style.background = ''
  }

  /** Зум так, чтобы точка (fx,fy) на экране осталась на месте */
  const zoomToward = (fx, fy, nextScale) => {
    const { cx, cy } = stageCenter()
    const prev = Math.max(0.001, scale)
    const next = Math.min(5, Math.max(1, nextScale))
    if (next <= 1.02) {
      scale = 1
      tx = 0
      ty = 0
      return
    }
    const factor = next / prev
    tx = fx - cx - (fx - cx - tx) * factor
    ty = fy - cy - (fy - cy - ty) * factor
    scale = next
    clampPan()
  }

  const goTo = (i, { animate = true } = {}) => {
    if (list.length < 2) return
    const next = Math.max(0, Math.min(list.length - 1, i))
    if (next === index) {
      sizeSlides()
      setTrack(index, 0, { animate: true })
      return
    }
    // Сразу переключаем индекс — зум/свайп работают на актуальном фото
    slides.forEach((s) => resetZoomOn(s.img))
    scale = 1
    tx = 0
    ty = 0
    index = next
    counter.textContent = `${index + 1} / ${list.length}`
    sizeSlides()
    setTrack(next, 0, { animate })
    trackBusy = true
    window.setTimeout(() => {
      trackBusy = false
    }, animate && motionOk() ? 340 : animate ? 280 : 0)
  }

  stage.append(track)
  overlay.append(closeBtn, stage, counter)
  // Стрелки только на десктопе с мышкой; на телефоне — только свайп
  let showNavArrows = list.length > 1
  try {
    if (window.matchMedia('(pointer: coarse)').matches) showNavArrows = false
    else if (window.matchMedia('(hover: none)').matches && navigator.maxTouchPoints > 1) {
      showNavArrows = false
    }
  } catch {
    if ('ontouchstart' in window && navigator.maxTouchPoints > 1) showNavArrows = false
  }
  if (showNavArrows) {
    overlay.append(
      el('div', { className: 'hw-lightbox-nav' }, [
        el('button', {
          type: 'button',
          className: 'hw-lightbox-nav-btn',
          text: '‹',
          'aria-label': 'Предыдущее',
          onClick: (e) => {
            e.stopPropagation()
            if (scale > 1.05) resetView()
            else goTo(index - 1)
          },
        }),
        el('button', {
          type: 'button',
          className: 'hw-lightbox-nav-btn',
          text: '›',
          'aria-label': 'Следующее',
          onClick: (e) => {
            e.stopPropagation()
            if (scale > 1.05) resetView()
            else goTo(index + 1)
          },
        }),
      ]),
    )
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target === stage) {
      if (scale > 1.05) resetView()
      else closeHwLightbox()
    }
  })

  let lastTap = 0
  let lastTapX = 0
  let lastTapY = 0
  stage.addEventListener('click', (e) => {
    if (e.target.closest('.hw-lightbox-nav-btn, .hw-lightbox-close')) return
    e.stopPropagation()
    const now = Date.now()
    if (now - lastTap < 300 && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 40) {
      if (scale > 1.05) resetView()
      else {
        zoomToward(e.clientX, e.clientY, 2.6)
        applyZoom(true)
      }
      lastTap = 0
    } else {
      lastTap = now
      lastTapX = e.clientX
      lastTapY = e.clientY
    }
  })

  const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  const mid = (a, b) => ({
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  })

  stage.addEventListener(
    'touchstart',
    (e) => {
      // trackBusy не блокирует зум — только новый горизонтальный свайп
      if (e.touches.length === 2) {
        const m = mid(e.touches[0], e.touches[1])
        gest = {
          mode: 'pinch',
          d0: dist(e.touches[0], e.touches[1]),
          s0: scale,
          tx0: tx,
          ty0: ty,
          cx0: m.x,
          cy0: m.y,
        }
        const img = curImg()
        if (img) img.style.transition = 'none'
        return
      }
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      gest = {
        mode: 'pending',
        x0: t.clientX,
        y0: t.clientY,
        tx0: tx,
        ty0: ty,
        t0: Date.now(),
      }
      const img = curImg()
      if (img) img.style.transition = 'none'
      track.style.transition = 'none'
      overlay.style.transition = 'none'
    },
    { passive: true },
  )

  stage.addEventListener(
    'touchmove',
    (e) => {
      if (!gest) return
      if (gest.mode === 'pinch' && e.touches.length === 2) {
        const d = dist(e.touches[0], e.touches[1])
        const m = mid(e.touches[0], e.touches[1])
        const next = Math.min(5, Math.max(1, gest.s0 * (d / Math.max(1, gest.d0))))
        const { cx, cy } = stageCenter()
        const factor = next / Math.max(0.001, gest.s0)
        scale = next
        tx = m.x - cx - (gest.cx0 - cx - gest.tx0) * factor
        ty = m.y - cy - (gest.cy0 - cy - gest.ty0) * factor
        if (scale <= 1.02) {
          scale = 1
          tx = 0
          ty = 0
        } else {
          clampPan()
        }
        applyZoom(false)
        if (e.cancelable) e.preventDefault()
        return
      }
      if (e.touches.length !== 1 || !gest) return
      const t = e.touches[0]
      const dx = t.clientX - gest.x0
      const dy = t.clientY - gest.y0

      if (gest.mode === 'pending') {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        if (scale > 1.05) gest.mode = 'pan'
        else if (Math.abs(dy) > Math.abs(dx) * 1.05) gest.mode = 'dismiss'
        else if (list.length > 1 && Math.abs(dx) > Math.abs(dy)) {
          if (trackBusy) {
            gest.mode = 'ignore'
            return
          }
          gest.mode = 'swipe'
        } else gest.mode = 'ignore'
      }

      if (gest.mode === 'pan') {
        tx = gest.tx0 + dx
        ty = gest.ty0 + dy
        clampPan()
        applyZoom(false)
        if (e.cancelable) e.preventDefault()
      } else if (gest.mode === 'dismiss') {
        const pull = dy
        const abs = Math.abs(pull)
        const img = curImg()
        if (img) {
          img.style.transform = `translate3d(0,${pull}px,0) scale(${Math.max(0.88, 1 - abs / 900)})`
          img.style.opacity = String(Math.max(0.35, 1 - abs / 320))
        }
        overlay.style.background = `rgba(0,0,0,${Math.max(0.35, 1 - abs / 450)})`
        gest.dy = pull
        if (abs > 10 && e.cancelable) e.preventDefault()
      } else if (gest.mode === 'swipe') {
        // На краях — резинка, без ухода в пустоту
        let drag = dx
        if ((index === 0 && dx > 0) || (index === list.length - 1 && dx < 0)) {
          drag = dx * 0.35
        }
        setTrack(index, drag, { animate: false })
        gest.dx = dx
        if (Math.abs(dx) > 8 && e.cancelable) e.preventDefault()
      }
    },
    { passive: false },
  )

  const endGesture = (e) => {
    if (!gest) return
    if (gest.mode === 'pinch' && e?.touches?.length === 1 && scale > 1.05) {
      const t = e.touches[0]
      gest = {
        mode: 'pan',
        x0: t.clientX,
        y0: t.clientY,
        tx0: tx,
        ty0: ty,
      }
      clampPan()
      applyZoom(false)
      return
    }
    const g = gest
    gest = null
    overlay.style.transition = ''
    if (g.mode === 'dismiss') {
      if (Math.abs(g.dy || 0) > 90) {
        closeHwLightbox()
        return
      }
      const img = curImg()
      if (img) img.style.opacity = '1'
      resetView()
      return
    }
    if (g.mode === 'swipe') {
      const dx = g.dx || 0
      const w = slideW()
      const threshold = Math.min(64, w * 0.15)
      if (dx < -threshold && index < list.length - 1) goTo(index + 1)
      else if (dx > threshold && index > 0) goTo(index - 1)
      else setTrack(index, 0, { animate: true })
      return
    }
    if (g.mode === 'pinch' || g.mode === 'pan') {
      if (scale < 1.05) resetView()
      else {
        clampPan()
        applyZoom(true)
      }
    }
  }
  stage.addEventListener('touchend', endGesture, { passive: true })
  stage.addEventListener('touchcancel', endGesture, { passive: true })

  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      zoomToward(e.clientX, e.clientY, scale * (e.deltaY > 0 ? 0.9 : 1.12))
      applyZoom(false)
    },
    { passive: false },
  )

  hwLightboxKeyHandler = (e) => {
    if (e.key === 'Escape') closeHwLightbox()
    else if (e.key === 'ArrowLeft' && list.length > 1 && scale <= 1.05) goTo(index - 1)
    else if (e.key === 'ArrowRight' && list.length > 1 && scale <= 1.05) goTo(index + 1)
    else if (e.key === '+' || e.key === '=') {
      const { cx, cy } = stageCenter()
      zoomToward(cx, cy, scale + 0.35)
      applyZoom(true)
    } else if (e.key === '-') {
      const { cx, cy } = stageCenter()
      zoomToward(cx, cy, scale - 0.35)
      applyZoom(true)
    }
  }
  document.addEventListener('keydown', hwLightboxKeyHandler)

  document.body.append(overlay)
  hwLightboxEl = overlay
  document.documentElement.classList.add('hw-lightbox-open')
  const layoutTrack = () => {
    sizeSlides()
    setTrack(index, 0, { animate: false })
  }
  layoutTrack()
  requestAnimationFrame(() => {
    layoutTrack()
    requestAnimationFrame(layoutTrack)
  })
  slides.forEach(({ img }) => {
    img.style.opacity = '1'
    img.style.transform = 'translate3d(0,0,0) scale(1)'
  })
  const onResize = () => {
    if (hwLightboxEl !== overlay) {
      window.removeEventListener('resize', onResize)
      return
    }
    layoutTrack()
  }
  window.addEventListener('resize', onResize, { passive: true })
  if (motionOk()) {
    requestAnimationFrame(() => overlay.classList.add('is-open'))
  } else {
    overlay.classList.add('is-open')
  }
}

function renderAddHwInline(groupId, lesson) {
  const form = el('form', { className: 'card', style: 'margin-top:10px;padding:10px' })
  const nextDue = dueDateForNextLesson(groupId, lesson)
  const defaultDue = state.weekOffset === 0 ? nextDue : dateForWeekday(lesson.day)
  const due = el('input', { type: 'date', value: defaultDue, required: true })
  const dueHint = el('p', {
    className: 'muted due-set-hint',
    text: `Сейчас в сроке: ${formatDateRu(defaultDue)}${
      defaultDue === nextDue ? ` · следующая пара по «${lesson.subject}»` : ''
    }`,
  })
  const ta = el('textarea', { maxlength: '1000', placeholder: 'Что задали… (можно только файл)' })
  const file = el('input', {
    type: 'file',
    accept: '.jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.rtf,.odt,.odp,image/*,application/pdf',
    multiple: true,
  })
  const hint = el('p', {
    className: 'muted',
    text: 'Срок = дата пары, к которой нужно сделать ДЗ. «На след. пару» — ближайший день, когда этот предмет снова стоит в расписании. Фото сжимаются автоматически. До 8 файлов, до 20 МБ.',
  })

  const setDue = (iso, note) => {
    if (!iso) return
    due.value = iso
    dueHint.textContent = `Срок: ${formatDateRu(iso)}${note ? ` · ${note}` : ''}`
  }

  const quick = el('div', { className: 'due-quick' }, [
    el('button', {
      type: 'button',
      className: 'chip',
      text: `На след. пару · ${formatDateRu(nextDue)}`,
      onClick: (e) => {
        e.preventDefault()
        e.stopPropagation()
        setDue(dueDateForNextLesson(groupId, lesson), 'следующая пара по предмету')
      },
    }),
  ])
  form.append(
    el('div', { className: 'field' }, [
      el('label', { text: 'Срок (дата пары / сдачи)' }),
      due,
      quick,
      dueHint,
    ]),
    el('div', { className: 'field' }, [el('label', { text: 'Домашнее задание' }), ta]),
    el('div', { className: 'field' }, [el('label', { text: 'Файлы / фото' }), file, hint]),
    el('button', { className: 'btn', type: 'submit', text: 'Добавить ДЗ' }),
  )
  due.addEventListener('change', () => {
    dueHint.textContent = `Срок: ${formatDateRu(due.value)}`
  })
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = form.querySelector('button[type=submit]')
    try {
      if (btn) {
        btn.disabled = true
        btn.textContent = 'Загрузка…'
      }
      let attachments = []
      if (file.files?.length) {
        attachments = await uploadHomeworkFiles(groupId, file.files)
      }
      if (!due.value) {
        throw new Error('Укажите срок ДЗ')
      }
      await addHomework(groupId, {
        subject: lesson.subject,
        text: ta.value,
        dueDate: due.value,
        lessonId: lesson.id,
        attachments,
      })
      if (btn) btn.textContent = 'Добавлено ✓'
      ta.value = ''
      file.value = ''
      await new Promise((r) => setTimeout(r, 700))
      flash(`ДЗ добавлено на ${formatDateRu(due.value)}`)
    } catch (err) {
      if (btn) {
        btn.disabled = false
        btn.textContent = 'Добавить ДЗ'
      }
      flash(err.message, true)
    }
  })
  return form
}

function hwAuthorKey(h) {
  const code = String(h?.authorCodeId || '').trim()
  if (code) return `c:${code}`
  const label = String(h?.authorLabel || '').trim().toLowerCase()
  if (label && !/^староста$/i.test(label)) return `l:${label}`
  return `id:${h?.id || Math.random()}`
}

/** Один автор — один аватар, под ним все его задания подряд. */
function groupHomeworkByAuthor(list) {
  const order = []
  const map = new Map()
  for (const h of list || []) {
    const key = hwAuthorKey(h)
    if (!map.has(key)) {
      map.set(key, { key, head: h, items: [] })
      order.push(key)
    }
    map.get(key).items.push(h)
  }
  return order.map((k) => map.get(k))
}

function renderInlineHwGroups(hwList, groupId, editor) {
  return groupHomeworkByAuthor(hwList).map((g) => {
    // Одна галерея на автора: 3 ДЗ с фото → в лайтбоксе все превью подряд (4/4, не 1/3)
    const shared = []
    const offsets = g.items.map((h) => {
      const offset = shared.length
      for (const photo of collectHwPhotoEntries(h.attachments, h.images)) {
        shared.push(photo.candidates)
      }
      return offset
    })
    return el('div', { className: 'hw-author-block' }, [
      renderAuthorChip(g.head),
      ...g.items.map((h, itemIdx) =>
        el('div', { className: 'hw-inline-item' }, [
          h.text && h.text.trim() ? linkifyHwText(h.text, 'hw-inline-text') : null,
          renderHwAttachments(h.attachments, h.images, {
            shared,
            offset: offsets[itemIdx],
          }),
          editor
            ? el('button', {
                type: 'button',
                className: 'muted',
                style: 'display:block;margin-top:4px',
                text: 'Удалить',
                onClick: async (e) => {
                  e.stopPropagation()
                  if (!confirm('Удалить это ДЗ? Отменить будет нельзя.')) return
                  try {
                    await deleteHomework(groupId, h.id)
                    flash('ДЗ удалено')
                  } catch (err) {
                    flash(err.message, true)
                  }
                },
              })
            : null,
        ]),
      ),
    ])
  })
}

function renderLessonCard(lesson, dateStr, groupId, opts = {}) {
  const ov = getOverridesForDate(groupId, dateStr).find((o) => o.lessonId === lesson.id)
  const view = resolveLesson(lesson, ov)
  const hwAll = getHomework(groupId, { subject: lesson.subject }).filter((h) => !isFormationSkipHw(h))
  const hwList = hwAll.filter((h) => !h.dueDate || h.dueDate === dateStr)
  const hasHw = hwList.length > 0
  const expanded = state.expandedHw.has(lesson.id)
  const editor = canEdit(groupId)
  const showHwToggle = hasHw || editor || !HW_EMPTY_QUIET
  const isLive = !!opts.isLive && !view.cancelled

  const kids = []
  const journalLink =
    editor && !view.cancelled && canGradeGroup(getSession(), groupId)
      ? el('button', {
          type: 'button',
          className: 'lesson-journal-link',
          text: 'Журнал',
          onClick: (e) => {
            e.stopPropagation()
            state.journal = {
              groupId,
              date: dateStr,
              lessonId: lesson.id,
              start: lesson.start,
              end: lesson.end,
              subject: view.effectiveSubject || lesson.subject,
            }
            render()
          },
        })
      : null
  const timeSide = el('div', { className: 'lesson-side' }, [
    el('div', { className: 'lesson-time', text: `${lesson.start}–${lesson.end}` }),
    journalLink,
  ])
  if (isLive) {
    kids.push(
      el('div', { className: 'lesson-top' }, [
        el('span', { className: 'lesson-live-badge', text: 'идёт' }),
        timeSide,
      ]),
      el('p', {
        className: 'lesson-subject',
        text: view.cancelled ? lesson.subject : view.effectiveSubject,
      }),
      lessonMeta(lesson, view),
    )
  } else {
    kids.push(
      el('div', { className: 'lesson-top' }, [
        el('div', {}, [
          el('p', {
            className: 'lesson-subject',
            text: view.cancelled ? lesson.subject : view.effectiveSubject,
          }),
          lessonMeta(lesson, view),
        ]),
        timeSide,
      ]),
    )
  }

  if (showHwToggle) {
    const quietEmpty = HW_EMPTY_QUIET && !hasHw
    kids.push(
      el(
        'button',
        {
          type: 'button',
          className: hasHw
            ? 'hw-toggle'
            : quietEmpty
              ? 'hw-toggle hw-toggle-quiet'
              : 'hw-toggle hw-toggle-empty',
          onClick: async () => {
            const tabId = state.tab || 'schedule'
            if (!motionOk()) {
              if (expanded) state.expandedHw.delete(lesson.id)
              else state.expandedHw.add(lesson.id)
              withTabScrollPreserved(tabId, () => render({ force: true }))
              return
            }
            if (expanded) {
              const body = document.querySelector(
                `[data-hw-body="${CSS.escape(String(lesson.id))}"]`,
              )
              if (body?.classList.contains('hw-body-anim')) {
                body.classList.remove('is-open')
                await new Promise((resolve) => {
                  const done = () => {
                    body.removeEventListener('transitionend', done)
                    resolve()
                  }
                  body.addEventListener('transitionend', done)
                  window.setTimeout(resolve, 480)
                })
              }
              state.expandedHw.delete(lesson.id)
              state.hwExpandAnimId = null
              withTabScrollPreserved(tabId, () => render({ force: true }))
              return
            }
            state.expandedHw.add(lesson.id)
            state.hwExpandAnimId = lesson.id
            withTabScrollPreserved(tabId, () => render({ force: true }))
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const body = document.querySelector(
                  `[data-hw-body="${CSS.escape(String(lesson.id))}"]`,
                )
                body?.classList.add('is-open')
                if (state.hwExpandAnimId === lesson.id) state.hwExpandAnimId = null
              })
            })
          },
        },
        [
          el('span', { className: 'hw-toggle-lead' }, [
            hasHw ? renderHwToggleAvatar(hwList[0]) : null,
            el('span', {
              className: hasHw ? 'hw-label has' : 'hw-label empty',
              text: hasHw
                ? `ДЗ · ${hwList.length}`
                : quietEmpty
                  ? editor
                    ? 'ДЗ · добавить'
                    : 'нет ДЗ'
                  : 'ДЗ не задано',
            }),
          ]),
          textNode(expanded ? '▲' : '▼'),
        ],
      ),
    )
  }

  if (expanded && showHwToggle) {
    const useAnim = motionOk()
    const bodyKids = [
      hasHw
        ? el('div', {}, renderInlineHwGroups(hwList, groupId, editor))
        : el('span', {
            className: 'muted',
            text: editor
              ? 'Пока пусто — добавь ДЗ ниже.'
              : 'Домашнее задание не задано.',
          }),
      editor ? renderAddHwInline(groupId, lesson) : null,
    ]
    if (useAnim) {
      const opening = state.hwExpandAnimId === lesson.id
      kids.push(
        el(
          'div',
          {
            className: opening ? 'hw-body-anim' : 'hw-body-anim is-open',
            dataset: { hwBody: String(lesson.id) },
          },
          [el('div', { className: 'hw-body-clip' }, [el('div', { className: 'hw-body' }, bodyKids)])],
        ),
      )
    } else {
      kids.push(el('div', { className: 'hw-body' }, bodyKids))
    }
  }

  return el(
    'article',
    {
      className: `lesson${view.cancelled ? ' cancelled' : ''}${ov ? ' has-override' : ''}${
        isLive ? ' is-live' : ''
      }`,
    },
    kids,
  )
}

/** Служебная запись ДЗ: отмена построения на дату (скрыта из вкладки ДЗ). */
const FORMATION_SKIP_SUBJECT = '__formation_skip__'

function isFormationSkipHw(h) {
  return h && h.subject === FORMATION_SKIP_SUBJECT
}

function isLessonInPerson(lesson, view) {
  if (!lesson || view?.cancelled) return false
  if (lesson.remote) return false
  return true
}

/** Построение: за 15 мин до первой очной (не отменённой) пары. */
function resolveFormation(groupId, dateStr, lessons) {
  const overs = getOverridesForDate(groupId, dateStr)
  const inPerson = (lessons || []).filter((l) => {
    const ov = overs.find((o) => o.lessonId === l.id)
    return isLessonInPerson(l, resolveLesson(l, ov))
  })
  if (!inPerson.length) {
    return { show: false, reason: 'no_campus' }
  }
  const anchor = inPerson[0]
  return {
    show: true,
    // Отмену подтягиваем из formation_days асинхронно (см. state.formationDay).
    skipped: !!state.formationDay?.cancelled,
    note: state.formationDay?.note || '',
    anchorStart: anchor.start,
    formStart: subtractMinutes(anchor.start, 15),
    anchorSubject: anchor.subject,
  }
}

function renderFormationCard(groupId, dateStr, formation) {
  if (!formation?.show || !formation.formStart) return null
  const editable = canEdit(groupId)

  const toggle = async (cancelled) => {
    try {
      const res = await setFormationCancelled(groupId, dateStr, cancelled, '')
      state.formationDay = { cancelled: !!res?.cancelled, note: '', canEdit: true, marks: [] }
      flash(cancelled ? 'Построение отменено на этот день' : 'Построение снова в расписании')
      render({ force: true })
    } catch (err) {
      flash(err.message, true)
    }
  }

  if (formation.skipped) {
    return el('article', { className: 'lesson lesson-formation cancelled' }, [
      el('div', { className: 'lesson-top' }, [
        el('div', {}, [
          el('p', { className: 'lesson-subject', text: 'Построение' }),
          el('div', { className: 'lesson-meta' }, [
            el('span', { className: 'badge warn', text: 'не будет' }),
            textNode(' · отменено на этот день'),
          ]),
        ]),
        el('div', { className: 'lesson-time', text: '—' }),
      ]),
      editable
        ? el('button', {
            type: 'button',
            className: 'btn secondary',
            style: 'margin-top:10px',
            text: 'Вернуть построение',
            onClick: () => void toggle(false),
          })
        : null,
    ])
  }

  return el('article', { className: 'lesson lesson-formation' }, [
    el('div', { className: 'lesson-top' }, [
      el('div', {}, [
        el('p', { className: 'lesson-subject', text: 'Построение' }),
        el('div', {
          className: 'lesson-meta',
          text: `плац · за 15 мин до первой очной пары (${formation.anchorStart})`,
        }),
      ]),
      el('div', { className: 'lesson-time', text: formation.formStart }),
    ]),
    editable
      ? el('div', { className: 'formation-actions' }, [
          el('button', {
            type: 'button',
            className: 'btn secondary',
            style: 'margin-top:10px',
            text: 'Отменить построение',
            onClick: () => void toggle(true),
          }),
          el('button', {
            type: 'button',
            className: 'btn',
            style: 'margin-top:10px',
            text: 'Расход построения',
            onClick: () => {
              state.formationMarks = {
                groupId,
                date: dateStr,
                formStart: formation.formStart,
                anchorStart: formation.anchorStart,
              }
              render({ force: true })
            },
          }),
        ])
      : null,
  ])
}

/** Подтянуть статус построения дня (отмена + расход) без блокировки UI. */
let formationLoadKey = ''
function loadFormationDay(groupId, dateStr) {
  const key = `${groupId}|${dateStr}`
  if (formationLoadKey === key) return
  formationLoadKey = key
  const session = getSession()
  if (!session?.token) {
    state.formationDay = { cancelled: false, note: '', canEdit: false, marks: [] }
    return
  }
  getFormationDay(groupId, dateStr)
    .then((day) => {
      if (formationLoadKey !== key) return
      const before = state.formationDay?.cancelled
      state.formationDay = day
      if (before !== day.cancelled) softRefreshCurrentTab()
    })
    .catch(() => {
      formationLoadKey = ''
    })
}

/** Экран расхода построения: явка на построение + текст для чата. */
function renderFormationMarksOverlay() {
  const spec = state.formationMarks
  if (!spec) return null
  const session = getSession()
  if (!session?.token) {
    state.formationMarks = null
    return null
  }
  const group = getGroup(spec.groupId)
  const close = () => {
    state.formationMarks = null
    render({ force: true })
  }

  const root = el('div', { className: 'journal-overlay' })
  root.append(
    el('button', {
      type: 'button',
      className: 'journal-backdrop',
      'aria-label': 'Закрыть',
      onClick: close,
    }),
  )
  const sheet = el('div', { className: 'journal-sheet' })
  const head = el('div', { className: 'journal-head' }, [
    el('button', { type: 'button', className: 'journal-back', text: '← Назад', onClick: close }),
    el('div', { className: 'journal-head-text' }, [
      el('p', {
        className: 'muted journal-kicker',
        text: `${group?.name || 'Группа'} · ${formatDateRu(spec.date)}`,
      }),
      el('h2', { text: 'Расход построения' }),
      el('p', { className: 'muted', text: `${spec.formStart} · до пары в ${spec.anchorStart}` }),
    ]),
  ])
  const tools = el('div', { className: 'journal-tools' })
  const list = el('div', { className: 'journal-list', text: 'Загружаем…' })
  sheet.append(head, tools, list)
  root.append(sheet)

  const paint = async () => {
    try {
      const [students, day] = await Promise.all([
        listStudents(spec.groupId),
        getFormationDay(spec.groupId, spec.date),
      ])
      if (day.cancelled) {
        state.formationMarks = null
        flash('Построение отменено — расхода нет', true)
        render({ force: true })
        return
      }
      const byStudent = new Map((day.marks || []).map((m) => [m.studentId, m]))
      paintFormationTools(spec, group, students, byStudent, tools, paint)
      paintFormationRows(spec, students, byStudent, list, paint)
    } catch (err) {
      list.replaceChildren(
        el('p', {
          className: 'muted',
          text: err.message || 'Не удалось открыть расход. Выполни supabase/journal_v2.sql.',
        }),
      )
    }
  }
  void paint()
  return root
}

function paintFormationTools(spec, group, students, byStudent, tools, reload) {
  tools.replaceChildren()
  const links = el('div', { className: 'journal-links' })
  links.append(
    el('button', {
      type: 'button',
      className: 'journal-link',
      text: 'Текст расхода',
      onClick: async () => {
        const present = students.filter((s) => byStudent.get(s.id)?.attendance === 'present')
        const absent = students.filter((s) => byStudent.get(s.id)?.attendance === 'absent')
        const unmarked = students.filter((s) => !byStudent.get(s.id)?.attendance)
        const lines = [
          `Построение ${group?.name || ''} · ${formatDateRu(spec.date)}:`,
          `По списку: ${students.length}`,
          `На построении: ${present.length}`,
        ]
        if (unmarked.length) lines.push(`Не отмечены: ${unmarked.length}`)
        if (absent.length) {
          lines.push(`Отсутствуют: ${absent.length}`)
          for (const s of absent) {
            const reason = (byStudent.get(s.id)?.comment || '').trim()
            lines.push(reason ? `${s.surname} (${reason})` : s.surname)
          }
        } else {
          lines.push('Отсутствуют: 0')
        }
        const text = lines.join('\n')
        try {
          await navigator.clipboard.writeText(text)
          flash('Текст расхода скопирован')
        } catch {
          flash(text)
        }
      },
    }),
  )
  tools.append(
    links,
    el('p', {
      className: 'muted journal-hint',
      text: 'Отмечай только построение. Оценки и пары — в журнале пары.',
    }),
  )
}

function paintFormationRows(spec, students, byStudent, list, reload) {
  list.replaceChildren()
  if (!students.length) {
    list.append(el('p', { className: 'muted', text: 'В этой группе пока нет студентов.' }))
    return
  }
  const repaint = () => paintFormationRows(spec, students, byStudent, list, reload)
  students.forEach((student, index) => {
    const mark = byStudent.get(student.id) || { attendance: '', comment: '' }
    const save = async (attendance) => {
      const next = attendance === mark.attendance ? '' : attendance
      byStudent.set(student.id, { ...mark, attendance: next })
      repaint()
      try {
        await setFormationMark(student.id, spec.date, next, mark.comment || '')
      } catch (err) {
        byStudent.set(student.id, mark)
        flash(err.message, true)
        repaint()
      }
    }
    const seg = el('div', { className: 'seg' })
    for (const [id, label] of [
      ['present', '+'],
      ['absent', 'н'],
      ['sick', 'б'],
    ]) {
      seg.append(
        el('button', {
          type: 'button',
          className: mark.attendance === id ? 'on' : '',
          text: label,
          onClick: () => void save(id),
        }),
      )
    }
    const comment = el('input', {
      maxlength: '200',
      placeholder: 'Причина',
      value: mark.comment || '',
    })
    comment.addEventListener('change', async () => {
      const value = comment.value
      byStudent.set(student.id, { ...mark, comment: value })
      try {
        await setFormationMark(student.id, spec.date, mark.attendance || '', value)
      } catch (err) {
        flash(err.message, true)
      }
    })
    list.append(
      el('article', { className: 'journal-row' }, [
        el('span', { className: 'journal-num', text: String(index + 1) }),
        el('div', { className: 'journal-person' }, [
          el('strong', { text: personSurname(student) }),
          personRest(student) ? el('span', { className: 'muted', text: personRest(student) }) : null,
        ]),
        el('div', { className: 'journal-controls' }, [seg, comment]),
      ]),
    )
  })
}

function renderSchedule() {
  const group = getGroup(state.groupId)
  const lessons = getLessons(group.id, state.day)
  const dateStr = dateForWeekday(state.day)
  loadFormationDay(group.id, dateStr)
  const nowStatus = getScheduleNowStatus(group.id, dateStr, lessons)
  const liveId = nowStatus?.kind === 'now' ? nowStatus.lesson?.id : null
  const frag = el('div', { className: daySwapPanelClass('panel') }, [
    el('p', {
      className: 'muted',
      text: `${DAY_NAMES[state.day] || ''} · ${formatDateRu(dateStr)}`,
    }),
  ])

  // Построение: за 15 мин до первой очной пары (учитывает отмены и дистант).
  // Полностью выключить: SHOW_FORMATION = false
  const SHOW_FORMATION = true
  const formation = SHOW_FORMATION ? resolveFormation(group.id, dateStr, lessons) : null

  const strip = renderNowStrip(nowStatus, formation, dateStr)
  if (strip) frag.append(strip)

  if (!lessons.length) {
    frag.append(el('div', { className: 'empty', text: 'В этот день пар нет' }))
    return frag
  }

  if (formation) {
    const card = renderFormationCard(group.id, dateStr, formation)
    if (card) {
      frag.append(card)
      if (!formation.skipped) {
        frag.append(el('div', { className: 'break-line', text: '15 мин до пары' }))
      }
    }
  }

  lessons.forEach((lesson, i) => {
    frag.append(
      renderLessonCard(lesson, dateStr, group.id, {
        isLive: !!(liveId && lesson.id === liveId),
      }),
    )
    if (i < lessons.length - 1) {
      const mins = breakMinutes(lesson.end, lessons[i + 1].start)
      if (mins > 0) {
        frag.append(el('div', { className: 'break-line', text: `перемена ${mins} мин` }))
      }
    }
  })
  return frag
}

/**
 * Календарь на месяц: сетка Пн–Вс, точки на днях с парами.
 * Клик по дню переключает расписание на его день недели и нужную неделю.
 */
function renderMonthCalendar() {
  const group = getGroup(state.groupId)
  if (!group) return null

  const now = new Date()
  const base = new Date(now.getFullYear(), now.getMonth() + Number(state.calendarMonthOffset || 0), 1)
  const year = base.getFullYear()
  const month = base.getMonth()

  const todayStr = todayISO()
  const monthTitle = base.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })

  // Понедельник — первый столбец. getDay(): 0 = Вс.
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const hasSat = getLessons(group.id, 6).length > 0

  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(el('span', { className: 'cal-cell is-empty' }))

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d, 12)
    const dow = date.getDay() || 7
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const isToday = iso === todayStr
    const isWeekend = dow === 7 || (dow === 6 && !hasSat)
    const lessons = isWeekend ? [] : getLessons(group.id, dow)
    const thisWeekStart = dateForWeekday(1, state.weekOffset)
    const selected = iso === dateForWeekday(state.day, state.weekOffset)

    // Сдвиг недели относительно «этой», чтобы клик открыл именно эту дату
    const diffDays = Math.round(
      (new Date(`${iso}T12:00:00`) - new Date(`${thisWeekStart}T12:00:00`)) / 86400000,
    )
    const weekOffset = Math.round(diffDays / 7)

    cells.push(
      el(
        'button',
        {
          type: 'button',
          className: [
            'cal-cell',
            isToday ? 'is-today' : '',
            selected ? 'is-selected' : '',
            isWeekend ? 'is-weekend' : '',
            lessons.length ? 'has-lessons' : '',
          ]
            .filter(Boolean)
            .join(' '),
          onClick: () => {
            if (isWeekend) return
            hapticTap()
            state.weekOffset = weekOffset
            state.day = dow
            state.calendarOpen = false
            if (!refreshTabPanes(['schedule'])) render({ force: true })
            else softUpdateNav()
          },
        },
        [
          el('span', { className: 'cal-day', text: String(d) }),
          lessons.length ? el('span', { className: 'cal-dot' }) : null,
        ],
      ),
    )
  }

  // Пустые клетки в конце, чтобы сетка не «рвалась»
  while (cells.length % 7 !== 0) cells.push(el('span', { className: 'cal-cell is-empty' }))

  const shift = (delta) => {
    state.calendarMonthOffset = Number(state.calendarMonthOffset || 0) + delta
    if (!refreshTabPanes(['schedule'])) render({ force: true })
    else softUpdateNav()
  }

  return el('div', { className: 'card cal-card' }, [
    el('div', { className: 'cal-head' }, [
      el('button', {
        type: 'button',
        className: 'cal-nav',
        text: '‹',
        title: 'Прошлый месяц',
        onClick: () => shift(-1),
      }),
      el('span', { className: 'cal-title', text: monthTitle }),
      el('button', {
        type: 'button',
        className: 'cal-nav',
        text: '›',
        title: 'Следующий месяц',
        onClick: () => shift(1),
      }),
    ]),
    el(
      'div',
      { className: 'cal-dow' },
      ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((n) =>
        el('span', { className: 'cal-dow-cell', text: n }),
      ),
    ),
    el('div', { className: 'cal-grid' }, cells),
    el('p', {
      className: 'cal-hint muted',
      text: hasSat ? 'Точка — есть пары. Суббота в расписании есть.' : 'Точка — есть пары.',
    }),
  ])
}

function weekdayNumFromIso(iso) {
  const s = String(iso || '').slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return 0
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0)
  const js = d.getDay()
  return js === 0 ? 7 : js
}

function renderHwTab() {
  const group = getGroup(state.groupId)
  const weekStart = dateForWeekday(1)
  const weekEnd = dateForWeekday(6)
  const list = getHomework(group.id).filter((h) => {
    if (isFormationSkipHw(h)) return false
    if (!h.dueDate) return state.weekOffset === 0
    return h.dueDate >= weekStart && h.dueDate <= weekEnd
  })

  // Пока реальные ДЗ ещё тянутся с сервера и локально пусто — показываем скелетоны,
  // чтобы контент не «прыгал».
  if (initialDataLoading && isRemoteMode() && !list.length) {
    const sk = el('div', { className: daySwapPanelClass('panel', { allow: !HW_TAB_BY_DAY }) }, [
      el('p', { className: 'muted', text: `За ${weekRangeLabel().toLowerCase()}` }),
    ])
    for (let i = 0; i < 3; i++) {
      sk.append(
        el('div', { className: 'hw-card hw-skeleton' }, [
          el('div', { className: 'sk sk-title' }),
          el('div', { className: 'sk sk-line' }),
          el('div', { className: 'sk sk-line short' }),
        ]),
      )
    }
    return sk
  }

  const panel = el('div', { className: daySwapPanelClass('panel', { allow: !HW_TAB_BY_DAY }) }, [
    el('p', {
      className: 'muted',
      text: `За ${weekRangeLabel().toLowerCase()}`,
    }),
  ])
  if (!list.length) {
    panel.append(
      el('div', {
        className: 'empty',
        text: 'На эту неделю ДЗ нет. Листай ← → или смотри вкладку «Расписание».',
      }),
    )
    return panel
  }

  if (!HW_TAB_BY_DAY) {
    for (const h of list) {
      panel.append(
        renderHwCard(h, {
          showDue: true,
          groupId: group.id,
          canDelete: canEdit(group.id),
        }),
      )
    }
    return panel
  }

  const byDay = new Map()
  for (const h of list) {
    const key = h.dueDate || ''
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key).push(h)
  }
  const keys = [...byDay.keys()].sort((a, b) => {
    if (!a) return 1
    if (!b) return -1
    return a.localeCompare(b)
  })

  for (const key of keys) {
    const items = byDay.get(key)
    items.sort((a, b) => String(a.subject || '').localeCompare(String(b.subject || ''), 'ru'))
    const dayNum = key ? weekdayNumFromIso(key) : 0
    const title = key
      ? `${DAY_SHORT[dayNum] || DAY_NAMES[dayNum] || ''} · ${formatDateRu(key)}`
      : 'Без даты'
    panel.append(
      el(
        'div',
        {
          className: 'hw-day-block',
          dataset: dayNum ? { hwDay: String(dayNum) } : undefined,
        },
        [
          el('div', { className: 'hw-day-head' }, [
            el('h2', { className: 'hw-day-title', text: title }),
            el('span', { className: 'hw-day-count', text: String(items.length) }),
          ]),
          ...items.map((h) =>
            renderHwCard(h, {
              showDue: false,
              groupId: group.id,
              canDelete: canEdit(group.id),
            }),
          ),
        ],
      ),
    )
  }
  return panel
}

/** Открыт ли сейчас список ДЗ (вкладка «Учёба» в режиме «Домашка»). */
function isHwView() {
  return state.tab === 'grades' && state.studyMode === 'hw'
}

function maybeSeekHwDay() {
  // Прыжок к дню — только по явному нажатию на день (notify: true), не при открытии вкладки
  if (!HW_TAB_BY_DAY || !isHwView()) {
    state.hwDaySeek = null
    return
  }
  const seek = state.hwDaySeek
  state.hwDaySeek = null
  if (!seek || !seek.notify) return

  const day = state.day
  const pane = document.querySelector('#tab-stage .tab-pane[data-tab="grades"]')
  const block =
    (pane && pane.querySelector(`[data-hw-day="${day}"]`)) ||
    document.querySelector(`[data-hw-day="${day}"]`)
  if (block) {
    requestAnimationFrame(() => {
      if (pane) {
        const top = block.offsetTop - 8
        pane.scrollTo({
          top: Math.max(0, top),
          behavior: motionOk() ? 'smooth' : 'auto',
        })
      } else {
        block.scrollIntoView({
          behavior: motionOk() ? 'smooth' : 'auto',
          block: 'start',
        })
      }
      block.classList.add('is-jump-target')
      window.setTimeout(() => block.classList.remove('is-jump-target'), 700)
    })
    return
  }
  if (seek.notify) {
    const label = DAY_SHORT[day] || DAY_NAMES[day] || 'этот день'
    flash(`На ${label} ДЗ нет`)
  }
}

function renderHwToggleAvatar(h) {
  if (!PROFILE_AVATARS || !h) return null
  const label = (h.authorLabel || '').trim()
  if (!label || /^староста$/i.test(label)) return null
  const ava = (h.authorAvatarUrl || '').trim()
  const letter = label.charAt(0).toUpperCase() || '?'
  if (ava) {
    return el('img', {
      className: 'hw-mini-ava',
      src: ava,
      alt: '',
      loading: 'lazy',
      referrerpolicy: 'no-referrer',
    })
  }
  return el('span', { className: 'hw-mini-letter', text: letter })
}

function renderAuthorChip(h) {
  if (!PROFILE_AVATARS) return null
  const label = (h?.authorLabel || '').trim()
  // Пустые/«Староста» не показываем — это старые ДЗ без автора, а не реальное имя
  if (!label || /^староста$/i.test(label)) return null
  const letter = label.charAt(0).toUpperCase() || '?'
  const ava = (h?.authorAvatarUrl || '').trim()
  return el('div', { className: 'hw-author' }, [
    ava
      ? el('img', {
          className: 'hw-author-ava',
          src: ava,
          alt: '',
          loading: 'lazy',
          referrerpolicy: 'no-referrer',
        })
      : el('span', { className: 'hw-author-letter', text: letter }),
    el('span', { className: 'hw-author-name', text: label }),
  ])
}

/** Текст ДЗ: http(s)/www → кликабельные ссылки, без вылезания за рамку. */
function linkifyHwText(raw, className = 'hw-text') {
  const s = String(raw || '')
  if (!s.trim()) return null
  const re = /(https?:\/\/[^\s<]+)|(www\.[^\s<]+)/gi
  const kids = []
  let last = 0
  for (const m of s.matchAll(re)) {
    if (m.index > last) kids.push(s.slice(last, m.index))
    let url = m[0]
    let trail = ''
    while (url && /[.,);:!?»"'\]}>]$/.test(url)) {
      trail = url.slice(-1) + trail
      url = url.slice(0, -1)
    }
    const href = url.startsWith('www.') ? `https://${url}` : url
    try {
      const u = new URL(href)
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        kids.push(
          el('a', {
            href: u.href,
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'hw-link',
            text: url,
          }),
        )
        if (trail) kids.push(trail)
      } else {
        kids.push(m[0])
      }
    } catch {
      kids.push(m[0])
    }
    last = m.index + m[0].length
  }
  if (last < s.length) kids.push(s.slice(last))
  return el('p', { className }, kids.length ? kids : [s])
}

function renderHwCard(h, { showDue = true, groupId = '', canDelete = false } = {}) {
  const by = (h?.authorLabel || '').trim()
  const showBy = by && !/^староста$/i.test(by)
  return el('div', { className: 'card hw-card' }, [
    el('div', { className: 'hw-card-head' }, [
      PROFILE_AVATARS ? renderHwToggleAvatar(h) : null,
      el('h3', { text: h.subject }),
    ]),
    PROFILE_AVATARS && showBy
      ? el('p', {
          className: 'muted hw-card-by',
          text: `от ${by}`,
        })
      : null,
    showDue && h.dueDate
      ? el('p', { className: 'muted', text: `на ${formatDateRu(h.dueDate)}` })
      : null,
    h.text && h.text.trim() ? linkifyHwText(h.text, 'hw-text') : null,
    renderHwAttachments(h.attachments, h.images),
    canDelete
      ? el('button', {
          type: 'button',
          className: 'muted',
          style: 'display:block;margin-top:4px',
          text: 'Удалить',
          onClick: async (e) => {
            e.stopPropagation()
            if (!confirm('Удалить это ДЗ? Отменить будет нельзя.')) return
            try {
              await deleteHomework(groupId, h.id)
              flash('ДЗ удалено')
            } catch (err) {
              flash(err.message, true)
            }
          },
        })
      : null,
  ])
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Не удалось открыть фото'))
    }
    img.src = url
  })
}

/** Редактор: подвинуть/приблизить фото под кружок. Возвращает File или null (отмена). */
function openAvatarCropEditor(file) {
  return new Promise(async (resolve) => {
    let img
    try {
      img = await loadImageFromFile(file)
    } catch (err) {
      flash(err.message || 'Не удалось открыть фото', true)
      resolve(null)
      return
    }

    const VIEW = 260
    const OUT = 512
    const nw = img.naturalWidth || img.width
    const nh = img.naturalHeight || img.height
    if (!nw || !nh) {
      flash('Пустое фото', true)
      resolve(null)
      return
    }

    const coverBase = Math.max(VIEW / nw, VIEW / nh)
    let zoom = 1
    let ox = 0
    let oy = 0
    let dragging = false
    let lastX = 0
    let lastY = 0
    let settled = false

    const finish = (value) => {
      if (settled) return
      settled = true
      overlay.remove()
      document.body.style.overflow = prevOverflow
      resolve(value)
    }

    const canvas = el('canvas', {
      className: 'avatar-crop-canvas',
      width: String(VIEW),
      height: String(VIEW),
    })
    const ctx = canvas.getContext('2d')

    const clampOffset = () => {
      const s = coverBase * zoom
      const dw = nw * s
      const dh = nh * s
      const maxX = Math.max(0, (dw - VIEW) / 2)
      const maxY = Math.max(0, (dh - VIEW) / 2)
      ox = Math.max(-maxX, Math.min(maxX, ox))
      oy = Math.max(-maxY, Math.min(maxY, oy))
    }

    const paint = () => {
      if (!ctx) return
      clampOffset()
      const s = coverBase * zoom
      const dw = nw * s
      const dh = nh * s
      const dx = (VIEW - dw) / 2 + ox
      const dy = (VIEW - dh) / 2 + oy
      ctx.clearRect(0, 0, VIEW, VIEW)
      ctx.save()
      ctx.beginPath()
      ctx.arc(VIEW / 2, VIEW / 2, VIEW / 2 - 1, 0, Math.PI * 2)
      ctx.closePath()
      ctx.clip()
      ctx.fillStyle = '#111'
      ctx.fillRect(0, 0, VIEW, VIEW)
      ctx.drawImage(img, dx, dy, dw, dh)
      ctx.restore()
      ctx.beginPath()
      ctx.arc(VIEW / 2, VIEW / 2, VIEW / 2 - 1, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    const zoomLabel = el('span', { className: 'avatar-crop-zoom-val', text: '100%' })
    const zoomInput = el('input', {
      type: 'range',
      className: 'avatar-crop-zoom',
      min: '100',
      max: '300',
      step: '1',
      value: '100',
    })
    zoomInput.addEventListener('input', () => {
      zoom = Number(zoomInput.value) / 100
      zoomLabel.textContent = `${Math.round(zoom * 100)}%`
      paint()
    })

    const onPointerDown = (e) => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      canvas.setPointerCapture?.(e.pointerId)
      e.preventDefault()
    }
    const onPointerMove = (e) => {
      if (!dragging) return
      ox += e.clientX - lastX
      oy += e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      paint()
      e.preventDefault()
    }
    const onPointerUp = (e) => {
      dragging = false
      try {
        canvas.releasePointerCapture?.(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)

    const saveBtn = el('button', {
      type: 'button',
      className: 'btn',
      text: 'Сохранить',
      onClick: async () => {
        saveBtn.disabled = true
        saveBtn.textContent = '…'
        try {
          clampOffset()
          const s = coverBase * zoom
          const out = document.createElement('canvas')
          out.width = OUT
          out.height = OUT
          const octx = out.getContext('2d')
          if (!octx) throw new Error('Нет canvas')
          const scaleOut = OUT / VIEW
          const dw = nw * s * scaleOut
          const dh = nh * s * scaleOut
          const dx = (OUT - dw) / 2 + ox * scaleOut
          const dy = (OUT - dh) / 2 + oy * scaleOut
          octx.fillStyle = '#111'
          octx.fillRect(0, 0, OUT, OUT)
          octx.drawImage(img, dx, dy, dw, dh)
          const blob = await new Promise((res) => out.toBlob(res, 'image/jpeg', 0.9))
          if (!blob) throw new Error('Не удалось обрезать')
          finish(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }))
        } catch (err) {
          saveBtn.disabled = false
          saveBtn.textContent = 'Сохранить'
          flash(err.message || 'Ошибка обрезки', true)
        }
      },
    })

    const cancelBtn = el('button', {
      type: 'button',
      className: 'btn secondary',
      text: 'Отмена',
      onClick: () => finish(null),
    })

    const overlay = el('div', {
      className: 'avatar-crop-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Подгонка фото',
    })
    overlay.append(
      el('div', { className: 'avatar-crop-sheet' }, [
        el('h3', { text: 'Подгони фото' }),
        el('p', {
          className: 'muted',
          text: 'Перетащи пальцем/мышью и подвигай масштаб — в кружке то, что увидят все.',
        }),
        el('div', { className: 'avatar-crop-stage' }, [canvas]),
        el('div', { className: 'avatar-crop-zoom-row' }, [
          el('span', { className: 'muted', text: 'Масштаб' }),
          zoomInput,
          zoomLabel,
        ]),
        el('div', { className: 'avatar-crop-actions' }, [cancelBtn, saveBtn]),
      ]),
    )
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(null)
    })

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.append(overlay)
    paint()
  })
}

function renderProfileAvatarControls(session) {
  if (!PROFILE_AVATARS || !session) return null
  const file = el('input', {
    type: 'file',
    accept: 'image/jpeg,image/png,image/webp',
    style: 'display:none',
  })
  file.addEventListener('change', async () => {
    const f = file.files?.[0]
    file.value = ''
    if (!f) return
    try {
      const cropped = await openAvatarCropEditor(f)
      if (!cropped) return
      await uploadProfileAvatar(cropped)
      flash('Фото обновлено')
      render()
    } catch (err) {
      flash(err.message || 'Не удалось загрузить', true)
    }
  })
  const links = [
    file,
    el('button', {
      type: 'button',
      className: 'more-photo-link',
      text: session.avatarUrl ? 'Сменить фото' : 'Поставить фото',
      onClick: () => file.click(),
    }),
  ]
  if (session.avatarUrl) {
    links.push(
      el('span', { className: 'more-photo-sep', text: '·', 'aria-hidden': 'true' }),
      el('button', {
        type: 'button',
        className: 'more-photo-link',
        text: 'Удалить',
        onClick: async () => {
          if (!confirm('Удалить фото профиля?')) return
          try {
            await clearProfileAvatar()
            flash('Фото удалено')
            render()
          } catch (err) {
            flash(err.message || 'Не удалось удалить', true)
          }
        },
      }),
    )
  }
  return el('div', { className: 'more-avatar-actions more-avatar-links' }, [
    el('div', { className: 'more-photo-links-row' }, links),
  ])
}

function renderTeacherSlotCard(s) {
  const meta = []
  if (s.cancelled) meta.push(el('span', { className: 'badge warn', text: 'пары не будет' }))
  else if (s.overrideType === 'room_only') meta.push(el('span', { className: 'badge warn', text: 'другой кабинет' }))
  else if (s.subjectChanged) meta.push(el('span', { className: 'badge warn', text: 'замена предмета' }))
  return el('div', { className: `card teacher-slot${s.cancelled ? ' cancelled' : ''}` }, [
    el('div', { className: 'teacher-slot-top' }, [
      el('strong', { text: `${s.start}–${s.end}` }),
      el('span', { className: 'muted', text: s.teacher }),
    ]),
    el('div', { text: s.subject }),
    el('div', {
      className: 'muted',
      text: [
        s.room ? `ауд. ${s.room}` : s.remote ? 'дистанционно' : '',
        s.groupName ? `группа ${s.groupName}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    }),
    meta.length ? el('div', { className: 'lesson-meta', style: 'margin-top:6px' }, meta) : null,
    s.subjectChanged && !s.cancelled
      ? el('p', {
          className: 'muted',
          style: 'margin:6px 0 0;font-size:13px',
          text: 'При замене предмета на паре может быть другой преподаватель.',
        })
      : null,
    s.note ? el('p', { className: 'muted', style: 'margin:6px 0 0;font-size:13px', text: s.note }) : null,
  ])
}

function renderTeachersTab() {
  const mode = state.teacherMode === 'room' ? 'room' : 'teacher'
  const panel = el('div', { className: 'panel' })

  const switchRow = el('div', { className: 'due-quick' }, [
    el('button', {
      type: 'button',
      className: `chip${mode === 'teacher' ? ' chip-active' : ''}`,
      text: 'Преподаватель',
      onClick: () => {
        if (mode === 'teacher') return
        state.teacherMode = 'teacher'
        render({ force: true })
      },
    }),
    el('button', {
      type: 'button',
      className: `chip${mode === 'room' ? ' chip-active' : ''}`,
      text: 'Аудитория',
      onClick: () => {
        if (mode === 'room') return
        state.teacherMode = 'room'
        render({ force: true })
      },
    }),
  ])
  panel.append(el('div', { className: 'card teacher-search teacher-mode' }, [switchRow]))

  panel.append(mode === 'room' ? renderRoomSearch() : renderTeacherSearch())
  return panel
}

/** Кто в какой аудитории: поиск по номеру кабинета. */
function renderRoomSearch() {
  if (!state.roomDate) state.roomDate = todayISO()
  const wrap = el('div', {})
  const results = el('div', { className: 'teacher-results' })

  const input = el('input', {
    type: 'search',
    id: 'room-query-input',
    value: state.roomQuery || '',
    placeholder: 'Например, 210',
    autocomplete: 'off',
    enterKeyHint: 'search',
  })
  const dateInput = el('input', {
    type: 'date',
    id: 'room-date-input',
    value: state.roomDate,
  })
  const dateLabel = el('label', { text: teacherDateLabel(state.roomDate) })

  const syncState = () => {
    state.roomQuery = input.value
    state.roomDate = dateInput.value || todayISO()
  }

  const paintResults = () => {
    syncState()
    dateLabel.textContent = teacherDateLabel(state.roomDate)
    results.replaceChildren(...buildRoomResultsNodes(input, dateInput, paintResults))
  }

  input.addEventListener('input', () => paintResults())
  dateInput.addEventListener('change', () => paintResults())
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      paintResults()
    }
  })

  wrap.append(
    el('div', { className: 'card teacher-search' }, [
      el('h3', { text: 'Кто в аудитории' }),
      el('p', {
        className: 'muted',
        text: 'Введи номер кабинета — увидишь, какие группы и пары там по расписанию в выбранный день, с учётом замен.',
      }),
      el('div', { className: 'field' }, [el('label', { text: 'Аудитория' }), input]),
      el('div', { className: 'field' }, [dateLabel, dateInput]),
      el('div', { className: 'due-quick' }, [
        el('button', {
          type: 'button',
          className: 'chip',
          text: 'Сегодня',
          onClick: () => {
            state.roomDate = todayISO()
            dateInput.value = state.roomDate
            paintResults()
          },
        }),
      ]),
    ]),
    results,
  )
  paintResults()
  return wrap
}

function buildRoomResultsNodes(input, dateInput, paintResults) {
  const q = (state.roomQuery || '').trim()
  const dateStr = state.roomDate || todayISO()
  const nodes = []

  if (q.length < 1) {
    nodes.push(
      el('p', {
        className: 'muted',
        text: 'Введите номер кабинета — например, 210 или спортзал.',
      }),
    )
    const rooms = listScheduleRooms()
    if (rooms.length) {
      // быстрые чипы популярных кабинетов
      nodes.push(
        el(
          'div',
          { className: 'teacher-suggest' },
          rooms.slice(0, 10).map((room) =>
            el('button', {
              type: 'button',
              className: 'chip',
              text: room,
              onClick: () => {
                state.roomQuery = room
                input.value = room
                paintResults()
              },
            }),
          ),
        ),
      )
    }
    return nodes
  }

  const suggestions = suggestRooms(q, 10)
  if (suggestions.length) {
    nodes.push(
      el(
        'div',
        { className: 'teacher-suggest' },
        suggestions.map((room) =>
          el('button', {
            type: 'button',
            className: `chip${normalizeSuggestKey(room) === normalizeSuggestKey(q) ? ' chip-active' : ''}`,
            text: room,
            onClick: () => {
              state.roomQuery = room
              input.value = room
              paintResults()
            },
          }),
        ),
      ),
    )
  }

  const { dayNum, slots } = findRoomSlots(q, dateStr)
  const active = slots.filter((s) => !s.cancelled)

  if (dayNum === 7) {
    nodes.push(el('div', { className: 'empty', text: 'В воскресенье пар в расписании нет.' }))
    return nodes
  }
  if (!slots.length) {
    nodes.push(
      el('div', {
        className: 'empty',
        text: `Аудитория «${q}» на ${formatDateRu(dateStr)} (${DAY_NAMES[dayNum] || 'день'}) в расписании не занята.`,
      }),
    )
    return nodes
  }

  nodes.push(
    el('p', {
      className: 'muted',
      text: `${DAY_NAMES[dayNum] || ''} · ${formatDateRu(dateStr)} · пар в этом кабинете: ${active.length}`,
    }),
  )

  // группируем по номеру кабинета — при частичном совпадении их может быть несколько
  const byRoom = new Map()
  for (const s of slots) {
    if (!byRoom.has(s.room)) byRoom.set(s.room, [])
    byRoom.get(s.room).push(s)
  }
  for (const [room, list] of byRoom) {
    nodes.push(el('h3', { style: 'margin:14px 0 6px;font-size:15px', text: `Аудитория ${room}` }))
    for (const s of list) nodes.push(renderRoomSlotCard(s))
  }
  return nodes
}

function renderRoomSlotCard(s) {
  const meta = []
  if (s.cancelled) meta.push(el('span', { className: 'badge warn', text: 'пары не будет' }))
  else if (s.overrideType === 'room_only') meta.push(el('span', { className: 'badge warn', text: 'кабинет заменён' }))
  else if (s.subjectChanged) meta.push(el('span', { className: 'badge warn', text: 'замена предмета' }))
  return el('div', { className: `card teacher-slot${s.cancelled ? ' cancelled' : ''}` }, [
    el('div', { className: 'teacher-slot-top' }, [
      el('strong', { text: `${s.start}–${s.end}` }),
      el('span', { className: 'muted', text: s.groupName || 'группа' }),
    ]),
    el('div', { text: s.subject }),
    el('div', {
      className: 'muted',
      text: [s.teacher ? s.teacher : '', s.remote ? 'дистанционно' : ''].filter(Boolean).join(' · '),
    }),
    meta.length ? el('div', { className: 'lesson-meta', style: 'margin-top:6px' }, meta) : null,
    s.note ? el('p', { className: 'muted', style: 'margin:6px 0 0;font-size:13px', text: s.note }) : null,
  ])
}

function renderTeacherSearch() {
  if (!state.teacherDate) state.teacherDate = todayISO()
  const panel = el('div', {})
  const results = el('div', { className: 'teacher-results' })

  const input = el('input', {
    type: 'search',
    id: 'teacher-query-input',
    value: state.teacherQuery || '',
    placeholder: 'Начните вводить фамилию…',
    autocomplete: 'off',
    enterKeyHint: 'search',
  })
  const dateInput = el('input', {
    type: 'date',
    id: 'teacher-date-input',
    value: state.teacherDate,
  })
  const dateLabel = el('label', { text: teacherDateLabel(state.teacherDate) })

  const syncState = () => {
    state.teacherQuery = input.value
    state.teacherDate = dateInput.value || todayISO()
  }

  const paintResults = () => {
    syncState()
    dateLabel.textContent = teacherDateLabel(state.teacherDate)
    results.replaceChildren(...buildTeacherResultsNodes(input, dateInput, paintResults))
  }

  // Не вызываем полный render() на ввод — иначе на телефоне клавиатура прячется.
  input.addEventListener('input', () => paintResults())
  dateInput.addEventListener('change', () => paintResults())
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      paintResults()
    }
  })

  panel.append(
    el('div', { className: 'card teacher-search' }, [
      el('h3', { text: 'Найти преподавателя' }),
      el('p', {
        className: 'muted',
        text: 'Например, если у вас пересдача — можно посмотреть, в какой аудитории и во сколько у преподавателя пары в этот день (по всем группам, с учётом замен).',
      }),
      el('p', {
        className: 'muted',
        text: 'Это ориентир по расписанию, а не гарантия, что преподаватель сейчас в колледже: замену или отмену могли не внести вовремя.',
      }),
      el('div', { className: 'field' }, [el('label', { text: 'Преподаватель' }), input]),
      el('div', { className: 'field' }, [dateLabel, dateInput]),
      el('div', { className: 'due-quick' }, [
        el('button', {
          type: 'button',
          className: 'chip',
          text: 'Сегодня',
          onClick: () => {
            state.teacherDate = todayISO()
            dateInput.value = state.teacherDate
            paintResults()
          },
        }),
      ]),
    ]),
    results,
  )
  paintResults()
  return panel
}

function teacherDateLabel(dateStr) {
  const dayOfDate = weekdayFromISO(dateStr)
  return dayOfDate ? `Дата (${DAY_NAMES[dayOfDate] || ''})` : 'Дата'
}

function buildTeacherResultsNodes(input, dateInput, paintResults) {
  const q = (state.teacherQuery || '').trim()
  const dateStr = state.teacherDate || todayISO()
  const nodes = []

  if (q.length < 2) {
    nodes.push(
      el('p', {
        className: 'muted',
        text: 'Введите от 2 букв — появятся подходящие фамилии.',
      }),
    )
    return nodes
  }

  const suggestions = suggestTeachers(q, 10)
  if (suggestions.length) {
    nodes.push(
      el(
        'div',
        { className: 'teacher-suggest' },
        suggestions.map((name) =>
          el('button', {
            type: 'button',
            className: `chip${normalizeSuggestKey(name) === normalizeSuggestKey(q) ? ' chip-active' : ''}`,
            text: name,
            onClick: () => {
              state.teacherQuery = name
              input.value = name
              paintResults()
            },
          }),
        ),
      ),
    )
  }

  const { dayNum, slots } = findTeacherSlots(q, dateStr)
  const active = slots.filter((s) => !s.cancelled)
  const cancelled = slots.filter((s) => s.cancelled)

  if (dayNum === 7) {
    nodes.push(el('div', { className: 'empty', text: 'В воскресенье пар в расписании нет.' }))
  } else if (slots.length) {
    nodes.push(
      el('p', {
        className: 'muted',
        text: `${DAY_NAMES[dayNum] || ''} · ${formatDateRu(dateStr)} · пар: ${active.length}${
          cancelled.length ? ` · отменено: ${cancelled.length}` : ''
        }`,
      }),
    )
    for (const s of slots) nodes.push(renderTeacherSlotCard(s))
  } else {
    const nextDays = findTeacherUpcoming(q, dateStr, 14)
    nodes.push(
      el('div', {
        className: 'empty',
        text: `На ${formatDateRu(dateStr)} (${DAY_NAMES[dayNum] || 'день'}) пар с таким ФИО нет.`,
      }),
    )
    if (nextDays.length) {
      nodes.push(
        el('p', {
          className: 'muted',
          text: 'Ближайшие пары этого преподавателя:',
        }),
      )
      for (const day of nextDays.slice(0, 4)) {
        nodes.push(
          el('button', {
            type: 'button',
            className: 'chip',
            style: 'margin:0 8px 8px 0',
            text: `${DAY_NAMES[day.dayNum] || ''} ${formatDateRu(day.date)} · ${day.slots.filter((x) => !x.cancelled).length} пар`,
            onClick: () => {
              state.teacherDate = day.date
              dateInput.value = day.date
              paintResults()
            },
          }),
        )
      }
      for (const s of nextDays[0].slots) nodes.push(renderTeacherSlotCard(s))
    } else if (!suggestions.length) {
      nodes.push(
        el('div', {
          className: 'empty',
          text: 'Такого преподавателя в расписании не найдено. Проверьте написание.',
        }),
      )
    }
  }

  return nodes
}

function normalizeSuggestKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.\s]+/g, ' ')
    .trim()
}

function weekdayFromISO(iso) {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).slice(0, 10))
  if (!m) return null
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(dt.getTime())) return null
  const js = dt.getDay() // 0=вс … 6=сб
  return js === 0 ? 7 : js
}

function resolveFreeRoomsSlotKey(dateStr, preferred) {
  const slots = listDayPairSlots(dateStr)
  if (!slots.length) return ''
  if (preferred && slots.some((s) => s.key === preferred)) return preferred
  if (dateStr === todayISO()) {
    const now = nowMinutesOfDay()
    const current = slots.find((s) => {
      const a = hhmmToMinutes(s.start)
      const b = hhmmToMinutes(s.end)
      return a != null && b != null && now >= a && now < b
    })
    if (current) return current.key
    const next = slots.find((s) => {
      const a = hhmmToMinutes(s.start)
      return a != null && now < a
    })
    if (next) return next.key
  }
  return slots[0].key
}

function renderAdminFreeRooms() {
  if (!state.freeRoomsDate) state.freeRoomsDate = todayISO()
  const wrap = el('div', { className: 'admin-free-rooms' })
  const results = el('div', { className: 'teacher-results' })
  const dateInput = el('input', {
    type: 'date',
    value: state.freeRoomsDate,
  })
  const dateLabel = el('label', { text: teacherDateLabel(state.freeRoomsDate) })
  const slotRow = el('div', { className: 'due-quick free-rooms-slots' })

  const paint = () => {
    state.freeRoomsDate = dateInput.value || todayISO()
    dateLabel.textContent = teacherDateLabel(state.freeRoomsDate)
    const slots = listDayPairSlots(state.freeRoomsDate)

    if (state.freeRoomsNow || !state.freeRoomsSlot) {
      state.freeRoomsSlot = resolveFreeRoomsSlotKey(state.freeRoomsDate, '')
    } else if (!slots.some((s) => s.key === state.freeRoomsSlot)) {
      state.freeRoomsSlot = resolveFreeRoomsSlotKey(state.freeRoomsDate, '')
      state.freeRoomsNow = state.freeRoomsDate === todayISO()
    }

    const nowKey =
      state.freeRoomsDate === todayISO() ? resolveFreeRoomsSlotKey(state.freeRoomsDate, '') : ''
    const nowActive = state.freeRoomsNow && state.freeRoomsDate === todayISO()

    slotRow.replaceChildren(
      el('button', {
        type: 'button',
        className: `chip${nowActive ? ' chip-active' : ''}`,
        text: 'Сейчас',
        disabled: state.freeRoomsDate !== todayISO() || !slots.length,
        onClick: () => {
          state.freeRoomsNow = true
          state.freeRoomsSlot = resolveFreeRoomsSlotKey(state.freeRoomsDate, '')
          paint()
        },
      }),
      ...slots.map((s, idx) =>
        el('button', {
          type: 'button',
          className: `chip${!nowActive && state.freeRoomsSlot === s.key ? ' chip-active' : ''}`,
          text: `${idx + 1} · ${s.start}–${s.end}${nowKey === s.key && state.freeRoomsDate === todayISO() ? ' · идёт' : ''}`,
          onClick: () => {
            state.freeRoomsNow = false
            state.freeRoomsSlot = s.key
            paint()
          },
        }),
      ),
    )

    results.replaceChildren()
    if (!slots.length || !state.freeRoomsSlot) {
      results.append(
        el('div', {
          className: 'empty',
          text:
            weekdayFromISO(state.freeRoomsDate) === 7
              ? 'В воскресенье пар в расписании нет.'
              : 'На этот день в расписании нет слотов пар.',
        }),
      )
      return
    }

    const [start, end] = String(state.freeRoomsSlot).split('|')
    const { dayNum, free } = findFreeRooms(state.freeRoomsDate, start, end)
    results.append(
      el('p', {
        className: 'muted',
        text: `${DAY_NAMES[dayNum] || ''} · ${formatDateRu(state.freeRoomsDate)} · ${start}–${end} · свободно: ${free.length}`,
      }),
    )

    if (free.length) {
      results.append(
        el(
          'div',
          { className: 'free-rooms-grid' },
          free.map((room) => el('div', { className: 'free-room-chip', text: room })),
        ),
      )
    } else {
      results.append(
        el('div', {
          className: 'empty',
          text: 'Свободных аудиторий в этом слоте нет (по расписанию).',
        }),
      )
    }
  }

  dateInput.addEventListener('change', () => {
    state.freeRoomsNow = dateInput.value === todayISO()
    state.freeRoomsSlot = ''
    paint()
  })

  wrap.append(
    el('p', {
      className: 'muted',
      style: 'margin:0 0 10px',
      text: 'По расписанию всех групп, с учётом замен. Это ориентир: мероприятия и закрытые кабинеты сайт не видит.',
    }),
    el('div', { className: 'field' }, [dateLabel, dateInput]),
    el('div', { className: 'due-quick' }, [
      el('button', {
        type: 'button',
        className: 'chip',
        text: 'Сегодня',
        onClick: () => {
          state.freeRoomsDate = todayISO()
          dateInput.value = state.freeRoomsDate
          state.freeRoomsNow = true
          state.freeRoomsSlot = ''
          paint()
        },
      }),
    ]),
    el('p', { className: 'muted', style: 'margin:10px 0 6px', text: 'Пара / слот' }),
    slotRow,
    results,
  )
  paint()
  return wrap
}

function renderOverrideForm(groupId) {
  const draft = ensureOverrideDraft()
  const form = el('form', { className: 'card' })
  const date = el('input', { type: 'date', value: draft.date || todayISO(), required: true })

  const lessonSel = el('select', { required: true })
  const fillLessons = () => {
    const dayNum = weekdayFromISO(date.value)
    const lessons =
      dayNum == null ? [] : getLessons(groupId).filter((l) => Number(l.day) === dayNum)
    const prev = lessonSel.value || draft.lessonId || ''
    lessonSel.replaceChildren()
    lessonSel.append(
      el('option', {
        value: '',
        text: dayNum == null ? 'Сначала выберите дату' : lessons.length ? 'Выберите пару' : 'На этот день пар нет',
      }),
    )
    for (const l of lessons) {
      lessonSel.append(
        el('option', {
          value: l.id,
          text: `${l.start}–${l.end} · ${l.subject}${l.room ? ` · ауд. ${l.room}` : ''}`,
        }),
      )
    }
    if (prev && lessons.some((l) => l.id === prev)) lessonSel.value = prev
    else {
      lessonSel.value = ''
      draft.lessonId = ''
    }
  }
  fillLessons()

  const typeSel = el('select', {}, [
    el('option', { value: 'room_only', text: 'Только кабинет' }),
    el('option', { value: 'subject', text: 'Другая пара' }),
    el('option', { value: 'subject_and_room', text: 'Другая пара + кабинет' }),
    el('option', { value: 'cancelled', text: 'Пары не будет' }),
  ])
  typeSel.value = draft.type || 'room_only'
  const newSubject = el('input', {
    maxlength: '80',
    placeholder: 'Новый предмет',
    value: draft.newSubject || '',
  })
  const newRoom = el('input', {
    maxlength: '32',
    placeholder: 'Новый кабинет',
    value: draft.newRoom || '',
  })
  const note = el('input', {
    maxlength: '200',
    placeholder: 'Комментарий',
    value: draft.note || '',
  })

  const syncDraft = () => {
    draft.date = date.value
    draft.lessonId = lessonSel.value
    draft.type = typeSel.value
    draft.newSubject = newSubject.value
    draft.newRoom = newRoom.value
    draft.note = note.value
  }
  date.addEventListener('change', () => {
    fillLessons()
    syncDraft()
  })
  for (const node of [lessonSel, typeSel, newSubject, newRoom, note]) {
    node.addEventListener('input', syncDraft)
    node.addEventListener('change', syncDraft)
  }

  const dayNum = weekdayFromISO(date.value)
  const dayHint =
    dayNum && DAY_NAMES[dayNum]
      ? `Пары на ${DAY_NAMES[dayNum].toLowerCase()}`
      : 'Пара из расписания на выбранную дату'

  form.append(
    el('h3', { text: 'Добавить замену' }),
    el('div', { className: 'field' }, [el('label', { text: 'Дата' }), date]),
    el('div', { className: 'field' }, [el('label', { text: dayHint }), lessonSel]),
    el('div', { className: 'field' }, [el('label', { text: 'Тип' }), typeSel]),
    el('div', { className: 'field' }, [el('label', { text: 'Новый предмет' }), newSubject]),
    el('div', { className: 'field' }, [el('label', { text: 'Новый кабинет' }), newRoom]),
    el('div', { className: 'field' }, [el('label', { text: 'Заметка' }), note]),
    el('button', { className: 'btn', type: 'submit', text: 'Сохранить замену' }),
  )

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    syncDraft()
    try {
      await setOverride(groupId, {
        date: draft.date,
        lessonId: draft.lessonId,
        type: draft.type,
        newSubject: draft.newSubject,
        newRoom: draft.newRoom,
        note: draft.note,
      })
      state.overrideDraft = {
        date: draft.date,
        lessonId: '',
        type: 'room_only',
        newSubject: '',
        newRoom: '',
        note: '',
      }
      flash('Замена сохранена')
      render()
    } catch (err) {
      flash(err.message, true)
    }
  })
  return form
}

function renderOverridesTab(group) {
  const panel = el('div', { className: 'panel' }, [])
  if (canEdit(group.id)) panel.append(renderOverrideForm(group.id))
  else {
    panel.append(
      el('p', {
        className: 'muted',
        text: 'Смотреть могут все. Вносить — после входа старосты.',
      }),
    )
  }

  const upcoming = getDb()
    .overrides.filter((o) => {
      if (o.groupId !== group.id) return false
      const lesson = getLessons(group.id).find((l) => l.id === o.lessonId)
      return overrideIsActiveForList(o, lesson)
    })
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)))

  if (!upcoming.length) {
    panel.append(
      el('div', {
        className: 'empty',
        text: 'Активных замен нет. Прошедшие не показываем здесь — в «Пара́х» на тот день отмена/замена всё ещё видна.',
      }),
    )
  } else {
    for (const o of upcoming) {
      const lesson = getLessons(group.id).find((l) => l.id === o.lessonId)
      panel.append(
        el('div', { className: 'card' }, [
          el('h3', { text: typeLabel(o.type) }),
          el('p', {
            className: 'muted',
            text: `${formatDateRu(o.date)} · ${lesson ? lesson.subject : 'пара'} · ${lesson ? `${lesson.start}–${lesson.end}` : ''}`,
          }),
          o.newSubject ? el('p', { text: `Новый предмет: ${o.newSubject}` }) : null,
          o.newRoom ? el('p', { text: `Кабинет: ${o.newRoom}` }) : null,
          canEdit(group.id)
            ? el('button', {
                type: 'button',
                className: 'btn secondary',
                text: 'Снять замену',
                onClick: async () => {
                  try {
                    await clearOverride(group.id, o.id)
                    flash('Замена снята')
                  } catch (err) {
                    flash(err.message, true)
                  }
                },
              })
            : null,
        ]),
      )
    }
  }
  return panel
}

function renderGroupPicker() {
  const wrap = el('div', { className: 'panel' })
  const q = el('input', { type: 'search', placeholder: 'Поиск группы…' })
  const list = el('div', { className: 'group-list' })
  const paint = () => {
    list.replaceChildren()
    const query = q.value.trim().toLowerCase()
    for (const g of listGroups()) {
      if (query && !g.name.toLowerCase().includes(query)) continue
      list.append(
        el(
          'button',
          {
            type: 'button',
            className: 'group-pick-btn',
            onClick: (e) => pickGroupWithFeel(g.id, e.currentTarget),
          },
          [
            el('strong', { text: g.name }),
            el('span', { text: g.faculty ? `Факультет ${g.faculty}` : ' ' }),
          ],
        ),
      )
    }
  }
  q.addEventListener('input', paint)
  paint()
  wrap.append(
    el('p', {
      className: 'muted',
      style: 'margin:0 0 10px',
      text: 'Выбери свою группу. Если нажал случайно — «Назад» справа сверху.',
    }),
    el('div', { className: 'search' }, [q]),
    list,
  )
  return wrap
}

function isAdminSectionOpen(id) {
  return state.adminOpen instanceof Set && state.adminOpen.has(id)
}

async function toggleAdminSection(id) {
  if (!(state.adminOpen instanceof Set)) state.adminOpen = new Set()
  const tabId = 'more'
  const wasOpen = state.adminOpen.has(id)

  if (!motionOk()) {
    if (wasOpen) state.adminOpen.delete(id)
    else state.adminOpen.add(id)
    withTabScrollPreserved(tabId, () => render({ force: true }))
    return
  }

  if (wasOpen) {
    const body = document.querySelector(`[data-admin-acc-body="${CSS.escape(String(id))}"]`)
    if (body?.classList.contains('admin-acc-anim')) {
      body.classList.remove('is-open')
      await new Promise((resolve) => {
        const done = () => {
          body.removeEventListener('transitionend', done)
          resolve()
        }
        body.addEventListener('transitionend', done)
        window.setTimeout(resolve, 480)
      })
    }
    state.adminOpen.delete(id)
    state.adminExpandAnimId = null
    withTabScrollPreserved(tabId, () => render({ force: true }))
    return
  }

  state.adminOpen.add(id)
  state.adminExpandAnimId = id
  withTabScrollPreserved(tabId, () => render({ force: true }))
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const body = document.querySelector(`[data-admin-acc-body="${CSS.escape(String(id))}"]`)
      body?.classList.add('is-open')
      // Доскроллить к секции, если уехала вниз — но НЕ наверх страницы
      const sec = document.getElementById(`admin-acc-${id}`)
      if (sec) {
        try {
          sec.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        } catch {
          /* ignore */
        }
      }
      if (state.adminExpandAnimId === id) state.adminExpandAnimId = null
    })
  })
}

/** Секция админки: заголовок как у ДЗ — тап раскрывает содержимое */
function wrapAdminAcc(id, title, bodyNodes) {
  const open = isAdminSectionOpen(id)
  const kids = Array.isArray(bodyNodes) ? bodyNodes : bodyNodes ? [bodyNodes] : []
  const head = el(
    'button',
    {
      type: 'button',
      className: `admin-acc-head${open ? ' is-open' : ''}`,
      'aria-expanded': open ? 'true' : 'false',
      onClick: () => {
        toggleAdminSection(id)
      },
    },
    [
      el('span', { className: 'admin-acc-title', text: title }),
      el('span', { className: 'admin-acc-mark', text: open ? '▾' : '▸', 'aria-hidden': 'true' }),
    ],
  )
  const block = el('div', {
    className: `admin-acc${open ? ' is-open' : ''}`,
    id: `admin-acc-${id}`,
  }, [head])
  if (open && kids.length) {
    if (motionOk()) {
      const opening = state.adminExpandAnimId === id
      block.append(
        el(
          'div',
          {
            className: opening ? 'admin-acc-anim' : 'admin-acc-anim is-open',
            dataset: { adminAccBody: String(id) },
          },
          [el('div', { className: 'admin-acc-clip' }, [el('div', { className: 'admin-acc-body' }, kids)])],
        ),
      )
    } else {
      block.append(el('div', { className: 'admin-acc-body' }, kids))
    }
  }
  return block
}

function renderAdminPanel() {
  const box = el('div', { className: 'card admin-panel' })
  box.append(
    el('h3', { text: 'Админка' }),
    el('p', {
      className: 'muted',
      style: 'margin:0 0 12px;font-size:13px',
      text: 'Нажми раздел — раскроется, как ДЗ у пары.',
    }),
  )

  const session = getSession()
  const adminNameInput = el('input', {
    maxlength: '64',
    value: (session?.label || '').trim() || 'Никитос',
    placeholder: 'Как тебя видят в ДЗ',
  })
  const adminNameForm = el('form', { style: 'margin:0 0 14px' })
  adminNameForm.append(
    el('p', {
      className: 'muted',
      style: 'margin:0 0 8px',
      text: 'Твоё имя на сайте (вместо «Админ») — видно во всех ДЗ',
    }),
    el('div', { className: 'field' }, [el('label', { text: 'Отображаемое имя' }), adminNameInput]),
    el('button', { className: 'btn secondary', type: 'submit', text: 'Сохранить имя' }),
  )
  adminNameForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      await setAdminDisplayName(adminNameInput.value)
      flash('Имя обновлено везде')
      render()
    } catch (err) {
      flash(err.message, true)
    }
  })
  box.append(adminNameForm)

  // —— Посещения (спойлер)
  if (isAdminSectionOpen('stats')) {
    const statsCard = el('div', {
      className: 'muted',
      style: 'padding:10px;border:1px solid var(--line);border-radius:8px',
      text: 'Статистика: загружаем…',
    })
    box.append(wrapAdminAcc('stats', 'Посещения', [statsCard]))
    fetchSiteStats()
      .then((st) => {
        if (!st) {
          statsCard.textContent =
            'Статистика недоступна — выполни SQL site_stats.sql в Supabase.'
          return
        }
        statsCard.replaceChildren()
        statsCard.append(
          el('div', {
            style: 'color:var(--text);font-weight:600;margin-bottom:6px',
            text: 'Посещения (анонимно)',
          }),
          el('div', {
            text: `Сегодня: ${st.todayUnique ?? st.todayunique ?? 0} чел. · ${st.todayHits ?? st.todayhits ?? 0} заходов`,
          }),
          el('div', { text: `Вчера: ${st.yesterdayUnique ?? st.yesterdayunique ?? 0} чел.` }),
          el('div', { text: `За 7 дней: ${st.last7Unique ?? st.last7unique ?? 0} чел.` }),
          el('div', { text: `За 30 дней: ${st.last30Unique ?? st.last30unique ?? 0} чел.` }),
          el('p', {
            className: 'muted',
            style: 'margin:8px 0 0;font-size:12px',
            text: 'Считаем уникальные браузеры (не ФИО). Один человек с телефона и ПК = 2.',
          }),
        )
      })
      .catch((err) => {
        statsCard.textContent = err.message || 'Не удалось загрузить статистику'
      })
  } else {
    box.append(wrapAdminAcc('stats', 'Посещения', null))
  }

  // —— Свободные аудитории (как поиск препода, только для админа)
  if (isAdminSectionOpen('rooms')) {
    box.append(wrapAdminAcc('rooms', 'Свободные аудитории', [renderAdminFreeRooms()]))
  } else {
    box.append(wrapAdminAcc('rooms', 'Свободные аудитории', null))
  }

  // —— Кому выдать доступ к свободным аудиториям
  if (isAdminSectionOpen('roomsAccess')) {
    const accessBody = el('div', { className: 'admin-people-tools' })
    const accessSearch = el('input', {
      type: 'search',
      placeholder: 'Поиск по имени…',
      value: state.roomsAccessQuery || '',
      autocomplete: 'off',
    })
    const accessList = el('div', { className: 'admin-people-list' })
    const paintAccess = async () => {
      state.roomsAccessQuery = accessSearch.value || ''
      accessList.replaceChildren(el('p', { className: 'muted', text: 'Загружаем…' }))
      try {
        const q = normalizePeopleQuery(state.roomsAccessQuery)
        const rows = (await listStarostaCodes()).filter((r) => !r.banned)
        const filtered = q
          ? rows.filter((r) => normalizePeopleQuery(r.label).includes(q))
          : rows
        accessList.replaceChildren()
        if (!filtered.length) {
          accessList.append(
            el('p', {
              className: 'muted',
              text: q ? 'Никого не нашли по этому имени.' : 'Пока нет выданных кодов.',
            }),
          )
          return
        }
        for (const row of filtered) {
          const on = !!row.canFreeRooms
          const card = el('div', { className: `admin-people-card${on ? ' is-on' : ''}` }, [
            el('div', { className: 'admin-people-meta' }, [
              el('strong', { text: (row.label || '').trim() || 'без имени' }),
              el('span', {
                className: 'muted',
                text: `${row.groupName || ''}${row.roleTitle ? ` · ${row.roleTitle}` : ''}`,
              }),
            ]),
            el('button', {
              type: 'button',
              className: on ? 'btn secondary' : 'btn',
              text: on ? 'Забрать' : 'Выдать',
              onClick: async () => {
                try {
                  await setCodeFreeRooms(row.id, !on)
                  flash(on ? 'Доступ забран' : 'Доступ выдан')
                  paintAccess()
                } catch (err) {
                  flash(err.message, true)
                }
              },
            }),
          ])
          accessList.append(card)
        }
      } catch (err) {
        accessList.replaceChildren(el('p', { className: 'muted', text: err.message }))
      }
    }
    accessSearch.addEventListener('input', () => {
      state.roomsAccessQuery = accessSearch.value || ''
      paintAccess()
    })
    accessBody.append(
      el('p', {
        className: 'muted',
        style: 'margin:0 0 10px;font-size:13px',
        text: 'Выбери человека с уже выданным кодом — у него в «Ещё» появится блок свободных аудиторий.',
      }),
      el('div', { className: 'field' }, [el('label', { text: 'Поиск' }), accessSearch]),
      accessList,
    )
    box.append(wrapAdminAcc('roomsAccess', 'Доступ к аудиториям', [accessBody]))
    paintAccess()
  } else {
    box.append(wrapAdminAcc('roomsAccess', 'Доступ к аудиториям', null))
  }

  // —— Баны
  if (isAdminSectionOpen('bans')) {
    const bansBody = el('div', { className: 'admin-people-tools' })
    const bansSearch = el('input', {
      type: 'search',
      placeholder: 'Поиск по имени…',
      value: state.bansQuery || '',
      autocomplete: 'off',
    })
    const bansList = el('div', { className: 'admin-people-list' })
    const paintBans = async () => {
      state.bansQuery = bansSearch.value || ''
      bansList.replaceChildren(el('p', { className: 'muted', text: 'Загружаем…' }))
      try {
        const q = normalizePeopleQuery(state.bansQuery)
        const rows = await listStarostaCodes()
        const filtered = q
          ? rows.filter((r) => normalizePeopleQuery(r.label).includes(q))
          : rows
        bansList.replaceChildren()
        if (!filtered.length) {
          bansList.append(
            el('p', {
              className: 'muted',
              text: q ? 'Никого не нашли по этому имени.' : 'Пока нет выданных кодов.',
            }),
          )
          return
        }
        for (const row of filtered) {
          const banned = !!row.banned
          const banDraft = state.adminBanId === row.id
          const reasonShown = (row.banReason || '').trim()
          const card = el('div', {
            className: `admin-people-card${banned ? ' is-banned' : ''}${banDraft ? ' is-ban-draft' : ''}`,
          })
          card.append(
            el('div', { className: 'admin-people-meta' }, [
              el('strong', { text: (row.label || '').trim() || 'без имени' }),
              el('span', {
                className: 'muted',
                text: `${row.groupName || ''}${banned ? ' · бан' : ''}${reasonShown ? ` · ${reasonShown}` : ''}`,
              }),
            ]),
          )
          if (banDraft && !banned) {
            const reasonInput = el('input', {
              type: 'text',
              maxlength: '200',
              placeholder: 'Причина (необязательно)',
              autocomplete: 'off',
            })
            const form = el('form', { className: 'admin-ban-form' })
            form.append(
              el('div', { className: 'field' }, [el('label', { text: 'Причина бана' }), reasonInput]),
              el('div', { className: 'code-card-btns' }, [
                el('button', { type: 'submit', className: 'btn code-card-danger', text: 'Забанить' }),
                el('button', {
                  type: 'button',
                  className: 'btn secondary',
                  text: 'Отмена',
                  onClick: () => {
                    state.adminBanId = ''
                    paintBans()
                  },
                }),
              ]),
            )
            form.addEventListener('submit', async (e) => {
              e.preventDefault()
              try {
                const res = await banStarostaCode(row.id, reasonInput.value)
                const n = res?.devices ?? res?.Devices
                flash(n != null ? `Забанен · устройств: ${n}` : 'Забанен')
                state.adminBanId = ''
                paintBans()
              } catch (err) {
                flash(err.message, true)
              }
            })
            card.append(form)
            requestAnimationFrame(() => {
              try {
                reasonInput.focus()
              } catch {
                /* ignore */
              }
            })
          } else {
            card.append(
              el('button', {
                type: 'button',
                className: banned ? 'btn' : 'btn code-card-danger',
                text: banned ? 'Снять бан' : 'Забанить',
                onClick: async () => {
                  if (banned) {
                    try {
                      await unbanStarostaCode(row.id)
                      flash('Бан снят')
                      paintBans()
                    } catch (err) {
                      flash(err.message, true)
                    }
                    return
                  }
                  state.adminBanId = row.id
                  paintBans()
                },
              }),
            )
          }
          bansList.append(card)
        }
      } catch (err) {
        bansList.replaceChildren(el('p', { className: 'muted', text: err.message }))
      }
    }
    bansSearch.addEventListener('input', () => {
      state.bansQuery = bansSearch.value || ''
      paintBans()
    })
    bansBody.append(
      el('p', {
        className: 'muted',
        style: 'margin:0 0 10px;font-size:13px',
        text: 'Жёсткий бан: код закрыт, а на известных устройствах сайт не открывается даже как гость (без расписания). Снять бан можно здесь же.',
      }),
      el('div', { className: 'field' }, [el('label', { text: 'Поиск' }), bansSearch]),
      bansList,
    )
    box.append(wrapAdminAcc('bans', 'Баны', [bansBody]))
    paintBans()
  } else {
    box.append(wrapAdminAcc('bans', 'Баны', null))
  }

  // —— Сайт (спойлер)
  if (isAdminSectionOpen('site')) {
    const siteBody = el('div', {}, [
      el('div', {
        style:
          'margin:0 0 12px;padding:12px;border:2px solid ' +
          (isSiteEnabled() ? 'var(--warn, #c45)' : 'var(--ok, #2a7)') +
          ';border-radius:10px;background:var(--surface)',
      }, [
        el('h3', {
          style: 'margin:0 0 6px;font-size:16px',
          text: isSiteEnabled() ? 'Сайт сейчас ВКЛЮЧЁН' : 'Сайт сейчас ВЫКЛЮЧЕН',
        }),
        el('p', {
          className: 'muted',
          style: 'margin:0 0 10px;font-size:13px',
          text: isSiteEnabled()
            ? 'Аварийное выключение: все увидят заглушку. Ты как админ продолжаешь видеть сайт и сможешь включить обратно.'
            : 'Для остальных сайт закрыт. Нажми «Включить», когда можно снова.',
        }),
        el('button', {
          type: 'button',
          className: 'btn',
          style: isSiteEnabled()
            ? 'background:#b42318;border-color:#b42318'
            : 'background:#1a7f37;border-color:#1a7f37',
          text: isSiteEnabled() ? 'Выключить сайт для всех' : 'Включить сайт снова',
          onClick: async () => {
            const next = !isSiteEnabled()
            const ok = confirm(
              next
                ? 'Включить сайт? Все снова смогут открывать расписание.'
                : 'Выключить сайт для всех прямо сейчас?',
            )
            if (!ok) return
            try {
              await setSiteEnabled(next)
              flash(next ? 'Сайт включён' : 'Сайт выключен для всех')
              render()
            } catch (err) {
              flash(err.message || 'Не удалось переключить', true)
            }
          },
        }),
      ]),
      el('div', {
        style: 'padding:12px;border:1px solid var(--line);border-radius:8px',
      }, [
        el('h3', { style: 'margin:0 0 6px;font-size:15px', text: 'Очистка старых данных' }),
        el('p', {
          className: 'muted',
          style: 'margin:0 0 10px;font-size:13px',
          text: 'Автоматически раз в сутки удаляется то, чему больше 8 недель (ДЗ, файлы, замены). Актуальные недели (±6) не трогаются.',
        }),
        el('button', {
          type: 'button',
          className: 'btn secondary',
          text: 'Очистить старше 8 недель',
          onClick: async () => {
            try {
              const r = await cleanupOldData(8)
              const hw = r?.homeworkDeleted ?? r?.homeworkdeleted ?? 0
              const ov = r?.overridesDeleted ?? r?.overridesdeleted ?? 0
              const fl = r?.filesDeleted ?? r?.filesdeleted ?? 0
              flash(`Очистка: ДЗ ${hw}, замен ${ov}, файлов ${fl}`)
              render()
            } catch (err) {
              flash(err.message || 'Не удалось очистить', true)
            }
          },
        }),
      ]),
    ])
    box.append(wrapAdminAcc('site', 'Сайт', [siteBody]))
  } else {
    box.append(wrapAdminAcc('site', 'Сайт', null))
  }

  // —— Поддержка (спойлер)
  const supportCard = el('div', {
    style: 'padding:4px 0',
  })
  if (isAdminSectionOpen('support')) {
    supportCard.append(
      el('p', {
        className: 'muted',
        style: 'margin:0 0 10px;font-size:13px',
        text: 'Сообщения из @rasphelp_bot. Ответ уйдёт студенту в Telegram. Загрузка…',
      }),
    )
    box.append(wrapAdminAcc('support', 'Поддержка', [supportCard]))
    fetchSupportTickets(40)
    .then((pack) => {
      supportCard.replaceChildren()
      const open = pack.openCount || 0
      supportCard.append(
        el('h3', {
          style: 'margin:0 0 6px;font-size:15px',
          text: `Обращения в поддержку · ${open} откр.`,
        }),
        el('p', {
          className: 'muted',
          style: 'margin:0 0 10px;font-size:13px',
          text:
            open === 0
              ? 'Новых вопросов нет. Студенты пишут боту @rasphelp_bot — они появятся здесь.'
              : 'Ответь ниже или удали ненужные. Ответ отправится в Telegram (через минуту, если бот-поллер активен).',
        }),
      )
      const list = el('div', { style: 'display:flex;flex-direction:column;gap:10px' })
      for (const t of pack.items || []) {
        const who = t.tgUsername
          ? `@${t.tgUsername}`
          : t.tgName || `id ${t.tgUserId}`
        const when = t.createdAt
          ? new Date(t.createdAt).toLocaleString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
          : ''
        const replyBox = el('textarea', {
          rows: '2',
          placeholder: 'Ответ студенту…',
          style: 'width:100%;margin:8px 0;resize:vertical',
        })
        if (t.status === 'answered' && t.answer) {
          replyBox.value = t.answer
        }
        const row = el('div', {
          style:
            'padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--surface)',
        })
        row.append(
          el('div', {
            style: 'font-weight:600;font-size:13px',
            text: `${t.status === 'open' ? '🆕 ' : '✓ '}${who}${when ? ' · ' + when : ''}`,
          }),
          el('div', {
            style: 'margin:6px 0;white-space:pre-wrap;font-size:14px',
            text: t.body || '(пусто)',
          }),
          replyBox,
          el('div', {
            style: 'display:flex;gap:8px;flex-wrap:wrap',
          }, [
            el('button', {
              type: 'button',
              className: 'btn',
              text: 'Ответить',
              onClick: async () => {
                try {
                  await replySupportTicket(t.id, replyBox.value)
                  flash('Ответ сохранён — уйдёт в Telegram')
                  render()
                } catch (err) {
                  flash(err.message || 'Не удалось ответить', true)
                }
              },
            }),
            el('button', {
              type: 'button',
              className: 'btn secondary',
              text: 'Удалить',
              onClick: async () => {
                if (!confirm('Удалить это обращение?')) return
                try {
                  await deleteSupportTicket(t.id)
                  flash('Обращение удалено')
                  render()
                } catch (err) {
                  flash(err.message || 'Не удалось удалить', true)
                }
              },
            }),
          ]),
        )
        list.append(row)
      }
      if ((pack.items || []).length) supportCard.append(list)
      supportCard.append(
        el('div', {
          style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px',
        }, [
          el('button', {
            type: 'button',
            className: 'btn secondary',
            text: 'Обновить список',
            onClick: () => render(),
          }),
          el('button', {
            type: 'button',
            className: 'btn',
            style: 'background:#b42318;border-color:#b42318',
            text: 'Удалить все обращения',
            onClick: async () => {
              if (!confirm('Удалить все обращения из списка?')) return
              try {
                const r = await deleteAllSupportTickets()
                flash(`Удалено: ${r?.deleted ?? r?.Deleted ?? 0}`)
                render()
              } catch (err) {
                flash(err.message || 'Не удалось удалить', true)
              }
            },
          }),
        ]),
      )
    })
    .catch((err) => {
      supportCard.replaceChildren(
        el('p', {
          className: 'muted',
          style: 'margin:0;font-size:13px',
          text:
            /could not find|does not exist|PGRST/i.test(err.message || '')
              ? 'Нужно выполнить SQL support_tickets.sql и security_hardening_v2.sql в Supabase — тогда здесь появится очередь.'
              : err.message || 'Не удалось загрузить обращения',
        }),
      )
    })
  } else {
    box.append(wrapAdminAcc('support', 'Поддержка', null))
  }

  // —— Коды (спойлер)
  if (isAdminSectionOpen('codes')) {
  const groups = listGroups()
  if (
    !state.adminCodeGroupId ||
    (state.adminCodeGroupId !== ALL_GROUPS_ID && !groups.some((g) => g.id === state.adminCodeGroupId))
  ) {
    state.adminCodeGroupId = groups[0]?.id || ALL_GROUPS_ID
  }
  const codeGroup = el(
    'select',
    {
      onChange: (e) => {
        state.adminCodeGroupId = e.target.value
      },
    },
    [
      el('option', { value: ALL_GROUPS_ID, text: 'Все группы (власть везде)' }),
      ...groups.map((g) =>
        el('option', {
          value: g.id,
          text: g.name,
        }),
      ),
    ],
  )
  codeGroup.value = state.adminCodeGroupId
  const codeInput = el('input', {
    maxlength: '64',
    placeholder: 'Придумай код (от 8 символов)',
    autocomplete: 'off',
  })
  const codeLabel = el('input', {
    maxlength: '64',
    placeholder: 'Кобзева',
    required: true,
  })
  const codeRole = el('input', {
    maxlength: '32',
    placeholder: 'Командир / замком (пусто = Староста)',
  })
  const issued = el('p', { className: 'muted', text: '' })
  const issueForm = el('form', {})
  issueForm.append(
    el('p', {
      className: 'muted',
      text: 'Имя — крупно в профиле; синяя подпись — вместо «Староста». «Все группы» — можно править ДЗ/замены в любой группе (без админ-панели).',
    }),
    el('div', { className: 'field' }, [el('label', { text: 'Группа' }), codeGroup]),
    el('div', { className: 'field' }, [el('label', { text: 'Код' }), codeInput]),
    el('div', { className: 'field' }, [el('label', { text: 'Имя' }), codeLabel]),
    el('div', { className: 'field' }, [
      el('label', { text: 'Синяя подпись' }),
      codeRole,
    ]),
    el('button', { className: 'btn', type: 'submit', text: 'Создать код' }),
    issued,
  )
  issueForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const groupId = state.adminCodeGroupId || codeGroup.value
    const allGroups = groupId === ALL_GROUPS_ID
    const g = allGroups ? null : getGroup(groupId)
    if (!allGroups && !g) {
      flash('Выбери группу', true)
      return
    }
    const plain = codeInput.value
    const name = (codeLabel.value || '').trim()
    const roleTitle = (codeRole.value || '').trim()
    if (!name) {
      flash('Напиши имя (Кобзева…)', true)
      return
    }
    const badge = roleTitle || 'Староста'
    const where = allGroups ? 'всем группам' : `группе ${g.name}`
    if (!confirm(`Выдать код ${where}?\nИмя: ${name}\nСиняя подпись: ${badge}`)) return
    try {
      await addStarostaCode(groupId, plain, name, roleTitle)
      issued.textContent = `Готово. ${name} · ${badge}${allGroups ? ' · все группы' : ''}. Скинь код: ${plain}`
      flash(`Код создан · ${name}${allGroups ? ' · все группы' : ''}`)
      codeInput.value = ''
      codeLabel.value = ''
      codeRole.value = ''
      paintCodes()
    } catch (err) {
      flash(err.message, true)
    }
  })
  const codesBox = el('div', { className: 'code-list' })
  async function paintCodes() {
    codesBox.replaceChildren()
    codesBox.append(
      el('h3', { style: 'margin:12px 0 4px;font-size:15px', text: 'Выданные коды' }),
    )
    try {
      const rows = await listStarostaCodes()
      if (!rows.length) {
        codesBox.append(el('p', { className: 'muted', text: 'Пока нет выданных кодов.' }))
        return
      }
      const ids = new Set(rows.map((r) => r.id))
      if (state.adminCodeEditId && !ids.has(state.adminCodeEditId)) state.adminCodeEditId = ''
      if (state.adminCodeRevokeId && !ids.has(state.adminCodeRevokeId)) state.adminCodeRevokeId = ''

      for (const row of rows) {
        const codeText = (row.code || '').trim()
        const badge = (row.roleTitle || '').trim() || 'Староста'
        const personName = (row.label || '').trim() || 'без имени'
        const editing = state.adminCodeEditId === row.id
        const revoking = state.adminCodeRevokeId === row.id

        // Всё колонкой: код НИКОГДА не в flex рядом с кнопкой (иначе ломается в столбик)
        const card = el('article', {
          className: `code-card${editing ? ' is-editing' : ''}${revoking ? ' is-revoking' : ''}`,
        })

        card.append(
          el('div', { className: 'code-card-head' }, [
            el('strong', { className: 'code-card-group', text: row.groupName || row.groupId }),
            el('span', { className: 'more-role-badge', text: badge }),
          ]),
          el('div', { className: 'code-card-name', text: personName }),
          el('div', {
            className: codeText ? 'code-card-code' : 'code-card-code is-empty',
            text: codeText || 'код не сохранён — выдайте новый',
          }),
        )

        if (editing) {
          const nameInput = el('input', {
            type: 'text',
            maxlength: '64',
            value: row.label || '',
            placeholder: 'Кобзева',
            autocomplete: 'off',
          })
          const roleInput = el('input', {
            type: 'text',
            maxlength: '32',
            value: row.roleTitle || '',
            placeholder: 'Командир (пусто = Староста)',
            autocomplete: 'off',
          })
          const form = el('form', { className: 'code-card-form' })
          form.append(
            el('div', { className: 'field' }, [el('label', { text: 'Имя' }), nameInput]),
            el('div', { className: 'field' }, [el('label', { text: 'Синяя подпись' }), roleInput]),
            el('div', { className: 'code-card-btns' }, [
              el('button', { type: 'submit', className: 'btn', text: 'Сохранить' }),
              el('button', {
                type: 'button',
                className: 'btn secondary',
                text: 'Отмена',
                onClick: () => {
                  state.adminCodeEditId = ''
                  paintCodes()
                },
              }),
            ]),
          )
          form.addEventListener('submit', async (e) => {
            e.preventDefault()
            const name = nameInput.value.trim()
            const title = roleInput.value.trim()
            if (!name) {
              flash('Укажи имя', true)
              return
            }
            try {
              const nameChanged = name !== (row.label || '').trim()
              const roleChanged = title !== (row.roleTitle || '').trim()
              let hwN = null
              if (nameChanged) {
                const res = await renameStarostaLabel(row.id, name)
                hwN = res?.homeworkUpdated ?? res?.homeworkupdated
              }
              if (roleChanged) await setStarostaRoleTitle(row.id, title)
              if (!nameChanged && !roleChanged) flash('Без изменений')
              else if (hwN != null) flash(`Сохранено · ДЗ обновлено: ${hwN}`)
              else flash('Сохранено')
              state.adminCodeEditId = ''
              paintCodes()
            } catch (err) {
              flash(err.message, true)
            }
          })
          card.append(form)
          requestAnimationFrame(() => {
            try {
              nameInput.focus()
            } catch {
              /* ignore */
            }
          })
        } else if (revoking) {
          card.append(
            el('div', { className: 'code-card-revoke' }, [
              el('p', {
                className: 'code-card-revoke-msg',
                text: 'Отозвать код? Человек больше не войдёт.',
              }),
              el('div', { className: 'code-card-btns' }, [
                el('button', {
                  type: 'button',
                  className: 'btn code-card-danger',
                  text: 'Да, отозвать',
                  onClick: async () => {
                    try {
                      await revokeStarostaCode(row.id)
                      flash('Код отозван')
                      state.adminCodeRevokeId = ''
                      paintCodes()
                    } catch (err) {
                      flash(err.message, true)
                    }
                  },
                }),
                el('button', {
                  type: 'button',
                  className: 'btn secondary',
                  text: 'Отмена',
                  onClick: () => {
                    state.adminCodeRevokeId = ''
                    paintCodes()
                  },
                }),
              ]),
            ]),
          )
        } else {
          const btns = [
            el('button', {
              type: 'button',
              className: 'btn',
              text: 'Изменить',
              onClick: () => {
                state.adminCodeEditId = row.id
                state.adminCodeRevokeId = ''
                paintCodes()
              },
            }),
          ]
          if (codeText) {
            btns.push(
              el('button', {
                type: 'button',
                className: 'btn secondary',
                text: 'Копировать',
                onClick: async () => {
                  try {
                    await navigator.clipboard.writeText(codeText)
                    flash('Код скопирован')
                  } catch {
                    flash(codeText)
                  }
                },
              }),
            )
          }
          btns.push(
            el('button', {
              type: 'button',
              className: 'btn secondary',
              text: 'Отозвать',
              onClick: () => {
                state.adminCodeRevokeId = row.id
                state.adminCodeEditId = ''
                paintCodes()
              },
            }),
          )
          card.append(el('div', { className: 'code-card-btns' }, btns))
        }

        codesBox.append(card)
      }
    } catch (err) {
      codesBox.append(el('p', { className: 'muted', text: err.message }))
    }
  }
  box.append(
    wrapAdminAcc('codes', 'Коды', [
      el('p', {
        className: 'muted',
        style: 'margin:0 0 10px;font-size:13px',
        text: 'Ты выдаёшь коды старостам/командирам. На одну группу можно несколько кодов.',
      }),
      issueForm,
      codesBox,
    ]),
  )
  paintCodes()
  } else {
    box.append(wrapAdminAcc('codes', 'Коды', null))
  }

  // —— Админы (спойлер)
  // Коды старост живут отдельно: здесь только полный доступ к админке.
  if (isAdminSectionOpen('admins')) {
    const mainNote = el('p', {
      className: 'muted',
      style: 'margin:0 0 10px;font-size:13px',
      text: 'Главный админ: загружаем…',
    })
    const adminCode = el('input', {
      maxlength: '64',
      placeholder: 'Код нового админа (от 8 символов)',
      autocomplete: 'off',
    })
    const adminLabel = el('input', {
      maxlength: '64',
      placeholder: 'Кобзева',
      autocomplete: 'off',
    })
    const adminIssued = el('p', {
      className: 'muted',
      text: state.adminIssuedNote || '',
    })
    const addForm = el('form', {})
    addForm.append(
      el('p', {
        className: 'muted',
        text: 'Доп. админ видит эту панель целиком. Коды старост при этом не меняются — их отзывают в разделе «Коды».',
      }),
      el('div', { className: 'field' }, [el('label', { text: 'Код' }), adminCode]),
      el('div', { className: 'field' }, [el('label', { text: 'Имя' }), adminLabel]),
      el('div', { className: 'code-card-btns' }, [
        el('button', { type: 'submit', className: 'btn', text: 'Добавить админа' }),
        el('button', {
          type: 'button',
          className: 'btn secondary',
          text: 'Случайный',
          onClick: () => {
            adminCode.value = newStudentCode()
            adminCode.focus()
          },
        }),
      ]),
      adminIssued,
    )
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const plain = adminCode.value.trim()
      const name = adminLabel.value.trim()
      if (plain.length < 8) {
        flash('Код от 8 символов', true)
        return
      }
      if (!name) {
        flash('Укажи имя админа', true)
        return
      }
      try {
        await addAdmin(plain, name)
        state.adminIssuedNote = `Готово. ${name} — админ. Код: ${plain}`
        flash(`Админ добавлен · ${name}`)
        adminCode.value = ''
        adminLabel.value = ''
        paintAdmins()
      } catch (err) {
        flash(err.message, true)
      }
    })

    const adminsBox = el('div', { className: 'code-list' })
    async function paintAdmins() {
      adminsBox.replaceChildren()
      try {
        const data = await listAdmins()
        mainNote.textContent = `Главный админ: ${data.main}. Его код лежит в app_meta — отозвать отсюда нельзя, меняется SQL-запросом.`
        const rows = (data.extra || []).filter((a) => a.active !== false)
        if (!rows.length) {
          adminsBox.append(el('p', { className: 'muted', text: 'Доп. админов пока нет.' }))
          return
        }
        const ids = new Set(rows.map((r) => r.id))
        if (state.adminRemoveId && !ids.has(state.adminRemoveId)) state.adminRemoveId = ''
        adminsBox.append(
          el('h3', { style: 'margin:12px 0 4px;font-size:15px', text: 'Доп. админы' }),
        )
        for (const row of rows) {
          const confirmRemove = state.adminRemoveId === row.id
          const card = el('article', {
            className: `code-card${confirmRemove ? ' is-revoking' : ''}`,
          })
          const codeText = (row.code || '').trim()
          card.append(
            el('div', { className: 'code-card-head' }, [
              el('strong', { className: 'code-card-group', text: row.label || 'без имени' }),
              el('span', { className: 'more-role-badge', text: 'админ' }),
            ]),
            el('div', {
              className: codeText ? 'code-card-code' : 'code-card-code is-empty',
              text: codeText || 'код не сохранён — выдайте новый',
            }),
          )
          if (confirmRemove) {
            card.append(
              el('div', { className: 'code-card-revoke' }, [
                el('p', {
                  className: 'code-card-revoke-msg',
                  text: 'Отозвать админа? Сессия закроется сразу, код перестанет пускать.',
                }),
                el('div', { className: 'code-card-btns' }, [
                  el('button', {
                    type: 'button',
                    className: 'btn code-card-danger',
                    text: 'Да, отозвать',
                    onClick: async () => {
                      try {
                        await revokeAdmin(row.id)
                        flash('Админ отозван')
                        state.adminRemoveId = ''
                        paintAdmins()
                      } catch (err) {
                        flash(err.message, true)
                      }
                    },
                  }),
                  el('button', {
                    type: 'button',
                    className: 'btn secondary',
                    text: 'Отмена',
                    onClick: () => {
                      state.adminRemoveId = ''
                      paintAdmins()
                    },
                  }),
                ]),
              ]),
            )
          } else {
            const btns = [
              el('button', {
                type: 'button',
                className: 'btn secondary',
                text: 'Отозвать',
                onClick: () => {
                  state.adminRemoveId = row.id
                  paintAdmins()
                },
              }),
            ]
            if (codeText) {
              btns.unshift(
                el('button', {
                  type: 'button',
                  className: 'btn secondary',
                  text: 'Копировать',
                  onClick: async () => {
                    try {
                      await navigator.clipboard.writeText(codeText)
                      flash('Код скопирован')
                    } catch {
                      flash(codeText)
                    }
                  },
                }),
              )
            }
            card.append(el('div', { className: 'code-card-btns' }, btns))
          }
          adminsBox.append(card)
        }
      } catch (err) {
        adminsBox.append(el('p', { className: 'muted', text: err.message }))
      }
    }

    box.append(
      wrapAdminAcc('admins', 'Админы', [mainNote, addForm, adminsBox]),
    )
    paintAdmins()
  } else {
    box.append(wrapAdminAcc('admins', 'Админы', null))
  }

  // —— Кураторы: админ выдаёт код, куратор ведёт старост и права
  if (isAdminSectionOpen('curators')) {
    const curSec = el('div', { className: 'curator-admin' })
    const label = el('input', { maxlength: '60', placeholder: 'Кобзева Анна' })
    const code = el('input', {
      maxlength: '64',
      placeholder: 'Код куратора (от 8 символов)',
      autocomplete: 'off',
    })
    const groupPick = el(
      'select',
      {},
      [
        el('option', { value: '', text: 'Все группы колледжа' }),
        ...listGroups().map((g) => el('option', { value: g.id, text: g.name })),
      ],
    )
    const genBtn = el('button', {
      type: 'button',
      className: 'journal-link',
      text: 'Придумать код',
      onClick: () => {
        code.value = newStudentCode()
      },
    })
    const form = el('form', {})
    form.append(
      el('p', {
        className: 'muted',
        style: 'margin:0 0 10px;font-size:13px',
        text: 'Куратор назначает старост, выдаёт права (зам/ДЗ/лента), ведёт журнал и построение в своих группах.',
      }),
      el('div', { className: 'field' }, [el('label', { text: 'Имя куратора' }), label]),
      el('div', { className: 'field' }, [el('label', { text: 'Группа' }), groupPick]),
      el('div', { className: 'field' }, [
        el('label', { text: 'Код входа' }),
        code,
        el('div', { style: 'margin-top:6px' }, [genBtn]),
      ]),
      el('button', { className: 'btn', type: 'submit', text: 'Назначить куратора' }),
    )
    const listBox = el('div', { className: 'curator-list' })

    const paint = async () => {
      listBox.replaceChildren(el('p', { className: 'muted', text: 'Загружаем…' }))
      try {
        const rows = await curatorsList()
        listBox.replaceChildren()
        if (!rows.length) {
          listBox.append(
            el('p', {
              className: 'muted',
              style: 'margin:0;font-size:12.5px',
              text: 'Кураторов пока нет.',
            }),
          )
          return
        }
        for (const row of rows) {
          const codeText = String(row.code || '').trim()
          listBox.append(
            el('div', { className: 'curator-row' }, [
              el('div', { className: 'curator-row-main' }, [
                el('strong', { text: row.label || 'Куратор' }),
                el('span', {
                  className: 'muted',
                  text: row.groupName || 'все группы',
                }),
              ]),
              codeText
                ? el('button', {
                    type: 'button',
                    className: 'btn secondary',
                    text: 'Копировать код',
                    onClick: async () => {
                      try {
                        await navigator.clipboard.writeText(codeText)
                        showToast('Код скопирован')
                      } catch {
                        showToast(codeText)
                      }
                    },
                  })
                : null,
              el('button', {
                type: 'button',
                className: 'btn danger',
                text: 'Убрать',
                onClick: async () => {
                  if (!confirm(`Убрать куратора «${row.label || ''}»?`)) return
                  try {
                    await curatorRevoke(row.id)
                    showToast('Куратор убран')
                    paint()
                  } catch (err) {
                    showToast(err.message, true)
                  }
                },
              }),
            ]),
          )
        }
      } catch (err) {
        const msg = String(err?.message || '')
        listBox.replaceChildren(
          el('p', {
            className: 'muted',
            style: 'margin:0',
            text: /PGRST202|could not find the function|does not exist|schema cache/i.test(msg)
              ? 'Кураторы ещё не включены: выполни supabase/curators.sql и curators_admin.sql.'
              : msg || 'Не удалось загрузить кураторов',
          }),
        )
      }
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const btn = form.querySelector('button[type="submit"]')
      if (btn) btn.disabled = true
      try {
        const created = await curatorCreate(groupPick.value || null, label.value.trim(), code.value.trim())
        showToast(`Куратор назначен. Код: ${created?.code || code.value.trim()}`)
        label.value = ''
        code.value = ''
        paint()
      } catch (err) {
        showToast(err.message, true)
      } finally {
        if (btn) btn.disabled = false
      }
    })

    curSec.append(form, el('div', { style: 'margin-top:14px' }, [listBox]))
    box.append(wrapAdminAcc('curators', 'Кураторы', [curSec]))
    paint()
  } else {
    box.append(wrapAdminAcc('curators', 'Кураторы', null))
  }

  // —— Группы (спойлер)
  if (isAdminSectionOpen('groups')) {
  const groupsSec = el('div', {})
  const name = el('input', { maxlength: '48', placeholder: '0902-ПД1' })
  const faculty = el('input', { maxlength: '32', placeholder: 'ПД' })
  const code = el('input', { maxlength: '64', placeholder: 'Первый код старосты (от 8 символов)' })
  const createForm = el('form', {})
  createForm.append(
    el('p', { className: 'muted', text: 'Создать новую группу' }),
    el('div', { className: 'field' }, [el('label', { text: 'Название' }), name]),
    el('div', { className: 'field' }, [el('label', { text: 'Факультет' }), faculty]),
    el('div', { className: 'field' }, [el('label', { text: 'Код старосты' }), code]),
    el('button', { className: 'btn secondary', type: 'submit', text: 'Создать группу' }),
  )
  createForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      const g = await createGroup({
        name: name.value,
        faculty: faculty.value,
        starostaCode: code.value,
      })
      flash(`Группа ${g.name} создана`)
    } catch (err) {
      flash(err.message, true)
    }
  })
  groupsSec.append(createForm)

  const delGroup = el(
    'select',
    {},
    listGroups().map((g) => el('option', { value: g.id, text: `${g.name}${g.faculty ? ' · ' + g.faculty : ''}` })),
  )
  groupsSec.append(
    el('div', { style: 'margin-top:16px' }, [
      el('p', {
        className: 'muted',
        text: 'Удалить группу (скроется из выбора у всех; ДЗ в базе останутся, но группа не видна)',
      }),
      el('div', { className: 'field' }, [el('label', { text: 'Группа' }), delGroup]),
      el('button', {
        type: 'button',
        className: 'btn danger',
        text: 'Удалить группу',
        onClick: async () => {
          const g = getGroup(delGroup.value)
          if (!g) return
          if (!confirm(`Удалить группу «${g.name}» из списка?`)) return
          try {
            await deactivateGroup(delGroup.value)
            if (state.groupId === delGroup.value) {
              state.groupId = ''
              localStorage.removeItem(SELECTED_GROUP_KEY)
            }
            flash(`Группа «${g.name}» удалена`)
            render()
          } catch (err) {
            flash(err.message || 'Не удалось удалить', true)
          }
        },
      }),
    ]),
  )

  const semGroup = el(
    'select',
    {},
    listGroups().map((g) => el('option', { value: g.id, text: g.name })),
  )
  groupsSec.append(
    el('div', { style: 'margin-top:16px' }, [
      el('p', {
        className: 'muted',
        text: 'Сброс семестра (удалит пары, ДЗ и замены группы)',
      }),
      el('div', { className: 'field' }, [el('label', { text: 'Группа' }), semGroup]),
      el('button', {
        type: 'button',
        className: 'btn danger',
        text: 'Сбросить расписание группы',
        onClick: async () => {
          if (!confirm('Точно сбросить расписание этой группы?')) return
          try {
            await resetSemester(semGroup.value)
            flash('Семестр сброшен')
          } catch (err) {
            flash(err.message, true)
          }
        },
      }),
    ]),
  )
  box.append(wrapAdminAcc('groups', 'Группы', [groupsSec]))
  } else {
    box.append(wrapAdminAcc('groups', 'Группы', null))
  }

  // —— Журнал безопасности (спойлер)
  if (isAdminSectionOpen('audit')) {
    const logBox = el('div', {})
    const csvBtn = el('button', {
      type: 'button',
      className: 'btn secondary',
      text: 'Скачать CSV',
      disabled: true,
      style: 'margin-top:8px',
    })
    logBox.append(
      el('p', {
        className: 'muted',
        text: 'Входы, коды, оценки и явка. Красным — подозрительное.',
      }),
    )
    const logList = el('div', { className: 'audit-list', text: 'Загрузка журнала…' })
    logBox.append(logList, csvBtn)
    box.append(wrapAdminAcc('audit', 'Журнал безопасности', [logBox]))

    let auditRows = []
    csvBtn.addEventListener('click', () => {
      if (!auditRows.length) {
        flash('Журнал пуст', true)
        return
      }
      downloadAuditCsv(auditRows)
      flash('CSV скачан')
    })

    fetchAuditLog(200)
      .then((rows) => {
        auditRows = rows
        logList.replaceChildren()
        if (!rows.length) {
          logList.append(
            el('p', {
              className: 'muted',
              text: 'Пока пусто — или выполни SQL security_audit.sql в Supabase.',
            }),
          )
          return
        }
        csvBtn.disabled = false
        for (const a of rows) {
          const t = a.at ? new Date(a.at) : null
          const when = t && !Number.isNaN(t.getTime())
            ? `${formatDateRu(t.toISOString().slice(0, 10))} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
            : '—'
          const line = [
            when,
            a.action,
            a.byRole || '—',
            a.groupId || '—',
            a.ip ? `ip ${a.ip}` : '',
            a.detail || '',
          ]
            .filter(Boolean)
            .join(' · ')
          logList.append(
            el('div', {
              className: a.suspicious ? 'audit-line audit-line--warn' : 'audit-line',
              text: line,
            }),
          )
        }
      })
      .catch((err) => {
        logList.textContent = err.message || 'Не удалось загрузить журнал'
      })
  } else {
    box.append(wrapAdminAcc('audit', 'Журнал безопасности', null))
  }

  return box
}

function downloadAuditCsv(rows) {
  const header = ['at', 'action', 'byRole', 'groupId', 'ip', 'detail', 'suspicious']
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [header.join(',')]
  for (const a of rows) {
    lines.push(
      [
        a.at || '',
        a.action || '',
        a.byRole || '',
        a.groupId || '',
        a.ip || '',
        a.detail || '',
        a.suspicious ? '1' : '0',
      ]
        .map(esc)
        .join(','),
    )
  }
  const blob = new Blob([`\ufeff${lines.join('\n')}`], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const day = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `rasp-audit-${day}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

function renderLegalDoc(kind) {
  const lines = kind === 'terms' ? termsParagraphs() : privacyParagraphs()
  const title = lines[0]
  const body = lines.slice(1)
  return el('div', { className: 'panel' }, [
    el('button', {
      type: 'button',
      className: 'btn secondary',
      text: '← Назад',
      onClick: () => {
        state.legalDoc = null
        render()
      },
    }),
    el('div', { className: 'card legal-card' }, [
      el('h2', { text: title }),
      ...body.map((p) => el('p', { className: 'legal-p', text: p })),
    ]),
  ])
}

/** false = классический «Ещё» (бэкап: ui-backups/more-classic-before-v2-2026-09-30.md) */
const MORE_UI_V2 = true

/** false = без аватаров (бэкап: ui-backups/profile-avatars-before-2026-10-01.md) */
const PROFILE_AVATARS = true

/** false = снова «ДЗ не задано» у каждой пары (бэкап: ui-backups/hw-ui-quiet-by-day-2026-10-01.md) */
const HW_EMPTY_QUIET = true

/** false = плоский список ДЗ; дни на вкладке ДЗ снова «только подсветка» (бэкап: ui-backups/hw-day-jump-before-2026-10-01.md) */
const HW_TAB_BY_DAY = true

/**
 * false = без лёгких анимаций (бэкап: ui-backups/ui-motion-before-2026-10-01.md)
 * — резкое раскрытие ДЗ, фото в новой вкладке, прежняя смена вкладок
 */
const UI_MOTION = true

/** false = мгновенная смена Пн–Пт без анимации (бэкап: ui-backups/day-swap-before-2026-10-05) */
const DAY_SWAP_MOTION = true

/** Класс панели при смене дня (направление + уважение reduce-motion) */
function daySwapPanelClass(base = 'panel', { allow = true } = {}) {
  if (!allow || !DAY_SWAP_MOTION || !motionOk() || !state.daySwap) return base
  return `${base} day-swap day-swap-${state.daySwap}`
}

/** false = снова текст «Загрузка…» (бэкап: ui-backups/boot-splash-before-2026-10-02.md) */
const BOOT_SPLASH = true

/** Заставка видна минимум столько (анимация успевает «прочитаться», без лишней паузы) */
const BOOT_SPLASH_MIN_MS = 720
/** Длительность «отлёта» логотипа при выходе */
const BOOT_SPLASH_EXIT_MS = 420
/** true, пока с Supabase не подтянулись реальные ДЗ (для скелетонов) */
let initialDataLoading = true

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** F5 / pull-reload — без заставки. Полное закрытие Chrome → type=navigate → с анимацией. */
function isPageReload() {
  try {
    const nav = performance.getEntriesByType?.('navigation')?.[0]
    if (nav) return nav.type === 'reload'
    return performance.navigation?.type === 1
  } catch {
    return false
  }
}

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function motionOk() {
  return UI_MOTION && !prefersReducedMotion()
}

/** false = без вибро-отклика и pull-to-refresh (бэкап: ui-backups/ui-feel-before-2026-10-02.md) */
const UI_FEEL = true

/** Короткая тактильная отдача на нажатие (телефоны, где поддерживается) */
function hapticTap(ms = 10) {
  if (!UI_FEEL) return
  try {
    if (navigator.vibrate) navigator.vibrate(ms)
  } catch {
    /* ignore */
  }
}

try {
  document.documentElement.classList.toggle('ui-motion', UI_MOTION)
} catch {
  /* ignore */
}

function moreSvg(kind) {
  const wrap = el('span', { className: 'more-row-ico', 'aria-hidden': 'true' })
  const svg = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M20 14.5A7.5 7.5 0 1 1 9.5 4 6 6 0 0 0 20 14.5z"/></svg>',
    users:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c1.2-3 3.2-4.5 5.5-4.5S13.3 16 14.5 19"/><circle cx="16.5" cy="8.5" r="2.4"/><path d="M14 15.2c1.4-1.2 2.9-1.7 4.8-1.5 1.2.1 2.2.5 3 1.2"/></svg>',
    phone:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><rect x="8" y="3" width="8" height="18" rx="2"/><path d="M11 18h2"/></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M4 8h13M4 8l3-3M4 8l3 3M20 16H7M20 16l-3-3M20 16l-3 3"/></svg>',
    group:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="9" cy="9" r="3"/><circle cx="16.5" cy="9.5" r="2.4"/><path d="M3.6 19c1-2.8 2.9-4.2 5.4-4.2s4.4 1.4 5.4 4.2"/><path d="M14.6 15.4c1.3-1 2.6-1.4 4.2-1.3 1 .1 1.9.4 2.6 1"/></svg>',
    contact:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><rect x="4" y="5" width="16" height="14" rx="2.5"/><circle cx="10" cy="10.5" r="2"/><path d="M7 16c.7-1.6 1.7-2.4 3-2.4s2.3.8 3 2.4"/><path d="M16 9.5h2M16 12.5h2"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="8" cy="8" r="3.6"/><path d="M10.7 10.7L20 20M17 17l2-2M14.5 14.5l2-2"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5A2.5 2.5 0 0 1 4 20.5z"/><path d="M8.5 7.5h6M8.5 11h4"/></svg>',
    club:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v3.3M12 17.2v3.3M3.5 12h3.3M17.2 12h3.3"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.7 1.1c0 1.7-2.3 1.9-2.3 3.6"/><path d="M12 17.3h.01"/></svg>',
    chevron:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
  }
  wrap.innerHTML = svg[kind] || ''
  return wrap
}

/** Иконка темы: солнце (светлая) ↔ луна (тёмная) с плавной сменой */
function moreThemeIcon(isDark) {
  const wrap = el('span', {
    className: `more-row-ico theme-toggle-ico${isDark ? ' is-dark' : ''}`,
    'aria-hidden': 'true',
  })
  wrap.innerHTML = [
    '<span class="theme-ico theme-ico-sun"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4"/></svg></span>',
    '<span class="theme-ico theme-ico-moon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M20 14.5A7.5 7.5 0 1 1 9.5 4 6 6 0 0 0 20 14.5z"/></svg></span>',
  ].join('')
  return wrap
}

function moreSettingsRow({ icon, title, sub, onClick, leading }) {
  return el(
    'button',
    {
      type: 'button',
      className: 'more-row',
      onClick,
    },
    [
      leading || moreSvg(icon),
      el('span', { className: 'more-row-text' }, [
        el('span', { className: 'more-row-title', text: title }),
        sub ? el('span', { className: 'more-row-sub', text: sub }) : null,
      ]),
      moreSvg('chevron'),
    ],
  )
}

/**
 * Личный кабинет: сводка по своим оценкам и пропускам.
 * Данные те же, что в дневнике (rasp_my_marks) — отдельного запроса нет.
 */
function renderCabinetCard(session) {
  if (!session || session.role === 'admin') return null
  // Дневник есть только у реального студента: его id начинается с 'st_',
  // у кода старосты группы в codeId лежит 'gc_…' — там сводки нет.
  const isStudent =
    session.role === 'student' || String(session.codeId || '').startsWith('st_')
  if (!isStudent) return null

  const box = el('div', { className: 'card cabinet-card' })
  const body = el('div', { className: 'cabinet-body', text: 'Считаем…' })
  box.append(
    el('div', { className: 'cabinet-head' }, [
      el('h3', { text: 'Личный кабинет' }),
      el('span', { className: 'muted', text: String(session.label || '').replace(/^null$/i, '') }),
    ]),
    body,
  )

  listMyMarks()
    .then((rows) => {
      const list = Array.isArray(rows) ? rows : []
      if (!list.length) {
        body.replaceChildren(
          el('p', {
            className: 'muted',
            style: 'margin:0',
            text: 'Пока нет оценок и отметок о пропусках.',
          }),
        )
        return
      }
      const grades = list
        .map((r) => Number(r.grade))
        .filter((n) => Number.isFinite(n) && n >= 2 && n <= 5)
      const avg = grades.length
        ? (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(2)
        : '—'
      const absent = list.filter((r) => {
        const att = String(r.attendance || '')
        return att && att !== 'present'
      }).length
      const subjects = new Set(list.map((r) => String(r.subject || '').trim()).filter(Boolean))

      const stat = (value, caption, tone) =>
        el('div', { className: `cabinet-stat${tone ? ` is-${tone}` : ''}` }, [
          el('strong', { text: String(value) }),
          el('span', { text: caption }),
        ])

      body.replaceChildren(
        el('div', { className: 'cabinet-stats' }, [
          stat(avg, 'средний балл', 'avg'),
          stat(grades.length, 'оценок'),
          stat(absent, 'пропусков', absent ? 'bad' : ''),
          stat(subjects.size, 'предметов'),
        ]),
        el('div', { className: 'cabinet-actions' }, [
          el('button', {
            type: 'button',
            className: 'btn secondary',
            text: 'Открыть дневник',
            onClick: () => {
              state.gradesMode = 'current'
              state.studyMode = 'grades'
              gotoTab('grades', { animate: true })
            },
          }),
        ]),
      )
    })
    .catch((err) => {
      body.replaceChildren(
        el('p', {
          className: 'muted',
          style: 'margin:0',
          text: err?.message || 'Не удалось загрузить сводку.',
        }),
      )
    })
  return box
}

function renderMore() {
  if (state.legalDoc) return renderLegalDoc(state.legalDoc)
  if (state.moreScreen === 'overrides') return renderMoreOverrides()
  if (state.moreScreen === 'group') return renderMoreGroup()
  if (state.moreScreen === 'contacts') return renderMoreContacts()
  if (state.moreScreen === 'mycode') return renderMoreMyCode()
  if (state.moreScreen === 'dpo') return renderPrograms('dpo')
  if (state.moreScreen === 'clubs') return renderPrograms('club')
  if (state.moreScreen === 'support') return renderMoreSupport()
  return MORE_UI_V2 ? renderMoreV2() : renderMoreClassic()
}

/**
 * Смена собственного кода. Отдельный экран профиля — в журнале эта форма
 * отвлекала от оценок и ломала ритм заголовков.
 */
function renderMoreMyCode() {
  const panel = el('div', { className: 'panel' }, [
    el('button', {
      type: 'button',
      className: 'btn secondary',
      text: '← Профиль',
      onClick: () => {
        state.moreScreen = ''
        render({ force: true })
      },
    }),
  ])

  const input = el('input', {
    type: 'password',
    maxlength: '64',
    autocomplete: 'new-password',
    placeholder: 'Новый код, от 8 символов',
    value: state.loginCodeDraft || '',
  })
  const reveal = el('button', {
    type: 'button',
    className: 'journal-link',
    text: 'Показать',
    onClick: () => {
      const hidden = input.type === 'password'
      input.type = hidden ? 'text' : 'password'
      reveal.textContent = hidden ? 'Скрыть' : 'Показать'
    },
  })
  const save = el('button', { className: 'btn', type: 'submit', text: 'Сохранить код' })

  const form = el('form', { className: 'field', style: 'gap:10px' }, [
    el('label', { text: 'Новый код' }),
    input,
    el('p', {
      className: 'muted',
      style: 'margin:0;font-size:12.5px',
      text: 'Не короче 8 символов. Запиши куда-нибудь — восстановить нельзя, только выдать новый через старосту.',
    }),
    el('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, [save, reveal]),
  ])
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    save.disabled = true
    save.textContent = 'Сохраняю…'
    try {
      await setOwnStudentCode(input.value)
      showToast('Код обновлён. В следующий раз входи им.')
      state.loginCodeDraft = ''
      input.value = ''
    } catch (err) {
      showToast(err.message, true)
    } finally {
      save.disabled = false
      save.textContent = 'Сохранить код'
    }
  })

  panel.append(el('div', { className: 'card' }, [el('h3', { text: 'Сменить код' }), form]))
  return panel
}
/**
 * Телефон в виде «+7 991 586 15 95».
 * Плюс и код страны подставляются сами: человек вводит только цифры.
 */
function formatPhone(raw) {
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

/**
 * «Мои контакты»: студент сам решает, чем делиться.
 * Ничего не подтягивается из внешних файлов — пустое поле значит «не указано».
 */
function renderMoreContacts() {
  const back = () =>
    el('button', {
      type: 'button',
      className: 'btn secondary',
      text: '← Профиль',
      onClick: () => {
        state.moreScreen = ''
        render({ force: true })
      },
    })

  const panel = el('div', { className: 'panel' }, [back()])
  const card = el('div', { className: 'card' })
  panel.append(card)

  const build = (me) => {
    const phone = el('input', {
      type: 'tel',
      placeholder: '+7 991 586 15 95',
      value: formatPhone(me?.phone || ''),
      autocomplete: 'tel',
      maxlength: '20',
      inputmode: 'tel',
    })
    // Плюс уже стоит: человек вводит 7/8 и цифры, пробелы расставляются сами.
    phone.addEventListener('input', () => {
      const atEnd = phone.selectionStart === phone.value.length
      phone.value = formatPhone(phone.value)
      if (atEnd) {
        const len = phone.value.length
        try {
          phone.setSelectionRange(len, len)
        } catch {
          /* ignore */
        }
      }
    })
    const email = el('input', {
      type: 'email',
      placeholder: 'you@example.ru',
      value: me?.email || '',
      autocomplete: 'email',
      maxlength: '96',
    })
    const tg = el('input', {
      type: 'text',
      placeholder: '@nickname',
      value: me?.telegram || '',
      autocomplete: 'off',
      maxlength: '64',
    })
    const visible = el('input', {
      type: 'checkbox',
      checked: me?.visible ? true : null,
      id: 'contacts-visible',
    })

    const form = el('form', { className: 'contacts-form' }, [
      el('h3', { text: 'Мои контакты' }),
      el('p', {
        className: 'muted',
        style: 'margin:0 0 10px',
        text: 'Необязательно. Заполняй, только если хочешь, чтобы одногруппники могли связаться.',
      }),
      el('div', { className: 'field' }, [el('label', { text: 'Телефон' }), phone]),
      el('div', { className: 'field' }, [el('label', { text: 'Почта' }), email]),
      el('div', { className: 'field' }, [el('label', { text: 'Telegram' }), tg]),
      el('label', { className: 'contacts-visible', for: 'contacts-visible' }, [
        visible,
        el('span', { text: 'Показывать эти контакты моей группе' }),
      ]),
      el('button', {
        type: 'submit',
        className: 'btn',
        style: 'margin-top:12px;width:100%',
        text: 'Сохранить',
      }),
    ])

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const btn = form.querySelector('button[type="submit"]')
      if (btn) btn.disabled = true
      try {
        await setMyContacts({
          phone: formatPhone(phone.value),
          email: email.value.trim(),
          telegram: tg.value.trim(),
          visible: !!visible.checked,
        })
        flash(visible.checked ? 'Сохранено. Группа увидит контакты.' : 'Сохранено. Контакты видишь только ты.')
        state.moreScreen = 'group'
        render({ force: true })
      } catch (err) {
        flash(err.message, true)
        if (btn) btn.disabled = false
      }
    })

    card.replaceChildren(form)
  }

  card.append(el('p', { className: 'muted', style: 'margin:0', text: 'Загружаем…' }))
  groupmates(state.groupId)
    .then((res) => build(res.me))
    .catch((err) => {
      const msg = String(err?.message || '')
      const notDeployed = /PGRST202|could not find the function|does not exist/i.test(msg)
      if (notDeployed) {
        card.replaceChildren(
          el('p', {
            className: 'muted',
            style: 'margin:0',
            text: 'Контакты ещё не включены на сервере: выполни supabase/contacts_and_groupmates.sql в Supabase → SQL Editor.',
          }),
        )
        return
      }
      build(null)
    })

  return panel
}

/** Замены внутри профиля — отдельной вкладки больше нет. */
function renderMoreOverrides() {
  const group = getGroup(state.groupId)
  return el('div', { className: 'panel' }, [
    el('button', {
      type: 'button',
      className: 'btn secondary',
      text: '← Профиль',
      onClick: () => {
        state.moreScreen = ''
        render({ force: true })
      },
    }),
    group ? renderOverridesTab(group) : el('div', { className: 'empty', text: 'Сначала выбери группу.' }),
  ])
}

const ROLE_LABEL = {
  starosta: 'Староста',
  teacher: 'Преподаватель',
  student: 'Студент',
}

const STAFF_KIND_LABEL = {
  deputy: 'Зам старосты',
  hw: 'Может писать ДЗ',
}

/**
 * Карточка ролей группы.
 * Староста видит, кто его замы (до 4) и кто может писать ДЗ (без ограничения).
 * Зам видит только список, без права назначать замов — сервер это тоже проверяет.
 */
function paintStaffCard(host, students) {
  const groupId = state.groupId
  if (!groupId) {
    host.remove()
    return
  }

  const build = (data) => {
    const canEdit = ['admin', 'curator', 'starosta', 'deputy'].includes(data.me)
    const canSetDeputy = ['admin', 'curator', 'starosta'].includes(data.me)
    if (!canEdit) {
      host.remove()
      return
    }
    const deputies = data.deputies || []
    const hwEditors = data.hwEditors || []
    const newsEditors = data.newsEditors || []
    const deputyIds = new Set(deputies.map((d) => String(d.studentId)))
    const hwIds = new Set(hwEditors.map((d) => String(d.studentId)))
    const newsIds = new Set(newsEditors.map((d) => String(d.studentId)))
    const meDeputyCount = deputies.length
    const canSetNews = ['admin', 'curator', 'starosta', 'deputy'].includes(data.me)

    const apply = async (studentId, kind, on) => {
      try {
        const next = await staffSet(groupId, studentId, kind, on)
        build(next)
        showToast(on ? 'Права выданы' : 'Права сняты')
      } catch (err) {
        showToast(err.message, true)
      }
    }

    // Компактный список: только те, у кого есть роль, плюс кнопка «назначить».
    const rows = students.filter((st) => {
      const id = String(st.id)
      if (deputyIds.has(id) || hwIds.has(id) || newsIds.has(id)) return true
      return st.role === 'starosta' || st.role === 'teacher'
    })

    const chips = (st) => {
      const id = String(st.id)
      const out = []
      if (st.role === 'starosta' || st.role === 'teacher') {
        out.push(el('span', { className: 'staff-chip is-deputy', text: 'Староста' }))
      }
      if (deputyIds.has(id)) out.push(el('span', { className: 'staff-chip is-deputy', text: 'Зам' }))
      if (hwIds.has(id)) out.push(el('span', { className: 'staff-chip is-hw', text: 'ДЗ' }))
      if (newsIds.has(id)) out.push(el('span', { className: 'staff-chip is-news', text: 'Лента' }))
      return out
    }

    const listBox = el('div', { className: 'staff-list' })
    if (!rows.length) {
      listBox.append(
        el('p', {
          className: 'muted',
          style: 'margin:0;font-size:12.5px',
          text: 'Пока никого не назначили. Можно выдать права ниже.',
        }),
      )
    } else {
      rows.forEach((st) => {
        const name = String(st.fullName || st.surname || '').trim() || 'Без имени'
        listBox.append(
          el('div', { className: 'staff-row' }, [
            el('span', { className: 'staff-ava', text: (name.charAt(0) || '?').toUpperCase() }),
            el('span', { className: 'staff-main' }, [
              el('span', { className: 'staff-name', text: name }),
              el('span', { className: 'staff-chips' }, chips(st)),
            ]),
          ]),
        )
      })
    }

    // Назначение: выпадающий список свободных студентов + выбор роли.
    const free = students.filter((st) => {
      const id = String(st.id)
      return !deputyIds.has(id) && !hwIds.has(id)
    })
    const picker = el(
      'select',
      { className: 'staff-select' },
      [
        el('option', { value: '', text: 'Выбрать студента…' }),
        ...free.map((st) => {
          const name = String(st.fullName || st.surname || '').trim() || 'Без имени'
          return el('option', { value: String(st.id), text: name })
        }),
      ],
    )

    const give = (kind) => {
      const id = picker.value
      if (!id) {
        showToast('Сначала выбери студента', true)
        return
      }
      void apply(id, kind, true)
    }

    const assignBox = el('div', { className: 'staff-assign' }, [
      picker,
      el('div', { className: 'staff-assign-actions' }, [
        canSetDeputy
          ? el('button', {
              type: 'button',
              className: 'staff-btn',
              text: meDeputyCount >= 4 ? 'Замов уже 4' : 'Сделать замом',
              disabled: meDeputyCount >= 4,
              onClick: () => give('deputy'),
            })
          : null,
        el('button', {
          type: 'button',
          className: 'staff-btn is-hw',
          text: 'Разрешить писать ДЗ',
          onClick: () => give('hw'),
        }),
        canSetNews
          ? el('button', {
              type: 'button',
              className: 'staff-btn is-news',
              text: 'Разрешить вести ленту',
              onClick: () => give('news'),
            })
          : null,
      ]),
    ])

    // Снятие прав — маленькие крестики у чипов.
    const revoke = (st) => {
      const id = String(st.id)
      const btns = []
      if (deputyIds.has(id) && canSetDeputy) {
        btns.push(
          el('button', {
            type: 'button',
            className: 'staff-revoke',
            text: 'снять зама',
            onClick: () => apply(id, 'deputy', false),
          }),
        )
      }
      if (hwIds.has(id)) {
        btns.push(
          el('button', {
            type: 'button',
            className: 'staff-revoke',
            text: 'снять ДЗ',
            onClick: () => apply(id, 'hw', false),
          }),
        )
      }
      if (newsIds.has(id)) {
        btns.push(
          el('button', {
            type: 'button',
            className: 'staff-revoke',
            text: 'снять ленту',
            onClick: () => apply(id, 'news', false),
          }),
        )
      }
      return btns.length ? el('span', { className: 'staff-revoke-wrap' }, btns) : null
    }

    host.replaceChildren(
      el('div', { className: 'staff-head' }, [
        el('h3', { text: 'Роли в группе' }),
        el('span', { className: 'muted', text: `${meDeputyCount} / 4 замов` }),
      ]),
      el('p', {
        className: 'muted staff-hint',
        text: canSetDeputy
          ? 'Зам старосты ведёт журнал и построение. Писать ДЗ можно разрешить любому — без ограничения.'
          : 'Ты зам старосты: ведёшь журнал и построение, можешь разрешать писать ДЗ.',
      }),
      listBox,
      rows.map((st) => revoke(st)).filter(Boolean).length
        ? el('div', { className: 'staff-revoke-list' }, rows.map((st) => {
            const name = String(st.fullName || st.surname || '').trim() || 'Без имени'
            const rev = revoke(st)
            return rev
              ? el('div', { className: 'staff-revoke-row' }, [
                  el('span', { className: 'staff-revoke-name', text: name }),
                  rev,
                ])
              : null
          }))
        : null,
      assignBox,
    )
  }

  staffList(groupId)
    .then(build)
    .catch((err) => {
      const msg = String(err?.message || '')
      const notDeployed = /PGRST202|could not find the function|does not exist/i.test(msg)
      host.replaceChildren(
        el('p', {
          className: 'muted',
          style: 'margin:0',
          text: notDeployed
            ? 'Роли ещё не включены на сервере: выполни supabase/roles_delegation.sql в Supabase → SQL Editor.'
            : msg || 'Не удалось загрузить роли.',
        }),
      )
    })
}
/** «Моя группа»: кто учится рядом. Без кодов и контактов — только имена и роли. */
function renderMoreGroup() {
  const panel = el('div', { className: 'panel' }, [
    el('button', {
      type: 'button',
      className: 'btn secondary',
      text: '← Профиль',
      onClick: () => {
        state.moreScreen = ''
        render({ force: true })
      },
    }),
  ])
  const body = el('div', { className: 'card groupmates-card' }, [
    el('p', { className: 'muted', style: 'margin:0', text: 'Загружаем…' }),
  ])
  panel.append(body)

  // Роли: сразу видно, кто староста, кто зам, кто может писать ДЗ.
  const staffHost = el('div', { className: 'card staff-card' }, [
    el('p', { className: 'muted', style: 'margin:0', text: 'Загружаем роли…' }),
  ])
  panel.append(staffHost)

  groupmates(state.groupId)
    .then((res) => {
      const list = res.students || []
      paintStaffCard(staffHost, list)
      if (!list.length) {
        body.replaceChildren(
          el('p', {
            className: 'muted',
            style: 'margin:0',
            text: 'В группе пока никого нет. Староста добавляет состав в журнале.',
          }),
        )
        return
      }
      body.replaceChildren(
        el('div', { className: 'groupmates-head' }, [
          el('h3', { text: res.groupName || 'Моя группа' }),
          el('span', { className: 'muted', text: `${list.length} чел.` }),
        ]),
        el(
          'div',
          { className: 'groupmates-list' },
          list.map((st) => {
            const name = String(st.fullName || st.fullname || st.surname || '').trim()
            const role = String(st.role || 'student')
            const isMe = !!(st.isMe ?? st.isme)
            const contacts = [
              st.phone ? { kind: 'tel', text: st.phone, href: `tel:${st.phone.replace(/[^\d+]/g, '')}` } : null,
              st.email ? { kind: 'mail', text: st.email, href: `mailto:${st.email}` } : null,
              st.telegram
                ? {
                    kind: 'tg',
                    text: st.telegram,
                    href: `https://t.me/${String(st.telegram).replace(/^@/, '')}`,
                  }
                : null,
            ].filter(Boolean)

            return el('div', { className: `groupmates-row${isMe ? ' is-me' : ''}` }, [
              el('span', { className: 'groupmates-ava', text: (name.charAt(0) || '?').toUpperCase() }),
              el('span', { className: 'groupmates-main' }, [
                el('span', { className: 'groupmates-name', text: name || 'Без имени' }),
                role !== 'student'
                  ? el('span', { className: 'groupmates-role', text: ROLE_LABEL[role] || role })
                  : null,
                contacts.length
                  ? el(
                      'span',
                      { className: 'groupmates-contacts' },
                      contacts.map((c) =>
                        el('a', {
                          className: `groupmates-contact is-${c.kind}`,
                          href: c.href,
                          rel: c.kind === 'tg' ? 'noopener noreferrer' : null,
                          target: c.kind === 'tg' ? '_blank' : null,
                          text: c.text,
                        }),
                      ),
                    )
                  : null,
              ]),
              isMe ? el('span', { className: 'groupmates-me', text: 'это ты' }) : null,
            ])
          }),
        ),
        el('button', {
          type: 'button',
          className: 'btn secondary',
          style: 'margin:10px 0 4px;width:100%',
          text: 'Изменить мои контакты',
          onClick: () => {
            state.moreScreen = 'contacts'
            render({ force: true })
          },
        }),
      )
    })
    .catch((err) => {
      const msg = String(err?.message || '')
      const notDeployed = /PGRST202|could not find the function|does not exist/i.test(msg)
      body.replaceChildren(
        el('p', {
          className: 'muted',
          style: 'margin:0',
          text: notDeployed
            ? 'Список группы ещё не включён на сервере. Нужно один раз выполнить supabase/contacts_and_groupmates.sql в Supabase → SQL Editor.'
            : msg || 'Не удалось загрузить список группы.',
        }),
      )
    })

  return panel
}

function renderMoreV2() {
  const group = getGroup(state.groupId)
  const session = getSession()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const panel = el('div', { className: 'panel more-v2' }, [])

  if (session) {
    const customLabel = (session.label || '').trim()
    const label =
      customLabel ||
      (session.role === 'admin'
        ? 'Никитос'
        : session.role === 'curator'
          ? 'Куратор'
          : session.role === 'student'
            ? 'Студент'
            : 'Староста')
    const letter = label.charAt(0).toUpperCase() || '?'
    // Имя сверху (Кобзева), синий бейдж — отдельная подпись (Командир), иначе «Староста»
    const customRole = (session.roleTitle || '').trim()
    const roleText =
      session.role === 'admin'
        ? 'Админ'
        : session.role === 'curator'
          ? 'Куратор'
          : session.role === 'student'
            ? 'Студент'
            : customRole || (session.role === 'starosta' ? 'Староста' : 'Редактор')
    const avaUrl = PROFILE_AVATARS ? (session.avatarUrl || '').trim() : ''
    const avatarNode = avaUrl
      ? el('div', { className: 'more-avatar more-avatar-photo' }, [
          el('img', {
            src: avaUrl,
            alt: '',
            loading: 'lazy',
            referrerpolicy: 'no-referrer',
          }),
        ])
      : el('div', { className: 'more-avatar', text: letter })
    panel.append(
      el('div', { className: 'card more-profile-card more-profile-centered' }, [
        el('div', { className: 'more-profile' }, [
          avatarNode,
          el('div', { className: 'more-profile-meta' }, [
            el('div', { className: 'more-profile-name', text: label }),
            el('div', { className: 'more-profile-line' }, [
              el('span', { className: 'more-role-badge', text: roleText }),
              group ? el('span', { className: 'more-profile-group', text: group.name }) : null,
            ]),
          ]),
        ]),
        renderProfileAvatarControls(session),
      ]),
    )
    // У админа и кода старосты кабинета нет — renderCabinetCard вернёт null.
    // append(null) вставил бы в DOM текстовую строку «null», поэтому проверяем.
    const cabinet = renderCabinetCard(session)
    if (cabinet) panel.append(cabinet)
  }

  const themeIco = moreThemeIcon(isDark)
  const settingsKids = [
    el('h3', { text: 'Настройки' }),
    moreSettingsRow({
      leading: themeIco,
      title: 'Оформление',
      sub: isDark ? 'Тёмная · сменить' : 'Светлая · сменить',
      onClick: () => {
        const nextDark = !(document.documentElement.getAttribute('data-theme') === 'dark')
        const next = nextDark ? 'dark' : 'light'
        applyTheme(next)
        const ico = document.querySelector('.theme-toggle-ico')
        const row = document.querySelector('.more-settings .more-row')
        const subEl = row?.querySelector('.more-row-sub')
        if (ico && motionOk()) {
          // force reflow so transition always plays
          void ico.offsetWidth
          ico.classList.toggle('is-dark', nextDark)
          if (subEl) subEl.textContent = nextDark ? 'Тёмная · сменить' : 'Светлая · сменить'
          return
        }
        render()
      },
    }),
    moreSettingsRow({
      icon: 'users',
      title: 'Сменить группу',
      sub: group ? `Сейчас: ${group.name}` : 'Выбрать группу',
      onClick: () => openGroupPicker(),
    }),
    session
      ? moreSettingsRow({
          icon: 'group',
          title: 'Моя группа',
          sub: 'Одногруппники и роли',
          onClick: () => {
            state.moreScreen = 'group'
            render({ force: true })
          },
        })
      : null,
    session && (session.role === 'student' || String(session.codeId || '').startsWith('st_'))
      ? moreSettingsRow({
          icon: 'contact',
          title: 'Мои контакты',
          sub: 'Телефон, почта, Telegram — по желанию',
          onClick: () => {
            state.moreScreen = 'contacts'
            render({ force: true })
          },
        })
      : null,
    moreSettingsRow({
      icon: 'swap',
      title: 'Замены',
      sub: 'Отмены и переносы пар',
      onClick: () => {
        state.moreScreen = 'overrides'
        render({ force: true })
      },
    }),
    moreSettingsRow({
      icon: 'book',
      title: 'Доп. образование',
      sub: 'Программы и набор групп',
      onClick: () => {
        state.moreScreen = 'dpo'
        render({ force: true })
      },
    }),
    moreSettingsRow({
      icon: 'club',
      title: 'Кружки и секции',
      sub: 'Куда можно записаться',
      onClick: () => {
        state.moreScreen = 'clubs'
        render({ force: true })
      },
    }),
    moreSettingsRow({
      icon: 'help',
      title: 'Техподдержка',
      sub: 'Написать в поддержку',
      onClick: () => {
        state.moreScreen = 'support'
        render({ force: true })
      },
    }),
  ]

  // Смена своего кода — раньше жила в «Учёбе» и мешала журналу.
  if (session && (session.role === 'student' || String(session.codeId || '').startsWith('st_'))) {
    settingsKids.push(
      moreSettingsRow({
        icon: 'key',
        title: 'Сменить код',
        sub: 'Свой код входа',
        onClick: () => {
          state.moreScreen = 'mycode'
          render({ force: true })
        },
      }),
    )
  }

  if (!isStandaloneApp()) {
    settingsKids.push(
      moreSettingsRow({
        icon: 'phone',
        title: 'На экран телефона',
        sub: isIosDevice() ? 'Инструкция для Safari' : 'Ярлык сайта',
        onClick: async () => {
          if (await tryNativeInstall()) return
          state.showInstallHelp = !state.showInstallHelp
          render()
        },
      }),
    )
  }

  const settingsCard = el('div', { className: 'card more-settings' }, settingsKids)
  panel.append(settingsCard)

  if (!isStandaloneApp() && (state.showInstallHelp || isIosDevice())) {
    panel.append(renderInstallCard())
  } else if (isStandaloneApp()) {
    panel.append(
      el('div', { className: 'card' }, [
        el('p', { className: 'muted', style: 'margin:0', text: 'Уже открыто как ярлык — всё ок.' }),
      ]),
    )
  }

  if (!session) {
    const form = el('form', {
      className: state.highlightLogin ? 'card more-login login-highlight' : 'card more-login',
      id: 'more-login-form',
    })
    const code = el('input', {
      type: 'password',
      autocomplete: 'current-password',
      maxlength: '64',
      placeholder: 'Введите код авторизации',
      required: true,
      id: 'more-login-code',
      value: state.loginCodeDraft || '',
      disabled: isLocalDeviceBanned() ? true : undefined,
      enterKeyHint: 'go',
    })
    // Код не теряется при перерисовке: тосты и синк вызывают render() постоянно.
    code.addEventListener('input', () => {
      state.loginCodeDraft = code.value
    })
    const revealBtn = el('button', {
      type: 'button',
      className: 'journal-link login-reveal',
      text: 'Показать',
      onClick: () => {
        const hidden = code.type === 'password'
        code.type = hidden ? 'text' : 'password'
        revealBtn.textContent = hidden ? 'Скрыть' : 'Показать'
      },
    })
    const who = state.loginNeedWho
      ? el('input', {
          type: 'text',
          maxlength: '64',
          placeholder: 'Фамилия',
          autocomplete: 'name',
          value: state.loginWhoDraft || '',
        })
      : null
    if (who) {
      who.addEventListener('input', () => {
        state.loginWhoDraft = who.value
      })
    }
    form.append(
      el('h3', { text: 'Вход' }),
      el('p', {
        className: 'muted',
        text: isLocalDeviceBanned()
          ? 'С этого устройства сайт закрыт (бан).'
          : state.loginNeedWho
            ? 'Напиши фамилию — так поймём, чей это код.'
            : 'Код выдаёт админ.',
      }),
      el('div', { className: 'field' }, [
        el('div', { className: 'field-head' }, [
          el('label', { text: 'Код доступа' }),
          revealBtn,
        ]),
        code,
      ]),
      who ? el('div', { className: 'field' }, [el('label', { text: 'Фамилия' }), who]) : null,
      el('button', {
        className: 'btn',
        type: 'submit',
        text: 'Войти',
        disabled: isLocalDeviceBanned() ? true : undefined,
      }),
    )
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      try {
        const s = await loginWithCode(code.value, state.groupId || null, who?.value || '')
        if (s.groupId) {
          state.groupId = s.groupId
          localStorage.setItem(SELECTED_GROUP_KEY, s.groupId)
        }
        state.tab = 'schedule'
        state.highlightLogin = false
        state.loginNeedWho = false
        state.loginCodeDraft = ''
        state.loginWhoDraft = ''
        const whoName = (s.label || '').trim() || (s.role === 'admin' ? 'Никитос' : 'староста')
        flash(`Вы вошли как ${whoName}`)
      } catch (err) {
        if (err.needWho) {
          state.loginNeedWho = true
          state.loginCodeDraft = code.value
          render()
          return
        }
        flash(err.message, true)
        if (isLocalDeviceBanned()) render({ force: true })
      }
    })
    panel.append(form)
    if (state.highlightLogin) {
      requestAnimationFrame(() => {
        form.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Не фокусируем поле — иначе на телефоне сразу вылезает клавиатура
        setTimeout(() => {
          state.highlightLogin = false
          form.classList.remove('login-highlight')
        }, 2200)
      })
    }
  } else {
    panel.append(
      el('div', { className: 'card more-logout-card' }, [
        el('button', {
          type: 'button',
          className: 'btn secondary more-logout-btn',
          text: 'Выйти с этого устройства',
          onClick: () => {
            void confirmAndLogout()
          },
        }),
      ]),
    )
  }

  panel.append(
    el('div', { className: 'card more-support' }, [
      el('h3', { text: 'Поддержка' }),
      el('p', {
        className: 'muted',
        style: 'margin:0 0 12px',
        text: 'Вопросы и идеи по сайту — напиши в Telegram, ответим туда же.',
      }),
      el('a', {
        className: 'btn',
        href: 'https://t.me/rasphelp_bot',
        target: '_blank',
        rel: 'noopener noreferrer',
        text: 'Написать в поддержку',
        style: 'display:inline-flex;text-align:center;text-decoration:none',
      }),
    ]),
  )

  if (session?.role !== 'admin' && canUseFreeRooms(session)) {
    panel.append(
      el('div', { className: 'card more-free-rooms' }, [
        el('h3', { text: 'Свободные аудитории' }),
        renderAdminFreeRooms(),
      ]),
    )
  }

  if (session?.role === 'admin') panel.append(renderAdminPanel())

  panel.append(
    el('div', { className: 'more-legal' }, [
      el('button', {
        type: 'button',
        className: 'more-legal-link',
        text: 'Условия использования',
        onClick: () => {
          state.legalDoc = 'terms'
          render()
        },
      }),
      el('span', { className: 'more-legal-sep', text: '·' }),
      el('button', {
        type: 'button',
        className: 'more-legal-link',
        text: 'Политика конфиденциальности',
        onClick: () => {
          state.legalDoc = 'privacy'
          render()
        },
      }),
    ]),
  )

  if (session) {
    panel.append(
      el('p', {
        className: 'muted more-session-note',
        text: 'Вход на этом устройстве остаётся, пока сам не выйдешь. Полный выход — кнопка справа сверху.',
      }),
    )
  }

  panel.append(
    el('p', {
      className: 'footer-note',
      text: isRemoteMode()
        ? 'Общая база включена — ДЗ и замены видны всем. Неофициальный студенческий ресурс.'
        : 'Неофициальный студенческий ресурс. Сейчас локальный режим (без общей синхронизации).',
    }),
  )
  return panel
}

function renderMoreClassic() {
  const group = getGroup(state.groupId)
  const session = getSession()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const panel = el('div', { className: 'panel' }, [
    el('p', { className: 'muted', text: 'Группа, вход, админка' }),
    el('div', { className: 'card' }, [
      el('h3', { text: 'Оформление' }),
      el('button', {
        type: 'button',
        className: 'btn secondary',
        text: isDark ? 'Включить светлую тему' : 'Включить тёмную тему',
        onClick: () => {
          applyTheme(isDark ? 'light' : 'dark')
          render()
        },
      }),
    ]),
    el('div', { className: 'card' }, [
      el('h3', { text: 'Сменить группу' }),
      el('button', {
        type: 'button',
        className: 'btn secondary',
        text: group ? `Сейчас: ${group.name}` : 'Выбрать группу',
        onClick: () => openGroupPicker(),
      }),
    ]),
    el('div', { className: 'card' }, [
      el('h3', { text: 'Поддержка' }),
      el('p', {
        className: 'muted',
        style: 'margin:0 0 10px',
        text: 'Вопросы и идеи по сайту — напиши в Telegram, ответим туда же.',
      }),
      el('a', {
        className: 'btn',
        href: 'https://t.me/rasphelp_bot',
        target: '_blank',
        rel: 'noopener noreferrer',
        text: 'Написать в поддержку',
        style: 'display:inline-block;text-align:center;text-decoration:none',
      }),
    ]),
  ])

  if (!session) {
    const form = el('form', {
      className: state.highlightLogin ? 'card login-highlight' : 'card',
      id: 'more-login-form',
    })
    const code = el('input', {
      type: 'password',
      autocomplete: 'current-password',
      maxlength: '64',
      placeholder: 'Введите код авторизации',
      required: true,
      id: 'more-login-code',
      value: state.loginCodeDraft || '',
      disabled: isLocalDeviceBanned() ? true : undefined,
      enterKeyHint: 'go',
    })
    code.addEventListener('input', () => {
      state.loginCodeDraft = code.value
    })
    const revealBtn = el('button', {
      type: 'button',
      className: 'journal-link login-reveal',
      text: 'Показать',
      onClick: () => {
        const hidden = code.type === 'password'
        code.type = hidden ? 'text' : 'password'
        revealBtn.textContent = hidden ? 'Скрыть' : 'Показать'
      },
    })
    const who = state.loginNeedWho
      ? el('input', {
          type: 'text',
          maxlength: '64',
          placeholder: 'Фамилия',
          autocomplete: 'name',
          value: state.loginWhoDraft || '',
        })
      : null
    if (who) {
      who.addEventListener('input', () => {
        state.loginWhoDraft = who.value
      })
    }
    form.append(
      el('h3', { text: 'Вход' }),
      el('p', {
        className: 'muted',
        text: isLocalDeviceBanned()
          ? 'С этого устройства сайт закрыт (бан).'
          : state.loginNeedWho
            ? 'Напиши фамилию — так поймём, чей это код.'
            : 'Код выдаёт админ.',
      }),
      el('div', { className: 'field' }, [
        el('div', { className: 'field-head' }, [
          el('label', { text: 'Код доступа' }),
          revealBtn,
        ]),
        code,
      ]),
      who ? el('div', { className: 'field' }, [el('label', { text: 'Фамилия' }), who]) : null,
      el('button', {
        className: 'btn',
        type: 'submit',
        text: 'Войти',
        disabled: isLocalDeviceBanned() ? true : undefined,
      }),
    )
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      try {
        const s = await loginWithCode(code.value, state.groupId || null, who?.value || '')
        if (s.groupId) {
          state.groupId = s.groupId
          localStorage.setItem(SELECTED_GROUP_KEY, s.groupId)
        }
        state.tab = 'schedule'
        state.highlightLogin = false
        state.loginNeedWho = false
        state.loginCodeDraft = ''
        state.loginWhoDraft = ''
        const whoName = (s.label || '').trim() || (s.role === 'admin' ? 'Никитос' : 'староста')
        flash(`Вы вошли как ${whoName}`)
      } catch (err) {
        if (err.needWho) {
          state.loginNeedWho = true
          state.loginCodeDraft = code.value
          render()
          return
        }
        flash(err.message, true)
        if (isLocalDeviceBanned()) render({ force: true })
      }
    })
    panel.append(form)
    if (state.highlightLogin) {
      requestAnimationFrame(() => {
        form.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Без автофокуса — клавиатура на телефоне не открывается
        setTimeout(() => {
          state.highlightLogin = false
          form.classList.remove('login-highlight')
        }, 2200)
      })
    }
  } else {
    panel.append(
      el('div', { className: 'card' }, [
        el('h3', {
          text:
            session.role === 'admin'
              ? 'Сессия: админ'
              : session.role === 'student'
                ? `Сессия: ${(session.label || '').trim() || 'студент'}`
                : `Сессия: ${(session.label || '').trim() || 'староста'}`,
        }),
        el('button', {
          type: 'button',
          className: 'btn secondary',
          text: 'Выйти',
          onClick: () => {
            void confirmAndLogout()
          },
        }),
      ]),
    )
  }

  if (session?.role !== 'admin' && canUseFreeRooms(session)) {
    panel.append(
      el('div', { className: 'card more-free-rooms' }, [
        el('h3', { text: 'Свободные аудитории' }),
        renderAdminFreeRooms(),
      ]),
    )
  }

  if (session?.role === 'admin') panel.append(renderAdminPanel())

  panel.append(renderInstallCard())

  panel.append(
    el('div', { className: 'card' }, [
      el('h3', { text: 'Правовая информация' }),
      el('p', {
        className: 'muted',
        text: 'Мы можем сохранять технические логи (IP, действия) для безопасности. Подробности — в документах.',
      }),
      el('button', {
        type: 'button',
        className: 'btn secondary',
        style: 'margin-bottom:8px',
        text: 'Политика конфиденциальности',
        onClick: () => {
          state.legalDoc = 'privacy'
          render()
        },
      }),
      el('button', {
        type: 'button',
        className: 'btn secondary',
        text: 'Условия использования',
        onClick: () => {
          state.legalDoc = 'terms'
          render()
        },
      }),
    ]),
  )

  if (session) {
    panel.append(
      el('p', {
        className: 'muted',
        style: 'margin-top:8px',
        text: 'Вход на этом устройстве остаётся, пока сам не выйдешь. Полный выход — кнопка справа сверху.',
      }),
    )
  }

  panel.append(
    el('p', {
      className: 'footer-note',
      text: isRemoteMode()
        ? 'Общая база включена — ДЗ и замены видны всем. Неофициальный студенческий ресурс.'
        : 'Неофициальный студенческий ресурс. Сейчас локальный режим (без общей синхронизации).',
    }),
  )
  return panel
}

function renderBannedGate() {
  const base = import.meta.env.BASE_URL || '/chuikov-rasp/'
  const reason = getLocalBanReason()
  const panel = el('div', { className: 'panel banned-gate', style: 'padding-top:24px' })
  panel.append(
    el('header', { className: 'topbar' }, [
      el('div', { className: 'topbar-left' }, [
        el('div', { className: 'brand', text: 'Колледж Чуйкова' }),
        el('h1', { text: 'Вас тут не ждали' }),
      ]),
    ]),
    el('div', { className: 'card banned-gate-card' }, [
      el('img', {
        className: 'banned-cat',
        src: `${base}banned-cat.png`,
        alt: '',
        width: '220',
        height: '220',
        decoding: 'async',
      }),
      el('h2', { className: 'banned-gate-title', text: 'Вы в бане' }),
      reason
        ? el('p', { className: 'banned-gate-reason', text: `Причина: ${reason}` })
        : el('p', {
            className: 'banned-gate-text',
            text: 'Даже котик расстроился. С этого устройства сайт закрыт — и точка.',
          }),
      el('p', {
        className: 'muted banned-gate-sub',
        text: 'Если это ошибка — пиши админу. Если нет — ну что ж.',
      }),
    ]),
  )
  return panel
}

function renderClosedGate() {
  const panel = el('div', { className: 'panel', style: 'padding-top:24px' })
  panel.append(
    el('header', { className: 'topbar' }, [
      el('div', { className: 'topbar-left' }, [
        el('div', { className: 'brand', text: 'Колледж Чуйкова' }),
        el('h1', { text: 'Сайт временно закрыт' }),
      ]),
    ]),
    el('div', { className: 'card' }, [
      el('p', { text: getClosedMessage() }),
      el('p', {
        className: 'muted',
        style: 'margin-top:8px',
        text: 'Расписание скоро снова будет доступно.',
      }),
    ]),
  )

  const form = el('form', { className: 'card', style: 'margin-top:12px' })
  const code = el('input', {
    type: 'password',
    autocomplete: 'current-password',
    maxlength: '64',
    placeholder: 'Код доступа',
    required: true,
  })
  form.append(
    el('h3', { text: 'Вход' }),
    el('div', { className: 'field' }, [el('label', { text: 'Код' }), code]),
    el('button', { className: 'btn', type: 'submit', text: 'Войти' }),
  )
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      await loginWithCode(code.value, state.groupId || null)
      const s = getSession()
      if (s?.role !== 'admin') {
        await logout()
        flash('Нужен код админа', true)
        return
      }
      flash('Вход выполнен')
      state.tab = 'more'
      render()
    } catch (err) {
      flash(err.message || 'Неверный код', true)
    }
  })
  panel.append(form)
  panel.append(el('div', { id: 'flash-slot' }))
  paintFlashSlot()
  return panel
}

/** false = старое текстовое меню (бэкап: ui-backups/nav-text-only-before-icons-2026-09-30.md) */
const NAV_WITH_ICONS = true

const NAV_ICONS = {
  home:
    '<svg class="nav-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><path d="M9.5 20.5v-6h5v6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/></svg>',
  schedule:
    '<svg class="nav-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M8 3.5v3M16 3.5v3M4 10h16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
  grades:
    '<svg class="nav-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5C10.3 5.2 8.3 4.7 5.5 5v13c2.8-.3 4.8.2 6.5 1.5 1.7-1.3 3.7-1.8 6.5-1.5V5c-2.8-.3-4.8.2-6.5 1.5z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><path d="M12 6.5v13" fill="none" stroke="currentColor" stroke-width="1.75"/></svg>',
  hw:
    '<svg class="nav-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8a2 2 0 0 1 2 2v14H6V6a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M9 2.5h6v3H9z" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M9 11h6M9 15h4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
  teachers:
    '<svg class="nav-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M15 15l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
  overrides:
    '<svg class="nav-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="2.6" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M3.8 18.5c1-2.4 2.5-3.6 5.2-3.6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><circle cx="15.5" cy="8.2" r="2.4" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M12.2 18.5c.9-2.2 2.3-3.3 4.8-3.3 1.2 0 2.2.3 3 .8" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
  more:
    '<svg class="nav-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.4" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M5 20c1.5-3.5 3.8-5.2 7-5.2s5.5 1.7 7 5.2" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
}

function renderNav() {
  const items = [
    { id: 'home', label: 'Главная' },
    { id: 'schedule', label: 'Расписание' },
    { id: 'grades', label: 'Учёба' },
    { id: 'teachers', label: 'Справочник' },
    { id: 'more', label: 'Профиль' },
  ]
  return el(
    'nav',
    { className: NAV_WITH_ICONS ? 'nav nav-with-icons' : 'nav' },
    items.map((item) => {
      const btn = el('button', {
        type: 'button',
        className: state.tab === item.id ? 'active' : '',
        onClick: () => {
          hapticTap()
          // Кнопка снизу — плавное появление карточек; свайп идёт без cascade
          switchTab(item.id, { animate: true })
        },
      })
      if (NAV_WITH_ICONS) {
        btn.innerHTML = `${NAV_ICONS[item.id]}<span class="nav-label">${item.label}</span>`
      } else {
        btn.textContent = item.label
      }
      return btn
    }),
  )
}

const TAB_ORDER = ['home', 'schedule', 'grades', 'teachers', 'more']

/**
 * Кардинально: все 5 вкладок всегда в DOM (pager).
 * Свайп только двигает transform — ничего не собирается заново.
 */
let tabSwitchShieldUntil = 0

function tabSwitchShieldActive() {
  return Date.now() < tabSwitchShieldUntil
}

function clearCascadeAnim(root) {
  if (!root) return
  if (root.classList?.contains('do-cascade')) root.classList.remove('do-cascade')
  root.querySelectorAll?.('.do-cascade').forEach((n) => n.classList.remove('do-cascade'))
}

/* ================= Доп. образование и кружки ================= */

const PROGRAM_KINDS = {
  dpo: {
    title: 'Доп. образование',
    kicker: 'Программы обучения и набор групп',
    empty: 'Программ пока нет',
    emptyHint: 'Куратор, староста или админ может добавить первую программу.',
  },
  club: {
    title: 'Кружки и секции',
    kicker: 'Куда можно записаться',
    empty: 'Кружков пока нет',
    emptyHint: 'Куратор, староста или админ может добавить первый кружок.',
  },
}

/** Какие разделы уже подтянули данные с сервера в этой сессии. */
const programsLoaded = new Set()

function programImages(item) {
  return (item.attachments || []).filter(
    (a) => /^image\//i.test(a.mime || '') || /\.(jpe?g|png|webp|gif)$/i.test(a.url || ''),
  )
}

/** Видео можно указать относительным путём — тогда файл лежит в public/. */
function programVideoSrc(url) {
  const u = String(url || '').trim()
  if (!u) return ''
  if (/^https?:\/\//i.test(u)) return u
  const base = import.meta.env.BASE_URL || '/chuikov-rasp/'
  return `${base}${u.replace(/^\/+/, '')}`
}

/** Кто может добавлять и править программы: админ, куратор, староста. */
function canManagePrograms() {
  const s = getSession()
  if (!s) return false
  if (s.role === 'admin' || s.role === 'curator') return true
  return canEdit(state.groupId)
}

/** Программа, добавленная старостой, видна только его группе; админ и куратор — всем. */
function programGroupId() {
  const s = getSession()
  if (!s) return null
  if (s.role === 'admin' || s.role === 'curator') return null
  return state.groupId || null
}

function programMetaLine(item) {
  return [item.duration, item.price].filter(Boolean).join(' · ')
}

function emptyProgramDraft(kind) {
  return {
    id: null,
    kind,
    groupId: programGroupId(),
    title: '',
    subtitle: '',
    body: '',
    attachments: [],
    details: [],
    price: '',
    duration: '',
    contact: '',
    videoUrl: '',
    pinned: false,
  }
}

function renderPrograms(kind) {
  const cfg = PROGRAM_KINDS[kind] || PROGRAM_KINDS.dpo
  const groupId = state.groupId || null
  const canManage = canManagePrograms()

  const panel = el('div', { className: 'panel program-panel' }, [
    el('button', {
      type: 'button',
      className: 'btn secondary',
      text: '← Профиль',
      onClick: () => {
        state.moreScreen = ''
        state.programDraft = null
        render({ force: true })
      },
    }),
    el('div', { className: 'program-head' }, [
      el('div', { className: 'program-head-text' }, [
        el('h2', { className: 'program-head-title', text: cfg.title }),
        el('p', { className: 'program-head-sub', text: cfg.kicker }),
      ]),
      canManage
        ? el('button', {
            type: 'button',
            className: 'program-add',
            text: '+',
            title: 'Добавить',
            onClick: () => {
              hapticTap()
              state.programDraft = emptyProgramDraft(kind)
              if (!refreshTabPanes(['more'], { force: true })) render({ force: true })
            },
          })
        : null,
    ]),
  ])

  // Редактор открыт поверх списка: человек видит и форму, и что уже есть.
  if (state.programDraft && state.programDraft.kind === kind) {
    panel.append(renderProgramEditor(kind))
  }

  const listBox = el('div', { className: 'program-list' })
  panel.append(listBox)

  const paint = (rows) => {
    listBox.replaceChildren()
    if (!rows.length) {
      listBox.append(
        el('div', { className: 'program-empty' }, [
          el('p', { className: 'program-empty-title', text: cfg.empty }),
          el('p', { className: 'program-empty-text', text: cfg.emptyHint }),
        ]),
      )
      return
    }
    rows.forEach((item, i) => {
      const imgs = programImages(item)
      listBox.append(
        el(
          'button',
          {
            type: 'button',
            className: `program-card${item.pinned ? ' is-pinned' : ''}`,
            onClick: () => {
              hapticTap()
              openProgramReader(rows, i, kind)
            },
          },
          [
            imgs.length
              ? el('span', { className: 'program-card-thumb' }, [
                  el('img', {
                    src: imgs[0].url,
                    alt: '',
                    loading: 'lazy',
                    decoding: 'async',
                    referrerpolicy: 'no-referrer',
                  }),
                ])
              : el('span', {
                  className: 'program-card-thumb is-blank',
                  'aria-hidden': 'true',
                  text: (item.title || '?').charAt(0).toUpperCase(),
                }),
            el('span', { className: 'program-card-body' }, [
              item.pinned
                ? el('span', { className: 'program-card-pin', text: 'Главное' })
                : null,
              el('span', { className: 'program-card-title', text: item.title }),
              item.subtitle ? el('span', { className: 'program-card-sub', text: item.subtitle }) : null,
              programMetaLine(item)
                ? el('span', { className: 'program-card-meta', text: programMetaLine(item) })
                : null,
            ]),
            el('span', { className: 'program-card-chev', 'aria-hidden': 'true', text: '›' }),
          ],
        ),
      )
    })
  }

  paint(getPrograms(kind, groupId))

  if (!programsLoaded.has(kind)) {
    programsLoaded.add(kind)
    refreshPrograms(kind, groupId)
      .then((rows) => paint(rows))
      .catch((err) => {
        programsLoaded.delete(kind)
        const msg = String(err?.message || '')
        if (/PGRST202|could not find the function|does not exist|schema cache/i.test(msg)) {
          listBox.replaceChildren(
            el('div', { className: 'program-empty' }, [
              el('p', { className: 'program-empty-title', text: 'Раздел ещё не включён' }),
              el(
                'p',
                {
                  className: 'program-empty-text',
                  text: 'Выполни supabase/programs.sql в Supabase → SQL Editor.',
                },
              ),
            ]),
          )
        } else if (!getPrograms(kind, groupId).length) {
          listBox.replaceChildren(
            el('div', { className: 'program-empty' }, [
              el('p', { className: 'program-empty-title', text: 'Не удалось загрузить' }),
              el('p', { className: 'program-empty-text', text: msg || 'Проверь связь.' }),
            ]),
          )
        }
      })
  }

  return panel
}

/** Полноэкранный просмотр программы: как у событий, только с таблицей и видео. */
function openProgramReader(items, startIndex = 0, kind = 'dpo') {
  if (!items?.length) return
  let list = items
  let index = Math.max(0, Math.min(startIndex, items.length - 1))
  closeHwLightbox({ animate: false })
  document.querySelectorAll('.news-reader').forEach((n) => n.remove())

  const overlay = el('div', {
    className: 'news-reader program-reader',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': PROGRAM_KINDS[kind]?.title || 'Программа',
  })
  const page = el('div', { className: 'news-reader-page' })

  let closing = false
  const close = () => {
    if (closing) return
    closing = true
    overlay.classList.remove('is-open')
    overlay.classList.add('is-closing')
    document.documentElement.classList.remove('news-reader-open')
    document.body.classList.remove('news-reader-open')
    window.setTimeout(() => overlay.remove(), 260)
  }

  const paint = () => {
    const item = list[index] || {}
    const images = programImages(item)
    const cover = images[0]
    const canEditProgram = canManagePrograms()
    const video = programVideoSrc(item.videoUrl)
    const place = item.subtitle || PROGRAM_KINDS[kind]?.title || ''

    const hero = el('div', { className: 'news-reader-hero' }, [
      cover
        ? el('div', {
            className: 'news-reader-blur',
            'aria-hidden': 'true',
            style: `background-image:url("${cover.url}")`,
          })
        : null,
      cover
        ? el('img', {
            className: 'news-reader-cover',
            src: cover.url,
            alt: item.title || '',
            decoding: 'async',
            referrerpolicy: 'no-referrer',
          })
        : el('div', { className: 'news-reader-cover news-reader-cover-blank', 'aria-hidden': 'true' }),
      el('div', { className: 'news-reader-scrim', 'aria-hidden': 'true' }),
      images.length > 1
        ? el('button', {
            type: 'button',
            className: 'news-reader-zoom',
            text: `Все фото · ${images.length}`,
            onClick: () => {
              hapticTap()
              openHwLightbox(images.map((x) => x.url), 0)
            },
          })
        : null,
      el('div', { className: 'news-reader-head' }, [
        el('div', { className: 'program-reader-tags' }, [
          item.pinned ? el('span', { className: 'news-reader-pin', text: 'Главное' }) : null,
          el('span', { className: 'program-reader-kind', text: place }),
        ]),
        el('h1', { className: 'news-reader-title', text: item.title }),
        item.subtitle
          ? el('p', { className: 'program-reader-sub', text: item.subtitle })
          : null,
        el('p', { className: 'news-reader-date' }, [
          item.duration ? el('span', { text: item.duration }) : null,
          item.duration && item.price ? el('span', { className: 'news-reader-dot-sep', text: '·' }) : null,
          item.price ? el('span', { text: item.price }) : null,
        ]),
      ]),
    ])

    const extra = images.slice(1)

    const facts = []
    if (item.duration) facts.push(['Срок обучения', item.duration])
    if (item.price) facts.push(['Стоимость', item.price])

    const headFacts = facts.length
      ? el(
          'div',
          { className: 'program-facts' },
          facts.map(([k, v]) =>
            el('div', { className: 'program-fact' }, [
              el('span', { className: 'program-fact-k', text: k }),
              el('span', { className: 'program-fact-v', text: v }),
            ]),
          ),
        )
      : null

    const details = (item.details || []).length
      ? el(
          'div',
          { className: 'program-details' },
          [
            el('h2', { className: 'program-section-title', text: 'Что важно знать' }),
            el(
              'dl',
              { className: 'program-details-list' },
              (item.details || []).flatMap((d) => [
                el('dt', { text: d.label || '' }),
                el('dd', { text: d.value || '' }),
              ]),
            ),
          ],
        )
      : null

    const videoBox = video
      ? el('div', { className: 'program-video' }, [
          el('video', {
            className: 'program-video-el',
            src: video,
            controls: true,
            muted: true,
            playsinline: true,
            preload: 'metadata',
          }),
        ])
      : null

    const contact = item.contact
      ? el('div', { className: 'program-contact' }, [
          el('span', { className: 'program-contact-k', text: 'Записаться и спросить' }),
          el('span', { className: 'program-contact-v', text: item.contact }),
        ])
      : null

    const body = el('div', { className: 'news-reader-content' }, [
      headFacts,
      videoBox,
      item.body
        ? el('p', { className: 'news-reader-text', text: item.body })
        : el('p', { className: 'news-reader-text news-reader-text-muted', text: 'Описания пока нет.' }),
      details,
      extra.length
        ? el(
            'div',
            { className: 'news-reader-extra' },
            extra.map((a, i) =>
              el('img', {
                className: 'news-reader-extra-photo',
                src: a.url,
                alt: '',
                loading: 'lazy',
                decoding: 'async',
                referrerpolicy: 'no-referrer',
                onClick: () => {
                  hapticTap()
                  openHwLightbox(images.map((x) => x.url), i + 1)
                },
              }),
            ),
          )
        : null,
      contact,
      list.length > 1
        ? el('div', { className: 'news-reader-foot' }, [
            el('span', { className: 'news-reader-foot-count', text: `${index + 1} из ${list.length}` }),
          ])
        : null,
    ])

    const pager =
      list.length > 1
        ? el('nav', { className: 'news-reader-pager' }, [
            el('button', {
              type: 'button',
              className: 'news-reader-pager-btn',
              text: '‹',
              'aria-label': 'Предыдущая программа',
              disabled: index === 0,
              onClick: () => step(-1),
            }),
            el(
              'div',
              { className: 'news-reader-pager-dots' },
              list.map((n, i) =>
                el('button', {
                  type: 'button',
                  className: i === index ? 'news-reader-pager-dot is-on' : 'news-reader-pager-dot',
                  'aria-label': `Программа ${i + 1}`,
                  onClick: () => {
                    if (i === index) return
                    index = i
                    paint()
                    page.scrollTop = 0
                  },
                }),
              ),
            ),
            el('button', {
              type: 'button',
              className: 'news-reader-pager-btn',
              text: '›',
              'aria-label': 'Следующая программа',
              disabled: index >= list.length - 1,
              onClick: () => step(1),
            }),
          ])
        : null

    page.replaceChildren(
      hero,
      body,
      el('div', { className: 'news-reader-toolbar' }, [
        canEditProgram
          ? el('button', {
              type: 'button',
              className: 'news-reader-tool is-up',
              text: 'Выше',
              title: 'Показывать раньше',
              onClick: () => move(-1),
            })
          : null,
        canEditProgram
          ? el('button', {
              type: 'button',
              className: 'news-reader-tool is-down',
              text: 'Ниже',
              title: 'Показывать позже',
              onClick: () => move(1),
            })
          : null,
        canEditProgram
          ? el('button', {
              type: 'button',
              className: 'news-reader-tool',
              text: 'Изменить',
              onClick: () => edit(),
            })
          : null,
        canEditProgram
          ? el('button', {
              type: 'button',
              className: 'news-reader-tool is-del',
              text: 'Удалить',
              onClick: () => removeItem(),
            })
          : null,
      ]),
      pager,
    )
  }

  const step = (delta) => {
    const next = index + delta
    if (next < 0 || next >= list.length) return
    hapticTap()
    index = next
    paint()
    page.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const move = async (dir) => {
    const item = list[index]
    if (!item) return
    hapticTap()
    try {
      await moveProgram(item.id, dir, kind, state.groupId)
      const fresh = getPrograms(kind, state.groupId)
      const at = fresh.findIndex((p) => p.id === item.id)
      index = at < 0 ? 0 : at
      list = fresh
      showToast(dir < 0 ? 'Подняли выше' : 'Опустили ниже')
      paint()
      if (!refreshTabPanes(['more'], { force: true })) render({ force: true })
    } catch (err) {
      showToast(err.message, true)
    }
  }

  const edit = () => {
    const item = list[index]
    if (!item) return
    hapticTap()
    state.programDraft = {
      id: item.id,
      kind: item.kind || kind,
      groupId: item.groupId || null,
      title: item.title,
      subtitle: item.subtitle,
      body: item.body,
      attachments: item.attachments.slice(),
      details: (item.details || []).map((d) => ({ label: d.label, value: d.value })),
      price: item.price,
      duration: item.duration,
      contact: item.contact,
      videoUrl: item.videoUrl,
      pinned: item.pinned,
    }
    close()
    if (!refreshTabPanes(['more'], { force: true })) render({ force: true })
  }

  const removeItem = async () => {
    const item = list[index]
    if (!item) return
    if (!confirm(`Удалить «${item.title}»?`)) return
    try {
      await deleteProgram(item.id)
      showToast('Удалено')
      close()
      if (!refreshTabPanes(['more'], { force: true })) render({ force: true })
    } catch (err) {
      showToast(err.message, true)
    }
  }

  paint()

  overlay.append(
    el('button', {
      type: 'button',
      className: 'news-reader-close',
      text: '✕',
      'aria-label': 'Закрыть',
      onClick: close,
    }),
    page,
  )
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close()
  })

  // Свайп: горизонтально — соседняя программа, вертикально — прокрутка.
  let sx = null
  let sy = null
  let pulled = 0
  let axis = null
  const resetShift = (animate = true) => {
    page.style.transition = animate ? 'transform 220ms cubic-bezier(0.22,0.61,0.36,1)' : 'none'
    page.style.transform = ''
  }
  page.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    sx = e.clientX
    sy = e.clientY
    pulled = 0
    axis = null
  })
  page.addEventListener('pointermove', (e) => {
    if (sx == null) return
    const dx = e.clientX - sx
    const dy = e.clientY - sy
    if (!axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    if (axis === 'y') {
      pulled = page.scrollTop <= 0 ? dy : 0
      return
    }
    const atEdge = (dx > 0 && index === 0) || (dx < 0 && index === list.length - 1)
    const shift = atEdge ? dx * 0.28 : dx
    page.style.transition = 'none'
    page.style.transform = `translate3d(${shift}px,0,0)`
    page.style.opacity = String(Math.max(0.55, 1 - Math.abs(shift) / 900))
    if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      const dir = dx < 0 ? 1 : -1
      sx = null
      resetShift()
      page.style.opacity = ''
      step(dir)
    }
  })
  const release = () => {
    if (pulled > 110 && page.scrollTop <= 0) close()
    sx = null
    sy = null
    pulled = 0
    axis = null
    resetShift()
    page.style.opacity = ''
  }
  page.addEventListener('pointerup', release)
  page.addEventListener('pointercancel', release)

  const onKey = (e) => {
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowLeft') step(-1)
    else if (e.key === 'ArrowRight') step(1)
  }
  document.addEventListener('keydown', onKey)
  overlay.addEventListener('remove', () => document.removeEventListener('keydown', onKey))

  document.body.append(overlay)
  document.documentElement.classList.add('news-reader-open')
  document.body.classList.add('news-reader-open')
  if (motionOk()) requestAnimationFrame(() => overlay.classList.add('is-open'))
  else overlay.classList.add('is-open')
}

/** Форма добавления и правки программы. Черновик живёт в state — ввод не теряется. */
function renderProgramEditor(kind) {
  const draft = state.programDraft
  const cfg = PROGRAM_KINDS[kind] || PROGRAM_KINDS.dpo
  const card = el('section', { className: 'card program-editor' })

  const grow = (node) => {
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }

  const title = el('textarea', {
    className: 'news-compose-grow',
    rows: '1',
    maxlength: '160',
    placeholder: 'Например: «Оператор БПЛА»',
  })
  title.value = draft.title || ''

  const subtitle = el('input', {
    type: 'text',
    maxlength: '300',
    placeholder: 'Короткая подпись под заголовком',
    value: draft.subtitle || '',
  })

  const body = el('textarea', {
    className: 'news-compose-grow',
    rows: '4',
    maxlength: '12000',
    placeholder: 'Что за программа, для кого, чему научат…',
  })
  body.value = draft.body || ''

  const price = el('input', {
    type: 'text',
    maxlength: '120',
    placeholder: '15 000 ₽',
    value: draft.price || '',
  })
  const duration = el('input', {
    type: 'text',
    maxlength: '120',
    placeholder: '6 недель (76 часов)',
    value: draft.duration || '',
  })
  const contact = el('input', {
    type: 'text',
    maxlength: '300',
    placeholder: 'Сысоев А. А., 8 (916)-286-61-75, каб. 211',
    value: draft.contact || '',
  })
  const videoUrl = el('input', {
    type: 'text',
    maxlength: '500',
    placeholder: 'video/dpo-intro.mp4 или ссылка',
    value: draft.videoUrl || '',
  })

  const pinned = el('input', { type: 'checkbox' })
  pinned.checked = !!draft.pinned

  // —— Характеристики: пары «что — значение»
  const detailsBox = el('div', { className: 'program-editor-details' })
  const paintDetails = () => {
    detailsBox.replaceChildren()
    draft.details.forEach((row, i) => {
      const label = el('input', {
        type: 'text',
        maxlength: '80',
        placeholder: 'Форма обучения',
        value: row.label || '',
      })
      const value = el('input', {
        type: 'text',
        maxlength: '400',
        placeholder: 'Очная с применением ДОТ',
        value: row.value || '',
      })
      label.addEventListener('input', () => {
        row.label = label.value
      })
      value.addEventListener('input', () => {
        row.value = value.value
      })
      detailsBox.append(
        el('div', { className: 'program-editor-detail-row' }, [
          label,
          value,
          el('button', {
            type: 'button',
            className: 'program-editor-x',
            text: '×',
            title: 'Убрать строку',
            onClick: () => {
              draft.details.splice(i, 1)
              paintDetails()
            },
          }),
        ]),
      )
    })
    detailsBox.append(
      el('button', {
        type: 'button',
        className: 'program-editor-addrow',
        text: '+ строка',
        onClick: () => {
          draft.details.push({ label: '', value: '' })
          paintDetails()
        },
      }),
    )
  }
  paintDetails()

  // —— Фото
  const file = el('input', {
    type: 'file',
    accept: 'image/jpeg,image/png,image/webp,image/gif',
    multiple: true,
  })
  const preview = el('div', { className: 'news-compose-preview' })
  const paintPreview = () => {
    preview.replaceChildren()
    if (!draft.attachments.length) {
      preview.append(el('p', { className: 'muted', text: 'Фото не выбрано' }))
      return
    }
    draft.attachments.forEach((a, i) => {
      preview.append(
        el('div', { className: 'news-compose-thumb' }, [
          el('img', { src: a.url, alt: a.name || '', loading: 'lazy', decoding: 'async' }),
          el('button', {
            type: 'button',
            className: 'news-compose-thumb-x',
            text: '×',
            title: 'Убрать',
            onClick: () => {
              draft.attachments.splice(i, 1)
              paintPreview()
            },
          }),
        ]),
      )
    })
  }
  paintPreview()

  file.addEventListener('change', async () => {
    if (!file.files?.length) return
    const room = MAX_NEWS_PHOTOS - draft.attachments.length
    if (room <= 0) {
      showToast(`Максимум ${MAX_NEWS_PHOTOS} фото`, true)
      file.value = ''
      return
    }
    try {
      const picked = [...file.files].slice(0, Math.min(room, 4))
      showToast('Загружаю фото…')
      const uploaded = await uploadHomeworkFiles(state.groupId, picked)
      draft.attachments.push(...uploaded)
      paintPreview()
    } catch (err) {
      showToast(err.message, true)
    } finally {
      file.value = ''
    }
  })

  ;[
    [title, 'title'],
    [subtitle, 'subtitle'],
    [body, 'body'],
    [price, 'price'],
    [duration, 'duration'],
    [contact, 'contact'],
    [videoUrl, 'videoUrl'],
  ].forEach(([node, key]) => {
    node.addEventListener('input', () => {
      draft[key] = node.value
      if (node.tagName === 'TEXTAREA') grow(node)
    })
  })
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      subtitle.focus()
    }
  })
  pinned.addEventListener('change', () => {
    draft.pinned = pinned.checked
  })
  requestAnimationFrame(() => {
    grow(title)
    grow(body)
  })

  const submit = el('button', {
    className: 'btn',
    type: 'submit',
    text: draft.id ? 'Сохранить' : 'Опубликовать',
  })
  const cancel = el('button', {
    type: 'button',
    className: 'btn btn-ghost',
    text: 'Отмена',
    onClick: () => {
      state.programDraft = null
      if (!refreshTabPanes(['more'], { force: true })) render({ force: true })
    },
  })

  const form = el('form', { className: 'news-compose-form' }, [
    el('div', { className: 'news-compose-head' }, [
      el('h3', {
        className: 'news-compose-title',
        text: draft.id ? 'Правка программы' : `Новая программа · ${cfg.title}`,
      }),
    ]),
    el('div', { className: 'field' }, [el('label', { text: 'Заголовок' }), title]),
    el('div', { className: 'field' }, [el('label', { text: 'Подпись' }), subtitle]),
    el('div', { className: 'field' }, [el('label', { text: 'Описание' }), body]),
    el('div', { className: 'program-editor-pair' }, [
      el('div', { className: 'field' }, [el('label', { text: 'Стоимость' }), price]),
      el('div', { className: 'field' }, [el('label', { text: 'Срок' }), duration]),
    ]),
    el('div', { className: 'field' }, [
      el('label', { text: 'Характеристики' }),
      detailsBox,
    ]),
    el('div', { className: 'field' }, [
      el('label', { text: `Фото (до ${MAX_NEWS_PHOTOS})` }),
      file,
      preview,
    ]),
    el('div', { className: 'field' }, [el('label', { text: 'Видео' }), videoUrl]),
    el('div', { className: 'field' }, [el('label', { text: 'Контакты' }), contact]),
    el('label', { className: 'news-compose-check' }, [
      pinned,
      el('span', { text: 'Закрепить сверху' }),
    ]),
    el('div', { className: 'news-compose-actions' }, [submit, cancel]),
  ])

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const t = title.value.trim()
    if (!t) {
      showToast('Нужен заголовок', true)
      return
    }
    submit.disabled = true
    submit.textContent = 'Сохраняю…'
    try {
      await saveProgram({
        id: draft.id,
        kind,
        groupId: draft.groupId || null,
        title: t,
        subtitle: subtitle.value.trim(),
        body: body.value.trim(),
        attachments: draft.attachments,
        details: draft.details,
        price: price.value.trim(),
        duration: duration.value.trim(),
        contact: contact.value.trim(),
        videoUrl: videoUrl.value.trim(),
        pinned: pinned.checked,
      })
      state.programDraft = null
      programsLoaded.delete(kind)
      showToast(draft.id ? 'Сохранено' : 'Опубликовано')
      if (!refreshTabPanes(['more'], { force: true })) render({ force: true })
    } catch (err) {
      submit.disabled = false
      submit.textContent = draft.id ? 'Сохранить' : 'Опубликовать'
      showToast(err.message, true)
    }
  })

  card.append(form)
  return card
}

/** Обращение в техподдержку — короткий экран вместо карточки в самом низу профиля. */
function renderMoreSupport() {
  const session = getSession()
  const panel = el('div', { className: 'panel' }, [
    el('button', {
      type: 'button',
      className: 'btn secondary',
      text: '← Профиль',
      onClick: () => {
        state.moreScreen = ''
        render({ force: true })
      },
    }),
  ])

  panel.append(
    el('div', { className: 'card support-hero' }, [
      el('h2', { className: 'support-hero-title', text: 'Техподдержка' }),
      el('p', {
        className: 'muted',
        style: 'margin:0',
        text: 'Что-то не работает, криво показывается или есть идея — напиши нам в Telegram. Ответим туда же, обычно в тот же день.',
      }),
      el('a', {
        className: 'btn support-hero-btn',
        href: 'https://t.me/rasphelp_bot',
        target: '_blank',
        rel: 'noopener noreferrer',
        text: 'Написать в Telegram',
      }),
    ]),
    el('div', { className: 'card' }, [
      el('h3', { text: 'Чтобы решили быстрее' }),
      el('ol', { className: 'support-steps' }, [
        el('li', { text: 'Что именно делал — открыл журнал, нажал «сохранить»…' }),
        el('li', { text: 'Что ожидал увидеть и что увидел на самом деле.' }),
        el('li', { text: 'Модель телефона и браузер: Chrome, Safari.' }),
        el('li', { text: 'Скриншот — если проблема на экране.' }),
      ]),
    ]),
  )

  if (session?.role === 'admin') {
    panel.append(
      el('div', { className: 'card' }, [
        el('p', {
          className: 'muted',
          style: 'margin:0',
          text: 'Обращения студентов приходят в Telegram-бот, а очередь видна в админке → «Обращения».',
        }),
      ]),
    )
  } else {
    panel.append(
      el('div', { className: 'card' }, [
        el('h3', { text: 'Частые вопросы' }),
        el('div', { className: 'support-faq' }, [
          el('p', { className: 'support-faq-q', text: 'Не вижу оценки' }),
          el('p', {
            className: 'support-faq-a',
            text: 'Оценки ставит староста или куратор. Если пары не было в журнале — их просто не завели.',
          }),
          el('p', { className: 'support-faq-q', text: 'Не пускает по коду' }),
          el('p', {
            className: 'support-faq-a',
            text: 'Код выдаёт староста. Если код потерян — попроси новый: старый перестанет работать.',
          }),
          el('p', { className: 'support-faq-q', text: 'Расписание не то' }),
          el('p', {
            className: 'support-faq-a',
            text: 'Проверь группу сверху экрана: свайп по расписанию работает только внутри выбранной группы.',
          }),
        ]),
      ]),
    )
  }

  return panel
}

/**
 * Главная: карусель событий с фото, что сейчас/дальше, ДЗ на сегодня,
 * лента и быстрые переходы. Всё из уже загруженного состояния.
 */
function renderHome() {
  const group = state.groupId ? getGroup(state.groupId) : null
  const wrap = el('div', { className: 'panel home-panel' })

  // —— Верхняя строка: колледж, семестр, группа. Раньше жила поверх фото фасада.
  wrap.append(
    el('div', { className: 'home-topline' }, [
      el('div', { className: 'home-topline-text' }, [
        el('p', { className: 'home-topline-kicker', text: getSemesterLabel() }),
        el('h2', { className: 'home-topline-title', text: 'Колледж Чуйкова' }),
      ]),
      group
        ? el('button', {
            type: 'button',
            className: 'home-topline-group',
            text: `${group.name} · сменить`,
            onClick: () => openGroupPicker(),
          })
        : null,
    ]),
  )

  // —— Карусель событий: фото + подпись поверх, листается пальцем.
  const hero = renderHomeHero(group)
  if (hero) wrap.append(hero)

  // —— Компоузер новости (староста/админ): открывается кнопкой «+» на карусели
  if (state.newsCompose) {
    const composer = renderNewsComposer(group)
    if (composer) wrap.append(composer)
  }


  if (!group) {
    wrap.append(
      el('div', { className: 'card' }, [
        el('h3', { text: 'Сначала выбери группу' }),
        el('p', { className: 'muted', text: 'Без группы не показать расписание и ДЗ.' }),
        el('button', {
          type: 'button',
          className: 'btn',
          text: 'Выбрать группу',
          onClick: () => openGroupPicker(),
        }),
      ]),
    )
    return wrap
  }

  // —— Что сейчас и что дальше
  const today = todayISO()
  const todayDay = weekdayFromISO(today)
  const todayLessons = todayDay ? getLessons(group.id, todayDay) : []
  const status = getScheduleNowStatus(group.id, today, todayLessons)
  wrap.append(renderHomeNow(status, group))

  // —— ДЗ на сегодня
  const hwToday = getHomework(group.id).filter(
    (h) => !isFormationSkipHw(h) && h.dueDate === today,
  )
  if (hwToday.length) {
    wrap.append(
      el('div', { className: 'card home-hw' }, [
        el('div', { className: 'home-card-head' }, [
          el('h3', { text: 'Сдать сегодня' }),
          el('span', { className: 'muted', text: String(hwToday.length) }),
        ]),
        ...hwToday.slice(0, 4).map((h) =>
          el('div', { className: 'home-hw-row' }, [
            el('strong', { text: h.subject || 'Предмет' }),
            h.text ? el('span', { className: 'muted', text: shortSubjectLabel(h.text, 70) }) : null,
          ]),
        ),
      ]),
    )
  }

  // —— Быстрые переходы: таб + необязательный подэкран профиля
  const tiles = [
    { tab: 'schedule', title: 'Расписание', sub: 'Все пары на неделю' },
    { tab: 'grades', title: 'Журнал', sub: 'Оценки и посещаемость', before: () => (state.studyMode = 'grades') },
    { tab: 'grades', title: 'Домашка', sub: 'Что задали', before: () => (state.studyMode = 'hw') },
    {
      tab: 'grades',
      title: 'Итоговые',
      sub: 'Средний балл и прогноз',
      before: () => {
        state.studyMode = 'grades'
        state.gradesMode = 'final'
      },
    },
    { tab: 'teachers', title: 'Справочник', sub: 'Препод или кабинет' },
    { tab: 'more', more: 'group', title: 'Моя группа', sub: 'Одногруппники и контакты' },
    { tab: 'more', more: 'overrides', title: 'Замены', sub: 'Отмены и переносы' },
    { tab: 'more', more: 'dpo', title: 'Доп. образование', sub: 'Программы и набор' },
    { tab: 'more', more: 'clubs', title: 'Кружки и секции', sub: 'Куда записаться' },
    { tab: 'more', more: 'support', title: 'Техподдержка', sub: 'Написать в поддержку' },
  ]
  wrap.append(
    el(
      'div',
      { className: 'home-tiles' },
      tiles.map((t) =>
        el('button', {
          type: 'button',
          className: 'home-tile',
          onClick: () => {
            hapticTap()
            if (t.before) t.before()
            if (t.more) {
              openMoreScreen(t.more)
              return
            }
            gotoTab(t.tab, { animate: true })
          },
        }, [
          el('span', { className: 'home-tile-title', text: t.title }),
          el('span', { className: 'home-tile-sub', text: t.sub }),
        ]),
      ),
    ),
  )

  return wrap
}

/** Карточка «идёт сейчас / следующая пара / на сегодня всё». */
/** Относительное время для ленты: «только что», «2 ч назад», «вчера». */
function relativeTime(iso) {
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
/** Дата события: «12 ноября 2026», для сегодняшних — «сегодня в 14:05». */
function formatNewsDate(iso) {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const today = new Date()
  const sameDay =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  if (sameDay) return `Сегодня, ${time}`
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  ) {
    return `Вчера, ${time}`
  }
  const date = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  return d.getFullYear() === today.getFullYear() ? date : `${date} ${d.getFullYear()}`
}

/**
 * Просмотр события: полноэкранная страница с плавной прокруткой.
 * Своя «шапка» с фото на весь экран, поверх — градиент и кнопка закрытия,
 * ниже — карточка с датой, заголовком и полным текстом.
 * Листание — свайпом влево/вправо и кнопками внизу.
 */
function openNewsReader(items, startIndex = 0) {
  if (!items?.length) return
  let index = Math.max(0, Math.min(startIndex, items.length - 1))
  closeHwLightbox({ animate: false })
  document.querySelectorAll('.news-reader').forEach((n) => n.remove())

  const overlay = el('div', {
    className: 'news-reader',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Событие',
  })
  const page = el('div', { className: 'news-reader-page' })

  let closing = false
  const close = () => {
    if (closing) return
    closing = true
    overlay.classList.remove('is-open')
    overlay.classList.add('is-closing')
    document.documentElement.classList.remove('news-reader-open')
    window.setTimeout(() => overlay.remove(), 260)
  }

  const paint = () => {
    const item = items[index]
    const images = (item.attachments || []).filter(
      (a) => /^image\//i.test(a.mime || '') || /\.(jpe?g|png|webp|gif)$/i.test(a.url || ''),
    )
    const canEditNews = canWriteNews(state.groupId)
    const cover = images[0]

    // Фон — та же картинка, размытая и растянутая: рамки вокруг фото не будет.
    // Сам снимок показываем целиком (contain), ничего не обрезаем.
    const hero = el('div', { className: 'news-reader-hero' }, [
      cover
        ? el('div', {
            className: 'news-reader-blur',
            'aria-hidden': 'true',
            style: `background-image:url("${cover.url}")`,
          })
        : null,
      cover
        ? el('img', {
            className: 'news-reader-cover',
            src: cover.url,
            alt: item.title || '',
            decoding: 'async',
          })
        : el('div', { className: 'news-reader-cover news-reader-cover-blank', 'aria-hidden': 'true' }),
      el('div', { className: 'news-reader-scrim', 'aria-hidden': 'true' }),
      images.length > 1
        ? el('button', {
            type: 'button',
            className: 'news-reader-zoom',
            text: `Все фото · ${images.length}`,
            onClick: () => {
              hapticTap()
              openHwLightbox(images.map((x) => x.url), 0)
            },
          })
        : null,
      el('div', { className: 'news-reader-head' }, [
        item.pinned ? el('span', { className: 'news-reader-pin', text: 'Главное' }) : null,
        el('h1', { className: 'news-reader-title', text: item.title }),
        el('p', { className: 'news-reader-date' }, [
          el('span', { text: formatNewsDate(item.createdAt) }),
          item.author ? el('span', { className: 'news-reader-dot-sep', text: '·' }) : null,
          item.author ? el('span', { text: item.author }) : null,
        ]),
      ]),
    ])

    // Остальные фото — уже в тексте, чтобы не отбирать внимание у обложки.
    const extra = images.slice(1)

    const body = el('div', { className: 'news-reader-content' }, [
      item.body
        ? el('p', { className: 'news-reader-text', text: item.body })
        : el('p', { className: 'news-reader-text news-reader-text-muted', text: 'Подробностей пока нет.' }),
      extra.length
        ? el(
            'div',
            { className: 'news-reader-extra' },
            extra.map((a, i) =>
              el('img', {
                className: 'news-reader-extra-photo',
                src: a.url,
                alt: '',
                loading: 'lazy',
                decoding: 'async',
                onClick: () => {
                  hapticTap()
                  openHwLightbox(images.map((x) => x.url), i + 1)
                },
              }),
            ),
          )
        : null,
      items.length > 1
        ? el('div', { className: 'news-reader-foot' }, [
            el('span', { className: 'news-reader-foot-count', text: `${index + 1} из ${items.length}` }),
          ])
        : null,
    ])

    const pager = items.length > 1
      ? el('nav', { className: 'news-reader-pager' }, [
          el('button', {
            type: 'button',
            className: 'news-reader-pager-btn',
            text: '‹',
            'aria-label': 'Предыдущее событие',
            disabled: index === 0,
            onClick: () => step(-1),
          }),
          el(
            'div',
            { className: 'news-reader-pager-dots' },
            items.map((n, i) =>
              el('button', {
                type: 'button',
                className: i === index ? 'news-reader-pager-dot is-on' : 'news-reader-pager-dot',
                'aria-label': `Событие ${i + 1}`,
                onClick: () => {
                  if (i === index) return
                  index = i
                  state.newsIndex = i
                  paint()
                  page.scrollTop = 0
                },
              }),
            ),
          ),
          el('button', {
            type: 'button',
            className: 'news-reader-pager-btn',
            text: '›',
            'aria-label': 'Следующее событие',
            disabled: index >= items.length - 1,
            onClick: () => step(1),
          }),
        ])
      : null

    page.replaceChildren(
      hero,
      body,
      el('div', { className: 'news-reader-toolbar' }, [
        canEditNews
          ? el('button', {
              type: 'button',
              className: 'news-reader-tool is-up',
              text: 'Выше',
              title: 'Показывать раньше',
              onClick: () => move(index, -1),
            })
          : null,
        canEditNews
          ? el('button', {
              type: 'button',
              className: 'news-reader-tool is-down',
              text: 'Ниже',
              title: 'Показывать позже',
              onClick: () => move(index, 1),
            })
          : null,
        canEditNews
          ? el('button', {
              type: 'button',
              className: 'news-reader-tool is-del',
              text: 'Удалить',
              onClick: () => removeItem(),
            })
          : null,
      ]),
      pager,
    )
  }

  const step = (delta) => {
    const next = index + delta
    if (next < 0 || next >= items.length) return
    hapticTap()
    index = next
    state.newsIndex = next
    paint()
    page.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const move = async (i, dir) => {
    const item = items[i]
    if (!item) return
    hapticTap()
    try {
      await moveNews(item.id, dir, state.groupId)
      const fresh = getNews(state.groupId)
      const at = fresh.findIndex((n) => n.id === item.id)
      index = at < 0 ? 0 : at
      items = fresh
      state.newsIndex = index
      showToast(dir < 0 ? 'Подняли выше' : 'Опустили ниже')
      paint()
      if (refreshTabPanes(['home'])) softUpdateNav()
    } catch (err) {
      showToast(err.message, true)
    }
  }

  const removeItem = async () => {
    const item = items[index]
    if (!item) return
    if (!confirm(`Удалить «${item.title}»?`)) return
    try {
      await deleteNews(item.id)
      showToast('Событие удалено')
      state.newsIndex = 0
      close()
      if (!refreshTabPanes(['home'])) render({ force: true })
    } catch (err) {
      showToast(err.message, true)
    }
  }

  paint()

  overlay.append(
    el('button', {
      type: 'button',
      className: 'news-reader-close',
      text: '✕',
      'aria-label': 'Закрыть',
      onClick: close,
    }),
    page,
  )
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close()
  })

  // Свайп по странице: горизонтально — соседнее событие, вертикально — прокрутка.
  // Страница едет за пальцем, чтобы жест был понятен до отпускания.
  let sx = null
  let sy = null
  let pulled = 0
  let axis = null
  const resetShift = (animate = true) => {
    page.style.transition = animate ? 'transform 220ms cubic-bezier(0.22,0.61,0.36,1)' : 'none'
    page.style.transform = ''
  }
  page.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    sx = e.clientX
    sy = e.clientY
    pulled = 0
    axis = null
  })
  page.addEventListener('pointermove', (e) => {
    if (sx == null) return
    const dx = e.clientX - sx
    const dy = e.clientY - sy
    if (!axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    if (axis === 'y') {
      pulled = page.scrollTop <= 0 ? dy : 0
      return
    }
    // Края: за первым/последним событием сопротивление больше.
    const atEdge = (dx > 0 && index === 0) || (dx < 0 && index === items.length - 1)
    const shift = atEdge ? dx * 0.28 : dx
    page.style.transition = 'none'
    page.style.transform = `translate3d(${shift}px,0,0)`
    page.style.opacity = String(Math.max(0.55, 1 - Math.abs(shift) / 900))
    if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      const dir = dx < 0 ? 1 : -1
      sx = null
      resetShift()
      page.style.opacity = ''
      step(dir)
    }
  })
  const release = () => {
    // Тянули страницу вниз при уже прокрученной наверх — закрываем.
    if (pulled > 110 && page.scrollTop <= 0) close()
    sx = null
    sy = null
    pulled = 0
    axis = null
    resetShift()
    page.style.opacity = ''
  }
  page.addEventListener('pointerup', release)
  page.addEventListener('pointercancel', release)

  const onKey = (e) => {
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowLeft') step(-1)
    else if (e.key === 'ArrowRight') step(1)
  }
  document.addEventListener('keydown', onKey)
  const cleanup = () => document.removeEventListener('keydown', onKey)
  overlay.addEventListener('remove', cleanup)

  document.body.append(overlay)
  document.documentElement.classList.add('news-reader-open')
  document.body.classList.add('news-reader-open')
  if (motionOk()) requestAnimationFrame(() => overlay.classList.add('is-open'))
  else overlay.classList.add('is-open')
}

/**
 * Карусель событий на главной — как в МГЮА: фото во всю ширину, подпись поверх,
 * листается пальцем, точки внизу. Первое, что видит студент, — картинка события.
 */
function renderHomeHero(group) {
  const items = getNews(group?.id || state.groupId)
  const canEditNews = canWriteNews(state.groupId)

  const base = import.meta.env.BASE_URL || '/chuikov-rasp/'

  if (!items.length) {
    if (!canEditNews) {
      // Новостей ещё нет — оставляем привычный фасад, чтобы главная не выглядела пустой.
      return el('section', { className: 'home-hero' }, [
        el('div', { className: 'home-hero-track' }, [
          el('article', { className: 'home-hero-slide' }, [
            el('img', {
              className: 'home-hero-img',
              src: `${base}hero-1200.jpg`,
              srcset: `${base}hero-800.jpg 800w, ${base}hero-1200.jpg 1200w`,
              sizes: '(max-width: 520px) 100vw, 820px',
              alt: 'Колледж имени В. И. Чуйкова',
              loading: 'eager',
              decoding: 'async',
            }),
            el('div', { className: 'home-hero-veil', 'aria-hidden': 'true' }),
          ]),
        ]),
      ])
    }
    return el('section', { className: 'home-hero home-hero-empty' }, [
      el('div', { className: 'home-hero-empty-inner' }, [
        el('p', { className: 'home-hero-empty-title', text: 'События колледжа' }),
        el('p', { className: 'home-hero-empty-text', text: 'Пока пусто. Опубликуй первое событие — оно появится здесь с фото.' }),
        el('button', {
          type: 'button',
          className: 'home-hero-empty-btn',
          text: '+ Добавить событие',
          onClick: () => {
            state.newsCompose = true
            render({ force: true })
          },
        }),
      ]),
    ])
  }

  const index = Math.max(0, Math.min(items.length - 1, Number(state.newsIndex) || 0))

  const slides = items.map((item, i) => {
    const images = (item.attachments || []).filter(
      (a) => /^image\//i.test(a.mime || '') || /\.(jpe?g|png|webp|gif)$/i.test(a.url || ''),
    )
    const photo = images[0]
    return el(
      'article',
      {
        className: 'home-hero-slide',
        dataset: { slide: String(i) },
        onClick: () => {
          // Свайп не должен открывать событие: тащим — молчим, тапнули — открываем.
          if (Number(track.dataset.moved || 0) > 8) return
          hapticTap()
          openNewsReader(items, i)
        },
      },
      [
        photo
          ? el('img', {
              className: 'home-hero-img',
              src: photo.url,
              alt: item.title || '',
              loading: i === 0 ? 'eager' : 'lazy',
              decoding: 'async',
            })
          : el('div', { className: 'home-hero-img home-hero-img-blank', 'aria-hidden': 'true' }),
        el('div', { className: 'home-hero-veil', 'aria-hidden': 'true' }),
        el('div', { className: 'home-hero-caption' }, [
          el('div', { className: 'home-hero-caption-top' }, [
            item.pinned ? el('span', { className: 'home-hero-pin', text: 'главное' }) : null,
            el('span', { className: 'home-hero-date', text: formatNewsDate(item.createdAt) }),
          ]),
          el('p', { className: 'home-hero-caption-title', text: item.title }),
          item.body ? el('p', { className: 'home-hero-caption-text', text: item.body }) : null,
          el('span', { className: 'home-hero-more', text: 'читать полностью' }),
        ]),
      ],
    )
  })

  const track = el('div', { className: 'home-hero-track' }, slides)
  const setX = (i, animate = true) => {
    track.style.transition = animate ? 'transform 320ms cubic-bezier(0.22, 0.61, 0.36, 1)' : 'none'
    track.style.transform = `translate3d(${-i * 100}%,0,0)`
  }
  setX(index, false)

  const dots = el(
    'div',
    { className: 'news-dots' },
    items.map((n, i) =>
      el('button', {
        type: 'button',
        className: i === index ? 'news-dot is-on' : 'news-dot',
        title: n.title,
        'aria-label': `Событие ${i + 1}`,
        onClick: () => {
          hapticTap()
          state.newsIndex = i
          setX(i)
          paintDots(i)
        },
      }),
    ),
  )
  const counter = items.length > 1
    ? el('span', { className: 'home-hero-count', text: `${index + 1} / ${items.length}` })
    : null

  const paintDots = (i) => {
    [...dots.children].forEach((d, k) => d.classList.toggle('is-on', k === i))
    if (counter) counter.textContent = `${i + 1} / ${items.length}`
  }

  // Свайп: тянем track за пальцем (или мышью), на отпускании — доводим до слайда.
  if (items.length > 1) {
    let x0 = null
    let y0 = null
    let drag = 0
    const begin = (cx, cy) => {
      x0 = cx
      y0 = cy
      drag = 0
      track.dataset.moved = '0'
      track.style.transition = 'none'
    }
    const move = (cx, cy) => {
      if (x0 == null) return
      const dx = cx - x0
      const dy = cy - y0
      // Вертикальный жест — это скролл страницы, карусель не трогаем.
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
        x0 = null
        setX(state.newsIndex || 0, false)
        return
      }
      drag = dx
      track.dataset.moved = String(Math.abs(dx))
      track.style.transform = `translate3d(calc(${-(state.newsIndex || 0) * 100}% + ${dx}px),0,0)`
    }
    const end = () => {
      if (x0 == null) return
      x0 = null
      let next = state.newsIndex || 0
      if (drag < -55 && next < items.length - 1) next += 1
      else if (drag > 55 && next > 0) next -= 1
      drag = 0
      if (next !== state.newsIndex) hapticTap()
      state.newsIndex = next
      setX(next)
      paintDots(next)
      window.setTimeout(() => {
        track.dataset.moved = '0'
      }, 60)
    }

    let pid = null
    track.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      pid = e.pointerId
      begin(e.clientX, e.clientY)
      try {
        track.setPointerCapture(pid)
      } catch {
        /* ignore */
      }
    })
    track.addEventListener('pointermove', (e) => {
      if (pid === null || e.pointerId !== pid) return
      move(e.clientX, e.clientY)
    })
    const finish = (e) => {
      if (pid === null || e.pointerId !== pid) return
      pid = null
      end()
      try {
        track.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    track.addEventListener('pointerup', finish)
    track.addEventListener('pointercancel', finish)
  }

  const wrapEl = el('section', { className: 'home-hero' }, [track, counter])

  // Автолистание: раз в 20 секунд, пока главная видна и карусель не трогают.
  if (items.length > 1) {
    startHeroAutoSlide(wrapEl, {
      count: items.length,
      getIndex: () => Number(state.newsIndex) || 0,
      setIndex: (i) => {
        state.newsIndex = i
        setX(i)
        paintDots(i)
      },
    })
  }

  if (canEditNews) {
    // Одна кнопка: «+» открывает форму, «−» закрывает. Иконка поворачивается.
    const composeBtn = el('button', {
      type: 'button',
      className: 'home-hero-add',
      text: state.newsCompose ? '−' : '+',
      title: state.newsCompose ? 'Закрыть форму' : 'Добавить событие',
      'aria-expanded': state.newsCompose ? 'true' : 'false',
      onClick: () => {
        hapticTap()
        state.newsCompose = !state.newsCompose
        if (!state.newsCompose) state.newsDraft = null
        render({ force: true })
        if (state.newsCompose) {
          requestAnimationFrame(() => {
            document.querySelector('.news-compose')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          })
        }
      },
    })
    if (state.newsCompose) composeBtn.classList.add('is-open')
    wrapEl.append(composeBtn)
  }

  if (items.length > 1) wrapEl.append(dots)

  return wrapEl
}

/** Ссылка на отложенное автолистание: перерисовка главной отменяет старое. */
let heroAutoTimer = null
let heroAutoObserver = null

/**
 * Автолистание карусели: раз в 20 секунд следующее событие.
 * Останавливается, когда вкладка не видна, когда идёт касание/свайп
 * и когда поверх открыт просмотр события.
 */
function startHeroAutoSlide(sectionEl, { count, getIndex, setIndex }) {
  const PERIOD = 20000
  if (heroAutoTimer) {
    clearInterval(heroAutoTimer)
    heroAutoTimer = null
  }
  if (heroAutoObserver) {
    heroAutoObserver.disconnect()
    heroAutoObserver = null
  }
  if (!(count > 1)) return

  let held = 0
  let paused = false
  const tick = () => {
    if (paused || held) return
    if (document.visibilityState !== 'visible') return
    if (!sectionEl.isConnected) return
    if (!state.tab || state.tab !== 'home') return
    if (document.querySelector('.news-reader')) return
    const i = getIndex() || 0
    setIndex((i + 1) % count)
  }
  heroAutoTimer = setInterval(tick, PERIOD)

  // Пауза на время касания — иначе автолистание выдёргивает слайд из-под пальца.
  const hold = () => {
    held += 1
  }
  const release = () => {
    held = Math.max(0, held - 1)
  }
  sectionEl.addEventListener('pointerdown', hold, { passive: true })
  sectionEl.addEventListener('pointerup', release, { passive: true })
  sectionEl.addEventListener('pointercancel', release, { passive: true })
  sectionEl.addEventListener('pointerleave', release, { passive: true })

  // Пауза, когда карусель вне экрана: незачем крутить впустую.
  if (typeof IntersectionObserver === 'function') {
    heroAutoObserver = new IntersectionObserver(
      (entries) => {
        paused = !entries.some((e) => e.isIntersecting)
      },
      { threshold: 0.25 },
    )
    heroAutoObserver.observe(sectionEl)
  }

  document.addEventListener('visibilitychange', () => {
    paused = document.hidden
  })
}

const FACULTY_LABEL = {
  ПД: 'Правоохранительная деятельность',
  ПСА: 'Право и организация социального обеспечения',
  ПСО: 'Право и судебное администрирование',
  ЭБАС: 'Экономическая безопасность',
  ИБАС: 'Информационная безопасность',
  Ю: 'Юриспруденция',
}

/** Все факультеты, которые вообще есть в колледже — из списка групп. */
function listFaculties() {
  const set = new Set()
  for (const g of listGroups()) {
    const f = String(g.faculty || '').trim()
    if (f) set.add(f)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'))
}

function canWriteNews(groupId) {
  const s = getSession()
  if (!s) return false
  if (s.role === 'admin') return true
  return canEdit(groupId)
}

const MAX_NEWS_PHOTOS = 10

/**
 * Компоузер события: заголовок, текст, фото, факультеты, закрепление.
 * Плюс на карточке превращается в минус — это одна и та же кнопка.
 */
function renderNewsComposer(group) {
  if (!canWriteNews(state.groupId)) return null
  if (!state.newsDraft) {
    state.newsDraft = {
      title: '',
      body: '',
      pinned: false,
      attachments: [],
      toAll: false,
      faculties: [],
    }
  }
  const draft = state.newsDraft
  if (!Array.isArray(draft.faculties)) draft.faculties = []
  const isAdmin = getSession()?.role === 'admin'
  const card = el('section', { className: 'card news-compose' })

  const title = el('textarea', {
    className: 'news-compose-grow',
    maxlength: '120',
    rows: '1',
    placeholder: 'Заголовок — «Экскурсия 20 ноября»',
  })
  title.value = draft.title

  const body = el('textarea', {
    className: 'news-compose-grow',
    maxlength: '4000',
    rows: '3',
    placeholder: 'Подробности: что, где, когда, кого касается…',
  })
  body.value = draft.body

  // Поле растёт под текст: видно всё сразу, без прокрутки внутри рамки.
  const grow = (node) => {
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }

  const file = el('input', {
    type: 'file',
    accept: 'image/jpeg,image/png,image/webp,image/gif',
    multiple: true,
  })
  const pinned = el('input', { type: 'checkbox' })
  pinned.checked = !!draft.pinned
  const toAll = el('input', { type: 'checkbox' })
  toAll.checked = !!draft.toAll

  // —— Факультеты: галочками. Ничего не выбрано = видят все.
  const faculties = listFaculties()
  const facChecks = new Map()
  const facBox = el('div', { className: 'news-fac-list' })
  const hint = el('p', { className: 'news-fac-hint' })

  const syncHint = () => {
    const picked = draft.faculties.length
    hint.textContent = picked
      ? `Увидят только выбранные: ${draft.faculties.map((f) => FACULTY_LABEL[f] || f).join(', ')}.`
      : 'Ничего не выбрано — событие увидят все факультеты.'
    hint.classList.toggle('is-all', !picked)
  }

  if (!faculties.length) {
    facBox.append(el('p', { className: 'muted', text: 'Список факультетов пуст.' }))
    syncHint()
  } else {
    facBox.append(
      el('label', { className: 'news-fac-row is-all' }, [
        (() => {
          const cb = el('input', { type: 'checkbox' })
          cb.checked = !draft.faculties.length
          cb.addEventListener('change', () => {
            if (!cb.checked) return
            draft.faculties = []
            facChecks.forEach((c) => {
              c.checked = false
            })
            syncHint()
          })
          facChecks.set('__all', cb)
          return cb
        })(),
        el('span', { className: 'news-fac-name', text: 'Все факультеты' }),
      ]),
    )
    for (const f of faculties) {
      const cb = el('input', { type: 'checkbox' })
      cb.checked = draft.faculties.includes(f)
      cb.addEventListener('change', () => {
        if (cb.checked) {
          if (!draft.faculties.includes(f)) draft.faculties.push(f)
        } else {
          draft.faculties = draft.faculties.filter((x) => x !== f)
        }
        const all = facChecks.get('__all')
        if (all) all.checked = !draft.faculties.length
        syncHint()
      })
      facChecks.set(f, cb)
      facBox.append(
        el('label', { className: 'news-fac-row' }, [
          cb,
          el('span', { className: 'news-fac-name', text: FACULTY_LABEL[f] || f }),
          el('span', { className: 'news-fac-code', text: f }),
        ]),
      )
    }
    syncHint()
  }

  const preview = el('div', { className: 'news-compose-preview' })
  const paintPreview = () => {
    preview.replaceChildren()
    if (!draft.attachments.length) {
      preview.append(el('p', { className: 'muted', text: 'Фото не выбрано' }))
      return
    }
    draft.attachments.forEach((a, i) => {
      preview.append(
        el('div', { className: 'news-compose-thumb' }, [
          el('img', { src: a.url, alt: a.name || '', loading: 'lazy', decoding: 'async' }),
          el('button', {
            type: 'button',
            className: 'news-compose-thumb-x',
            text: '×',
            title: 'Убрать',
            onClick: () => {
              draft.attachments.splice(i, 1)
              paintPreview()
            },
          }),
        ]),
      )
    })
    if (draft.attachments.length >= MAX_NEWS_PHOTOS) {
      preview.append(
        el('p', { className: 'muted', text: `Достигнут максимум — ${MAX_NEWS_PHOTOS} фото.` }),
      )
    }
  }
  paintPreview()

  // Черновик пишем сразу — тогда даже случайная перерисовка не сотрёт ввод.
  title.addEventListener('input', () => {
    draft.title = title.value
    grow(title)
  })
  body.addEventListener('input', () => {
    draft.body = body.value
    grow(body)
  })
  // Enter в заголовке — переход к тексту: заголовок однострочный по смыслу.
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      body.focus()
    }
  })
  requestAnimationFrame(() => {
    grow(title)
    grow(body)
  })
  pinned.addEventListener('change', () => {
    draft.pinned = pinned.checked
  })
  toAll.addEventListener('change', () => {
    draft.toAll = toAll.checked
  })

  file.addEventListener('change', async () => {
    if (!file.files?.length) return
    const room = MAX_NEWS_PHOTOS - draft.attachments.length
    if (room <= 0) {
      showToast(`Максимум ${MAX_NEWS_PHOTOS} фото`, true)
      file.value = ''
      return
    }
    try {
      const picked = [...file.files].slice(0, Math.min(room, 4))
      showToast('Загружаю фото…')
      const uploaded = await uploadHomeworkFiles(state.groupId, picked)
      draft.attachments.push(...uploaded)
      paintPreview()
    } catch (err) {
      showToast(err.message, true)
    } finally {
      file.value = ''
    }
  })

  const submit = el('button', { className: 'btn', type: 'submit', text: 'Опубликовать' })
  const cancel = el('button', {
    type: 'button',
    className: 'btn btn-ghost',
    text: 'Отмена',
    onClick: () => {
      state.newsCompose = false
      state.newsDraft = null
      if (!refreshTabPanes(['home'])) render({ force: true })
      else syncComposeToggle()
    },
  })

  const form = el('form', { className: 'news-compose-form' }, [
    el('div', { className: 'field' }, [el('label', { text: 'Заголовок' }), title]),
    el('div', { className: 'field' }, [el('label', { text: 'Текст' }), body]),
    el('div', { className: 'field' }, [
      el('label', { text: `Фото (до ${MAX_NEWS_PHOTOS})` }),
      file,
      preview,
    ]),
    el('div', { className: 'field' }, [
      el('label', { text: 'Кто увидит' }),
      facBox,
      hint,
    ]),
    el('label', { className: 'news-compose-check' }, [
      pinned,
      el('span', { text: 'Закрепить сверху' }),
    ]),
    isAdmin
      ? el('label', { className: 'news-compose-check' }, [
          toAll,
          el('span', { text: 'Для всех групп' }),
        ])
      : null,
    el('div', { className: 'news-compose-actions' }, [submit, cancel]),
  ])

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const t = title.value.trim()
    if (!t) {
      showToast('Нужен заголовок', true)
      return
    }
    submit.disabled = true
    submit.textContent = 'Публикую…'
    try {
      await addNews({
        groupId: toAll.checked && isAdmin ? null : state.groupId,
        title: t,
        body: body.value.trim(),
        attachments: draft.attachments,
        pinned: pinned.checked,
        faculties: draft.faculties,
      })
      state.newsCompose = false
      state.newsDraft = null
      state.newsIndex = 0
      showToast('Событие опубликовано')
      if (!refreshTabPanes(['home'])) render({ force: true })
      else syncComposeToggle()
    } catch (err) {
      submit.disabled = false
      submit.textContent = 'Опубликовать'
      showToast(err.message, true)
    }
  })

  card.append(
    el('div', { className: 'news-compose-head' }, [
      el('h3', { className: 'news-compose-title', text: 'Новое событие' }),
    ]),
    form,
  )
  return card
}

/** Кнопка «+» на карусели превращается в «−», когда компоузер открыт. */
function syncComposeToggle() {
  const btn = document.querySelector('.home-hero-add')
  if (!btn) return
  const open = !!state.newsCompose
  btn.textContent = open ? '−' : '+'
  btn.title = open ? 'Закрыть форму' : 'Добавить событие'
  btn.classList.toggle('is-open', open)
  btn.setAttribute('aria-expanded', open ? 'true' : 'false')
}

/** Карточка «идёт сейчас / следующая пара / на сегодня всё». */
function renderHomeNow(status, group) {
  if (!status) {
    return el('div', { className: 'card home-now' }, [
      el('p', { className: 'home-now-label muted', text: 'Сегодня' }),
      el('h3', { className: 'home-now-title', text: 'Пар нет' }),
    ])
  }
  if (status.kind === 'done') {
    return el('div', { className: 'card home-now is-done' }, [
      el('p', { className: 'home-now-label muted', text: 'Сегодня' }),
      el('h3', { className: 'home-now-title', text: 'Пары закончились' }),
      el('p', { className: 'muted', style: 'margin:4px 0 0', text: 'Хорошего вечера.' }),
    ])
  }
  const isNow = status.kind === 'now'
  const lesson = status.lesson
  const view = status.view
  const subject = view?.effectiveSubject || lesson.subject
  const room = view?.effectiveRoom || (lesson.remote ? 'дистанционно' : '')
  const meta = [
    lesson.start && lesson.end ? `${lesson.start}–${lesson.end}` : '',
    room ? `ауд. ${room}` : '',
    lesson.teacher || '',
  ].filter(Boolean).join(' · ')

  return el('div', { className: `card home-now${isNow ? ' is-live' : ''}` }, [
    el('p', {
      className: 'home-now-label',
      text: isNow ? 'Идёт сейчас' : 'Следующая пара',
    }),
    el('h3', { className: 'home-now-title', text: subject }),
    el('p', { className: 'home-now-meta muted', text: meta }),
    el('p', {
      className: 'home-now-timer',
      text: isNow
        ? `осталось ${humanMins(status.minsLeft)}`
        : `через ${humanMins(status.minsUntil)}`,
    }),
    el('button', {
      type: 'button',
      className: 'btn secondary home-now-btn',
      text: 'Открыть расписание',
      onClick: () => {
        state.day = Number(lesson.day) || state.day
        gotoTab('schedule', { animate: true })
      },
    }),
  ])
}

function renderTabBody(tabId, group, opts = {}) {
  const consumeCascade = opts.cascade === undefined
  const wantCascade = consumeCascade ? state.cascade : !!opts.cascade
  if (consumeCascade) state.cascade = false
  const cascade = wantCascade && motionOk()
  const wrap = el('div', { className: cascade ? 'tab-pane-inner do-cascade' : 'tab-pane-inner' })
  if (tabId === 'home') wrap.append(renderHome())
  else if (tabId === 'schedule') wrap.append(renderDays(), renderSchedule())
  else if (tabId === 'grades') wrap.append(renderStudyTab())
  else if (tabId === 'teachers') wrap.append(renderTeachersTab())
  // Старые id: панелей для них больше нет, но внутренние вызовы остались рабочими
  else if (tabId === 'hw') wrap.append(renderDays(), renderHwTab())
  else if (tabId === 'overrides') wrap.append(renderOverridesTab(group || getGroup(state.groupId)))
  else wrap.append(renderMore())
  if (cascade) {
    const done = () => wrap.classList.remove('do-cascade')
    wrap.addEventListener('animationend', done, { once: true })
    window.setTimeout(done, 520)
  }
  return wrap
}

/** Вкладка «Учёба»: журнал с оценками и домашка — переключатель в шапке вкладки. */
function renderStudyTab() {
  const wrap = el('div', { className: 'panel study-panel' })
  const mode = state.studyMode === 'hw' ? 'hw' : 'grades'
  const chip = (id, label) =>
    el('button', {
      type: 'button',
      className: `study-tab${mode === id ? ' is-on' : ''}`,
      text: label,
      onClick: () => {
        if (mode === id) return
        hapticTap()
        state.studyMode = id
        if (id === 'hw' && HW_TAB_BY_DAY) state.hwDaySeek = null
        if (!refreshTabPanes(['grades'])) render({ force: true })
        else softUpdateNav()
      },
    })
  // Переключатель — часть шапки вкладки, а не отдельная «карточка с отступом».
  wrap.append(
    el('div', { className: 'study-head' }, [
      el('div', { className: 'study-tabs' }, [chip('grades', 'Журнал'), chip('hw', 'Домашка')]),
    ]),
  )
  if (mode === 'hw') wrap.append(renderDays(), renderHwTab())
  else wrap.append(renderGradesTab(journalCtx()))
  return wrap
}

function softUpdateNav() {
  const nav = document.querySelector('nav.nav')
  if (!nav) return false
  const buttons = [...nav.querySelectorAll(':scope > button')]
  buttons.forEach((btn, i) => {
    const id = TAB_ORDER[i]
    if (!id) return
    btn.classList.toggle('active', state.tab === id)
  })
  softUpdateTopLead()
  return buttons.length === TAB_ORDER.length
}

/** Подпись под названием группы («Пары» / «ДЗ» / …) при смене вкладки без полного render */
function softUpdateTopLead() {
  const sub = document.querySelector('.topbar .topbar-sub')
  if (!sub) return false
  const group = state.groupId ? getGroup(state.groupId) : null
  const text = tabLeadText(state.tab, group) || '\u00a0'
  if (sub.textContent !== text) sub.textContent = text
  return true
}

/** Сохранить скролл вкладки через render/refresh (иначе прыжок вверх при раскрытии ДЗ) */
function withTabScrollPreserved(tabId, fn) {
  const pane = document.querySelector(`#tab-stage .tab-pane[data-tab="${tabId}"]`)
  const top = pane ? pane.scrollTop : 0
  const left = pane ? pane.scrollLeft : 0
  const result = fn()
  const restore = () => {
    const p = document.querySelector(`#tab-stage .tab-pane[data-tab="${tabId}"]`)
    if (!p) return
    p.scrollTop = top
    p.scrollLeft = left
  }
  restore()
  requestAnimationFrame(() => {
    restore()
    requestAnimationFrame(restore)
  })
  return result
}

/** Сброс скролла окна — иначе после ДЗ «Пары/Преп» выглядят пустыми */
function resetWindowScroll() {
  try {
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  } catch {
    /* ignore */
  }
}

function pagerWidth() {
  const stage = document.getElementById('tab-stage')
  const sw = stage?.clientWidth || 0
  if (sw > 0) return sw
  // stage ещё не в DOM / без layout — оценка по ширине #app или окна (не жёсткие 480)
  const app = document.getElementById('app')
  const aw = app?.clientWidth || 0
  if (aw > 0) return aw
  try {
    if (window.matchMedia('(min-width: 1280px)').matches) return Math.min(window.innerWidth, 1180)
    if (window.matchMedia('(min-width: 1024px)').matches) return Math.min(window.innerWidth, 1080)
    if (window.matchMedia('(min-width: 768px)').matches) return Math.min(window.innerWidth, 680)
  } catch {
    /* ignore */
  }
  return Math.min(window.innerWidth, 480) || 360
}

function pagerIndex(tabId = state.tab) {
  const i = TAB_ORDER.indexOf(tabId)
  return i < 0 ? 0 : i
}

function getPagerTrack() {
  return document.querySelector('#tab-stage > .tab-track.tab-pager')
}

function sizePagerPanes(track, w) {
  if (!track) return
  track.querySelectorAll(':scope > .tab-pane').forEach((pane) => {
    pane.style.flex = `0 0 ${w}px`
    pane.style.width = `${w}px`
    pane.style.minWidth = `${w}px`
  })
}

function pagerSetX(x, { animate = false } = {}) {
  const track = getPagerTrack()
  if (!track) return
  const soft = motionOk()
  track.style.transition = animate
    ? soft
      ? 'transform 0.34s cubic-bezier(.2,.85,.25,1)'
      : 'transform 0.3s cubic-bezier(.22,.9,.3,1)'
    : 'none'
  track.style.transform = `translate3d(${x}px,0,0)`
}

function pagerSnapToIndex(index, { animate = false } = {}) {
  const w = pagerWidth()
  const track = getPagerTrack()
  sizePagerPanes(track, w)
  const i = Math.max(0, Math.min(TAB_ORDER.length - 1, index))
  pagerSetX(-i * w, { animate })
  return i
}

function buildPersistentPager(group, { cascadeTab = null } = {}) {
  const w = pagerWidth()
  const track = el('div', { className: 'tab-track tab-pager' })
  const active = pagerIndex()
  for (let idx = 0; idx < TAB_ORDER.length; idx++) {
    const tabId = TAB_ORDER[idx]
    const pane = el('div', { className: 'tab-pane', dataset: { tab: tabId } })
    pane.style.flex = `0 0 ${w}px`
    pane.style.width = `${w}px`
    pane.style.minWidth = `${w}px`
    pane.append(
      renderTabBody(tabId, group, {
        cascade: cascadeTab === tabId,
      }),
    )
    track.append(pane)
  }
  track.style.transition = 'none'
  track.style.transform = `translate3d(${-active * w}px,0,0)`
  return track
}

/** Старые id вкладок → актуальные панели пейджера (переходники остались в коде). */
function paneTabId(tabId) {
  if (tabId === 'hw') return 'grades'
  if (tabId === 'overrides') return 'more'
  return tabId
}

/** Обновить содержимое вкладок на месте — без уничтожения pager */
function refreshTabPanes(tabIds, { force = false } = {}) {
  const group = state.groupId ? getGroup(state.groupId) : null
  const track = getPagerTrack()
  if (!track || !group) return false
  const ids = (tabIds || TAB_ORDER).map(paneTabId)
  for (const tabId of [...new Set(ids)]) {
    // Профиль перерисовываем только когда открыт подэкран замен —
    // иначе фоновое обновление ДЗ сбросит ввод в формах админки.
    if (!force && tabId === 'more' && state.moreScreen !== 'overrides') continue
    const pane = track.querySelector(`:scope > .tab-pane[data-tab="${tabId}"]`)
    if (!pane) continue
    clearCascadeAnim(pane)
    pane.replaceChildren(renderTabBody(tabId, group, { cascade: false }))
  }
  state.daySwap = null
  return true
}

function softRefreshCurrentTab() {
  if (!state.groupId) {
    render({ force: true })
    return
  }
  if (swipe.busy || swipe.dragging) {
    pendingRedraw = true
    return
  }
  if (!refreshTabPanes([state.tab])) {
    render({ force: true })
    return
  }
  softUpdateNav()
  paintFlashSlot()
  if (isHwView()) maybeSeekHwDay()
}

function redrawAfterData(tabIds = ['hw', 'schedule']) {
  if (swipe.busy || swipe.dragging || tabSwitchShieldActive()) {
    pendingRedraw = true
    return
  }
  if (!refreshTabPanes(tabIds)) {
    render({ force: true })
    return
  }
  softUpdateNav()
  paintFlashSlot()
  if (isHwView()) maybeSeekHwDay()
}

function journalCtx() {
  return {
    el,
    state,
    flash,
    render,
    getGroup,
    getLessons,
    formatDateRu,
    dateForWeekday,
    weekdayFromISO,
    /** Сменить день прямо из журнала, без прыжка на «Пары». */
    setDay: (d) => {
      const prev = Number(state.day)
      const next = Number(d)
      if (!next || next === prev) return
      if (DAY_SWAP_MOTION && motionOk()) state.daySwap = next > prev ? 'right' : 'left'
      else state.daySwap = null
      state.day = next
      refreshTabPanes(['grades', 'schedule'])
      softUpdateNav()
    },
  }
}

function switchTab(id, { animate = false, fromDrag = false } = {}) {
  if (state.journal) {
    state.journal = null
    state.tab = id
    render({ force: true })
    return
  }
  if (!id || state.tab === id) {
    // Уже в профиле, но открыт подэкран замен — вернуть корень профиля
    if (id === 'more' && state.moreScreen) {
      state.moreScreen = ''
      if (!refreshTabPanes(['more'], { force: true })) render({ force: true })
      softUpdateNav()
      return
    }
    if (fromDrag) softUpdateNav()
    return
  }
  if (!TAB_ORDER.includes(id)) {
    state.tab = id
    state.cascade = false
    render({ force: true })
    return
  }

  const track = getPagerTrack()
  if (!track) {
    state.tab = id
    state.cascade = !!(animate && !fromDrag)
    render({ force: true })
    return
  }

  if (id === 'hw' && HW_TAB_BY_DAY) state.hwDaySeek = null
  // Тап по «Профиль» всегда ведёт в корень профиля, а не в последний подэкран.
  // Панель при этом надо обновить, иначе останется отрисованный подэкран замен.
  const leavingProfileScreen = id === 'more' && state.moreScreen !== ''
  if (id === 'more') state.moreScreen = ''
  state.tab = id
  state.cascade = false
  const i = pagerIndex(id)
  if (animate && !fromDrag && motionOk()) {
    const pane = track.querySelector(`:scope > .tab-pane[data-tab="${id}"]`)
    const inner = pane?.querySelector('.tab-pane-inner')
    if (inner) {
      clearCascadeAnim(inner)
      // Перезапуск CSS-анимации (иначе повторный вход во вкладку может не сыграть)
      void inner.offsetWidth
      inner.classList.add('do-cascade')
      const done = () => inner.classList.remove('do-cascade')
      inner.addEventListener('animationend', done, { once: true })
      window.setTimeout(done, 520)
    }
  }
  // Горизонтальный слайд трека только при свайпе; по кнопке — мгновенно + cascade карточек
  pagerSnapToIndex(i, { animate: false })
  softUpdateNav()
  resetWindowScroll()
  tabSwitchShieldUntil = Date.now() + 4000
  if (leavingProfileScreen && state.tab === 'more') {
    const pane = track.querySelector(':scope > .tab-pane[data-tab="more"]')
    if (pane) {
      clearCascadeAnim(pane)
      pane.replaceChildren(renderTabBody('more', getGroup(state.groupId), { cascade: false }))
      pane.scrollTop = 0
    }
  }
}

/**
 * Перейти на вкладку и перерисовать её содержимое.
 * Панели pager живут постоянно, поэтому одного switchTab мало:
 * без перерисовки покажется устаревший вариант (например, режим «препод»
 * вместо только что выбранного режима «аудитория»).
 */
function gotoTab(tabId, { animate = true } = {}) {
  // Старые id остались в коде переходов: ДЗ теперь внутри «Учёбы», замены — в профиле
  if (tabId === 'hw') {
    state.studyMode = 'hw'
    tabId = 'grades'
  } else if (tabId === 'overrides') {
    state.moreScreen = 'overrides'
    tabId = 'more'
  }
  if (!tabId || !TAB_ORDER.includes(tabId)) return
  const force = tabId === 'more'
  if (state.tab === tabId) {
    if (!refreshTabPanes([tabId], { force })) render({ force: true })
    softUpdateNav()
    return
  }
  switchTab(tabId, { animate })
  refreshTabPanes([tabId], { force })
}

/**
 * Открыть конкретный подэкран профиля (замены, моя группа, допобразование…).
 * switchTab('more') всегда сбрасывает подэкран в корень профиля, поэтому
 * состояние выставляем после переключения и сразу перерисовываем панель.
 */
function openMoreScreen(screen, { animate = true } = {}) {
  if (!screen) return
  if (state.tab === 'more') {
    state.moreScreen = screen
    if (!refreshTabPanes(['more'], { force: true })) render({ force: true })
    softUpdateNav()
    return
  }
  switchTab('more', { animate })
  state.moreScreen = screen
  if (!refreshTabPanes(['more'], { force: true })) render({ force: true })
  softUpdateNav()
}

const swipe = {
  x0: 0,
  y0: 0,
  t0: 0,
  x: 0,
  axis: null,
  active: false,
  dragging: false,
  width: 0,
  trackDir: 0,
  baseX: 0,
  busy: false,
  fingerId: null,
}

function swipeResetFlags() {
  swipe.active = false
  swipe.dragging = false
  swipe.axis = null
  swipe.fingerId = null
  swipe.x = 0
}

function swipeCanStart(target) {
  if (swipe.busy) return false
  if (hwLightboxEl) return false
  if (!state.groupId || state.legalDoc) return false
  if (isEditingFormNow()) return false
  if (!isSiteEnabled() && getSession()?.role !== 'admin') return false
  if (!(target instanceof Element)) return true
  if (target.closest('nav.nav, input, textarea, select, button, a, label, .hw-lightbox, .home-hero, .news-reader')) return false
  return true
}

function swipeAbort() {
  if (swipe.busy) {
    swipeResetFlags()
    return
  }
  const stage = document.getElementById('tab-stage')
  const track = getPagerTrack()
  if (track) {
    track.style.transition = 'none'
    pagerSnapToIndex(pagerIndex(), { animate: false })
  }
  stage?.classList.remove('tab-swiping')
  swipe.trackDir = 0
  swipe.baseX = 0
  swipe.busy = false
  swipeResetFlags()
}

function swipeApplyOffset(dx) {
  const track = getPagerTrack()
  if (!track) return
  const w = swipe.width || pagerWidth()
  const max = 0
  const min = -((TAB_ORDER.length - 1) * w)
  let x = swipe.baseX + dx
  x = Math.min(max, Math.max(min, x))
  swipe.x = x - swipe.baseX
  track.style.transition = 'none'
  track.style.transform = `translate3d(${x}px,0,0)`
}

function swipeFinish(commitDir) {
  const track = getPagerTrack()
  const stage = document.getElementById('tab-stage')
  const w = swipe.width || pagerWidth()
  const i = pagerIndex()
  if (!track || i < 0) {
    stage?.classList.remove('tab-swiping')
    swipe.trackDir = 0
    swipe.busy = false
    return
  }

  let next = i
  if (commitDir === 1 && i < TAB_ORDER.length - 1) next = i + 1
  else if (commitDir === -1 && i > 0) next = i - 1

  swipe.busy = true
  const soft = motionOk()
  const ms = soft ? 340 : 300
  pagerSnapToIndex(next, { animate: true })

  window.setTimeout(() => {
    state.tab = TAB_ORDER[next]
    state.cascade = false
    softUpdateNav()
    resetWindowScroll()
    tabSwitchShieldUntil = Date.now() + 4000
    stage?.classList.remove('tab-swiping')
    swipe.trackDir = 0
    swipe.baseX = 0
    swipe.busy = false
  }, ms)
}

document.addEventListener(
  'touchstart',
  (e) => {
    // второй палец во время свайпа — сразу сбросить, иначе залипает посередине
    if (e.touches.length > 1) {
      if (swipe.dragging || swipe.trackDir) swipeAbort()
      else swipeResetFlags()
      return
    }
    if (e.touches.length !== 1) {
      swipeResetFlags()
      return
    }
    if (!swipeCanStart(e.target)) {
      swipeResetFlags()
      return
    }
    const t = e.touches[0]
    swipe.fingerId = t.identifier
    swipe.x0 = t.clientX
    swipe.y0 = t.clientY
    swipe.t0 = Date.now()
    swipe.x = 0
    swipe.axis = null
    swipe.active = true
    swipe.dragging = false
    swipe.width =
      document.getElementById('tab-stage')?.clientWidth ||
      Math.min(window.innerWidth, 480) ||
      360
  },
  { passive: true },
)

document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) {
      if (swipe.dragging || swipe.trackDir) {
        if (e.cancelable) e.preventDefault()
        swipeAbort()
      }
      return
    }
    if (!swipe.active || swipe.busy) return
    const t = [...e.touches].find((x) => x.identifier === swipe.fingerId) || e.touches[0]
    if (!t) return
    const dx = t.clientX - swipe.x0
    const dy = t.clientY - swipe.y0

    if (!swipe.axis) {
      if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return
      if (Math.abs(dy) >= 8 && Math.abs(dy) >= Math.abs(dx) * 0.8) {
        swipe.axis = 'v'
        swipe.active = false
        return
      }
      if (Math.abs(dx) > 22 && Math.abs(dx) > Math.abs(dy) * 1.7) {
        swipe.axis = 'h'
        swipe.dragging = true
      } else {
        return
      }
    }
    if (swipe.axis !== 'h') return

    // Pager уже со всеми вкладками — только начинаем drag
    if (!swipe.trackDir) {
      if (!getPagerTrack()) return
      const i = pagerIndex()
      const w = swipe.width || pagerWidth()
      swipe.baseX = -i * w
      swipe.trackDir = 1 // флаг «pager drag active»
      document.getElementById('tab-stage')?.classList.add('tab-swiping')
    }

    if (e.cancelable) e.preventDefault()
    swipeApplyOffset(dx)
  },
  { passive: false },
)

document.addEventListener(
  'touchend',
  (e) => {
    // остались лишние пальцы — не трогаем, abort уже был на touchstart/move
    if (e.touches.length > 0) {
      const stillMain = [...e.touches].some((x) => x.identifier === swipe.fingerId)
      if (!stillMain && (swipe.dragging || swipe.trackDir)) {
        swipeAbort()
      }
      return
    }
    if (!swipe.active && !swipe.dragging) return
    const wasDrag = swipe.dragging
    const axis = swipe.axis
    const fingerId = swipe.fingerId
    swipe.active = false
    swipe.dragging = false
    swipe.axis = null
    swipe.fingerId = null
    if (!wasDrag || axis !== 'h') return
    if (!swipe.trackDir) return

    const t =
      [...(e.changedTouches || [])].find((x) => x.identifier === fingerId) ||
      e.changedTouches?.[0]
    if (!t) {
      swipeFinish(0)
      return
    }
    const dx = t.clientX - swipe.x0
    const dt = Math.max(16, Date.now() - swipe.t0)
    const velocity = dx / dt
    const w = swipe.width || pagerWidth()
    const progress = Math.abs(dx) / w
    const flick = Math.abs(velocity) > 0.4
    const far = progress > 0.22

    let commitDir = 0
    if ((far && dx < 0) || (flick && velocity < -0.4)) commitDir = 1
    else if ((far && dx > 0) || (flick && velocity > 0.4)) commitDir = -1
    swipeFinish(commitDir)
  },
  { passive: true },
)

document.addEventListener(
  'touchcancel',
  () => {
    if (swipe.dragging || swipe.trackDir) swipeAbort()
    else swipeResetFlags()
  },
  { passive: true },
)

window.addEventListener(
  'resize',
  () => {
    if (!getPagerTrack() || swipe.dragging || swipe.busy) return
    pagerSnapToIndex(pagerIndex(), { animate: false })
  },
  { passive: true },
)


function render(opts = {}) {
  const force = !!opts.force
  const root = document.getElementById('app')
  if (!root) return

  const session = getSession()
  const adminHere = session?.role === 'admin'
  const group = state.groupId ? getGroup(state.groupId) : null

  // Щит только для фоновых sync — явный force или UI-клик всегда проходит
  if (group && !force && opts.soft && tabSwitchShieldActive()) {
    softUpdateNav()
    paintFlashSlot()
    return
  }

  root.replaceChildren()
  // Жёсткий бан устройства: даже гость не смотрит расписание (админ не режется)
  if (isLocalDeviceBanned() && !adminHere) {
    root.classList.remove('app-tabs')
    root.classList.add('app-picker')
    document.documentElement.classList.add('app-picker-mode')
    document.documentElement.classList.remove('app-tabs-mode')
    root.append(renderBannedGate())
    return
  }
  if (!isSiteEnabled() && !adminHere) {
    root.classList.remove('app-tabs')
    root.classList.add('app-picker')
    document.documentElement.classList.add('app-picker-mode')
    document.documentElement.classList.remove('app-tabs-mode')
    root.append(renderClosedGate())
    return
  }

  if (!isSiteEnabled() && adminHere) {
    root.append(
      el('div', {
        style:
          'margin:0;padding:10px 16px;background:#b42318;color:#fff;font-size:14px;font-weight:600',
        text: 'Сайт выключен для всех. Ты видишь его как админ. Включи обратно в «Ещё» → Админка.',
      }),
    )
  }

  if (!group) {
    root.classList.remove('app-tabs')
    root.classList.add('app-picker')
    document.documentElement.classList.add('app-picker-mode')
    document.documentElement.classList.remove('app-tabs-mode')
    const canBack = !!(state.prevGroupId && getGroup(state.prevGroupId))
    root.append(
      el('header', { className: 'topbar' }, [
        el('div', { className: 'topbar-left' }, [
          el('div', { className: 'brand', text: 'Колледж Чуйкова' }),
          el('h1', { text: 'Выбор группы' }),
        ]),
        canBack
          ? el('button', {
              type: 'button',
              className: 'picker-back-btn',
              text: '← Назад',
              title: 'Вернуться к текущей группе',
              onClick: () => cancelGroupPicker(),
            })
          : null,
      ]),
      renderGroupPicker(),
    )
    return
  }

  root.classList.remove('app-picker')
  root.classList.add('app-tabs')
  document.documentElement.classList.remove('app-picker-mode')
  document.documentElement.classList.add('app-tabs-mode')

  root.append(renderTop(group))
  root.append(el('div', { id: 'flash-slot' }))
  paintFlashSlot()
  if (isOfflineMode() && getConnectionError()) {
    root.append(
      el('p', {
        className: 'error',
        style: 'padding:0 16px',
        text: getConnectionError(),
      }),
    )
  } else if (supabaseConfigured && !isRemoteMode() && !getDb()?.quietSync) {
    root.append(
      el('p', {
        className: 'error',
        style: 'padding:0 16px',
        text: 'Локальный режим — ДЗ не увидят другие. Обнови страницу.',
      }),
    )
  }

  const cascadeTab = state.cascade ? state.tab : null
  state.cascade = false
  const stage = el('div', { id: 'tab-stage', className: 'tab-stage' })
  // Сначала в DOM — иначе clientWidth=0 и пейджер рисует несколько вкладок рядом на ПК
  root.append(stage)
  void stage.offsetWidth
  stage.append(buildPersistentPager(group, { cascadeTab }))
  state.daySwap = null
  swipe.trackDir = 0
  swipe.baseX = 0
  swipe.busy = false
  swipe.dragging = false
  swipe.active = false
  requestAnimationFrame(() => {
    pagerSnapToIndex(pagerIndex(), { animate: false })
  })

  root.append(renderNav())
  const journal = renderJournalOverlay(journalCtx())
  if (journal) root.append(journal)
  const formation = renderFormationMarksOverlay()
  if (formation) root.append(formation)
  maybeSeekHwDay()
}

function bootLogoUrl() {
  const base = import.meta.env.BASE_URL || '/chuikov-rasp/'
  return `${base}college-logo.jpg`
}

function paintBootSplash() {
  const root = document.getElementById('app')
  if (!root) return
  if (!BOOT_SPLASH) {
    root.replaceChildren(
      el('p', {
        className: 'muted',
        style: 'padding:48px 16px;text-align:center;margin:0',
        text: 'Загрузка…',
      }),
    )
    return
  }
  const logo = el('img', {
    className: 'boot-splash-logo',
    src: bootLogoUrl(),
    alt: '',
    width: '128',
    height: '128',
    decoding: 'async',
  })
  root.replaceChildren(
    el('div', { className: 'boot-splash is-ready', role: 'status', 'aria-live': 'polite' }, [
      el('div', { className: 'boot-splash-badge' }, [
        el('div', { className: 'boot-splash-halo', 'aria-hidden': 'true' }),
        logo,
      ]),
      el('p', { className: 'boot-splash-title', text: 'Расписание' }),
      el('p', { className: 'boot-splash-sub', text: 'Колледж им. В.И. Чуйкова' }),
    ]),
  )
}

async function revealAppAfterSplash() {
  if (!BOOT_SPLASH) {
    render()
    return
  }
  const root = document.getElementById('app')
  const splash = root?.querySelector('.boot-splash, #boot-splash')
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const wait = Math.max(0, BOOT_SPLASH_MIN_MS - (now - splashStartedAt))
  if (wait) await delay(wait)
  if (splash && motionOk()) {
    splash.classList.add('boot-splash', 'is-leaving')
    await delay(BOOT_SPLASH_EXIT_MS)
  }
  render()
}

function ensureGroupSelected() {
  // Если группа не выбрана или удалена — показываем экран выбора (не подставляем 0903-ПД3)
  if (state.groupId && !getGroup(state.groupId)) {
    state.groupId = ''
    localStorage.removeItem(SELECTED_GROUP_KEY)
  }
}

function syncDesktopLayoutClass() {
  try {
    const desk = window.matchMedia('(min-width: 1024px)').matches
    document.documentElement.classList.toggle('is-desktop', desk)
  } catch {
    /* ignore */
  }
}

async function boot() {
  // Расписание берётся из seed/кэша сразу — показываем быстро, данные ДЗ догружаем в фоне.
  bootFromCache()
  ensureGroupSelected()
  try {
    window.__RASP_BOOTED__ = true
  } catch {
    /* ignore */
  }
  syncDesktopLayoutClass()
  try {
    window.matchMedia('(min-width: 1024px)').addEventListener('change', syncDesktopLayoutClass)
  } catch {
    /* ignore */
  }

  const showSplash = BOOT_SPLASH && !isPageReload()

  // ВАЖНО: не ждём initStore() перед показом — иначе на медленном телефоне
  // заставка висит до конца сетевой загрузки (был баг ~15 сек).
  const initPromise = initStore()
    .then(() => ensureGroupSelected())
    .catch(() => {})
    .finally(() => {
      initialDataLoading = false
    })

  if (showSplash) {
    paintBootSplash()
    // Сеть в фоне — не держим синий экран до ответа Supabase (раньше до +1.6с).
    refreshSiteGate().catch(() => {})
    await revealAppAfterSplash()
  } else {
    // F5 / reload: контент сразу из кэша, без повторной заставки.
    refreshSiteGate().catch(() => {})
    render()
  }

  // Когда реальные ДЗ подтянутся — обновляем только текущую вкладку,
  // не сбрасывая кэш «Пар/Преп» (иначе свайп с ДЗ снова «грузит»).
  initPromise.then(() => {
    refreshSiteGate().catch(() => {})
    if (state.groupId) {
      refreshNews(state.groupId)
        .then(() => {
          if (state.tab !== 'home') return
          if (tabSwitchShieldActive() || swipe.busy || swipe.dragging || swipe.trackDir) {
            pendingRedraw = true
            return
          }
          if (!refreshTabPanes(['home'])) render()
        })
        .catch(() => {})
    }
    if (tabSwitchShieldActive() || swipe.busy || swipe.dragging || swipe.trackDir) {
      pendingRedraw = true
      return
    }
    redrawAfterData(['hw', 'schedule', 'overrides'])
  })

  trackVisit(state.groupId || null)

  refreshDeviceBanStatus()
    .then((banned) => {
      if (banned) render({ force: true })
    })
    .catch(() => {})

  validateRemoteSession()
    .then(() => {})
    .catch(() => {})

  // Не конкурируем с первым sync: cleanup через 12с после показа UI
  setTimeout(() => {
    maybeAutoCleanup().then((r) => {
      if (!r || r.skipped) return
      const hw = Number(r.homeworkDeleted ?? r.homeworkdeleted ?? 0)
      const ov = Number(r.overridesDeleted ?? r.overridesdeleted ?? 0)
      if (hw > 0 || ov > 0) {
        refreshMutable()
          .then(() => {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('rasp-reconnected'))
            }
          })
          .catch(() => {})
      }
    })
  }, 12000)

  // Пока сайт выключен/включают — подтягиваем статус, чтобы заглушка снималась без перезагрузки
  setInterval(() => {
    const prev = isSiteEnabled()
    refreshSiteGate()
      .then((open) => {
        if (prev !== open) render()
      })
      .catch(() => {})
  }, 15000)

  // Полоска «сейчас» + смена календарного дня (полночь) без лишнего шума
  let lastKnownToday = todayISO()
  const appTodayWeekday = () => {
    const d = new Date().getDay()
    return d === 0 || d === 6 ? 1 : d
  }
  const softRebuildTabPane = (tabId) => {
    if (!state.groupId) return
    const pane = document.querySelector(`#tab-stage .tab-pane[data-tab="${tabId}"]`)
    if (!pane) return
    const group = getGroup(state.groupId)
    if (!group) return
    const top = pane.scrollTop
    pane.replaceChildren(renderTabBody(tabId, group, { cascade: false }))
    pane.scrollTop = top
  }
  setInterval(() => {
    const today = todayISO()
    if (today !== lastKnownToday) {
      const prevToday = lastKnownToday
      lastKnownToday = today
      // Смотрели именно «сегодня» до полуночи → перейти на новый сегодня (Сб/Вс → Пн, как при старте)
      if (state.weekOffset === 0 && dateForWeekday(state.day) === prevToday) {
        state.day = appTodayWeekday()
      }
      softRebuildTabPane('schedule')
      if (isHwView()) softRebuildTabPane('grades')
      return
    }
    if (state.tab !== 'schedule' || !state.groupId) return
    if (state.weekOffset !== 0) return
    if (dateForWeekday(state.day) !== today) return
    softRebuildTabPane('schedule')
  }, 30000)
}

/** false = без жеста «потяни вниз — обновить» (бэкап: ui-backups/ui-feel-before-2026-10-02.md) */
const PULL_TO_REFRESH = true

if (PULL_TO_REFRESH && typeof window !== 'undefined' && 'ontouchstart' in window) {
  try {
    document.documentElement.classList.add('ptr-on')
  } catch {
    /* ignore */
  }

  const PTR_MAX = 90
  const PTR_TRIGGER = 64
  const ptr = { armed: false, active: false, y0: 0, x0: 0, dy: 0, refreshing: false }
  let ptrEl = null
  const PTR_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>'

  const ptrEnsureEl = () => {
    if (ptrEl && document.body.contains(ptrEl)) return ptrEl
    ptrEl = document.createElement('div')
    ptrEl.className = 'ptr-indicator'
    ptrEl.setAttribute('aria-hidden', 'true')
    ptrEl.innerHTML = PTR_ICON
    document.body.append(ptrEl)
    return ptrEl
  }

  const ptrSet = (pull) => {
    const node = ptrEnsureEl()
    node.style.transition = 'none'
    const shown = Math.min(PTR_MAX, pull)
    const y = -50 + Math.min(70, shown)
    node.style.opacity = shown > 4 ? String(Math.min(1, shown / PTR_TRIGGER)) : '0'
    node.style.transform = `translateY(${y}px) rotate(${Math.round(shown * 3)}deg)`
  }

  const ptrReset = () => {
    const node = ptrEnsureEl()
    node.classList.remove('is-refreshing')
    node.style.transition = 'opacity .2s ease, transform .25s ease'
    node.style.opacity = '0'
    node.style.transform = 'translateY(-50px)'
  }

  const ptrEligible = (target) => {
    if (ptr.refreshing) return false
    if (swipe.active || swipe.dragging || swipe.busy || swipe.trackDir) return false
    if (state.tab !== 'schedule' && !isHwView()) return false
    if (!state.groupId || state.legalDoc) return false
    if (isEditingFormNow()) return false
    if (hwLightboxEl) return false
    if (!isSiteEnabled() && getSession()?.role !== 'admin') return false
    const top = window.scrollY || document.documentElement.scrollTop || 0
    if (top > 1) return false
    if (target instanceof Element && target.closest('input, textarea, select, .hw-lightbox')) {
      return false
    }
    return true
  }

  const ptrDoRefresh = async () => {
    ptr.refreshing = true
    const node = ptrEnsureEl()
    node.classList.add('is-refreshing')
    node.style.transition = 'transform .2s ease, opacity .2s ease'
    node.style.opacity = '1'
    node.style.transform = 'translateY(16px) rotate(0deg)'
    try {
      if (supabaseConfigured) {
        await refreshMutable().catch(() => {})
        scheduleSync('ptr')
      }
      await delay(450)
    } finally {
      ptr.refreshing = false
      redrawAfterData(['hw', 'schedule', 'overrides'])
      ptrReset()
      showToast('Обновлено')
    }
  }

  document.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1 || !ptrEligible(e.target)) {
        ptr.armed = false
        return
      }
      ptr.armed = true
      ptr.active = false
      ptr.y0 = e.touches[0].clientY
      ptr.x0 = e.touches[0].clientX
      ptr.dy = 0
    },
    { passive: true },
  )

  document.addEventListener(
    'touchmove',
    (e) => {
      if (!ptr.armed || e.touches.length !== 1) return
      const t = e.touches[0]
      const dy = t.clientY - ptr.y0
      const dx = t.clientX - ptr.x0
      if (dy <= 0) {
        if (!ptr.active) ptr.armed = false
        return
      }
      if (!ptr.active && Math.abs(dx) > dy) {
        // горизонталь — это свайп вкладок, не наш жест
        ptr.armed = false
        return
      }
      const top = window.scrollY || document.documentElement.scrollTop || 0
      if (top > 1) {
        ptr.armed = false
        ptrReset()
        return
      }
      ptr.active = true
      ptr.dy = dy
      ptrSet(dy * 0.5)
      if (dy > 6 && e.cancelable) e.preventDefault()
    },
    { passive: false },
  )

  const ptrEnd = () => {
    if (!ptr.armed && !ptr.active) return
    const wasActive = ptr.active
    const pull = ptr.dy * 0.5
    ptr.armed = false
    ptr.active = false
    if (wasActive && pull >= PTR_TRIGGER && !ptr.refreshing) {
      ptrDoRefresh()
    } else if (wasActive) {
      ptrReset()
    }
  }
  document.addEventListener('touchend', ptrEnd, { passive: true })
  document.addEventListener('touchcancel', ptrEnd, { passive: true })
}

boot()

window.addEventListener('rasp-reconnected', () => {
  ensureGroupSelected()
  render()
})

function mutableSignature() {
  const d = getDb()
  if (!d) return ''
  return JSON.stringify({
    hw: (d.homework || []).map((h) => [h.id, h.text, h.dueDate, h.attachments?.length || 0]),
    ovr: (d.overrides || []).map((o) => [o.id, o.date, o.type]),
    news: (d.news || []).map((n) => [n.id, n.title]),
  })
}

function isEditingFormNow() {
  const node = document.activeElement
  if (!node || node === document.body) return false
  // только реальный ввод в формах — иначе на телефоне фокус «залипал» и UI не обновлялся
  if (node.tagName === 'TEXTAREA') return true
  if (node.tagName === 'SELECT') return true
  if (node.tagName === 'INPUT') {
    const t = (node.type || '').toLowerCase()
    return t !== 'button' && t !== 'submit' && t !== 'checkbox' && t !== 'radio' && t !== 'file'
  }
  return !!node.isContentEditable
}

function canSafeRedraw() {
  // Не блокируем целые вкладки — только пока реально печатают в поле.
  if (isEditingFormNow()) return false
  return true
}

let syncBusy = false
let syncQueued = false
let pendingRedraw = false
let lastSig = mutableSignature()
let syncTimer = null

async function syncFromCloud(reason = '') {
  if (!supabaseConfigured) return
  if (syncBusy) {
    syncQueued = true
    return
  }
  syncBusy = true
  try {
    const hadSession = !!getSession()?.token
    const alive = await validateRemoteSession()
    if (hadSession && !alive) {
      flash('Доступ отозван — сессия завершена', true)
      if (canSafeRedraw()) render()
      else pendingRedraw = true
      return
    }

    if (isOfflineMode() || !isRemoteMode()) {
      const ok = await tryReconnect()
      if (ok) {
        lastSig = mutableSignature()
        pendingRedraw = false
        if (canSafeRedraw()) render()
        else pendingRedraw = true
      }
      return
    }
    await refreshMutable()
    await refreshNews(state.groupId || null).catch(() => {})
    const next = mutableSignature()
    const changed = next !== lastSig
    if (changed) lastSig = next

    if ((changed || pendingRedraw) && canSafeRedraw()) {
      if (swipe.busy || swipe.dragging || swipe.trackDir || tabSwitchShieldActive()) {
        pendingRedraw = true
      } else {
        pendingRedraw = false
        // Мягко: не сносим кэш Преп/Замены/Ещё полным render()
        redrawAfterData(['hw', 'schedule', 'overrides'])
      }
    } else if (changed) {
      pendingRedraw = true
    }
  } catch (err) {
    console.warn('sync failed', reason, err)
    await goOfflineUi()
    if (canSafeRedraw()) render()
  } finally {
    syncBusy = false
    if (syncQueued) {
      syncQueued = false
      scheduleSync('queued')
    }
  }
}

function scheduleSync(reason = '') {
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => syncFromCloud(reason), 200)
}

function tryFlushPendingRedraw() {
  if (swipe.busy || swipe.dragging || swipe.trackDir || tabSwitchShieldActive()) return
  if (pendingRedraw && canSafeRedraw()) {
    pendingRedraw = false
    state.cascade = false
    redrawAfterData(['hw', 'schedule', 'overrides'])
  }
}

// Синхронизация без Realtime/WebSocket — через прокси WS часто рвётся и всё лагает.
// Broadcast-пинг между вкладками + короткий опрос.
if (supabaseConfigured && supabase) {
  try {
    startPeersChannel(() => scheduleSync('peer'))
  } catch {
    /* ignore */
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync('visible')
  })
  window.addEventListener('focus', () => scheduleSync('focus'))
  window.addEventListener('pageshow', () => scheduleSync('pageshow'))
  // НЕ flush на pointerdown — иначе перед свайпом полный render сносит кэш вкладок

  setInterval(() => scheduleSync('poll'), 8000)
  setInterval(() => tryFlushPendingRedraw(), 2000)
}

window.addEventListener('offline', async () => {
  await goOfflineUi()
  render()
})
window.addEventListener('online', () => scheduleSync('online'))

if ('serviceWorker' in navigator) {
  const base = import.meta.env.BASE_URL || '/chuikov-rasp/'
  let swReloadOnce = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Новый SW взял контроль — один reload, чтобы не сидеть на старом HTML без ассетов
    if (swReloadOnce) return
    try {
      if (sessionStorage.getItem('rasp_sw_reload_v91')) return
      sessionStorage.setItem('rasp_sw_reload_v91', '1')
    } catch {
      /* ignore */
    }
    swReloadOnce = true
    location.reload()
  })
  navigator.serviceWorker
    .register(`${base}sw.js?v=141`, { scope: base })
    .then((reg) => {
      reg.update().catch(() => {})
      // Сбросить флаг после успешной загрузки нового билда
      setTimeout(() => {
        try {
          sessionStorage.removeItem('rasp_sw_reload_v91')
        } catch {
          /* ignore */
        }
      }, 4000)
    })
    .catch((err) => {
      console.warn('SW register failed', err)
    })
}
