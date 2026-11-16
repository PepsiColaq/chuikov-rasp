// Экран «Профиль»: кабинет, состав группы, коды, контакты, замены
// и мелкие настройки (тема, установка, выход).
//
// Здесь же экраны «забанен» и «сайт закрыт» — они тоже про доступ.
// Таблицы ролей и подписей вынесены в constants.js.

import { SELECTED_GROUP_KEY, applyTheme, state } from '../lib/app-state.js'
import { renderAdminFreeRooms, renderAdminPanel, renderLegalDoc, renderOverridesTab } from './admin.js'
import { MORE_UI_V2, NAV_ICONS, NAV_WITH_ICONS, PROFILE_AVATARS, ROLE_LABEL } from '../lib/constants.js'
import { flash, hapticTap, motionOk, paintFlashSlot, showToast } from '../lib/ui-feedback.js'
import { isIosDevice, isStandaloneApp, renderInstallCard, setInstallHelpOpen, tryNativeInstall } from '../lib/install.js'
import { el } from '../lib/security.js'
import { groupmates, listMyMarks, setMyContacts, setOwnStudentCode, setStudentRole, staffList, staffSet } from '../lib/journal.js'
import { canCompareGroups, canUseFreeRooms, clearProfileAvatar, getClosedMessage, getGroup, getLocalBanReason, getSession, isLocalDeviceBanned, isRemoteMode, listGroups, loginWithCode, logout, uploadProfileAvatar } from '../lib/store.js'
import { renderStudentsScreen } from '../journal-ui.js'
import { checkConnectivity } from '../lib/supabase.js'
import { hub } from '../app/hub.js'
import { tabSwitchShieldActive } from '../app/tab-shield.js'
import { renderCompare } from './compare.js'

// Эти функции живут в main.js — зовём их через мост, а не импортом (иначе цикл).
const canEdit = (...args) => hub.canEdit(...args)
const confirmAndLogout = (...args) => hub.confirmAndLogout(...args)
const formatPhone = (...args) => hub.formatPhone(...args)
const gotoTab = (...args) => hub.gotoTab(...args)
const openGroupPicker = (...args) => hub.openGroupPicker(...args)
const render = (...args) => hub.render(...args)
const switchTab = (...args) => hub.switchTab(...args)

export function moreSvg(kind) {
  const wrap = el('span', { className: 'more-row-ico', 'aria-hidden': 'true' })
  const svg = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M20 14.5A7.5 7.5 0 1 1 9.5 4 6 6 0 0 0 20 14.5z"/></svg>',
    users:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c1.2-3 3.2-4.5 5.5-4.5S13.3 16 14.5 19"/><circle cx="16.5" cy="8.5" r="2.4"/><path d="M14 15.2c1.4-1.2 2.9-1.7 4.8-1.5 1.2.1 2.2.5 3 1.2"/></svg>',
    phone:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><rect x="8" y="3" width="8" height="18" rx="2"/><path d="M11 18h2"/></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M4 8h13M4 8l3-3M4 8l3 3M20 16H7M20 16l-3-3M20 16l-3 3"/></svg>',
    group:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="9" cy="9" r="3"/><circle cx="16.5" cy="9.5" r="2.4"/><path d="M3.6 19c1-2.8 2.9-4.2 5.4-4.2s4.4 1.4 5.4 4.2"/><path d="M14.6 15.4c1.3-1 2.6-1.4 4.2-1.3 1 .1 1.9.4 2.6 1"/></svg>',
    contact:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><rect x="4" y="5" width="16" height="14" rx="2.5"/><circle cx="10" cy="10.5" r="2"/><path d="M7 16c.7-1.6 1.7-2.4 3-2.4s2.3.8 3 2.4"/><path d="M16 9.5h2M16 12.5h2"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="8" cy="8" r="3.6"/><path d="M10.7 10.7L20 20M17 17l2-2M14.5 14.5l2-2"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5A2.5 2.5 0 0 1 4 20.5z"/><path d="M8.5 7.5h6M8.5 11h4"/></svg>',
    club:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v3.3M12 17.2v3.3M3.5 12h3.3M17.2 12h3.3"/></svg>',
    compare:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><rect x="3" y="4.5" width="7" height="15" rx="2"/><rect x="14" y="4.5" width="7" height="15" rx="2"/><path d="M12 7v10" stroke-dasharray="2 2.4"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.7 1.1c0 1.7-2.3 1.9-2.3 3.6"/><path d="M12 17.3h.01"/></svg>',
    chevron:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
  }
  wrap.innerHTML = svg[kind] || ''
  return wrap
}

/** Иконка темы: солнце (светлая) ↔ луна (тёмная) с плавной сменой */
export function moreThemeIcon(isDark) {
  const wrap = el('span', {
    className: `more-row-ico theme-toggle-ico${isDark ? ' is-dark' : ''}`,
    'aria-hidden': 'true',
  })
  wrap.innerHTML = [
    '<span class="theme-ico theme-ico-sun"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4"/></svg></span>',
    '<span class="theme-ico theme-ico-moon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M20 14.5A7.5 7.5 0 1 1 9.5 4 6 6 0 0 0 20 14.5z"/></svg></span>',
  ].join('')
  return wrap
}

export function moreSettingsRow({ icon, title, sub, onClick, leading, className = '', expanded = null }) {
  return el(
    'button',
    {
      type: 'button',
      className: `more-row${className ? ` ${className}` : ''}${expanded ? ' is-open' : ''}`,
      'aria-expanded': expanded == null ? null : expanded ? 'true' : 'false',
      onClick,
    },
    [
      leading || moreSvg(icon),
      el('span', { className: 'more-row-text' }, [
        el('span', { className: 'more-row-title', text: title }),
        sub ? el('span', { className: 'more-row-sub', text: sub }) : null,
      ]),
      moreSvg('chevron'),
    ],
  )
}

/**
 * Личный кабинет: сводка по своим оценкам и пропускам.
 * Данные те же, что в дневнике (rasp_my_marks) — отдельного запроса нет.
 */
