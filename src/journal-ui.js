import { el } from './lib/security.js'
import {
  addGrade as addGradeRpc,
  addStudent,
  attendanceShort,
  buildJournalReport,
  canGradeGroup,
  deleteGrade as deleteGradeRpc,
  GRADE_KINDS,
  listJournalMarks,
  listLessonGrades,
  listMyMarks,
  listStudents,
  newStudentCode,
  setOwnStudentCode,
  setStudentCode,
  setStudentRole,
  upsertMark,
} from './lib/journal.js'
import { DAY_SHORT } from './data/seed.js'
import { getSession } from './lib/store.js'

let journalError = ''

const ATTS = [
  ['present', '+'],
  ['absent', 'н'],
  ['sick', 'б'],
  ['duty', 'нар'],
  ['event', 'мп'],
  ['excused', 'отп'],
]

function markKey(studentId, start, end) {
  return `${studentId}|${start}|${end}`
}

function gradeClass(value, attendance) {
  if (attendance === 'absent' || attendance === 'sick') return 'grade-bad'
  if (value == null) return ''
  if (value === 5) return 'grade-5'
  if (value === 4) return 'grade-4'
  if (value === 3) return 'grade-3'
  return 'grade-bad'
}

export function renderGradesTab(ctx) {
  const session = getSession()
  const wrap = el('div', { className: 'panel grades-panel' })
  if (!session) {
    wrap.append(
      el('div', { className: 'card' }, [
        el('h3', { text: 'Оценки' }),
        el('p', {
          className: 'muted',
          text: 'Студент входит личным кодом и видит только свои оценки. Староста и преподаватель входят своим кодом и ставят отметки в паре.',
        }),
      ]),
    )
    return wrap
  }
  if (session.role === 'student') {
    wrap.append(renderStudentDiary(ctx, session))
    return wrap
  }
  if (canGradeGroup(session, ctx.state.groupId)) {
    wrap.append(renderEditorGradesHome(ctx))
    return wrap
  }
  wrap.append(
    el('div', { className: 'card' }, [
      el('h3', { text: 'Оценки' }),
      el('p', { className: 'muted', text: 'Этот код не ставит оценки в выбранной группе.' }),
    ]),
  )
  return wrap
}

function renderEditorGradesHome(ctx) {
  const group = ctx.getGroup(ctx.state.groupId)
  if (!group) {
    return el('div', { className: 'card' }, [
      el('h3', { text: 'Журнал' }),
      el('p', { className: 'muted', text: 'Сначала выбери группу.' }),
    ])
  }
  const date = ctx.dateForWeekday(ctx.state.day)
  const lessons = ctx.getLessons(group.id).filter((l) => Number(l.day) === Number(ctx.state.day))

  // Свой переключатель дней: раньше день менялся только на вкладке «Пары».
  const hasSat = ctx.getLessons(group.id, 6).length > 0
  const dayChips = el(
    'div',
    { className: 'due-quick journal-days' },
    (hasSat ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]).map((d) =>
      el('button', {
        type: 'button',
        className: `chip${Number(ctx.state.day) === d ? ' chip-active' : ''}`,
        text: DAY_SHORT[d],
        onClick: () => {
          if (Number(ctx.state.day) === d) return
          ctx.setDay(d)
        },
      }),
    ),
  )

  const box = el('div', { className: 'card journal-day' }, [
    el('div', { className: 'journal-day-top' }, [
      el('h3', { text: group.name }),
      el('span', { className: 'muted', text: ctx.formatDateRu(date) }),
    ]),
    dayChips,
  ])
  if (!lessons.length) {
    box.append(
      el('p', {
        className: 'muted',
        text: 'В этот день пар нет — выбери другой день выше.',
      }),
    )
    return box
  }
  lessons.forEach((lesson, idx) => {
    box.append(
      el(
        'button',
        {
          type: 'button',
          className: 'journal-pick',
          onClick: () => {
            ctx.state.journal = {
              groupId: group.id,
              date,
              lessonId: lesson.id,
              start: lesson.start,
              end: lesson.end,
              subject: lesson.subject,
            }
            ctx.render()
          },
        },
        [
          el('span', { className: 'journal-pick-n', text: String(idx + 1) }),
          el('span', { className: 'journal-pick-main' }, [
            el('strong', { text: lesson.subject }),
            el('span', { className: 'muted', text: `${lesson.start}–${lesson.end}` }),
          ]),
          el('span', { className: 'journal-pick-go', text: '›' }),
        ],
      ),
    )
  })
  return box
}

