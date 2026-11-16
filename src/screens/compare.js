// Экран «Сравнить с группой»: когда мы с другом можем пересечься.
//
// Считает три вида встреч: общая перемена, общее построение и общая пара
// в одном кабинете. Все данные уже лежат в телефоне (store), поэтому экран
// работает офлайн и не делает ни одного запроса на отрисовку.
//
// Отмену построения сервер отдаёт только «своим» группам, поэтому чужое
// построение по умолчанию считается по расписанию — и это на экране
// подписано честно, без обещаний, которых мы не можем проверить.

import { COMPARE_GROUP_KEY, state } from '../lib/app-state.js'
import { DAY_NAMES, DAY_SHORT } from '../data/seed.js'
import { compareDays, dayBlocks, minutesToHHMM, planFormation } from '../lib/group-compare.js'
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
import { dateForWeekday, formatDateRu, humanMins } from '../lib/time.js'
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
  home: 'дома (дистант)',
  formation: 'на построении',
  free: 'свободен',
}

/** Из чего состоит встреча. */
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
  const longest = result.meetings.reduce((best, m) => (m.minutes > (best?.minutes || 0) ? m : best), null)
  const kinds = []
  if (result.counts.break) kinds.push(`перемен: ${result.counts.break}`)
  if (result.counts.room) kinds.push(`общих пар: ${result.counts.room}`)
  if (result.counts.formation) kinds.push('построение вместе')

  const headline =
    result.counts.break && longest?.kind === 'break'
      ? `Самая длинная общая перемена — ${humanMins(longest.minutes)}`
      : longest?.kind === 'room'
        ? `Вы даже на одной паре — каб. ${longest.rooms.join('/')}`
        : longest?.kind === 'formation'
          ? 'Вы вместе на построении'
          : kinds.join(' · ')

  return {
    title: 'Пересекаетесь',
    detail: headline,
    meta: kinds.join(' · '),
    tone: 'yes',
  }
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
function renderTimeline(result) {
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
  return el('div', { className: 'cmp-timeline' }, [
    bar,
    el('div', { className: 'cmp-scale' }, [
      el('span', { text: minutesToHHMM(result.dayStart) }),
      el('span', { text: minutesToHHMM(result.dayEnd) }),
    ]),
  ])
}

/** Строка встречи: «12:10–13:20 · перемена 70 мин». */
function renderMeetingRow(m, index) {
  const time = `${minutesToHHMM(m.start)}–${minutesToHHMM(m.end)}`
  const sub =
    m.kind === 'break'
      ? `${MEETING_LABEL.break} · ${humanMins(m.minutes)}`
      : m.kind === 'formation'
        ? `${MEETING_LABEL.formation} · ${humanMins(m.minutes)}`
        : `${MEETING_LABEL.room} · каб. ${m.rooms.join('/')}`
  return el('article', { className: `cmp-meet is-${m.kind}` }, [
    el('span', { className: 'cmp-meet-num', text: String(index + 1) }),
    el('div', { className: 'cmp-meet-main' }, [
      el('strong', { text: time }),
      el('span', { className: 'cmp-meet-sub', text: sub }),
    ]),
    el('span', { className: 'cmp-meet-len', text: humanMins(m.minutes) }),
  ])
}

/** Подробная раскладка: кто где в каждый отрезок дня. */
function renderBreakdown(result, mineName, otherName) {
  const rows = result.segments.map((seg) =>
    el('div', { className: `cmp-row is-${seg.kind}` }, [
      el('span', { className: 'cmp-row-time', text: `${minutesToHHMM(seg.start)}–${minutesToHHMM(seg.end)}` }),
      el('span', { className: 'cmp-row-who' }, [
        el('span', { className: 'cmp-row-mine', text: STATE_LABEL[seg.a] || seg.a }),
        el('span', { className: 'cmp-row-other', text: STATE_LABEL[seg.b] || seg.b }),
      ]),
      seg.rooms.length ? el('span', { className: 'cmp-row-room', text: `каб. ${seg.rooms.join('/')}` }) : null,
    ]),
  )

  return el('details', { className: 'cmp-fold' }, [
    el('summary', { className: 'cmp-fold-head' }, [
      el('span', { text: 'Кто где по времени' }),
      el('span', { className: 'cmp-fold-hint', text: `${result.segments.length} отрезков` }),
    ]),
    el('div', { className: 'cmp-rows-head' }, [
      el('span', { text: 'время' }),
      el('span', { text: `${mineName} · ${otherName}` }),
    ]),
    el('div', { className: 'cmp-rows' }, rows),
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

  // ── День и данные
  const day = resolveCompareDay()
  const dateStr = dateForWeekday(day, 0)
  const days = daysForPair(mine.id, other.id)
  if (!days.includes(day)) days.push(day)

  const viewsMine = dayViews(mine.id, dateStr)
  const viewsOther = dayViews(other.id, dateStr)

  const settings = getAppSettings()
  const formationOpts = (group) => ({
    groupName: group?.name || '',
    faculty: group?.faculty || '',
    faculties: settings.formationFaculties || [],
    lead: settings.formationAutofillMinutes,
  })
  const formationMine = planFormation(viewsMine, formationOpts(mine))
  const formationOther = planFormation(viewsOther, formationOpts(other))

  // Своё построение: отмену знаем из state.formationDay (её грузит расписание).
  if (formationMine.show && state.formationDay?.cancelled) formationMine.skipped = true
  markOtherFormation(other.id, dateStr, formationOther)

  const result = compareDays({
    mine: { blocks: dayBlocks(viewsMine, formationMine) },
    other: { blocks: dayBlocks(viewsOther, formationOther) },
  })

  // ── Переключатель дня
  panel.append(
    el('div', { className: 'card cmp-day-card' }, [
      el(
        'div',
        { className: 'days cmp-days', role: 'tablist', 'aria-label': 'День недели' },
        days.map((d) =>
          el('button', {
            type: 'button',
            role: 'tab',
            className: d === day ? 'active' : '',
            'aria-selected': d === day ? 'true' : 'false',
            text: DAY_SHORT[d],
            onClick: () => {
              if (resolveCompareDay() === d) return
              hapticTap()
              state.compareDay = d
              render({ force: true })
            },
          }),
        ),
      ),
    ]),
  )

  // ── В этот день у кого-то нет пар: честно объясняем причину
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
      renderTimeline(result),
    ]),
  )

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
          result.meetings.map((m, i) => renderMeetingRow(m, i)),
        ),
      ]),
    )
  }

  // ── Подробно
  panel.append(
    el('div', { className: 'card cmp-detail' }, [
      renderBreakdown(result, mine.name, other.name),
      el('p', {
        className: 'muted cmp-note',
        text: 'Дистанционные пары считаются «дома»: в колледже в это время никого нет.',
      }),
      formationOther.show && state.compareFormationCancelled !== `${other.id}|${dateStr}`
        ? el('p', {
            className: 'muted cmp-note',
            text: `Построение ${other.name} показано по расписанию: отмену по чужой группе сайт видит, только если ты вошёл.`,
          })
        : null,
    ]),
  )

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