export function renderCabinetCard(session) {
  if (!session || session.role === 'admin') return null
  // Дневник есть только у реального студента: его id начинается с 'st_',
  // у кода старосты группы в codeId лежит 'gc_…' — там сводки нет.
  const isStudent =
    session.role === 'student' || String(session.codeId || '').startsWith('st_')
  if (!isStudent) return null

  const box = el('div', { className: 'card cabinet-card' })
  const body = el('div', { className: 'cabinet-body', text: 'Считаем…' })
  box.append(
    el('div', { className: 'cabinet-head' }, [
      el('h3', { text: 'Личный кабинет' }),
      el('span', { className: 'muted', text: String(session.label || '').replace(/^null$/i, '') }),
    ]),
    body,
  )

  listMyMarks()
    .then((rows) => {
      const list = Array.isArray(rows) ? rows : []
      if (!list.length) {
        body.replaceChildren(
          el('p', {
            className: 'muted',
            style: 'margin:0',
            text: 'Пока нет оценок и отметок о пропусках.',
          }),
        )
        return
      }
      const grades = list
        .map((r) => Number(r.grade))
        .filter((n) => Number.isFinite(n) && n >= 2 && n <= 5)
      const avg = grades.length
        ? (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(2)
        : '—'
      const absent = list.filter((r) => {
        const att = String(r.attendance || '')
        return att && att !== 'present'
      }).length
      const subjects = new Set(list.map((r) => String(r.subject || '').trim()).filter(Boolean))

      const stat = (value, caption, tone) =>
        el('div', { className: `cabinet-stat${tone ? ` is-${tone}` : ''}` }, [
          el('strong', { text: String(value) }),
          el('span', { text: caption }),
        ])

      body.replaceChildren(
        el('div', { className: 'cabinet-stats' }, [
          stat(avg, 'средний балл', 'avg'),
          stat(grades.length, 'оценок'),
          stat(absent, 'пропусков', absent ? 'bad' : ''),
          stat(subjects.size, 'предметов'),
        ]),
        el('div', { className: 'cabinet-actions' }, [
          el('button', {
            type: 'button',
            className: 'btn secondary',
            text: 'Открыть дневник',
            onClick: () => {
              state.gradesMode = 'current'
              state.studyMode = 'grades'
              gotoTab('grades', { animate: true })
            },
          }),
        ]),
      )
    })
    .catch((err) => {
      body.replaceChildren(
        el('p', {
          className: 'muted',
          style: 'margin:0',
          text: err?.message || 'Не удалось загрузить сводку.',
        }),
      )
    })
  return box
}

export function renderMore() {
  if (state.legalDoc) return renderLegalDoc(state.legalDoc)
  if (state.moreScreen === 'overrides') return renderMoreOverrides()
  if (state.moreScreen === 'group') return renderMoreGroup()
  if (state.moreScreen === 'contacts') return renderMoreContacts()
  if (state.moreScreen === 'mycode') return renderMoreMyCode()
  if (state.moreScreen === 'support') return renderMoreSupport()
  if (state.moreScreen === 'students') return renderMoreStudents()
  if (state.moreScreen === 'compare') return renderCompare()
  // Доп. образование и кружки живут только на главной — см. renderHome().
  return MORE_UI_V2 ? renderMoreV2() : renderMoreClassic()
}

/** Открыть доп. образование / кружки на главной (а не в профиле). */
export function openProgramScreen(kind) {
  state.moreScreen = kind === 'club' ? 'clubs' : 'dpo'
  gotoTab('home', { animate: true })
}

/**
 * «Коды студентов» в профиле.
 *
 * Раньше коды можно было выдать только из журнала конкретной пары — чтобы
 * добавить новому студенту код, нужно было сначала найти пару. Теперь это
 * отдельный экран: админ выбирает любую группу, староста/куратор — свою.
 */
export function renderMoreStudents() {
  const session = getSession()
  const panel = el('div', { className: 'panel' })
  if (!session) {
    panel.append(
      el('div', { className: 'card' }, [
        el('p', { className: 'muted', text: 'Сначала войди.' }),
        el('button', {
          type: 'button',
          className: 'btn secondary',
          text: '← Профиль',
          onClick: () => {
            state.moreScreen = ''
            render({ force: true })
          },
        }),
      ]),
    )
    return panel
  }

  const canWrite = canEdit(state.groupId) || session.role === 'admin' || session.role === 'curator'
  if (!canWrite) {
    panel.append(
      el('div', { className: 'card' }, [
        el('p', { className: 'muted', text: 'Коды выдаёт староста, куратор или админ.' }),
        el('button', {
          type: 'button',
          className: 'btn secondary',
          text: '← Профиль',
          onClick: () => {
            state.moreScreen = ''
            render({ force: true })
          },
        }),
      ]),
    )
    return panel
  }

  // Админ и «все группы» — любой список; староста — только своя группа.
  const allGroups = listGroups()
  const groups =
    session.role === 'admin' || session.curatorAll || session.allGroups
      ? allGroups
      : allGroups.filter((g) => g.id === session.groupId)

  const defaultGroupId = session.groupId || (groups[0] && groups[0].id) || state.groupId

  panel.append(
    el('div', { className: 'card' }, [
      renderStudentsScreen({
        groupId: defaultGroupId,
        groups: groups.length ? groups : allGroups,
        flash: (text, isError) => flash(text, isError),
        onBack: () => {
          state.moreScreen = ''
          render({ force: true })
        },
        onPickGroup: (id) => {
          if (id) state.groupId = id
        },
      }),
    ]),
  )
  return panel
}

/**
 * Смена собственного кода. Отдельный экран профиля — в журнале эта форма
 * отвлекала от оценок и ломала ритм заголовков.
 */
export function renderMoreMyCode() {
  const panel = el('div', { className: 'panel' }, [
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

  const input = el('input', {
    type: 'password',
    maxlength: '64',
    autocomplete: 'new-password',
    placeholder: 'Новый код, от 8 символов',
    value: state.loginCodeDraft || '',
  })
  const reveal = el('button', {
    type: 'button',
    className: 'journal-link',
    text: 'Показать',
    onClick: () => {
      const hidden = input.type === 'password'
      input.type = hidden ? 'text' : 'password'
      reveal.textContent = hidden ? 'Скрыть' : 'Показать'
    },
  })
  const save = el('button', { className: 'btn', type: 'submit', text: 'Сохранить код' })

  const form = el('form', { className: 'field', style: 'gap:10px' }, [
    el('label', { text: 'Новый код' }),
    input,
    el('p', {
      className: 'muted',
      style: 'margin:0;font-size:12.5px',
      text: 'Не короче 8 символов. Запиши куда-нибудь — восстановить нельзя, только выдать новый через старосту.',
    }),
    el('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, [save, reveal]),
  ])
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    save.disabled = true
    save.textContent = 'Сохраняю…'
    try {
      await setOwnStudentCode(input.value)
      showToast('Код обновлён. В следующий раз входи им.')
      state.loginCodeDraft = ''
      input.value = ''
    } catch (err) {
      showToast(err.message, true)
    } finally {
      save.disabled = false
      save.textContent = 'Сохранить код'
    }
  })

  panel.append(el('div', { className: 'card' }, [el('h3', { text: 'Сменить код' }), form]))
  return panel
}

/**
 * «Мои контакты»: студент сам решает, чем делиться.
 * Ничего не подтягивается из внешних файлов — пустое поле значит «не указано».
 */
export function renderMoreContacts() {
  const back = () =>
    el('button', {
      type: 'button',
      className: 'btn secondary',
      text: '← Профиль',
      onClick: () => {
        state.moreScreen = ''
        render({ force: true })
      },
    })

  const panel = el('div', { className: 'panel' }, [back()])
  const card = el('div', { className: 'card' })
  panel.append(card)

  const build = (me) => {
    const phone = el('input', {
      type: 'tel',
      placeholder: '+7 900 000 00 00',
      value: formatPhone(me?.phone || ''),
      autocomplete: 'tel',
      maxlength: '20',
      inputmode: 'tel',
    })
    // Плюс уже стоит: человек вводит 7/8 и цифры, пробелы расставляются сами.
    phone.addEventListener('input', () => {
      const atEnd = phone.selectionStart === phone.value.length
      phone.value = formatPhone(phone.value)
      if (atEnd) {
        const len = phone.value.length
        try {
          phone.setSelectionRange(len, len)
        } catch {
          /* ignore */
        }
      }
    })
    const email = el('input', {
      type: 'email',
      placeholder: 'you@example.ru',
      value: me?.email || '',
      autocomplete: 'email',
      maxlength: '96',
    })
    const tg = el('input', {
      type: 'text',
      placeholder: '@nickname',
      value: me?.telegram || '',
      autocomplete: 'off',
      maxlength: '64',
    })
    const visible = el('input', {
      type: 'checkbox',
      checked: me?.visible ? true : null,
      id: 'contacts-visible',
    })

    const form = el('form', { className: 'contacts-form' }, [
      el('h3', { text: 'Мои контакты' }),
      el('p', {
        className: 'muted',
        style: 'margin:0 0 10px',
        text: 'Необязательно. Заполняй, только если хочешь, чтобы одногруппники могли связаться.',
      }),
      el('div', { className: 'field' }, [el('label', { text: 'Телефон' }), phone]),
      el('div', { className: 'field' }, [el('label', { text: 'Почта' }), email]),
      el('div', { className: 'field' }, [el('label', { text: 'Telegram' }), tg]),
      el('label', { className: 'contacts-visible', for: 'contacts-visible' }, [
        visible,
        el('span', { text: 'Показывать эти контакты моей группе' }),
      ]),
      el('button', {
        type: 'submit',
        className: 'btn',
        style: 'margin-top:12px;width:100%',
        text: 'Сохранить',
      }),
    ])

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const btn = form.querySelector('button[type="submit"]')
      if (btn) btn.disabled = true
      try {
        await setMyContacts({
          phone: formatPhone(phone.value),
          email: email.value.trim(),
          telegram: tg.value.trim(),
          visible: !!visible.checked,
        })
        flash(visible.checked ? 'Сохранено. Группа увидит контакты.' : 'Сохранено. Контакты видишь только ты.')
        state.moreScreen = 'group'
        render({ force: true })
      } catch (err) {
        flash(err.message, true)
        if (btn) btn.disabled = false
      }
    })

    card.replaceChildren(form)
  }

  card.append(el('p', { className: 'muted', style: 'margin:0', text: 'Загружаем…' }))
  groupmates(state.groupId)
    .then((res) => build(res.me))
    .catch((err) => {
      const msg = String(err?.message || '')
      const notDeployed = /PGRST202|could not find the function|does not exist/i.test(msg)
      if (notDeployed) {
        card.replaceChildren(
          el('p', {
            className: 'muted',
            style: 'margin:0',
            text: 'Контакты ещё не включены на сервере: выполни supabase/contacts_and_groupmates.sql в Supabase → SQL Editor.',
          }),
        )
        return
      }
      build(null)
    })

  return panel
}

