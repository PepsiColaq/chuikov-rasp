// Разбор: какие узлы появились/исчезли на подэкране профиля.
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

const click = async (text, ms = 200) => {
  const btn = [...doc.querySelectorAll('#app button')].find((b) => (b.textContent || '').toLowerCase().includes(text))
  if (!btn) return false
  btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  await tick(ms)
  return true
}

await click('профиль')
const rootsBefore = [...doc.querySelectorAll('#app > *')].map((n) => n.tagName + '.' + n.className)
console.log('верхний уровень профиля:', rootsBefore)

const total = doc.querySelectorAll('#app *').length
console.log('всего узлов на профиле:', total)

const hasCmp = doc.querySelectorAll('#app [class*="cmp"]').length
console.log('узлов с классом cmp на профиле:', hasCmp)

console.log('\n--- строка сравнения в профиле ---')
const row = [...doc.querySelectorAll('#app .more-row')].find((b) => /сравнить/i.test(b.textContent || ''))
console.log(row ? row.outerHTML.slice(0, 400) : 'НЕ НАЙДЕНА')
console.log('узлов в строке:', row ? row.querySelectorAll('*').length + 1 : 0)

console.log('\n--- открываем «Мои контакты» ---')
await click('контакт', 300)
const after = doc.querySelectorAll('#app *').length
console.log('всего узлов на контактах:', after)
console.log('cmp-узлов:', doc.querySelectorAll('#app [class*="cmp"]').length)
console.log('верхний уровень:', [...doc.querySelectorAll('#app > *')].map((n) => n.tagName + '.' + n.className))
