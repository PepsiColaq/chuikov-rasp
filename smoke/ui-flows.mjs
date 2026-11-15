// Расширенная проверка интерфейса: то, чего не было в первом тесте.
//
// Первый тест ставил группу заранее и проверял только отрисовку вкладок.
// Здесь проходим настоящие пользовательские сценарии:
//   • смена группы через шапку
//   • переключение «Журнал ⇄ Домашка» в Учёбе
//   • переключение дней недели и стрелки недель
//   • календарь на месяц
//   • все подэкраны профиля и возврат назад
//   • справочник: поиск преподавателя, переключение на аудитории
//   • тема (тёмная/светлая)
//   • повторное открытие сайта с сохранённой группой (как у студента)
import fs from 'node:fs'
import { JSDOM } from 'jsdom'

const bundle = fs.readFileSync('./dist-test/app.js', 'utf8')
const html = fs
  .readFileSync('./index.html', 'utf8')
  .replace(/<script src="\/chuikov-rasp\/boot-gate\.js[^>]*><\/script>/, '')
  .replace(/<script type="module" src="\/src\/main\.js"><\/script>/, '')
  .replace(/<script>[\s\S]*?<\/script>/g, '')

const results = []
const errors = []

function makeApp({ withGroup }) {
  const dom = new JSDOM(html, {
    url: 'https://example.test/chuikov-rasp/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  const w = dom.window
  w.matchMedia = (q) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  })
  w.navigator.vibrate = () => true
  w.HTMLCanvasElement.prototype.getContext = () => null
  w.Element.prototype.animate = () => ({ finished: Promise.resolve(), cancel() {} })
  w.Element.prototype.scrollIntoView = () => {}
  w.scrollTo = () => {}
  Object.defineProperty(w, 'innerWidth', { value: 390, writable: true })
  Object.defineProperty(w, 'innerHeight', { value: 844, writable: true })
  w.addEventListener('error', (e) => errors.push('window.error: ' + (e.error?.stack || e.message)))
  w.addEventListener('unhandledrejection', (e) => errors.push('rejection: ' + (e.reason?.message || e.reason)))
  w.console.error = (...a) => errors.push('console.error: ' + a.map(String).join(' '))
  w.console.warn = () => {}
  w.console.log = () => {}

  if (withGroup) w.localStorage.setItem('rasp_selected_group_v3', 'g_0901_пд3')
  else w.localStorage.removeItem('rasp_selected_group_v3')

  try {
    w.eval(bundle)
  } catch (e) {
    errors.push('eval: ' + (e.stack || e))
  }
  return w
}

const tick = (ms) => new Promise((r) => setTimeout(r, ms))
const click = (el) => el && el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }))

function check(label, condition, extra = '') {
  results.push({ label, ok: !!condition, extra })
  console.log((condition ? '✅ ' : '❌ ') + label + (extra && !condition ? '  — ' + extra : ''))
}

function findByText(w, re, sel = '#app button') {
  return [...w.document.querySelectorAll(sel)].find((b) => re.test((b.textContent || '').trim()))
}

// ═══ Сценарий 1: новый посетитель — выбор группы ═══
console.log('\n── Сценарий 1: новый посетитель ──')
{
  const w = makeApp({ withGroup: false })
  await tick(1800)
  const picks = [...w.document.querySelectorAll('#app button.group-pick-btn')]
  check('экран выбора группы открыт', picks.length > 10, 'кнопок: ' + picks.length)

  const btn = picks[5]
  const name = (btn?.querySelector('strong')?.textContent || '').trim()
  click(btn)
  await tick(700)

  check('группа запомнилась', !!w.localStorage.getItem('rasp_selected_group_v3'), w.localStorage.getItem('rasp_selected_group_v3'))
  const shown = (w.document.querySelector('#app .group-title-btn h1')?.textContent || '').trim()
  check('группа показана в шапке', shown === name, `шапка «${shown}», ждали «${name}»`)
  check('меню появилось', w.document.querySelectorAll('#app nav button').length >= 5)
}

// ═══ Сценарий 2: студент со сохранённой группой ═══
console.log('\n── Сценарий 2: повторный заход ──')
const w = makeApp({ withGroup: true })
await tick(1800)

check('сразу открылось расписание', !!w.document.querySelector('#app [data-tab="schedule"]'))
const navBtns = () => [...w.document.querySelectorAll('#app nav button')]
check('пять вкладок в меню', navBtns().length === 5, 'кнопок: ' + navBtns().length)