/** Замены внутри профиля — отдельной вкладки больше нет. */
export function renderMoreOverrides() {
  const group = getGroup(state.groupId)
  return el('div', { className: 'panel' }, [
    el('button', {
      type: 'button',
      className: 'btn secondary',
      text: '← Профиль',
      onClick: () => {
        state.moreScreen = ''
        render({ force: true })
      },
    }),
    group ? renderOverridesTab(group) : el('div', { className: 'empty', text: 'Сначала выбери группу.' }),
  ])
}

/**
 * Карточка ролей группы.
 * Староста видит, кто его замы (до 4) и кто может писать ДЗ (без ограничения).
 * Зам видит только список, без права назначать замов — сервер это тоже проверяет.
 */
export function paintStaffCard(host, students) {
  const groupId = state.groupId
  if (!groupId) {
    host.remove()
    return
  }

  const build = (data) => {
    const canEdit = ['admin', 'curator', 'starosta', 'deputy'].includes(data.me)
    const canSetDeputy = ['admin', 'curator', 'starosta'].includes(data.me)
    if (!canEdit) {
      host.remove()
      return
    }
    const deputies = data.deputies || []
    const hwEditors = data.hwEditors || []
    const newsEditors = data.newsEditors || []
    const deputyIds = new Set(deputies.map((d) => String(d.studentId)))
    const hwIds = new Set(hwEditors.map((d) => String(d.studentId)))
    const newsIds = new Set(newsEditors.map((d) => String(d.studentId)))
    const meDeputyCount = deputies.length
    const canSetNews = ['admin', 'curator', 'starosta', 'deputy'].includes(data.me)

    const apply = async (studentId, kind, on) => {
      try {
        const next = await staffSet(groupId, studentId, kind, on)
        build(next)
        showToast(on ? 'Права выданы' : 'Права сняты')
      } catch (err) {
        showToast(err.message, true)
      }
    }

    /** Смена роли в students: староста/препод → обычный студент и обратно. */
    const changeRole = async (studentId, role) => {
      try {
        await setStudentRole(studentId, role)
        const next = await staffList(groupId)
        build(next)
        showToast(role === 'student' ? 'Теперь обычный студент' : 'Роль обновлена')
      } catch (err) {
        showToast(err.message, true)
      }
    }

    // Компактный список: только те, у кого есть роль, плюс кнопка «назначить».
    const rows = students.filter((st) => {
      const id = String(st.id)
      if (deputyIds.has(id) || hwIds.has(id) || newsIds.has(id)) return true
      return st.role === 'starosta' || st.role === 'teacher'
    })

    const chips = (st) => {
      const id = String(st.id)
      const out = []
      if (st.role === 'starosta' || st.role === 'teacher') {
        out.push(el('span', { className: 'staff-chip is-deputy', text: 'Староста' }))
      }
      if (deputyIds.has(id)) out.push(el('span', { className: 'staff-chip is-deputy', text: 'Зам' }))
      if (hwIds.has(id)) out.push(el('span', { className: 'staff-chip is-hw', text: 'ДЗ' }))
      if (newsIds.has(id)) out.push(el('span', { className: 'staff-chip is-news', text: 'Лента' }))
      return out
    }

    const listBox = el('div', { className: 'staff-list' })
    if (!rows.length) {
      listBox.append(
        el('p', {
          className: 'muted',
          style: 'margin:0;font-size:12.5px',
          text: 'Пока никого не назначили. Можно выдать права ниже.',
        }),
      )
    } else {
      rows.forEach((st) => {
        const name = String(st.fullName || st.surname || '').trim() || 'Без имени'
        listBox.append(
          el('div', { className: 'staff-row' }, [
            el('span', { className: 'staff-ava', text: (name.charAt(0) || '?').toUpperCase() }),
            el('span', { className: 'staff-main' }, [
              el('span', { className: 'staff-name', text: name }),
              el('span', { className: 'staff-chips' }, chips(st)),
            ]),
          ]),
        )
      })
    }

    // Назначение: выпадающий список свободных студентов + выбор роли.
    const free = students.filter((st) => {
      const id = String(st.id)
      return !deputyIds.has(id) && !hwIds.has(id)
    })
    const picker = el(
      'select',
      { className: 'staff-select' },
      [
        el('option', { value: '', text: 'Выбрать студента…' }),
        ...free.map((st) => {
          const name = String(st.fullName || st.surname || '').trim() || 'Без имени'
          return el('option', { value: String(st.id), text: name })
        }),
      ],
    )

    const give = (kind) => {
      const id = picker.value
      if (!id) {
        showToast('Сначала выбери студента', true)
        return
      }
      void apply(id, kind, true)
    }

    const assignBox = el('div', { className: 'staff-assign' }, [
      picker,
      el('div', { className: 'staff-assign-actions' }, [
        canSetDeputy
          ? el('button', {
              type: 'button',
              className: 'staff-btn',
              text: meDeputyCount >= 4 ? 'Замов уже 4' : 'Сделать замом',
              disabled: meDeputyCount >= 4,
              onClick: () => give('deputy'),
            })
          : null,
        el('button', {
          type: 'button',
          className: 'staff-btn is-hw',
          text: 'Разрешить писать ДЗ',
          onClick: () => give('hw'),
        }),
        canSetNews
          ? el('button', {
              type: 'button',
              className: 'staff-btn is-news',
              text: 'Разрешить вести ленту',
              onClick: () => give('news'),
            })
          : null,
      ]),
    ])

    // Снятие прав — маленькие крестики у чипов.
    const revoke = (st) => {
      const id = String(st.id)
      const btns = []
      // Роль «староста» хранится в students.role, а не в group_staff,
      // поэтому её не было видно в списке ниже — и снять было нечем.
      if ((st.role === 'starosta' || st.role === 'teacher') && canSetDeputy) {
        btns.push(
          el('button', {
            type: 'button',
            className: 'staff-revoke',
            text: st.role === 'teacher' ? 'снять препода' : 'снять старосту',
            onClick: () => changeRole(id, 'student'),
          }),
        )
      }
      if (deputyIds.has(id) && canSetDeputy) {
        btns.push(
          el('button', {
            type: 'button',
            className: 'staff-revoke',
            text: 'снять зама',
            onClick: () => apply(id, 'deputy', false),
          }),
        )
      }
      if (hwIds.has(id)) {
        btns.push(
          el('button', {
            type: 'button',
            className: 'staff-revoke',
            text: 'снять ДЗ',
            onClick: () => apply(id, 'hw', false),
          }),
        )
      }
      if (newsIds.has(id)) {
        btns.push(
          el('button', {
            type: 'button',
            className: 'staff-revoke',
            text: 'снять ленту',
            onClick: () => apply(id, 'news', false),
          }),
        )
      }
      return btns.length ? el('span', { className: 'staff-revoke-wrap' }, btns) : null
    }

    host.replaceChildren(
      el('div', { className: 'staff-head' }, [
        el('h3', { text: 'Роли в группе' }),
        el('span', { className: 'muted', text: `${meDeputyCount} / 4 замов` }),
      ]),
      el('p', {
        className: 'muted staff-hint',
        text: canSetDeputy
          ? 'Зам старосты ведёт журнал и построение. Писать ДЗ можно разрешить любому — без ограничения.'
          : 'Ты зам старосты: ведёшь журнал и построение, можешь разрешать писать ДЗ.',
      }),
      listBox,
      rows.map((st) => revoke(st)).filter(Boolean).length
        ? el('div', { className: 'staff-revoke-list' }, rows.map((st) => {
            const name = String(st.fullName || st.surname || '').trim() || 'Без имени'
            const rev = revoke(st)
            return rev
              ? el('div', { className: 'staff-revoke-row' }, [
                  el('span', { className: 'staff-revoke-name', text: name }),
                  rev,
                ])
              : null
          }))
        : null,
      assignBox,
    )
  }

  staffList(groupId)
    .then(build)
    .catch((err) => {
      const msg = String(err?.message || '')
      const notDeployed = /PGRST202|could not find the function|does not exist/i.test(msg)
      host.replaceChildren(
        el('p', {
          className: 'muted',
          style: 'margin:0',
          text: notDeployed
            ? 'Роли ещё не включены на сервере: выполни supabase/roles_delegation.sql в Supabase → SQL Editor.'
            : msg || 'Не удалось загрузить роли.',
        }),
      )
    })
}

