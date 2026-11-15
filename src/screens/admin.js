// Админ-панель: коды доступа, доп. админы, поддержка, настройки сайта,
// группы, статистика и журнал событий.
//
// Это самая большая функция в проекте была renderAdminPanel — 1269 строк
// в одном теле. Теперь она здесь, вместе с секциями и разбором журнала.

import { SELECTED_GROUP_KEY, state } from '../lib/app-state.js'
import { ensureOverrideDraft, overrideIsActiveForList } from './schedule.js'
import { flash, motionOk, showToast } from '../lib/ui-feedback.js'
import { ATT_LABEL, AUDIT_FILTERS, AUDIT_TITLES } from '../lib/constants.js'
import { el } from '../lib/security.js'
import { ALL_GROUPS_ID, addStarostaCode, banStarostaCode, cleanupOldData, clearOverride, createGroup, deactivateGroup, deleteAllSupportTickets, deleteSessionBatch, deleteSupportTicket, fetchAuditLog, fetchSiteStats, fetchSupportTickets, findFreeRooms, getAppSettings, getDb, getGroup, getLessons, getSession, getSessionInfo, importSessionLessons, isSiteEnabled, listDayPairSlots, listGroups, listStarostaCodes, renameStarostaLabel, replySupportTicket, resetSemester, revokeStarostaCode, setAdminDisplayName, setAppSettings, setCodeFreeRooms, setOverride, setSiteEnabled, setStarostaRoleTitle, unbanStarostaCode, undoAudit } from '../lib/store.js'
import { DAY_NAMES } from '../data/seed.js'
import { searchGroups } from '../lib/group-match.js'
import { groupByDate, parseScheduleBook, resolveShift } from '../lib/schedule-import.js'
import { readXlsx } from '../lib/xlsx.js'
import { addAdmin, curatorCreate, curatorRevoke, curatorsList, listAdmins, newStudentCode, revokeAdmin } from '../lib/journal.js'
import { privacyParagraphs, termsParagraphs } from '../lib/legal.js'
import { hub } from '../app/hub.js'

// Эти функции живут в main.js — зовём их через мост, а не импортом (иначе цикл).
const auditDate = (...args) => hub.auditDate(...args)
const canEdit = (...args) => hub.canEdit(...args)
const formatDateRu = (...args) => hub.formatDateRu(...args)
const homeNoLessonsText = (...args) => hub.homeNoLessonsText(...args)
const normalizePeopleQuery = (...args) => hub.normalizePeopleQuery(...args)
const pickGroupWithFeel = (...args) => hub.pickGroupWithFeel(...args)
const refreshTabPanes = (...args) => hub.refreshTabPanes(...args)
const render = (...args) => hub.render(...args)
const resolveFreeRoomsSlotKey = (...args) => hub.resolveFreeRoomsSlotKey(...args)
const roleRu = (...args) => hub.roleRu(...args)
const softUpdateNav = (...args) => hub.softUpdateNav(...args)
const stripIds = (...args) => hub.stripIds(...args)
const teacherDateLabel = (...args) => hub.teacherDateLabel(...args)
const todayISO = (...args) => hub.todayISO(...args)
const typeLabel = (...args) => hub.typeLabel(...args)
const weekdayFromISO = (...args) => hub.weekdayFromISO(...args)
const withTabScrollPreserved = (...args) => hub.withTabScrollPreserved(...args)

export function renderAdminFreeRooms() {
  if (!state.freeRoomsDate) state.freeRoomsDate = todayISO()
  const wrap = el('div', { className: 'admin-free-rooms' })
  const results = el('div', { className: 'teacher-results' })
  const dateInput = el('input', {
    type: 'date',
    value: state.freeRoomsDate,
  })
  const dateLabel = el('label', { text: teacherDateLabel(state.freeRoomsDate) })
  const slotRow = el('div', { className: 'due-quick free-rooms-slots' })

  const paint = () => {
    state.freeRoomsDate = dateInput.value || todayISO()
    dateLabel.textContent = teacherDateLabel(state.freeRoomsDate)
    const slots = listDayPairSlots(state.freeRoomsDate)

    if (state.freeRoomsNow || !state.freeRoomsSlot) {
      state.freeRoomsSlot = resolveFreeRoomsSlotKey(state.freeRoomsDate, '')
    } else if (!slots.some((s) => s.key === state.freeRoomsSlot)) {
      state.freeRoomsSlot = resolveFreeRoomsSlotKey(state.freeRoomsDate, '')
      state.freeRoomsNow = state.freeRoomsDate === todayISO()
    }

    const nowKey =
      state.freeRoomsDate === todayISO() ? resolveFreeRoomsSlotKey(state.freeRoomsDate, '') : ''
    const nowActive = state.freeRoomsNow && state.freeRoomsDate === todayISO()

    slotRow.replaceChildren(
      el('button', {
        type: 'button',
        className: `chip${nowActive ? ' chip-active' : ''}`,
        text: 'Сейчас',
        disabled: state.freeRoomsDate !== todayISO() || !slots.length,
        onClick: () => {
          state.freeRoomsNow = true
          state.freeRoomsSlot = resolveFreeRoomsSlotKey(state.freeRoomsDate, '')
          paint()
        },
      }),
      ...slots.map((s, idx) =>
        el('button', {
          type: 'button',
          className: `chip${!nowActive && state.freeRoomsSlot === s.key ? ' chip-active' : ''}`,
          text: `${idx + 1} · ${s.start}–${s.end}${nowKey === s.key && state.freeRoomsDate === todayISO() ? ' · идёт' : ''}`,
          onClick: () => {
            state.freeRoomsNow = false
            state.freeRoomsSlot = s.key
            paint()
          },
        }),
      ),
    )

    results.replaceChildren()
    if (!slots.length || !state.freeRoomsSlot) {
      results.append(
        el('div', {
          className: 'empty',
          text:
            weekdayFromISO(state.freeRoomsDate) === 7
              ? 'В воскресенье пар в расписании нет.'
              : 'На этот день в расписании нет слотов пар.',
        }),
      )
      return
    }

    const [start, end] = String(state.freeRoomsSlot).split('|')
    const { dayNum, free } = findFreeRooms(state.freeRoomsDate, start, end)
    results.append(
      el('p', {
        className: 'muted',
        text: `${DAY_NAMES[dayNum] || ''} · ${formatDateRu(state.freeRoomsDate)} · ${start}–${end} · свободно: ${free.length}`,
      }),
    )

    if (free.length) {
      results.append(
        el(
          'div',
          { className: 'free-rooms-grid' },
          free.map((room) => el('div', { className: 'free-room-chip', text: room })),
        ),
      )
    } else {
      results.append(
        el('div', {
          className: 'empty',
          text: 'Свободных аудиторий в этом слоте нет (по расписанию).',
        }),
      )
    }
  }

  dateInput.addEventListener('change', () => {
    state.freeRoomsNow = dateInput.value === todayISO()
    state.freeRoomsSlot = ''
    paint()
  })

  wrap.append(
    el('p', {
      className: 'muted',
      style: 'margin:0 0 10px',
      text: 'По расписанию всех групп, с учётом замен. Это ориентир: мероприятия и закрытые кабинеты сайт не видит.',
    }),
    el('div', { className: 'field' }, [dateLabel, dateInput]),
    el('div', { className: 'due-quick' }, [
      el('button', {
        type: 'button',
        className: 'chip',
        text: 'Сегодня',
        onClick: () => {
          state.freeRoomsDate = todayISO()
          dateInput.value = state.freeRoomsDate
          state.freeRoomsNow = true
          state.freeRoomsSlot = ''
          paint()
        },
      }),
    ]),
    el('p', { className: 'muted', style: 'margin:10px 0 6px', text: 'Пара / слот' }),
    slotRow,
    results,
  )
  paint()
  return wrap
}

export function renderOverrideForm(groupId) {
  const draft = ensureOverrideDraft()
  const form = el('form', { className: 'card' })
  const date = el('input', { type: 'date', value: draft.date || todayISO(), required: true })

  const lessonSel = el('select', { required: true })
  const fillLessons = () => {
    const dayNum = weekdayFromISO(date.value)
    const lessons =
      dayNum == null ? [] : getLessons(groupId).filter((l) => Number(l.day) === dayNum)
    const prev = lessonSel.value || draft.lessonId || ''
    lessonSel.replaceChildren()
    lessonSel.append(
      el('option', {
        value: '',
        text: dayNum == null ? 'Сначала выберите дату' : lessons.length ? 'Выберите пару' : 'На этот день пар нет',
      }),
    )
    for (const l of lessons) {
      lessonSel.append(
        el('option', {
          value: l.id,
          text: `${l.start}–${l.end} · ${l.subject}${l.room ? ` · ауд. ${l.room}` : ''}`,
        }),
      )
    }
    if (prev && lessons.some((l) => l.id === prev)) lessonSel.value = prev
    else {
      lessonSel.value = ''
      draft.lessonId = ''
    }
  }
  fillLessons()

  const typeSel = el('select', {}, [
    el('option', { value: 'room_only', text: 'Только кабинет' }),
    el('option', { value: 'subject', text: 'Другая пара' }),
    el('option', { value: 'subject_and_room', text: 'Другая пара + кабинет' }),
    el('option', { value: 'cancelled', text: 'Пары не будет' }),
  ])
  typeSel.value = draft.type || 'room_only'
  const newSubject = el('input', {
    maxlength: '80',
    placeholder: 'Новый предмет',
    value: draft.newSubject || '',
  })
  const newRoom = el('input', {
    maxlength: '32',
    placeholder: 'Новый кабинет',
    value: draft.newRoom || '',
  })
  const note = el('input', {
    maxlength: '200',
    placeholder: 'Комментарий',
    value: draft.note || '',
  })

  const syncDraft = () => {
    draft.date = date.value
    draft.lessonId = lessonSel.value
    draft.type = typeSel.value
    draft.newSubject = newSubject.value
    draft.newRoom = newRoom.value
    draft.note = note.value
  }
  date.addEventListener('change', () => {
    fillLessons()
    syncDraft()
  })
  for (const node of [lessonSel, typeSel, newSubject, newRoom, note]) {
    node.addEventListener('input', syncDraft)
    node.addEventListener('change', syncDraft)
  }

  const dayNum = weekdayFromISO(date.value)
  const dayHint =
    dayNum && DAY_NAMES[dayNum]
      ? `Пары на ${DAY_NAMES[dayNum].toLowerCase()}`
      : 'Пара из расписания на выбранную дату'

  form.append(
    el('h3', { text: 'Добавить замену' }),
    el('div', { className: 'field' }, [el('label', { text: 'Дата' }), date]),
    el('div', { className: 'field' }, [el('label', { text: dayHint }), lessonSel]),
    el('div', { className: 'field' }, [el('label', { text: 'Тип' }), typeSel]),
    el('div', { className: 'field' }, [el('label', { text: 'Новый предмет' }), newSubject]),
    el('div', { className: 'field' }, [el('label', { text: 'Новый кабинет' }), newRoom]),
    el('div', { className: 'field' }, [el('label', { text: 'Заметка' }), note]),
    el('button', { className: 'btn', type: 'submit', text: 'Сохранить замену' }),
  )

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    syncDraft()
    try {
      await setOverride(groupId, {
        date: draft.date,
        lessonId: draft.lessonId,
        type: draft.type,
        newSubject: draft.newSubject,
        newRoom: draft.newRoom,
        note: draft.note,
      })
      state.overrideDraft = {
        date: draft.date,
        lessonId: '',
        type: 'room_only',
        newSubject: '',
        newRoom: '',
        note: '',
      }
      flash('Замена сохранена')
      render()
    } catch (err) {
      flash(err.message, true)
    }
  })
  return form
}

