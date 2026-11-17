// Лента новостей: карточки на главной, полноэкранная читалка и компоузер.
//
// Читалка — отдельный слой с горизонтальными свайпами и автослайдом.
// Вынесена вместе с компоузером: они делят черновик state.newsDraft.

import { FACULTY_LABEL, MAX_NEWS_PHOTOS, READER_EASE, READER_SNAP_MS } from '../lib/constants.js'
import { closeHwLightbox, openHwLightbox } from './lightbox.js'
import { state } from '../lib/app-state.js'
import { hapticTap, motionOk, showToast } from '../lib/ui-feedback.js'
import { getScheduleNowStatus, isFormationSkipHw } from '../screens/schedule.js'
import { el } from '../lib/security.js'
import { addNews, deleteNews, getAppSettings, getGroup, getHomework, getNews, getSemesterLabel, getSession, lessonsForDate, listGroups, moveNews, updateNews, uploadHomeworkFiles } from '../lib/store.js'
import { hub } from '../app/hub.js'

// Эти функции живут в main.js — зовём их через мост, а не импортом (иначе цикл).
const canEdit = (...args) => hub.canEdit(...args)
const gotoTab = (...args) => hub.gotoTab(...args)
const humanMins = (...args) => hub.humanMins(...args)
const openGroupPicker = (...args) => hub.openGroupPicker(...args)
const openMoreScreen = (...args) => hub.openMoreScreen(...args)
const openProgramScreen = (...args) => hub.openProgramScreen(...args)
const refreshTabPanes = (...args) => hub.refreshTabPanes(...args)
const render = (...args) => hub.render(...args)
const renderPrograms = (...args) => hub.renderPrograms(...args)
const shortSubjectLabel = (...args) => hub.shortSubjectLabel(...args)
const softUpdateNav = (...args) => hub.softUpdateNav(...args)
const todayISO = (...args) => hub.todayISO(...args)

