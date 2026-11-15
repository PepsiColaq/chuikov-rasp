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
import { canManagePrograms, emptyProgramDraft, openProgramReader, programGroupId, programImages, programMetaLine, programVideoSrc, renderProgramEditor, renderPrograms } from './features/programs.js'
import { clearCascadeAnim, loadImageFromFile, moreSettingsRow, moreSvg, moreThemeIcon, openImageCropEditor, openProgramScreen, paintStaffCard, renderBannedGate, renderCabinetCard, renderClosedGate, renderMore, renderMoreClassic, renderMoreContacts, renderMoreGroup, renderMoreMyCode, renderMoreOverrides, renderMoreStudents, renderMoreSupport, renderMoreV2, renderNav, renderProfileAvatarControls, tabSwitchShieldActive } from './screens/more.js'
import { wireHub } from './app/hub.js'

// Отдаём вынесенным модулям функции, которые остаются здесь.
// До этого вызова в hub лежат пустышки — модули не падают, а просто ничего не делают.
wireHub({ calendarDateForWeekday, canEdit, cancelGroupPicker, confirmAndLogout, dateForWeekday, daySwapPanelClass, formatDateRu, gotoTab, hhmmToMinutes, humanMins, initialDataLoading, nowMinutesOfDay, openGroupPicker, openMoreScreen, pickGroupWithFeel, redrawAfterData, refreshTabPanes, render, renderRoomSearch, renderStudyTab, renderTabBody, renderTeacherSearch, renderTeachersTab, renderTop, resetWindowScroll, roomLink, selectGroup, shortSubjectLabel, softRefreshCurrentTab, softUpdateNav, softUpdateTopLead, subtractMinutes, switchTab, todayISO, weekRangeLabel, weekdayFromISO, weekdayNumFromIso, withTabScrollPreserved })


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
 * Кардинально: все 5 вкладок всегда в DOM (pager).
 * Свайп только двигает transform — ничего не собирается заново.
 */
let tabSwitchShieldUntil = 0

/* ================= Доп. образование и кружки ================= */

/** Какие разделы уже подтянули данные с сервера в этой сессии. */
const programsLoaded = new Set()

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