export function renderOverridesTab(group) {
  const panel = el('div', { className: 'panel' }, [])
  if (canEdit(group.id)) panel.append(renderOverrideForm(group.id))
  else {
    panel.append(
      el('p', {
        className: 'muted',
        text: 'Смотреть могут все. Вносить — после входа старосты.',
      }),
    )
  }

  const upcoming = getDb()
    .overrides.filter((o) => {
      if (o.groupId !== group.id) return false
      const lesson = getLessons(group.id).find((l) => l.id === o.lessonId)
      return overrideIsActiveForList(o, lesson)
    })
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)))

  if (!upcoming.length) {
    panel.append(
      el('div', {
        className: 'empty',
        text: 'Активных замен нет. Прошедшие не показываем здесь — в «Пара́х» на тот день отмена/замена всё ещё видна.',
      }),
    )
  } else {
    for (const o of upcoming) {
      const lesson = getLessons(group.id).find((l) => l.id === o.lessonId)
      panel.append(
        el('div', { className: 'card' }, [
          el('h3', { text: typeLabel(o.type) }),
          el('p', {
            className: 'muted',
            text: `${formatDateRu(o.date)} · ${lesson ? lesson.subject : 'пара'} · ${lesson ? `${lesson.start}–${lesson.end}` : ''}`,
          }),
          o.newSubject ? el('p', { text: `Новый предмет: ${o.newSubject}` }) : null,
          o.newRoom ? el('p', { text: `Кабинет: ${o.newRoom}` }) : null,
          canEdit(group.id)
            ? el('button', {
                type: 'button',
                className: 'btn secondary',
                text: 'Снять замену',
                onClick: async () => {
                  try {
                    await clearOverride(group.id, o.id)
                    flash('Замена снята')
                  } catch (err) {
                    flash(err.message, true)
                  }
                },
              })
            : null,
        ]),
      )
    }
  }
  return panel
}

export function renderGroupPicker() {
  const wrap = el('div', { className: 'panel' })
  const all = listGroups()
  const q = el('input', { type: 'search', placeholder: 'Поиск группы…' })
  const list = el('div', { className: 'group-list' })
  const paint = () => {
    list.replaceChildren()
    const query = q.value.trim()
    // Список — как раньше, но фильтр идёт по нормализованному ключу:
    // «0903пд5», «0903 пд 5», «0903-pd5» находят «0903-ПД5».
    let hits = query ? searchGroups(all, query) : []
    if (query) {
      // Сначала только те, где ключ запроса реально есть внутри названия.
      // «Похожие по опечатке» подмешиваем лишь если точных не нашлось.
      const strong = hits.filter((h) => h.why === 'exact' || h.why === 'prefix' || h.why === 'inside')
      if (strong.length) hits = strong
    }
    const rows = query ? hits.map((hit) => hit.group) : all
    for (const g of rows) {
      list.append(
        el(
          'button',
          {
            type: 'button',
            className: 'group-pick-btn',
            onClick: (e) => pickGroupWithFeel(g.id, e.currentTarget),
          },
          [
            el('strong', { text: g.name }),
            el('span', { text: g.faculty ? `Факультет ${g.faculty}` : ' ' }),
          ],
        ),
      )
    }
  }
  q.addEventListener('input', paint)
  paint()
  wrap.append(
    el('p', {
      className: 'muted',
      style: 'margin:0 0 10px',
      text: 'Выбери свою группу. Если нажал случайно — «Назад» справа сверху.',
    }),
    el('div', { className: 'search' }, [q]),
    list,
  )
  return wrap
}

export function isAdminSectionOpen(id) {
  return state.adminOpen instanceof Set && state.adminOpen.has(id)
}

export async function toggleAdminSection(id) {
  if (!(state.adminOpen instanceof Set)) state.adminOpen = new Set()
  const tabId = 'more'
  const wasOpen = state.adminOpen.has(id)

  if (!motionOk()) {
    if (wasOpen) state.adminOpen.delete(id)
    else state.adminOpen.add(id)
    withTabScrollPreserved(tabId, () => render({ force: true }))
    return
  }

  if (wasOpen) {
    const body = document.querySelector(`[data-admin-acc-body="${CSS.escape(String(id))}"]`)
    if (body?.classList.contains('admin-acc-anim')) {
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
    state.adminOpen.delete(id)
    state.adminExpandAnimId = null
    withTabScrollPreserved(tabId, () => render({ force: true }))
    return
  }

  state.adminOpen.add(id)
  state.adminExpandAnimId = id
  withTabScrollPreserved(tabId, () => render({ force: true }))
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const body = document.querySelector(`[data-admin-acc-body="${CSS.escape(String(id))}"]`)
      body?.classList.add('is-open')
      // Доскроллить к секции, если уехала вниз — но НЕ наверх страницы
      const sec = document.getElementById(`admin-acc-${id}`)
      if (sec) {
        try {
          sec.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        } catch {
          /* ignore */
        }
      }
      if (state.adminExpandAnimId === id) state.adminExpandAnimId = null
    })
  })
}

/** Секция админки: заголовок как у ДЗ — тап раскрывает содержимое */
export function wrapAdminAcc(id, title, bodyNodes) {
  const open = isAdminSectionOpen(id)
  const kids = Array.isArray(bodyNodes) ? bodyNodes : bodyNodes ? [bodyNodes] : []
  const head = el(
    'button',
    {
      type: 'button',
      className: `admin-acc-head${open ? ' is-open' : ''}`,
      'aria-expanded': open ? 'true' : 'false',
      onClick: () => {
        toggleAdminSection(id)
      },
    },
    [
      el('span', { className: 'admin-acc-title', text: title }),
      el('span', { className: 'admin-acc-mark', text: open ? '▾' : '▸', 'aria-hidden': 'true' }),
    ],
  )
  const block = el('div', {
    className: `admin-acc${open ? ' is-open' : ''}`,
    id: `admin-acc-${id}`,
  }, [head])
  if (open && kids.length) {
    if (motionOk()) {
      const opening = state.adminExpandAnimId === id
      block.append(
        el(
          'div',
          {
            className: opening ? 'admin-acc-anim' : 'admin-acc-anim is-open',
            dataset: { adminAccBody: String(id) },
          },
          [el('div', { className: 'admin-acc-clip' }, [el('div', { className: 'admin-acc-body' }, kids)])],
        ),
      )
    } else {
      block.append(el('div', { className: 'admin-acc-body' }, kids))
    }
  }
  return block
}

/** Обёртка «сохранить и перерисовать» с единой обработкой ошибок. */
export async function saveAppSettings(patch, okText) {
  try {
    await setAppSettings(patch)
    flash(okText || 'Сохранено')
    render({ force: true })
    if (refreshTabPanes(['home'])) softUpdateNav()
    return true
  } catch (err) {
    flash(err.message, true)
    return false
  }
}

/** Текст вместо «Пар нет» на главной + сколько его держать. */
export function renderHomeTextSettings() {
  const settings = getAppSettings()
  const input = el('input', {
    maxlength: '120',
    placeholder: 'Например: Каникулы до 8 февраля',
    value: settings.homeNoLessonsText || '',
  })
  // «Бессрочно» хранится пустой строкой; иначе пишем конкретный момент времени.
  const when = el('select', {})
  for (const [value, label] of [
    ['forever', 'Бессрочно (пока не сменишь)'],
    ['1', '1 час'],
    ['3', '3 часа'],
    ['day', 'До конца дня'],
    ['custom', 'До даты и времени'],
  ]) {
    const opt = el('option', { value, text: label })
    if (settings.homeNoLessonsUntil) {
      if (value === 'custom') opt.selected = true
    } else if (value === 'forever') {
      opt.selected = true
    }
    when.append(opt)
  }
  const custom = el('input', { type: 'datetime-local', value: '' })
  custom.style.display = settings.homeNoLessonsUntil ? '' : 'none'
  when.addEventListener('change', () => {
    custom.style.display = when.value === 'custom' ? '' : 'none'
  })
  if (settings.homeNoLessonsUntil) {
    const t = Date.parse(settings.homeNoLessonsUntil)
    if (Number.isFinite(t)) {
      const d = new Date(t)
      const pad = (n) => String(n).padStart(2, '0')
      custom.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
  }

  const computeUntil = () => {
    const now = Date.now()
    if (when.value === 'forever') return ''
    if (when.value === '1') return new Date(now + 3600 * 1000).toISOString()
    if (when.value === '3') return new Date(now + 3 * 3600 * 1000).toISOString()
    if (when.value === 'day') {
      const d = new Date()
      d.setHours(23, 59, 0, 0)
      return d.toISOString()
    }
    if (!custom.value) return ''
    const t = Date.parse(custom.value)
    return Number.isFinite(t) ? new Date(t).toISOString() : ''
  }

  const active = homeNoLessonsText()
  const status = el('p', {
    className: 'muted',
    style: 'margin:0;font-size:12.5px',
    text: settings.homeNoLessonsText
      ? active
        ? `Сейчас на главной: «${active}»${settings.homeNoLessonsUntil ? ` · до ${formatDateRu(String(settings.homeNoLessonsUntil).slice(0, 10))}` : ' · бессрочно'}`
        : 'Срок истёк — показывается обычное «Пар нет».'
      : 'Сейчас показывается обычное «Пар нет».',
  })

  const box = el('div', {}, [
    el('h3', { style: 'margin:0 0 6px;font-size:15px', text: 'Вместо «Пар нет»' }),
    el('p', {
      className: 'muted',
      style: 'margin:0 0 10px;font-size:12.5px',
      text: 'Свой текст на главной, когда на сегодня пар нет. Пустое поле — обычное «Пар нет».',
    }),
    el('div', { className: 'field' }, [el('label', { text: 'Текст' }), input]),
    el('div', { className: 'field' }, [el('label', { text: 'Сколько держать' }), when]),
    el('div', { className: 'field' }, [el('label', { text: 'До (дата и время)' }), custom]),
    el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, [
      el('button', {
        type: 'button',
        className: 'btn secondary',
        text: 'Сохранить',
        onClick: () =>
          saveAppSettings(
            { homeNoLessonsText: input.value || '', homeNoLessonsUntil: computeUntil() },
            'Текст на главной обновлён',
          ),
      }),
      el('button', {
        type: 'button',
        className: 'journal-link',
        text: 'Вернуть «Пар нет»',
        onClick: () => saveAppSettings({ homeNoLessonsText: '', homeNoLessonsUntil: '' }, 'Снова «Пар нет»'),
      }),
    ]),
    status,
  ])
  return box
}

/** Построения: факультеты, автоотметка, сколько минут до пары. */
export function renderFormationSettings() {
  const settings = getAppSettings()
  const facsInput = el('input', {
    maxlength: '80',
    placeholder: 'ПД, МЧС',
    value: (settings.formationFaculties || []).join(', '),
  })
  const minsInput = el('input', {
    type: 'number',
    min: '0',
    max: '120',
    inputmode: 'numeric',
    value: String(settings.formationAutofillMinutes ?? 15),
  })
  const autoBox = el('input', { type: 'checkbox' })
  autoBox.checked = !!settings.formationAutofill
  const needsBox = el('input', { type: 'checkbox' })
  needsBox.checked = settings.formationAutofillNeedsMarks !== false

  return el('div', {}, [
    el('h3', { style: 'margin:0 0 6px;font-size:15px', text: 'Построение' }),
    el('p', {
      className: 'muted',
      style: 'margin:0 0 10px;font-size:12.5px',
      text: 'Построение показывается только этим факультетам — по полю в базе или по названию группы.',
    }),
    el('div', { className: 'field' }, [el('label', { text: 'Факультеты (через запятую)' }), facsInput]),
    el('div', { className: 'field' }, [el('label', { text: 'Минут до первой пары' }), minsInput]),
    el('label', { className: 'admin-check' }, [
      autoBox,
      el('span', {
        text: 'Автоотметка: ставить «н» тем, кого не отметили вовремя',
      }),
    ]),
    el('label', { className: 'admin-check' }, [
      needsBox,
      el('span', { text: 'Страховка: только если староста уже начал отмечать' }),
    ]),
    el('p', {
      className: 'muted',
      style: 'margin:0 0 10px;font-size:12px',
      text: 'Автоотметка срабатывает на сегодняшнюю дату, когда наступило «минут до пары». Без страховки весь список может стать «н», если расход вообще не открывали.',
    }),
    el('button', {
      type: 'button',
      className: 'btn secondary',
      text: 'Сохранить построение',
      onClick: () =>
        saveAppSettings(
          {
            formationFaculties: facsInput.value
              .split(',')
              .map((x) => x.trim().toUpperCase())
              .filter(Boolean),
            formationAutofill: autoBox.checked,
            formationAutofillMinutes: Number(minsInput.value || 15),
            formationAutofillNeedsMarks: needsBox.checked,
          },
          'Настройки построения сохранены',
        ),
    }),
  ])
}