function renderOwnCodeForm(ctx) {
  const input = el('input', {
    maxlength: '64',
    placeholder: 'Новый код, от 8 символов',
    autocomplete: 'off',
  })
  const form = el('form', { className: 'journal-add' })
  form.append(input, el('button', { className: 'journal-link', type: 'submit', text: 'Сменить свой код' }))
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      await setOwnStudentCode(input.value)
      ctx.flash('Код обновлён. В следующий раз входи им.')
      input.value = ''
    } catch (err) {
      ctx.flash(err.message, true)
    }
  })
  return el('div', { className: 'card' }, [
    el('h3', { text: 'Сменить код' }),
    form,
  ])
}

function renderStudentDiary(ctx, session) {
  const mode = ctx.state.gradesMode === 'final' ? 'final' : 'current'
  const wrap = el('div', { className: 'diary' })
  const switcher = el('div', { className: 'diary-switch' }, [
    el('button', {
      type: 'button',
      className: `chip${mode === 'current' ? ' chip-active' : ''}`,
      text: 'Текущие оценки',
      onClick: () => {
        ctx.state.gradesMode = 'current'
        ctx.render()
      },
    }),
    el('button', {
      type: 'button',
      className: `chip${mode === 'final' ? ' chip-active' : ''}`,
      text: 'Итоговые',
      onClick: () => {
        ctx.state.gradesMode = 'final'
        ctx.render()
      },
    }),
  ])
  wrap.append(switcher)

  const body = el('div', { text: 'Загружаем…' })
  wrap.append(body)
  // Один запрос на оба режима: «Итоговые» считаются из тех же строк.
  listMyMarks()
    .then((rows) => {
      if (mode === 'final') paintFinal(body, rows)
      else paintDiary(ctx, body, rows)
    })
    .catch((err) => {
      body.replaceChildren(
        el('p', { className: 'muted', text: err.message || 'Не удалось загрузить оценки' }),
      )
    })
  return wrap
}

/** Средний балл → предполагаемая итоговая. 4.5 и выше — 5, 3.5 — 4 и т.д. */
function projectedGrade(avg) {
  if (!Number.isFinite(avg)) return null
  if (avg >= 4.5) return 5
  if (avg >= 3.5) return 4
  if (avg >= 2.5) return 3
  return 2
}

/**
 * «Итоговые»: сводка по предметам — средний балл, сколько оценок, прогноз и пропуски.
 * Никаких новых запросов и таблиц: всё считается из тех же строк, что и текущие.
 */
