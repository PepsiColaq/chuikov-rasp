// Флаги и словари, которые нужны сразу нескольким экранам.
// Раньше лежали вперемешку по 12 тысячам строк main.js — найти нужный
// было почти невозможно. Значения не менялись при переносе.
//
// Флаги включения (UI_MOTION, BOOT_SPLASH, NAV_WITH_ICONS и т.п.) оставлены
// намеренно: рядом с каждым в комментарии написано, что будет при false,
// и где лежит бэкап прежнего поведения.

/** false = классический «Ещё» (бэкап: ui-backups/more-classic-before-v2-2026-09-30.md) */
export const MORE_UI_V2 = true

/** false = без аватаров (бэкап: ui-backups/profile-avatars-before-2026-10-01.md) */
export const PROFILE_AVATARS = true

/** false = снова «ДЗ не задано» у каждой пары (бэкап: ui-backups/hw-ui-quiet-by-day-2026-10-01.md) */
export const HW_EMPTY_QUIET = true

/** false = плоский список ДЗ; дни на вкладке ДЗ снова «только подсветка» (бэкап: ui-backups/hw-day-jump-before-2026-10-01.md) */
export const HW_TAB_BY_DAY = true

/** false = мгновенная смена Пн–Пт без анимации (бэкап: ui-backups/day-swap-before-2026-10-05) */
export const DAY_SWAP_MOTION = true

/** false = снова текст «Загрузка…» (бэкап: ui-backups/boot-splash-before-2026-10-02.md) */
export const BOOT_SPLASH = true

/** Заставка видна минимум столько (анимация успевает «прочитаться», без лишней паузы) */
export const BOOT_SPLASH_MIN_MS = 720

/** Длительность «отлёта» логотипа при выходе */
export const BOOT_SPLASH_EXIT_MS = 420

/** false = старое текстовое меню (бэкап: ui-backups/nav-text-only-before-icons-2026-09-30.md) */
export const NAV_WITH_ICONS = true

export const NAV_ICONS = {
  home:
    '<svg class="nav-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><path d="M9.5 20.5v-6h5v6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/></svg>',
  schedule:
    '<svg class="nav-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M8 3.5v3M16 3.5v3M4 10h16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
  grades:
    '<svg class="nav-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5C10.3 5.2 8.3 4.7 5.5 5v13c2.8-.3 4.8.2 6.5 1.5 1.7-1.3 3.7-1.8 6.5-1.5V5c-2.8-.3-4.8.2-6.5 1.5z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><path d="M12 6.5v13" fill="none" stroke="currentColor" stroke-width="1.75"/></svg>',
  hw:
    '<svg class="nav-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8a2 2 0 0 1 2 2v14H6V6a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M9 2.5h6v3H9z" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M9 11h6M9 15h4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
  teachers:
    '<svg class="nav-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M15 15l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
  overrides:
    '<svg class="nav-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="2.6" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M3.8 18.5c1-2.4 2.5-3.6 5.2-3.6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><circle cx="15.5" cy="8.2" r="2.4" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M12.2 18.5c.9-2.2 2.3-3.3 4.8-3.3 1.2 0 2.2.3 3 .8" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
  more:
    '<svg class="nav-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.4" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M5 20c1.5-3.5 3.8-5.2 7-5.2s5.5 1.7 7 5.2" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
}

export const TAB_ORDER = ['home', 'schedule', 'grades', 'teachers', 'more']

export const PROGRAM_KINDS = {
  dpo: {
    title: 'Доп. образование',
    kicker: 'Программы обучения и набор групп',
    empty: 'Программ пока нет',
    emptyHint: 'Куратор, староста или админ может добавить первую программу.',
  },
  club: {
    title: 'Кружки и секции',
    kicker: 'Куда можно записаться',
    empty: 'Кружков пока нет',
    emptyHint: 'Куратор, староста или админ может добавить первый кружок.',
  },
}

/** Плавность бокового листания: одна кривая на все читалки. */
export const READER_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)'

export const READER_SNAP_MS = 300

export const MAX_NEWS_PHOTOS = 10

export const FACULTY_LABEL = {
  ПД: 'Правоохранительная деятельность',
  ПСА: 'Право и организация социального обеспечения',
  ПСО: 'Право и судебное администрирование',
  ЭБАС: 'Экономическая безопасность',
  ИБАС: 'Информационная безопасность',
  Ю: 'Юриспруденция',
}

export const ROLE_LABEL = {
  starosta: 'Староста',
  teacher: 'Преподаватель',
  student: 'Студент',
}

export const STAFF_KIND_LABEL = {
  deputy: 'Зам старосты',
  hw: 'Может писать ДЗ',
}

/** Человеческие названия действий. */
export const AUDIT_TITLES = {
  login_admin: 'Вход админа',
  login_student: 'Вход студента',
  login_starosta: 'Вход старосты',
  login_fail: 'Неудачный вход',
  login_lock_ip: 'Блокировка по адресу',
  login_lock_code: 'Блокировка по коду',
  journal_mark: 'Отметка в журнале',
  journal_grade: 'Поставлена оценка',
  journal_grade_delete: 'Удалена оценка',
  student_role: 'Смена роли',
  homework_add: 'Добавлено ДЗ',
  homework_delete: 'Удалено ДЗ',
  news_add: 'Добавлена новость',
  formation_mark: 'Отметка на построении',
  override_set: 'Замена пары',
  override_clear: 'Убрана замена',
  program_save: 'Сохранена программа',
  group_create: 'Создана группа',
  group_deactivate: 'Отключена группа',
  semester_reset: 'Сброс семестра',
  audit_undo: 'Откат действия',
  admin_display_name: 'Изменено имя админа',
  starosta_code_add: 'Выдан код',
  starosta_code_revoke: 'Отозван код',
  starosta_label_rename: 'Переименован код',
  starosta_role_title: 'Изменена подпись роли',
  site_toggle: 'Переключение сайта',
}

/** Явка в журнале пары. */
export const ATT_LABEL = {
  present: 'был',
  absent: 'не был',
  sick: 'болеет',
  duty: 'на мероприятии',
  event: 'мероприятие',
  excused: 'уважительная',
  '-': 'без отметки',
  '': 'без отметки',
}

/** Роли в человеческом виде. */
export const ROLE_RU = {
  student: 'студент',
  starosta: 'староста',
  teacher: 'преподаватель',
  admin: 'админ',
  curator: 'куратор',
  deputy: 'зам. старосты',
  all: 'все группы',
}

/** Фильтр по типу события. */
export const AUDIT_FILTERS = [
  ['all', 'Все', () => true],
  ['marks', 'Отметки', (a) => a.action === 'journal_mark' || a.action === 'formation_mark'],
  ['grades', 'Оценки', (a) => a.action === 'journal_grade' || a.action === 'journal_grade_delete'],
  ['roles', 'Роли', (a) => a.action === 'student_role' || /code|admin/i.test(a.action)],
  ['content', 'Новости и ДЗ', (a) => /news|homework|program/.test(a.action)],
  ['logins', 'Входы', (a) => a.action.startsWith('login_')],
]

/** Служебная запись ДЗ: отмена построения на дату (скрыта из вкладки ДЗ). */
export const FORMATION_SKIP_SUBJECT = '__formation_skip__'

/** false = без жеста «потяни вниз — обновить» (бэкап: ui-backups/ui-feel-before-2026-10-02.md) */
export const PULL_TO_REFRESH = true