/** Сессия: подпись и границы — чтобы на главной было видно, что идёт сессия. */
export function renderSessionSettings() {
  const settings = getAppSettings()
  const info = getSessionInfo()
  const label = el('input', { maxlength: '60', placeholder: 'Зимняя сессия', value: settings.sessionLabel || '' })
  const start = el('input', { type: 'date', value: settings.sessionStart || '' })
  const end = el('input', { type: 'date', value: settings.sessionEnd || '' })

  return el('div', {}, [
    el('h3', { style: 'margin:0 0 6px;font-size:15px', text: 'Сессия' }),
    el('div', { className: 'field' }, [el('label', { text: 'Подпись' }), label]),
    el('div', { className: 'program-editor-pair' }, [
      el('div', { className: 'field' }, [el('label', { text: 'Начало' }), start]),
      el('div', { className: 'field' }, [el('label', { text: 'Конец' }), end]),
    ]),
    el('p', {
      className: 'muted',
      style: 'margin:0 0 10px;font-size:12.5px',
      text: info.count
        ? `Загружено пар: ${info.count}${info.start ? ` · ${formatDateRu(info.start)} — ${formatDateRu(info.end)}` : ''}`
        : 'Сессионных пар пока нет — загрузи Excel ниже.',
    }),
    el('button', {
      type: 'button',
      className: 'btn secondary',
      text: 'Сохранить сессию',
      onClick: () =>
        saveAppSettings(
          { sessionLabel: label.value || '', sessionStart: start.value || '', sessionEnd: end.value || '' },
          'Сессия сохранена',
        ),
    }),
  ])
}

/** Переживает перерисовку админки: файл уже разобран, повторно читать не нужно. */
const scheduleImport = {
  fileName: '',
  book: null,
  /** Разбор без сдвига — от него считаем любой режим дат. */
  baseReport: null,
  report: null,
  error: '',
  busy: false,
  mode: 'asFile',
  startIso: '',
  shiftDays: 0,
  replace: true,
  last: null,
}

export function renderScheduleImport() {
  const box = el('div', {})
  const settings = getAppSettings()

  if (!scheduleImport.startIso) {
    scheduleImport.startIso = settings.sessionStart || '2026-12-14'
  }

  const preview = el('div', { className: 'import-preview' })
  const status = el('p', { className: 'muted', style: 'margin:8px 0 0;font-size:12.5px' })

  const fileInput = el('input', {
    type: 'file',
    accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    className: 'import-file',
  })

  const reparse = () => {
    if (!scheduleImport.book) return
    const shift = resolveShift(scheduleImport.baseReport, {
      mode: scheduleImport.mode,
      startIso: scheduleImport.startIso,
      shiftDays: scheduleImport.shiftDays,
    })
    scheduleImport.report = parseScheduleBook(scheduleImport.book, {
      siteGroups: listGroups(),
      shiftDays: shift,
    })
  }

  const paint = () => {
    preview.replaceChildren()
    const rep = scheduleImport.report
    if (scheduleImport.error) {
      preview.append(el('p', { className: 'journal-error', text: scheduleImport.error }))
      return
    }
    if (!rep) {
      preview.append(
        el('p', {
          className: 'muted',
          style: 'margin:0',
          text: 'Выбери файл .xlsx с расписанием. Разбор идёт прямо на телефоне — ничего не уходит на сервер, пока ты не нажмёшь «Импортировать».',
        }),
      )
      return
    }

    const matched = rep.groups.filter((g) => g.siteId)
    const days = groupByDate(rep.lessons)
    preview.append(
      el('div', { className: 'import-stats' }, [
        el('span', { text: `Пар: ${rep.lessons.length}` }),
        el('span', { text: `Групп: ${matched.length}` }),
        el('span', { text: `Дат: ${rep.dates.length}` }),
        rep.unknownGroups.length
          ? el('span', { className: 'is-warn', text: `Без группы: ${rep.unknownGroups.length}` })
          : null,
      ]),
    )
    if (rep.dates.length) {
      preview.append(
        el('p', {
          className: 'muted',
          style: 'margin:6px 0',
          text: `Даты: ${formatDateRu(rep.dates[0])} — ${formatDateRu(rep.dates[rep.dates.length - 1])}${rep.labelGuess ? ` · ${rep.labelGuess}` : ''}`,
        }),
      )
    }
    for (const w of rep.warnings || []) {
      preview.append(el('p', { className: 'import-warn', text: w }))
    }
    preview.append(
      el(
        'div',
        { className: 'import-days' },
        days.map((d) =>
          el('span', { className: 'import-day' }, [
            el('strong', { text: formatDateRu(d.date) }),
            el('span', { text: `${d.count} пар · ${d.groups} гр.` }),
          ]),
        ),
      ),
    )
  }

  const loadFile = async (file) => {
    scheduleImport.error = ''
    scheduleImport.report = null
    scheduleImport.baseReport = null
    scheduleImport.book = null
    scheduleImport.fileName = file?.name || ''
    if (!file) return paint()
    try {
      scheduleImport.busy = true
      paint()
      const book = await readXlsx(file)
      scheduleImport.book = book
      scheduleImport.baseReport = parseScheduleBook(book, { siteGroups: listGroups(), shiftDays: 0 })
      scheduleImport.report = scheduleImport.baseReport
      scheduleImport.last = null
    } catch (err) {
      scheduleImport.error = err?.message || 'Не удалось прочитать файл'
    } finally {
      scheduleImport.busy = false
      paint()
    }
  }

  fileInput.addEventListener('change', () => {
    void loadFile(fileInput.files?.[0] || null)
  })

  // --- Настройки импорта
  const modeSelect = el('select', {})
  for (const [value, label] of [
    ['asFile', 'Даты как в файле'],
    ['toDate', 'Перенести: первая дата → выбранная'],
    ['shift', 'Сдвинуть на N дней'],
  ]) {
    const opt = el('option', { value, text: label })
    if (scheduleImport.mode === value) opt.selected = true
    modeSelect.append(opt)
  }
  const startIso = el('input', { type: 'date', value: scheduleImport.startIso })
  const shiftDays = el('input', {
    type: 'number',
    inputmode: 'numeric',
    value: String(scheduleImport.shiftDays || 0),
  })
  const replaceBox = el('input', { type: 'checkbox' })
  replaceBox.checked = scheduleImport.replace !== false

  const syncModeFields = () => {
    startIso.disabled = scheduleImport.mode !== 'toDate'
    shiftDays.disabled = scheduleImport.mode !== 'shift'
  }
  modeSelect.addEventListener('change', () => {
    scheduleImport.mode = modeSelect.value
    syncModeFields()
    reparse()
    paint()
  })
  startIso.addEventListener('change', () => {
    scheduleImport.startIso = startIso.value
    if (scheduleImport.mode === 'toDate') {
      reparse()
      paint()
    }
  })
  shiftDays.addEventListener('change', () => {
    scheduleImport.shiftDays = Number(shiftDays.value || 0)
    if (scheduleImport.mode === 'shift') {
      reparse()
      paint()
    }
  })
  replaceBox.addEventListener('change', () => {
    scheduleImport.replace = replaceBox.checked
  })
  syncModeFields()

  const importBtn = el('button', {
    type: 'button',
    className: 'btn',
    text: 'Импортировать',
    onClick: async () => {
      if (!scheduleImport.report?.lessons?.length) {
        flash('Сначала выбери файл с парами', true)
        return
      }
      if (importBtn.disabled) return
      const count = scheduleImport.report.lessons.length
      if (!confirm(`Импортировать ${count} пар? ${scheduleImport.replace ? 'Старые пары на эти даты у этих групп будут заменены.' : 'Пары добавятся к тем, что уже загружены.'}`)) {
        return
      }
      importBtn.disabled = true
      const oldText = importBtn.textContent
      importBtn.textContent = 'Импортирую…'
      try {
        // Пересчитываем даты под выбранный режим прямо перед отправкой.
        reparse()
        const rows = scheduleImport.report.lessons.map((l) => ({
          groupId: l.groupId,
          date: l.date,
          start: l.start,
          end: l.end,
          subject: l.subject,
          teacher: l.teacher,
          room: l.room,
          kind: l.kind,
          remote: false,
        }))
        const res = await importSessionLessons(rows, { replace: scheduleImport.replace })
        scheduleImport.last = {
          batch: res?.batch || '',
          imported: res?.imported ?? rows.length,
          skipped: res?.skipped ?? 0,
        }
        status.textContent = `Добавлено ${scheduleImport.last.imported} пар${scheduleImport.last.skipped ? `, пропущено ${scheduleImport.last.skipped}` : ''}.`
        flash('Расписание загружено')
        render({ force: true })
        if (!refreshTabPanes(['home', 'schedule'])) render({ force: true })
      } catch (err) {
        status.textContent = err?.message || 'Импорт не удался'
        flash(err.message, true)
      } finally {
        importBtn.disabled = false
        importBtn.textContent = oldText
      }
    },
  })

  const rollbackBtn = el('button', {
    type: 'button',
    className: 'journal-link',
    text: scheduleImport.last?.batch ? 'Отменить последний импорт' : 'Отменить последний импорт (нет пачки)',
    onClick: async () => {
      const batch = scheduleImport.last?.batch
      if (!batch) {
        flash('Сначала импортируй — тогда будет что отменять', true)
        return
      }
      if (!confirm('Удалить пары этого импорта?')) return
      try {
        const res = await deleteSessionBatch(batch)
        flash(`Удалено пар: ${res?.deleted ?? 0}`)
        scheduleImport.last = null
        render({ force: true })
        if (!refreshTabPanes(['home', 'schedule'])) render({ force: true })
      } catch (err) {
        flash(err.message, true)
      }
    },
  })

  box.append(
    el('h3', { style: 'margin:0 0 6px;font-size:15px', text: 'Расписание из Excel' }),
    el('p', {
      className: 'muted',
      style: 'margin:0 0 10px;font-size:12.5px',
      text: 'Подойдёт файл из деканата: строки «Группа 0903-ПД5», даты и пары по 5 строк. Разбор идёт на телефоне, ключи ИИ не нужны. Группы, которых нет на сайте, пропускаются — они не создаются автоматически.',
    }),
    fileInput,
    el('div', { className: 'field', style: 'margin-top:10px' }, [
      el('label', { text: 'Даты' }),
      modeSelect,
    ]),
    el('div', { className: 'program-editor-pair' }, [
      el('div', { className: 'field' }, [el('label', { text: 'Первая дата →' }), startIso]),
      el('div', { className: 'field' }, [el('label', { text: 'Сдвиг, дней' }), shiftDays]),
    ]),
    el('label', { className: 'admin-check' }, [
      replaceBox,
      el('span', { text: 'Заменить расписание на эти даты (иначе — добавить)' }),
    ]),
    el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;margin:10px 0' }, [importBtn, rollbackBtn]),
    preview,
    status,
  )
  paint()
  return box
}