/** «Моя группа»: кто учится рядом. Без кодов и контактов — только имена и роли. */
export function renderMoreGroup() {
  const panel = el('div', { className: 'panel' }, [
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
  const body = el('div', { className: 'card groupmates-card' }, [
    el('p', { className: 'muted', style: 'margin:0', text: 'Загружаем…' }),
  ])
  panel.append(body)

  // Роли: сразу видно, кто староста, кто зам, кто может писать ДЗ.
  const staffHost = el('div', { className: 'card staff-card' }, [
    el('p', { className: 'muted', style: 'margin:0', text: 'Загружаем роли…' }),
  ])
  panel.append(staffHost)

  groupmates(state.groupId)
    .then((res) => {
      const list = res.students || []
      paintStaffCard(staffHost, list)
      if (!list.length) {
        body.replaceChildren(
          el('p', {
            className: 'muted',
            style: 'margin:0',
            text: 'В группе пока никого нет. Староста добавляет состав в журнале.',
          }),
        )
        return
      }
      body.replaceChildren(
        el('div', { className: 'groupmates-head' }, [
          el('h3', { text: res.groupName || 'Моя группа' }),
          el('span', { className: 'muted', text: `${list.length} чел.` }),
        ]),
        el(
          'div',
          { className: 'groupmates-list' },
          list.map((st) => {
            const name = String(st.fullName || st.fullname || st.surname || '').trim()
            const role = String(st.role || 'student')
            const isMe = !!(st.isMe ?? st.isme)
            const contacts = [
              st.phone ? { kind: 'tel', text: st.phone, href: `tel:${st.phone.replace(/[^\d+]/g, '')}` } : null,
              st.email ? { kind: 'mail', text: st.email, href: `mailto:${st.email}` } : null,
              st.telegram
                ? {
                    kind: 'tg',
                    text: st.telegram,
                    href: `https://t.me/${String(st.telegram).replace(/^@/, '')}`,
                  }
                : null,
            ].filter(Boolean)

            return el('div', { className: `groupmates-row${isMe ? ' is-me' : ''}` }, [
              el('span', { className: 'groupmates-ava', text: (name.charAt(0) || '?').toUpperCase() }),
              el('span', { className: 'groupmates-main' }, [
                el('span', { className: 'groupmates-name', text: name || 'Без имени' }),
                role !== 'student'
                  ? el('span', { className: 'groupmates-role', text: ROLE_LABEL[role] || role })
                  : null,
                contacts.length
                  ? el(
                      'span',
                      { className: 'groupmates-contacts' },
                      contacts.map((c) =>
                        el('a', {
                          className: `groupmates-contact is-${c.kind}`,
                          href: c.href,
                          rel: c.kind === 'tg' ? 'noopener noreferrer' : null,
                          target: c.kind === 'tg' ? '_blank' : null,
                          text: c.text,
                        }),
                      ),
                    )
                  : null,
              ]),
              isMe ? el('span', { className: 'groupmates-me', text: 'это ты' }) : null,
            ])
          }),
        ),
        el('button', {
          type: 'button',
          className: 'btn secondary',
          style: 'margin:10px 0 4px;width:100%',
          text: 'Изменить мои контакты',
          onClick: () => {
            state.moreScreen = 'contacts'
            render({ force: true })
          },
        }),
      )
    })
    .catch((err) => {
      const msg = String(err?.message || '')
      const notDeployed = /PGRST202|could not find the function|does not exist/i.test(msg)
      body.replaceChildren(
        el('p', {
          className: 'muted',
          style: 'margin:0',
          text: notDeployed
            ? 'Список группы ещё не включён на сервере. Нужно один раз выполнить supabase/contacts_and_groupmates.sql в Supabase → SQL Editor.'
            : msg || 'Не удалось загрузить список группы.',
        }),
      )
    })

  return panel
}

export function renderMoreV2() {
  const group = getGroup(state.groupId)
  const session = getSession()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const panel = el('div', { className: 'panel more-v2' }, [])

  if (session) {
    const customLabel = (session.label || '').trim()
    const label =
      customLabel ||
      (session.role === 'admin'
        ? 'Никитос'
        : session.role === 'curator'
          ? 'Куратор'
          : session.role === 'student'
            ? 'Студент'
            : 'Староста')
    const letter = label.charAt(0).toUpperCase() || '?'
    // Имя сверху (Сидорова), синий бейдж — отдельная подпись (Командир), иначе «Староста»
    const customRole = (session.roleTitle || '').trim()
    const roleText =
      session.role === 'admin'
        ? 'Админ'
        : session.role === 'curator'
          ? 'Куратор'
          : session.role === 'student'
            ? 'Студент'
            : customRole || (session.role === 'starosta' ? 'Староста' : 'Редактор')
    const avaUrl = PROFILE_AVATARS ? (session.avatarUrl || '').trim() : ''
    const avatarNode = avaUrl
      ? el('div', { className: 'more-avatar more-avatar-photo' }, [
          el('img', {
            src: avaUrl,
            alt: '',
            loading: 'lazy',
            referrerpolicy: 'no-referrer',
          }),
        ])
      : el('div', { className: 'more-avatar', text: letter })
    panel.append(
      el('div', { className: 'card more-profile-card more-profile-centered' }, [
        el('div', { className: 'more-profile' }, [
          avatarNode,
          el('div', { className: 'more-profile-meta' }, [
            el('div', { className: 'more-profile-name', text: label }),
            el('div', { className: 'more-profile-line' }, [
              el('span', { className: 'more-role-badge', text: roleText }),
              group ? el('span', { className: 'more-profile-group', text: group.name }) : null,
            ]),
          ]),
        ]),
        renderProfileAvatarControls(session),
      ]),
    )
    // У админа и кода старосты кабинета нет — renderCabinetCard вернёт null.
    // append(null) вставил бы в DOM текстовую строку «null», поэтому проверяем.
    const cabinet = renderCabinetCard(session)
    if (cabinet) panel.append(cabinet)
  }

  const themeIco = moreThemeIcon(isDark)
  const settingsKids = [
    el('h3', { text: 'Настройки' }),
    moreSettingsRow({
      leading: themeIco,
      title: 'Оформление',
      sub: isDark ? 'Тёмная · сменить' : 'Светлая · сменить',
      onClick: () => {
        const nextDark = !(document.documentElement.getAttribute('data-theme') === 'dark')
        const next = nextDark ? 'dark' : 'light'
        applyTheme(next)
        const ico = document.querySelector('.theme-toggle-ico')
        const row = document.querySelector('.more-settings .more-row')
        const subEl = row?.querySelector('.more-row-sub')
        if (ico && motionOk()) {
          // force reflow so transition always plays
          void ico.offsetWidth
          ico.classList.toggle('is-dark', nextDark)
          if (subEl) subEl.textContent = nextDark ? 'Тёмная · сменить' : 'Светлая · сменить'
          return
        }
        render()
      },
    }),
    moreSettingsRow({
      icon: 'users',
      title: 'Сменить группу',
      sub: group ? `Сейчас: ${group.name}` : 'Выбрать группу',
      onClick: () => openGroupPicker(),
    }),
    session
      ? moreSettingsRow({
          icon: 'group',
          title: 'Моя группа',
          sub: 'Одногруппники и роли',
          onClick: () => {
            state.moreScreen = 'group'
            render({ force: true })
          },
        })
      : null,
    session && (session.role === 'student' || String(session.codeId || '').startsWith('st_'))
      ? moreSettingsRow({
          icon: 'contact',
          title: 'Мои контакты',
          sub: 'Телефон, почта, Telegram — по желанию',
          onClick: () => {
            state.moreScreen = 'contacts'
            render({ force: true })
          },
        })
      : null,
    moreSettingsRow({
      icon: 'swap',
      title: 'Замены',
      sub: 'Отмены и переносы пар',
      onClick: () => {
        state.moreScreen = 'overrides'
        render({ force: true })
      },
    }),
    session && (session.role === 'admin' || session.role === 'curator' || session.allGroups || canEdit(state.groupId))
      ? moreSettingsRow({
          icon: 'key',
          title: 'Коды студентов',
          sub: 'Выдать код, роли, добавить студента',
          onClick: () => {
            state.moreScreen = 'students'
            render({ force: true })
          },
        })
      : null,
    canCompareGroups(session)
      ? moreSettingsRow({
          icon: 'compare',
          title: 'Сравнить с группой',
          sub: state.compareGroupId && getGroup(state.compareGroupId)
            ? `С ${getGroup(state.compareGroupId).name}: перемены и построение`
            : 'Когда вы пересекаетесь',
          onClick: () => {
            state.moreScreen = 'compare'
            render({ force: true })
          },
        })
      : null,
    moreSettingsRow({
      icon: 'help',
      title: 'Техподдержка',
      sub: 'Написать в поддержку',
      onClick: () => {
        state.moreScreen = 'support'
        render({ force: true })
      },
    }),
  ]

  // Смена своего кода — раньше жила в «Учёбе» и мешала журналу.
  if (session && (session.role === 'student' || String(session.codeId || '').startsWith('st_'))) {
    settingsKids.push(
      moreSettingsRow({
        icon: 'key',
        title: 'Сменить код',
        sub: 'Свой код входа',
        onClick: () => {
          state.moreScreen = 'mycode'
          render({ force: true })
        },
      }),
    )
  }

  if (!isStandaloneApp()) {
    settingsKids.push(
      moreSettingsRow({
        icon: 'phone',
        title: 'На экран телефона',
        sub: isIosDevice() ? 'Инструкция для Safari' : 'Ярлык сайта',
        className: 'more-row-install',
        expanded: !!state.showInstallHelp,
        onClick: async () => {
          if (await tryNativeInstall()) return
          setInstallHelpOpen(!state.showInstallHelp)
        },
      }),
    )
  }

  const settingsCard = el('div', { className: 'card more-settings' }, settingsKids)
  if (!isStandaloneApp()) {
    const open = !!state.showInstallHelp || isIosDevice()
    settingsCard.append(
      el('div', { className: `more-fold${open ? ' is-open' : ''}` }, [
        el('div', { className: 'more-fold-clip' }, [
          el('div', { className: 'more-fold-body' }, [renderInstallCard()]),
        ]),
      ]),
    )
  }
  panel.append(settingsCard)

  if (isStandaloneApp()) {
    panel.append(
      el('div', { className: 'card' }, [
        el('p', { className: 'muted', style: 'margin:0', text: 'Уже открыто как ярлык — всё ок.' }),
      ]),
    )
  }

  if (!session) {
    const form = el('form', {
      className: state.highlightLogin ? 'card more-login login-highlight' : 'card more-login',
      id: 'more-login-form',
    })
    const code = el('input', {
      type: 'password',
      autocomplete: 'current-password',
      maxlength: '64',
      placeholder: 'Введите код авторизации',
      required: true,
      id: 'more-login-code',
      value: state.loginCodeDraft || '',
      disabled: isLocalDeviceBanned() ? true : undefined,
      enterKeyHint: 'go',
    })
    // Код не теряется при перерисовке: тосты и синк вызывают render() постоянно.
    code.addEventListener('input', () => {
      state.loginCodeDraft = code.value
    })
    const revealBtn = el('button', {
      type: 'button',
      className: 'journal-link login-reveal',
      text: 'Показать',
      onClick: () => {
        const hidden = code.type === 'password'
        code.type = hidden ? 'text' : 'password'
        revealBtn.textContent = hidden ? 'Скрыть' : 'Показать'
      },
    })
    const who = state.loginNeedWho
      ? el('input', {
          type: 'text',
          maxlength: '64',
          placeholder: 'Фамилия',
          autocomplete: 'name',
          value: state.loginWhoDraft || '',
        })
      : null
    if (who) {
      who.addEventListener('input', () => {
        state.loginWhoDraft = who.value
      })
    }
    form.append(
      el('h3', { text: 'Вход' }),
      el('p', {
        className: 'muted',
        text: isLocalDeviceBanned()
          ? 'С этого устройства сайт закрыт (бан).'
          : state.loginNeedWho
            ? 'Напиши фамилию — так поймём, чей это код.'
            : 'Код выдаёт админ.',
      }),
      el('div', { className: 'field' }, [
        el('div', { className: 'field-head' }, [
          el('label', { text: 'Код доступа' }),
          revealBtn,
        ]),
        code,
      ]),
      who ? el('div', { className: 'field' }, [el('label', { text: 'Фамилия' }), who]) : null,
      el('button', {
        className: 'btn',
        type: 'submit',
        text: 'Войти',
        disabled: isLocalDeviceBanned() ? true : undefined,
      }),
    )
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      try {
        const s = await loginWithCode(code.value, state.groupId || null, who?.value || '')
        if (s.groupId) {
          state.groupId = s.groupId
          localStorage.setItem(SELECTED_GROUP_KEY, s.groupId)
        }
        state.tab = 'schedule'
        state.highlightLogin = false
        state.loginNeedWho = false
        state.loginCodeDraft = ''
        state.loginWhoDraft = ''
        const whoName = (s.label || '').trim() || (s.role === 'admin' ? 'Никитос' : 'староста')
        flash(`Вы вошли как ${whoName}`)
      } catch (err) {
        if (err.needWho) {
          state.loginNeedWho = true
          state.loginCodeDraft = code.value
          render()
          return
        }
        flash(err.message, true)
        if (isLocalDeviceBanned()) render({ force: true })
      }
    })
    panel.append(form)
    if (state.highlightLogin) {
      requestAnimationFrame(() => {
        form.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Не фокусируем поле — иначе на телефоне сразу вылезает клавиатура
        setTimeout(() => {
          state.highlightLogin = false
          form.classList.remove('login-highlight')
        }, 2200)
      })
    }
  } else {
    panel.append(
      el('div', { className: 'card more-logout-card' }, [
        el('button', {
          type: 'button',
          className: 'btn secondary more-logout-btn',
          text: 'Выйти с этого устройства',
          onClick: () => {
            void confirmAndLogout()
          },
        }),
      ]),
    )
  }

  panel.append(
    el('div', { className: 'card more-support' }, [
      el('h3', { text: 'Поддержка' }),
      el('p', {
        className: 'muted',
        style: 'margin:0 0 12px',
        text: 'Вопросы и идеи по сайту — напиши в Telegram, ответим туда же.',
      }),
      el('a', {
        className: 'btn',
        href: 'https://t.me/rasphelp_bot',
        target: '_blank',
        rel: 'noopener noreferrer',
        text: 'Написать в поддержку',
        style: 'display:inline-flex;text-align:center;text-decoration:none',
      }),
    ]),
  )

  if (session?.role !== 'admin' && canUseFreeRooms(session)) {
    panel.append(
      el('div', { className: 'card more-free-rooms' }, [
        el('h3', { text: 'Свободные аудитории' }),
        renderAdminFreeRooms(),
      ]),
    )
  }

  if (session?.role === 'admin') panel.append(renderAdminPanel())

  panel.append(
    el('div', { className: 'more-legal' }, [
      el('button', {
        type: 'button',
        className: 'more-legal-link',
        text: 'Условия использования',
        onClick: () => {
          state.legalDoc = 'terms'
          render()
        },
      }),
      el('span', { className: 'more-legal-sep', text: '·' }),
      el('button', {
        type: 'button',
        className: 'more-legal-link',
        text: 'Политика конфиденциальности',
        onClick: () => {
          state.legalDoc = 'privacy'
          render()
        },
      }),
    ]),
  )

  if (session) {
    panel.append(
      el('p', {
        className: 'muted more-session-note',
        text: 'Вход на этом устройстве остаётся, пока сам не выйдешь. Полный выход — кнопка справа сверху.',
      }),
    )
  }

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

export function renderMoreClassic() {
  const group = getGroup(state.groupId)
  const session = getSession()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const panel = el('div', { className: 'panel' }, [
    el('p', { className: 'muted', text: 'Группа, вход, админка' }),
    el('div', { className: 'card' }, [
      el('h3', { text: 'Оформление' }),
      el('button', {
        type: 'button',
        className: 'btn secondary',
        text: isDark ? 'Включить светлую тему' : 'Включить тёмную тему',
        onClick: () => {
          applyTheme(isDark ? 'light' : 'dark')
          render()
        },
      }),
    ]),
    el('div', { className: 'card' }, [
      el('h3', { text: 'Сменить группу' }),
      el('button', {
        type: 'button',
        className: 'btn secondary',
        text: group ? `Сейчас: ${group.name}` : 'Выбрать группу',
        onClick: () => openGroupPicker(),
      }),
    ]),
    el('div', { className: 'card' }, [
      el('h3', { text: 'Сравнить с группой' }),
      el('p', {
        className: 'muted',
        style: 'margin:0 0 10px',
        text: 'Общие перемены, построение и пары в одном кабинете с другой группой.',
      }),
      el('button', {
        type: 'button',
        className: 'btn secondary',
        text: 'Открыть сравнение',
        onClick: () => {
          state.moreScreen = 'compare'
          render({ force: true })
        },
      }),
    ]),
    el('div', { className: 'card' }, [
      el('h3', { text: 'Поддержка' }),
      el('p', {
        className: 'muted',
        style: 'margin:0 0 10px',
        text: 'Вопросы и идеи по сайту — напиши в Telegram, ответим туда же.',
      }),
      el('a', {
        className: 'btn',
        href: 'https://t.me/rasphelp_bot',
        target: '_blank',
        rel: 'noopener noreferrer',
        text: 'Написать в поддержку',
        style: 'display:inline-block;text-align:center;text-decoration:none',
      }),
    ]),
  ])

  if (!session) {
    const form = el('form', {
      className: state.highlightLogin ? 'card login-highlight' : 'card',
      id: 'more-login-form',
    })
    const code = el('input', {
      type: 'password',
      autocomplete: 'current-password',
      maxlength: '64',
      placeholder: 'Введите код авторизации',
      required: true,
      id: 'more-login-code',
      value: state.loginCodeDraft || '',
      disabled: isLocalDeviceBanned() ? true : undefined,
      enterKeyHint: 'go',
    })
    code.addEventListener('input', () => {
      state.loginCodeDraft = code.value
    })
    const revealBtn = el('button', {
      type: 'button',
      className: 'journal-link login-reveal',
      text: 'Показать',
      onClick: () => {
        const hidden = code.type === 'password'
        code.type = hidden ? 'text' : 'password'
        revealBtn.textContent = hidden ? 'Скрыть' : 'Показать'
      },
    })
    const who = state.loginNeedWho
      ? el('input', {
          type: 'text',
          maxlength: '64',
          placeholder: 'Фамилия',
          autocomplete: 'name',
          value: state.loginWhoDraft || '',
        })
      : null
    if (who) {
      who.addEventListener('input', () => {
        state.loginWhoDraft = who.value
      })
    }
    form.append(
      el('h3', { text: 'Вход' }),
      el('p', {
        className: 'muted',
        text: isLocalDeviceBanned()
          ? 'С этого устройства сайт закрыт (бан).'
          : state.loginNeedWho
            ? 'Напиши фамилию — так поймём, чей это код.'
            : 'Код выдаёт админ.',
      }),
      el('div', { className: 'field' }, [
        el('div', { className: 'field-head' }, [
          el('label', { text: 'Код доступа' }),
          revealBtn,
        ]),
        code,
      ]),
      who ? el('div', { className: 'field' }, [el('label', { text: 'Фамилия' }), who]) : null,
      el('button', {
        className: 'btn',
        type: 'submit',
        text: 'Войти',
        disabled: isLocalDeviceBanned() ? true : undefined,
      }),
    )
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      try {
        const s = await loginWithCode(code.value, state.groupId || null, who?.value || '')
        if (s.groupId) {
          state.groupId = s.groupId
          localStorage.setItem(SELECTED_GROUP_KEY, s.groupId)
        }
        state.tab = 'schedule'
        state.highlightLogin = false
        state.loginNeedWho = false
        state.loginCodeDraft = ''
        state.loginWhoDraft = ''
        const whoName = (s.label || '').trim() || (s.role === 'admin' ? 'Никитос' : 'староста')
        flash(`Вы вошли как ${whoName}`)
      } catch (err) {
        if (err.needWho) {
          state.loginNeedWho = true
          state.loginCodeDraft = code.value
          render()
          return
        }
        flash(err.message, true)
        if (isLocalDeviceBanned()) render({ force: true })
      }
    })
    panel.append(form)
    if (state.highlightLogin) {
      requestAnimationFrame(() => {
        form.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Без автофокуса — клавиатура на телефоне не открывается
        setTimeout(() => {
          state.highlightLogin = false
          form.classList.remove('login-highlight')
        }, 2200)
      })
    }
  } else {
    panel.append(
      el('div', { className: 'card' }, [
        el('h3', {
          text:
            session.role === 'admin'
              ? 'Сессия: админ'
              : session.role === 'student'
                ? `Сессия: ${(session.label || '').trim() || 'студент'}`
                : `Сессия: ${(session.label || '').trim() || 'староста'}`,
        }),
        el('button', {
          type: 'button',
          className: 'btn secondary',
          text: 'Выйти',
          onClick: () => {
            void confirmAndLogout()
          },
        }),
      ]),
    )
  }

  if (session?.role !== 'admin' && canUseFreeRooms(session)) {
    panel.append(
      el('div', { className: 'card more-free-rooms' }, [
        el('h3', { text: 'Свободные аудитории' }),
        renderAdminFreeRooms(),
      ]),
    )
  }

  if (session?.role === 'admin') panel.append(renderAdminPanel())

  panel.append(renderInstallCard())

  panel.append(
    el('div', { className: 'card' }, [
      el('h3', { text: 'Правовая информация' }),
      el('p', {
        className: 'muted',
        text: 'Мы можем сохранять технические логи (IP, действия) для безопасности. Подробности — в документах.',
      }),
      el('button', {
        type: 'button',
        className: 'btn secondary',
        style: 'margin-bottom:8px',
        text: 'Политика конфиденциальности',
        onClick: () => {
          state.legalDoc = 'privacy'
          render()
        },
      }),
      el('button', {
        type: 'button',
        className: 'btn secondary',
        text: 'Условия использования',
        onClick: () => {
          state.legalDoc = 'terms'
          render()
        },
      }),
    ]),
  )

  if (session) {
    panel.append(
      el('p', {
        className: 'muted',
        style: 'margin-top:8px',
        text: 'Вход на этом устройстве остаётся, пока сам не выйдешь. Полный выход — кнопка справа сверху.',
      }),
    )
  }

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