/** Дата события: «12 ноября 2026», для сегодняшних — «сегодня в 14:05». */
export function formatNewsDate(iso) {
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
 * Каркас полноэкранного просмотра: карточки лежат в ряд, каждая со своей
 * прокруткой. Соседняя карточка нарисована заранее и стоит рядом — поэтому
 * при свайпе она видна сразу, без белой вспышки и без перерисовки на ходу.
 */
export function createReaderShell(label) {
  const overlay = el('div', {
    className: 'news-reader',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': label || 'Просмотр',
  })
  const viewport = el('div', { className: 'news-reader-viewport' })
  const track = el('div', { className: 'news-reader-track' })
  viewport.append(track)
  return { overlay, viewport, track }
}

/** Поставить карточки в ряд и выровнять ленту на нужную. */
export function mountReaderCards(track, cards, activeIndex) {
  track.replaceChildren(...cards)
  track.style.transition = 'none'
  track.style.transform = `translate3d(${-activeIndex * 100}%,0,0)`
}

/** Проехать лентой к карточке. animate=false — мгновенно (старт, сброс размера). */
export function scrollReaderTo(track, i, animate = true) {
  track.style.transition = animate ? `transform ${READER_SNAP_MS}ms ${READER_EASE}` : 'none'
  track.style.transform = `translate3d(${-i * 100}%,0,0)`
}

/**
 * Свайп по ленте карточек: тянется 1:1 за пальцем, соседняя карточка видна
 * сразу. Вертикаль — обычная прокрутка карточки; вниз с самого верха — закрыть.
 *
 * Если включён loop, в треке есть клоны по краям (`slot()` возвращает позицию
 * слота, а не реальный индекс), поэтому «у края» больше нет: лента идёт по кругу.
 */
export function attachCardSwipe({ viewport, track, count, index, slot, goTo, onClose, loop = false }) {
  let sx = null
  let sy = null
  let axis = null
  let dx = 0
  let moved = 0
  let busy = false
  let startAt = 0
  let w = 0
  let pulled = 0
  let multi = false

  const slotOf = () => (typeof slot === 'function' ? slot() : index())
  const activeSlide = () => track.children[slotOf()]

  const snap = (animate) => {
    track.style.transition = animate ? `transform ${READER_SNAP_MS}ms ${READER_EASE}` : 'none'
    track.style.transform = `translate3d(${-slotOf() * 100}%,0,0)`
  }

  const begin = (e) => {
    if (busy) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const t = e.target
    // Кнопки, ссылки, видео и поля не перехватываем — иначе не нажать.
    if (
      t instanceof Element &&
      t.closest('button, a, video, audio, input, textarea, .news-reader-pager, .news-reader-toolbar')
    ) {
      return
    }
    sx = e.clientX
    sy = e.clientY
    dx = 0
    moved = 0
    pulled = 0
    axis = null
    viewport.style.transition = 'none'
    viewport.style.transform = ''
    w = viewport.clientWidth || window.innerWidth
    startAt = Date.now()
  }

  const move = (e) => {
    if (sx == null || busy) return
    const ddx = e.clientX - sx
    const ddy = e.clientY - sy
    if (!axis) {
      if (Math.abs(ddx) < 6 && Math.abs(ddy) < 6) return
      axis = Math.abs(ddx) > Math.abs(ddy) * 1.15 ? 'x' : 'y'
      if (axis === 'x') {
        try {
          viewport.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }
    }
    if (axis === 'y') {
      const slide = activeSlide()
      if (ddy > 0 && (!slide || slide.scrollTop <= 0)) {
        pulled = ddy
        viewport.style.transition = 'none'
        viewport.style.transform = `translate3d(0,${Math.min(ddy * 0.5, 90)}px,0)`
      } else if (pulled) {
        pulled = 0
        viewport.style.transition = 'none'
        viewport.style.transform = ''
      }
      return
    }
    dx = ddx
    moved = Math.max(moved, Math.abs(ddx))
    const cur = slotOf()
    if (count() < 2) return
    const atEdge = !loop && ((ddx > 0 && index() <= 0) || (ddx < 0 && index() >= count() - 1))
    // У края (без кольца) лента чуть подаётся — видно, что дальше ничего нет.
    track.style.transition = 'none'
    track.style.transform = `translate3d(calc(${-cur * 100}% + ${atEdge ? ddx * 0.18 : ddx}px),0,0)`
  }

  const end = () => {
    if (sx == null) return
    const wasAxis = axis
    const total = dx
    const elapsed = Math.max(1, Date.now() - startAt)
    const velocity = total / elapsed
    const width = w || viewport.clientWidth || window.innerWidth
    sx = null
    sy = null
    axis = null

    if (wasAxis === 'y') {
      const closeIt = pulled > 120
      pulled = 0
      if (closeIt) {
        onClose()
        return
      }
      viewport.style.transition = `transform 200ms ${READER_EASE}`
      viewport.style.transform = ''
      return
    }

    const cur = index()
    const dir = total < 0 ? 1 : -1
    const far = Math.abs(total) > width * 0.2
    const fast = Math.abs(velocity) > 0.3 && moved > 20
    const canGo = loop || (dir === 1 ? cur < count() - 1 : cur > 0)

    if (canGo && (far || fast)) {
      busy = true
      goTo(cur + dir, dir)
      window.setTimeout(() => {
        busy = false
      }, READER_SNAP_MS + 40)
      return
    }
    // Не дотянули — плавно возвращаемся на место.
    snap(true)
  }

  viewport.addEventListener('pointerdown', begin)
  viewport.addEventListener('pointermove', move)
  viewport.addEventListener('pointerup', end)
  viewport.addEventListener('pointercancel', end)
  // Два пальца — не листаем событие: чаще всего это случайное касание
  // или попытка приблизить фото. Само приближение живёт в полноэкранном
  // просмотре, который открывается тапом по снимку.
  viewport.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length > 1) multi = true
    },
    { passive: true },
  )
  viewport.addEventListener(
    'touchend',
    (e) => {
      if (e.touches.length < 2) multi = false
    },
    { passive: true },
  )
  // После свайпа не даём «дожать» тап по фото или кнопке.
  viewport.addEventListener(
    'click',
    (e) => {
      if (moved > 10 || multi) {
        e.stopPropagation()
        e.preventDefault()
      }
      moved = 0
    },
    true,
  )
}