function paintFinal(body, rows) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) {
    body.replaceChildren(
      el('div', { className: 'empty', text: 'Пока нет оценок — итоговым неоткуда взяться.' }),
    )
    return
  }

  const bySubject = new Map()
  for (const row of list) {
    const key = String(row.subject || 'Предмет').trim() || 'Предмет'
    if (!bySubject.has(key)) {
      bySubject.set(key, { grades: [], absent: 0, total: 0 })
    }
    const acc = bySubject.get(key)
    acc.total += 1
    const att = String(row.attendance || 'present')
    if (att === 'absent' || att === 'sick') acc.absent += 1
    const n = Number(row.grade)
    if (Number.isFinite(n) && n >= 2 && n <= 5) acc.grades.push(n)
  }

  const subjects = [...bySubject.entries()].map(([subject, acc]) => {
    const avg = acc.grades.length
      ? acc.grades.reduce((a, b) => a + b, 0) / acc.grades.length
      : NaN
    return { subject, avg, count: acc.grades.length, absent: acc.absent, total: acc.total }
  })
  // Сначала предметы с оценками (по убыванию среднего не сортируем — алфавит понятнее)
  subjects.sort((a, b) => {
    if (a.count && !b.count) return -1
    if (!a.count && b.count) return 1
    return a.subject.localeCompare(b.subject, 'ru')
  })

  const graded = subjects.filter((s) => Number.isFinite(s.avg))
  const overall = graded.length
    ? graded.reduce((sum, s) => sum + s.avg, 0) / graded.length
    : NaN
  const absentTotal = subjects.reduce((sum, s) => sum + s.absent, 0)

  const card = (s) => {
    const projected = projectedGrade(s.avg)
    // Шкала 2..5 → 0..100%: видно, сколько не хватает до следующей оценки.
    const pct = Number.isFinite(s.avg) ? Math.max(0, Math.min(100, ((s.avg - 2) / 3) * 100)) : 0
    const tone = projected ? ` is-${projected}` : ''
    return el('div', { className: `card final-row${tone}` }, [
      el('div', { className: 'final-head' }, [
        el('span', { className: 'final-subject', text: s.subject }),
        Number.isFinite(s.avg)
          ? el('span', { className: `final-badge is-${projected}`, text: `итог ${projected}` })
          : el('span', { className: 'final-badge is-empty', text: 'нет данных' }),
      ]),
      el('div', { className: 'final-bar' }, [
        el('span', { className: `final-bar-fill${tone}`, style: `width:${pct.toFixed(1)}%` }),
      ]),
      el('div', { className: 'final-foot' }, [
        el('span', { className: 'final-avg-wrap' }, [
          el('strong', { className: 'final-avg', text: Number.isFinite(s.avg) ? s.avg.toFixed(2) : '—' }),
          el('span', { className: 'final-avg-label muted', text: 'средний' }),
        ]),
        el('span', { className: 'final-chips' }, [
          el('span', {
            className: 'final-chip',
            text: s.count ? `${s.count} ${plural(s.count)}` : 'оценок нет',
          }),
          s.absent ? el('span', { className: 'final-chip is-bad', text: `пропусков ${s.absent}` }) : null,
        ]),
      ]),
    ])
  }

  body.replaceChildren(
    el('div', { className: 'card final-summary' }, [
      el('div', { className: 'final-summary-top' }, [
        el('div', {}, [
          el('span', { className: 'final-summary-label', text: 'Средний балл' }),
          el('strong', {
            className: 'final-summary-value',
            text: Number.isFinite(overall) ? overall.toFixed(2) : '—',
          }),
        ]),
        el('div', {}, [
          el('span', { className: 'final-summary-label', text: 'Предметов' }),
          el('strong', { className: 'final-summary-value', text: String(graded.length) }),
        ]),
        el('div', {}, [
          el('span', { className: 'final-summary-label', text: 'Пропусков' }),
          el('strong', {
            className: `final-summary-value${absentTotal ? ' is-bad' : ''}`,
            text: String(absentTotal),
          }),
        ]),
      ]),
      el('p', {
        className: 'final-note muted',
        text: 'Итог — это прогноз по среднему баллу, а не решение преподавателя. Округление: 4,5 и выше → 5.',
      }),
    ]),
    ...subjects.map(card),
  )
}

const SUBJECT_WORDS = ['оценка', 'оценки', 'оценок']

function plural(n, forms = SUBJECT_WORDS) {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last === 1) return forms[0]
  if (last >= 2 && last <= 4) return forms[1]
  return forms[2]
}

/** Какая оценка по среднему — «5» зелёная, «3» жёлтая, ниже — красная. */
function avgTone(avg) {
  if (!Number.isFinite(avg)) return ''
  if (avg >= 4.5) return 'is-5'
  if (avg >= 3.5) return 'is-4'
  if (avg >= 2.5) return 'is-3'
  return 'is-2'
}

/**
 * «Текущие оценки»: список предметов, каждый раскрывается в свои оценки.
 * Раскрытый предмет показывает дату, тип работы и отметку — как в обычном журнале.
 */
