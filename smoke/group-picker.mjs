// Проверка выбора группы — то, что сломалось и что прежний тест не ловил.
//
// Прежний тест ставил группу в localStorage заранее, поэтому экран выбора
// группы вообще не открывался. Здесь наоборот: стартуем БЕЗ группы,
// открываем выбор, жмём группу и проверяем, что:
//   1) экран переключился на расписание,
//   2) группа запомнилась,
//   3) в верхней панели появилось её название,
//   4) в консоли нет ошибок.
import fs from 'node:fs'
import { JSDOM } from 'jsdom'

const bundle = fs.readFileSync('./dist-test/app.js', 'utf8')
const html = fs
  .readFileSync('./index.html', 'utf8')
  .replace(/<script src="\/chuikov-rasp\/boot-gate\.js[^>]*><\/script>/, '')
  .replace(/<script type="module" src="\/src\/main\.js"><\/script>/, '')
  .replace(/<script>[\s\S]*?<\/script>/g, '')

const errors = []
const dom = new JSDOM(html, {
  url: 'https://example.test/chuikov-rasp/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
})
const { window } = dom

window.matchMedia = (q) => ({
  matches: false,
  media: q,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
})
window.navigator.vibrate = () => true
window.HTMLCanvasElement.prototype.getContext = () => null
window.Element.prototype.animate = () => ({ finished: Promise.resolve(), cancel() {} })
window.Element.prototype.scrollIntoView = () => {}
window.scrollTo = () => {}
Object.defineProperty(window, 'innerWidth', { value: 390, writable: true })
Object.defineProperty(window, 'innerHeight', { value: 844, writable: true })

window.addEventListener('error', (e) => errors.push('window.error: ' + (e.error?.stack || e.message)))
window.addEventListener('unhandledrejection', (e) => errors.push('unhandledrejection: ' + (e.reason?.stack || e.reason)))
window.console.error = (...a) => errors.push('console.error: ' + a.map(String).join(' '))
window.console.warn = () => {}
window.console.log = () => {}

// ВАЖНО: группа НЕ выбрана — как у нового посетителя
window.localStorage.removeItem('rasp_selected_group_v3')

try {
  window.eval(bundle)
} catch (e) {
  errors.push('eval threw: ' + (e.stack || e))
}

const tick = (ms) => new Promise((r) => setTimeout(r, ms))
await tick(1800)

const doc = window.document
const fail = (msg) => {
  console.log('❌ ' + msg)
  process.exitCode = 1
}
const ok = (msg) => console.log('✅ ' + msg)

// 1. Должен открыться экран выбора группы
const pickerButtons = [...doc.querySelectorAll('#app button.group-pick-btn')]
if (pickerButtons.length >= 3) ok(`экран выбора группы открыт, кнопок: ${pickerButtons.length}`)
else {
  fail('экран выбора группы не открылся')
  console.log('  HTML:', doc.getElementById('app').innerHTML.slice(0, 300))
}

// 2. Жмём кнопку группы
const target = pickerButtons[2]
const groupName = (target?.querySelector('strong')?.textContent || '').trim()
if (target) {
  target.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await tick(600) // ждём анимацию выбора (160 мс) + перерисовку
}

// 3. Проверяем результат
const saved = window.localStorage.getItem('rasp_selected_group_v3')
if (saved) ok(`группа запомнилась: ${saved}`)
else fail('группа НЕ запомнилась в localStorage')

const topbarGroup = (doc.querySelector('#app .group-title-btn h1')?.textContent || '').trim()
if (groupName && topbarGroup === groupName) ok(`в шапке показана выбранная группа: ${topbarGroup}`)
else fail(`в шапке «${topbarGroup}», ожидалось «${groupName}»`)

const navCount = doc.querySelectorAll('#app nav button').length
if (navCount >= 5) ok(`нижнее меню отрисовано: ${navCount} кнопок`)
else fail(`нижнее меню не отрисовано (кнопок: ${navCount})`)

const hasSchedule = !!doc.querySelector('#app [data-tab="schedule"]')
if (hasSchedule) ok('вкладка расписания есть в DOM')
else fail('вкладки расписания нет в DOM')

// 4. Смена группы через шапку — второй важный сценарий
const changeBtn = doc.querySelector('#app .group-title-btn')
if (changeBtn) {
  changeBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await tick(400)
  const picker2 = [...doc.querySelectorAll('#app button.group-pick-btn')]
  if (picker2.length >= 3) ok('повторное открытие выбора группы работает')
  else fail('повторное открытие выбора группы не сработало')
}

// 5. Ошибки
const uniq = [...new Set(errors)]
if (uniq.length === 0) ok('ошибок в консоли нет')
else {
  fail(`ошибок: ${uniq.length}`)
  for (const e of uniq.slice(0, 8)) console.log('   - ' + e.split('\n')[0])
}

console.log('\n' + (process.exitCode ? '❌ ВЫБОР ГРУППЫ СЛОМАН' : '✅ Выбор группы работает'))