export function renderAdminPanel() {
  const box = el('div', { className: 'card admin-panel' })
  box.append(
    el('h3', { text: 'Админка' }),
    el('p', {
      className: 'muted',
      style: 'margin:0 0 12px;font-size:13px',
      text: 'Нажми раздел — раскроется, как ДЗ у пары.',
    }),
  )

  const session = getSession()
  const adminNameInput = el('input', {
    maxlength: '64',
    value: (session?.label || '').trim() || 'Никитос',
    placeholder: 'Как тебя видят в ДЗ',
  })
  const adminNameForm = el('form', { style: 'margin:0 0 14px' })
  adminNameForm.append(
    el('p', {
      className: 'muted',
      style: 'margin:0 0 8px',
      text: 'Твоё имя на сайте (вместо «Админ») — видно во всех ДЗ',
    }),
    el('div', { className: 'field' }, [el('label', { text: 'Отображаемое имя' }), adminNameInput]),
    el('button', { className: 'btn secondary', type: 'submit', text: 'Сохранить имя' }),
  )
  adminNameForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      await setAdminDisplayName(adminNameInput.value)
      flash('Имя обновлено везде')
      render()
    } catch (err) {
      flash(err.message, true)
    }
  })
  box.append(adminNameForm)

  // —— Посещения (спойлер)
  if (isAdminSectionOpen('stats')) {
    const statsCard = el('div', {
      className: 'muted',
      style: 'padding:10px;border:1px solid var(--line);border-radius:8px',
      text: 'Статистика: загружаем…',
    })
    box.append(wrapAdminAcc('stats', 'Посещения', [statsCard]))
    fetchSiteStats()
      .then((st) => {
        if (!st) {
          statsCard.textContent =
            'Статистика недоступна — выполни SQL site_stats.sql в Supabase.'
          return
        }
        statsCard.replaceChildren()
        statsCard.append(
          el('div', {
            style: 'color:var(--text);font-weight:600;margin-bottom:6px',
            text: 'Посещения (анонимно)',
          }),
          el('div', {
            text: `Сегодня: ${st.todayUnique ?? st.todayunique ?? 0} чел. · ${st.todayHits ?? st.todayhits ?? 0} заходов`,
          }),
          el('div', { text: `Вчера: ${st.yesterdayUnique ?? st.yesterdayunique ?? 0} чел.` }),
          el('div', { text: `За 7 дней: ${st.last7Unique ?? st.last7unique ?? 0} чел.` }),
          el('div', { text: `За 30 дней: ${st.last30Unique ?? st.last30unique ?? 0} чел.` }),
          el('p', {
            className: 'muted',
            style: 'margin:8px 0 0;font-size:12px',
            text: 'Считаем уникальные браузеры (не ФИО). Один человек с телефона и ПК = 2.',
          }),
        )
      })
      .catch((err) => {
        statsCard.textContent = err.message || 'Не удалось загрузить статистику'
      })
  } else {
    box.append(wrapAdminAcc('stats', 'Посещения', null))
  }

  // —— Свободные аудитории (как поиск препода, только для админа)
  if (isAdminSectionOpen('rooms')) {
    box.append(wrapAdminAcc('rooms', 'Свободные аудитории', [renderAdminFreeRooms()]))
  } else {
    box.append(wrapAdminAcc('rooms', 'Свободные аудитории', null))
  }

  // —— Кому выдать доступ к свободным аудиториям
  if (isAdminSectionOpen('roomsAccess')) {
    const accessBody = el('div', { className: 'admin-people-tools' })
    const accessSearch = el('input', {
      type: 'search',
      placeholder: 'Поиск по имени…',
      value: state.roomsAccessQuery || '',
      autocomplete: 'off',
    })
    const accessList = el('div', { className: 'admin-people-list' })
    const paintAccess = async () => {
      state.roomsAccessQuery = accessSearch.value || ''
      accessList.replaceChildren(el('p', { className: 'muted', text: 'Загружаем…' }))
      try {
        const q = normalizePeopleQuery(state.roomsAccessQuery)
        const rows = (await listStarostaCodes()).filter((r) => !r.banned)
        const filtered = q
          ? rows.filter((r) => normalizePeopleQuery(r.label).includes(q))
          : rows
        accessList.replaceChildren()
        if (!filtered.length) {
          accessList.append(
            el('p', {
              className: 'muted',
              text: q ? 'Никого не нашли по этому имени.' : 'Пока нет выданных кодов.',
            }),
          )
          return
        }
        for (const row of filtered) {
          const on = !!row.canFreeRooms
          const card = el('div', { className: `admin-people-card${on ? ' is-on' : ''}` }, [
            el('div', { className: 'admin-people-meta' }, [
              el('strong', { text: (row.label || '').trim() || 'без имени' }),
              el('span', {
                className: 'muted',
                text: `${row.groupName || ''}${row.roleTitle ? ` · ${row.roleTitle}` : ''}`,
              }),
            ]),
            el('button', {
              type: 'button',
              className: on ? 'btn secondary' : 'btn',
              text: on ? 'Забрать' : 'Выдать',
              onClick: async () => {
                try {
                  await setCodeFreeRooms(row.id, !on)
                  flash(on ? 'Доступ забран' : 'Доступ выдан')
                  paintAccess()
                } catch (err) {
                  flash(err.message, true)
                }
              },
            }),
          ])
          accessList.append(card)
        }
      } catch (err) {
        accessList.replaceChildren(el('p', { className: 'muted', text: err.message }))
      }
    }
    accessSearch.addEventListener('input', () => {
      state.roomsAccessQuery = accessSearch.value || ''
      paintAccess()
    })
    accessBody.append(
      el('p', {
        className: 'muted',
        style: 'margin:0 0 10px;font-size:13px',
        text: 'Выбери человека с уже выданным кодом — у него в «Ещё» появится блок свободных аудиторий.',
      }),
      el('div', { className: 'field' }, [el('label', { text: 'Поиск' }), accessSearch]),
      accessList,
    )
    box.append(wrapAdminAcc('roomsAccess', 'Доступ к аудиториям', [accessBody]))
    paintAccess()
  } else {
    box.append(wrapAdminAcc('roomsAccess', 'Доступ к аудиториям', null))
  }

  // —— Баны
  if (isAdminSectionOpen('bans')) {
    const bansBody = el('div', { className: 'admin-people-tools' })
    const bansSearch = el('input', {
      type: 'search',
      placeholder: 'Поиск по имени…',
      value: state.bansQuery || '',
      autocomplete: 'off',
    })
    const bansList = el('div', { className: 'admin-people-list' })
    const paintBans = async () => {
      state.bansQuery = bansSearch.value || ''
      bansList.replaceChildren(el('p', { className: 'muted', text: 'Загружаем…' }))
      try {
        const q = normalizePeopleQuery(state.bansQuery)
        const rows = await listStarostaCodes()
        const filtered = q
          ? rows.filter((r) => normalizePeopleQuery(r.label).includes(q))
          : rows
        bansList.replaceChildren()
        if (!filtered.length) {
          bansList.append(
            el('p', {
              className: 'muted',
              text: q ? 'Никого не нашли по этому имени.' : 'Пока нет выданных кодов.',
            }),
          )
          return
        }
        for (const row of filtered) {
          const banned = !!row.banned
          const banDraft = state.adminBanId === row.id
          const reasonShown = (row.banReason || '').trim()
          const card = el('div', {
            className: `admin-people-card${banned ? ' is-banned' : ''}${banDraft ? ' is-ban-draft' : ''}`,
          })
          card.append(
            el('div', { className: 'admin-people-meta' }, [
              el('strong', { text: (row.label || '').trim() || 'без имени' }),
              el('span', {
                className: 'muted',
                text: `${row.groupName || ''}${banned ? ' · бан' : ''}${reasonShown ? ` · ${reasonShown}` : ''}`,
              }),
            ]),
          )
          if (banDraft && !banned) {
            const reasonInput = el('input', {
              type: 'text',
              maxlength: '200',
              placeholder: 'Причина (необязательно)',
              autocomplete: 'off',
            })
            const form = el('form', { className: 'admin-ban-form' })
            form.append(
              el('div', { className: 'field' }, [el('label', { text: 'Причина бана' }), reasonInput]),
              el('div', { className: 'code-card-btns' }, [
                el('button', { type: 'submit', className: 'btn code-card-danger', text: 'Забанить' }),
                el('button', {
                  type: 'button',
                  className: 'btn secondary',
                  text: 'Отмена',
                  onClick: () => {
                    state.adminBanId = ''
                    paintBans()
                  },
                }),
              ]),
            )
            form.addEventListener('submit', async (e) => {
              e.preventDefault()
              try {
                const res = await banStarostaCode(row.id, reasonInput.value)
                const n = res?.devices ?? res?.Devices
                flash(n != null ? `Забанен · устройств: ${n}` : 'Забанен')
                state.adminBanId = ''
                paintBans()
              } catch (err) {
                flash(err.message, true)
              }
            })
            card.append(form)
            requestAnimationFrame(() => {
              try {
                reasonInput.focus()
              } catch {
                /* ignore */
              }
            })
          } else {
            card.append(
              el('button', {
                type: 'button',
                className: banned ? 'btn' : 'btn code-card-danger',
                text: banned ? 'Снять бан' : 'Забанить',
                onClick: async () => {
                  if (banned) {
                    try {
                      await unbanStarostaCode(row.id)
                      flash('Бан снят')
                      paintBans()
                    } catch (err) {
                      flash(err.message, true)
                    }
                    return
                  }
                  state.adminBanId = row.id
                  paintBans()
                },
              }),
            )
          }
          bansList.append(card)
        }
      } catch (err) {
        bansList.replaceChildren(el('p', { className: 'muted', text: err.message }))
      }
    }
    bansSearch.addEventListener('input', () => {
      state.bansQuery = bansSearch.value || ''
      paintBans()
    })
    bansBody.append(
      el('p', {
        className: 'muted',
        style: 'margin:0 0 10px;font-size:13px',
        text: 'Жёсткий бан: код закрыт, а на известных устройствах сайт не открывается даже как гость (без расписания). Снять бан можно здесь же.',
      }),
      el('div', { className: 'field' }, [el('label', { text: 'Поиск' }), bansSearch]),
      bansList,
    )
    box.append(wrapAdminAcc('bans', 'Баны', [bansBody]))
    paintBans()
  } else {
    box.append(wrapAdminAcc('bans', 'Баны', null))
  }

  // —— Сайт (спойлер)
  if (isAdminSectionOpen('site')) {
    const siteBody = el('div', {}, [
      el('div', {
        style:
          'margin:0 0 12px;padding:12px;border:2px solid ' +
          (isSiteEnabled() ? 'var(--warn, #c45)' : 'var(--ok, #2a7)') +
          ';border-radius:10px;background:var(--surface)',
      }, [
        el('h3', {
          style: 'margin:0 0 6px;font-size:16px',
          text: isSiteEnabled() ? 'Сайт сейчас ВКЛЮЧЁН' : 'Сайт сейчас ВЫКЛЮЧЕН',
        }),
        el('p', {
          className: 'muted',
          style: 'margin:0 0 10px;font-size:13px',
          text: isSiteEnabled()
            ? 'Аварийное выключение: все увидят заглушку. Ты как админ продолжаешь видеть сайт и сможешь включить обратно.'
            : 'Для остальных сайт закрыт. Нажми «Включить», когда можно снова.',
        }),
        el('button', {
          type: 'button',
          className: 'btn',
          style: isSiteEnabled()
            ? 'background:#b42318;border-color:#b42318'
            : 'background:#1a7f37;border-color:#1a7f37',
          text: isSiteEnabled() ? 'Выключить сайт для всех' : 'Включить сайт снова',
          onClick: async () => {
            const next = !isSiteEnabled()
            const ok = confirm(
              next
                ? 'Включить сайт? Все снова смогут открывать расписание.'
                : 'Выключить сайт для всех прямо сейчас?',
            )
            if (!ok) return
            try {
              await setSiteEnabled(next)
              flash(next ? 'Сайт включён' : 'Сайт выключен для всех')
              render()
            } catch (err) {
              flash(err.message || 'Не удалось переключить', true)
            }
          },
        }),
      ]),
      el('div', {
        style: 'padding:12px;border:1px solid var(--line);border-radius:8px;margin-bottom:12px',
      }, renderHomeTextSettings()),
      el('div', {
        style: 'padding:12px;border:1px solid var(--line);border-radius:8px;margin-bottom:12px',
      }, renderFormationSettings()),
      el('div', {
        style: 'padding:12px;border:1px solid var(--line);border-radius:8px;margin-bottom:12px',
      }, renderSessionSettings()),
      el('div', {
        style: 'padding:12px;border:1px solid var(--line);border-radius:8px',
      }, [
        el('h3', { style: 'margin:0 0 6px;font-size:15px', text: 'Очистка старых данных' }),
        el('p', {
          className: 'muted',
          style: 'margin:0 0 10px;font-size:13px',
          text: 'Автоматически раз в сутки удаляется то, чему больше 8 недель (ДЗ, файлы, замены). Актуальные недели (±6) не трогаются.',
        }),
        el('button', {
          type: 'button',
          className: 'btn secondary',
          text: 'Очистить старше 8 недель',
          onClick: async () => {
            try {
              const r = await cleanupOldData(8)
              const hw = r?.homeworkDeleted ?? r?.homeworkdeleted ?? 0
              const ov = r?.overridesDeleted ?? r?.overridesdeleted ?? 0
              const fl = r?.filesDeleted ?? r?.filesdeleted ?? 0
              flash(`Очистка: ДЗ ${hw}, замен ${ov}, файлов ${fl}`)
              render()
            } catch (err) {
              flash(err.message || 'Не удалось очистить', true)
            }
          },
        }),
      ]),
    ])
    box.append(wrapAdminAcc('site', 'Сайт', [siteBody]))
  } else {
    box.append(wrapAdminAcc('site', 'Сайт', null))
  }

  // —— Расписание из Excel (спойлер)
  if (isAdminSectionOpen('import')) {
    box.append(wrapAdminAcc('import', 'Расписание из Excel', [renderScheduleImport()]))
  } else {
    box.append(wrapAdminAcc('import', 'Расписание из Excel', null))
  }

  // —— Поддержка (спойлер)
  const supportCard = el('div', {
    style: 'padding:4px 0',
  })
  if (isAdminSectionOpen('support')) {
    supportCard.append(
      el('p', {
        className: 'muted',
        style: 'margin:0 0 10px;font-size:13px',
        text: 'Сообщения из @rasphelp_bot. Ответ уйдёт студенту в Telegram. Загрузка…',
      }),
    )
    box.append(wrapAdminAcc('support', 'Поддержка', [supportCard]))
    fetchSupportTickets(40)
    .then((pack) => {
      supportCard.replaceChildren()
      const open = pack.openCount || 0
      supportCard.append(
        el('h3', {
          style: 'margin:0 0 6px;font-size:15px',
          text: `Обращения в поддержку · ${open} откр.`,
        }),
        el('p', {
          className: 'muted',
          style: 'margin:0 0 10px;font-size:13px',
          text:
            open === 0
              ? 'Новых вопросов нет. Студенты пишут боту @rasphelp_bot — они появятся здесь.'
              : 'Ответь ниже или удали ненужные. Ответ отправится в Telegram (через минуту, если бот-поллер активен).',
        }),
      )
      const list = el('div', { style: 'display:flex;flex-direction:column;gap:10px' })
      for (const t of pack.items || []) {
        const who = t.tgUsername
          ? `@${t.tgUsername}`
          : t.tgName || `id ${t.tgUserId}`
        const when = t.createdAt
          ? new Date(t.createdAt).toLocaleString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
          : ''
        const replyBox = el('textarea', {
          rows: '2',
          placeholder: 'Ответ студенту…',
          style: 'width:100%;margin:8px 0;resize:vertical',
        })
        if (t.status === 'answered' && t.answer) {
          replyBox.value = t.answer
        }
        const row = el('div', {
          style:
            'padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--surface)',
        })
        row.append(
          el('div', {
            style: 'font-weight:600;font-size:13px',
            text: `${t.status === 'open' ? '🆕 ' : '✓ '}${who}${when ? ' · ' + when : ''}`,
          }),
          el('div', {
            style: 'margin:6px 0;white-space:pre-wrap;font-size:14px',
            text: t.body || '(пусто)',
          }),
          replyBox,
          el('div', {
            style: 'display:flex;gap:8px;flex-wrap:wrap',
          }, [
            el('button', {
              type: 'button',
              className: 'btn',
              text: 'Ответить',
              onClick: async () => {
                try {
                  await replySupportTicket(t.id, replyBox.value)
                  flash('Ответ сохранён — уйдёт в Telegram')
                  render()
                } catch (err) {
                  flash(err.message || 'Не удалось ответить', true)
                }
              },
            }),
            el('button', {
              type: 'button',
              className: 'btn secondary',
              text: 'Удалить',
              onClick: async () => {
                if (!confirm('Удалить это обращение?')) return
                try {
                  await deleteSupportTicket(t.id)
                  flash('Обращение удалено')
                  render()
                } catch (err) {
                  flash(err.message || 'Не удалось удалить', true)
                }
              },
            }),
          ]),
        )
        list.append(row)
      }
      if ((pack.items || []).length) supportCard.append(list)
      supportCard.append(
        el('div', {
          style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px',
        }, [
          el('button', {
            type: 'button',
            className: 'btn secondary',
            text: 'Обновить список',
            onClick: () => render(),
          }),
          el('button', {
            type: 'button',
            className: 'btn',
            style: 'background:#b42318;border-color:#b42318',
            text: 'Удалить все обращения',
            onClick: async () => {
              if (!confirm('Удалить все обращения из списка?')) return
              try {
                const r = await deleteAllSupportTickets()
                flash(`Удалено: ${r?.deleted ?? r?.Deleted ?? 0}`)
                render()
              } catch (err) {
                flash(err.message || 'Не удалось удалить', true)
              }
            },
          }),
        ]),
      )
    })
    .catch((err) => {
      supportCard.replaceChildren(
        el('p', {
          className: 'muted',
          style: 'margin:0;font-size:13px',
          text:
            /could not find|does not exist|PGRST/i.test(err.message || '')
              ? 'Нужно выполнить SQL support_tickets.sql и security_hardening_v2.sql в Supabase — тогда здесь появится очередь.'
              : err.message || 'Не удалось загрузить обращения',
        }),
      )
    })
  } else {
    box.append(wrapAdminAcc('support', 'Поддержка', null))
  }

  // —— Коды (спойлер)
  if (isAdminSectionOpen('codes')) {
  const groups = listGroups()
  if (
    !state.adminCodeGroupId ||
    (state.adminCodeGroupId !== ALL_GROUPS_ID && !groups.some((g) => g.id === state.adminCodeGroupId))
  ) {
    state.adminCodeGroupId = groups[0]?.id || ALL_GROUPS_ID
  }
  const codeGroup = el(
    'select',
    {
      onChange: (e) => {
        state.adminCodeGroupId = e.target.value
      },
    },
    [
      el('option', { value: ALL_GROUPS_ID, text: 'Все группы (власть везде)' }),
      ...groups.map((g) =>
        el('option', {
          value: g.id,
          text: g.name,
        }),
      ),
    ],
  )
  codeGroup.value = state.adminCodeGroupId
  const codeInput = el('input', {
    maxlength: '64',
    placeholder: 'Придумай код (от 8 символов)',
    autocomplete: 'off',
  })
  const codeLabel = el('input', {
    maxlength: '64',
    placeholder: 'Сидорова',
    required: true,
  })
  const codeRole = el('input', {
    maxlength: '32',
    placeholder: 'Командир / замком (пусто = Староста)',
  })
  const issued = el('p', { className: 'muted', text: '' })
  const issueForm = el('form', {})
  issueForm.append(
    el('p', {
      className: 'muted',
      text: 'Имя — крупно в профиле; синяя подпись — вместо «Староста». «Все группы» — можно править ДЗ/замены в любой группе (без админ-панели).',
    }),
    el('div', { className: 'field' }, [el('label', { text: 'Группа' }), codeGroup]),
    el('div', { className: 'field' }, [el('label', { text: 'Код' }), codeInput]),
    el('div', { className: 'field' }, [el('label', { text: 'Имя' }), codeLabel]),
    el('div', { className: 'field' }, [
      el('label', { text: 'Синяя подпись' }),
      codeRole,
    ]),
    el('button', { className: 'btn', type: 'submit', text: 'Создать код' }),
    issued,
  )
  issueForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const groupId = state.adminCodeGroupId || codeGroup.value
    const allGroups = groupId === ALL_GROUPS_ID
    const g = allGroups ? null : getGroup(groupId)
    if (!allGroups && !g) {
      flash('Выбери группу', true)
      return
    }
    const plain = codeInput.value
    const name = (codeLabel.value || '').trim()
    const roleTitle = (codeRole.value || '').trim()
    if (!name) {
      flash('Напиши имя (Сидорова…)', true)
      return
    }
    const badge = roleTitle || 'Староста'
    const where = allGroups ? 'всем группам' : `группе ${g.name}`
    if (!confirm(`Выдать код ${where}?\nИмя: ${name}\nСиняя подпись: ${badge}`)) return
    try {
      await addStarostaCode(groupId, plain, name, roleTitle)
      issued.textContent = `Готово. ${name} · ${badge}${allGroups ? ' · все группы' : ''}. Скинь код: ${plain}`
      flash(`Код создан · ${name}${allGroups ? ' · все группы' : ''}`)
      codeInput.value = ''
      codeLabel.value = ''
      codeRole.value = ''
      paintCodes()
    } catch (err) {
      flash(err.message, true)
    }
  })
  const codesBox = el('div', { className: 'code-list' })
  async function paintCodes() {
    codesBox.replaceChildren()
    codesBox.append(
      el('h3', { style: 'margin:12px 0 4px;font-size:15px', text: 'Выданные коды' }),
    )
    try {
      const rows = await listStarostaCodes()
      if (!rows.length) {
        codesBox.append(el('p', { className: 'muted', text: 'Пока нет выданных кодов.' }))
        return
      }
      const ids = new Set(rows.map((r) => r.id))
      if (state.adminCodeEditId && !ids.has(state.adminCodeEditId)) state.adminCodeEditId = ''
      if (state.adminCodeRevokeId && !ids.has(state.adminCodeRevokeId)) state.adminCodeRevokeId = ''

      for (const row of rows) {
        const codeText = (row.code || '').trim()
        const badge = (row.roleTitle || '').trim() || 'Староста'
        const personName = (row.label || '').trim() || 'без имени'
        const editing = state.adminCodeEditId === row.id
        const revoking = state.adminCodeRevokeId === row.id

        // Всё колонкой: код НИКОГДА не в flex рядом с кнопкой (иначе ломается в столбик)
        const card = el('article', {
          className: `code-card${editing ? ' is-editing' : ''}${revoking ? ' is-revoking' : ''}`,
        })

        card.append(
          el('div', { className: 'code-card-head' }, [
            el('strong', { className: 'code-card-group', text: row.groupName || row.groupId }),
            el('span', { className: 'more-role-badge', text: badge }),
          ]),
          el('div', { className: 'code-card-name', text: personName }),
          el('div', {
            className: codeText ? 'code-card-code' : 'code-card-code is-empty',
            text: codeText || 'код не сохранён — выдайте новый',
          }),
        )

        if (editing) {
          const nameInput = el('input', {
            type: 'text',
            maxlength: '64',
            value: row.label || '',
            placeholder: 'Сидорова',
            autocomplete: 'off',
          })
          const roleInput = el('input', {
            type: 'text',
            maxlength: '32',
            value: row.roleTitle || '',
            placeholder: 'Командир (пусто = Староста)',
            autocomplete: 'off',
          })
          const form = el('form', { className: 'code-card-form' })
          form.append(
            el('div', { className: 'field' }, [el('label', { text: 'Имя' }), nameInput]),
            el('div', { className: 'field' }, [el('label', { text: 'Синяя подпись' }), roleInput]),
            el('div', { className: 'code-card-btns' }, [
              el('button', { type: 'submit', className: 'btn', text: 'Сохранить' }),
              el('button', {
                type: 'button',
                className: 'btn secondary',
                text: 'Отмена',
                onClick: () => {
                  state.adminCodeEditId = ''
                  paintCodes()
                },
              }),
            ]),
          )
          form.addEventListener('submit', async (e) => {
            e.preventDefault()
            const name = nameInput.value.trim()
            const title = roleInput.value.trim()
            if (!name) {
              flash('Укажи имя', true)
              return
            }
            try {
              const nameChanged = name !== (row.label || '').trim()
              const roleChanged = title !== (row.roleTitle || '').trim()
              let hwN = null
              if (nameChanged) {
                const res = await renameStarostaLabel(row.id, name)
                hwN = res?.homeworkUpdated ?? res?.homeworkupdated
              }
              if (roleChanged) await setStarostaRoleTitle(row.id, title)
              if (!nameChanged && !roleChanged) flash('Без изменений')
              else if (hwN != null) flash(`Сохранено · ДЗ обновлено: ${hwN}`)
              else flash('Сохранено')
              state.adminCodeEditId = ''
              paintCodes()
            } catch (err) {
              flash(err.message, true)
            }
          })
          card.append(form)
          requestAnimationFrame(() => {
            try {
              nameInput.focus()
            } catch {
              /* ignore */
            }
          })
        } else if (revoking) {
          card.append(
            el('div', { className: 'code-card-revoke' }, [
              el('p', {
                className: 'code-card-revoke-msg',
                text: 'Отозвать код? Человек больше не войдёт.',
              }),
              el('div', { className: 'code-card-btns' }, [
                el('button', {
                  type: 'button',
                  className: 'btn code-card-danger',
                  text: 'Да, отозвать',
                  onClick: async () => {
                    try {
                      await revokeStarostaCode(row.id)
                      flash('Код отозван')
                      state.adminCodeRevokeId = ''
                      paintCodes()
                    } catch (err) {
                      flash(err.message, true)
                    }
                  },
                }),
                el('button', {
                  type: 'button',
                  className: 'btn secondary',
                  text: 'Отмена',
                  onClick: () => {
                    state.adminCodeRevokeId = ''
                    paintCodes()
                  },
                }),
              ]),
            ]),
          )
        } else {
          const btns = [
            el('button', {
              type: 'button',
              className: 'btn',
              text: 'Изменить',
              onClick: () => {
                state.adminCodeEditId = row.id
                state.adminCodeRevokeId = ''
                paintCodes()
              },
            }),
          ]
          if (codeText) {
            btns.push(
              el('button', {
                type: 'button',
                className: 'btn secondary',
                text: 'Копировать',
                onClick: async () => {
                  try {
                    await navigator.clipboard.writeText(codeText)
                    flash('Код скопирован')
                  } catch {
                    flash(codeText)
                  }
                },
              }),
            )
          }
          btns.push(
            el('button', {
              type: 'button',
              className: 'btn secondary',
              text: 'Отозвать',
              onClick: () => {
                state.adminCodeRevokeId = row.id
                state.adminCodeEditId = ''
                paintCodes()
              },
            }),
          )
          card.append(el('div', { className: 'code-card-btns' }, btns))
        }

        codesBox.append(card)
      }
    } catch (err) {
      codesBox.append(el('p', { className: 'muted', text: err.message }))
    }
  }
  box.append(
    wrapAdminAcc('codes', 'Коды', [
      el('p', {
        className: 'muted',
        style: 'margin:0 0 10px;font-size:13px',
        text: 'Ты выдаёшь коды старостам/командирам. На одну группу можно несколько кодов.',
      }),
      issueForm,
      codesBox,
    ]),
  )
  paintCodes()
  } else {
    box.append(wrapAdminAcc('codes', 'Коды', null))
  }

  // —— Админы (спойлер)
  // Коды старост живут отдельно: здесь только полный доступ к админке.
  if (isAdminSectionOpen('admins')) {
    const mainNote = el('p', {
      className: 'muted',
      style: 'margin:0 0 10px;font-size:13px',
      text: 'Главный админ: загружаем…',
    })
    const adminCode = el('input', {
      maxlength: '64',
      placeholder: 'Код нового админа (от 8 символов)',
      autocomplete: 'off',
    })
    const adminLabel = el('input', {
      maxlength: '64',
      placeholder: 'Сидорова',
      autocomplete: 'off',
    })
    const adminIssued = el('p', {
      className: 'muted',
      text: state.adminIssuedNote || '',
    })
    const addForm = el('form', {})
    addForm.append(
      el('p', {
        className: 'muted',
        text: 'Доп. админ видит эту панель целиком. Коды старост при этом не меняются — их отзывают в разделе «Коды».',
      }),
      el('div', { className: 'field' }, [el('label', { text: 'Код' }), adminCode]),
      el('div', { className: 'field' }, [el('label', { text: 'Имя' }), adminLabel]),
      el('div', { className: 'code-card-btns' }, [
        el('button', { type: 'submit', className: 'btn', text: 'Добавить админа' }),
        el('button', {
          type: 'button',
          className: 'btn secondary',
          text: 'Случайный',
          onClick: () => {
            adminCode.value = newStudentCode()
            adminCode.focus()
          },
        }),
      ]),
      adminIssued,
    )
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const plain = adminCode.value.trim()
      const name = adminLabel.value.trim()
      if (plain.length < 8) {
        flash('Код от 8 символов', true)
        return
      }
      if (!name) {
        flash('Укажи имя админа', true)
        return
      }
      try {
        await addAdmin(plain, name)
        state.adminIssuedNote = `Готово. ${name} — админ. Код: ${plain}`
        flash(`Админ добавлен · ${name}`)
        adminCode.value = ''
        adminLabel.value = ''
        paintAdmins()
      } catch (err) {
        flash(err.message, true)
      }
    })

    const adminsBox = el('div', { className: 'code-list' })
    async function paintAdmins() {
      adminsBox.replaceChildren()
      try {
        const data = await listAdmins()
        mainNote.textContent = `Главный админ: ${data.main}. Его код лежит в app_meta — отозвать отсюда нельзя, меняется SQL-запросом.`
        const rows = (data.extra || []).filter((a) => a.active !== false)
        if (!rows.length) {
          adminsBox.append(el('p', { className: 'muted', text: 'Доп. админов пока нет.' }))
          return
        }
        const ids = new Set(rows.map((r) => r.id))
        if (state.adminRemoveId && !ids.has(state.adminRemoveId)) state.adminRemoveId = ''
        adminsBox.append(
          el('h3', { style: 'margin:12px 0 4px;font-size:15px', text: 'Доп. админы' }),
        )
        for (const row of rows) {
          const confirmRemove = state.adminRemoveId === row.id
          const card = el('article', {
            className: `code-card${confirmRemove ? ' is-revoking' : ''}`,
          })
          const codeText = (row.code || '').trim()
          card.append(
            el('div', { className: 'code-card-head' }, [
              el('strong', { className: 'code-card-group', text: row.label || 'без имени' }),
              el('span', { className: 'more-role-badge', text: 'админ' }),
            ]),
            el('div', {
              className: codeText ? 'code-card-code' : 'code-card-code is-empty',
              text: codeText || 'код не сохранён — выдайте новый',
            }),
          )
          if (confirmRemove) {
            card.append(
              el('div', { className: 'code-card-revoke' }, [
                el('p', {
                  className: 'code-card-revoke-msg',
                  text: 'Отозвать админа? Сессия закроется сразу, код перестанет пускать.',
                }),
                el('div', { className: 'code-card-btns' }, [
                  el('button', {
                    type: 'button',
                    className: 'btn code-card-danger',
                    text: 'Да, отозвать',
                    onClick: async () => {
                      try {
                        await revokeAdmin(row.id)
                        flash('Админ отозван')
                        state.adminRemoveId = ''
                        paintAdmins()
                      } catch (err) {
                        flash(err.message, true)
                      }
                    },
                  }),
                  el('button', {
                    type: 'button',
                    className: 'btn secondary',
                    text: 'Отмена',
                    onClick: () => {
                      state.adminRemoveId = ''
                      paintAdmins()
                    },
                  }),
                ]),
              ]),
            )
          } else {
            const btns = [
              el('button', {
                type: 'button',
                className: 'btn secondary',
                text: 'Отозвать',
                onClick: () => {
                  state.adminRemoveId = row.id
                  paintAdmins()
                },
              }),
            ]
            if (codeText) {
              btns.unshift(
                el('button', {
                  type: 'button',
                  className: 'btn secondary',
                  text: 'Копировать',
                  onClick: async () => {
                    try {
                      await navigator.clipboard.writeText(codeText)
                      flash('Код скопирован')
                    } catch {
                      flash(codeText)
                    }
                  },
                }),
              )
            }
            card.append(el('div', { className: 'code-card-btns' }, btns))
          }
          adminsBox.append(card)
        }
      } catch (err) {
        adminsBox.append(el('p', { className: 'muted', text: err.message }))
      }
    }

    box.append(
      wrapAdminAcc('admins', 'Админы', [mainNote, addForm, adminsBox]),
    )
    paintAdmins()
  } else {
    box.append(wrapAdminAcc('admins', 'Админы', null))
  }

  // —— Кураторы: админ выдаёт код, куратор ведёт старост и права
  if (isAdminSectionOpen('curators')) {
    const curSec = el('div', { className: 'curator-admin' })
    const label = el('input', { maxlength: '60', placeholder: 'Сидорова Анна' })
    const code = el('input', {
      maxlength: '64',
      placeholder: 'Код куратора (от 8 символов)',
      autocomplete: 'off',
    })
    const groupPick = el(
      'select',
      {},
      [
        el('option', { value: '', text: 'Все группы колледжа' }),
        ...listGroups().map((g) => el('option', { value: g.id, text: g.name })),
      ],
    )
    const genBtn = el('button', {
      type: 'button',
      className: 'journal-link',
      text: 'Придумать код',
      onClick: () => {
        code.value = newStudentCode()
      },
    })
    const form = el('form', {})
    form.append(
      el('p', {
        className: 'muted',
        style: 'margin:0 0 10px;font-size:13px',
        text: 'Куратор назначает старост, выдаёт права (зам/ДЗ/лента), ведёт журнал и построение в своих группах.',
      }),
      el('div', { className: 'field' }, [el('label', { text: 'Имя куратора' }), label]),
      el('div', { className: 'field' }, [el('label', { text: 'Группа' }), groupPick]),
      el('div', { className: 'field' }, [
        el('label', { text: 'Код входа' }),
        code,
        el('div', { style: 'margin-top:6px' }, [genBtn]),
      ]),
      el('button', { className: 'btn', type: 'submit', text: 'Назначить куратора' }),
    )
    const listBox = el('div', { className: 'curator-list' })

    const paint = async () => {
      listBox.replaceChildren(el('p', { className: 'muted', text: 'Загружаем…' }))
      try {
        const rows = await curatorsList()
        listBox.replaceChildren()
        if (!rows.length) {
          listBox.append(
            el('p', {
              className: 'muted',
              style: 'margin:0;font-size:12.5px',
              text: 'Кураторов пока нет.',
            }),
          )
          return
        }
        for (const row of rows) {
          const codeText = String(row.code || '').trim()
          listBox.append(
            el('div', { className: 'curator-row' }, [
              el('div', { className: 'curator-row-main' }, [
                el('strong', { text: row.label || 'Куратор' }),
                el('span', {
                  className: 'muted',
                  text: row.groupName || 'все группы',
                }),
              ]),
              codeText
                ? el('button', {
                    type: 'button',
                    className: 'btn secondary',
                    text: 'Копировать код',
                    onClick: async () => {
                      try {
                        await navigator.clipboard.writeText(codeText)
                        showToast('Код скопирован')
                      } catch {
                        showToast(codeText)
                      }
                    },
                  })
                : null,
              el('button', {
                type: 'button',
                className: 'btn danger',
                text: 'Убрать',
                onClick: async () => {
                  if (!confirm(`Убрать куратора «${row.label || ''}»?`)) return
                  try {
                    await curatorRevoke(row.id)
                    showToast('Куратор убран')
                    paint()
                  } catch (err) {
                    showToast(err.message, true)
                  }
                },
              }),
            ]),
          )
        }
      } catch (err) {
        const msg = String(err?.message || '')
        listBox.replaceChildren(
          el('p', {
            className: 'muted',
            style: 'margin:0',
            text: /PGRST202|could not find the function|does not exist|schema cache/i.test(msg)
              ? 'Кураторы ещё не включены: выполни supabase/curators.sql и curators_admin.sql.'
              : msg || 'Не удалось загрузить кураторов',
          }),
        )
      }
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const btn = form.querySelector('button[type="submit"]')
      if (btn) btn.disabled = true
      try {
        const created = await curatorCreate(groupPick.value || null, label.value.trim(), code.value.trim())
        showToast(`Куратор назначен. Код: ${created?.code || code.value.trim()}`)
        label.value = ''
        code.value = ''
        paint()
      } catch (err) {
        showToast(err.message, true)
      } finally {
        if (btn) btn.disabled = false
      }
    })

    curSec.append(form, el('div', { style: 'margin-top:14px' }, [listBox]))
    box.append(wrapAdminAcc('curators', 'Кураторы', [curSec]))
    paint()
  } else {
    box.append(wrapAdminAcc('curators', 'Кураторы', null))
  }

  // —— Группы (спойлер)
  if (isAdminSectionOpen('groups')) {
  const groupsSec = el('div', {})
  const name = el('input', { maxlength: '48', placeholder: '0902-ПД1' })
  const faculty = el('input', { maxlength: '32', placeholder: 'ПД' })
  const code = el('input', { maxlength: '64', placeholder: 'Первый код старосты (от 8 символов)' })
  const createForm = el('form', {})
  createForm.append(
    el('p', { className: 'muted', text: 'Создать новую группу' }),
    el('div', { className: 'field' }, [el('label', { text: 'Название' }), name]),
    el('div', { className: 'field' }, [el('label', { text: 'Факультет' }), faculty]),
    el('div', { className: 'field' }, [el('label', { text: 'Код старосты' }), code]),
    el('button', { className: 'btn secondary', type: 'submit', text: 'Создать группу' }),
  )
  createForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      const g = await createGroup({
        name: name.value,
        faculty: faculty.value,
        starostaCode: code.value,
      })
      flash(`Группа ${g.name} создана`)
    } catch (err) {
      flash(err.message, true)
    }
  })
  groupsSec.append(createForm)

  const delGroup = el(
    'select',
    {},
    listGroups().map((g) => el('option', { value: g.id, text: `${g.name}${g.faculty ? ' · ' + g.faculty : ''}` })),
  )
  groupsSec.append(
    el('div', { style: 'margin-top:16px' }, [
      el('p', {
        className: 'muted',
        text: 'Удалить группу (скроется из выбора у всех; ДЗ в базе останутся, но группа не видна)',
      }),
      el('div', { className: 'field' }, [el('label', { text: 'Группа' }), delGroup]),
      el('button', {
        type: 'button',
        className: 'btn danger',
        text: 'Удалить группу',
        onClick: async () => {
          const g = getGroup(delGroup.value)
          if (!g) return
          if (!confirm(`Удалить группу «${g.name}» из списка?`)) return
          try {
            await deactivateGroup(delGroup.value)
            if (state.groupId === delGroup.value) {
              state.groupId = ''
              localStorage.removeItem(SELECTED_GROUP_KEY)
            }
            flash(`Группа «${g.name}» удалена`)
            render()
          } catch (err) {
            flash(err.message || 'Не удалось удалить', true)
          }
        },
      }),
    ]),
  )

  const semGroup = el(
    'select',
    {},
    listGroups().map((g) => el('option', { value: g.id, text: g.name })),
  )
  groupsSec.append(
    el('div', { style: 'margin-top:16px' }, [
      el('p', {
        className: 'muted',
        text: 'Сброс семестра (удалит пары, ДЗ и замены группы)',
      }),
      el('div', { className: 'field' }, [el('label', { text: 'Группа' }), semGroup]),
      el('button', {
        type: 'button',
        className: 'btn danger',
        text: 'Сбросить расписание группы',
        onClick: async () => {
          if (!confirm('Точно сбросить расписание этой группы?')) return
          try {
            await resetSemester(semGroup.value)
            flash('Семестр сброшен')
          } catch (err) {
            flash(err.message, true)
          }
        },
      }),
    ]),
  )
  box.append(wrapAdminAcc('groups', 'Группы', [groupsSec]))
  } else {
    box.append(wrapAdminAcc('groups', 'Группы', null))
  }

  // —— Журнал безопасности (спойлер)
  if (isAdminSectionOpen('audit')) {
    box.append(renderAuditSection())
  } else {
    box.append(wrapAdminAcc('audit', 'Журнал безопасности', null))
  }

  return box
}