function paintDiary(ctx, body, rows) {
  body.replaceChildren()
  if (!rows.length) {
    body.append(
      el('div', { className: 'card diary-empty' }, [
        el('h3', { text: 'Оценок пока нет' }),
        el('p', {
          className: 'muted',
          text: 'Как только преподаватель поставит первую отметку, она появится здесь по предметам.',
        }),
      ]),
    )
    return
  }

  const bySubject = new Map()
  for (const row of rows) {
    const key = String(row.subject || 'Предмет').trim() || 'Предмет'
    if (!bySubject.has(key)) bySubject.set(key, [])
    bySubject.get(key).push(row)
  }

  const nums = rows.map((r) => Number(r.grade)).filter((n) => n >= 2 && n <= 5)
  const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : NaN
  const absences = rows.filter((r) => ['absent', 'sick'].includes(String(r.attendance || ''))).length

  body.append(
    el('div', { className: 'card diary-summary' }, [
      el('div', { className: 'diary-summary-cell' }, [
        el('span', { className: 'diary-summary-label', text: 'Средний балл' }),
        el('strong', {
          className: `diary-summary-value ${avgTone(avg)}`,
          text: Number.isFinite(avg) ? avg.toFixed(2) : '—',
        }),
      ]),
      el('div', { className: 'diary-summary-cell' }, [
        el('span', { className: 'diary-summary-label', text: 'Предметов' }),
        el('strong', { className: 'diary-summary-value', text: String(bySubject.size) }),
      ]),
      absences
        ? el('div', { className: 'diary-summary-cell' }, [
            el('span', { className: 'diary-summary-label', text: 'Пропусков' }),
            el('strong', { className: 'diary-summary-value is-2', text: String(absences) }),
          ])
        : null,
    ]),
  )

  const subjects = [...bySubject.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'))
  const opened = String(ctx.state.openSubject || '')

  for (const [subject, list] of subjects) {
    const ordered = [...list].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    const sNums = ordered.map((r) => Number(r.grade)).filter((n) => n >= 2 && n <= 5)
    const sAvg = sNums.length ? sNums.reduce((a, b) => a + b, 0) / sNums.length : NaN
    const isOpen = opened === subject

    const head = el('button', {
      type: 'button',
      className: isOpen ? 'subject-head is-open' : 'subject-head',
      onClick: () => {
        haptic()
        ctx.state.openSubject = isOpen ? '' : subject
        ctx.render()
      },
    }, [
      el('span', { className: 'subject-head-main' }, [
        el('span', { className: 'subject-name', text: subject }),
        el('span', { className: 'subject-meta' }, [
          el('span', { text: `${sNums.length} ${plural(sNums.length)}` }),
          ordered.length ? el('span', { className: 'subject-meta-sep', text: '·' }) : null,
          ordered.length
            ? el('span', { text: `${ordered.length} ${plural(ordered.length, ['запись', 'записи', 'записей'])}` })
            : null,
        ]),
      ]),
      el('span', { className: 'subject-head-side' }, [
        sNums.length
          ? el('span', { className: `subject-avg ${avgTone(sAvg)}`, text: sAvg.toFixed(2) })
          : el('span', { className: 'subject-avg is-empty', text: '—' }),
        el('span', { className: 'subject-chevron', text: isOpen ? '▴' : '▾' }),
      ]),
    ])

    const card = el('div', { className: isOpen ? 'card subject-card is-open' : 'card subject-card' }, [head])

    if (isOpen) {
      const grid = el('div', { className: 'subject-marks' })
      for (const row of ordered) {
        const att = String(row.attendance || 'present')
        const hasGrade = row.grade != null && att === 'present'
        const label = hasGrade ? String(row.grade) : attendanceShort(att)
        const dateLabel = row.date ? ctx.formatDateRu(String(row.date).slice(0, 10)) : ''
        const kind = hasGrade
          ? String(row.kind || '').trim()
          : att === 'absent'
            ? 'пропуск'
            : att === 'sick'
              ? 'по болезни'
              : att === 'duty'
                ? 'наряд'
                : att === 'event'
                  ? 'мероприятие'
                  : att === 'excused'
                    ? 'освобождение'
                    : 'был(а)'
        grid.append(
          el('div', { className: 'subject-mark-row' }, [
            el('span', {
              className: `mark-badge ${gradeChipClass(hasGrade ? Number(row.grade) : null, att)}`,
              text: label,
            }),
            el('span', { className: 'subject-mark-main' }, [
              el('span', { className: 'subject-mark-kind', text: kind || (hasGrade ? 'работа' : '') }),
              el('span', { className: 'subject-mark-meta' }, [
                el('span', { text: dateLabel }),
                row.start ? el('span', { className: 'subject-meta-sep', text: '·' }) : null,
                row.start ? el('span', { text: row.start }) : null,
              ]),
            ]),
            row.comment
              ? el('span', { className: 'subject-mark-comment', text: row.comment, title: row.comment })
              : null,
          ]),
        )
      }
      card.append(grid)
      if (sNums.length) {
        card.append(
          el('p', {
            className: 'subject-foot muted',
            text: `Средний по предмету: ${sAvg.toFixed(2)} · итог ≈ ${projectedGrade(sAvg)}`,
          }),
        )
      }
    }
    body.append(card)
  }
}


function haptic() {
  try {
    navigator.vibrate?.(8)
  } catch {
    /* ignore */
  }
}

function gradeChipClass(value, attendance) {
  if (attendance === 'absent' || attendance === 'sick') return 'grade-bad'
  if (value == null) return 'mark-neutral'
  if (value === 5) return 'grade-5'
  if (value === 4) return 'grade-4'
  if (value === 3) return 'grade-3'
  return 'grade-bad'
}
export function renderJournalOverlay(ctx) {
  const spec = ctx.state.journal
  if (!spec) return null
  const session = getSession()
  if (!canGradeGroup(session, spec.groupId)) {
    ctx.state.journal = null
    return null
  }
  const group = ctx.getGroup(spec.groupId)
  const dayLessons = group
    ? ctx
        .getLessons(group.id)
        .filter((l) => lessonMatchesDate(ctx, l, spec.date))
    : []
  const close = () => {
    ctx.state.journal = null
    ctx.render()
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
    el('button', {
      type: 'button',
      className: 'journal-back',
      text: '← Назад',
      onClick: close,
    }),
    el('div', { className: 'journal-head-text' }, [
      el('p', { className: 'muted journal-kicker', text: `${group?.name || 'Группа'} · ${ctx.formatDateRu(spec.date)}` }),
      el('h2', { text: spec.subject }),
      el('p', { className: 'muted', text: `${spec.start}–${spec.end}` }),
    ]),
  ])
  const slots = el('div', { className: 'due-quick journal-slots' })
  dayLessons.forEach((lesson, idx) => {
    const active = lesson.start === spec.start && lesson.end === spec.end
    slots.append(
      el('button', {
        type: 'button',
        className: `chip${active ? ' chip-active' : ''}`,
        text: `${idx + 1} · ${lesson.start}`,
        onClick: () => {
          ctx.state.journal = {
            ...spec,
            lessonId: lesson.id,
            start: lesson.start,
            end: lesson.end,
            subject: lesson.subject,
          }
          ctx.render()
        },
      }),
    )
  })
  const tools = el('div', { className: 'journal-tools' })
  const list = el('div', { className: 'journal-list', text: 'Загружаем…' })
  sheet.append(head, slots, tools, list)
  root.append(sheet)
  loadJournal(ctx, spec, group, dayLessons, tools, list)
  return root
}