export function renderBannedGate() {
  const base = import.meta.env.BASE_URL || '/chuikov-rasp/'
  const reason = getLocalBanReason()
  const panel = el('div', { className: 'panel banned-gate', style: 'padding-top:24px' })
  panel.append(
    el('header', { className: 'topbar' }, [
      el('div', { className: 'topbar-left' }, [
        el('div', { className: 'brand', text: 'Колледж Чуйкова' }),
        el('h1', { text: 'Вас тут не ждали' }),
      ]),
    ]),
    el('div', { className: 'card banned-gate-card' }, [
      el('img', {
        className: 'banned-cat',
        src: `${base}banned-cat.png`,
        alt: '',
        width: '220',
        height: '220',
        decoding: 'async',
      }),
      el('h2', { className: 'banned-gate-title', text: 'Вы в бане' }),
      reason
        ? el('p', { className: 'banned-gate-reason', text: `Причина: ${reason}` })
        : el('p', {
            className: 'banned-gate-text',
            text: 'Даже котик расстроился. С этого устройства сайт закрыт — и точка.',
          }),
      el('p', {
        className: 'muted banned-gate-sub',
        text: 'Если это ошибка — пиши админу. Если нет — ну что ж.',
      }),
    ]),
  )
  return panel
}

export function renderClosedGate() {
  const panel = el('div', { className: 'panel', style: 'padding-top:24px' })
  panel.append(
    el('header', { className: 'topbar' }, [
      el('div', { className: 'topbar-left' }, [
        el('div', { className: 'brand', text: 'Колледж Чуйкова' }),
        el('h1', { text: 'Сайт временно закрыт' }),
      ]),
    ]),
    el('div', { className: 'card' }, [
      el('p', { text: getClosedMessage() }),
      el('p', {
        className: 'muted',
        style: 'margin-top:8px',
        text: 'Расписание скоро снова будет доступно.',
      }),
    ]),
  )

  const form = el('form', { className: 'card', style: 'margin-top:12px' })
  const code = el('input', {
    type: 'password',
    autocomplete: 'current-password',
    maxlength: '64',
    placeholder: 'Код доступа',
    required: true,
  })
  form.append(
    el('h3', { text: 'Вход' }),
    el('div', { className: 'field' }, [el('label', { text: 'Код' }), code]),
    el('button', { className: 'btn', type: 'submit', text: 'Войти' }),
  )
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      await loginWithCode(code.value, state.groupId || null)
      const s = getSession()
      if (s?.role !== 'admin') {
        await logout()
        flash('Нужен код админа', true)
        return
      }
      flash('Вход выполнен')
      state.tab = 'more'
      render()
    } catch (err) {
      flash(err.message || 'Неверный код', true)
    }
  })
  panel.append(form)
  panel.append(el('div', { id: 'flash-slot' }))
  paintFlashSlot()
  return panel
}

