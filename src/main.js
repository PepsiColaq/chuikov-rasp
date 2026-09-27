import './styles.css'
import { el } from './lib/security.js'
import { breakMinutes, DAY_NAMES, DAY_SHORT } from './data/seed.js'
import {
  initStore,
  listGroups,
  getGroup,
  getLessons,
  getOverridesForDate,
  getHomework,
  resolveLesson,
  getSession,
  loginWithCode,
  logout,
  addHomework,
  deleteHomework,
  setOverride,
  clearOverride,
  createGroup,
  resetStarostaCode,
  resetSemester,
  getAudit,
  getSemesterLabel,
  getDb,
  getDefaultGroupId,
  isRemoteMode,
} from './lib/store.js'

const SELECTED_GROUP_KEY = 'rasp_selected_group_v2'

const state = {
  tab: 'schedule',
  groupId: localStorage.getItem(SELECTED_GROUP_KEY) || '',
  day: ((d) => (d === 0 || d === 6 ? 1 : d))(new Date().getDay()),
  expandedHw: new Set(),
  message: null,
  error: null,
}

function textNode(s) {
  return document.createTextNode(s == null ? '' : String(s))
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateForWeekday(dayNum) {
  const now = new Date()
  const jsDay = now.getDay() || 7
  const d = new Date(now)
  d.setDate(now.getDate() + (dayNum - jsDay))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function canEdit(groupId) {
  const s = getSession()
  if (!s) return false
  if (s.role === 'admin') return true
  return s.role === 'starosta' && s.groupId === groupId
}

function flash(text, isError = false) {
  state.message = isError ? null : text
  state.error = isError ? text : null
  render()
  setTimeout(() => {
    state.message = null
    state.error = null
    render()
  }, 2800)
}

function selectGroup(id) {
  state.groupId = id
  localStorage.setItem(SELECTED_GROUP_KEY, id)
  state.tab = 'schedule'
  render()
}

function typeLabel(t) {
  return (
    {
      room_only: 'Смена кабинета',
      subject: 'Другая пара',
      subject_and_room: 'Другая пара + кабинет',
      cancelled: 'Пары не будет',
    }[t] || t
  )
}

function renderTop(group) {
  const session = getSession()
  return el('header', { className: 'topbar' }, [
    el('div', {}, [
      el('div', { className: 'brand', text: `Колледж Чуйкова · ${getSemesterLabel()}` }),
      el('h1', { text: group ? group.name : 'Группа' }),
    ]),
    session
      ? el('button', {
          className: 'session-pill',
          type: 'button',
          text: session.role === 'admin' ? 'Админ · выйти' : 'Староста · выйти',
          onClick: async () => {
            await logout()
            flash('Вы вышли')
          },
        })
      : el('button', {
          className: 'session-pill',
          type: 'button',
          text: 'Войти',
          onClick: () => {
            state.tab = 'more'
            render()
          },
        }),
  ])
}

function renderDays() {
  const group = getGroup(state.groupId)
  const hasSat = group
    ? getLessons(group.id, 6).length > 0
    : false
  const days = hasSat ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]
  return el(
    'div',
    { className: 'days' },
    days.map((d) =>
      el('button', {
        type: 'button',
        className: state.day === d ? 'active' : '',
        text: DAY_SHORT[d],
        onClick: () => {
          state.day = d
          render()
        },
      }),
    ),
  )
}

function lessonMeta(lesson, view) {
  if (view.cancelled) {
    return el('div', { className: 'lesson-meta' }, [
      el('span', { className: 'badge warn', text: 'пары не будет' }),
    ])
  }
  if (view.overrideType === 'room_only') {
    return el('div', { className: 'lesson-meta' }, [
      el('span', { className: 'strike', text: `ауд. ${view.oldRoom || '—'}` }),
      textNode(` → ауд. ${view.effectiveRoom} `),
      el('span', { className: 'badge warn', text: 'замена' }),
    ])
  }
  if (view.overrideType === 'subject' || view.overrideType === 'subject_and_room') {
    return el('div', { className: 'lesson-meta' }, [
      textNode(view.oldSubject ? `было: ${view.oldSubject}` : ''),
      view.effectiveRoom ? textNode(` · ауд. ${view.effectiveRoom} `) : textNode(' '),
      el('span', { className: 'badge warn', text: 'замена' }),
    ])
  }
  if (lesson.remote) {
    return el('div', { className: 'lesson-meta' }, [
      el('span', { className: 'badge remote', text: 'дистант / онлайн' }),
      lesson.teacher ? textNode(` · ${lesson.teacher}`) : null,
    ])
  }
  const bits = []
  if (view.effectiveRoom) bits.push(`ауд. ${view.effectiveRoom}`)
  if (lesson.teacher) bits.push(lesson.teacher)
  return el('div', {
    className: 'lesson-meta',
    text: bits.length ? bits.join(' · ') : 'кабинет не указан',
  })
}

function renderAddHwInline(groupId, lesson) {
  const form = el('form', { className: 'card', style: 'margin-top:10px;padding:10px' })
  const due = el('input', { type: 'date', value: dateForWeekday(lesson.day), required: true })
  const ta = el('textarea', { maxlength: '1000', placeholder: 'Что задали…', required: true })
  form.append(
    el('div', { className: 'field' }, [el('label', { text: 'Срок' }), due]),
    el('div', { className: 'field' }, [el('label', { text: 'Домашнее задание' }), ta]),
    el('button', { className: 'btn', type: 'submit', text: 'Добавить ДЗ' }),
  )
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      await addHomework(groupId, {
        subject: lesson.subject,
        text: ta.value,
        dueDate: due.value,
        lessonId: lesson.id,
      })
      flash('ДЗ добавлено')
    } catch (err) {
      flash(err.message, true)
    }
  })
  return form
}