export function auditTitle(action) {
  return AUDIT_TITLES[action] || action || 'Действие'
}

/** Группа по id: «g_0903_пд3» → «0903-ПД3». */
export function auditGroupName(raw) {
  const id = String(raw || '')
  if (!id || id === '—') return ''
  const found = listGroups().find((g) => g.id === id)
  if (found) return found.name
  const guess = id.replace(/^g_/, '').replace(/_/g, '-').toUpperCase()
  return /^[0-9А-Я-]+$/.test(guess) ? guess : ''
}

export function auditWhen(iso) {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return '—'
  const today = new Date()
  const sameDay =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (sameDay) return `сегодня, ${time}`
  return `${formatDateRu(d.toISOString().slice(0, 10))}, ${time}`
}

/** Найти снимок нужной таблицы в записи журнала. */
export function auditSnapshot(row, tables) {
  const list = Array.isArray(row.undo) ? row.undo : []
  const names = Array.isArray(tables) ? tables : [tables]
  for (const item of list) {
    if (!item || !names.includes(item.tbl)) continue
    const rec = item.new || item.old
    if (rec && typeof rec === 'object') return { rec, item }
  }
  return null
}

/**
 * Главный разбор. Возвращает части карточки:
 *   who — кого касается, when — дата пары, from/to — было/стало,
 *   note — пояснение.
 */
