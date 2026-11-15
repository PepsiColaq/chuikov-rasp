import './styles.css'
import './styles-v150.css'
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
  undoAudit,
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
  updateNews,
  getPrograms,
  refreshPrograms,
  saveProgram,
  deleteProgram,
  moveProgram,
  lessonsForDate,
  getSessionLessons,
  getSessionInfo,
  getAppSettings,
  setAppSettings,
  importSessionLessons,
  deleteSessionBatch,
} from './lib/store.js'
import {
  canGradeGroup,
  getFormationDay,
  setFormationCancelled,
  setFormationMark,
  formationAutofill,
  listAdmins,
  addAdmin,
  revokeAdmin,
  newStudentCode,
  listMyMarks,
  groupmates,
  setMyContacts,
  listStudents,
  setStudentCode,
  addStudent,
  setStudentRole,
  setOwnStudentCode,
  staffList,
  staffSet,
  curatorsList,
  curatorCreate,
  curatorRevoke,
} from './lib/journal.js'
import {
  renderGradesTab,
  renderJournalOverlay,
  personSurname,
  personRest,
  markStampLine,
  reportStampLine,
  renderStudentsScreen,
} from './journal-ui.js'
import {
  supabaseConfigured,
  supabase,
  storageUrlCandidates,
  fetchStorageObjectUrl,
  checkConnectivity,
} from './lib/supabase.js'
import { searchGroups } from './lib/group-match.js'
import { readXlsx } from './lib/xlsx.js'
import {
  parseScheduleBook,
  resolveShift,
  groupByDate,
} from './lib/schedule-import.js'
import { privacyParagraphs, termsParagraphs } from './lib/legal.js'
import { UI_FEEL, UI_MOTION, delay, ensureToastWrap, flash, hapticTap, motionOk, paintFlashSlot, prefersReducedMotion, showToast, textNode, setRenderFn } from './lib/ui-feedback.js'
import { ATT_LABEL, AUDIT_FILTERS, AUDIT_TITLES, BOOT_SPLASH, BOOT_SPLASH_EXIT_MS, BOOT_SPLASH_MIN_MS, DAY_SWAP_MOTION, FACULTY_LABEL, FORMATION_SKIP_SUBJECT, HW_EMPTY_QUIET, HW_TAB_BY_DAY, MAX_NEWS_PHOTOS, MORE_UI_V2, NAV_ICONS, NAV_WITH_ICONS, PROFILE_AVATARS, PROGRAM_KINDS, PULL_TO_REFRESH, READER_EASE, READER_SNAP_MS, ROLE_LABEL, ROLE_RU, STAFF_KIND_LABEL, TAB_ORDER } from './lib/constants.js'
import { SELECTED_GROUP_KEY, THEME_KEY, WEEK_MAX, applyTheme, splashStartedAt, state } from './lib/app-state.js'
import { installStepsNode, isAndroidDevice, isIosDevice, isStandaloneApp, renderInstallCard, setInstallHelpOpen, tryNativeInstall } from './lib/install.js'
import { attachmentImageCandidates, bindFileDownload, bindImgCandidates, closeHwLightbox, collectHwPhotoEntries, isImageMime, looksLikeHwImage, openHwLightbox, renderHwAttachments, safeStorageUrl } from './features/lightbox.js'
import { dueDateForNextLesson, ensureOverrideDraft, facultyOfGroup, getScheduleNowStatus, groupHasFormation, groupHomeworkByAuthor, hwAuthorKey, isFormationSkipHw, isHwView, isLessonInPerson, lessonMeta, linkifyHwText, loadFormationDay, maybeSeekHwDay, overrideIsActiveForList, paintFormationRows, paintFormationTools, renderAddHwInline, renderAuthorChip, renderDays, renderFormationCard, renderFormationMarksOverlay, renderHwCard, renderHwTab, renderHwToggleAvatar, renderInlineHwGroups, renderLessonCard, renderMonthCalendar, renderNowStrip, renderSchedule, resolveFormation } from './screens/schedule.js'
import { auditCard, auditGroupName, auditSnapshot, auditTitle, auditWhen, downloadAuditCsv, isAdminSectionOpen, parseAuditDetail, renderAdminFreeRooms, renderAdminPanel, renderAuditSection, renderFormationSettings, renderGroupPicker, renderHomeTextSettings, renderLegalDoc, renderOverrideForm, renderOverridesTab, renderScheduleImport, renderSessionSettings, saveAppSettings, toggleAdminSection, wrapAdminAcc } from './screens/admin.js'
import { attachCardSwipe, canWriteNews, createReaderShell, formatNewsDate, homeNoLessonsText, homeProgramKind, listFaculties, lockReaderScroll, mountReaderCards, openNewsReader, renderHome, renderHomeHero, renderHomeNow, renderNewsComposer, scrollReaderTo, splitNewsMedia, startHeroAutoSlide, syncComposeToggle, unlockReaderScroll } from './features/news.js'
import { wireHub } from './app/hub.js'