function renderLessonCard(lesson, dateStr, groupId) {
  const ov = getOverridesForDate(groupId, dateStr).find((o) => o.lessonId === lesson.id)
  const view = resolveLesson(lesson, ov)
  const hwList = getHomework(groupId, { subject: lesson.subject })
  const hasHw = hwList.length > 0
  const expanded = state.expandedHw.has(lesson.id)

  return el(
    'article',
    {
      className: `lesson${view.cancelled ? ' cancelled' : ''}${ov ? ' has-override' : ''}`,
    },
    [
      el('div', { className: 'lesson-top' }, [
        el('div', {}, [
          el('p', {
            className: 'lesson-subject',
            text: view.cancelled ? lesson.subject : view.effectiveSubject,
          }),
          lessonMeta(lesson, view),
        ]),
        el('div', { className: 'lesson-time', text: `${lesson.start}–${lesson.end}` }),
      ]),
      el(
        'button',
        {
          type: 'button',
          className: 'hw-toggle',
          onClick: () => {
            if (expanded) state.expandedHw.delete(lesson.id)
            else state.expandedHw.add(lesson.id)
            render()
          },
        },
        [
          el('span', {
            className: hasHw ? 'hw-label has' : 'hw-label empty',
            text: hasHw ? `ДЗ · ${hwList.length}` : 'ДЗ не задано',
          }),
          textNode(expanded ? '▲' : '▼'),
        ],
      ),
      expanded
        ? el('div', { className: 'hw-body' }, [
            hasHw
              ? el(
                  'div',
                  {},
                  hwList.map((h) =>
                    el('div', { style: 'margin-bottom:8px' }, [
                      el('strong', { text: h.dueDate ? `на ${h.dueDate}: ` : '' }),
                      textNode(h.text),
                      canEdit(groupId)
                        ? el('button', {
                            type: 'button',
                            className: 'muted',
                            style: 'display:block;margin-top:4px',
                            text: 'Удалить',
                            onClick: async (e) => {
                              e.stopPropagation()
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
                )
              : el('span', {
                  className: 'muted',
                  text: 'Домашнее задание не задано. Староста может добавить после входа.',
                }),
            canEdit(groupId) ? renderAddHwInline(groupId, lesson) : null,
          ])
        : null,
    ],
  )
}

function renderSchedule() {
  const group = getGroup(state.groupId)
  const lessons = getLessons(group.id, state.day)
  const dateStr = dateForWeekday(state.day)
  const frag = el('div', { className: 'panel' }, [
    el('p', {
      className: 'muted',
      text: `${DAY_NAMES[state.day] || ''} · ${dateStr}`,
    }),
  ])

  if (!lessons.length) {
    frag.append(el('div', { className: 'empty', text: 'В этот день пар нет' }))
    return frag
  }

  lessons.forEach((lesson, i) => {
    frag.append(renderLessonCard(lesson, dateStr, group.id))
    if (i < lessons.length - 1) {
      const mins = breakMinutes(lesson.end, lessons[i + 1].start)
      if (mins > 0) {
        frag.append(el('div', { className: 'break-line', text: `перемена ${mins} мин` }))
      }
    }
  })
  return frag
}

function renderHwTab() {
  const group = getGroup(state.groupId)
  const list = getHomework(group.id)
  const panel = el('div', { className: 'panel' }, [
    el('p', { className: 'muted', text: `Домашние задания · ${group.name}` }),
  ])
  if (!list.length) {
    panel.append(
      el('div', {
        className: 'empty',
        text: 'Пока нет ДЗ. Староста добавляет из вкладки «Пары» (стрелка у предмета).',
      }),
    )
    return panel
  }
  for (const h of list) {
    panel.append(
      el('div', { className: 'card' }, [
        el('h3', { text: h.subject }),
        el('p', { className: 'muted', text: h.dueDate ? `на ${h.dueDate}` : '' }),
        el('p', { text: h.text }),
      ]),
    )
  }
  return panel
}

function renderOverrideForm(groupId) {
  const lessons = getLessons(groupId)
  const form = el('form', { className: 'card' })
  const date = el('input', { type: 'date', value: todayISO(), required: true })
  const lessonSel = el('select', { required: true }, [
    el('option', { value: '', text: 'Выберите пару' }),
    ...lessons.map((l) =>
      el('option', {
        value: l.id,
        text: `${DAY_SHORT[l.day]} ${l.start} · ${l.subject}`,
      }),
    ),
  ])
  const typeSel = el('select', {}, [
    el('option', { value: 'room_only', text: 'Только кабинет' }),
    el('option', { value: 'subject', text: 'Другая пара' }),
    el('option', { value: 'subject_and_room', text: 'Другая пара + кабинет' }),
    el('option', { value: 'cancelled', text: 'Пары не будет' }),
  ])
  const newSubject = el('input', { maxlength: '80', placeholder: 'Новый предмет' })
  const newRoom = el('input', { maxlength: '32', placeholder: 'Новый кабинет' })
  const note = el('input', { maxlength: '200', placeholder: 'Комментарий' })

  form.append(
    el('h3', { text: 'Добавить замену' }),
    el('div', { className: 'field' }, [el('label', { text: 'Дата' }), date]),
    el('div', { className: 'field' }, [el('label', { text: 'Пара' }), lessonSel]),
    el('div', { className: 'field' }, [el('label', { text: 'Тип' }), typeSel]),
    el('div', { className: 'field' }, [el('label', { text: 'Новый предмет' }), newSubject]),
    el('div', { className: 'field' }, [el('label', { text: 'Новый кабинет' }), newRoom]),
    el('div', { className: 'field' }, [el('label', { text: 'Заметка' }), note]),
    el('button', { className: 'btn', type: 'submit', text: 'Сохранить замену' }),
  )

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      await setOverride(groupId, {
        date: date.value,
        lessonId: lessonSel.value,
        type: typeSel.value,
        newSubject: newSubject.value,
        newRoom: newRoom.value,
        note: note.value,
      })
      flash('Замена сохранена')
    } catch (err) {
      flash(err.message, true)
    }
  })
  return form
}

function renderOverridesTab(group) {
  const panel = el('div', { className: 'panel' }, [
    el('p', { className: 'muted', text: `Замены · ${group.name}` }),
  ])
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
    .overrides.filter((o) => o.groupId === group.id)
    .sort((a, b) => a.date.localeCompare(b.date))

  if (!upcoming.length) {
    panel.append(el('div', { className: 'empty', text: 'Активных замен нет' }))
  } else {
    for (const o of upcoming) {
      const lesson = getLessons(group.id).find((l) => l.id === o.lessonId)
      panel.append(
        el('div', { className: 'card' }, [
          el('h3', { text: typeLabel(o.type) }),
          el('p', {
            className: 'muted',
            text: `${o.date} · ${lesson ? lesson.subject : 'пара'} · ${lesson ? lesson.start : ''}`,
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

function renderGroupPicker() {
  const wrap = el('div', { className: 'panel' })
  const q = el('input', { type: 'search', placeholder: 'Поиск группы…' })
  const list = el('div', { className: 'group-list' })
  const paint = () => {
    list.replaceChildren()
    const query = q.value.trim().toLowerCase()
    for (const g of listGroups()) {
      if (query && !g.name.toLowerCase().includes(query)) continue
      list.append(
        el(
          'button',
          {
            type: 'button',
            onClick: () => selectGroup(g.id),
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
  wrap.append(el('div', { className: 'search' }, [q]), list)
  return wrap
}

function renderAdminPanel() {
  const box = el('div', { className: 'card' })
  box.append(el('h3', { text: 'Админка' }))

  const name = el('input', { maxlength: '48', placeholder: '0902-ПД1' })
  const faculty = el('input', { maxlength: '32', placeholder: 'ПД' })
  const code = el('input', { maxlength: '64', placeholder: 'Код старосты (от 8 символов)' })
  const createForm = el('form', {})
  createForm.append(
    el('p', { className: 'muted', text: 'Создать группу' }),
    el('div', { className: 'field' }, [el('label', { text: 'Название' }), name]),
    el('div', { className: 'field' }, [el('label', { text: 'Факультет' }), faculty]),
    el('div', { className: 'field' }, [el('label', { text: 'Код старосты' }), code]),
    el('button', { className: 'btn', type: 'submit', text: 'Создать' }),
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
  box.append(createForm)

  const resetGroup = el(
    'select',
    {},
    listGroups().map((g) => el('option', { value: g.id, text: g.name })),
  )
  const newCode = el('input', { maxlength: '64', placeholder: 'Новый код' })
  const resetForm = el('form', { style: 'margin-top:16px' })
  resetForm.append(
    el('p', { className: 'muted', text: 'Сбросить код старосты' }),
    el('div', { className: 'field' }, [el('label', { text: 'Группа' }), resetGroup]),
    el('div', { className: 'field' }, [el('label', { text: 'Новый код' }), newCode]),
    el('button', { className: 'btn secondary', type: 'submit', text: 'Сбросить код' }),
  )
  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      await resetStarostaCode(resetGroup.value, newCode.value)
      flash('Код обновлён')
    } catch (err) {
      flash(err.message, true)
    }
  })
  box.append(resetForm)

  const semGroup = el(
    'select',
    {},
    listGroups().map((g) => el('option', { value: g.id, text: g.name })),
  )
  box.append(
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

  for (const a of getAudit(20)) {
    box.append(
      el('div', {
        className: 'audit-line',
        text: `${a.at.slice(0, 19)} · ${a.action} · ${a.groupId || '—'} · ${a.detail || ''}`,
      }),
    )
  }

  box.append(
    el('p', {
      className: 'muted',
      style: 'margin-top:12px',
      text: 'Коды доступа выдай старостам лично. На сайте они не показываются.',
    }),
  )
  return box
}

function renderMore() {
  const group = getGroup(state.groupId)
  const session = getSession()
  const panel = el('div', { className: 'panel' }, [
    el('p', { className: 'muted', text: 'Группа, вход, админка' }),
    el('div', { className: 'card' }, [
      el('h3', { text: 'Сменить группу' }),
      el('button', {
        type: 'button',
        className: 'btn secondary',
        text: group ? `Сейчас: ${group.name}` : 'Выбрать группу',
        onClick: () => {
          state.groupId = ''
          localStorage.removeItem(SELECTED_GROUP_KEY)
          render()
        },
      }),
    ]),
  ])

  if (!session) {
    const form = el('form', { className: 'card' })
    const code = el('input', {
      type: 'password',
      autocomplete: 'current-password',
      maxlength: '64',
      placeholder: 'Код старосты или админа',
      required: true,
    })
    form.append(
      el('h3', { text: 'Вход' }),
      el('p', {
        className: 'muted',
        text: 'Код выдаёт админ. Минимум 8 символов.',
      }),
      el('div', { className: 'field' }, [el('label', { text: 'Код доступа' }), code]),
      el('button', { className: 'btn', type: 'submit', text: 'Войти' }),
    )
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      try {
        const s = await loginWithCode(code.value, state.groupId || null)
        flash(s.role === 'admin' ? 'Вы вошли как админ' : 'Вы вошли как староста')
      } catch (err) {
        flash(err.message, true)
      }
    })
    panel.append(form)
  } else {
    panel.append(
      el('div', { className: 'card' }, [
        el('h3', { text: session.role === 'admin' ? 'Сессия: админ' : 'Сессия: староста' }),
        el('button', {
          type: 'button',
          className: 'btn secondary',
          text: 'Выйти',
          onClick: async () => {
            await logout()
            flash('Вы вышли')
          },
        }),
      ]),
    )
  }

  if (session?.role === 'admin') panel.append(renderAdminPanel())

  panel.append(
    el('p', {
      className: 'footer-note',
      text: isRemoteMode()
        ? 'Общая база включена — ДЗ и замены видны всем. Неофициальный студенческий ресурс.'
        : 'Неофициальный студенческий ресурс. Сейчас локальный режим (без общей синхронизации).',
    }),
  )
  return panel
}

function renderNav() {
  const items = [
    { id: 'schedule', label: 'Пары' },
    { id: 'hw', label: 'ДЗ' },
    { id: 'overrides', label: 'Замены' },
    { id: 'more', label: 'Ещё' },
  ]
  return el(
    'nav',
    { className: 'nav' },
    items.map((item) =>
      el('button', {
        type: 'button',
        className: state.tab === item.id ? 'active' : '',
        text: item.label,
        onClick: () => {
          state.tab = item.id
          render()
        },
      }),
    ),
  )
}

function render() {
  const root = document.getElementById('app')
  root.replaceChildren()

  const group = state.groupId ? getGroup(state.groupId) : null

  if (!group) {
    root.append(
      el('header', { className: 'topbar' }, [
        el('div', {}, [
          el('div', { className: 'brand', text: 'Колледж Чуйкова' }),
          el('h1', { text: 'Выбор группы' }),
        ]),
      ]),
      renderGroupPicker(),
      renderNav(),
    )
    return
  }

  root.append(renderTop(group))
  if (state.error) {
    root.append(el('p', { className: 'error', style: 'padding:0 16px', text: state.error }))
  }
  if (state.message) {
    root.append(el('p', { className: 'ok', style: 'padding:0 16px', text: state.message }))
  }

  if (state.tab === 'schedule') root.append(renderDays(), renderSchedule())
  else if (state.tab === 'hw') root.append(renderHwTab())
  else if (state.tab === 'overrides') root.append(renderOverridesTab(group))
  else root.append(renderMore())

  root.append(renderNav())
}

await initStore()
if (!state.groupId || !getGroup(state.groupId)) {
  state.groupId = getDefaultGroupId()
  localStorage.setItem(SELECTED_GROUP_KEY, state.groupId)
}
render()
