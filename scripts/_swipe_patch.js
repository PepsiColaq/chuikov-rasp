const TAB_ORDER = ['schedule', 'hw', 'teachers', 'overrides', 'more']

function renderTabBody(tabId, group) {
  const wrap = el('div', { className: 'tab-pane-inner' })
  if (tabId === 'schedule') wrap.append(renderDays(), renderSchedule())
  else if (tabId === 'hw') wrap.append(renderDays(), renderHwTab())
  else if (tabId === 'teachers') wrap.append(renderTeachersTab())
  else if (tabId === 'overrides') wrap.append(renderOverridesTab(group || getGroup(state.groupId)))
  else wrap.append(renderMore())
  return wrap
}

function switchTab(id, { animate = false, fromDrag = false } = {}) {
  if (!id || state.tab === id) {
    if (fromDrag) render()
    return
  }
  if (!TAB_ORDER.includes(id)) {
    state.tab = id
    render()
    return
  }
  const from = TAB_ORDER.indexOf(state.tab)
  const to = TAB_ORDER.indexOf(id)
  const dir = to >= from ? 1 : -1
  const root = document.getElementById('app')

  const apply = () => {
    state.tab = id
    render()
    if (id === 'schedule' || id === 'hw') scheduleSync('tab')
    else tryFlushPendingRedraw()
    if (animate && !fromDrag && root) {
      const stage = document.getElementById('tab-stage')
      const target = stage || root
      target.classList.add(dir > 0 ? 'tab-enter-right' : 'tab-enter-left')
      const done = () => target.classList.remove('tab-enter-right', 'tab-enter-left')
      target.addEventListener('animationend', done, { once: true })
      setTimeout(done, 320)
    }
  }

  if (animate && !fromDrag && root) {
    const stage = document.getElementById('tab-stage')
    const target = stage || root
    target.classList.add(dir > 0 ? 'tab-leave-left' : 'tab-leave-right')
    window.setTimeout(() => {
      target.classList.remove('tab-leave-left', 'tab-leave-right')
      apply()
    }, 160)
  } else {
    apply()
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
}

function swipeCanStart(target) {
  if (swipe.busy) return false
  if (!state.groupId || state.legalDoc) return false
  if (isEditingFormNow()) return false
  if (!isSiteEnabled() && getSession()?.role !== 'admin') return false
  if (!(target instanceof Element)) return true
  if (target.closest('nav.nav, input, textarea, select, button, a, label')) return false
  return true
}

function swipeTeardownTrack() {
  const stage = document.getElementById('tab-stage')
  if (!stage) return
  const track = stage.querySelector('.tab-track')
  if (!track) return
  const panes = [...track.querySelectorAll(':scope > .tab-pane')]
  const keep =
    swipe.trackDir === 1 ? panes[0] : swipe.trackDir === -1 ? panes[1] : panes[0]
  stage.replaceChildren()
  if (keep) {
    keep.style.width = ''
    keep.style.minWidth = ''
    keep.style.flex = ''
    stage.append(keep)
  }
  stage.classList.remove('tab-swiping')
  swipe.trackDir = 0
  swipe.baseX = 0
}

function swipeEnsureTrack(dir) {
  if (swipe.trackDir === dir) return true
  const stage = document.getElementById('tab-stage')
  let current = stage?.querySelector(':scope > .tab-pane')
  if (!stage) return false

  const i = TAB_ORDER.indexOf(state.tab)
  const neighborId = TAB_ORDER[i + dir]
  if (!neighborId) return false

  if (swipe.trackDir && swipe.trackDir !== dir) {
    swipeTeardownTrack()
    current = stage.querySelector(':scope > .tab-pane')
  }
  if (!current) return false

  const w = swipe.width || Math.min(window.innerWidth, 480) || 360
  const group = getGroup(state.groupId)
  const neighbor = el('div', { className: 'tab-pane' })
  const prevTab = state.tab
  state.tab = neighborId
  try {
    neighbor.append(renderTabBody(neighborId, group))
  } finally {
    state.tab = prevTab
  }

  const track = el('div', { className: 'tab-track' })
  current.style.flex = `0 0 ${w}px`
  current.style.width = `${w}px`
  current.style.minWidth = `${w}px`
  neighbor.style.flex = `0 0 ${w}px`
  neighbor.style.width = `${w}px`
  neighbor.style.minWidth = `${w}px`

  if (dir === 1) {
    track.append(current, neighbor)
    swipe.baseX = 0
  } else {
    track.append(neighbor, current)
    swipe.baseX = -w
  }
  track.style.transform = `translate3d(${swipe.baseX}px,0,0)`
  track.style.transition = 'none'
  stage.replaceChildren(track)
  stage.classList.add('tab-swiping')
  swipe.trackDir = dir
  return true
}

function swipeApplyOffset(dx) {
  const stage = document.getElementById('tab-stage')
  const track = stage?.querySelector('.tab-track')
  if (!track || !swipe.trackDir) return
  const w = swipe.width || 360
  let x = swipe.baseX + dx
  x = Math.min(0, Math.max(-w, x))
  swipe.x = x - swipe.baseX
  track.style.transition = 'none'
  track.style.transform = `translate3d(${x}px,0,0)`
}

function swipeFinish(commitDir) {
  const stage = document.getElementById('tab-stage')
  const track = stage?.querySelector('.tab-track')
  const w = swipe.width || 360
  const i = TAB_ORDER.indexOf(state.tab)
  if (!stage || !track || i < 0 || !swipe.trackDir) {
    stage?.classList.remove('tab-swiping')
    swipe.trackDir = 0
    swipe.busy = false
    return
  }

  const dir = swipe.trackDir
  const willCommit =
    (commitDir === 1 && dir === 1 && i < TAB_ORDER.length - 1) ||
    (commitDir === -1 && dir === -1 && i > 0)

  const targetX = willCommit ? (dir === 1 ? -w : 0) : swipe.baseX

  swipe.busy = true
  track.style.transition = 'transform 0.3s cubic-bezier(.22,.9,.3,1)'
  track.style.transform = `translate3d(${targetX}px,0,0)`

  window.setTimeout(() => {
    if (willCommit) {
      const nextId = TAB_ORDER[i + dir]
      swipe.trackDir = 0
      swipe.baseX = 0
      swipe.busy = false
      stage.classList.remove('tab-swiping')
      switchTab(nextId, { fromDrag: true })
    } else {
      swipeTeardownTrack()
      swipe.busy = false
    }
  }, 300)
}

document.addEventListener(
  'touchstart',
  (e) => {
    if (e.touches.length !== 1) {
      swipe.active = false
      swipe.dragging = false
      swipe.axis = null
      return
    }
    if (!swipeCanStart(e.target)) {
      swipe.active = false
      return
    }
    const t = e.touches[0]
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
    if (!swipe.active || e.touches.length !== 1 || swipe.busy) return
    const t = e.touches[0]
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

    const dir = dx < 0 ? 1 : dx > 0 ? -1 : 0
    if (!dir) return
    if (!swipe.trackDir) {
      const i = TAB_ORDER.indexOf(state.tab)
      if (dir === 1 && i >= TAB_ORDER.length - 1) return
      if (dir === -1 && i <= 0) return
      if (!swipeEnsureTrack(dir)) return
    }

    if (e.cancelable) e.preventDefault()
    swipeApplyOffset(dx)
  },
  { passive: false },
)

document.addEventListener(
  'touchend',
  (e) => {
    if (!swipe.active && !swipe.dragging) return
    const wasDrag = swipe.dragging
    swipe.active = false
    swipe.dragging = false
    if (!wasDrag || swipe.axis !== 'h') {
      swipe.axis = null
      return
    }
    swipe.axis = null
    if (!swipe.trackDir) return

    const t = e.changedTouches?.[0]
    if (!t) {
      swipeFinish(0)
      return
    }
    const dx = t.clientX - swipe.x0
    const dt = Math.max(16, Date.now() - swipe.t0)
    const velocity = dx / dt
    const w = swipe.width || 360
    const progress = Math.abs(swipe.x) / w
    const flick = Math.abs(velocity) > 0.4
    const far = progress > 0.2

    if (swipe.trackDir === 1 && ((far && dx < 0) || (flick && velocity < -0.4))) swipeFinish(1)
    else if (swipe.trackDir === -1 && ((far && dx > 0) || (flick && velocity > 0.4)))
      swipeFinish(-1)
    else swipeFinish(0)
  },
  { passive: true },
)

document.addEventListener(
  'touchcancel',
  () => {
    if (swipe.dragging && swipe.trackDir) swipeFinish(0)
    swipe.active = false
    swipe.dragging = false
    swipe.axis = null
  },
  { passive: true },
)
