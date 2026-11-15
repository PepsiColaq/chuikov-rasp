// Дымовой тест-эталон: поднимает собранное приложение в jsdom, проходит вкладки
// и снимает отпечаток DOM на каждом шаге. После разбивки main.js на модули
// отпечаток должен совпасть байт-в-байт — это доказательство, что ничего не сломалось.
//
// Запуск:
//   node smoke/run.mjs            — сравнить с эталоном (smoke/baseline.json)
//   node smoke/run.mjs --save     — перезаписать эталон
import fs from 'node:fs'
import crypto from 'node:crypto'
import { JSDOM } from 'jsdom'

const SAVE = process.argv.includes('--save')
const bundle = fs.readFileSync('./dist-test/app.js', 'utf8')
const html = fs
  .readFileSync('./index.html', 'utf8')
  .replace(/<script src="\/chuikov-rasp\/boot-gate\.js[^>]*><\/script>/, '')
  .replace(/<script type="module" src="\/src\/main\.js"><\/script>/, '')
  .replace(/<script>[\s\S]*?<\/script>/g, '')

const errors = []
const steps = []

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
window.Element.prototype.animate = () => ({ finished: Promise.resolve(), cancel() {}, onfinish: null })
window.Element.prototype.scrollIntoView = () => {}
window.scrollTo = () => {}
Object.defineProperty(window, 'innerWidth', { value: 390, writable: true })
Object.defineProperty(window, 'innerHeight', { value: 844, writable: true })

window.addEventListener('error', (e) => errors.push('window.error: ' + (e.error?.stack || e.message)))
window.addEventListener('unhandledrejection', (e) => errors.push('unhandledrejection: ' + (e.reason?.stack || e.reason)))
window.console.error = (...a) => errors.push('console.error: ' + a.map(String).join(' '))
window.console.warn = () => {}
window.console.log = () => {}

window.localStorage.setItem('rasp_selected_group_v3', 'g_0901_пд3')

try {
  window.eval(bundle)
} catch (e) {
  errors.push('eval threw: ' + (e.stack || e))
}

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms))
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16)

function snap(label) {
  const app = window.document.getElementById('app')
  const markup = app ? app.innerHTML : ''
  // нормализуем нестабильные вещи: время, id
  const stable = markup
    .replace(/id="[^"]*"/g, 'id=""')
    .replace(/\d{2}:\d{2}/g, 'HH:MM')
    .replace(/\d{2}\.\d{2}\.\d{4}/g, 'DD.MM.YYYY')
  steps.push({
    label,
    len: markup.length,
    nodes: app ? app.querySelectorAll('*').length : 0,
    buttons: window.document.querySelectorAll('button').length,
    hash: sha(stable),
  })
}

await tick(1800)
snap('boot')

// ── вкладки
const navBtns = () => [...window.document.querySelectorAll('nav button')]
const tabs = ['home', 'schedule', 'grades', 'teachers', 'more']
for (let i = 0; i < tabs.length; i++) {
  const btn = navBtns()[i]
  if (!btn) {
    steps.push({ label: 'tab ' + tabs[i], missing: true })
    continue
  }
  try {
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  } catch (e) {
    errors.push(`click tab ${tabs[i]}: ${e.stack || e}`)
  }
  await tick(250)
  snap('tab ' + tabs[i])
}

// ── экран «Профиль» → все подэкраны
for (const label of ['students', 'my-code', 'contacts', 'overrides', 'group', 'support']) {
  const btn = [...window.document.querySelectorAll('#app button')].find((b) =>
    (b.textContent || '').toLowerCase().includes(
      { students: 'состав', 'my-code': 'мой код', contacts: 'контакт', overrides: 'замен', group: 'моя группа', support: 'поддерж' }[label]
    )
  )
  if (!btn) {
    steps.push({ label: 'more:' + label, missing: true })
    continue
  }
  try {
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  } catch (e) {
    errors.push(`click ${label}: ${e.stack || e}`)
  }
  await tick(150)
  snap('more:' + label)
  // назад
  const back = [...window.document.querySelectorAll('#app button')].find((b) =>
    /назад/i.test(b.getAttribute('aria-label') || '') || /назад/i.test(b.textContent || '')
  )
  if (back) {
    try {
      back.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    } catch {}
    await tick(150)
  }
}

// ── календарь на месяц в «Расписании»
const calBtn = [...window.document.querySelectorAll('#app button')].find((b) =>
  /календар|месяц/i.test(b.textContent || '') || /calendar/i.test(b.className || '')
)
if (calBtn) {
  try {
    calBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  } catch (e) {
    errors.push('calendar: ' + (e.stack || e))
  }
  await tick(200)
  snap('calendar')
}

// ── довершаем: жмём всё остальное, следя за ошибками
let clicked = 0
const all = [...window.document.querySelectorAll('#app button')]
for (const b of all.slice(0, 80)) {
  if (!b.isConnected) continue
  try {
    b.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    clicked++
  } catch (e) {
    errors.push(`click "${(b.textContent || '').trim().slice(0, 25)}": ${e.stack || e}`)
  }
  await tick(15)
}
await tick(400)
snap('after ' + clicked + ' clicks')

const uniqueErrors = [...new Set(errors)]

console.log('=== STEPS ===')
for (const s of steps) console.log(JSON.stringify(s))
console.log('\n=== ERRORS: ' + uniqueErrors.length + ' ===')
for (const e of uniqueErrors.slice(0, 30)) console.log('- ' + e.split('\n').slice(0, 3).join('\n    '))

const result = { steps, errors: uniqueErrors }

if (SAVE) {
  fs.writeFileSync('./smoke/baseline.json', JSON.stringify(result, null, 1))
  console.log('\nЭталон сохранён: smoke/baseline.json')
  process.exit(0)
}

let baseline = null
try {
  baseline = JSON.parse(fs.readFileSync('./smoke/baseline.json', 'utf8'))
} catch {}

if (!baseline) {
  console.log('\nНет эталона. Запусти: node smoke/run.mjs --save')
  process.exit(2)
}

console.log('\n=== DIFF С ЭТАЛОНОМ ===')
let diffs = 0
const max = Math.max(baseline.steps.length, steps.length)
for (let i = 0; i < max; i++) {
  const a = baseline.steps[i]
  const b = steps[i]
  if (!a || !b) {
    console.log(`#${i}: только в одной версии: ${JSON.stringify(a || b)}`)
    diffs++
    continue
  }
  if (a.hash !== b.hash || a.len !== b.len || a.nodes !== b.nodes) {
    console.log(`#${i} ${a.label}: эталон ${a.len}/${a.nodes}/${a.hash}  сейчас ${b.len}/${b.nodes}/${b.hash}`)
    diffs++
  }
}
if (baseline.errors.length !== uniqueErrors.length) {
  console.log(`ошибок: было ${baseline.errors.length}, стало ${uniqueErrors.length}`)
  diffs++
}

console.log(diffs === 0 ? '\n✅ DOM идентичен эталону' : `\n⚠️  расхождений: ${diffs}`)
process.exit(diffs === 0 ? 0 : 1)
