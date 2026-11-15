// Образовательные программы: список, читалка и редактор.
//
// Программы ведут старосты и админы; читалка общая для всех.
// Картинки и видео берутся из тех же файлов, что и вложения к ДЗ.

import { state } from '../lib/app-state.js'
import { MAX_NEWS_PHOTOS, PROGRAM_KINDS } from '../lib/constants.js'
import { hapticTap, motionOk, showToast } from '../lib/ui-feedback.js'
import { closeHwLightbox, openHwLightbox } from './lightbox.js'
import { attachCardSwipe, createReaderShell, lockReaderScroll, mountReaderCards, scrollReaderTo, splitNewsMedia, unlockReaderScroll } from './news.js'
import { deleteProgram, getPrograms, getSession, moveProgram, refreshPrograms, saveProgram, uploadHomeworkFiles } from '../lib/store.js'
import { el } from '../lib/security.js'
import { hub } from '../app/hub.js'

// Эти функции живут в main.js — зовём их через мост, а не импортом (иначе цикл).
const canEdit = (...args) => hub.canEdit(...args)
const openImageCropEditor = (...args) => hub.openImageCropEditor(...args)
const programsLoaded = (...args) => hub.programsLoaded(...args)
const refreshTabPanes = (...args) => hub.refreshTabPanes(...args)
const render = (...args) => hub.render(...args)

export function programImages(item) {
  return (item.attachments || []).filter(
    (a) => /^image\//i.test(a.mime || '') || /\.(jpe?g|png|webp|gif)$/i.test(a.url || ''),
  )
}

/** Видео можно указать относительным путём — тогда файл лежит в public/. */
export function programVideoSrc(url) {
  const u = String(url || '').trim()
  if (!u) return ''
  if (/^https?:\/\//i.test(u)) return u
  const base = import.meta.env.BASE_URL || '/chuikov-rasp/'
  return `${base}${u.replace(/^\/+/, '')}`
}

/** Кто может добавлять и править программы: админ, куратор, староста. */
export function canManagePrograms() {
  const s = getSession()
  if (!s) return false
  if (s.role === 'admin' || s.role === 'curator') return true
  return canEdit(state.groupId)
}

/** Программа, добавленная старостой, видна только его группе; админ и куратор — всем. */
export function programGroupId() {
  const s = getSession()
  if (!s) return null
  if (s.role === 'admin' || s.role === 'curator') return null
  return state.groupId || null
}

export function programMetaLine(item) {
  return [item.duration, item.price].filter(Boolean).join(' · ')
}

export function emptyProgramDraft(kind) {
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

export function renderPrograms(kind, { standalone = false } = {}) {
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
export function openProgramReader(items, startIndex = 0, kind = 'dpo') {
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
export function renderProgramEditor(kind) {
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
