// Экран «Сравнить с группой»: когда мы с другом можем пересечься.
//
// Считает три вида встреч: общая перемена, общее построение и общая пара
// в одном кабинете. Все данные уже лежат в телефоне (store), поэтому экран
// работает офлайн и не делает ни одного запроса на отрисовку.
//
// Главный принцип экрана: рядом с каждым временем видно НЕ «на паре», а
// конкретный предмет и кабинет обеих групп. Иначе сравнение бесполезно —
// человек всё равно не понимает, где искать другого.
//
// Отмену построения сервер отдаёт только «своим» группам, поэтому чужое
// построение по умолчанию считается по расписанию — и это на экране
// подписано честно, без обещаний, которые мы не можем проверить.

import { COMPARE_GROUP_KEY, state } from '../lib/app-state.js'
import { DAY_NAMES, DAY_SHORT } from '../data/seed.js'
import {
  compareDays,
  dayBlocks,
  minutesToHHMM,
  planFormation,
  scheduleRows,
  summarizeDays,
} from '../lib/group-compare.js'
import { el } from '../lib/security.js'
import { searchGroups } from '../lib/group-match.js'
import { getFormationDay } from '../lib/journal.js'
import { flash, hapticTap } from '../lib/ui-feedback.js'
import {
  canCompareGroups,
  getAppSettings,
  getGroup,
  getLessons,
  getOverridesForDate,
  getSession,
  lessonsForDate,
  listGroups,
  resolveLesson,
} from '../lib/store.js'
import { dateForWeekday, formatDateRu, humanMins, nowMinutesOfDay, todayISO } from '../lib/time.js'
import { hub } from '../app/hub.js'

// Эти функции живут в main.js — зовём их через мост, а не импортом (иначе цикл).
const render = (...args) => hub.render(...args)

/** Дни, в которые вообще бывают пары: Пн–Пт, а Сб — если он есть хоть у кого-то. */
function daysForPair(mineId, otherId) {
  const days = [1, 2, 3, 4, 5]
  const hasSat = (id) => !!id && getLessons(id, 6).length > 0
  if (hasSat(mineId) || hasSat(otherId)) days.push(6)
  return days
}

/** День сравнения: выбранный на этом экране, иначе тот, что открыт в расписании. */
function resolveCompareDay() {
  const d = Number(state.compareDay)
  if (d >= 1 && d <= 6) return d
  return state.day
}

/** Пары группы на дату с учётом замен: отменённые остаются, но помечены. */
function dayViews(groupId, dateStr) {
  const lessons = lessonsForDate(groupId, dateStr)
  const overs = getOverridesForDate(groupId, dateStr)
  return lessons.map((lesson) => {
    const ov = overs.find((o) => o.lessonId === lesson.id)
    const view = resolveLesson(lesson, ov)
    return {
      start: lesson.start,
      end: lesson.end || lesson.start,
      subject: view.effectiveSubject,
      room: view.effectiveRoom,
      remote: !!lesson.remote,
      cancelled: !!view.cancelled,
    }
  })
}

/** Как состояние называется для человека. */
const STATE_LABEL = {
  class: 'на паре',
  home: 'дома',
  formation: 'построение',
  free: 'свободен',
}

const MEETING_LABEL = {
  break: 'перемена',
  formation: 'построение',
  room: 'общая пара',
}

/** Склонение числительного: 1 место / 2 места / 5 мест. */
function placesWord(n) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'место'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'места'
  return 'мест'
}