// Отдаём вынесенным модулям функции, которые остаются здесь.
// До этого вызова в hub лежат пустышки — модули не падают, а просто ничего не делают.
wireHub({ calendarDateForWeekday, canEdit, cancelGroupPicker, confirmAndLogout, dateForWeekday, daySwapPanelClass, formatDateRu, gotoTab, hhmmToMinutes, humanMins, initialDataLoading, nowMinutesOfDay, openGroupPicker, openImageCropEditor, openMoreScreen, openProgramReader, openProgramScreen, paintStaffCard, pickGroupWithFeel, programGroupId, redrawAfterData, refreshTabPanes, render, renderBannedGate, renderClosedGate, renderMore, renderMoreClassic, renderMoreContacts, renderMoreGroup, renderMoreMyCode, renderMoreOverrides, renderMoreStudents, renderMoreSupport, renderMoreV2, renderNav, renderProfileAvatarControls, renderProgramEditor, renderPrograms, renderRoomSearch, renderStudyTab, renderTabBody, renderTeacherSearch, renderTeachersTab, renderTop, resetWindowScroll, roomLink, selectGroup, shortSubjectLabel, softRefreshCurrentTab, softUpdateNav, softUpdateTopLead, subtractMinutes, switchTab, todayISO, weekRangeLabel, weekdayFromISO, weekdayNumFromIso, withTabScrollPreserved })


// Внедряем функции из main.js в вынесенный модуль
setRenderFn(render)

applyTheme(localStorage.getItem(THEME_KEY) || 'light')

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

function weekdayNumFromIso(iso) {
  const s = String(iso || '').slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return 0
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0)
  const js = d.getDay()
  return js === 0 ? 7 : js
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

/**
 * Редактор: подвинуть/приблизить фото под рамку.
 * shape: 'circle' — аватар, 'square' — обложка программы. Возвращает File или null (отмена).
 */
function openImageCropEditor(
  file,
  {
    shape = 'circle',
    size = 512,
    name = 'avatar.jpg',
    heading = 'Подгони фото',
    hint = 'Перетащи пальцем/мышью и подвигай масштаб — в кружке то, что увидят все.',
  } = {},
) {
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
    const OUT = Math.max(200, Math.min(1600, Number(size) || 512))
    const round = shape !== 'square'
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

    // Рамка предпросмотра: круг для аватара, скруглённый квадрат для обложки.
    const framePath = (c) => {
      c.beginPath()
      if (round) {
        c.arc(VIEW / 2, VIEW / 2, VIEW / 2 - 1, 0, Math.PI * 2)
      } else if (typeof c.roundRect === 'function') {
        c.roundRect(1, 1, VIEW - 2, VIEW - 2, 18)
      } else {
        c.rect(1, 1, VIEW - 2, VIEW - 2)
      }
      c.closePath()
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
      framePath(ctx)
      ctx.clip()
      ctx.fillStyle = '#111'
      ctx.fillRect(0, 0, VIEW, VIEW)
      ctx.drawImage(img, dx, dy, dw, dh)
      ctx.restore()
      framePath(ctx)
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
          if (round) {
            octx.beginPath()
            octx.arc(OUT / 2, OUT / 2, OUT / 2 - 1, 0, Math.PI * 2)
            octx.closePath()
            octx.clip()
          }
          octx.fillStyle = '#111'
          octx.fillRect(0, 0, OUT, OUT)
          octx.drawImage(img, dx, dy, dw, dh)
          const blob = await new Promise((res) => out.toBlob(res, 'image/jpeg', 0.9))
          if (!blob) throw new Error('Не удалось обрезать')
          finish(new File([blob], name, { type: 'image/jpeg' }))
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
      'aria-label': heading,
    })
    if (!round) canvas.classList.add('is-square')

    overlay.append(
      el('div', { className: 'avatar-crop-sheet' }, [
        el('h3', { text: heading }),
        el('p', { className: 'muted', text: hint }),
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
      const cropped = await openImageCropEditor(f, {
        shape: 'circle',
        size: 512,
        name: 'avatar.jpg',
        heading: 'Подгони фото',
        hint: 'Перетащи пальцем/мышью и подвигай масштаб — в кружке то, что увидят все.',
      })
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

/* ── Настройки сайта в админке ─────────────────────────────────────── */

/* ── Импорт расписания из Excel ─────────────────────────────────────── */

/* ── Журнал безопасности ───────────────────────────────────────────────
   Раньше здесь была одна склеенная строка из технических полей:
   «14.11.2026 00:03 · journal_mark · admin · g_0903_пд3 · ip … · Иванов».
   Из неё нельзя было понять ни что случилось, ни кто это сделал.
   Теперь — карточка на событие с человеческим описанием. */

/* ── Разбор событий журнала ─────────────────────────────────────────
   Задача: админ не должен видеть технические идентификаторы. Вместо
   «hw_5ed4588c1cb2fc31» — что это за задание, вместо «jg_7247…» — кому
   и какая оценка. Всё, что не удалось разобрать по известному формату,
   показывается человеческой фразой, а не сырой строкой из базы. */

function roleRu(role) {
  return ROLE_RU[String(role || '').toLowerCase()] || String(role || '')
}

/** Дата «2026-11-09» → «09.11.2026» с защитой от мусора. */
function auditDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!m) return String(iso || '')
  return m[3] + '.' + m[2] + '.' + m[1]
}

/** Убираем из строки внутренние id, если они всё же просочились. */
function stripIds(text) {
  return String(text || '')
    .replace(/\b(hw|news|jg|jm|fm|ovr|adm|gc|st)_[A-Za-z0-9А-Яа-я_]{4,}\b/g, '')
    .replace(/\bsessions_purged\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s·,\-–—]+|[\s·,\-–—]+$/g, '')
    .trim()
}

