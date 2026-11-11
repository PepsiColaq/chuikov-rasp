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
  const box = el('div', { className: 'card journal-day' }, [
    el('div', { className: 'journal-day-top' }, [
      el('h3', { text: group.name }),
      el('span', { className: 'muted', text: ctx.formatDateRu(date) }),
    ]),
  ])
  if (!lessons.length) {
    box.append(el('p', { className: 'muted', text: 'В этот день пар нет. День меняется на вкладке «Пары».' }))
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
  const wrap = el('div', { className: 'grades-diary' })
  const switcher = el('div', { className: 'due-quick' }, [
    el('button', {
      type: 'button',
      className: `chip${mode === 'current' ? ' chip-active' : ''}`,
      text: 'Текущие',
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
  wrap.append(
    el('p', { className: 'muted', text: session.label || 'Студент' }),
    switcher,
    renderOwnCodeForm(ctx),
  )
  if (mode === 'final') {
    wrap.append(
      el('div', { className: 'card' }, [
        el('h3', { text: 'Итоговые' }),
        el('p', {
          className: 'muted',
          text: 'Итоги по семестрам добавим отдельно, когда текущие оценки уже будут ставиться. Свои текущие — на соседней кнопке.',
        }),
      ]),
    )
    return wrap
  }
  const body = el('div', { text: 'Загружаем…' })
  wrap.append(body)
  listMyMarks()
    .then((rows) => paintDiary(ctx, body, rows))
    .catch((err) => {
      body.replaceChildren(el('p', { className: 'muted', text: err.message || 'Не удалось загрузить оценки' }))
    })
  return wrap
}

function paintDiary(ctx, body, rows) {
  body.replaceChildren()
  if (!rows.length) {
    body.append(el('div', { className: 'empty', text: 'Пока нет оценок и пропусков.' }))
    return
  }
  const bySubject = new Map()
  for (const row of rows) {
    const key = row.subject || 'Предмет'
    if (!bySubject.has(key)) bySubject.set(key, [])
    bySubject.get(key).push(row)
  }
  const nums = rows.map((r) => Number(r.grade)).filter((n) => n >= 2 && n <= 5)
  const avg = nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : '—'
  body.append(el('p', { className: 'grades-avg', text: `Средний балл: ${avg}` }))
  for (const [subject, list] of bySubject) {
    const ordered = [...list].sort((a, b) => String(a.date).localeCompare(String(b.date)))
    const line = el('div', { className: 'grade-line' })
    for (const row of ordered) {
      const att = row.attendance || 'present'
      const label = row.grade != null && att === 'present' ? String(row.grade) : attendanceShort(att)
      const tip = `${ctx.formatDateRu(String(row.date).slice(0, 10))} · ${row.start || ''} · ${row.subject}${
        row.comment ? ` · ${row.comment}` : ''
      }${row.author ? ` · ${row.author}` : ''}`
      const open = ctx.state.gradeTip === row.id
      line.append(
        el('button', {
          type: 'button',
          className: `grade-chip ${gradeClass(row.grade == null ? null : Number(row.grade), att)}`,
          text: label,
          title: tip,
          onClick: () => {
            ctx.state.gradeTip = open ? '' : row.id
            ctx.render()
          },
        }),
      )
      if (open) {
        line.append(el('span', { className: 'grade-tip', text: tip }))
      }
    }
    body.append(
      el('div', { className: 'card grade-subject' }, [
        el('h3', { text: subject }),
        line,
      ]),
    )
  }
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