function lessonMatchesDate(ctx, lesson, dateStr) {
  const day = ctx.weekdayFromISO(dateStr)
  return Number(lesson.day) === Number(day)
}

async function loadJournal(ctx, spec, group, dayLessons, tools, list) {
  try {
    const [students, marks, grades] = await Promise.all([
      listStudents(spec.groupId),
      listJournalMarks(spec.groupId, spec.date),
      // Оценки живут в отдельной таблице — их может быть несколько на пару.
      listLessonGrades(spec.groupId, spec.date, spec.start, spec.end).catch(() => []),
    ])
    const mine = marks.filter((m) => m.start === spec.start && m.end === spec.end)
    const byStudent = new Map(mine.map((m) => [m.studentId, m]))
    const gradesByStudent = new Map()
    for (const g of grades) {
      if (!gradesByStudent.has(g.studentId)) gradesByStudent.set(g.studentId, [])
      gradesByStudent.get(g.studentId).push(g)
    }
    const prev = previousLesson(dayLessons, spec.start)
    const ui = { noteId: ctx.state.journalNoteId || '' }
    const reload = () =>
      loadJournal(ctx, ctx.state.journal || spec, group, dayLessons, tools, list)
    paintTools(ctx, spec, group, students, byStudent, prev, marks, tools, list)
    paintRows(ctx, spec, students, byStudent, gradesByStudent, list, ui, reload)
  } catch (err) {
    list.replaceChildren(
      el('p', {
        className: 'muted',
        text:
          err.message ||
          'Не удалось открыть журнал. Если это первый запуск — выполни supabase/journal.sql, затем supabase/journal_v2.sql.',
      }),
    )
  }
}

function previousLesson(lessons, start) {
  const prev = lessons.filter((l) => l.start < start).sort((a, b) => b.start.localeCompare(a.start))
  return prev[0] || null
}

