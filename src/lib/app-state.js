// Состояние приложения и тема.
//
// state — один большой объект: экраны меняют его поля (state.tab = 'home'),
// но сам объект не пересоздаётся. Поэтому его безопасно импортировать:
// все модули видят одни и те же поля.
//
// Ключи localStorage вынесены сюда же: их читают и состояние, и выбор группы.

export const SELECTED_GROUP_KEY = 'rasp_selected_group_v3'

/** Вторая группа для сравнения расписаний — запоминается между заходами. */
export const COMPARE_GROUP_KEY = 'rasp_compare_group_v1'

export const THEME_KEY = 'rasp_theme_v1'

export const WEEK_MAX = 6

export const splashStartedAt =
  typeof performance !== 'undefined' ? performance.now() : Date.now()

export const state = {
  tab: 'home',
  /** Подрежим вкладки «Учёба»: 'grades' — журнал и оценки, 'hw' — домашка */
  studyMode: 'grades',
  /** Подэкран профиля: '' — сам профиль, 'overrides' — замены, 'group' — моя группа */
  moreScreen: '',
  /** Открыт ли календарь на месяц в «Расписании» */
  calendarOpen: false,
  /** Сдвиг месяца в календаре относительно текущего: 0 — этот, -1 — прошлый */
  calendarMonthOffset: 0,
  groupId: localStorage.getItem(SELECTED_GROUP_KEY) || '',
  /** Вторая группа для сравнения — тоже переживает перезапуск. */
  compareGroupId: (() => {
    try {
      return localStorage.getItem(COMPARE_GROUP_KEY) || ''
    } catch {
      return ''
    }
  })(),
  /** День недели в сравнении групп: 0 — ещё не выбран, берём как в расписании. */
  compareDay: 0,
  day: ((d) => (d === 0 || d === 6 ? 1 : d))(new Date().getDay()),
  weekOffset: 0,
  prevGroupId: '',
  expandedHw: new Set(),
  /** id пары, у которой `.hw-body` ещё без `is-open` (анимация раскрытия) */
  hwExpandAnimId: null,
  /** На вкладке ДЗ: после рендера проскроллить к дню `{ notify: bool }` */
  hwDaySeek: null,
  /** Одноразовый флаг: следующий рендер вкладки показать каскадом */
  cascade: true,
  /** Направление анимации смены дня: 'left' | 'right' | null */
  daySwap: null,
  adminCodeGroupId: '',
  /** id кода с раскрытой формой имени/роли (без prompt) */
  adminCodeEditId: '',
  /** id кода с подтверждением отзыва в карточке */
  adminCodeRevokeId: '',
  /** id доп. админа с подтверждением отзыва в карточке */
  adminRemoveId: '',
  /** Последний выданный админ-код — переживает перерисовку панели */
  adminIssuedNote: '',
  /** Раскрытые секции админки (как ДЗ): codes | admins | support | site | audit | groups | stats */
  adminOpen: new Set(),
  /** id секции, у которой идёт анимация раскрытия */
  adminExpandAnimId: null,
  overrideDraft: null,
  showInstallHelp: false,
  highlightLogin: false,
  loginNeedWho: false,
  loginCodeDraft: '',
  loginWhoDraft: '',
  legalDoc: null,
  teacherQuery: '',
  teacherDate: '',
  /** 'teacher' | 'room' — что ищем во вкладке «Преп.» */
  teacherMode: 'teacher',
  roomQuery: '',
  roomDate: '',
  /** Админ: дата для свободных аудиторий */
  freeRoomsDate: '',
  /** Слот пары «HH:MM|HH:MM» */
  freeRoomsSlot: '',
  /** Подсвечивать чип «Сейчас» */
  freeRoomsNow: true,
  /** Поиск в выдаче доступа к аудиториям / банах */
  roomsAccessQuery: '',
  /** Поиск в выдаче доступа к сравнению групп */
  compareAccessQuery: '',
  bansQuery: '',
  /** id кода с формой «забанить + причина» */
  adminBanId: '',
  /** Журнал пары: { groupId, date, lessonId, start, end, subject } */
  journal: null,
  /** current | final */
  gradesMode: 'current',
  /** Раскрытый предмет в «Текущих оценках» */
  openSubject: '',
  gradeTip: '',
  /** Сторона «+оценка»: какой вид работы выбран */
  gradeKind: 'answer',
  /** id студента, у которого открыт выбор оценки */
  gradeAddFor: '',
  /** Статус построения на текущий день: { cancelled, note, canEdit, marks } */
  formationDay: null,
  /** Открытый экран расхода построения: { groupId, date, formStart, anchorStart } */
  formationMarks: null,
  /** Новости на главной: индекс открытой карточки, открыт ли компоузер */
  newsIndex: 0,
  newsCompose: false,
  /** Черновик новости между перерисовками: { title, body, pinned, attachments } */
  newsDraft: null,
  /** Событие, которое сейчас правим (или null — создаём новое). */
  newsEdit: null,
  /** Черновик программы в редакторе или null, если редактор закрыт */
  programDraft: null,
  message: null,
  error: null,
}

export function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', t)
  try {
    localStorage.setItem(THEME_KEY, t)
  } catch {
    /* ignore */
  }
}
