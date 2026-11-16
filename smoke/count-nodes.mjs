// Только счётчики: сколько узлов на профиле и на подэкране. Нужен, чтобы
// понять, откуда взялись +2 узла в эталоне (моя правка или что-то ещё).
import fs from 'node:fs'
import { JSDOM } from 'jsdom'

const bundle = fs.readFileSync('./dist-test/app.js', 'utf8')
const html = fs
  .readFileSync('./index.html', 'utf8')
  .replace(/<script src="\/chuikov-rasp\/boot-gate\.js[^>]*><\/script>/, '')
  .replace(/<script type="module" src="\/src\/main\.js"><\/script>/, '')
  .replace(/<script>[\s\S]*?<\/script>/g, '')

const dom = new JSDOM(html, { url: 'https://example.test/chuikov-rasp/', runScripts: 'outside-only', pretendToBeVisual: true })
const w = dom.window
w.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
w.navigator.vibrate = () => true
w.HTMLCanvasElement.prototype.getContext = () => null
w.Element.prototype.animate = () => ({ finished: Promise.resolve(), cancel() {}, onfinish: null })
w.Element.prototype.scrollIntoView = () => {}
w.scrollTo = () => {}
Object.defineProperty(w, 'innerWidth', { value: 390, writable: true })
Object.defineProperty(w, 'innerHeight', { value: 844, writable: true })
w.console.error = () => {}
w.console.warn = () => {}
w.console.log = () => {}
w.localStorage.setItem('rasp_selected_group_v3', 'g_0901_пд3')
w.eval(bundle)

const tick = (ms) => new Promise((r) => setTimeout(r, ms))
await tick(1800)
const doc = w.document
const count = () => doc.querySelectorAll('#app *').length

console.log('boot:', count())
const nav = [...doc.querySelectorAll('#app nav button')]
nav[4].dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
await tick(300)
console.log('профиль:', count())

const contacts = [...doc.querySelectorAll('#app button')].find((b) => /контакт/i.test(b.textContent || ''))
if (contacts) {
  contacts.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  await tick(350)
  console.log('контакты:', count())
  console.log('  панель:', doc.querySelectorAll('#app .panel > *').length, 'детей')
  console.log('  карточек:', doc.querySelectorAll('#app .card').length)
}