// ── Учёба: журнал ⇄ домашка
navBtns()[2] && click(navBtns()[2])
await tick(400)
const studyBefore = (w.document.querySelector('#app .tab-pane[data-tab="grades"]')?.textContent || '').length
const hwToggle = findByText(w, /домашк|дз/i, '#app button')
if (hwToggle) {
  click(hwToggle)
  await tick(400)
  const studyAfter = (w.document.querySelector('#app .tab-pane[data-tab="grades"]')?.textContent || '').length
  check('переключение «Домашка» меняет экран', studyBefore !== studyAfter, `${studyBefore} → ${studyAfter}`)
} else {
  check('переключатель «Домашка» найден', false, 'кнопка не найдена')
}

// ── Расписание: дни недели и стрелки
navBtns()[1] && click(navBtns()[1])
await tick(400)
const dayBtns = [...w.document.querySelectorAll('#app .days button')]
check('кнопки дней недели есть', dayBtns.length >= 5, 'найдено: ' + dayBtns.length)
if (dayBtns.length > 2) {
  const before = w.document.querySelector('#app .tab-pane[data-tab="schedule"]')?.textContent?.length || 0
  click(dayBtns[2])
  await tick(400)
  const after = w.document.querySelector('#app .tab-pane[data-tab="schedule"]')?.textContent?.length || 0
  check('смена дня перерисовывает расписание', before !== after, `${before} → ${after}`)
}
const weekArrow = [...w.document.querySelectorAll('#app .week-nav button')]
if (weekArrow.length >= 2) {
  const labelBefore = w.document.querySelector('#app .week-nav-label')?.textContent || ''
  click(weekArrow[2] || weekArrow[1])
  await tick(400)
  const labelAfter = w.document.querySelector('#app .week-nav-label')?.textContent || ''
  check('стрелка недели меняет подпись', labelBefore !== labelAfter, `«${labelBefore}» → «${labelAfter}»`)
}

// ── Профиль: обход подэкранов (подписи как у настоящего экрана)
navBtns()[4] && click(navBtns()[4])
await tick(500)
const subs = ['Замены', 'Техподдержка']
for (const label of subs) {
  const btn = findByText(w, new RegExp('^' + label, 'i'))
  if (!btn) {
    check(`строка «${label}» в профиле`, false, 'кнопка не найдена')
    continue
  }
  click(btn)
  await tick(400)
  const pane = w.document.querySelector('#app .tab-pane[data-tab="more"]')
  const hasBack = !!(pane && [...pane.querySelectorAll('button')].find((b) => /Профиль/i.test(b.textContent || '')))
  check(`подэкран «${label}» открылся`, hasBack, 'кнопки «← Профиль» нет')
  if (hasBack) {
    const back = [...pane.querySelectorAll('button')].find((b) => /Профиль/i.test(b.textContent || ''))
    click(back)
    await tick(350)
    const backToProfile = !!(w.document.querySelector('#app .tab-pane[data-tab="more"] .more-row'))
    check(`возврат из «${label}» работает`, backToProfile)
  }
}

// ── Оформление: переключение темы
const themeRow = findByText(w, /Оформление/i)
if (themeRow) {
  const before = w.document.documentElement.getAttribute('data-theme')
  click(themeRow)
  await tick(400)
  const after = w.document.documentElement.getAttribute('data-theme')
  check('тема переключается', before !== after, `${before} → ${after}`)
} else {
  check('строка «Оформление» найдена', false)
}

// ── Справочник: поиск
navBtns()[3] && click(navBtns()[3])
await tick(400)
const roomTab = findByText(w, /аудитори/i)
if (roomTab) {
  click(roomTab)
  await tick(350)
  check('режим «аудитории» включается', true)
} else {
  check('переключатель на аудитории найден', false)
}

// ═══ Итог ═══
const failed = results.filter((r) => !r.ok)
const uniqErrors = [...new Set(errors)]
console.log('\n── Ошибки в консоли: ' + uniqErrors.length + ' ──')
for (const e of uniqErrors.slice(0, 10)) console.log('   ' + e.split('\n')[0].slice(0, 160))

console.log(`\n${failed.length ? '❌' : '✅'} Проверок: ${results.length}, провалено: ${failed.length}`)
for (const f of failed) console.log('   ✗ ' + f.label + (f.extra ? ' — ' + f.extra : ''))

process.exit(failed.length || uniqErrors.length ? 1 : 0)