export function parseAuditDetail(row) {
  const detail = String(row.detail || '').trim()
  const out = { who: '', when: '', from: '', to: '', note: '', raw: detail }
  if (!detail) return out

  // ── Отметка в журнале пары ──────────────────────────────────────────
  // «Иванов 2026-11-09 10:20 н/2→+/3 Разговаривала на паре»
  // «Иванов 2026-11-09 10:20 снята отметка»
  if (row.action === 'journal_mark') {
    const m = /^(.+?)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s*(.*)$/.exec(detail)
    if (m) {
      out.who = stripIds(m[1])
      out.when = auditDate(m[2]) + ', ' + m[3]
      const rest = m[4]

      const split = (chunk) => {
        // «явка/оценка текст»: н/2 → был/2. Оценка — ведущее число.
        const parts = String(chunk).split('/')
        const att = parts[0] || ''
        const tailText = parts.slice(1).join('/').trim()
        const gm = /^(\d)\s*(.*)$/.exec(tailText)
        return {
          att: att.trim(),
          grade: gm ? gm[1] : '',
          note: gm ? gm[2].trim() : tailText,
        }
      }
      const label = (part) => {
        const att = ATT_LABEL[part.att] !== undefined ? ATT_LABEL[part.att] : part.att
        return part.grade ? att + ' · ' + part.grade : att
      }

      if (rest.indexOf('→') >= 0) {
        const halves = rest.split('→')
        const b = split(halves[0])
        const a = split(halves[1])
        out.from = label(b)
        out.to = label(a)
        out.note = stripIds(a.note || b.note || '')
      } else if (/снята отметка/.test(rest)) {
        out.from = 'отметка была'
        out.to = 'отметки нет'
      } else if (rest) {
        out.note = stripIds(rest)
      }
      return out
    }
  }

  // ── Оценка поставлена ───────────────────────────────────────────────
  // «2026-11-09 10:20 +4»; кто — из снимка.
  if (row.action === 'journal_grade') {
    const snap = auditSnapshot(row, 'journal_grades')
    const rec = snap ? snap.rec : null
    const m = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s*\+?(\d?)(.*)$/.exec(detail)
    if (m) {
      out.when = auditDate(m[1]) + ', ' + m[2]
      const value = (rec && rec.value) || m[3]
      out.to = value ? 'оценка ' + value : 'оценка'
      if (rec && rec.subject) out.note = String(rec.subject)
      else if (stripIds(m[4])) out.note = stripIds(m[4])
      return out
    }
  }

  // ── Оценка удалена ──────────────────────────────────────────────────
  // «jg_72475fab26757fb7a0ae 2» — id и значение, id не показываем.
  if (row.action === 'journal_grade_delete') {
    const snap = auditSnapshot(row, 'journal_grades')
    const rec = snap ? snap.rec : null
    const m = /\s(\d)$/.exec(detail)
    const value = (rec && rec.value) || (m ? m[1] : '')
    out.to = value ? 'оценки ' + value + ' больше нет' : 'оценка удалена'
    const bits = []
    if (rec && rec.subject) bits.push(String(rec.subject))
    if (rec && rec.on_date) bits.push(auditDate(rec.on_date) + (rec.slot_start ? ', ' + rec.slot_start : ''))
    if (bits.length) out.note = bits.join(' · ')
    return out
  }

  // ── Смена роли ──────────────────────────────────────────────────────
  // «Петрова → starosta»
  if (row.action === 'student_role') {
    const m = /^(.+?)\s*→\s*(\w+)$/.exec(detail)
    if (m) {
      out.who = stripIds(m[1])
      out.to = 'теперь ' + roleRu(m[2])
      return out
    }
  }

  // ── Отметка на построении ───────────────────────────────────────────
  if (row.action === 'formation_mark') {
    const m = /^(.+?)\s+(\d{4}-\d{2}-\d{2})\s*(.*)$/.exec(detail)
    if (m) {
      out.who = stripIds(m[1])
      out.when = auditDate(m[2])
      const rest = stripIds(m[3])
      if (rest.indexOf('→') >= 0) {
        const halves = rest.split('→')
        const b = halves[0].trim()
        const a = halves[1].trim()
        out.from = ATT_LABEL[b] !== undefined ? ATT_LABEL[b] : b || 'без отметки'
        out.to = ATT_LABEL[a] !== undefined ? ATT_LABEL[a] : a
      } else if (rest) {
        out.to = ATT_LABEL[rest] !== undefined ? ATT_LABEL[rest] : rest
      }
      return out
    }
  }

  // ── Домашнее задание ────────────────────────────────────────────────
  // detail: «Никита · Тактико-специальная подготовка · hw_5ed4…»
  // Главное — не показать hw_…, а сказать, что за задание и что в нём.
  if (row.action === 'homework_add' || row.action === 'homework_delete') {
    const snap = auditSnapshot(row, 'homework')
    const rec = snap ? snap.rec : null
    const parts = detail.split(' · ')
    const subject = (rec && rec.subject) || (parts.length >= 2 ? parts[1] : '')
    out.to = subject ? '«' + subject + '»' : 'домашнее задание'
    const bits = []
    if (rec && rec.body) {
      const body = String(rec.body).trim()
      if (body) bits.push(body.length > 200 ? body.slice(0, 200) + '…' : body)
    }
    if (rec && rec.due_date) bits.push('сдать до ' + auditDate(rec.due_date))
    if (bits.length) out.note = bits.join(' · ')
    return out
  }

  // ── Новость ─────────────────────────────────────────────────────────
  if (row.action === 'news_add') {
    const snap = auditSnapshot(row, 'news')
    const rec = snap ? snap.rec : null
    const title = (rec && rec.title) || stripIds(detail)
    out.to = title ? '«' + title + '»' : 'новость'
    if (rec && rec.pinned) out.note = 'закреплена наверху'
    return out
  }

  // ── Программа (допобразование, кружок) ──────────────────────────────
  if (row.action === 'program_save') {
    const snap = auditSnapshot(row, 'programs')
    const rec = snap ? snap.rec : null
    const title = rec && rec.title ? String(rec.title) : ''
    const kind = rec && rec.kind === 'club' ? 'кружок' : 'допобразование'
    const legacy = /^(dpo|club):(.+)$/.exec(detail)
    if (title) {
      out.to = '«' + title + '»'
      out.note = kind
    } else if (legacy) {
      out.to = '«' + legacy[2] + '»'
      out.note = legacy[1] === 'club' ? 'кружок' : 'допобразование'
    } else {
      out.to = stripIds(detail) || 'программа'
    }
    return out
  }

  // ── Замены пар ──────────────────────────────────────────────────────
  if (row.action === 'override_set' || row.action === 'override_clear') {
    const TYPE_RU = {
      room_only: 'другой кабинет',
      subject: 'другая пара',
      subject_and_room: 'другая пара и кабинет',
      cancelled: 'пара отменена',
    }
    const snap = auditSnapshot(row, 'overrides')
    const rec = snap ? snap.rec : null
    if (row.action === 'override_clear') {
      out.from = 'замена была'
      out.to = 'замены нет'
      return out
    }
    if (rec) {
      out.to = TYPE_RU[rec.type] || 'замена'
      if (rec.on_date) out.when = auditDate(rec.on_date)
      const bits = []
      if (rec.new_subject) bits.push('предмет: ' + rec.new_subject)
      if (rec.new_room) bits.push('кабинет: ' + rec.new_room)
      if (rec.note) bits.push(rec.note)
      if (bits.length) out.note = bits.join(' · ')
      return out
    }
    const parts = detail.split(' · ')
    out.to = TYPE_RU[parts[1]] || 'замена'
    if (parts[2]) out.when = auditDate(parts[2])
    return out
  }

  // ── Входы ───────────────────────────────────────────────────────────
  if (row.action.indexOf('login_') === 0) {
    if (detail === 'ok' || detail === 'успешно') out.to = 'вход выполнен'
    else if (/bad code-prefix/.test(detail)) {
      out.to = 'неверный код'
      out.note = 'ввод отклонён, попытка записана'
    } else if (/blocked/.test(detail)) {
      out.to = 'вход заблокирован'
      out.note = 'слишком много попыток'
    } else if (/after fails/.test(detail)) {
      out.to = 'вход заблокирован после неудачных попыток'
    } else {
      out.to = stripIds(detail) || 'вход'
    }
    return out
  }

  // ── Откат действия ──────────────────────────────────────────────────
  if (row.action === 'audit_undo') {
    const m = /отменено действие «(\w+)»/.exec(detail)
    out.to = m ? 'отменено: ' + auditTitle(m[1]).toLowerCase() : 'действие отменено'
    const rows = /строк:\s*(\d+)/.exec(detail)
    if (rows) out.note = 'затронуто записей: ' + rows[1]
    return out
  }

  // ── Коды и админы ───────────────────────────────────────────────────
  if (/code|admin|curator|staff/i.test(row.action)) {
    const ACTION_RU = {
      starosta_code_add: 'выдан новый код',
      starosta_code_revoke: 'код отозван',
      starosta_label_rename: 'переименован код',
      starosta_role_title: 'изменена подпись роли',
      admin_display_name: 'изменено имя админа',
      admin_add: 'добавлен админ',
      admin_revoke: 'админ отозван',
      curator_add: 'добавлен куратор',
      curator_revoke: 'куратор отозван',
      staff_add: 'выдан доступ',
      staff_remove: 'доступ снят',
    }
    out.to = ACTION_RU[row.action] || 'изменение доступа'
    const clean = stripIds(detail.replace(/^(all|sessions_purged)\s*·?\s*/i, ''))
    if (clean) out.note = clean
    return out
  }

  // ── Настройки сайта и служебное ─────────────────────────────────────
  if (row.action === 'site_toggle' || row.action === 'set_site_enabled') {
    out.to = /false|off|0/.test(detail) ? 'сайт выключен' : 'сайт включён'
    return out
  }
  if (row.action === 'semester_reset') {
    out.to = 'расписание группы сброшено'
    return out
  }
  if (row.action === 'group_create') {
    const name = stripIds(detail)
    out.to = name ? 'создана группа ' + name : 'создана группа'
    return out
  }
  if (row.action === 'group_deactivate') {
    const name = stripIds(detail)
    out.to = name ? 'группа отключена: ' + name : 'группа отключена'
    return out
  }

  // ── Всё остальное: без id, человеческой фразой ──────────────────────
  const clean = stripIds(detail)
  out.to = clean || 'действие без подробностей'
  return out
}

