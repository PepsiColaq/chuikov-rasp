// Воспроизводит баг: «печатаю в поиске группы — клавиатура закрывается,
// страницу швыряет наверх».
//
// Тест открывает экран выбора группы, печатает в поиске и ждёт, пока
// сработают фоновые таймеры (15 с — статус сайта, 30 с — пересборка панели).
// Если поле исчезло из DOM или потеряло фокус — баг воспроизведён.
import fs from 'node:fs'
import { JSDOM } from 'jsdom'

const bundle = fs.readFileSync('./dist-test/app.js', 'utf8')
const html = fs
  .readFileSync('./index.html', 'utf8')
  .replace(/<script src="\/chuikov-rasp\/boot-gate\.js[^>]*><\/script>/, '')
  .replace(/<script type="module" src="\/src\/main\.js"><\/script>/, '')
  .replace(/<script>[\s\S]*?<\/script>/g, '')

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
w.console.error = () => {}
w.console.warn = () => {}
w.console.log = () => {}
w.localStorage.removeItem('rasp_selected_group_v3')

w.eval(bundle)
const tick = (ms) => new Promise((r) => setTimeout(r, ms))
await tick(1800)

const doc = w.document
const findSearch = () => doc.querySelector('#app input[type="search"]')

let input = findSearch()
if (!input) {
  console.log('❌ Поле поиска не найдено на экране выбора группы')
  process.exit(1)
}
console.log('✅ поле поиска найдено')

// печатаем, как человек
input.focus()
input.value = '0903'
input.dispatchEvent(new w.Event('input', { bubbles: true }))
await tick(200)

const rowsAfterType = doc.querySelectorAll('#app button.group-pick-btn').length
console.log(`   после ввода «0903» строк в списке: ${rowsAfterType}`)
const firstInput = input

// теперь ждём фоновые таймеры: 15 с (статус сайта) и 30 с (пересборка панели)
console.log('   ждём 34 секунды, чтобы сработали фоновые таймеры…')
for (let s = 0; s < 34; s++) {
  await tick(1000)
  input = findSearch()
  if (!input) {
    console.log(`\n❌ ЧЕРЕЗ ${s + 1} С Поле ввода ИСЧЕЗЛО из DOM — клавиатура закрылась бы`)
    break
  }
  if (input !== firstInput) {
    console.log(`\n❌ ЧЕРЕЗ ${s + 1} С Поле ввода ПЕРЕСОЗДАНО — ввод потерян, фокус сброшен`)
    break
  }
  if (input.value !== '0903') {
    console.log(`\n❌ ЧЕРЕЗ ${s + 1} С Введённый текст потерян: «${input.value}»`)
    break
  }
}

input = findSearch()
if (!input) {
  console.log('❌ поля нет')
  process.exit(1)
}
if (input === firstInput && input.value === '0903') {
  console.log('\n✅ за 34 секунды поле и текст не пострадали')
} else {
  console.log(`\n❌ итог: поле ${input === firstInput ? 'то же' : 'пересоздано'}, текст «${input.value}»`)
  process.exit(1)
}