/** Заголовок итога: сразу понятно, стоит ли читать дальше. */
function summaryTitle(result, otherName) {
  if (!result.counts.total) {
    return { title: 'Не пересекаетесь', detail: `С ${otherName} в этот день общих окон нет.`, tone: 'none' }
  }
  const breaks = result.meetings.filter((m) => m.kind === 'break')
  const rooms = result.meetings.filter((m) => m.kind === 'room')
  const forms = result.meetings.filter((m) => m.kind === 'formation')

  // Самое полезное — самая длинная перемена. Она и должна быть в заголовке.
  const longestBreak = breaks.reduce((best, m) => (m.minutes > (best?.minutes || 0) ? m : best), null)

  let detail
  if (longestBreak) {
    detail = `Самая длинная перемена — ${humanMins(longestBreak.minutes)}, в ${minutesToHHMM(longestBreak.start)}`
  } else if (rooms.length) {
    detail = `Вы даже на одной паре — каб. ${rooms[0].rooms.join('/')}`
  } else if (forms.length) {
    detail = 'Вы вместе на построении'
  } else {
    detail = 'Общих окон в этот день нет'
  }

  const parts = []
  if (breaks.length) parts.push(`перемен: ${breaks.length}`)
  if (rooms.length) parts.push(`общих пар: ${rooms.length}`)
  if (forms.length) parts.push('построение вместе')

  return { title: 'Пересекаетесь', detail, meta: parts.join(' · '), tone: 'yes' }
}

/**
 * Меньше этого «прямо сейчас» не считаем окном: если перемены осталось
 * 2 минуты, бежать через этаж уже поздно.
 */
const MIN_NOW_BREAK = 5

/**
 * «Прямо сейчас» — только для сегодняшнего дня.
 *
 * Смысл: когда человек стоит в коридоре, ему не нужно расписание на весь
 * день. Нужны два ответа: где друг прямо сейчас и сколько ждать до окна.
 */
function renderNowForToday(result, mineName, otherName, dateStr) {
  if (!dateStr || dateStr !== todayISO()) return null
  if (result.empty) return null

  const names = pairColumnNames(mineName, otherName)
  const now = nowMinutesOfDay()
  if (now < result.dayStart || now >= result.dayEnd) {
    return el('div', { className: 'card cmp-now is-over' }, [
      el('p', { className: 'cmp-now-title', text: 'На сегодня всё' }),
      el('p', { className: 'muted cmp-now-sub', text: 'Занятия в этот день уже закончились.' }),
    ])
  }

  // Текущий отрезок и ближайшее окно встречи
  const current = result.segments.find((s) => now >= s.start && now < s.end)
  const next = result.meetings.find((m) => m.start > now)

  // Та же правда, что в таблице: «Свободен» и «Занятия закончились» — разные
  // вещи. Раньше карточка говорила «Ты свободен», а строкой ниже таблица
  // писала «Занятия закончились», и это читалось как ошибка.
  const nowLine = (detail, finished) =>
    finished && detail.state === 'free' ? 'Занятия закончились' : groupLine(detail)

  const rows = []
  if (current) {
    rows.push(
      el('div', { className: 'cmp-now-line' }, [
        el('span', { className: 'cmp-now-who', text: 'Ты' }),
        el('span', { className: 'cmp-now-what', text: nowLine(current.mine, current.mineFinished) }),
      ]),
      el('div', { className: 'cmp-now-line' }, [
        el('span', { className: 'cmp-now-who', text: names.other }),
        el('span', { className: 'cmp-now-what', text: nowLine(current.other, current.otherFinished) }),
      ]),
    )
  }

  let headline
  let sub = ''
  // У кого-то занятия уже закончились — значит он не «свободен в колледже»,
  // а ушёл. Раньше карточка этого не видела и предлагала «идите друг к другу»
  // в тот момент, когда человек уже ехал домой.
  const mineGone = !!current?.mineFinished
  const otherGone = !!current?.otherFinished

  if (current && (mineGone || otherGone) && current.kind === 'break') {
    headline = mineGone && otherGone ? 'У обоих занятия закончились' : 'Занятия закончились не у всех'
    sub = mineGone
      ? `У тебя на сегодня всё, у ${names.other} ещё идут занятия.`
      : `У ${names.other} на сегодня всё, у тебя ещё идут занятия.`
  } else if (current && current.kind === 'break' && current.end - now >= MIN_NOW_BREAK) {
    headline = 'Вы оба свободны — можно идти друг к другу'
  } else if (current && current.kind === 'formation') {
    headline = 'Вы оба на построении'
  } else if (current && current.kind === 'room') {
    headline = `Вы оба в кабинете ${current.mine.room}`
  } else if (next) {
    headline = `Ближайшее окно — через ${humanMins(next.start - now)}`
    sub = `${minutesToHHMM(next.start)}–${minutesToHHMM(next.end)} · ${
      next.kind === 'break' ? 'перемена' : next.kind === 'formation' ? 'построение' : `каб. ${next.rooms.join('/')}`
    }`
  } else if (current && current.mine.state === 'class') {
    headline = 'Сейчас вы на разных парах'
    sub = 'Общих окон до конца дня больше нет'
  } else {
    headline = 'Сейчас общих окон нет'
  }

  return el('div', { className: 'card cmp-now' }, [
    el('p', { className: 'cmp-now-kicker', text: 'Сейчас' }),
    el('p', { className: 'cmp-now-title', text: headline }),
    sub ? el('p', { className: 'cmp-now-sub', text: sub }) : null,
    rows.length ? el('div', { className: 'cmp-now-rows' }, rows) : null,
  ])
}