/** Фото и видео из вложений: у видео в ленте свой плеер. */
export function splitNewsMedia(attachments) {
  const photos = []
  const videos = []
  for (const a of attachments || []) {
    const url = a?.url || ''
    const mime = String(a?.mime || '')
    if (/^video\//i.test(mime) || /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url)) videos.push(a)
    else if (/^image\//i.test(mime) || /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(url)) photos.push(a)
  }
  return { photos, videos }
}

/**
 * Блокировка прокрутки фона, пока открыт полноэкранный просмотр.
 * Снимать надо ВСЕГДА с обоих узлов: раньше в одном месте чистили только <html>,
 * и <body> с overflow:hidden оставался — из-за этого главную иногда нельзя было
 * доскроллить до конца.
 */
export function lockReaderScroll() {
  document.documentElement.classList.add('news-reader-open')
  document.body.classList.add('news-reader-open')
}

export function unlockReaderScroll() {
  document.documentElement.classList.remove('news-reader-open')
  document.body.classList.remove('news-reader-open')
}

/**
 * Просмотр события: полноэкранная лента. Каждая карточка нарисована заранее,
 * поэтому соседняя видна уже во время свайпа — без белой вспышки.
 * Листание — свайпом и кнопками внизу, вертикально — обычная прокрутка текста.
 */
export function openNewsReader(items, startIndex = 0) {
  if (!items?.length) return
  let list = items
  let index = Math.max(0, Math.min(startIndex, items.length - 1))
  closeHwLightbox({ animate: false })
  document.querySelectorAll('.news-reader').forEach((n) => n.remove())

  const { overlay, viewport, track } = createReaderShell('Событие')
  let closing = false

  const close = () => {
    if (closing) return
    closing = true
    overlay.classList.remove('is-open')
    overlay.classList.add('is-closing')
    unlockReaderScroll()
    window.setTimeout(() => overlay.remove(), 260)
  }

  /** Одна карточка события: обложка, текст, инструменты, точки. */
  const buildCard = (item, i, cloneOf = null) => {
    const { photos, videos } = splitNewsMedia(item.attachments)
    const canEditNews = canWriteNews(state.groupId)
    const cover = photos[0]

    const coverNode = cover
      ? el('img', {
          className: 'news-reader-cover',
          src: cover.url,
          alt: item.title || '',
          decoding: 'async',
        })
      : el('div', { className: 'news-reader-cover news-reader-cover-blank', 'aria-hidden': 'true' })

    const hero = el('div', { className: 'news-reader-hero' }, [
      cover
        ? el('div', {
            className: 'news-reader-blur',
            'aria-hidden': 'true',
            style: `background-image:url("${cover.url}")`,
          })
        : null,
      coverNode,
      el('div', { className: 'news-reader-scrim', 'aria-hidden': 'true' }),
      photos.length > 1
        ? el('button', {
            type: 'button',
            className: 'news-reader-zoom',
            text: `Все фото · ${photos.length}`,
            onClick: () => {
              hapticTap()
              openHwLightbox(photos.map((x) => x.url), 0)
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

    // Тап по фото — открыть полноэкранный просмотр. Зум двумя пальцами
    // прямо в ленте убран: он мешал листать и сбивал жест. В просмотре
    // приближать можно как угодно — как фото в Telegram.
    if (cover) {
      hero.classList.add('is-zoomable')
      coverNode.setAttribute('role', 'button')
      coverNode.setAttribute('tabindex', '0')
      coverNode.setAttribute('aria-label', 'Открыть фото на весь экран')
      const openThisPhoto = (e) => {
        if (e) {
          e.preventDefault()
          e.stopPropagation()
        }
        hapticTap()
        openHwLightbox(
          photos.map((x) => x.url),
          0,
        )
      }
      coverNode.addEventListener('click', openThisPhoto)
      coverNode.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') openThisPhoto(e)
      })
    }

    const extra = photos.slice(1)

    const content = el('div', { className: 'news-reader-content' }, [
      item.body
        ? el('p', { className: 'news-reader-text', text: item.body })
        : el('p', { className: 'news-reader-text news-reader-text-muted', text: 'Подробностей пока нет.' }),
      videos.length
        ? el(
            'div',
            { className: 'news-reader-videos' },
            videos.map((v) =>
              el('video', {
                className: 'news-reader-video',
                src: v.url,
                controls: true,
                playsinline: true,
                preload: 'metadata',
              }),
            ),
          )
        : null,
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
                onClick: () => {
                  hapticTap()
                  openHwLightbox(photos.map((x) => x.url), k + 1)
                },
              }),
            ),
          )
        : null,
      list.length > 1
        ? el('div', { className: 'news-reader-foot' }, [
            el('span', { className: 'news-reader-foot-count', text: `${i + 1} из ${list.length}` }),
          ])
        : null,
    ])

    // В клоне инструменты не нужны: правка/удаление привязаны к реальной карточке.
    const toolbar =
      canEditNews && cloneOf === null
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
      list.length > 1 && cloneOf === null
        ? el('nav', { className: 'news-reader-pager' }, [
            el('button', {
              type: 'button',
              className: 'news-reader-pager-btn',
              text: '‹',
              'aria-label': 'Предыдущее событие',
              onClick: () => step(-1),
            }),
            el(
              'div',
              { className: 'news-reader-pager-dots' },
              list.map((n, k) =>
                el('button', {
                  type: 'button',
                  className: k === index ? 'news-reader-pager-dot is-on' : 'news-reader-pager-dot',
                  'aria-label': `Событие ${k + 1}`,
                  onClick: () => goTo(k),
                }),
              ),
            ),
            el('button', {
              type: 'button',
              className: 'news-reader-pager-btn',
              text: '›',
              'aria-label': 'Следующее событие',
              onClick: () => step(1),
            }),
          ])
        : null

    return el(
      'article',
      {
        className: `news-reader-card${cloneOf === null ? '' : ' is-clone'}`,
        dataset: cloneOf === null ? { readerIndex: String(i) } : { readerClone: String(cloneOf) },
        'aria-hidden': cloneOf === null ? undefined : 'true',
      },
      [hero, content, toolbar, pager],
    )
  }

  /**
   * Лента листается по кругу. В треке держим [клон последней, …карточки, клон первой],
   * поэтому у края всегда есть сосед. Когда анимация доезжает до клона, мгновенно
   * (без анимации) встаём на настоящую карточку того же события — шва не видно.
   * Позиция в треке = реальный индекс + 1.
   */
  const loopOffset = () => (list.length > 1 ? 1 : 0)
  let slotPos = index + loopOffset()

  const mountCards = (activeIndex) => {
    const cards = []
    if (list.length > 1) cards.push(buildCard(list[list.length - 1], list.length - 1, 'last'))
    list.forEach((n, i) => cards.push(buildCard(n, i)))
    if (list.length > 1) cards.push(buildCard(list[0], 0, 'first'))
    slotPos = activeIndex + loopOffset()
    mountReaderCards(track, cards, slotPos)
  }

  const realCards = () =>
    [...track.children].filter(
      (node) => node instanceof Element && node.dataset.readerIndex !== undefined,
    )

  /** Перерисовать ленту целиком — нужно после правки, удаления и смены порядка. */
  const repaint = () => {
    mountCards(index)
    paintDots()
  }

  const paintDots = () => {
    const card = realCards().find((n) => Number(n.dataset.readerIndex) === index)
    const dots = card?.querySelectorAll('.news-reader-pager-dot')
    if (dots?.length) [...dots].forEach((d, k) => d.classList.toggle('is-on', k === index))
  }

  const moveToSlot = (target, animate = true) => {
    slotPos = target
    scrollReaderTo(track, target, animate)
  }

  /** После анимации: если остановились на клоне — мгновенно встаём на настоящую. */
  const settleAfterSlide = () => {
    if (list.length < 2) return
    const want = index + loopOffset()
    if (slotPos !== want) moveToSlot(want, false)
  }

  /**
   * Перейти к событию `i`.
   * dir = +1/−1 — листать ровно на один слот (так край проходит без рывка),
   * без dir — сразу встать на нужную карточку.
   */
  const goTo = (i, dir = 0) => {
    const n = list.length
    if (!n) return
    const next = ((i % n) + n) % n
    if (next === index) return
    index = next
    state.newsIndex = next
    if (!loopOffset()) {
      moveToSlot(next)
    } else if (dir) {
      moveToSlot(Math.max(0, slotPos + dir))
    } else {
      moveToSlot(next + loopOffset())
    }
    paintDots()
    hapticTap()
    window.setTimeout(settleAfterSlide, READER_SNAP_MS + 40)
  }

  const step = (delta) => {
    if (list.length < 2) return
    const next = (((index + delta) % list.length) + list.length) % list.length
    goTo(next, delta > 0 ? 1 : -1)
  }

  const edit = (i) => {
    const item = list[i]
    if (!item) return
    hapticTap()
    state.newsEdit = {
      id: item.id,
      title: item.title,
      body: item.body,
      attachments: (item.attachments || []).slice(),
      pinned: !!item.pinned,
      toAll: !item.groupId,
      faculties: (item.faculties || []).slice(),
    }
    state.newsCompose = true
    state.newsDraft = null
    // Возвращаемся к ленте главной: раздел допобразования иначе закроет форму.
    state.moreScreen = ''
    close()
    if (state.tab === 'home') {
      if (!refreshTabPanes(['home'], { force: true })) render({ force: true })
    } else {
      state.tab = 'home'
      render({ force: true })
    }
    requestAnimationFrame(() => {
      document.querySelector('.news-compose')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  const move = async (i, dir) => {
    const item = list[i]
    if (!item) return
    hapticTap()
    try {
      await moveNews(item.id, dir, state.groupId)
      const fresh = getNews(state.groupId)
      const at = fresh.findIndex((n) => n.id === item.id)
      list = fresh
      index = at < 0 ? 0 : at
      state.newsIndex = index
      showToast(dir < 0 ? 'Подняли выше' : 'Опустили ниже')
      repaint()
      if (refreshTabPanes(['home'])) softUpdateNav()
    } catch (err) {
      showToast(err.message, true)
    }
  }

  const removeItem = async (i) => {
    const item = list[i]
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
    slot: () => slotPos,
    loop: list.length > 1,
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

  // Поворот телефона или изменение ширины — лента должна остаться на своём слайде.
  const onResize = () => {
    if (document.body.contains(overlay)) scrollReaderTo(track, slotPos, false)
  }
  window.addEventListener('resize', onResize, { passive: true })
  overlay.addEventListener('remove', () => window.removeEventListener('resize', onResize))

  document.body.append(overlay)
  lockReaderScroll()
  if (motionOk()) requestAnimationFrame(() => overlay.classList.add('is-open'))
  else overlay.classList.add('is-open')
}

/**
 * Карусель событий на главной — как в МГЮА: фото во всю ширину, подпись поверх,
 * листается пальцем, точки внизу. Первое, что видит студент, — картинка события.
 */
export function renderHomeHero(group) {
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
            state.newsEdit = null
            state.newsDraft = null
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

  /**
   * Карусель идёт по кругу: [клон последнего, …слайды, клон первого].
   * Позиция в треке = индекс события + 1. После анимации на клоне
   * мгновенно встаём на настоящий слайд — шва не видно.
   */
  const loop = items.length > 1
  const loopOffset = () => (loop ? 1 : 0)
  const makeTrackNodes = () => {
    if (!loop) return [...slides]
    return [slides[slides.length - 1].cloneNode(true), ...slides, slides[0].cloneNode(true)]
  }
  const track = el('div', { className: 'home-hero-track' }, makeTrackNodes())
  let slotPos = index + loopOffset()
  const setX = (i, animate = true) => {
    slotPos = i
    track.style.transition = animate ? 'transform 320ms cubic-bezier(0.22, 0.61, 0.36, 1)' : 'none'
    track.style.transform = `translate3d(${-i * 100}%,0,0)`
  }
  setX(index + loopOffset(), false)

  // Клик по слайду: cloneNode не копирует обработчики, поэтому слушаем трек.
  track.addEventListener('click', (e) => {
    if (Number(track.dataset.moved || 0) > 8) return
    const card = e.target instanceof Element ? e.target.closest('.home-hero-slide') : null
    if (!card) return
    const all = [...track.children]
    const slot = all.indexOf(card)
    if (slot < 0) return
    const n = items.length
    const real = ((slot - loopOffset()) % n + n) % n
    hapticTap()
    openNewsReader(items, real)
  })

  /** После анимации, если стоим на клоне — мгновенно встаём на настоящий слайд. */
  const settle = () => {
    if (!loop) return
    const want = (Number(state.newsIndex) || 0) + 1
    if (slotPos !== want) setX(want, false)
  }

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
          setX(i + loopOffset())
          paintDots(i)
          window.setTimeout(settle, 340)
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
        setX(slotPos, false)
        return
      }
      drag = dx
      track.dataset.moved = String(Math.abs(dx))
      track.style.transform = `translate3d(calc(${-slotPos * 100}% + ${dx}px),0,0)`
    }
    const end = () => {
      if (x0 == null) return
      x0 = null
      let dir = 0
      if (drag < -55) dir = 1
      else if (drag > 55) dir = -1
      drag = 0
      if (dir) {
        hapticTap()
        const n = items.length
        state.newsIndex = (((state.newsIndex || 0) + dir) % n + n) % n
        setX(slotPos + dir)
        paintDots(state.newsIndex)
        window.setTimeout(settle, 340)
      } else {
        setX(slotPos)
      }
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
        const n = items.length
        const next = ((i % n) + n) % n
        state.newsIndex = next
        setX(next + loopOffset())
        paintDots(next)
        window.setTimeout(settle, 340)
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
        if (!state.newsCompose) {
          state.newsDraft = null
          state.newsEdit = null
        }
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

/**
 * Автолистание карусели: раз в 20 секунд следующее событие.
 * Останавливается, когда вкладка не видна, когда идёт касание/свайп
 * и когда поверх открыт просмотр события.
 */
export function startHeroAutoSlide(sectionEl, { count, getIndex, setIndex }) {
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

/** Все факультеты, которые вообще есть в колледже — из списка групп. */
export function listFaculties() {
  const set = new Set()
  for (const g of listGroups()) {
    const f = String(g.faculty || '').trim()
    if (f) set.add(f)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'))
}

export function canWriteNews(groupId) {
  const s = getSession()
  if (!s) return false
  if (s.role === 'admin') return true
  return canEdit(groupId)
}

/**
 * Компоузер события: заголовок, текст, фото и видео, факультеты, закрепление.
 * Одна и та же форма работает и для публикации, и для правки уже
 * опубликованного: в режиме правки все поля заполнены тем, что было.
 */
export function renderNewsComposer(group) {
  if (!canWriteNews(state.groupId)) return null
  const editing = state.newsEdit
  if (editing) {
    // Правка: черновик собираем из самого события, ввод не теряется при перерисовке.
    if (!state.newsDraft || state.newsDraft.editId !== editing.id) {
      state.newsDraft = {
        editId: editing.id,
        title: editing.title || '',
        body: editing.body || '',
        pinned: !!editing.pinned,
        attachments: (editing.attachments || []).slice(),
        toAll: !!editing.toAll,
        faculties: (editing.faculties || []).slice(),
      }
    }
  } else if (!state.newsDraft || state.newsDraft.editId) {
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
    accept: 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,video/x-m4v',
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

  // —— Вложения: фото плитками, видео — карточкой с плеером.
  const preview = el('div', { className: 'news-compose-preview' })
  const paintPreview = () => {
    preview.replaceChildren()
    if (!draft.attachments.length) {
      preview.append(el('p', { className: 'muted', text: 'Фото и видео не выбраны' }))
      return
    }
    draft.attachments.forEach((a, i) => {
      const { videos } = splitNewsMedia([a])
      const isVideo = videos.length > 0
      const photoIndex = isVideo
        ? -1
        : splitNewsMedia(draft.attachments.slice(0, i + 1)).photos.length - 1
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
                    // Обложка — первое фото. Видео остаётся на своих местах ниже.
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
    if (draft.attachments.length >= MAX_NEWS_PHOTOS) {
      preview.append(
        el('p', { className: 'muted', text: `Достигнут максимум — ${MAX_NEWS_PHOTOS} файлов.` }),
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
      showToast(`Максимум ${MAX_NEWS_PHOTOS} файлов`, true)
      file.value = ''
      return
    }
    try {
      const picked = [...file.files].slice(0, Math.min(room, 4))

      // Фото кадрируем по одному, под рамку ленты 16:10.
      //
      // Зачем: на главной фото показывается в блоке с aspect-ratio 16/10 и
      // object-fit: cover. Всё, что не влезло в этот прямоугольник, срезается
      // по краям — а люди пишут текст по краям кадра, и он пропадал.
      // Редактор тот же, что для аватара, только рамка прямоугольная.
      const prepared = []
      for (const f of picked) {
        const isVideo = /^video\//i.test(f.type || '')
        if (isVideo) {
          prepared.push(f)
          continue
        }
        const cropped = await hub.openImageCropEditor(f, {
          shape: 'square',
          ratio: 16 / 10,
          size: 1600,
          name: f.name || 'news.jpg',
          heading: 'Подгони фото',
          hint: '«Целиком» — фото видно всё, поля закрывает размытый фон. «Заполнить кадр» — фото во весь кадр, но края обрежутся.',
          fitDefault: true,
        })
        // Отмена кадрирования = это фото не добавляем, остальные не трогаем.
        if (cropped) prepared.push(cropped)
      }
      if (!prepared.length) {
        file.value = ''
        return
      }

      const hasVideo = prepared.some((f) => /^video\//i.test(f.type || ''))
      showToast(hasVideo ? 'Загружаю видео… это может занять время' : 'Загружаю фото…')
      const uploaded = await uploadHomeworkFiles(state.groupId, prepared)
      draft.attachments.push(...uploaded)
      paintPreview()
    } catch (err) {
      showToast(err.message, true)
    } finally {
      file.value = ''
    }
  })

  const submit = el('button', {
    className: 'btn',
    type: 'submit',
    text: editing ? 'Сохранить' : 'Опубликовать',
  })
  const cancel = el('button', {
    type: 'button',
    className: 'btn btn-ghost',
    text: 'Отмена',
    onClick: () => {
      state.newsCompose = false
      state.newsDraft = null
      state.newsEdit = null
      if (!refreshTabPanes(['home'])) render({ force: true })
      else syncComposeToggle()
    },
  })

  const form = el('form', { className: 'news-compose-form' }, [
    el('div', { className: 'field' }, [el('label', { text: 'Заголовок' }), title]),
    el('div', { className: 'field' }, [el('label', { text: 'Текст' }), body]),
    el('div', { className: 'field' }, [
      el('label', { text: `Фото и видео (до ${MAX_NEWS_PHOTOS})` }),
      file,
      el('p', {
        className: 'muted news-compose-hint',
        text: 'Первое фото — обложка. Видео: mp4, webm, mov — до 60 МБ.',
      }),
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
    submit.textContent = editing ? 'Сохраняю…' : 'Публикую…'
    const payload = {
      groupId: toAll.checked && isAdmin ? null : state.groupId,
      title: t,
      body: body.value.trim(),
      attachments: draft.attachments,
      pinned: pinned.checked,
      faculties: draft.faculties,
    }
    try {
      if (editing) {
        await updateNews({ id: editing.id, ...payload })
      } else {
        await addNews(payload)
      }
      state.newsCompose = false
      state.newsDraft = null
      state.newsEdit = null
      state.newsIndex = 0
      showToast(editing ? 'Событие сохранено' : 'Событие опубликовано')
      if (!refreshTabPanes(['home'])) render({ force: true })
      else syncComposeToggle()
    } catch (err) {
      submit.disabled = false
      submit.textContent = editing ? 'Сохранить' : 'Опубликовать'
      showToast(err.message, true)
    }
  })

  card.append(
    el('div', { className: 'news-compose-head' }, [
      el('h3', {
        className: 'news-compose-title',
        text: editing ? 'Правка события' : 'Новое событие',
      }),
    ]),
    form,
  )
  return card
}

/** Кнопка «+» на карусели превращается в «−», когда компоузер открыт. */
export function syncComposeToggle() {
  const btn = document.querySelector('.home-hero-add')
  if (!btn) return
  const open = !!state.newsCompose
  btn.textContent = open ? '−' : '+'
  btn.title = open ? 'Закрыть форму' : 'Добавить событие'
  btn.classList.toggle('is-open', open)
  btn.setAttribute('aria-expanded', open ? 'true' : 'false')
}

/** Ещё показывать админский текст вместо «Пар нет»? (пустой until = бессрочно) */
export function homeNoLessonsText() {
  const settings = getAppSettings()
  const text = String(settings.homeNoLessonsText || '').trim()
  if (!text) return ''
  const until = String(settings.homeNoLessonsUntil || '').trim()
  if (!until) return text
  const t = Date.parse(until)
  if (!Number.isFinite(t)) return text
  return Date.now() < t ? text : ''
}

/** Карточка «идёт сейчас / следующая пара / на сегодня всё». */
export function renderHomeNow(status, group) {
  if (!status) {
    const custom = homeNoLessonsText()
    return el('div', { className: 'card home-now' }, [
      el('p', { className: 'home-now-label muted', text: 'Сегодня' }),
      el('h3', {
        className: `home-now-title${custom ? ' is-custom' : ''}`,
        text: custom || 'Пар нет',
      }),
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

/**
 * Главная: карусель событий с фото, что сейчас/дальше, ДЗ на сегодня,
 * лента и быстрые переходы. Всё из уже загруженного состояния.
 */
export function renderHome() {
  const group = state.groupId ? getGroup(state.groupId) : null
  // Доп. образование и кружки — разделы главной, а не профиля: открываем их здесь.
  const programKind = homeProgramKind()
  if (programKind) return renderPrograms(programKind, { standalone: true })
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
  const todayLessons = lessonsForDate(group.id, today)
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
    { programs: 'dpo', title: 'Доп. образование', sub: 'Программы и набор' },
    { programs: 'club', title: 'Кружки и секции', sub: 'Куда записаться' },
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
            if (t.programs) {
              openProgramScreen(t.programs)
              return
            }
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

/** Раздел главной, который открывается вместо ленты: '' | 'dpo' | 'clubs'. */
export function homeProgramKind() {
  if (state.moreScreen === 'dpo') return 'dpo'
  if (state.moreScreen === 'clubs') return 'club'
  return ''
}

/** Ссылка на отложенное автолистание: перерисовка главной отменяет старое. */
let heroAutoTimer = null

let heroAutoObserver = null
