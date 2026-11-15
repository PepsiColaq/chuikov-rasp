// Пять вкладок в одном «пейджере»: все панели всегда в DOM,
// свайп только двигает transform. Здесь же сохранение прокрутки.
//
// pendingRedraw и sync* остаются в main.js — это общая машинерия
// синхронизации, её дёргают отовсюду.

import { state } from '../lib/app-state.js'
import { DAY_SWAP_MOTION, HW_TAB_BY_DAY, TAB_ORDER } from '../lib/constants.js'
import { flash, hapticTap, motionOk } from '../lib/ui-feedback.js'
import { dateForWeekday, formatDateRu, weekdayFromISO } from '../lib/time.js'
import { renderHome } from '../features/news.js'
import { renderDays, renderHwTab, renderSchedule } from '../screens/schedule.js'
import { renderTeachersTab } from '../screens/directory.js'
import { renderOverridesTab } from '../screens/admin.js'
import { renderMore } from '../screens/more.js'
import { el } from '../lib/security.js'
import { getGroup, getLessons, lessonsForDate } from '../lib/store.js'
import { renderGradesTab } from '../journal-ui.js'
import { hub } from './hub.js'

// Эти функции живут в main.js — зовём их через мост, а не импортом (иначе цикл).
const refreshTabPanes = (...args) => hub.refreshTabPanes(...args)
const render = (...args) => hub.render(...args)
const tabLeadText = (...args) => hub.tabLeadText(...args)

export function pagerWidth() {
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

export function pagerIndex(tabId = state.tab) {
  const i = TAB_ORDER.indexOf(tabId)
  return i < 0 ? 0 : i
}

export function getPagerTrack() {
  return document.querySelector('#tab-stage > .tab-track.tab-pager')
}

export function sizePagerPanes(track, w) {
  if (!track) return
  track.querySelectorAll(':scope > .tab-pane').forEach((pane) => {
    pane.style.flex = `0 0 ${w}px`
    pane.style.width = `${w}px`
    pane.style.minWidth = `${w}px`
  })
}

export function pagerSetX(x, { animate = false } = {}) {
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

export function pagerSnapToIndex(index, { animate = false } = {}) {
  const w = pagerWidth()
  const track = getPagerTrack()
  sizePagerPanes(track, w)
  const i = Math.max(0, Math.min(TAB_ORDER.length - 1, index))
  pagerSetX(-i * w, { animate })
  return i
}

export function buildPersistentPager(group, { cascadeTab = null } = {}) {
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
export function paneTabId(tabId) {
  if (tabId === 'hw') return 'grades'
  if (tabId === 'overrides') return 'more'
  return tabId
}

/** Сохранить скролл вкладки через render/refresh (иначе прыжок вверх при раскрытии ДЗ) */
export function withTabScrollPreserved(tabId, fn) {
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
export function resetWindowScroll() {
  try {
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  } catch {
    /* ignore */
  }
}

/** Позиция прокрутки панели вкладки: `{ top, left }` или null. */
export function readPaneScroll(tabId = state.tab) {
  const pane = document.querySelector(`#tab-stage .tab-pane[data-tab="${paneTabId(tabId)}"]`)
  if (!pane) return null
  return { top: pane.scrollTop || 0, left: pane.scrollLeft || 0 }
}

/**
 * Вернуть прокрутку после пересборки DOM.
 * Повторяем в двух кадрах: высота панели может измениться уже после вставки
 * (подгрузка шрифтов, картинок), и тогда браузер обнулит scrollTop.
 */
export function restorePaneScroll(tabId = state.tab, pos) {
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

export function journalCtx() {
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

export function renderTabBody(tabId, group, opts = {}) {
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
export function renderStudyTab() {
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

export function softUpdateNav() {
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
export function softUpdateTopLead() {
  const sub = document.querySelector('.topbar .topbar-sub')
  if (!sub) return false
  const group = state.groupId ? getGroup(state.groupId) : null
  const text = tabLeadText(state.tab, group) || '\u00a0'
  if (sub.textContent !== text) sub.textContent = text
  return true
}
