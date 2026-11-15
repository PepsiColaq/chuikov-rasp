// Экран «Расписание»: день, неделя, календарь на месяц и построение.
//
// Самый крупный экран приложения. Вынесен вместе с построением
// (это часть того же экрана, а не отдельная фича).
//
// Функции ядра (render, переход по вкладкам, обновление панелей) зовутся
// через мост app/hub.js — иначе получился бы циклический импорт.

import { WEEK_MAX, state } from '../lib/app-state.js'
import { flash, hapticTap, motionOk, textNode } from '../lib/ui-feedback.js'
import { DAY_SWAP_MOTION, FORMATION_SKIP_SUBJECT, HW_EMPTY_QUIET, HW_TAB_BY_DAY, PROFILE_AVATARS } from '../lib/constants.js'
import { collectHwPhotoEntries, renderHwAttachments } from '../features/lightbox.js'
import { addHomework, deleteHomework, getAppSettings, getGroup, getHomework, getLessons, getOverridesForDate, getSession, getSessionInfo, getSessionLessons, isRemoteMode, lessonsForDate, resolveLesson, uploadHomeworkFiles } from '../lib/store.js'
import { el } from '../lib/security.js'
import { DAY_NAMES, DAY_SHORT, breakMinutes } from '../data/seed.js'
import { canGradeGroup, formationAutofill, getFormationDay, listStudents, setFormationCancelled, setFormationMark } from '../lib/journal.js'
import { markStampLine, personRest, personSurname, reportStampLine } from '../journal-ui.js'
import { hub } from '../app/hub.js'
import { isInitialDataLoading } from '../app/loading-state.js'

// Эти функции живут в main.js — зовём их через мост, а не импортом (иначе цикл).
const calendarDateForWeekday = (...args) => hub.calendarDateForWeekday(...args)
const canEdit = (...args) => hub.canEdit(...args)
const dateForWeekday = (...args) => hub.dateForWeekday(...args)
const daySwapPanelClass = (...args) => hub.daySwapPanelClass(...args)
const facultyFromName = (...args) => hub.facultyFromName(...args)
const formatDateRu = (...args) => hub.formatDateRu(...args)
const hhmmToMinutes = (...args) => hub.hhmmToMinutes(...args)
const humanMins = (...args) => hub.humanMins(...args)
const nowMinutesOfDay = (...args) => hub.nowMinutesOfDay(...args)
const refreshTabPanes = (...args) => hub.refreshTabPanes(...args)
const render = (...args) => hub.render(...args)
const roomLink = (...args) => hub.roomLink(...args)
const shortSubjectLabel = (...args) => hub.shortSubjectLabel(...args)
const softRefreshCurrentTab = (...args) => hub.softRefreshCurrentTab(...args)
const softUpdateNav = (...args) => hub.softUpdateNav(...args)
const subtractMinutes = (...args) => hub.subtractMinutes(...args)
const todayISO = (...args) => hub.todayISO(...args)
const weekRangeLabel = (...args) => hub.weekRangeLabel(...args)
const weekdayNumFromIso = (...args) => hub.weekdayNumFromIso(...args)
const withTabScrollPreserved = (...args) => hub.withTabScrollPreserved(...args)

/**
 * Статус «сейчас / дальше» для сегодняшнего дня.
 * @returns {{ kind:'now'|'next'|'done', lesson?: object, view?: object, minsLeft?: number, minsUntil?: number, progress?: number } | null}
 */
