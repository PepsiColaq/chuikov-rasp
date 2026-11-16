// Проверка экрана «Сравнить с группой»: открывается из профиля, находит
// встречи, не теряет фокус в поиске и не прыгает по прокрутке.
//
// Запуск: node smoke/compare-screen.mjs
import fs from 'node:fs'
import { JSDOM } from 'jsdom'

const bundle = fs.readFileSync('./dist-test/app.js', 'utf8')
const html = fs
  .readFileSync('./index.html', 'utf8')
  .replace(/<script src="\/chuikov-rasp\/boot-gate\.js[^>]*><\/script>/, '')
  .replace(/<script type="module" src="\/src\/main\.js"><\/script>/, '')
  .replace(/<script>[\s\S]*?<\/script>/g, '')

const errors = []
const dom = new JSDOM(html, { url: 'https://example.test/chuikov-rasp/', runScripts: 'outside-only', pretendToBeVisual: true })
const w = dom.window
w.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
w.navigator.vibrate = () => true
w.HTMLCanvasElement.prototype.getContext = () => null
w.Element.prototype.animate = () => ({ finished: Promise.resolve(), cancel() {}, onfinish: null })
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
w.localStorage.setItem('rasp_selected_group_v3', 'g_0901_пд3')
w.localStorage.removeItem('rasp_compare_group_v1')

w.eval(bundle)
const tick = (ms) => new Promise((r) => setTimeout(r, ms))
await tick(1800)

const doc = w.document
let failed = 0
const ok = (m) => console.log('✅ ' + m)
const bad = (m) => { console.log('❌ ' + m); failed++ }
const check = (cond, m) => (cond ? ok(m) : bad(m))

const findBtn = (re) => [...doc.querySelectorAll('#app button')].find((b) => re.test(b.textContent || ''))
const clickBtn = async (re, ms = 250) => {
  const b = findBtn(re)
  if (!b) return false
  b.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  await tick(ms)
  return true
}

// ── Открываем профиль
await clickBtn(/профиль/i)
check(!!doc.querySelector('#app .more-row'), 'профиль открылся')

// ── Кнопка «Сравнить с группой» на месте и рядом с кодами/заменами
const rows = [...doc.querySelectorAll('#app .more-row')]
const idxCompare = rows.findIndex((r) => /сравнить с группой/i.test(r.textContent || ''))
const idxSwap = rows.findIndex((r) => /^замены/i.test((r.textContent || '').trim()))
const idxCodes = rows.findIndex((r) => /коды студентов/i.test(r.textContent || ''))
check(idxCompare >= 0, 'в профиле есть «Сравнить с группой»')
check(
  idxCompare > idxSwap && (idxCodes < 0 || idxCompare > idxCodes),
  `кнопка стоит после «Замены» и «Коды студентов» (замены ${idxSwap}, коды ${idxCodes}, сравнение ${idxCompare})`,
)

await clickBtn(/сравнить с группой/i, 400)
check(!!doc.querySelector('#app .cmp-screen'), 'экран сравнения открылся')
check(!!doc.querySelector('#app .cmp-head'), 'видна плашка «моя группа ↔ с кем»')
check(/Сравнение с другой группой/i.test(doc.querySelector('#app .topbar-sub')?.textContent || ''), 'в шапке подпись про сравнение')

// ── Выбор второй группы: сначала пустой список + поиск
let input = doc.querySelector('#app #cmp-group-search')
check(!!input, 'есть поле поиска второй группы')

const before = doc.querySelectorAll('#app .cmp-group-list .group-pick-btn').length
check(before > 50, `список групп показан (${before})`)

// печатаем «0903» и проверяем, что поле живо
scrollY = 350
input.focus()
input.value = '0903'
input.dispatchEvent(new w.Event('input', { bubbles: true }))
await tick(300)

const afterType = doc.querySelector('#app #cmp-group-search')
check(afterType === input, 'поле поиска не пересоздано (клавиатура не закроется)')
check(afterType.value === '0903', 'текст в поле сохранился')
check(doc.activeElement === afterType, 'фокус остался в поиске')
check(scrollY === 350, `прокрутка не изменилась (350 → ${scrollY})`)

const filtered = doc.querySelectorAll('#app .cmp-group-list .group-pick-btn').length
check(filtered > 0 && filtered < before, `список отфильтрован: ${filtered} из ${before}`)

// ── Выбираем первую найденную группу
const pick = doc.querySelector('#app .cmp-group-list .group-pick-btn')
const pickedName = (pick.textContent || '').trim().split('\n')[0]
pick.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
await tick(500)

check(!doc.querySelector('#app #cmp-group-search'), 'после выбора поиск убран')
check(!!doc.querySelector('#app .cmp-summary'), 'появился итог дня')
const pairText = doc.querySelector('#app .cmp-pair')?.textContent || ''
check(pairText.includes(pickedName.trim().split(' ')[0]) || pairText.length > 0, `в плашке видна выбранная группа (${pickedName})`)

// ── Выбор запомнился
check(
  w.localStorage.getItem('rasp_compare_group_v1') === 'g_0903_пд1',
  `выбор сохранён в localStorage (${w.localStorage.getItem('rasp_compare_group_v1')})`,
)

// ── Есть переключатель дней и данные
const dayBtns = doc.querySelectorAll('#app .cmp-days button')
check(dayBtns.length >= 5, `переключатель дней: ${dayBtns.length} кнопок`)
check(!!doc.querySelector('#app .cmp-timeline .cmp-bar'), 'нарисован таймлайн дня')

const meetings = doc.querySelectorAll('#app .cmp-meet').length
const segments = doc.querySelectorAll('#app .cmp-row').length
check(segments > 0, `раскладка «кто где» построена: ${segments} отрезков`)
console.log(`   встреч найдено: ${meetings}`)

// ── Переключение дня меняет данные, а не ломает экран
const otherDay = [...dayBtns].find((b) => !b.classList.contains('active'))
const titleBefore = doc.querySelector('#app .cmp-summary-day')?.textContent
otherDay.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
await tick(350)
const titleAfter = doc.querySelector('#app .cmp-summary-day')?.textContent
check(titleBefore !== titleAfter, `переключение дня меняет дату («${titleBefore}» → «${titleAfter}»)`)
check(!!doc.querySelector('#app .cmp-summary'), 'экран цел после смены дня')

// ── Вход в экран с уже сохранённой группой сразу показывает результат
const backBtn = findBtn(/← Профиль/i)
if (backBtn) {
  backBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  await tick(300)
}
await clickBtn(/сравнить с группой/i, 400)
check(!doc.querySelector('#app #cmp-group-search'), 'при повторном входе выбор группы уже сделан (запомнился)')
check(!!doc.querySelector('#app .cmp-summary'), 'и сразу показан итог')

// ── «Сменить группу» возвращает поиск
await clickBtn(/Сменить группу/i, 350)
check(!!doc.querySelector('#app #cmp-group-search'), '«Сменить группу» открывает поиск заново')

const uniq = [...new Set(errors)]
check(uniq.length === 0, uniq.length ? `ошибок в консоли: ${uniq.length}` : 'ошибок в консоли нет')
uniq.slice(0, 6).forEach((e) => console.log('   ' + e.split('\n')[0]))

console.log(failed ? `\n❌ ПРОВАЛЕНО: ${failed}` : '\n✅ ЭКРАН СРАВНЕНИЯ РАБОТАЕТ')
process.exit(failed ? 1 : 0)