/** Текст для отправки другу в мессенджер. */
export function comparisonText(result, mine, other, dayNumber, dateStr) {
  const head = `${DAY_NAMES[dayNumber] || ''}, ${formatDateRu(dateStr)} · ${mine?.name || ''} и ${other?.name || ''}`
  if (!result.counts.total) return `${head}\nВ этот день мы не пересекаемся.`
  const lines = [head, 'Где можем встретиться:']
  for (const m of result.meetings) {
    const time = `${minutesToHHMM(m.start)}–${minutesToHHMM(m.end)}`
    if (m.kind === 'break') lines.push(`• ${time} — перемена, ${humanMins(m.minutes)}`)
    else if (m.kind === 'formation') lines.push(`• ${time} — построение`)
    else lines.push(`• ${time} — одна пара, каб. ${m.rooms.join('/')}`)
  }
  return lines.join('\n')
}

/** Полоска дня: видно, где окна, а где пары. */
function renderTimeline(result, nowMin) {
  const span = result.dayEnd - result.dayStart
  if (span <= 0) return null
  const bar = el('div', { className: 'cmp-bar' })
  for (const seg of result.segments) {
    const width = ((seg.end - seg.start) / span) * 100
    if (width <= 0) continue
    bar.append(
      el('div', {
        className: `cmp-bar-seg is-${seg.kind}`,
        style: `width:${width.toFixed(3)}%`,
        title: `${minutesToHHMM(seg.start)}–${minutesToHHMM(seg.end)}`,
      }),
    )
  }

  // Где ты сейчас относительно дня: без этой чёрточки полоска показывает
  // «какие окна есть», но не «где я». Приходилось сопоставлять время в уме.
  const inDay = nowMin != null && nowMin >= result.dayStart && nowMin <= result.dayEnd
  const marker = inDay
    ? el('span', {
        className: 'cmp-bar-now',
        style: `left:${(((nowMin - result.dayStart) / span) * 100).toFixed(3)}%`,
        'aria-label': 'сейчас',
      })
    : null

  return el('div', { className: 'cmp-timeline' }, [
    el('div', { className: 'cmp-bar-wrap' }, [bar, marker]),
    el('div', { className: 'cmp-scale' }, [
      el('span', { text: minutesToHHMM(result.dayStart) }),
      inDay ? el('span', { className: 'cmp-scale-now', text: `сейчас ${minutesToHHMM(nowMin)}` }) : null,
      el('span', { text: minutesToHHMM(result.dayEnd) }),
    ]),
  ])
}

/**
 * Подписи колонок «своя / вторая».
 *
 * Год в начале («0901-ПД3») обычно срезается, чтобы не занимать ширину.
 * Но у 0901-ПД3 и 0903-ПД3 различие как раз в этих четырёх знаках: после
 * срезания обе колонки назывались «ПД3», и экран выглядел так, будто
 * группа сравнивается сама с собой. Поэтому при совпадении год возвращаем.
 */
