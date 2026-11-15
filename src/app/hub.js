// «Мост» между экранами и ядром приложения.
//
// Почему он нужен: render(), переключение вкладок и обновление панелей
// объявлены в main.js, но нужны почти каждому экрану. Если бы экраны
// импортировали их напрямую, получился бы цикл:
//   main.js → экран → main.js
// ES-модули такой цикл не любят: часть импортов оказывается undefined.
//
// Решение: экраны берут функции отсюда (hub.render()), а main.js один раз
// при старте кладёт настоящие функции через wireHub(). До этого вызова
// в hub лежат пустышки — если что-то вызвать слишком рано, будет тихий
// no-op, а не падение всего сайта.
//
// Список ниже — ровно то, что реально нужно вынесенным экранам.
// При добавлении нового экрана добавь сюда функцию и вызови её через hub.

const noop = () => {}

export const hub = {
  calendarDateForWeekday: noop,
  canEdit: noop,
  dateForWeekday: noop,
  daySwapPanelClass: noop,
  facultyFromName: noop,
  formatDateRu: noop,
  formationLoadKey: noop,
  hhmmToMinutes: noop,
  humanMins: noop,
  initialDataLoading: noop,
  nowMinutesOfDay: noop,
  roomLink: noop,
  shortSubjectLabel: noop,
  subtractMinutes: noop,
  todayISO: noop,
  weekRangeLabel: noop,
  weekdayNumFromIso: noop,
  cancelGroupPicker: noop,
  confirmAndLogout: noop,
  gotoTab: noop,
  homeProgramKind: noop,
  isHwView: noop,
  maybeSeekHwDay: noop,
  openGroupPicker: noop,
  openImageCropEditor: noop,
  openMoreScreen: noop,
  openNewsReader: noop,
  openProgramReader: noop,
  openProgramScreen: noop,
  paintStaffCard: noop,
  pickGroupWithFeel: noop,
  programGroupId: noop,
  redrawAfterData: noop,
  refreshTabPanes: noop,
  render: noop,
  renderAddHwInline: noop,
  renderAdminFreeRooms: noop,
  renderAdminPanel: noop,
  renderAuditSection: noop,
  renderBannedGate: noop,
  renderClosedGate: noop,
  renderDays: noop,
  renderFormationCard: noop,
  renderFormationMarksOverlay: noop,
  renderFormationSettings: noop,
  renderGroupPicker: noop,
  renderHome: noop,
  renderHomeHero: noop,
  renderHomeNow: noop,
  renderHomeTextSettings: noop,
  renderHwCard: noop,
  renderHwTab: noop,
  renderInlineHwGroups: noop,
  renderLegalDoc: noop,
  renderLessonCard: noop,
  renderMonthCalendar: noop,
  renderMore: noop,
  renderMoreClassic: noop,
  renderMoreContacts: noop,
  renderMoreGroup: noop,
  renderMoreMyCode: noop,
  renderMoreOverrides: noop,
  renderMoreStudents: noop,
  renderMoreSupport: noop,
  renderMoreV2: noop,
  renderNav: noop,
  renderNewsComposer: noop,
  renderNowStrip: noop,
  renderOverrideForm: noop,
  renderOverridesTab: noop,
  renderProfileAvatarControls: noop,
  renderProgramEditor: noop,
  renderPrograms: noop,
  renderRoomSearch: noop,
  renderSchedule: noop,
  renderScheduleImport: noop,
  renderSessionSettings: noop,
  renderStudyTab: noop,
  renderTabBody: noop,
  renderTeacherSearch: noop,
  renderTeachersTab: noop,
  renderTop: noop,
  resetWindowScroll: noop,
  selectGroup: noop,
  softRefreshCurrentTab: noop,
  softUpdateNav: noop,
  softUpdateTopLead: noop,
  switchTab: noop,
  withTabScrollPreserved: noop,
  wrapAdminAcc: noop,
  // Отрисовка всего приложения
  render: noop,
  // Перерисовка одной вкладки без сброса остальных
  refreshTabPanes: noop,
  softRefreshCurrentTab: noop,
  redrawAfterData: noop,
  // Навигация
  switchTab: noop,
  gotoTab: noop,
  openMoreScreen: noop,
  openProgramScreen: noop,
  softUpdateNav: noop,
  softUpdateTopLead: noop,
  // Вспомогательное
  withTabScrollPreserved: noop,
  resetWindowScroll: noop,
  openImageCropEditor: noop,
}

/** Вызывается один раз из main.js после объявления всех функций. */
export function wireHub(fns) {
  for (const [name, fn] of Object.entries(fns)) {
    if (typeof fn === 'function') hub[name] = fn
  }
}
