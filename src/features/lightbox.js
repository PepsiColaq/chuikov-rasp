// Полноэкранный просмотр фото из домашки.
//
// Отдельный модуль, потому что это самый автономный кусок: он рисует
// собственный слой поверх страницы, ловит свайпы и закрывается по Esc.
// Раньше занимал 450 строк посреди main.js.

import { UI_MOTION, flash, motionOk } from '../lib/ui-feedback.js'
import { fetchStorageObjectUrl, storageUrlCandidates } from '../lib/supabase.js'
import { el } from '../lib/security.js'

export function safeStorageUrl(url) {
  const list = storageUrlCandidates(url)
  return list[0] || null
}

export function isImageMime(mime, name = '') {
  if ((mime || '').startsWith('image/')) return true
  return /\.(jpe?g|png|webp|gif|heic|heif|bmp|avif)$/i.test(String(name || ''))
}

/** Все рабочие URL для одного вложения (не выкидывать фото из галереи) */
export function attachmentImageCandidates(a) {
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

export function bindImgCandidates(img, candidates) {
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
export function bindFileDownload(anchor, originalUrl, fileName) {
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

export function looksLikeHwImage(a) {
  return (
    isImageMime(a.mime, a.name) ||
    isImageMime('', a.url || '') ||
    isImageMime('', a.candidates?.[0] || '')
  )
}

/** Список фото-кандидатов из attachments (+ legacy images) — как в сетке превью. */
export function collectHwPhotoEntries(attachments, legacyImages) {
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
export function renderHwAttachments(attachments, legacyImages, galleryCtx = null) {
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

export function closeHwLightbox({ animate = true } = {}) {
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

export function openHwLightbox(urlsOrCandidates, startIndex = 0) {
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
