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
import { attachmentImageCandidates, bindFileDownload, bindImgCandidates, closeHwLightbox, collectHwPhotoEntries, isHwLightboxOpen, isImageMime, looksLikeHwImage, openHwLightbox, renderHwAttachments, safeStorageUrl } from './features/lightbox.js'
import { dueDateForNextLesson, ensureOverrideDraft, facultyOfGroup, getScheduleNowStatus, groupHasFormation, groupHomeworkByAuthor, hwAuthorKey, isFormationSkipHw, isHwView, isLessonInPerson, lessonMeta, linkifyHwText, loadFormationDay, maybeSeekHwDay, overrideIsActiveForList, paintFormationRows, paintFormationTools, renderAddHwInline, renderAuthorChip, renderDays, renderFormationCard, renderFormationMarksOverlay, renderHwCard, renderHwTab, renderHwToggleAvatar, renderInlineHwGroups, renderLessonCard, renderMonthCalendar, renderNowStrip, renderSchedule, resolveFormation } from './screens/schedule.js'
import { auditCard, auditGroupName, auditSnapshot, auditTitle, auditWhen, downloadAuditCsv, isAdminSectionOpen, parseAuditDetail, renderAdminFreeRooms, renderAdminPanel, renderAuditSection, renderFormationSettings, renderGroupPicker, renderHomeTextSettings, renderLegalDoc, renderOverrideForm, renderOverridesTab, renderScheduleImport, renderSessionSettings, saveAppSettings, toggleAdminSection, wrapAdminAcc } from './screens/admin.js'
import { attachCardSwipe, canWriteNews, createReaderShell, formatNewsDate, homeNoLessonsText, homeProgramKind, listFaculties, lockReaderScroll, mountReaderCards, openNewsReader, renderHome, renderHomeHero, renderHomeNow, renderNewsComposer, scrollReaderTo, splitNewsMedia, startHeroAutoSlide, syncComposeToggle, unlockReaderScroll } from './features/news.js'
import { canManagePrograms, emptyProgramDraft, openProgramReader, programGroupId, programImages, programMetaLine, programVideoSrc, renderProgramEditor, renderPrograms } from './features/programs.js'
import { clearCascadeAnim, loadImageFromFile, moreSettingsRow, moreSvg, moreThemeIcon, openImageCropEditor, openProgramScreen, paintStaffCard, renderBannedGate, renderCabinetCard, renderClosedGate, renderMore, renderMoreClassic, renderMoreContacts, renderMoreGroup, renderMoreMyCode, renderMoreOverrides, renderMoreStudents, renderMoreSupport, renderMoreV2, renderNav, renderProfileAvatarControls } from './screens/more.js'
import { auditDate, calendarDateForWeekday, canEdit, dateForWeekday, daySwapPanelClass, formatDateRu, formatPhone, hhmmToMinutes, humanMins, isPageReload, normalizeSuggestKey, nowMinutesOfDay, relativeTime, roleRu, shortPersonName, shortSubjectLabel, stripIds, subtractMinutes, teacherDateLabel, todayISO, typeLabel, weekRangeLabel, weekdayFromISO, weekdayNumFromIso } from './lib/time.js'
import { buildRoomResultsNodes, buildTeacherResultsNodes, renderRoomSearch, renderRoomSlotCard, renderTeacherSearch, renderTeacherSlotCard, renderTeachersTab, resolveFreeRoomsSlotKey, roomLink } from './screens/directory.js'
import { buildPersistentPager, getPagerTrack, journalCtx, pagerIndex, pagerSetX, pagerSnapToIndex, pagerWidth, paneTabId, readPaneScroll, renderStudyTab, renderTabBody, resetWindowScroll, restorePaneScroll, sizePagerPanes, softUpdateNav, softUpdateTopLead, withTabScrollPreserved } from './app/pager.js'
import { cancelGroupPicker, confirmAndLogout, gotoTab, openGroupPicker, openMoreScreen, pickGroupWithFeel, refreshTabPanes, renderTop, selectGroup, sessionPillText, swipe, swipeAbort, swipeApplyOffset, swipeCanStart, swipeFinish, swipeResetFlags, switchTab, tabLeadText } from './app/navigation.js'
import { wireHub } from './app/hub.js'
import { setInitialDataLoading } from './app/loading-state.js'
import { programsLoaded } from './app/programs-cache.js'
import { tabSwitchShieldActive } from './app/tab-shield.js'
import { captureFocus, restoreFocus } from './lib/dom-stable.js'

// Отдаём вынесенным модулям функции ядра.
// Список собирается автоматически: берутся ровно те имена, которые модули
// зовут через hub. Часть объявлена здесь, часть уже живёт в модулях (в импортах).
wireHub({ auditDate, calendarDateForWeekday, canEdit, confirmAndLogout, dateForWeekday, daySwapPanelClass, formatDateRu, formatPhone, gotoTab, hhmmToMinutes, homeNoLessonsText, humanMins, isEditingFormNow, normalizePeopleQuery, nowMinutesOfDay, openGroupPicker, openImageCropEditor, openMoreScreen, openProgramScreen, pickGroupWithFeel, refreshTabPanes, render, renderPrograms, resolveFreeRoomsSlotKey, roleRu, roomLink, shortSubjectLabel, softRefreshCurrentTab, softUpdateNav, stripIds, subtractMinutes, switchTab, tabLeadText, teacherDateLabel, todayISO, typeLabel, weekRangeLabel, weekdayFromISO, weekdayNumFromIso, withTabScrollPreserved })


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

/** true, пока с Supabase не подтянулись реальные ДЗ (для скелетонов) */
try {
  document.documentElement.classList.toggle('ui-motion', UI_MOTION)
} catch {
  /* ignore */
}

/* ================= Доп. образование и кружки ================= */

/** Какие разделы уже подтянули данные с сервера в этой сессии. */
function softRefreshCurrentTab() {
  if (!state.groupId) {
    render({ force: true })
    return
  }
  if (swipe.busy || swipe.dragging) {
    pendingRedraw = true
    return
  }
  // refreshTabPanes сам вернёт false, если человек печатает — тогда
  // откладываем, а не сносим весь экран полным render().
  if (!refreshTabPanes([state.tab])) {
    if (isEditingFormNow()) {
      pendingRedraw = true
      return
    }
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
  // Та же логика: не снимаем экран, если человек что-то вводит.
  if (!refreshTabPanes(tabIds)) {
    if (isEditingFormNow()) {
      pendingRedraw = true
      return
    }
    render({ force: true })
    return
  }
  softUpdateNav()
  paintFlashSlot()
  if (isHwView()) maybeSeekHwDay()
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

  // Если человек что-то печатал — запоминаем поле, текст и позицию курсора.
  // Пересборка уничтожает узел: без этого клавиатура закрывается, а
  // набранное теряется (жалоба: «ввожу группу — сайт закрывает клавиатуру»).
  const focusSnap = captureFocus()

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

  // Возвращаем фокус и набранный текст после пересборки. Без этого поле
  // ввода просто исчезало — вместе с клавиатурой и введённым текстом.
  if (focusSnap) restoreFocus(focusSnap, root)
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
      setInitialDataLoading(false)
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
        if (prev === open) return
        // Смена статуса — это смена всего экрана (заглушка ⇄ приложение),
        // поэтому полный render здесь неизбежен. Но если человек печатает,
        // откладываем: иначе поле ввода исчезнет прямо под пальцем.
        if (canSafeRedraw()) render()
        else pendingRedraw = true
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
    if (isHwLightboxOpen()) return false
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
    .register(`${base}sw.js?v=161`, { scope: base })
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
