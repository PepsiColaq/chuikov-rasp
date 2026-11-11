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
} from './lib/store.js'
import { supabaseConfigured, supabase, storageUrlCandidates, fetchStorageObjectUrl } from './lib/supabase.js'
import { privacyParagraphs, termsParagraphs } from './lib/legal.js'

const SELECTED_GROUP_KEY = 'rasp_selected_group_v3'
const THEME_KEY = 'rasp_theme_v1'
const WEEK_MAX = 6
const splashStartedAt =
  typeof performance !== 'undefined' ? performance.now() : Date.now()

const state = {
  tab: 'schedule',
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
  adminCodeGroupId: '',
  overrideDraft: null,
  showInstallHelp: false,
  highlightLogin: false,
  legalDoc: null,
  teacherQuery: '',
  teacherDate: '',
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

function renderNowStrip(status) {
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
        text: `Сейчас · ${subject} · до конца ${status.minsLeft} мин`,
      }),
      bar,
    ])
  }
  if (status.kind === 'next') {
    return el('div', { className: 'now-strip now-strip-next', dataset: { nowStrip: '1' } }, [
      el('p', {
        className: 'now-strip-text',
        text: `Дальше · ${subject} · через ${status.minsUntil} мин`,
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
  localStorage.setItem(SELECTED_GROUP_KEY, id)
  state.tab = 'schedule'
  state.cascade = true
  render({ force: true })
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

function sessionPillText(session) {
  if (!session) return 'Войти'
  if (session.role === 'admin') {
    const who = (session.label || '').trim() || 'Никитос'
    return `${who} · выйти`
  }
  const who = (session.label || '').trim()
  return who ? `${who} · выйти` : 'Староста · выйти'
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
          onClick: async () => {
            await logout()
            flash('Вы вышли')
          },
        })
      : el('button', {
          className: 'session-pill',
          type: 'button',
          text: 'Войти',
          onClick: () => {
            state.tab = 'more'
            state.highlightLogin = true
            render()
          },
        }),
  ])
}

/** Подзаголовок под названием группы — один уровень на всех вкладках */
function tabLeadText(tab, group) {
  if (tab === 'schedule') return 'Пары'
  if (tab === 'overrides') return 'Замены'
  if (tab === 'more') return 'Профиль и настройки'
  if (tab === 'teachers') return 'Преподаватели'
  if (tab === 'hw') return 'Домашнее задание'
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
            state.day = d
            if (state.tab === 'hw' && HW_TAB_BY_DAY) state.hwDaySeek = { notify: true }
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

function lessonMeta(lesson, view) {
  if (view.cancelled) {
    return el('div', { className: 'lesson-meta' }, [
      el('span', { className: 'badge warn', text: 'пары не будет' }),
    ])
  }
  if (view.overrideType === 'room_only') {
    return el('div', { className: 'lesson-meta' }, [
      el('span', { className: 'strike', text: `ауд. ${view.oldRoom || '—'}` }),
      textNode(` → ауд. ${view.effectiveRoom} `),
      el('span', { className: 'badge warn', text: 'замена' }),
    ])
  }
  if (view.overrideType === 'subject' || view.overrideType === 'subject_and_room') {
    return el('div', { className: 'lesson-meta' }, [
      textNode(view.oldSubject ? `было: ${view.oldSubject}` : ''),
      view.effectiveRoom ? textNode(` · ауд. ${view.effectiveRoom} `) : textNode(' '),
      el('span', { className: 'badge warn', text: 'замена' }),
    ])
  }
  if (lesson.remote) {
    return el('div', { className: 'lesson-meta' }, [
      el('span', { className: 'badge remote', text: 'дистант / онлайн' }),
      lesson.teacher ? textNode(` · ${lesson.teacher}`) : null,
    ])
  }
  const bits = []
  if (view.effectiveRoom) bits.push(`ауд. ${view.effectiveRoom}`)
  if (lesson.teacher) bits.push(lesson.teacher)
  return el('div', {
    className: 'lesson-meta',
    text: bits.length ? bits.join(' · ') : 'кабинет не указан',
  })
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
          h.text && h.text.trim() ? el('p', { className: 'hw-inline-text', text: h.text }) : null,
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
  if (isLive) {
    kids.push(
      el('div', { className: 'lesson-top' }, [
        el('span', { className: 'lesson-live-badge', text: 'идёт' }),
        el('div', { className: 'lesson-time', text: `${lesson.start}–${lesson.end}` }),
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
        el('div', { className: 'lesson-time', text: `${lesson.start}–${lesson.end}` }),
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
  const skipHw = getHomework(groupId).find(
    (h) => isFormationSkipHw(h) && h.dueDate === dateStr,
  )
  const anchor = inPerson[0]
  return {
    show: true,
    skipped: !!skipHw,
    skipId: skipHw?.id || null,
    anchorStart: anchor.start,
    formStart: subtractMinutes(anchor.start, 15),
    anchorSubject: anchor.subject,
  }
}

function renderFormationCard(groupId, dateStr, formation) {
  if (!formation?.show || !formation.formStart) return null
  const editable = canEdit(groupId)

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
            onClick: async () => {
              try {
                if (formation.skipId) await deleteHomework(groupId, formation.skipId)
                flash('Построение снова в расписании')
              } catch (err) {
                flash(err.message, true)
              }
            },
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
      ? el('button', {
          type: 'button',
          className: 'btn secondary',
          style: 'margin-top:10px',
          text: 'Отменить построение',
          onClick: async () => {
            try {
              await addHomework(groupId, {
                subject: FORMATION_SKIP_SUBJECT,
                text: 'Построение отменено',
                dueDate: dateStr,
                lessonId: null,
                attachments: [],
              })
              flash('Построение отменено на этот день')
            } catch (err) {
              flash(err.message, true)
            }
          },
        })
      : null,
  ])
}

function renderSchedule() {
  const group = getGroup(state.groupId)
  const lessons = getLessons(group.id, state.day)
  const dateStr = dateForWeekday(state.day)
  const nowStatus = getScheduleNowStatus(group.id, dateStr, lessons)
  const liveId = nowStatus?.kind === 'now' ? nowStatus.lesson?.id : null
  const frag = el('div', { className: 'panel' }, [
    el('p', {
      className: 'muted',
      text: `${DAY_NAMES[state.day] || ''} · ${formatDateRu(dateStr)}`,
    }),
  ])

  const strip = renderNowStrip(nowStatus)
  if (strip) frag.append(strip)

  if (!lessons.length) {
    frag.append(el('div', { className: 'empty', text: 'В этот день пар нет' }))
    return frag
  }

  // Построение: за 15 мин до первой очной пары (учитывает отмены и дистант).
  // Полностью выключить: SHOW_FORMATION = false
  const SHOW_FORMATION = true
  if (SHOW_FORMATION) {
    const formation = resolveFormation(group.id, dateStr, lessons)
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
    const sk = el('div', { className: 'panel' }, [
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

  const panel = el('div', { className: 'panel' }, [
    el('p', {
      className: 'muted',
      text: `За ${weekRangeLabel().toLowerCase()}`,
    }),
  ])
  if (!list.length) {
    panel.append(
      el('div', {
        className: 'empty',
        text: 'На эту неделю ДЗ нет. Листай ← → или смотри вкладку «Пары».',
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

function maybeSeekHwDay() {
  // Прыжок к дню — только по явному нажатию на день (notify: true), не при открытии вкладки
  if (!HW_TAB_BY_DAY || state.tab !== 'hw') {
    state.hwDaySeek = null
    return
  }
  const seek = state.hwDaySeek
  state.hwDaySeek = null
  if (!seek || !seek.notify) return

  const day = state.day
  const pane = document.querySelector('#tab-stage .tab-pane[data-tab="hw"]')
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
    h.text && h.text.trim() ? el('p', { text: h.text }) : null,
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
  const legalHint = el('p', { className: 'muted more-avatar-legal' })
  legalHint.append(
    document.createTextNode(
      'Фото видят все в группе. Запрещены незаконные, экстремистские, оскорбительные и иные недопустимые материалы — см. ',
    ),
    el('button', {
      type: 'button',
      className: 'more-photo-link',
      text: 'Условия',
      onClick: () => {
        state.legalDoc = 'terms'
        render()
      },
    }),
    document.createTextNode('.'),
  )
  return el('div', { className: 'more-avatar-actions more-avatar-links' }, [
    el('div', { className: 'more-photo-links-row' }, links),
    legalHint,
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
  if (!state.teacherDate) state.teacherDate = todayISO()
  const panel = el('div', { className: 'panel' })
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

function renderAdminPanel() {
  const box = el('div', { className: 'card' })
  box.append(el('h3', { text: 'Админка' }))

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

  const statsCard = el('div', {
    className: 'muted',
    style: 'margin:0 0 12px;padding:10px;border:1px solid var(--line);border-radius:8px',
    text: 'Статистика: загружаем…',
  })
  box.append(statsCard)
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

  box.append(
    el('p', {
      className: 'muted',
      text: 'Ты выдаёшь коды старостам/командирам. На одну группу можно несколько кодов — все смогут редактировать.',
    }),
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
      className: 'card',
      style: 'margin:0 0 12px;padding:12px;border:1px solid var(--line);border-radius:8px',
    }, [
      el('h3', { style: 'margin:0 0 6px;font-size:15px', text: 'Очистка старых данных' }),
      el('p', {
        className: 'muted',
        style: 'margin:0 0 10px;font-size:13px',
        text: 'Автоматически раз в сутки удаляется то, чему больше 8 недель (ДЗ, файлы, замены). Актуальные недели (±6) не трогаются. Кнопка — принудительно сейчас.',
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
  )

  const supportCard = el('div', {
    className: 'card',
    style: 'margin:0 0 12px;padding:12px;border:1px solid var(--line);border-radius:8px',
  })
  supportCard.append(
    el('h3', { style: 'margin:0 0 6px;font-size:15px', text: 'Обращения в поддержку' }),
    el('p', {
      className: 'muted',
      style: 'margin:0 0 10px;font-size:13px',
      text: 'Сообщения из @rasphelp_bot. Ответ уйдёт студенту в Telegram. Загрузка…',
    }),
  )
  box.append(supportCard)
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
        el('h3', { style: 'margin:0 0 6px;font-size:15px', text: 'Обращения в поддержку' }),
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

  const groups = listGroups()
  if (!state.adminCodeGroupId || !groups.some((g) => g.id === state.adminCodeGroupId)) {
    state.adminCodeGroupId = groups[0]?.id || ''
  }
  const codeGroup = el(
    'select',
    {
      onChange: (e) => {
        state.adminCodeGroupId = e.target.value
      },
    },
    groups.map((g) =>
      el('option', {
        value: g.id,
        text: g.name,
      }),
    ),
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
      text: 'Выдать код. Имя — крупно в профиле; синяя подпись — вместо «Староста» (Командир и т.п.).',
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
    const g = getGroup(groupId)
    if (!g) {
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
    if (!confirm(`Выдать код группе ${g.name}?\nИмя: ${name}\nСиняя подпись: ${badge}`)) return
    try {
      await addStarostaCode(groupId, plain, name, roleTitle)
      issued.textContent = `Готово. ${name} · ${badge}. Скинь код: ${plain}`
      flash(`Код создан · ${name}`)
      codeInput.value = ''
      codeLabel.value = ''
      codeRole.value = ''
      paintCodes()
    } catch (err) {
      flash(err.message, true)
    }
  })
  box.append(issueForm)

  const codesBox = el('div', { className: 'code-list' })
  async function paintCodes() {
    codesBox.replaceChildren()
    codesBox.append(
      el('p', {
        className: 'muted',
        text: '«Имя» — крупно в профиле и в ДЗ. «Роль» — синий бейдж вместо «Староста».',
      }),
    )
    try {
      const rows = await listStarostaCodes()
      if (!rows.length) {
        codesBox.append(el('p', { className: 'muted', text: 'Пока нет выданных кодов.' }))
        return
      }
      for (const row of rows) {
        const codeText = (row.code || '').trim()
        const badge = (row.roleTitle || '').trim() || 'Староста'
        codesBox.append(
          el('div', { className: 'code-row' }, [
            el('div', { style: 'min-width:0;flex:1' }, [
              el('strong', { text: row.groupName || row.groupId }),
              el('div', {
                className: 'meta',
                text: `${row.label || 'без имени'} · ${badge}`,
              }),
              el('div', {
                className: codeText ? 'code-plain' : 'meta',
                text: codeText || 'код не сохранён (создан раньше — выдайте новый)',
              }),
            ]),
            el('div', { className: 'code-row-actions' }, [
              el('button', {
                type: 'button',
                className: 'btn secondary',
                text: 'Имя',
                onClick: async () => {
                  const next = prompt('Имя в профиле и в ДЗ', row.label || '')
                  if (next == null) return
                  const name = next.trim()
                  if (!name) {
                    flash('Укажи имя', true)
                    return
                  }
                  try {
                    const res = await renameStarostaLabel(row.id, name)
                    const n = res?.homeworkUpdated ?? res?.homeworkupdated
                    flash(
                      n != null
                        ? `«${name}» · ДЗ обновлено: ${n}`
                        : `Имя «${name}» сохранено`,
                    )
                    paintCodes()
                    render()
                  } catch (err) {
                    flash(err.message, true)
                  }
                },
              }),
              el('button', {
                type: 'button',
                className: 'btn secondary',
                text: 'Роль',
                onClick: async () => {
                  const next = prompt(
                    'Синяя подпись вместо «Староста» (командир, замком…). Пусто = Староста',
                    row.roleTitle || '',
                  )
                  if (next == null) return
                  const title = next.trim()
                  try {
                    await setStarostaRoleTitle(row.id, title)
                    flash(`Роль: ${title || 'Староста'}`)
                    paintCodes()
                    render()
                  } catch (err) {
                    flash(err.message, true)
                  }
                },
              }),
              codeText
                ? el('button', {
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
                  })
                : null,
              el('button', {
                type: 'button',
                className: 'btn secondary',
                text: 'Отозвать',
                onClick: async () => {
                  if (!confirm('Отозвать этот код? Человек больше не войдёт.')) return
                  try {
                    await revokeStarostaCode(row.id)
                    flash('Код отозван')
                    paintCodes()
                  } catch (err) {
                    flash(err.message, true)
                  }
                },
              }),
            ]),
          ]),
        )
      }
    } catch (err) {
      codesBox.append(el('p', { className: 'muted', text: err.message }))
    }
  }
  box.append(codesBox)
  paintCodes()

  const name = el('input', { maxlength: '48', placeholder: '0902-ПД1' })
  const faculty = el('input', { maxlength: '32', placeholder: 'ПД' })
  const code = el('input', { maxlength: '64', placeholder: 'Первый код старосты (от 8 символов)' })
  const createForm = el('form', { style: 'margin-top:16px' })
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
  box.append(createForm)

  const delGroup = el(
    'select',
    {},
    listGroups().map((g) => el('option', { value: g.id, text: `${g.name}${g.faculty ? ' · ' + g.faculty : ''}` })),
  )
  box.append(
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
  box.append(
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

  for (const a of getAudit(20)) {
    box.append(
      el('div', {
        className: 'audit-line',
        text: `${formatDateRu(a.at)} ${String(a.at).slice(11, 16)} · ${a.action} · ${a.groupId || '—'} · ${a.detail || ''}`,
      }),
    )
  }

  const logBox = el('div', { style: 'margin-top:16px' })
  const csvBtn = el('button', {
    type: 'button',
    className: 'btn secondary',
    text: 'Скачать CSV',
    disabled: true,
    style: 'margin-top:8px',
  })
  logBox.append(
    el('h3', { text: 'Журнал безопасности' }),
    el('p', {
      className: 'muted',
      text: 'Входы, ошибки кода, блокировки. Красным — подозрительное. Смотри с ПК под админом.',
    }),
  )
  const logList = el('div', { className: 'audit-list', text: 'Загрузка журнала…' })
  logBox.append(logList, csvBtn)
  box.append(logBox)

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

  box.append(
    el('p', {
      className: 'muted',
      style: 'margin-top:12px',
      text: 'Коды доступа выдавай лично. После создания код ещё раз показывается только в сообщении выше.',
    }),
  )
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
const HW_EMPTY_QUIET = false

/** false = плоский список ДЗ; дни на вкладке ДЗ снова «только подсветка» (бэкап: ui-backups/hw-day-jump-before-2026-10-01.md) */
const HW_TAB_BY_DAY = true

/**
 * false = без лёгких анимаций (бэкап: ui-backups/ui-motion-before-2026-10-01.md)
 * — резкое раскрытие ДЗ, фото в новой вкладке, прежняя смена вкладок
 */
const UI_MOTION = true

/** false = снова текст «Загрузка…» (бэкап: ui-backups/boot-splash-before-2026-10-02.md) */
const BOOT_SPLASH = true

/** Заставка видна минимум столько (чтобы анимация успела «прочитаться») */
const BOOT_SPLASH_MIN_MS = 1100
/** Длительность «отлёта» логотипа при выходе */
const BOOT_SPLASH_EXIT_MS = 560
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

function renderMore() {
  if (state.legalDoc) return renderLegalDoc(state.legalDoc)
  return MORE_UI_V2 ? renderMoreV2() : renderMoreClassic()
}

function renderMoreV2() {
  const group = getGroup(state.groupId)
  const session = getSession()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const panel = el('div', { className: 'panel more-v2' }, [])

  if (session) {
    const customLabel = (session.label || '').trim()
    const label =
      customLabel || (session.role === 'admin' ? 'Никитос' : 'Староста')
    const letter = label.charAt(0).toUpperCase() || '?'
    // Имя сверху (Кобзева), синий бейдж — отдельная подпись (Командир), иначе «Староста»
    const customRole = (session.roleTitle || '').trim()
    const roleText =
      session.role === 'admin'
        ? 'Админ'
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
  ]

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
      placeholder: 'Код старосты или админа',
      required: true,
      id: 'more-login-code',
    })
    form.append(
      el('h3', { text: 'Вход' }),
      el('p', {
        className: 'muted',
        text: 'Код выдаёт админ.',
      }),
      el('div', { className: 'field' }, [el('label', { text: 'Код доступа' }), code]),
      el('button', { className: 'btn', type: 'submit', text: 'Войти' }),
    )
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      try {
        const s = await loginWithCode(code.value, state.groupId || null)
        if (s.groupId) {
          state.groupId = s.groupId
          localStorage.setItem(SELECTED_GROUP_KEY, s.groupId)
        }
        state.tab = 'schedule'
        state.highlightLogin = false
        const who = (s.label || '').trim() || (s.role === 'admin' ? 'Никитос' : 'староста')
        flash(`Вы вошли как ${who}`)
      } catch (err) {
        flash(err.message, true)
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
      el('button', {
        type: 'button',
        className: 'btn secondary more-logout-btn',
        text: 'Выйти с этого устройства',
        onClick: async () => {
          await logout()
          flash('Вы вышли')
        },
      }),
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
        text: 'Вход помнится 30 дней. Полный выход — кнопка справа сверху.',
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
      placeholder: 'Код старосты или админа',
      required: true,
      id: 'more-login-code',
    })
    form.append(
      el('h3', { text: 'Вход' }),
      el('p', {
        className: 'muted',
        text: 'Код выдаёт админ.',
      }),
      el('div', { className: 'field' }, [el('label', { text: 'Код доступа' }), code]),
      el('button', { className: 'btn', type: 'submit', text: 'Войти' }),
    )
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      try {
        const s = await loginWithCode(code.value, state.groupId || null)
        if (s.groupId) {
          state.groupId = s.groupId
          localStorage.setItem(SELECTED_GROUP_KEY, s.groupId)
        }
        state.tab = 'schedule'
        state.highlightLogin = false
        const who = (s.label || '').trim() || (s.role === 'admin' ? 'Никитос' : 'староста')
        flash(`Вы вошли как ${who}`)
      } catch (err) {
        flash(err.message, true)
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
              : `Сессия: ${(session.label || '').trim() || 'староста'}`,
        }),
        el('button', {
          type: 'button',
          className: 'btn secondary',
          text: 'Выйти',
          onClick: async () => {
            await logout()
            flash('Вы вышли')
          },
        }),
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
        text: 'Вход на этом устройстве помнится до 30 дней. Полный выход — кнопка справа сверху.',
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
  schedule:
    '<svg class="nav-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M8 3.5v3M16 3.5v3M4 10h16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
  hw:
    '<svg class="nav-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8a2 2 0 0 1 2 2v14H6V6a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M9 2.5h6v3H9z" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M9 11h6M9 15h4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
  teachers:
    '<svg class="nav-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.25" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M5.5 19.5c1.4-3.2 3.5-4.8 6.5-4.8s5.1 1.6 6.5 4.8" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
  overrides:
    '<svg class="nav-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="2.6" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M3.8 18.5c1-2.4 2.5-3.6 5.2-3.6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><circle cx="15.5" cy="8.2" r="2.4" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M12.2 18.5c.9-2.2 2.3-3.3 4.8-3.3 1.2 0 2.2.3 3 .8" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
  more:
    '<svg class="nav-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6.5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="17.5" cy="12" r="1.6" fill="currentColor"/></svg>',
}

function renderNav() {
  const items = [
    { id: 'schedule', label: 'Пары' },
    { id: 'hw', label: 'ДЗ' },
    { id: 'teachers', label: 'Преп.' },
    { id: 'overrides', label: 'Замены' },
    { id: 'more', label: 'Ещё' },
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

const TAB_ORDER = ['schedule', 'hw', 'teachers', 'overrides', 'more']

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

function renderTabBody(tabId, group, opts = {}) {
  const consumeCascade = opts.cascade === undefined
  const wantCascade = consumeCascade ? state.cascade : !!opts.cascade
  if (consumeCascade) state.cascade = false
  const cascade = wantCascade && motionOk()
  const wrap = el('div', { className: cascade ? 'tab-pane-inner do-cascade' : 'tab-pane-inner' })
  if (tabId === 'schedule') wrap.append(renderDays(), renderSchedule())
  else if (tabId === 'hw') wrap.append(renderDays(), renderHwTab())
  else if (tabId === 'teachers') wrap.append(renderTeachersTab())
  else if (tabId === 'overrides') wrap.append(renderOverridesTab(group || getGroup(state.groupId)))
  else wrap.append(renderMore())
  if (cascade) {
    const done = () => wrap.classList.remove('do-cascade')
    wrap.addEventListener('animationend', done, { once: true })
    window.setTimeout(done, 520)
  }
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
  return (
    document.getElementById('tab-stage')?.clientWidth ||
    Math.min(window.innerWidth, 480) ||
    360
  )
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

/** Обновить содержимое вкладок на месте — без уничтожения pager */
function refreshTabPanes(tabIds) {
  const group = state.groupId ? getGroup(state.groupId) : null
  const track = getPagerTrack()
  if (!track || !group) return false
  const ids = tabIds || TAB_ORDER
  for (const tabId of ids) {
    const pane = track.querySelector(`:scope > .tab-pane[data-tab="${tabId}"]`)
    if (!pane) continue
    clearCascadeAnim(pane)
    pane.replaceChildren(renderTabBody(tabId, group, { cascade: false }))
  }
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
  if (state.tab === 'hw') maybeSeekHwDay()
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
  if (tabIds.includes('hw') && state.tab === 'hw') maybeSeekHwDay()
}

function switchTab(id, { animate = false, fromDrag = false } = {}) {
  if (!id || state.tab === id) {
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
  if (id === 'hw') {
    const hwPane = track.querySelector(':scope > .tab-pane[data-tab="hw"]')
    if (hwPane) hwPane.scrollTop = 0
  }
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
  if (target.closest('nav.nav, input, textarea, select, button, a, label, .hw-lightbox')) return false
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
    if (state.tab === 'hw') {
      const hwPane = getPagerTrack()?.querySelector(':scope > .tab-pane[data-tab="hw"]')
      if (hwPane) hwPane.scrollTop = 0
    }
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
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      if (Math.abs(dx) > Math.abs(dy) * 1.05) {
        swipe.axis = 'h'
        swipe.dragging = true
      } else {
        swipe.axis = 'v'
        swipe.active = false
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
  stage.append(buildPersistentPager(group, { cascadeTab }))
  root.append(stage)
  swipe.trackDir = 0
  swipe.baseX = 0
  swipe.busy = false
  swipe.dragging = false
  swipe.active = false

  root.append(renderNav())
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

async function boot() {
  // Расписание берётся из seed/кэша сразу — показываем быстро, данные ДЗ догружаем в фоне.
  bootFromCache()
  ensureGroupSelected()
  try {
    window.__RASP_BOOTED__ = true
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
    // Статус сайта подтверждаем, но с таймаутом — не зависаем на сети.
    await Promise.race([refreshSiteGate().catch(() => {}), delay(1600)])
    await revealAppAfterSplash()
  } else {
    // F5 / reload: контент сразу из кэша, без повторной заставки.
    await Promise.race([refreshSiteGate().catch(() => {}), delay(900)])
    render()
  }

  // Когда реальные ДЗ подтянутся — обновляем только текущую вкладку,
  // не сбрасывая кэш «Пар/Преп» (иначе свайп с ДЗ снова «грузит»).
  initPromise.then(() => {
    refreshSiteGate().catch(() => {})
    if (tabSwitchShieldActive() || swipe.busy || swipe.dragging || swipe.trackDir) {
      pendingRedraw = true
      return
    }
    redrawAfterData(['hw', 'schedule', 'overrides'])
  })

  trackVisit(state.groupId || null)

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
      softRebuildTabPane('hw')
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
    if (state.tab !== 'schedule' && state.tab !== 'hw') return false
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
    .register(`${base}sw.js?v=95`, { scope: base })
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