function pairColumnNames(mineName, otherName) {
  const strip = (n) => String(n || '').replace(/^\d{4}-/, '') || String(n || '')
  const mine = strip(mineName)
  const other = strip(otherName)
  if (mine === other) {
    return { mine: String(mineName || ''), other: String(otherName || ''), full: true }
  }
  return { mine, other }
}

/**
 * Что у группы в этот отрезок — одной строкой.
 * «Литература · каб. 413», «Свободен», «Дома (дистант)».
 */
function groupLine(detail) {
  if (detail.state === 'free') return 'Свободен'
  if (detail.state === 'home') {
    return detail.subject ? `Дома · ${detail.subject}` : 'Дома (дистант)'
  }
  if (detail.state === 'formation') return 'Построение'
  const room = detail.room ? ` · каб. ${detail.room}` : ''
  return `${detail.subject || 'Пара'}${room}`
}

/** Строка встречи: «12:10–13:20 · перемена 70 мин». */
function renderMeetingRow(m, index, nowMin) {
  const time = `${minutesToHHMM(m.start)}–${minutesToHHMM(m.end)}`
  let sub
  if (m.kind === 'break') sub = `${MEETING_LABEL.break} · ${humanMins(m.minutes)}`
  else if (m.kind === 'formation') sub = `${MEETING_LABEL.formation} · ${humanMins(m.minutes)}`
  else sub = `${MEETING_LABEL.room} · каб. ${m.rooms.join('/')}`

  // Идёт ли это окно в данную минуту — тогда помечаем, чтобы не искать
  // в списке «а которое из них сейчас».
  const live = nowMin != null && nowMin >= m.start && nowMin < m.end

  return el('article', { className: `cmp-meet is-${m.kind}${live ? ' is-now' : ''}` }, [
    el('span', { className: 'cmp-meet-num', text: String(index + 1) }),
    el('div', { className: 'cmp-meet-main' }, [
      el('strong', { text: time }),
      el('span', { className: 'cmp-meet-sub', text: sub }),
    ]),
    live
      ? el('span', { className: 'cmp-meet-live', text: 'сейчас' })
      : el('span', { className: 'cmp-meet-len', text: humanMins(m.minutes) }),
  ])
}

/**
 * Расписание рядом: две колонки с предметами и кабинетами.
 * Это главный блок экрана — по нему видно, где искать другого.
 */
