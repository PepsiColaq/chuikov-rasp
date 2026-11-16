// Что человек реально видит на экране сравнения — текст, а не классы.
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
w.localStorage.setItem('rasp_session_v3', JSON.stringify({ role: 'admin', token: 't', label: 'Никитос', expiresAt: Date.now() + 1e9 }))
w.localStorage.setItem('rasp_compare_group_v1', 'g_0903_пд1')
w.eval(bundle)

const tick = (ms) => new Promise((r) => setTimeout(r, ms))
await tick(1800)
const doc = w.document
const click = async (re, ms = 400) => {
  const b = [...doc.querySelectorAll('#app button')].find((x) => re.test(x.textContent || ''))
  if (!b) return false
  b.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  await tick(ms)
  return true
}

await click(/профиль/i, 350)
await click(/сравнить с группой/i, 500)

const text = (sel) => (doc.querySelector(`#app ${sel}`)?.textContent || '').replace(/\s+/g, ' ').trim()

console.log('=== ЧТО ВИДИТ ЧЕЛОВЕК ===\n')
console.log('Плашка:', text('.cmp-pair'))
console.log('')
console.log('Итог:', text('.cmp-summary-title'), '|', text('.cmp-summary-count'), '|', text('.cmp-summary-detail'))

console.log('\n── Дни (метки) ──')
for (const b of doc.querySelectorAll('#app .cmp-days button')) {
  console.log('  ', (b.textContent || '').replace(/\s+/g, ' ').trim(), b.className ? '(актив)' : '')
}

console.log('\n── Встречи ──')
for (const m of doc.querySelectorAll('#app .cmp-meet')) {
  console.log('  ', (m.textContent || '').replace(/\s+/g, ' ').trim())
}

console.log('\n── Расписание рядом (главное) ──')
const head = [...doc.querySelectorAll('#app .cmp-pairhead > *')].map((n) => n.textContent.trim())
console.log('   ' + head.join('   |   '))
for (const r of doc.querySelectorAll('#app .cmp-pairrow')) {
  const cells = [...r.querySelectorAll('*')]
    .filter((n) => n.children.length === 0 && n.textContent.trim())
    .map((n) => n.textContent.trim())
  const mark = r.className.includes('is-meet') ? ' ★' : ''
  console.log('   ' + cells.join('   |   ') + mark)
}

console.log('\n── Пояснения ──')
for (const n of doc.querySelectorAll('#app .cmp-note')) console.log('  ', n.textContent.trim())