function paintTools(ctx, spec, group, students, byStudent, prev, allMarks, tools, list) {
  tools.replaceChildren()
  const links = el('div', { className: 'journal-links' })
  if (prev) {
    links.append(
      el('button', {
        type: 'button',
        className: 'journal-link',
        text: 'Неявки с прошлой пары',
        onClick: async () => {
          const prevMarks = allMarks.filter(
            (m) => m.start === prev.start && m.end === prev.end && m.attendance === 'absent',
          )
          if (!prevMarks.length) {
            ctx.flash('На прошлой паре неявок нет')
            return
          }
          try {
            for (const mark of prevMarks) {
              const current = byStudent.get(mark.studentId)
              await upsertMark({
                studentId: mark.studentId,
                date: spec.date,
                lessonId: spec.lessonId,
                start: spec.start,
                end: spec.end,
                subject: spec.subject,
                attendance: 'absent',
                grade: current?.grade ?? null,
                comment: current?.comment || '',
              })
            }
            ctx.flash(`Неявки скопированы: ${prevMarks.length}`)
            loadJournal(ctx, spec, group, ctx.getLessons(spec.groupId).filter((l) => lessonMatchesDate(ctx, l, spec.date)), tools, list)
          } catch (err) {
            ctx.flash(err.message, true)
          }
        },
      }),
    )
  }
  links.append(
    el('button', {
      type: 'button',
      className: 'journal-link',
      text: 'Текст расхода',
      onClick: async () => {
        const people = students.map((st) => {
          const mark = byStudent.get(st.id)
          return {
            surname: st.surname || st.fullName,
            attendance: mark?.attendance || '',
            comment: mark?.comment || '',
          }
        })
        const text = buildJournalReport(group?.name || '', people)
        try {
          await navigator.clipboard.writeText(text)
          ctx.flash('Текст расхода скопирован')
        } catch {
          ctx.flash(text)
        }
      },
    }),
  )
  tools.append(
    links,
    el('p', {
      className: 'muted journal-hint',
      text: 'Сначала пусто. «+» — был, «н» — нет. Пока не отмечен, в «на лицо» не попадает.',
    }),
  )
}

function paintRows(ctx, spec, students, byStudent, gradesByStudent, list, ui, reload) {
  const sheet = list.closest('.journal-sheet')
  const scroll = sheet ? sheet.scrollTop : 0
  list.replaceChildren()
  if (ctx.state.journalCodes) {
    list.append(renderCodesScreen(ctx, spec, students, reload))
    if (sheet) sheet.scrollTop = scroll
    return
  }
  if (journalError) {
    list.append(el('p', { className: 'journal-error', text: journalError }))
  }
  if (!students.length) {
    list.append(el('p', { className: 'muted', text: 'В этой группе пока нет студентов.' }))
  }
  students.forEach((student, index) => {
    const mark = byStudent.get(student.id) || {
      attendance: '',
      grade: null,
      comment: '',
      author: '',
    }
    const grades = gradesByStudent.get(student.id) || []
    list.append(
      renderStudentRow(ctx, spec, student, mark, grades, byStudent, index, () =>
        paintRows(ctx, spec, students, byStudent, gradesByStudent, list, ui, reload),
      ),
    )
  })
  list.append(renderRosterTools(ctx, spec, students, reload))
  if (sheet) sheet.scrollTop = scroll
}

function renderRosterTools(ctx, spec, students, reload) {
  return el('button', {
    type: 'button',
    className: 'journal-link journal-codes-open',
    text: 'Коды студентов',
    onClick: () => {
      ctx.state.journalCodes = true
      ctx.render()
    },
  })
}