function renderSideBySide(result, mineName, otherName, nowMin) {
  const rows = scheduleRows(result)
  if (!rows.length) return null

  const names = pairColumnNames(mineName, otherName)

  // Подсветка берётся ИЗ ТОГО ЖЕ списка встреч, что показан выше.
  // Иначе получалось: в таблице 4 подсвеченных строки, а в списке 2 —
  // два разных правила давали два разных ответа на один вопрос.
  const isMeeting = (seg) =>
    result.meetings.some((m) => m.start === seg.start && m.end === seg.end && m.kind === seg.kind)

  // «Сейчас» вычисляется выше только для сегодняшнего дня. Если день другой,
  // nowMin равен null и обводки не будет вовсе.
  const isLive = (seg) => nowMin != null && nowMin >= seg.start && nowMin < seg.end

  const body = rows.map((seg) => {
    const time = `${minutesToHHMM(seg.start)}–${minutesToHHMM(seg.end)}`
    const meet = isMeeting(seg)
    const live = isLive(seg)

    // Если у группы в этот момент занятия уже закончились — она не «свободна»,
    // она ушла. Иначе «свободен» в 17:00 выглядит как приглашение подождать.
    const cellLine = (detail, finished) => {
      if (finished && detail.state === 'free') return 'Занятия закончились'
      return groupLine(detail)
    }

    // У каждой колонки своя обводка: у меня и у второй группы пары разные,
    // и подсвечивать обе одним цветом значило бы потерять главное различие.
    //
    // Метку не ставим группе, которая уже ушла: рядом с «Занятия закончились»
    // слово «сейчас» читалось как противоречие.
    const cell = (detail, finished, side) => {
      const gone = finished && detail.state === 'free'
      return el('span', { className: 'cmp-pairrow-cell' }, [
        el('span', {
          className: `cmp-pairrow-sub${detail.state === 'class' ? ' is-class' : ''}${
            gone ? ' is-done' : ''
          }`,
          text: cellLine(detail, finished),
        }),
        live && !gone
          ? el('span', {
              className: `cmp-pairrow-live is-${side}${detail.state === 'class' ? ' is-busy' : ''}`,
              // «Свободен» и «сейчас» рядом читалось так, будто человек
              // свободен именно в эту минуту, хотя у него идёт пара.
              text: detail.state === 'class' ? 'сейчас на паре' : 'сейчас свободен',
            })
          : null,
      ])
    }

    return el(
      'div',
      { className: `cmp-pairrow${meet ? ' is-meet' : ''}${live ? ' is-now' : ''} is-${seg.kind}` },
      [
        el('span', { className: 'cmp-pairrow-time', text: time }),
        cell(seg.mine, seg.mineFinished, 'mine'),
        cell(seg.other, seg.otherFinished, 'other'),
      ],
    )
  })

  return el('div', { className: 'card cmp-side' }, [
    el('div', { className: 'cmp-side-head' }, [
      el('h3', { text: 'Расписание рядом' }),
      el('span', { className: 'cmp-side-hint', text: 'кабинет виден сразу' }),
    ]),
    el('div', { className: 'cmp-pairhead' }, [
      el('span', { className: 'cmp-pairhead-time', text: 'время' }),
      el('span', { className: `cmp-pairhead-name${names.full ? ' is-full' : ''}`, text: names.mine }),
      el('span', { className: `cmp-pairhead-name${names.full ? ' is-full' : ''}`, text: names.other }),
    ]),
    el('div', { className: 'cmp-pairtable' }, body),
    el('div', { className: 'cmp-legend' }, [
      el('span', { className: 'cmp-legend-item is-break', text: 'перемена' }),
      el('span', { className: 'cmp-legend-item is-formation', text: 'построение' }),
      el('span', { className: 'cmp-legend-item is-room', text: 'один кабинет' }),
      nowMin != null ? el('span', { className: 'cmp-legend-item is-now', text: 'сейчас' }) : null,
    ]),
  ])
}

/** Выбор второй группы: тот же поиск, что и при выборе своей. */
function renderOtherPicker(onPick) {
  const all = listGroups().filter((g) => g.id !== state.groupId)
  const input = el('input', {
    type: 'search',
    id: 'cmp-group-search',
    placeholder: 'Поиск группы…',
    autocomplete: 'off',
    enterKeyHint: 'search',
    'aria-label': 'Поиск второй группы',
  })
  const list = el('div', { className: 'group-list cmp-group-list' })

  const paint = () => {
    const query = input.value.trim()
    let rows = all
    if (query) {
      const hits = searchGroups(all, query)
      // Сначала только «ключ внутри названия»: иначе на «пд5» прилетят
      // дальние группы по опечатке и список станет бесполезным.
      const strong = hits.filter((h) => h.why === 'exact' || h.why === 'prefix' || h.why === 'inside')
      rows = (strong.length ? strong : hits).map((h) => h.group)
    }
    const nodes = rows.length
      ? rows.map((g) =>
          el(
            'button',
            {
              type: 'button',
              className: 'group-pick-btn',
              onClick: (e) => onPick(g, e.currentTarget),
            },
            [el('strong', { text: g.name }), el('span', { text: g.faculty ? `Факультет ${g.faculty}` : ' ' })],
          ),
        )
      : [el('p', { className: 'muted cmp-empty-hint', text: 'Ничего не нашлось. Попробуй «0903» или «ПД5».' })]
    // replaceChildren здесь безопасен только потому, что поле поиска лежит
    // ВНЕ списка — оно не пересоздаётся и клавиатура не закрывается.
    list.replaceChildren(...nodes)
  }
  input.addEventListener('input', paint)
  paint()

  return el('div', { className: 'cmp-picker' }, [
    el('div', { className: 'search' }, [input]),
    list,
  ])
}

