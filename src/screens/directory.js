// Вкладка «Справочник»: поиск преподавателя или свободной аудитории
// по дате и паре.
//
// Два режима в одном экране: по преподавателю и по аудитории. Результаты
// собираются отдельными функциями, чтобы не дублировать разметку.

import { state } from '../lib/app-state.js'
import { formatDateRu, hhmmToMinutes, normalizeSuggestKey, nowMinutesOfDay, teacherDateLabel, todayISO } from '../lib/time.js'
import { el } from '../lib/security.js'
import { findRoomSlots, findTeacherSlots, findTeacherUpcoming, listDayPairSlots, listScheduleRooms, suggestRooms, suggestTeachers } from '../lib/store.js'
import { DAY_NAMES } from '../data/seed.js'
import { hub } from '../app/hub.js'

// Эти функции живут в main.js — зовём их через мост, а не импортом (иначе цикл).
const gotoTab = (...args) => hub.gotoTab(...args)
const render = (...args) => hub.render(...args)

/** Кликабельный номер аудитории: открывает вкладку «Преп.» в режиме аудитории. */
export function roomLink(room) {
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

export function renderTeacherSlotCard(s) {
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

export function renderTeachersTab() {
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
export function renderRoomSearch() {
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

export function buildRoomResultsNodes(input, dateInput, paintResults) {
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

export function renderRoomSlotCard(s) {
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

export function renderTeacherSearch() {
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

export function buildTeacherResultsNodes(input, dateInput, paintResults) {
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

export function resolveFreeRoomsSlotKey(dateStr, preferred) {
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