/** Класс панели при смене дня (направление + уважение reduce-motion) */
function daySwapPanelClass(base = 'panel', { allow = true } = {}) {
  if (!allow || !DAY_SWAP_MOTION || !motionOk() || !state.daySwap) return base
  return `${base} day-swap day-swap-${state.daySwap}`
}

/** true, пока с Supabase не подтянулись реальные ДЗ (для скелетонов) */
let initialDataLoading = true

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

function moreSettingsRow({ icon, title, sub, onClick, leading, className = '', expanded = null }) {
  return el(
    'button',
    {
      type: 'button',
      className: `more-row${className ? ` ${className}` : ''}${expanded ? ' is-open' : ''}`,
      'aria-expanded': expanded == null ? null : expanded ? 'true' : 'false',
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
  if (state.moreScreen === 'support') return renderMoreSupport()
  if (state.moreScreen === 'students') return renderMoreStudents()
  // Доп. образование и кружки живут только на главной — см. renderHome().
  return MORE_UI_V2 ? renderMoreV2() : renderMoreClassic()
}

/** Открыть доп. образование / кружки на главной (а не в профиле). */
function openProgramScreen(kind) {
  state.moreScreen = kind === 'club' ? 'clubs' : 'dpo'
  gotoTab('home', { animate: true })
}

/**
 * «Коды студентов» в профиле.
 *
 * Раньше коды можно было выдать только из журнала конкретной пары — чтобы
 * добавить новому студенту код, нужно было сначала найти пару. Теперь это
 * отдельный экран: админ выбирает любую группу, староста/куратор — свою.
 */
function renderMoreStudents() {
  const session = getSession()
  const panel = el('div', { className: 'panel' })
  if (!session) {
    panel.append(
      el('div', { className: 'card' }, [
        el('p', { className: 'muted', text: 'Сначала войди.' }),
        el('button', {
          type: 'button',
          className: 'btn secondary',
          text: '← Профиль',
          onClick: () => {
            state.moreScreen = ''
            render({ force: true })
          },
        }),
      ]),
    )
    return panel
  }

  const canWrite = canEdit(state.groupId) || session.role === 'admin' || session.role === 'curator'
  if (!canWrite) {
    panel.append(
      el('div', { className: 'card' }, [
        el('p', { className: 'muted', text: 'Коды выдаёт староста, куратор или админ.' }),
        el('button', {
          type: 'button',
          className: 'btn secondary',
          text: '← Профиль',
          onClick: () => {
            state.moreScreen = ''
            render({ force: true })
          },
        }),
      ]),
    )
    return panel
  }

  // Админ и «все группы» — любой список; староста — только своя группа.
  const allGroups = listGroups()
  const groups =
    session.role === 'admin' || session.curatorAll || session.allGroups
      ? allGroups
      : allGroups.filter((g) => g.id === session.groupId)

  const defaultGroupId = session.groupId || (groups[0] && groups[0].id) || state.groupId

  panel.append(
    el('div', { className: 'card' }, [
      renderStudentsScreen({
        groupId: defaultGroupId,
        groups: groups.length ? groups : allGroups,
        flash: (text, isError) => flash(text, isError),
        onBack: () => {
          state.moreScreen = ''
          render({ force: true })
        },
        onPickGroup: (id) => {
          if (id) state.groupId = id
        },
      }),
    ]),
  )
  return panel
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
 * Телефон в виде «+7 900 000 00 00».
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
      placeholder: '+7 900 000 00 00',
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

    /** Смена роли в students: староста/препод → обычный студент и обратно. */
    const changeRole = async (studentId, role) => {
      try {
        await setStudentRole(studentId, role)
        const next = await staffList(groupId)
        build(next)
        showToast(role === 'student' ? 'Теперь обычный студент' : 'Роль обновлена')
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
      // Роль «староста» хранится в students.role, а не в group_staff,
      // поэтому её не было видно в списке ниже — и снять было нечем.
      if ((st.role === 'starosta' || st.role === 'teacher') && canSetDeputy) {
        btns.push(
          el('button', {
            type: 'button',
            className: 'staff-revoke',
            text: st.role === 'teacher' ? 'снять препода' : 'снять старосту',
            onClick: () => changeRole(id, 'student'),
          }),
        )
      }
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
    // Имя сверху (Сидорова), синий бейдж — отдельная подпись (Командир), иначе «Староста»
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
    session && (session.role === 'admin' || session.role === 'curator' || session.allGroups || canEdit(state.groupId))
      ? moreSettingsRow({
          icon: 'key',
          title: 'Коды студентов',
          sub: 'Выдать код, роли, добавить студента',
          onClick: () => {
            state.moreScreen = 'students'
            render({ force: true })
          },
        })
      : null,
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
        className: 'more-row-install',
        expanded: !!state.showInstallHelp,
        onClick: async () => {
          if (await tryNativeInstall()) return
          setInstallHelpOpen(!state.showInstallHelp)
        },
      }),
    )
  }

  const settingsCard = el('div', { className: 'card more-settings' }, settingsKids)
  if (!isStandaloneApp()) {
    const open = !!state.showInstallHelp || isIosDevice()
    settingsCard.append(
      el('div', { className: `more-fold${open ? ' is-open' : ''}` }, [
        el('div', { className: 'more-fold-clip' }, [
          el('div', { className: 'more-fold-body' }, [renderInstallCard()]),
        ]),
      ]),
    )
  }
  panel.append(settingsCard)

  if (isStandaloneApp()) {
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

function renderPrograms(kind, { standalone = false } = {}) {
  const cfg = PROGRAM_KINDS[kind] || PROGRAM_KINDS.dpo
  const groupId = state.groupId || null
  const canManage = canManagePrograms()

  const panel = el('div', { className: 'panel program-panel' }, [
    standalone
      ? el('button', {
          type: 'button',
          className: 'btn secondary',
          text: '← Главная',
          onClick: () => {
            state.moreScreen = ''
            state.programDraft = null
            if (!refreshTabPanes(['home'], { force: true })) render({ force: true })
          },
        })
      : null,
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
              if (!refreshTabPanes(['home'], { force: true })) render({ force: true })
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

/** Полноэкранный просмотр программы: лента карточек, как у событий. */
function openProgramReader(items, startIndex = 0, kind = 'dpo') {
  if (!items?.length) return
  let list = items
  let index = Math.max(0, Math.min(startIndex, items.length - 1))
  closeHwLightbox({ animate: false })
  document.querySelectorAll('.news-reader').forEach((n) => n.remove())

  const { overlay, viewport, track } = createReaderShell(PROGRAM_KINDS[kind]?.title || 'Программа')
  overlay.classList.add('program-reader')
  let closing = false

  const close = () => {
    if (closing) return
    closing = true
    overlay.classList.remove('is-open')
    overlay.classList.add('is-closing')
    unlockReaderScroll()
    window.setTimeout(() => overlay.remove(), 260)
  }

  /** Одна карточка программы: обложка, факты, видео, описание, характеристики. */
  const buildCard = (item, i) => {
    const images = programImages(item)
    const cover = images[0]
    const canEditProgram = canManagePrograms()
    const video = programVideoSrc(item.videoUrl)
    // Плашка — раздел («Доп. образование»), подпись — отдельной строкой ниже.
    // Раньше в плашке и в подписи был один и тот же текст.
    const place = PROGRAM_KINDS[kind]?.title || ''

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
        item.subtitle ? el('p', { className: 'program-reader-sub', text: item.subtitle }) : null,
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
      ? el('div', { className: 'program-details' }, [
          el('h2', { className: 'program-section-title', text: 'Что важно знать' }),
          el(
            'dl',
            { className: 'program-details-list' },
            (item.details || []).flatMap((d) => [
              el('dt', { text: d.label || '' }),
              el('dd', { text: d.value || '' }),
            ]),
          ),
        ])
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
            extra.map((a, k) =>
              el('img', {
                className: 'news-reader-extra-photo',
                src: a.url,
                alt: '',
                loading: 'lazy',
                decoding: 'async',
                referrerpolicy: 'no-referrer',
                onClick: () => {
                  hapticTap()
                  openHwLightbox(images.map((x) => x.url), k + 1)
                },
              }),
            ),
          )
        : null,
      contact,
      list.length > 1
        ? el('div', { className: 'news-reader-foot' }, [
            el('span', { className: 'news-reader-foot-count', text: `${i + 1} из ${list.length}` }),
          ])
        : null,
    ])

    const toolbar = canEditProgram
      ? el('div', { className: 'news-reader-toolbar' }, [
          el('button', {
            type: 'button',
            className: 'news-reader-tool is-up',
            text: 'Выше',
            title: 'Показывать раньше',
            onClick: () => move(i, -1),
          }),
          el('button', {
            type: 'button',
            className: 'news-reader-tool is-down',
            text: 'Ниже',
            title: 'Показывать позже',
            onClick: () => move(i, 1),
          }),
          el('button', {
            type: 'button',
            className: 'news-reader-tool',
            text: 'Изменить',
            onClick: () => edit(i),
          }),
          el('button', {
            type: 'button',
            className: 'news-reader-tool is-del',
            text: 'Удалить',
            onClick: () => removeItem(i),
          }),
        ])
      : null

    const pager =
      list.length > 1
        ? el('nav', { className: 'news-reader-pager' }, [
            el('button', {
              type: 'button',
              className: 'news-reader-pager-btn',
              text: '‹',
              'aria-label': 'Предыдущая программа',
              disabled: i === 0,
              onClick: () => step(-1),
            }),
            el(
              'div',
              { className: 'news-reader-pager-dots' },
              list.map((n, k) =>
                el('button', {
                  type: 'button',
                  className: k === index ? 'news-reader-pager-dot is-on' : 'news-reader-pager-dot',
                  'aria-label': `Программа ${k + 1}`,
                  onClick: () => goTo(k),
                }),
              ),
            ),
            el('button', {
              type: 'button',
              className: 'news-reader-pager-btn',
              text: '›',
              'aria-label': 'Следующая программа',
              disabled: i >= list.length - 1,
              onClick: () => step(1),
            }),
          ])
        : null

    return el('article', { className: 'news-reader-card' }, [hero, body, toolbar, pager])
  }

  const repaint = () => {
    const cards = list.map((n, i) => buildCard(n, i))
    mountReaderCards(track, cards, index)
    paintDots()
  }

  const paintDots = () => {
    const dots = track.children[index]?.querySelectorAll('.news-reader-pager-dot')
    if (dots?.length) [...dots].forEach((d, k) => d.classList.toggle('is-on', k === index))
  }

  const goTo = (i) => {
    const next = Math.max(0, Math.min(list.length - 1, i))
    if (next === index) return
    index = next
    scrollReaderTo(track, next)
    paintDots()
    hapticTap()
  }

  const step = (delta) => goTo(index + delta)

  const move = async (i, dir) => {
    const item = list[i]
    if (!item) return
    hapticTap()
    try {
      await moveProgram(item.id, dir, kind, state.groupId)
      const fresh = getPrograms(kind, state.groupId)
      const at = fresh.findIndex((p) => p.id === item.id)
      list = fresh
      index = at < 0 ? 0 : at
      showToast(dir < 0 ? 'Подняли выше' : 'Опустили ниже')
      repaint()
      if (!refreshTabPanes(['home'], { force: true })) render({ force: true })
    } catch (err) {
      showToast(err.message, true)
    }
  }

  const edit = (i) => {
    const item = list[i]
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
    if (!refreshTabPanes(['home'], { force: true })) render({ force: true })
  }

  const removeItem = async (i) => {
    const item = list[i]
    if (!item) return
    if (!confirm(`Удалить «${item.title}»?`)) return
    try {
      await deleteProgram(item.id)
      showToast('Удалено')
      close()
      if (!refreshTabPanes(['home'], { force: true })) render({ force: true })
    } catch (err) {
      showToast(err.message, true)
    }
  }

  repaint()

  overlay.append(
    el('button', {
      type: 'button',
      className: 'news-reader-close',
      text: '✕',
      'aria-label': 'Закрыть',
      onClick: close,
    }),
    viewport,
  )
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close()
  })

  attachCardSwipe({
    viewport,
    track,
    count: () => list.length,
    index: () => index,
    goTo,
    onClose: close,
  })

  const onKey = (e) => {
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowLeft') step(-1)
    else if (e.key === 'ArrowRight') step(1)
  }
  document.addEventListener('keydown', onKey)
  overlay.addEventListener('remove', () => document.removeEventListener('keydown', onKey))

  const onResize = () => {
    if (document.body.contains(overlay)) scrollReaderTo(track, index, false)
  }
  window.addEventListener('resize', onResize, { passive: true })
  overlay.addEventListener('remove', () => window.removeEventListener('resize', onResize))

  document.body.append(overlay)
  lockReaderScroll()
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

  // —— Фото и видео
  const file = el('input', {
    type: 'file',
    accept: 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime',
    multiple: true,
  })
  // Обложка: отдельный выбор с кадрированием в квадрат — как фото профиля.
  const coverFile = el('input', {
    type: 'file',
    accept: 'image/jpeg,image/png,image/webp',
    style: 'display:none',
  })
  const coverBtn = el('button', {
    type: 'button',
    className: 'program-cover-btn',
    text: draft.attachments.length ? 'Сменить обложку' : 'Добавить обложку',
    onClick: () => coverFile.click(),
  })
  const preview = el('div', { className: 'news-compose-preview' })
  const paintPreview = () => {
    preview.replaceChildren()
    coverBtn.textContent = draft.attachments.length ? 'Сменить обложку' : 'Добавить обложку'
    const hasVideo = draft.attachments.some((a) => splitNewsMedia([a]).videos.length)
    if (!draft.attachments.length) {
      preview.append(el('p', { className: 'muted', text: 'Фото и видео не выбраны' }))
      return
    }
    draft.attachments.forEach((a, i) => {
      const isVideo = splitNewsMedia([a]).videos.length > 0
      const photoIndex = isVideo ? -1 : splitNewsMedia(draft.attachments.slice(0, i + 1)).photos.length - 1
      preview.append(
        el('div', { className: `news-compose-thumb${isVideo ? ' is-video' : ''}` }, [
          isVideo
            ? el('video', {
                className: 'news-compose-thumb-video',
                src: a.url,
                muted: true,
                playsinline: true,
                preload: 'metadata',
              })
            : el('img', { src: a.url, alt: a.name || '', loading: 'lazy', decoding: 'async' }),
          !isVideo && photoIndex === 0
            ? el('span', { className: 'news-compose-thumb-badge', text: 'Обложка' })
            : !isVideo
              ? el('button', {
                  type: 'button',
                  className: 'news-compose-thumb-cover',
                  text: 'Обложка',
                  title: 'Сделать обложкой',
                  onClick: () => {
                    const [picked] = draft.attachments.splice(i, 1)
                    draft.attachments.unshift(picked)
                    paintPreview()
                  },
                })
              : null,
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
    if (hasVideo) {
      preview.append(
        el('p', {
          className: 'muted',
          style: 'font-size:11.5px;flex-basis:100%',
          text: 'Видео появится в просмотре под описанием.',
        }),
      )
    }
  }
  paintPreview()

  coverFile.addEventListener('change', async () => {
    const picked = coverFile.files?.[0]
    coverFile.value = ''
    if (!picked) return
    coverBtn.disabled = true
    coverBtn.textContent = 'Загружаю…'
    try {
      const cropped = await openImageCropEditor(picked, {
        shape: 'square',
        size: 900,
        name: 'cover.jpg',
        heading: 'Обложка программы',
        hint: 'Двигай и приближай фото — в квадрате то, что увидят в списке.',
      })
      if (!cropped) return
      const [uploaded] = await uploadHomeworkFiles(state.groupId, [cropped])
      if (!uploaded) throw new Error('Не удалось загрузить фото')
      // Обложка — всегда первое фото. На лимите заменяем её, а не добавляем 11-ю.
      const rest = draft.attachments.slice(draft.attachments.length >= MAX_NEWS_PHOTOS ? 1 : 0)
      draft.attachments = [uploaded, ...rest.filter((a) => a.url !== uploaded.url)]
      paintPreview()
    } catch (err) {
      showToast(err.message, true)
    } finally {
      coverBtn.disabled = false
      paintPreview()
    }
  })

  file.addEventListener('change', async () => {
    if (!file.files?.length) return
    const room = MAX_NEWS_PHOTOS - draft.attachments.length
    if (room <= 0) {
      showToast(`Максимум ${MAX_NEWS_PHOTOS} файлов`, true)
      file.value = ''
      return
    }
    try {
      const picked = [...file.files].slice(0, Math.min(room, 4))
      const hasVideo = picked.some((f) => /^video\//i.test(f.type || ''))
      showToast(hasVideo ? 'Загружаю видео… это может занять время' : 'Загружаю фото…')
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
      if (!refreshTabPanes(['home'], { force: true })) render({ force: true })
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
      el('label', { text: 'Фото' }),
      el('p', {
        className: 'muted program-cover-hint',
        text: 'Первое фото — обложка карточки. Его обрежем ровно под квадрат.',
      }),
      coverFile,
      coverBtn,
      preview,
    ]),
    el('div', { className: 'field' }, [
      el('label', { text: `Добавить ещё фото или видео (до ${MAX_NEWS_PHOTOS})` }),
      file,
    ]),
    el('div', { className: 'field' }, [
      el('label', { text: 'Видео по ссылке (необязательно)' }),
      videoUrl,
    ]),
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
      if (!refreshTabPanes(['home'], { force: true })) render({ force: true })
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

  // —— Проверка связи: сразу видно, что мешает — VPN, DPI или сам сайт
  const netCard = el('div', { className: 'card support-net' })
  const netBody = el('div', { className: 'support-net-body' })
  const rerun = el('button', {
    type: 'button',
    className: 'btn secondary',
    text: 'Проверить связь',
    onClick: () => {
      void runCheck(true)
    },
  })
  netCard.append(
    el('h3', { text: 'Связь с сервером' }),
    el('p', {
      className: 'muted',
      style: 'margin:0 0 10px',
      text: 'Показываем, какие адреса отвечают и за сколько. Если всё «нет» — мешает VPN или блокировка, а не сайт.',
    }),
    netBody,
    el('div', { style: 'margin-top:10px' }, [rerun]),
  )
  panel.append(netCard)

  const runCheck = async (manual = false) => {
    netBody.replaceChildren(el('p', { className: 'muted', style: 'margin:0', text: 'Проверяем…' }))
    if (manual) rerun.disabled = true
    try {
      const rows = await checkConnectivity()
      netBody.replaceChildren(
        ...rows.map((r) =>
          el('div', { className: 'support-net-row' }, [
            el('span', {
              className: `support-net-dot${r.ok ? ' is-ok' : ' is-bad'}`,
              'aria-hidden': 'true',
            }),
            el('span', { className: 'support-net-name', text: r.name }),
            el('span', {
              className: 'support-net-ms',
              text: r.ok ? `${r.ms} мс` : 'нет ответа',
            }),
          ]),
        ),
      )
      const anyOk = rows.some((r) => r.ok)
      netBody.append(
        el('p', {
          className: `support-net-hint${anyOk ? '' : ' is-bad'}`,
          text: anyOk
            ? 'Сайт работает. Если данные всё равно не грузятся — обнови страницу.'
            : 'Ни один адрес не ответил. Похоже, блокирует VPN или провайдер — попробуй выключить VPN или включить его.',
        }),
      )
    } catch (err) {
      netBody.replaceChildren(
        el('p', { className: 'muted', style: 'margin:0', text: err.message || 'Проверка не удалась' }),
      )
    } finally {
      rerun.disabled = false
    }
  }
  void runCheck()

  return panel
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
    /** Пары группы на дату: в сессию это экзамены, иначе недельный шаблон. */
    lessonsOn: (groupId, dateStr) => lessonsForDate(groupId, dateStr),
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
    // Уже на главной, но открыт раздел допобразования — вернуть ленту
    if (id === 'home' && homeProgramKind()) {
      state.moreScreen = ''
      state.programDraft = null
      if (!refreshTabPanes(['home'], { force: true })) render({ force: true })
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
  // Ушли с главной — раздел допобразования закрываем, иначе вернёмся в список, а не в ленту.
  else if (id !== 'home' && homeProgramKind()) state.moreScreen = ''
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

  // Страховка: если читалка исчезла из DOM мимо close() (жёсткая перерисовка),
  // блокировка прокрутки иначе останется навсегда и главная не доскроллится.
  if (!document.querySelector('.news-reader')) unlockReaderScroll()
  // Та же история с инлайновой блокировкой от модалок (кадрирование фото).
  if (
    document.body.style.overflow === 'hidden' &&
    !document.querySelector('.news-reader, .avatar-crop-overlay, .hw-lightbox')
  ) {
    document.body.style.overflow = ''
  }

  const session = getSession()
  const adminHere = session?.role === 'admin'
  const group = state.groupId ? getGroup(state.groupId) : null

  // Щит только для фоновых sync — явный force или UI-клик всегда проходит
  if (group && !force && opts.soft && tabSwitchShieldActive()) {
    softUpdateNav()
    paintFlashSlot()
    return
  }

  // Пересборка DOM обнуляет прокрутку панели, поэтому кнопки, которые
  // раньше дёргали render(), швыряли страницу наверх. Запоминаем позицию
  // и возвращаем после — одинаково для всех таких кнопок.
  const keepScroll = opts.keepScroll !== false && group ? readPaneScroll(state.tab) : null

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
  if (keepScroll && keepScroll.top > 0) restorePaneScroll(state.tab, keepScroll)
}

/** Позиция прокрутки панели вкладки: `{ top, left }` или null. */
function readPaneScroll(tabId = state.tab) {
  const pane = document.querySelector(`#tab-stage .tab-pane[data-tab="${paneTabId(tabId)}"]`)
  if (!pane) return null
  return { top: pane.scrollTop || 0, left: pane.scrollLeft || 0 }
}

/**
 * Вернуть прокрутку после пересборки DOM.
 * Повторяем в двух кадрах: высота панели может измениться уже после вставки
 * (подгрузка шрифтов, картинок), и тогда браузер обнулит scrollTop.
 */
function restorePaneScroll(tabId = state.tab, pos) {
  if (!pos) return
  const apply = () => {
    const pane = document.querySelector(`#tab-stage .tab-pane[data-tab="${paneTabId(tabId)}"]`)
    if (!pane) return
    pane.scrollTop = pos.top
    if (pos.left) pane.scrollLeft = pos.left
  }
  apply()
  requestAnimationFrame(() => {
    apply()
    requestAnimationFrame(apply)
  })
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
// Broadcast-пинг между вкладками + адаптивный опрос.
//
// Почему не фиксированные 8 секунд:
// расписание меняется раз в день, ДЗ — несколько раз в день. Опрос каждые
// 8 секунд тратил трафик впустую (5,8 КБ × 450 раз в час) и съедал лимит
// бесплатной базы. Теперь частота зависит от того, смотрит ли человек на сайт.
const POLL_ACTIVE_MS = 10_000 // вкладка открыта: изменения видны почти сразу
const POLL_BACKGROUND_MS = 60_000 // вкладка свёрнута: хватает раза в минуту

let pollTimer = null
let pollInterval = 0

function isPageVisible() {
  return typeof document !== 'undefined' && document.visibilityState === 'visible'
}

function schedulePoll() {
  const want = isPageVisible() ? POLL_ACTIVE_MS : POLL_BACKGROUND_MS
  if (pollTimer && want === pollInterval) return
  if (pollTimer) clearInterval(pollTimer)
  pollInterval = want
  pollTimer = setInterval(() => {
    // В фоне — раз в минуту: этого хватает, чтобы при возврате данные были
    // свежими, но не тратит трафик и батарею как прежние 8 секунд.
    scheduleSync('poll')
  }, want)
}

if (supabaseConfigured && supabase) {
  try {
    startPeersChannel(() => scheduleSync('peer'))
  } catch {
    /* ignore */
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Вернулись на вкладку — переключаем частоту и сразу подтягиваем свежее.
      schedulePoll()
      scheduleSync('visible')
    } else {
      schedulePoll()
    }
  })
  window.addEventListener('focus', () => scheduleSync('focus'))
  window.addEventListener('pageshow', () => scheduleSync('pageshow'))
  // НЕ flush на pointerdown — иначе перед свайпом полный render сносит кэш вкладок

  schedulePoll()
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
    .register(`${base}sw.js?v=157`, { scope: base })
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
