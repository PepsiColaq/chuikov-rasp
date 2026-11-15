// Проверка, что поиск группы не ломает DOM и прокрутку.
//
// Симулируем: человек печатает в поиске, список пересобирается.
// Проверяем, что поле поиска остаётся живым, текст сохраняется,
// а список фильтруется.
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
const w = dom.window
w.matchMedia = (q) => ({
  matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
})
w.navigator.vibrate = () => true
w.HTMLCanvasElement.prototype.getContext = () => null
w.Element.prototype.animate = () => ({ finished: Promise.resolve(), cancel() {} })
w.Element.prototype.scrollIntoView = () => {}
let scrollY = 0
Object.defineProperty(w, 'scrollY', { get: () => scrollY, set: (v) => (scrollY = v) })
w.scrollTo = (x, y) => { scrollY = y }
Object.defineProperty(w, 'innerWidth', { value: 390, writable: true })
Object.defineProperty(w, 'innerHeight', { value: 844, writable: true })
w.addEventListener('error', (e) => errors.push(String(e.error?.stack || e.message)))
w.console.error = (...a) => errors.push(a.map(String).join(' '))
w.console.warn = () => {}
w.console.log = () => {}
w.localStorage.removeItem('rasp_selected_group_v3')

w.eval(bundle)
const tick = (ms) => new Promise((r) => setTimeout(r, ms))
await tick(1800)

const doc = w.document
const fail = (m) => { console.log('❌ ' + m); process.exitCode = 1 }
const ok = (m) => console.log('✅ ' + m)

let input = doc.querySelector('#app input[type="search"]')
if (!input) { fail('нет поля поиска'); process.exit(1) }

// прокручиваем страницу вниз, как будто человек листает список
scrollY = 400
input.focus()
input.value = '0903'
input.dispatchEvent(new w.Event('input', { bubbles: true }))
await tick(300)

const afterType = doc.querySelector('#app input[type="search"]')
if (afterType === input) ok('поле поиска то же самое после фильтрации (не пересоздано)')
else fail('поле поиска пересоздано — клавиатура закрылась бы')

if (afterType?.value === '0903') ok('введённый текст сохранился')
else fail(`текст потерян: «${afterType?.value}»`)

if (doc.activeElement === afterType) ok('фокус остался в поле')
else fail('фокус потерян — клавиатура закрылась бы')

if (scrollY === 400) ok('прокрутка страницы не изменилась (400 → 400)')
else fail(`страница прыгнула: было 400, стало ${scrollY}`)

const rows = doc.querySelectorAll('#app button.group-pick-btn').length
if (rows > 0 && rows < 60) ok(`список отфильтрован: ${rows} строк вместо 60`)
else fail(`фильтр не сработал: строк ${rows}`)

// чистим поиск — список должен вернуться
afterType.value = ''
afterType.dispatchEvent(new w.Event('input', { bubbles: true }))
await tick(300)
const allRows = doc.querySelectorAll('#app button.group-pick-btn').length
if (allRows > 50) ok(`очистка поиска вернула весь список: ${allRows}`)
else fail(`после очистки строк ${allRows}`)

if (scrollY === 400) ok('прокрутка цела и после очистки')
else fail(`страница прыгнула при очистке: ${scrollY}`)

const uniq = [...new Set(errors)]
if (uniq.length) { fail(`ошибок: ${uniq.length}`); uniq.slice(0, 5).forEach((e) => console.log('   ' + e.split('\n')[0])) }
else ok('ошибок в консоли нет')

console.log(process.exitCode ? '\n❌ ЕСТЬ ПРОБЛЕМЫ' : '\n✅ ПОИСК ГРУППЫ РАБОТАЕТ БЕЗ ПОТЕРЬ')
