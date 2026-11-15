// Пересобирает блок моста в main.js: импорт wireHub + регистрация функций.
// Вызывается после каждого вырезания — потому что часть функций уехала в модуль
// и её больше нельзя регистрировать (иначе ReferenceError).
import fs from 'node:fs'
import path from 'node:path'
import * as acorn from 'acorn'

const MAIN = 'src/main.js'

export const HUB_FNS = [
  'render', 'refreshTabPanes', 'softRefreshCurrentTab', 'redrawAfterData',
  'switchTab', 'gotoTab', 'openMoreScreen', 'openProgramScreen',
  'softUpdateNav', 'softUpdateTopLead', 'withTabScrollPreserved', 'resetWindowScroll',
  'openImageCropEditor', 'renderAdminPanel', 'renderAdminFreeRooms', 'renderOverrideForm',
  'renderOverridesTab', 'renderGroupPicker', 'wrapAdminAcc', 'renderHomeTextSettings',
  'renderFormationSettings', 'renderSessionSettings', 'renderScheduleImport',
  'renderAuditSection', 'renderLegalDoc', 'renderMoreSupport', 'renderProfileAvatarControls',
  'renderPrograms', 'openProgramReader', 'renderProgramEditor', 'renderHome',
  'renderHomeHero', 'renderNewsComposer', 'renderHomeNow', 'renderTabBody', 'renderStudyTab',
  'openNewsReader', 'openGroupPicker', 'selectGroup', 'confirmAndLogout', 'renderBannedGate',
  'renderClosedGate', 'renderNav', 'renderDays', 'renderSchedule', 'renderLessonCard',
  'renderHwTab', 'renderHwCard', 'renderFormationCard', 'renderMore', 'renderMoreV2',
  'renderMoreClassic', 'renderMoreStudents', 'renderMoreMyCode', 'renderMoreContacts',
  'renderMoreOverrides', 'renderMoreGroup', 'renderTeachersTab', 'renderRoomSearch',
  'renderTeacherSearch', 'renderTop', 'renderMonthCalendar', 'renderNowStrip',
  'openHwLightbox', 'closeHwLightbox', 'renderHwAttachments', 'renderInstallCard',
  'setInstallHelpOpen', 'paintStaffCard', 'renderAddHwInline', 'renderInlineHwGroups',
  'renderFormationMarksOverlay', 'maybeSeekHwDay', 'cancelGroupPicker', 'pickGroupWithFeel',
  'isHwView', 'homeProgramKind', 'programGroupId', 'renderStudentsScreen',
  'renderJournalOverlay', 'renderGradesTab', 'formatDateRu', 'todayISO', 'canEdit',
  'dateForWeekday', 'daySwapPanelClass', 'weekRangeLabel', 'hhmmToMinutes',
  'nowMinutesOfDay', 'humanMins', 'shortSubjectLabel', 'subtractMinutes',
  'calendarDateForWeekday', 'weekdayNumFromIso', 'weekdayFromISO', 'roomLink',
  'formationLoadKey', 'initialDataLoading', 'openProgramScreen',
]

/** Какие имена модули берут через мост — читаем прямо из их кода. */
export function collectHubNames() {
  const names = new Set()
  const files = []
  ;(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.js')) files.push(p.replace(/\\/g, '/'))
    }
  })('src')

  for (const f of files) {
    if (f.endsWith('src/main.js') || f.endsWith('app/hub.js')) continue
    const text = fs.readFileSync(f, 'utf8')
    // прокси объявляются строкой: const render = (...args) => hub.render(...args)
    for (const m of text.matchAll(/^\s*const (\w+) = \(\.\.\.args\) => hub\.\1\(/gm)) names.add(m[1])
  }
  return names
}

/** Возвращает текст блока моста для данного исходника main.js. */
export function buildHubBlock(src) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' })
  const available = new Set()
  for (const n of ast.body) {
    if (n.type === 'FunctionDeclaration') available.add(n.id.name)
    if (n.type === 'VariableDeclaration')
      for (const d of n.declarations) if (d.id.type === 'Identifier') available.add(d.id.name)
    // функции, уехавшие в модули, main.js импортирует — их тоже отдаём через мост
    if (n.type === 'ImportDeclaration')
      for (const sp of n.specifiers) if (sp.local) available.add(sp.local.name)
  }
  const wanted = collectHubNames()
  const present = [...wanted].filter((n) => available.has(n)).sort()
  if (!present.length) return ''
  return (
    `\nimport { wireHub } from './app/hub.js'` +
    `\n\n// Отдаём вынесенным модулям функции ядра.\n` +
    `// Список собирается автоматически: берутся ровно те имена, которые модули\n` +
    `// зовут через hub. Часть объявлена здесь, часть уже живёт в модулях (в импортах).\n` +
    `wireHub({ ${present.join(', ')} })`
  )
}

/** Убирает из main.js прежний блок моста (импорт + вызов). */
export function stripHubBlock(src) {
  let out = src
  out = out.replace(
    /\n\/\/ Отдаём вынесенным модулям функции[^\n]*\n(?:\/\/[^\n]*\n)*wireHub\(\{[^}]*\}\)\n?/g,
    '\n'
  )
  out = out.replace(/\nimport \{ wireHub \} from '\.\/app\/hub\.js'/g, '')
  return out
}

/** Подключает/пересобирает мост в src/main.js. */
export function refreshHub() {
  const src = fs.readFileSync(MAIN, 'utf8')
  const clean = stripHubBlock(src)
  const ast = acorn.parse(clean, { ecmaVersion: 'latest', sourceType: 'module' })
  const lastImportEnd = ast.body.filter((n) => n.type === 'ImportDeclaration').pop().end
  const block = buildHubBlock(clean)
  const out = clean.slice(0, lastImportEnd) + block + clean.slice(lastImportEnd)
  fs.writeFileSync(MAIN, out)
  return block
}

const isDirectRun = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/split/hub-block.mjs')
if (isDirectRun) {
  const block = refreshHub()
  const m = block.match(/wireHub\(\{ (.*) \}\)/)
  console.log('✓ Мост пересобран, функций: ' + (m ? m[1].split(', ').length : 0))
}