export function renderAuditSection() {
  const logList = el('div', { className: 'audit-cards', text: 'Загрузка журнала…' })
  const csvBtn = el('button', {
    type: 'button',
    className: 'btn secondary',
    text: 'Скачать CSV',
    disabled: true,
    style: 'margin-top:10px',
  })
  const filterRow = el('div', { className: 'audit-filters' })
  let auditRows = []
  let activeFilter = 'all'

  const applyFilter = () => {
    if (!auditRows.length) return
    const test = (AUDIT_FILTERS.find(([id]) => id === activeFilter) || AUDIT_FILTERS[0])[2]
    const rows = auditRows.filter(test)
    logList.replaceChildren()
    if (!rows.length) {
      logList.append(el('p', { className: 'muted', text: 'В этом разделе пока пусто.' }))
      return
    }
    for (const row of rows) logList.append(auditCard(row, () => reload()))
  }

  const paintFilters = () => {
    filterRow.replaceChildren()
    for (const [id, label] of AUDIT_FILTERS) {
      filterRow.append(
        el('button', {
          type: 'button',
          className: `chip audit-chip${activeFilter === id ? ' chip-active' : ''}`,
          text: label,
          onClick: () => {
            activeFilter = id
            paintFilters()
            applyFilter()
          },
        }),
      )
    }
  }

  const reload = () => {
    logList.replaceChildren(el('p', { className: 'muted', text: 'Загрузка журнала…' }))
    fetchAuditLog(200)
      .then((rows) => {
        auditRows = rows
        csvBtn.disabled = !rows.length
        if (!rows.length) {
          logList.replaceChildren(
            el('p', {
              className: 'muted',
              text: 'Пока пусто — или выполни SQL security_audit.sql в Supabase.',
            }),
          )
          return
        }
        applyFilter()
      })
      .catch((err) => {
        logList.replaceChildren(
          el('p', { className: 'muted', text: err.message || 'Не удалось загрузить журнал' }),
        )
      })
  }

  csvBtn.addEventListener('click', () => {
    if (!auditRows.length) {
      flash('Журнал пуст', true)
      return
    }
    downloadAuditCsv(auditRows)
    flash('CSV скачан')
  })

  paintFilters()
  reload()

  return wrapAdminAcc('audit', 'Журнал безопасности', [
    el('div', {}, [
      el('p', {
        className: 'muted',
        style: 'margin:0 0 8px',
        text: 'Кто и что сделал. Красным — подозрительное. У действий админа есть кнопка «Откатить».',
      }),
      filterRow,
      logList,
      csvBtn,
    ]),
  ])
}