export function getScheduleNowStatus(groupId, dateStr, lessons) {
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

/** Замена ещё актуальна для вкладки «Замены» (будущие + сегодня до конца пары). На «Пара́х» показывается всегда. */
export function overrideIsActiveForList(o, lesson) {
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

/**
 * Срок «на следующую пару» этого предмета: ближайшая дата, когда предмет снова в расписании группы
 * (строго после сегодня; если сегодня — после текущего слота).
 */
export function dueDateForNextLesson(groupId, lesson) {
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

export function ensureOverrideDraft() {
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

/**
 * Строка «Сейчас / Дальше» над расписанием.
 * Только для сегодняшнего дня: для пятницы в понедельник отсчёт «через 7 часов»
 * был бы бессмыслицей — до неё не 7 часов, а четыре дня.
 */
export function renderNowStrip(status, formation = null, dateStr = '') {
  if (!dateStr || dateStr !== todayISO()) return null
  if (formation?.show && !formation.skipped) {
    const formMin = hhmmToMinutes(formation.formStart)
    const until = formMin == null ? null : formMin - nowMinutesOfDay()
    if (until != null && until > 0) {
      return el('div', { className: 'now-strip now-strip-next', dataset: { nowStrip: '1' } }, [
        el('p', {
          className: 'now-strip-text',
          text: `Дальше · Построение · через ${humanMins(until)} (${formation.formStart})`,
        }),
      ])
    }
  }
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
        text: `Сейчас · ${subject} · до конца ${humanMins(status.minsLeft)}`,
      }),
      bar,
    ])
  }
  if (status.kind === 'next') {
    return el('div', { className: 'now-strip now-strip-next', dataset: { nowStrip: '1' } }, [
      el('p', {
        className: 'now-strip-text',
        text: `Дальше · ${subject} · через ${humanMins(status.minsUntil)}`,
      }),
    ])
  }
  return null
}