export function renderNav() {
  const items = [
    { id: 'home', label: 'Главная' },
    { id: 'schedule', label: 'Расписание' },
    { id: 'grades', label: 'Учёба' },
    { id: 'teachers', label: 'Справочник' },
    { id: 'more', label: 'Профиль' },
  ]
  return el(
    'nav',
    { className: NAV_WITH_ICONS ? 'nav nav-with-icons' : 'nav' },
    items.map((item) => {
      const btn = el('button', {
        type: 'button',
        className: state.tab === item.id ? 'active' : '',
        onClick: () => {
          hapticTap()
          // Кнопка снизу — плавное появление карточек; свайп идёт без cascade
          switchTab(item.id, { animate: true })
        },
      })
      if (NAV_WITH_ICONS) {
        btn.innerHTML = `${NAV_ICONS[item.id]}<span class="nav-label">${item.label}</span>`
      } else {
        btn.textContent = item.label
      }
      return btn
    }),
  )
}

/**
 * Идёт ли сейчас переход между вкладками.
 * Обёртка оставлена для совместимости: сама проверка живёт в app/tab-shield.js,
 * потому что переменную и чтение нельзя разносить по разным модулям.
 */
export function tabSwitchShieldActiveCompat() {
  return tabSwitchShieldActive()
}