/** Выбрать вторую группу и запомнить её между заходами. */
function pickOtherGroup(group, btn) {
  hapticTap()
  if (btn) {
    btn.classList.add('is-picked')
    btn.setAttribute('aria-pressed', 'true')
  }
  state.compareGroupId = group.id
  state.compareDay = 0
  try {
    localStorage.setItem(COMPARE_GROUP_KEY, group.id)
  } catch {
    /* ignore */
  }
  window.setTimeout(() => render({ force: true }), 140)
}

/** Заголовок «Моя группа ↔ Группа друга». */
function renderPairCard(mine, other) {
  const kids = [
    el('h3', { text: 'Сравнить с группой' }),
    el('p', {
      className: 'muted',
      style: 'margin:0 0 12px',
      text: 'Покажем, когда вы можете пересечься: общие перемены, построение и пары в одном кабинете.',
    }),
    el('div', { className: 'cmp-pair' }, [
      el('div', { className: 'cmp-pair-side' }, [
        el('span', { className: 'cmp-pair-role', text: 'Моя' }),
        el('strong', { text: mine.name }),
      ]),
      el('span', { className: 'cmp-pair-x', text: '↔', 'aria-hidden': 'true' }),
      el('div', { className: 'cmp-pair-side is-other' }, [
        el('span', { className: 'cmp-pair-role', text: 'С кем' }),
        other ? el('strong', { text: other.name }) : el('span', { className: 'muted', text: 'выбери ниже' }),
      ]),
    ]),
  ]
  if (other) {
    kids.push(
      el('button', {
        type: 'button',
        className: 'btn secondary cmp-change',
        text: 'Сменить группу',
        onClick: () => {
          state.compareGroupId = ''
          state.compareFormationChecked = ''
          state.compareFormationCancelled = ''
          try {
            localStorage.removeItem(COMPARE_GROUP_KEY)
          } catch {
            /* ignore */
          }
          render({ force: true })
        },
      }),
    )
  }
  return el('div', { className: 'card cmp-head' }, kids)
}

/**
 * Отмену построения своей группы знаем локально, чужой — только с сервера
 * и только если человек вошёл. Один раз спрашиваем; если статус изменился,
 * перерисовываем — чтобы «вместе на построении» не осталось враньём.
 */
function markOtherFormation(groupId, dateStr, formation) {
  if (!formation?.show) return
  const session = getSession()
  if (!session?.token) return
  const key = `${groupId}|${dateStr}`
  if (state.compareFormationChecked === key) {
    if (state.compareFormationCancelled === key) formation.skipped = true
    return
  }
  state.compareFormationChecked = key
  getFormationDay(groupId, dateStr)
    .then((day) => {
      if (state.compareFormationChecked !== key) return
      if (day?.cancelled) {
        state.compareFormationCancelled = key
        if (state.compareGroupId) render({ force: true })
      }
    })
    .catch(() => {
      if (state.compareFormationChecked === key) state.compareFormationChecked = ''
    })
}

/**
 * Экран сравнения. Перерисовывается через `render({ force: true })` —
 * поэтому всё состояние (кто вторая группа, какой день) живёт в `state`,
 * а не в замыканиях: иначе перерисовка его бы стёрла.
 */