export function renderDays() {
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
            const prev = state.day
            if (d === prev) return
            if (DAY_SWAP_MOTION && motionOk()) {
              state.daySwap = d > prev ? 'right' : 'left'
            } else {
              state.daySwap = null
            }
            state.day = d
            if (isHwView() && HW_TAB_BY_DAY) state.hwDaySeek = { notify: true }
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

export function lessonMeta(lesson, view) {
  if (view.cancelled) {
    return el('div', { className: 'lesson-meta' }, [
      el('span', { className: 'badge warn', text: 'пары не будет' }),
    ])
  }
  if (view.overrideType === 'room_only') {
    return el('div', { className: 'lesson-meta' }, [
      el('span', { className: 'strike', text: `ауд. ${view.oldRoom || '—'}` }),
      textNode(' → '),
      roomLink(view.effectiveRoom) || textNode(`ауд. ${view.effectiveRoom} `),
      el('span', { className: 'badge warn', text: 'замена' }),
    ])
  }
  if (view.overrideType === 'subject' || view.overrideType === 'subject_and_room') {
    return el('div', { className: 'lesson-meta' }, [
      textNode(view.oldSubject ? `было: ${view.oldSubject}` : ''),
      view.effectiveRoom ? textNode(' · ') : textNode(' '),
      view.effectiveRoom ? roomLink(view.effectiveRoom) : null,
      el('span', { className: 'badge warn', text: 'замена' }),
    ])
  }
  if (lesson.remote) {
    return el('div', { className: 'lesson-meta' }, [
      el('span', { className: 'badge remote', text: 'дистант / онлайн' }),
      lesson.teacher ? textNode(` · ${lesson.teacher}`) : null,
    ])
  }
  const nodes = []
  const link = roomLink(view.effectiveRoom)
  if (link) nodes.push(link)
  if (lesson.teacher) nodes.push(textNode(`${link ? ' · ' : ''}${lesson.teacher}`))
  return el(
    'div',
    { className: 'lesson-meta' },
    nodes.length ? nodes : [textNode('кабинет не указан')],
  )
}

export function renderAddHwInline(groupId, lesson) {
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

export function hwAuthorKey(h) {
  const code = String(h?.authorCodeId || '').trim()
  if (code) return `c:${code}`
  const label = String(h?.authorLabel || '').trim().toLowerCase()
  if (label && !/^староста$/i.test(label)) return `l:${label}`
  return `id:${h?.id || Math.random()}`
}

/** Один автор — один аватар, под ним все его задания подряд. */
export function groupHomeworkByAuthor(list) {
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

export function renderInlineHwGroups(hwList, groupId, editor) {
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
          h.text && h.text.trim() ? linkifyHwText(h.text, 'hw-inline-text') : null,
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

export function renderLessonCard(lesson, dateStr, groupId, opts = {}) {
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
  const journalLink =
    editor && !view.cancelled && canGradeGroup(getSession(), groupId)
      ? el('button', {
          type: 'button',
          className: 'lesson-journal-link',
          text: 'Журнал',
          onClick: (e) => {
            e.stopPropagation()
            state.journal = {
              groupId,
              date: dateStr,
              lessonId: lesson.id,
              start: lesson.start,
              end: lesson.end,
              subject: view.effectiveSubject || lesson.subject,
            }
            render()
          },
        })
      : null
  const timeSide = el('div', { className: 'lesson-side' }, [
    el('div', { className: 'lesson-time', text: `${lesson.start}–${lesson.end}` }),
    journalLink,
  ])
  if (isLive) {
    kids.push(
      el('div', { className: 'lesson-top' }, [
        el('span', { className: 'lesson-live-badge', text: 'идёт' }),
        timeSide,
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
        timeSide,
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

export function isFormationSkipHw(h) {
  return h && h.subject === FORMATION_SKIP_SUBJECT
}

export function isLessonInPerson(lesson, view) {
  if (!lesson || view?.cancelled) return false
  if (lesson.remote) return false
  return true
}

/** Факультет группы: поле faculty, а если оно пустое — по названию. */
export function facultyOfGroup(group) {
  const raw = String(group?.faculty || '').trim().toUpperCase()
  if (raw) return raw
  return String(facultyFromName(group?.name || '')).toUpperCase()
}

/**
 * Есть ли у группы построение.
 * Список факультетов приходит из настроек сайта: по умолчанию ПД и МЧС.
 * Сравниваем и по факультету, и по названию — в базе faculty бывает пустым.
 */
export function groupHasFormation(group) {
  if (!group) return false
  const settings = getAppSettings()
  const allowed = (settings.formationFaculties || []).map((x) => String(x).toUpperCase())
  if (!allowed.length) return false
  const byField = String(group.faculty || '').toUpperCase()
  if (byField && allowed.includes(byField)) return true
  const name = String(group.name || '').toUpperCase()
  return allowed.some((f) => f && name.includes(f))
}

/** Построение: за несколько минут до первой очной (не отменённой) пары. */
export function resolveFormation(groupId, dateStr, lessons) {
  const group = getGroup(groupId)
  if (!groupHasFormation(group)) {
    return { show: false, reason: 'faculty' }
  }
  // В сессию построений нет: на экзаменационный день карточка только мешает.
  if ((lessons || []).length && lessons.every((l) => l.session)) {
    return { show: false, reason: 'session' }
  }
  const overs = getOverridesForDate(groupId, dateStr)
  const inPerson = (lessons || []).filter((l) => {
    const ov = overs.find((o) => o.lessonId === l.id)
    return isLessonInPerson(l, resolveLesson(l, ov))
  })
  if (!inPerson.length) {
    return { show: false, reason: 'no_campus' }
  }
  const settings = getAppSettings()
  const lead = Number.isFinite(Number(settings.formationAutofillMinutes))
    ? Math.max(0, Math.min(120, Number(settings.formationAutofillMinutes)))
    : 15
  const anchor = inPerson[0]
  return {
    show: true,
    // Отмену подтягиваем из formation_days асинхронно (см. state.formationDay).
    skipped: !!state.formationDay?.cancelled,
    note: state.formationDay?.note || '',
    anchorStart: anchor.start,
    formStart: subtractMinutes(anchor.start, lead),
    anchorSubject: anchor.subject,
    leadMinutes: lead,
  }
}

export function renderFormationCard(groupId, dateStr, formation) {
  if (!formation?.show || !formation.formStart) return null
  const editable = canEdit(groupId)

  const toggle = async (cancelled) => {
    try {
      const res = await setFormationCancelled(groupId, dateStr, cancelled, '')
      state.formationDay = { cancelled: !!res?.cancelled, note: '', canEdit: true, marks: [] }
      flash(cancelled ? 'Построение отменено на этот день' : 'Построение снова в расписании')
      render({ force: true })
    } catch (err) {
      flash(err.message, true)
    }
  }

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
            onClick: () => void toggle(false),
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
          text: `плац · за ${formation.leadMinutes ?? 15} мин до первой очной пары (${formation.anchorStart})`,
        }),
      ]),
      el('div', { className: 'lesson-time', text: formation.formStart }),
    ]),
    editable
      ? el('div', { className: 'formation-actions' }, [
          el('button', {
            type: 'button',
            className: 'btn secondary',
            style: 'margin-top:10px',
            text: 'Отменить построение',
            onClick: () => void toggle(true),
          }),
          el('button', {
            type: 'button',
            className: 'btn',
            style: 'margin-top:10px',
            text: 'Расход построения',
            onClick: () => {
              state.formationMarks = {
                groupId,
                date: dateStr,
                formStart: formation.formStart,
                anchorStart: formation.anchorStart,
              }
              render({ force: true })
            },
          }),
        ])
      : null,
  ])
}

export function loadFormationDay(groupId, dateStr) {
  const key = `${groupId}|${dateStr}`
  if (formationLoadKey === key) return
  formationLoadKey = key
  const session = getSession()
  if (!session?.token) {
    state.formationDay = { cancelled: false, note: '', canEdit: false, marks: [] }
    return
  }
  getFormationDay(groupId, dateStr)
    .then((day) => {
      if (formationLoadKey !== key) return
      const before = state.formationDay?.cancelled
      state.formationDay = day
      if (before !== day.cancelled) softRefreshCurrentTab()
    })
    .catch(() => {
      formationLoadKey = ''
    })
}

/** Экран расхода построения: явка на построение + текст для чата. */
export function renderFormationMarksOverlay() {
  const spec = state.formationMarks
  if (!spec) return null
  const session = getSession()
  if (!session?.token) {
    state.formationMarks = null
    return null
  }
  const group = getGroup(spec.groupId)
  const close = () => {
    state.formationMarks = null
    render({ force: true })
  }

  const root = el('div', { className: 'journal-overlay' })
  root.append(
    el('button', {
      type: 'button',
      className: 'journal-backdrop',
      'aria-label': 'Закрыть',
      onClick: close,
    }),
  )
  const sheet = el('div', { className: 'journal-sheet' })
  const head = el('div', { className: 'journal-head' }, [
    el('button', { type: 'button', className: 'journal-back', text: '← Назад', onClick: close }),
    el('div', { className: 'journal-head-text' }, [
      el('p', {
        className: 'muted journal-kicker',
        text: `${group?.name || 'Группа'} · ${formatDateRu(spec.date)}`,
      }),
      el('h2', { text: 'Расход построения' }),
      el('p', { className: 'muted', text: `${spec.formStart} · до пары в ${spec.anchorStart}` }),
    ]),
  ])
  const tools = el('div', { className: 'journal-tools' })
  const list = el('div', { className: 'journal-list', text: 'Загружаем…' })
  sheet.append(head, tools, list)
  root.append(sheet)

  const paint = async () => {
    try {
      // Автоотметка: сервер сам решит, наступило ли время и включён ли режим.
      if (!spec.autoChecked) {
        spec.autoChecked = true
        const auto = await formationAutofill(spec.groupId, spec.date)
        if (auto?.filled > 0) {
          flash(`Автоотметка: «н» поставили ${auto.filled} чел.`)
        }
      }
      const [students, day] = await Promise.all([
        listStudents(spec.groupId),
        getFormationDay(spec.groupId, spec.date),
      ])
      if (day.cancelled) {
        state.formationMarks = null
        flash('Построение отменено — расхода нет', true)
        render({ force: true })
        return
      }
      const byStudent = new Map(
        (day.marks || []).map((m) => [
          m.studentId,
          {
            attendance: m.attendance || '',
            comment: m.comment || '',
            author: m.author || '',
            updatedAt: m.updatedAt || '',
          },
        ]),
      )
      paintFormationTools(spec, group, students, byStudent, tools, paint)
      paintFormationRows(spec, students, byStudent, list, paint)
    } catch (err) {
      list.replaceChildren(
        el('p', {
          className: 'muted',
          text: err.message || 'Не удалось открыть расход. Выполни supabase/journal_v2.sql.',
        }),
      )
    }
  }
  void paint()
  return root
}

export function paintFormationTools(spec, group, students, byStudent, tools, reload) {
  tools.replaceChildren()
  const links = el('div', { className: 'journal-links' })
  const stamp = reportStampLine([...byStudent.values()], students.length)
  links.append(
    el('button', {
      type: 'button',
      className: 'journal-link',
      text: 'Текст расхода',
      onClick: async () => {
        const present = students.filter((s) => byStudent.get(s.id)?.attendance === 'present')
        const absent = students.filter((s) => byStudent.get(s.id)?.attendance === 'absent')
        const unmarked = students.filter((s) => !byStudent.get(s.id)?.attendance)
        const lines = [
          `Построение ${group?.name || ''} · ${formatDateRu(spec.date)}:`,
        ]
        if (stamp) lines.push(stamp)
        lines.push(
          `По списку: ${students.length}`,
          `На построении: ${present.length}`,
        )
        if (unmarked.length) lines.push(`Не отмечены: ${unmarked.length}`)
        if (absent.length) {
          lines.push(`Отсутствуют: ${absent.length}`)
          for (const s of absent) {
            const reason = (byStudent.get(s.id)?.comment || '').trim()
            lines.push(reason ? `${s.surname} (${reason})` : s.surname)
          }
        } else {
          lines.push('Отсутствуют: 0')
        }
        const text = lines.join('\n')
        try {
          await navigator.clipboard.writeText(text)
          flash('Текст расхода скопирован')
        } catch {
          flash(text)
        }
      },
    }),
  )
  tools.append(
    links,
    stamp ? el('p', { className: 'journal-report-stamp', text: stamp }) : null,
    el('p', {
      className: 'muted journal-hint',
      text: 'Отмечай только построение. Оценки и пары — в журнале пары.',
    }),
  )
}

export function paintFormationRows(spec, students, byStudent, list, reload) {
  list.replaceChildren()
  if (!students.length) {
    list.append(el('p', { className: 'muted', text: 'В этой группе пока нет студентов.' }))
    return
  }
  const repaint = () => paintFormationRows(spec, students, byStudent, list, reload)
  students.forEach((student, index) => {
    const mark = byStudent.get(student.id) || { attendance: '', comment: '', author: '', updatedAt: '' }
    const save = async (attendance) => {
      const next = attendance === mark.attendance ? '' : attendance
      // Причина нужна только когда человек отсутствует. Если вернули «+» —
      // старую причину стираем, чтобы она не висела у явившегося.
      const keepComment = next && next !== 'present' ? mark.comment || '' : ''
      byStudent.set(student.id, { ...mark, attendance: next, comment: keepComment })
      repaint()
      try {
        const saved = await setFormationMark(student.id, spec.date, next, keepComment)
        const cur = byStudent.get(student.id)
        if (cur) {
          if (saved?.author) cur.author = saved.author
          if (saved?.updatedAt) cur.updatedAt = saved.updatedAt
          if (saved?.deleted) {
            cur.author = ''
            cur.updatedAt = ''
          }
        }
        repaint()
      } catch (err) {
        byStudent.set(student.id, mark)
        flash(err.message, true)
        repaint()
      }
    }
    const seg = el('div', { className: 'seg' })
    for (const [id, label] of [
      ['present', '+'],
      ['absent', 'н'],
      ['sick', 'б'],
    ]) {
      seg.append(
        el('button', {
          type: 'button',
          className: mark.attendance === id ? 'on' : '',
          text: label,
          onClick: (e) => {
            e.currentTarget.blur()
            void save(id)
          },
        }),
      )
    }
    // «Причина» есть только у отсутствия: у «+» её быть не может.
    const needsReason = !!mark.attendance && mark.attendance !== 'present'
    const comment = needsReason
      ? el('input', {
          maxlength: '200',
          placeholder: 'Причина',
          value: mark.comment || '',
        })
      : null
    if (comment) {
      comment.addEventListener('change', async () => {
        const value = comment.value
        byStudent.set(student.id, { ...mark, comment: value })
        try {
          await setFormationMark(student.id, spec.date, mark.attendance || '', value)
        } catch (err) {
          flash(err.message, true)
        }
      })
    }
    const stampText = markStampLine({ author: mark.author, updatedAt: mark.updatedAt })
    list.append(
      el('article', { className: 'journal-row' }, [
        el('span', { className: 'journal-num', text: String(index + 1) }),
        el('div', { className: 'journal-person' }, [
          el('strong', { text: personSurname(student) }),
          personRest(student) ? el('span', { className: 'muted', text: personRest(student) }) : null,
          stampText ? el('span', { className: 'journal-stamp', text: stampText }) : null,
        ]),
        el('div', { className: 'journal-controls' }, [seg, comment]),
      ]),
    )
  })
}

export function renderSchedule() {
  const group = getGroup(state.groupId)
  const dateStr = dateForWeekday(state.day)
  // В сессию на дате стоят «свои» пары — недельный шаблон на этот день не показываем.
  const lessons = group ? lessonsForDate(group.id, dateStr) : []
  const sessionMode = !!(group && getSessionLessons(group.id, dateStr).length)
  loadFormationDay(group.id, dateStr)
  const nowStatus = getScheduleNowStatus(group.id, dateStr, lessons)
  const liveId = nowStatus?.kind === 'now' ? nowStatus.lesson?.id : null
  const frag = el('div', { className: daySwapPanelClass('panel') }, [
    el('p', {
      className: 'muted',
      text: `${DAY_NAMES[state.day] || ''} · ${formatDateRu(dateStr)}`,
    }),
  ])

  if (sessionMode) {
    const info = getSessionInfo()
    frag.append(
      el('div', { className: 'schedule-session-note' }, [
        el('span', { className: 'schedule-session-badge', text: 'Сессия' }),
        el('span', {
          className: 'muted',
          text: info.label || 'расписание экзаменов на эту дату',
        }),
      ]),
    )
  }

  // Построение: за N мин до первой очной пары (учитывает отмены и дистант).
  const formation = resolveFormation(group.id, dateStr, lessons)

  const strip = renderNowStrip(nowStatus, formation, dateStr)
  if (strip) frag.append(strip)

  if (!lessons.length) {
    frag.append(el('div', { className: 'empty', text: 'В этот день пар нет' }))
    return frag
  }

  if (formation) {
    const card = renderFormationCard(group.id, dateStr, formation)
    if (card) {
      frag.append(card)
      if (!formation.skipped) {
        frag.append(
          el('div', {
            className: 'break-line',
            text: `${formation.leadMinutes ?? 15} мин до пары`,
          }),
        )
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

/**
 * Календарь на месяц: сетка Пн–Вс, точки на днях с парами.
 * Клик по дню переключает расписание на его день недели и нужную неделю.
 */
export function renderMonthCalendar() {
  const group = getGroup(state.groupId)
  if (!group) return null

  const now = new Date()
  const base = new Date(now.getFullYear(), now.getMonth() + Number(state.calendarMonthOffset || 0), 1)
  const year = base.getFullYear()
  const month = base.getMonth()

  const todayStr = todayISO()
  const monthTitle = base.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })

  // Понедельник — первый столбец. getDay(): 0 = Вс.
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const hasSat = getLessons(group.id, 6).length > 0

  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(el('span', { className: 'cal-cell is-empty' }))

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d, 12)
    const dow = date.getDay() || 7
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const isToday = iso === todayStr
    // Сессия может стоять и в субботу — приоритет у конкретной даты.
    const dayLessons = lessonsForDate(group.id, iso)
    const hasSession = dayLessons.some((l) => l.session)
    const isWeekend = !hasSession && (dow === 7 || (dow === 6 && !hasSat))
    const lessons = dayLessons
    const thisWeekStart = dateForWeekday(1, state.weekOffset)
    const selected = iso === dateForWeekday(state.day, state.weekOffset)

    // Сдвиг недели относительно «этой», чтобы клик открыл именно эту дату
    const diffDays = Math.round(
      (new Date(`${iso}T12:00:00`) - new Date(`${thisWeekStart}T12:00:00`)) / 86400000,
    )
    const weekOffset = Math.round(diffDays / 7)

    cells.push(
      el(
        'button',
        {
          type: 'button',
          className: [
            'cal-cell',
            isToday ? 'is-today' : '',
            selected ? 'is-selected' : '',
            isWeekend ? 'is-weekend' : '',
            hasSession ? 'is-session' : '',
            lessons.length ? 'has-lessons' : '',
          ]
            .filter(Boolean)
            .join(' '),
          onClick: () => {
            if (isWeekend) return
            hapticTap()
            state.weekOffset = weekOffset
            state.day = dow
            state.calendarOpen = false
            if (!refreshTabPanes(['schedule'])) render({ force: true })
            else softUpdateNav()
          },
        },
        [
          el('span', { className: 'cal-day', text: String(d) }),
          lessons.length ? el('span', { className: 'cal-dot' }) : null,
        ],
      ),
    )
  }

  // Пустые клетки в конце, чтобы сетка не «рвалась»
  while (cells.length % 7 !== 0) cells.push(el('span', { className: 'cal-cell is-empty' }))

  const shift = (delta) => {
    state.calendarMonthOffset = Number(state.calendarMonthOffset || 0) + delta
    if (!refreshTabPanes(['schedule'])) render({ force: true })
    else softUpdateNav()
  }

  return el('div', { className: 'card cal-card' }, [
    el('div', { className: 'cal-head' }, [
      el('button', {
        type: 'button',
        className: 'cal-nav',
        text: '‹',
        title: 'Прошлый месяц',
        onClick: () => shift(-1),
      }),
      el('span', { className: 'cal-title', text: monthTitle }),
      el('button', {
        type: 'button',
        className: 'cal-nav',
        text: '›',
        title: 'Следующий месяц',
        onClick: () => shift(1),
      }),
    ]),
    el(
      'div',
      { className: 'cal-dow' },
      ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((n) =>
        el('span', { className: 'cal-dow-cell', text: n }),
      ),
    ),
    el('div', { className: 'cal-grid' }, cells),
    el('p', {
      className: 'cal-hint muted',
      text: hasSat ? 'Точка — есть пары. Суббота в расписании есть.' : 'Точка — есть пары.',
    }),
  ])
}

export function renderHwTab() {
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
  if (isInitialDataLoading() && isRemoteMode() && !list.length) {
    const sk = el('div', { className: daySwapPanelClass('panel', { allow: !HW_TAB_BY_DAY }) }, [
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

  const panel = el('div', { className: daySwapPanelClass('panel', { allow: !HW_TAB_BY_DAY }) }, [
    el('p', {
      className: 'muted',
      text: `За ${weekRangeLabel().toLowerCase()}`,
    }),
  ])
  if (!list.length) {
    panel.append(
      el('div', {
        className: 'empty',
        text: 'На эту неделю ДЗ нет. Листай ← → или смотри вкладку «Расписание».',
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

/** Открыт ли сейчас список ДЗ (вкладка «Учёба» в режиме «Домашка»). */
export function isHwView() {
  return state.tab === 'grades' && state.studyMode === 'hw'
}

export function maybeSeekHwDay() {
  // Прыжок к дню — только по явному нажатию на день (notify: true), не при открытии вкладки
  if (!HW_TAB_BY_DAY || !isHwView()) {
    state.hwDaySeek = null
    return
  }
  const seek = state.hwDaySeek
  state.hwDaySeek = null
  if (!seek || !seek.notify) return

  const day = state.day
  const pane = document.querySelector('#tab-stage .tab-pane[data-tab="grades"]')
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

export function renderHwToggleAvatar(h) {
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

export function renderAuthorChip(h) {
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

/** Текст ДЗ: http(s)/www → кликабельные ссылки, без вылезания за рамку. */
export function linkifyHwText(raw, className = 'hw-text') {
  const s = String(raw || '')
  if (!s.trim()) return null
  const re = /(https?:\/\/[^\s<]+)|(www\.[^\s<]+)/gi
  const kids = []
  let last = 0
  for (const m of s.matchAll(re)) {
    if (m.index > last) kids.push(s.slice(last, m.index))
    let url = m[0]
    let trail = ''
    while (url && /[.,);:!?»"'\]}>]$/.test(url)) {
      trail = url.slice(-1) + trail
      url = url.slice(0, -1)
    }
    const href = url.startsWith('www.') ? `https://${url}` : url
    try {
      const u = new URL(href)
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        kids.push(
          el('a', {
            href: u.href,
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'hw-link',
            text: url,
          }),
        )
        if (trail) kids.push(trail)
      } else {
        kids.push(m[0])
      }
    } catch {
      kids.push(m[0])
    }
    last = m.index + m[0].length
  }
  if (last < s.length) kids.push(s.slice(last))
  return el('p', { className }, kids.length ? kids : [s])
}

export function renderHwCard(h, { showDue = true, groupId = '', canDelete = false } = {}) {
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
    h.text && h.text.trim() ? linkifyHwText(h.text, 'hw-text') : null,
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

/** Подтянуть статус построения дня (отмена + расход) без блокировки UI. */
let formationLoadKey = ''
