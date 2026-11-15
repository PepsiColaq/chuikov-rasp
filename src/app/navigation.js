// Нижнее меню, пять вкладок и свайпы между ними.
//
// Все вкладки всегда в DOM (pager): свайп только двигает transform,
// ничего не пересобирая заново. Поэтому тут и переключение, и жесты, и
// сохранение прокрутки внутри панели.

import { SELECTED_GROUP_KEY, state } from '../lib/app-state.js'
import { getPagerTrack, pagerIndex, pagerSnapToIndex, pagerWidth, paneTabId, renderTabBody, resetWindowScroll, softUpdateNav } from './pager.js'
import { HW_TAB_BY_DAY, TAB_ORDER } from '../lib/constants.js'
import { clearCascadeAnim } from '../screens/more.js'
import { homeProgramKind } from '../features/news.js'
import { UI_FEEL, flash, hapticTap, motionOk } from '../lib/ui-feedback.js'
import { shortPersonName } from '../lib/time.js'
import { getGroup, getSemesterLabel, getSession, isSiteEnabled, logout, refreshNews } from '../lib/store.js'
import { isHwLightboxOpen } from '../features/lightbox.js'
import { el } from '../lib/security.js'
import { hub } from './hub.js'
import { programsLoaded } from './programs-cache.js'
import { armTabSwitchShield } from './tab-shield.js'

// Эти функции живут в main.js — зовём их через мост, а не импортом (иначе цикл).
const isEditingFormNow = (...args) => hub.isEditingFormNow(...args)
const render = (...args) => hub.render(...args)

/** Подзаголовок под названием группы — один уровень на всех вкладках */
export function tabLeadText(tab, group) {
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

/** Обновить содержимое вкладок на месте — без уничтожения pager */
export function refreshTabPanes(tabIds, { force = false } = {}) {
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

export function switchTab(id, { animate = false, fromDrag = false } = {}) {
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
  armTabSwitchShield()
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
export function gotoTab(tabId, { animate = true } = {}) {
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
export function openMoreScreen(screen, { animate = true } = {}) {
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

export const swipe = {
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

export function swipeResetFlags() {
  swipe.active = false
  swipe.dragging = false
  swipe.axis = null
  swipe.fingerId = null
  swipe.x = 0
}

export function swipeCanStart(target) {
  if (swipe.busy) return false
  if (isHwLightboxOpen()) return false
  if (!state.groupId || state.legalDoc) return false
  if (isEditingFormNow()) return false
  if (!isSiteEnabled() && getSession()?.role !== 'admin') return false
  if (!(target instanceof Element)) return true
  if (target.closest('nav.nav, input, textarea, select, button, a, label, .hw-lightbox, .home-hero, .news-reader')) return false
  return true
}

export function swipeAbort() {
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

export function swipeApplyOffset(dx) {
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

export function swipeFinish(commitDir) {
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
    armTabSwitchShield()
    stage?.classList.remove('tab-swiping')
    swipe.trackDir = 0
    swipe.baseX = 0
    swipe.busy = false
  }, ms)
}

export function renderTop(group) {
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

export function selectGroup(id) {
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

export function pickGroupWithFeel(id, btn) {
  hapticTap()
  if (btn) {
    btn.classList.add('is-picked')
    btn.setAttribute('aria-pressed', 'true')
  }
  const wait = motionOk() || UI_FEEL ? 160 : 0
  window.setTimeout(() => selectGroup(id), wait)
}

export function openGroupPicker() {
  if (state.groupId) state.prevGroupId = state.groupId
  state.groupId = ''
  render()
}

export function cancelGroupPicker() {
  const backId = state.prevGroupId
  state.prevGroupId = ''
  if (backId && getGroup(backId)) {
    state.groupId = backId
    localStorage.setItem(SELECTED_GROUP_KEY, backId)
  }
  render()
}

export async function confirmAndLogout() {
  if (!confirm('Выйти с этого устройства?\nЧтобы снова править ДЗ и замены, нужен будет код.')) {
    return false
  }
  await logout()
  flash('Вы вышли')
  return true
}

export function sessionPillText(session) {
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