export function clearCascadeAnim(root) {
  if (!root) return
  if (root.classList?.contains('do-cascade')) root.classList.remove('do-cascade')
  root.querySelectorAll?.('.do-cascade').forEach((n) => n.classList.remove('do-cascade'))
}

/** Обращение в техподдержку — короткий экран вместо карточки в самом низу профиля. */
export function renderMoreSupport() {
  const session = getSession()
  const panel = el('div', { className: 'panel' }, [
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

  panel.append(
    el('div', { className: 'card support-hero' }, [
      el('h2', { className: 'support-hero-title', text: 'Техподдержка' }),
      el('p', {
        className: 'muted',
        style: 'margin:0',
        text: 'Что-то не работает, криво показывается или есть идея — напиши нам в Telegram. Ответим туда же, обычно в тот же день.',
      }),
      el('a', {
        className: 'btn support-hero-btn',
        href: 'https://t.me/rasphelp_bot',
        target: '_blank',
        rel: 'noopener noreferrer',
        text: 'Написать в Telegram',
      }),
    ]),
    el('div', { className: 'card' }, [
      el('h3', { text: 'Чтобы решили быстрее' }),
      el('ol', { className: 'support-steps' }, [
        el('li', { text: 'Что именно делал — открыл журнал, нажал «сохранить»…' }),
        el('li', { text: 'Что ожидал увидеть и что увидел на самом деле.' }),
        el('li', { text: 'Модель телефона и браузер: Chrome, Safari.' }),
        el('li', { text: 'Скриншот — если проблема на экране.' }),
      ]),
    ]),
  )

  if (session?.role === 'admin') {
    panel.append(
      el('div', { className: 'card' }, [
        el('p', {
          className: 'muted',
          style: 'margin:0',
          text: 'Обращения студентов приходят в Telegram-бот, а очередь видна в админке → «Обращения».',
        }),
      ]),
    )
  } else {
    panel.append(
      el('div', { className: 'card' }, [
        el('h3', { text: 'Частые вопросы' }),
        el('div', { className: 'support-faq' }, [
          el('p', { className: 'support-faq-q', text: 'Не вижу оценки' }),
          el('p', {
            className: 'support-faq-a',
            text: 'Оценки ставит староста или куратор. Если пары не было в журнале — их просто не завели.',
          }),
          el('p', { className: 'support-faq-q', text: 'Не пускает по коду' }),
          el('p', {
            className: 'support-faq-a',
            text: 'Код выдаёт староста. Если код потерян — попроси новый: старый перестанет работать.',
          }),
          el('p', { className: 'support-faq-q', text: 'Расписание не то' }),
          el('p', {
            className: 'support-faq-a',
            text: 'Проверь группу сверху экрана: свайп по расписанию работает только внутри выбранной группы.',
          }),
        ]),
      ]),
    )
  }

  // —— Проверка связи: сразу видно, что мешает — VPN, DPI или сам сайт
  const netCard = el('div', { className: 'card support-net' })
  const netBody = el('div', { className: 'support-net-body' })
  const rerun = el('button', {
    type: 'button',
    className: 'btn secondary',
    text: 'Проверить связь',
    onClick: () => {
      void runCheck(true)
    },
  })
  netCard.append(
    el('h3', { text: 'Связь с сервером' }),
    el('p', {
      className: 'muted',
      style: 'margin:0 0 10px',
      text: 'Показываем, какие адреса отвечают и за сколько. Если всё «нет» — мешает VPN или блокировка, а не сайт.',
    }),
    netBody,
    el('div', { style: 'margin-top:10px' }, [rerun]),
  )
  panel.append(netCard)

  const runCheck = async (manual = false) => {
    netBody.replaceChildren(el('p', { className: 'muted', style: 'margin:0', text: 'Проверяем…' }))
    if (manual) rerun.disabled = true
    try {
      const rows = await checkConnectivity()
      netBody.replaceChildren(
        ...rows.map((r) =>
          el('div', { className: 'support-net-row' }, [
            el('span', {
              className: `support-net-dot${r.ok ? ' is-ok' : ' is-bad'}`,
              'aria-hidden': 'true',
            }),
            el('span', { className: 'support-net-name', text: r.name }),
            el('span', {
              className: 'support-net-ms',
              text: r.ok ? `${r.ms} мс` : 'нет ответа',
            }),
          ]),
        ),
      )
      const anyOk = rows.some((r) => r.ok)
      netBody.append(
        el('p', {
          className: `support-net-hint${anyOk ? '' : ' is-bad'}`,
          text: anyOk
            ? 'Сайт работает. Если данные всё равно не грузятся — обнови страницу.'
            : 'Ни один адрес не ответил. Похоже, блокирует VPN или провайдер — попробуй выключить VPN или включить его.',
        }),
      )
    } catch (err) {
      netBody.replaceChildren(
        el('p', { className: 'muted', style: 'margin:0', text: err.message || 'Проверка не удалась' }),
      )
    } finally {
      rerun.disabled = false
    }
  }
  void runCheck()

  return panel
}

export function renderProfileAvatarControls(session) {
  if (!PROFILE_AVATARS || !session) return null
  const file = el('input', {
    type: 'file',
    accept: 'image/jpeg,image/png,image/webp',
    style: 'display:none',
  })
  file.addEventListener('change', async () => {
    const f = file.files?.[0]
    file.value = ''
    if (!f) return
    try {
      const cropped = await openImageCropEditor(f, {
        shape: 'circle',
        size: 512,
        name: 'avatar.jpg',
        heading: 'Подгони фото',
        hint: 'Перетащи пальцем/мышью и подвигай масштаб — в кружке то, что увидят все.',
      })
      if (!cropped) return
      await uploadProfileAvatar(cropped)
      flash('Фото обновлено')
      render()
    } catch (err) {
      flash(err.message || 'Не удалось загрузить', true)
    }
  })
  const links = [
    file,
    el('button', {
      type: 'button',
      className: 'more-photo-link',
      text: session.avatarUrl ? 'Сменить фото' : 'Поставить фото',
      onClick: () => file.click(),
    }),
  ]
  if (session.avatarUrl) {
    links.push(
      el('span', { className: 'more-photo-sep', text: '·', 'aria-hidden': 'true' }),
      el('button', {
        type: 'button',
        className: 'more-photo-link',
        text: 'Удалить',
        onClick: async () => {
          if (!confirm('Удалить фото профиля?')) return
          try {
            await clearProfileAvatar()
            flash('Фото удалено')
            render()
          } catch (err) {
            flash(err.message || 'Не удалось удалить', true)
          }
        },
      }),
    )
  }
  return el('div', { className: 'more-avatar-actions more-avatar-links' }, [
    el('div', { className: 'more-photo-links-row' }, links),
  ])
}

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Не удалось открыть фото'))
    }
    img.src = url
  })
}