function renderCodesScreen(ctx, spec, students, reload) {
  const box = el('div', { className: 'journal-codes-screen' })
  box.append(
    el('button', {
      type: 'button',
      className: 'journal-back',
      text: '← К отметкам',
      onClick: () => {
        ctx.state.journalCodes = false
        ctx.state.journalCodeId = ''
        ctx.render()
      },
    }),
    el('h2', { text: 'Коды' }),
    el('p', { className: 'muted', text: 'Код открывает только свои оценки.' }),
  )
  students.forEach((student, index) => {
    const open = ctx.state.journalCodeId === student.id
    const hasCode = student.hasCode === true || student.hascode === true
    const row = el('div', { className: 'journal-code-row' })
    row.append(
      el('button', {
        type: 'button',
        className: 'journal-code-person',
        onClick: () => {
          ctx.state.journalCodeId = open ? '' : student.id
          ctx.render()
        },
      }, [
        el('span', { className: 'journal-num', text: String(index + 1) }),
        el('span', { text: personSurname(student) }),
        student.role && student.role !== 'student'
          ? el('span', {
              className: 'journal-tag',
              text: student.role === 'teacher' ? 'препод' : 'староста',
            })
          : null,
        el('span', {
          className: 'muted',
          text: hasCode ? (student.shared ? 'общий' : 'есть') : 'нет',
        }),
      ]),
    )
    if (open) {
      const input = el('input', {
        maxlength: '64',
        placeholder: 'Код, от 8 символов',
        autocomplete: 'off',
      })
      const form = el('form', { className: 'journal-add' })
      form.append(
        input,
        el('button', {
          type: 'button',
          className: 'journal-link',
          text: 'Случайный',
          onClick: () => {
            input.value = newStudentCode()
          },
        }),
        el('button', { type: 'submit', className: 'journal-link', text: 'Сохранить' }),
      )
      form.addEventListener('submit', async (e) => {
        e.preventDefault()
        const code = input.value.trim()
        if (code.length < 8) {
          ctx.flash('Минимум 8 символов', true)
          return
        }
        try {
          const saved = await setStudentCode(student.id, code)
          ctx.flash(saved?.shared ? 'Сохранено. Код общий, при входе нужна фамилия.' : 'Код сохранён.')
          ctx.state.journalCodeId = ''
          reload()
        } catch (err) {
          ctx.flash(err.message, true)
        }
      })

      // Роль: повышение даёт права журнала на его же код, раздавать ничего не нужно.
      const current = String(student.role || 'student')
      const roleRow = el('div', { className: 'due-quick role-picker' })
      for (const [id, label] of [
        ['student', 'Студент'],
        ['starosta', 'Староста'],
        ['teacher', 'Препод'],
      ]) {
        roleRow.append(
          el('button', {
            type: 'button',
            className: `chip${current === id ? ' chip-active' : ''}`,
            text: label,
            onClick: async () => {
              if (current === id) return
              try {
                await setStudentRole(student.id, id)
                ctx.flash(
                  id === 'student'
                    ? `${personSurname(student)} снова студент`
                    : `${personSurname(student)} — ${label.toLowerCase()}, код уже работает`,
                )
                reload()
              } catch (err) {
                ctx.flash(err.message, true)
              }
            },
          }),
        )
      }
      row.append(form, roleRow)
    }
    box.append(row)
  })
  const name = el('input', { maxlength: '120', placeholder: 'Фамилия Имя' })
  const add = el('form', { className: 'journal-add' })
  add.append(name, el('button', { className: 'journal-link', type: 'submit', text: 'Добавить' }))
  add.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      await addStudent(spec.groupId, name.value)
      ctx.flash('Студент добавлен')
      reload()
    } catch (err) {
      ctx.flash(err.message, true)
    }
  })
  box.append(add)
  return box
}

function cleanText(value) {
  const text = String(value ?? '').trim()
  if (!text || text === 'null' || text === 'undefined') return ''
  return text
}

function personSurname(student) {
  const surname = cleanText(student?.surname)
  if (surname) return surname
  const full = cleanText(student?.fullName || student?.fullname)
  return full.split(/\s+/)[0] || 'Без фамилии'
}

function personRest(student) {
  const full = cleanText(student?.fullName || student?.fullname)
  const surname = personSurname(student)
  if (!full || full === surname || full === 'Без фамилии') return ''
  return full.replace(surname, '').replace(/\bnull\b/gi, '').trim()
}

const MAIN_ATTS = [
  ['present', '+'],
  ['absent', 'н'],
  ['sick', 'б'],
]
const EXTRA_ATTS = [
  ['duty', 'нар'],
  ['event', 'мп'],
  ['excused', 'отп'],
]