/** Одна карточка события. */
export function auditCard(row, onChanged) {
  const parsed = parseAuditDetail(row)
  const title = auditTitle(row.action)
  const actor = row.actor || (row.byRole === 'admin' ? 'Админ' : roleRu(row.byRole) || '—')
  const groupName = auditGroupName(row.groupId)

  const lines = []
  const meta = []
  if (parsed.who) meta.push(parsed.who)
  if (parsed.when) meta.push(parsed.when)
  if (groupName) meta.push(groupName)
  if (meta.length) lines.push(el('div', { className: 'audit-card-meta', text: meta.join(' · ') }))

  if (parsed.from || parsed.to) {
    lines.push(
      el('div', { className: 'audit-card-change' }, [
        parsed.from ? el('span', { className: 'audit-was', text: parsed.from }) : null,
        parsed.from && parsed.to ? el('span', { className: 'audit-arrow', text: '→' }) : null,
        parsed.to ? el('span', { className: 'audit-now', text: parsed.to }) : null,
      ]),
    )
  } else if (parsed.to) {
    lines.push(el('div', { className: 'audit-card-text', text: parsed.to }))
  }
  if (parsed.note) lines.push(el('div', { className: 'audit-card-note', text: parsed.note }))

  const tail = el('div', { className: 'audit-card-tail' }, [
    el('span', {
      className: 'audit-card-actor',
      text: row.ip ? `${actor} · ip ${row.ip}` : actor,
    }),
  ])

  if (row.undoneAt) {
    tail.append(
      el('span', {
        className: 'audit-undone',
        text: `откатано${row.undoneBy ? ` · ${row.undoneBy}` : ''}`,
      }),
    )
  } else if (row.canUndo) {
    const undoBtn = el('button', {
      type: 'button',
      className: 'audit-undo-btn',
      text: 'Откатить',
      onClick: async () => {
        const what = parsed.who ? `${parsed.who}` : title.toLowerCase()
        const change = parsed.from || parsed.to ? ` (${parsed.from || '—'} → ${parsed.to || '—'})` : ''
        if (!confirm(`Вернуть как было?\n\n${title}: ${what}${change}\n\nОтменить это будет нельзя.`)) return
        undoBtn.disabled = true
        undoBtn.textContent = 'Откатываем…'
        try {
          const res = await undoAudit(row.id)
          flash(`Откатано · ${res?.rows || 0} строк`)
          onChanged()
        } catch (err) {
          undoBtn.disabled = false
          undoBtn.textContent = 'Откатить'
          flash(err.message, true)
        }
      },
    })
    tail.append(undoBtn)
  }

  return el(
    'div',
    { className: `audit-card${row.suspicious ? ' audit-card--warn' : ''}` },
    [
      el('div', { className: 'audit-card-head' }, [
        el('strong', { className: 'audit-card-title', text: title }),
        el('span', { className: 'audit-card-when', text: auditWhen(row.at) }),
      ]),
      ...lines,
      tail,
    ],
  )
}

export function downloadAuditCsv(rows) {
  const header = ['at', 'action', 'byRole', 'actor', 'groupId', 'ip', 'detail', 'undoneAt', 'undoneBy', 'suspicious']
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [header.join(',')]
  for (const a of rows) {
    lines.push(
      [
        a.at || '',
        a.action || '',
        a.byRole || '',
        a.actor || '',
        a.groupId || '',
        a.ip || '',
        a.detail || '',
        a.undoneAt || '',
        a.undoneBy || '',
        a.suspicious ? '1' : '0',
      ]
        .map(esc)
        .join(','),
    )
  }
  const blob = new Blob([`\ufeff${lines.join('\n')}`], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const day = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `rasp-audit-${day}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export function renderLegalDoc(kind) {
  const lines = kind === 'terms' ? termsParagraphs() : privacyParagraphs()
  const title = lines[0]
  const body = lines.slice(1)
  return el('div', { className: 'panel' }, [
    el('button', {
      type: 'button',
      className: 'btn secondary',
      text: '← Назад',
      onClick: () => {
        state.legalDoc = null
        render()
      },
    }),
    el('div', { className: 'card legal-card' }, [
      el('h2', { text: title }),
      ...body.map((p) => el('p', { className: 'legal-p', text: p })),
    ]),
  ])
}