/**
 * Редактор: подвинуть/приблизить фото под рамку.
 * shape: 'circle' — аватар, 'square' — обложка программы. Возвращает File или null (отмена).
 */
export function openImageCropEditor(
  file,
  {
    shape = 'circle',
    size = 512,
    name = 'avatar.jpg',
    heading = 'Подгони фото',
    hint = 'Перетащи пальцем/мышью и подвигай масштаб — в кружке то, что увидят все.',
  } = {},
) {
  return new Promise(async (resolve) => {
    let img
    try {
      img = await loadImageFromFile(file)
    } catch (err) {
      flash(err.message || 'Не удалось открыть фото', true)
      resolve(null)
      return
    }

    const VIEW = 260
    const OUT = Math.max(200, Math.min(1600, Number(size) || 512))
    const round = shape !== 'square'
    const nw = img.naturalWidth || img.width
    const nh = img.naturalHeight || img.height
    if (!nw || !nh) {
      flash('Пустое фото', true)
      resolve(null)
      return
    }

    const coverBase = Math.max(VIEW / nw, VIEW / nh)
    let zoom = 1
    let ox = 0
    let oy = 0
    let dragging = false
    let lastX = 0
    let lastY = 0
    let settled = false

    const finish = (value) => {
      if (settled) return
      settled = true
      overlay.remove()
      document.body.style.overflow = prevOverflow
      resolve(value)
    }

    const canvas = el('canvas', {
      className: 'avatar-crop-canvas',
      width: String(VIEW),
      height: String(VIEW),
    })
    const ctx = canvas.getContext('2d')

    const clampOffset = () => {
      const s = coverBase * zoom
      const dw = nw * s
      const dh = nh * s
      const maxX = Math.max(0, (dw - VIEW) / 2)
      const maxY = Math.max(0, (dh - VIEW) / 2)
      ox = Math.max(-maxX, Math.min(maxX, ox))
      oy = Math.max(-maxY, Math.min(maxY, oy))
    }

    // Рамка предпросмотра: круг для аватара, скруглённый квадрат для обложки.
    const framePath = (c) => {
      c.beginPath()
      if (round) {
        c.arc(VIEW / 2, VIEW / 2, VIEW / 2 - 1, 0, Math.PI * 2)
      } else if (typeof c.roundRect === 'function') {
        c.roundRect(1, 1, VIEW - 2, VIEW - 2, 18)
      } else {
        c.rect(1, 1, VIEW - 2, VIEW - 2)
      }
      c.closePath()
    }

    const paint = () => {
      if (!ctx) return
      clampOffset()
      const s = coverBase * zoom
      const dw = nw * s
      const dh = nh * s
      const dx = (VIEW - dw) / 2 + ox
      const dy = (VIEW - dh) / 2 + oy
      ctx.clearRect(0, 0, VIEW, VIEW)
      ctx.save()
      framePath(ctx)
      ctx.clip()
      ctx.fillStyle = '#111'
      ctx.fillRect(0, 0, VIEW, VIEW)
      ctx.drawImage(img, dx, dy, dw, dh)
      ctx.restore()
      framePath(ctx)
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    const zoomLabel = el('span', { className: 'avatar-crop-zoom-val', text: '100%' })
    const zoomInput = el('input', {
      type: 'range',
      className: 'avatar-crop-zoom',
      min: '100',
      max: '300',
      step: '1',
      value: '100',
    })
    zoomInput.addEventListener('input', () => {
      zoom = Number(zoomInput.value) / 100
      zoomLabel.textContent = `${Math.round(zoom * 100)}%`
      paint()
    })

    const onPointerDown = (e) => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      canvas.setPointerCapture?.(e.pointerId)
      e.preventDefault()
    }
    const onPointerMove = (e) => {
      if (!dragging) return
      ox += e.clientX - lastX
      oy += e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      paint()
      e.preventDefault()
    }
    const onPointerUp = (e) => {
      dragging = false
      try {
        canvas.releasePointerCapture?.(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)

    const saveBtn = el('button', {
      type: 'button',
      className: 'btn',
      text: 'Сохранить',
      onClick: async () => {
        saveBtn.disabled = true
        saveBtn.textContent = '…'
        try {
          clampOffset()
          const s = coverBase * zoom
          const out = document.createElement('canvas')
          out.width = OUT
          out.height = OUT
          const octx = out.getContext('2d')
          if (!octx) throw new Error('Нет canvas')
          const scaleOut = OUT / VIEW
          const dw = nw * s * scaleOut
          const dh = nh * s * scaleOut
          const dx = (OUT - dw) / 2 + ox * scaleOut
          const dy = (OUT - dh) / 2 + oy * scaleOut
          if (round) {
            octx.beginPath()
            octx.arc(OUT / 2, OUT / 2, OUT / 2 - 1, 0, Math.PI * 2)
            octx.closePath()
            octx.clip()
          }
          octx.fillStyle = '#111'
          octx.fillRect(0, 0, OUT, OUT)
          octx.drawImage(img, dx, dy, dw, dh)
          const blob = await new Promise((res) => out.toBlob(res, 'image/jpeg', 0.9))
          if (!blob) throw new Error('Не удалось обрезать')
          finish(new File([blob], name, { type: 'image/jpeg' }))
        } catch (err) {
          saveBtn.disabled = false
          saveBtn.textContent = 'Сохранить'
          flash(err.message || 'Ошибка обрезки', true)
        }
      },
    })

    const cancelBtn = el('button', {
      type: 'button',
      className: 'btn secondary',
      text: 'Отмена',
      onClick: () => finish(null),
    })

    const overlay = el('div', {
      className: 'avatar-crop-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': heading,
    })
    if (!round) canvas.classList.add('is-square')

    overlay.append(
      el('div', { className: 'avatar-crop-sheet' }, [
        el('h3', { text: heading }),
        el('p', { className: 'muted', text: hint }),
        el('div', { className: 'avatar-crop-stage' }, [canvas]),
        el('div', { className: 'avatar-crop-zoom-row' }, [
          el('span', { className: 'muted', text: 'Масштаб' }),
          zoomInput,
          zoomLabel,
        ]),
        el('div', { className: 'avatar-crop-actions' }, [cancelBtn, saveBtn]),
      ]),
    )
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(null)
    })

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.append(overlay)
    paint()
  })
}