export function renderCompare() {
  const panel = el('div', { className: 'panel cmp-screen' }, [
    el('button', {
      type: 'button',
      className: 'btn secondary',
      text: '← Профиль',
      onClick: () => {
        state.moreScreen = ''
        render({ force: true })
      },
    }),
  ])

  // Право проверяем на входе: экран не должен показывать сравнение тому,
  // кому админ его не выдал, даже если состояние подставили вручную.
  const session = getSession()
  if (!canCompareGroups(session)) {
    panel.append(
      el('div', { className: 'card cmp-empty' }, [
        el('h3', { text: 'Сравнение не подключено' }),
        el('p', {
          className: 'muted',
          style: 'margin:0',
          text: session
            ? 'Эта функция выдаётся по коду. Попроси администратора включить её для тебя — вместе с кодом входа.'
            : 'Сначала войди по своему коду, потом попроси администратора выдать доступ к сравнению.',
        }),
      ]),
    )
    return panel
  }

  const mine = getGroup(state.groupId)
  if (!mine) {
    panel.append(
      el('p', { className: 'muted', text: 'Сначала выбери свою группу — тогда будет с чем сравнивать.' }),
    )
    return panel
  }

  const other = state.compareGroupId ? getGroup(state.compareGroupId) : null
  panel.append(renderPairCard(mine, other))

  // ── Вторая группа ещё не выбрана
  if (!other) {
    panel.append(
      el('div', { className: 'card' }, [
        el('p', { className: 'muted', style: 'margin:0 0 10px', text: 'С кем сравниваем? Выбор запомнится.' }),
        renderOtherPicker(pickOtherGroup),
      ]),
    )
    return panel
  }

  // ── Настройки расписания
  const settings = getAppSettings()
  const formationOpts = (group) => ({
    groupName: group?.name || '',
    faculty: group?.faculty || '',
    faculties: settings.formationFaculties || [],
    lead: settings.formationAutofillMinutes,
  })

  const day = resolveCompareDay()
  const dateStr = dateForWeekday(day, 0)
  const days = daysForPair(mine.id, other.id)
  if (!days.includes(day)) days.push(day)

  // Данные по всем дням сразу: нужно, чтобы на кнопках дней было видно,
  // где вообще есть встречи — иначе приходится щёлкать все пять подряд.
  const perDay = days.map((d) => {
    const ds = dateForWeekday(d, 0)
    const vMine = dayViews(mine.id, ds)
    const vOther = dayViews(other.id, ds)
    const fMine = planFormation(vMine, formationOpts(mine))
    const fOther = planFormation(vOther, formationOpts(other))
    return {
      day: d,
      dateStr: ds,
      vMine,
      vOther,
      fMine,
      fOther,
      mine: { blocks: dayBlocks(vMine, fMine) },
      other: { blocks: dayBlocks(vOther, fOther) },
    }
  })
  const daySummary = new Map(
    summarizeDays(perDay.map((p) => ({ day: p.day, mine: p.mine, other: p.other }))).map((s) => [s.day, s]),
  )

  const current = perDay.find((p) => p.day === day) || perDay[0]
  const viewsMine = current.vMine
  const viewsOther = current.vOther
  const formationMine = current.fMine
  const formationOther = current.fOther

  // Своё построение: отмену знаем из state.formationDay (её грузит расписание).
  if (formationMine.show && state.formationDay?.cancelled) formationMine.skipped = true
  markOtherFormation(other.id, dateStr, formationOther)

  const result = compareDays({
    mine: { blocks: dayBlocks(viewsMine, formationMine) },
    other: { blocks: dayBlocks(viewsOther, formationOther) },
  })

  // ── Переключатель дня: точка = есть встречи
  panel.append(
    el('div', { className: 'card cmp-day-card' }, [
      el(
        'div',
        { className: 'days cmp-days', role: 'tablist', 'aria-label': 'День недели' },
        days.map((d) => {
          const s = daySummary.get(d)
          const btn = el('button', {
            type: 'button',
            role: 'tab',
            className: d === day ? 'active' : '',
            'aria-selected': d === day ? 'true' : 'false',
            title: s?.total ? `встреч: ${s.total}` : 'встреч нет',
            onClick: () => {
              if (resolveCompareDay() === d) return
              hapticTap()
              state.compareDay = d
              render({ force: true })
            },
          }, [
            el('span', { className: 'cmp-day-label', text: DAY_SHORT[d] }),
            s?.total
              ? el('span', { className: 'cmp-day-dot', text: String(s.total) })
              : el('span', { className: 'cmp-day-dot is-empty', text: '·' }),
          ])
          return btn
        }),
      ),
      el('p', { className: 'muted cmp-day-hint', text: 'Цифра — сколько у вас общих окон в этот день.' }),
    ]),
  )

  // ── В этот день у кого-то нет пар
  const noLessonsMine = !viewsMine.length
  const noLessonsOther = !viewsOther.length
  if (noLessonsMine || noLessonsOther) {
    const text =
      noLessonsMine && noLessonsOther
        ? 'Занятий нет ни у тебя, ни у второй группы.'
        : noLessonsMine
          ? `У тебя в этот день занятий нет, а ${other.name} учится.`
          : `У ${other.name} в этот день занятий нет, а ты учишься.`
    panel.append(
      el('div', { className: 'card cmp-empty' }, [
        el('h3', { text: 'В этот день пар нет' }),
        el('p', { className: 'muted', style: 'margin:0', text: `${text} Выбери другой день.` }),
      ]),
    )
    return panel
  }

  // ── Итог
  const summary = summaryTitle(result, other.name)
  // Текущее время имеет смысл только для сегодняшнего дня: если открыт
  // понедельник, а сегодня среда, обводить «11:30» было бы враньём.
  const nowMin = dateStr === todayISO() ? nowMinutesOfDay() : null

  panel.append(
    el('div', { className: `card cmp-summary is-${summary.tone}` }, [
      el('p', { className: 'cmp-summary-day', text: `${DAY_NAMES[day] || ''} · ${formatDateRu(dateStr)}` }),
      el('h2', { className: 'cmp-summary-title', text: summary.title }),
      el('p', { className: 'cmp-summary-count' }, [
        el('strong', { text: String(result.counts.total) }),
        el('span', { text: ` ${placesWord(result.counts.total)}` }),
      ]),
      summary.detail ? el('p', { className: 'cmp-summary-detail', text: summary.detail }) : null,
      summary.meta ? el('p', { className: 'cmp-summary-meta', text: summary.meta }) : null,
      renderTimeline(result, nowMin),
    ]),
  )

  // ── Сегодня: где мы прямо сейчас и когда ближайшее окно
  const nowCard = renderNowForToday(result, mine.name, other.name, dateStr)
  if (nowCard) panel.append(nowCard)

  // ── Встречи
  if (result.meetings.length) {
    panel.append(
      el('div', { className: 'card cmp-meets' }, [
        el('div', { className: 'cmp-meets-head' }, [
          el('h3', { text: 'Где встретитесь' }),
          el('div', { className: 'cmp-legend' }, [
            el('span', { className: 'cmp-legend-item is-break', text: 'перемена' }),
            el('span', { className: 'cmp-legend-item is-formation', text: 'построение' }),
            el('span', { className: 'cmp-legend-item is-room', text: 'кабинет' }),
          ]),
        ]),
        el(
          'div',
          { className: 'cmp-meet-list' },
          result.meetings.map((m, i) => renderMeetingRow(m, i, nowMin)),
        ),
      ]),
    )
  }

  // ── Главное: расписание рядом с предметами и кабинетами
  const side = renderSideBySide(result, mine.name, other.name, nowMin)
  if (side) panel.append(side)

  // ── Отправить другу
  panel.append(
    el('button', {
      type: 'button',
      className: 'btn cmp-copy',
      text: 'Скопировать и отправить другу',
      onClick: async () => {
        const text = comparisonText(result, mine, other, day, dateStr)
        try {
          await navigator.clipboard.writeText(text)
          flash('Скопировано — вставляй в чат')
        } catch {
          flash(text)
        }
      },
    }),
  )

  return panel
}