function renderStudentRow(ctx, spec, student, mark, grades, byStudent, index, repaint) {
  const save = async (patch) => {
    const next = {
      attendance: patch.attendance !== undefined ? patch.attendance || '' : mark.attendance || '',
      comment: patch.comment === undefined ? mark.comment || '' : patch.comment,
      author: mark.author || '',
    }
    byStudent.set(student.id, { ...mark, ...next })
    journalError = ''
    repaint()
    try {
      const saved = await upsertMark({
        studentId: student.id,
        date: spec.date,
        lessonId: spec.lessonId,
        start: spec.start,
        end: spec.end,
        subject: spec.subject,
        attendance: next.attendance,
        comment: next.comment,
      })
      if (saved?.author) byStudent.get(student.id).author = saved.author
    } catch (err) {
      journalError = err.message || 'Не сохранилось'
      ctx.flash(journalError, true)
      repaint()
    }
  }

  const addGrade = async (value, kind) => {
    journalError = ''
    try {
      const saved = await addGradeRpc({
        studentId: student.id,
        date: spec.date,
        lessonId: spec.lessonId,
        start: spec.start,
        end: spec.end,
        subject: spec.subject,
        value,
        kind,
      })
      if (saved?.id) grades.push({ id: saved.id, studentId: student.id, value, kind })
      ctx.state.gradeKind = kind
      repaint()
    } catch (err) {
      journalError = err.message || 'Оценка не сохранилась'
      ctx.flash(journalError, true)
      repaint()
    }
  }

  const removeGrade = async (grade) => {
    journalError = ''
    try {
      await deleteGradeRpc(grade.id)
      const at = grades.findIndex((g) => g.id === grade.id)
      if (at >= 0) grades.splice(at, 1)
      repaint()
    } catch (err) {
      journalError = err.message || 'Не удалилось'
      ctx.flash(journalError, true)
      repaint()
    }
  }

  const att = mark.attendance || ''
  const extraOn = EXTRA_ATTS.some(([id]) => id === att)
  const open = ctx.state.journalNoteId === student.id
  const seg = (items) => {
    const row = el('div', { className: 'seg' })
    for (const [id, label] of items) {
      row.append(
        el('button', {
          type: 'button',
          className: att === id ? 'on' : '',
          text: label,
          onClick: () => save({ attendance: att === id ? '' : id }),
        }),
      )
    }
    return row
  }

  // Чипы оценок: каждая оценка — отдельный чип, тап удаляет (с подтверждением через долгий тап не нужно).
  const gradeStrip = el('div', { className: 'grade-strip' })
  for (const g of grades) {
    gradeStrip.append(
      el('button', {
        type: 'button',
        className: `grade-pill ${gradeClass(Number(g.value), 'present')}`,
        text: String(g.value),
        title: `${GRADE_KINDS.find(([k]) => k === g.kind)?.[1] || 'оценка'}${g.comment ? ` · ${g.comment}` : ''} — нажми, чтобы удалить`,
        onClick: () => {
          void removeGrade(g)
        },
      }),
    )
  }
  const kind = ctx.state.gradeKind || 'answer'
  const addBtn = el('button', {
    type: 'button',
    className: 'grade-add',
    text: '+',
    title: 'Добавить оценку',
    'aria-label': 'Добавить оценку',
    onClick: () => {
      ctx.state.gradeAddFor = ctx.state.gradeAddFor === student.id ? '' : student.id
      repaint()
    },
  })
  gradeStrip.append(addBtn)

  const kids = [
    el('span', { className: 'journal-num', text: String(index + 1) }),
    el('div', { className: 'journal-person' }, [
      el('strong', { text: personSurname(student) }),
      extraOn ? el('span', { className: 'journal-tag', text: EXTRA_ATTS.find(([id]) => id === att)?.[1] || '' }) : null,
      personRest(student) ? el('span', { className: 'muted', text: personRest(student) }) : null,
    ]),
    el('button', {
      type: 'button',
      className: `journal-more-btn${open || extraOn || (mark.comment || '').trim() ? ' on' : ''}`,
      text: '⋯',
      title: 'Комментарий и другие отметки',
      'aria-label': open ? 'Свернуть' : 'Комментарий и другие отметки',
      'aria-expanded': open ? 'true' : 'false',
      onClick: () => {
        ctx.state.journalNoteId = open ? '' : student.id
        repaint()
      },
    }),
    el('div', { className: 'journal-controls' }, [seg(MAIN_ATTS), gradeStrip]),
  ]

  if (ctx.state.gradeAddFor === student.id) {
    const picker = el('div', { className: 'grade-picker' })
    for (const n of [2, 3, 4, 5]) {
      picker.append(
        el('button', {
          type: 'button',
          className: `grade-pick ${gradeClass(n, 'present')}`,
          text: String(n),
          onClick: () => {
            ctx.state.gradeAddFor = ''
            void addGrade(n, kind)
          },
        }),
      )
    }
    const kinds = el('div', { className: 'grade-kinds' })
    for (const [id, label] of GRADE_KINDS) {
      kinds.append(
        el('button', {
          type: 'button',
          className: `chip${kind === id ? ' chip-active' : ''}`,
          text: label,
          onClick: () => {
            ctx.state.gradeKind = id
            repaint()
          },
        }),
      )
    }
    kids.push(el('div', { className: 'journal-extra grade-extra' }, [picker, kinds]))
  }

  if (open) {
    const comment = el('input', {
      maxlength: '200',
      placeholder: 'Комментарий',
      value: mark.comment || '',
    })
    comment.addEventListener('change', () => save({ comment: comment.value }))
    kids.push(el('div', { className: 'journal-extra' }, [seg(EXTRA_ATTS), comment]))
  }
  return el('article', { className: 'journal-row' }, kids)
}

export { markKey }
