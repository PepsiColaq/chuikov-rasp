// Проверка экрана «Сравнить с группой» и выдачи права на него.
//
// Три сценария:
//   1. Админ — право есть по умолчанию, экран открывается.
//   2. Обычный человек без права — строки в профиле нет, экран не показывает
//      данные, даже если открыть его принудительно.
//   3. Тот же человек с выданным правом — строка и экран появляются.
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

let failed = 0
const ok = (m) => console.log('✅ ' + m)
const bad = (m) => {
  console.log('❌ ' + m)
  failed++
}
const check = (cond, m) => (cond ? ok(m) : bad(m))

/** Поднимает приложение с заданной сессией в localStorage. */
function boot({ session = null, compareGroup = null } = {}) {
  const errors = []
  const dom = new JSDOM(html, {
    url: 'https://example.test/chuikov-rasp/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  const w = dom.window
  w.matchMedia = (q) => ({
    matches: false, media: q, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {},
  })
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
  if (session) w.localStorage.setItem('rasp_session_v3', JSON.stringify(session))
  if (compareGroup) w.localStorage.setItem('rasp_compare_group_v1', compareGroup)

  w.eval(bundle)
  return { w, errors, get scrollY() { return scrollY }, set scrollY(v) { scrollY = v } }
}

const tick = (ms) => new Promise((r) => setTimeout(r, ms))

const findBtn = (doc, re) => [...doc.querySelectorAll('#app button')].find((b) => re.test(b.textContent || ''))

// ═══════════════════════════════════════════════════════════════════
console.log('── 1. Админ: право есть по умолчанию ──')
{
  const app = boot({ session: { role: 'admin', token: 't-admin', label: 'Никитос', expiresAt: Date.now() + 1e9 } })
  const { w, errors } = app
  await tick(1800)
  const doc = w.document

  await findBtn(doc, /профиль/i)?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  await tick(350)

  const rows = [...doc.querySelectorAll('#app .more-row')]
  const idxCompare = rows.findIndex((r) => /сравнить с группой/i.test(r.textContent || ''))
  const idxCodes = rows.findIndex((r) => /коды студентов/i.test(r.textContent || ''))
  const idxSwap = rows.findIndex((r) => /^замены/i.test((r.textContent || '').trim()))
  check(idxCompare >= 0, 'у админа строка «Сравнить с группой» есть')
  check(
    idxCompare > idxSwap && idxCompare > idxCodes,
    `строка стоит после «Замены» и «Коды студентов» (${idxSwap} / ${idxCodes} / ${idxCompare})`,
  )

  await findBtn(doc, /сравнить с группой/i)?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  await tick(400)
  check(!!doc.querySelector('#app .cmp-screen'), 'экран сравнения открылся')
  check(/Сравнение с другой группой/i.test(doc.querySelector('#app .topbar-sub')?.textContent || ''), 'в шапке правильная подпись')

  // поиск второй группы
  const input = doc.querySelector('#app #cmp-group-search')
  check(!!input, 'есть поле поиска второй группы')
  const before = doc.querySelectorAll('#app .cmp-group-list .group-pick-btn').length
  check(before > 50, `список групп показан (${before})`)

  app.scrollY = 350
  input.focus()
  input.value = '0903'
  input.dispatchEvent(new w.Event('input', { bubbles: true }))
  await tick(300)
  check(doc.querySelector('#app #cmp-group-search') === input, 'поле поиска не пересоздано (клавиатура не закроется)')
  check(input.value === '0903', 'текст сохранился')
  check(doc.activeElement === input, 'фокус в поле')
  check(app.scrollY === 350, `прокрутка не изменилась (350 → ${app.scrollY})`)
  const filtered = doc.querySelectorAll('#app .cmp-group-list .group-pick-btn').length
  check(filtered > 0 && filtered < before, `список отфильтрован: ${filtered} из ${before}`)

  // выбор и результат
  doc.querySelector('#app .cmp-group-list .group-pick-btn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  await tick(500)
  check(!!doc.querySelector('#app .cmp-summary'), 'появился итог дня')
  check(w.localStorage.getItem('rasp_compare_group_v1') === 'g_0903_пд1', 'выбор запомнился')
  check(doc.querySelectorAll('#app .cmp-days button').length >= 5, 'есть переключатель дней')
  check(!!doc.querySelector('#app .cmp-timeline .cmp-bar'), 'нарисован таймлайн')

  // Таблица «расписание рядом»: должны быть видны предмет и кабинет обеих групп
  const tableRows = [...doc.querySelectorAll('#app .cmp-pairrow')]
  check(tableRows.length > 0, `таблица «расписание рядом» построена: ${tableRows.length} строк`)
  const tableText = tableRows.map((r) => r.textContent || '').join(' ')
  check(/каб\.\s*\d/.test(tableText), 'в таблице видны номера кабинетов')
  check(!/на паре/i.test(tableText), 'нет бесполезного «на паре» — вместо него предмет и кабинет')

  // Подсветка в таблице обязана совпадать со списком встреч
  const listCount = doc.querySelectorAll('#app .cmp-meet').length
  const markedCount = doc.querySelectorAll('#app .cmp-pairrow.is-meet').length
  check(
    markedCount === listCount,
    `подсвечено ровно столько же строк, сколько встреч в списке (${markedCount} = ${listCount})`,
  )

  // Метки на днях: цифра = число встреч
  const dayMarks = [...doc.querySelectorAll('#app .cmp-days .cmp-day-dot')].map((n) => n.textContent.trim())
  check(dayMarks.length >= 5, `у дней есть метки: ${dayMarks.join(' / ')}`)

  // Смена дня
  const dayBtns = [...doc.querySelectorAll('#app .cmp-days button')]
  const other = dayBtns.find((b) => !b.classList.contains('active'))
  const d1 = doc.querySelector('#app .cmp-summary-day')?.textContent
  other.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  await tick(350)
  const d2 = doc.querySelector('#app .cmp-summary-day')?.textContent
  check(d1 !== d2 && !!doc.querySelector('#app .cmp-summary'), `смена дня работает («${d1}» → «${d2}»)`)

  // «Сменить группу»
  await findBtn(doc, /сменить группу/i)?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  await tick(350)
  check(!!doc.querySelector('#app #cmp-group-search'), '«Сменить группу» возвращает поиск')

  const uniq = [...new Set(errors)]
  check(uniq.length === 0, uniq.length ? `ошибок в консоли: ${uniq.length}` : 'ошибок в консоли нет')
  uniq.slice(0, 5).forEach((e) => console.log('   ' + e.split('\n')[0]))

  // ── Секция админки «Доступ к сравнению групп»
  // Сначала возвращаемся в корень профиля: мы всё ещё на экране сравнения,
  // и админских секций там, разумеется, нет.
  await findBtn(doc, /← Профиль/i)?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  await tick(400)

  const accBtn = [...doc.querySelectorAll('#app button')].find((b) =>
    /доступ к сравнению/i.test(b.textContent || ''),
  )
  check(!!accBtn, 'в админке есть секция «Доступ к сравнению групп»')
  if (accBtn) {
    accBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
    await tick(450)
    const body = doc.querySelector('#app [id="admin-acc-compareAccess"]')
    check(!!body, 'секция раскрылась')
    check(!!doc.querySelector('#app input[placeholder="Поиск по имени…"]'), 'внутри есть поиск по имени')
    const stillNoErrors = [...new Set(errors)].length === 0
    check(stillNoErrors, stillNoErrors ? 'раскрытие без ошибок' : 'ошибки при раскрытии')
  }
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── 2. Староста БЕЗ права ──')
{
  const app = boot({
    session: {
      role: 'starosta', token: 't-star', label: 'Тюшкин', groupId: 'g_0901_пд3',
      allGroups: false, canCompareGroups: false, expiresAt: Date.now() + 1e9,
    },
    compareGroup: 'g_0903_пд1',
  })
  const { w, errors } = app
  await tick(1800)
  const doc = w.document
  await findBtn(doc, /профиль/i)?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  await tick(350)

  const rows = [...doc.querySelectorAll('#app .more-row')]
  check(
    !rows.some((r) => /сравнить с группой/i.test(r.textContent || '')),
    'строки «Сравнить с группой» в профиле нет',
  )
  check(
    app.scrollY !== undefined,
    'экран профиля поднялся без ошибок',
  )
  const uniq = [...new Set(errors)]
  check(uniq.length === 0, uniq.length ? `ошибок: ${uniq.length}` : 'ошибок в консоли нет')
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── 3. Тот же староста С правом ──')
{
  const app = boot({
    session: {
      role: 'starosta', token: 't-star2', label: 'Тюшкин', groupId: 'g_0901_пд3',
      allGroups: false, canCompareGroups: true, expiresAt: Date.now() + 1e9,
    },
    compareGroup: 'g_0903_пд1',
  })
  const { w, errors } = app
  await tick(1800)
  const doc = w.document
  await findBtn(doc, /профиль/i)?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  await tick(350)

  const rows = [...doc.querySelectorAll('#app .more-row')]
  const row = rows.find((r) => /сравнить с группой/i.test(r.textContent || ''))
  check(!!row, 'строка «Сравнить с группой» появилась')
  check(/0903-ПД1/.test(row?.textContent || ''), 'в подписи видна запомненная группа (0903-ПД1)')

  row.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  await tick(450)
  check(!!doc.querySelector('#app .cmp-screen'), 'экран открылся')
  check(!doc.querySelector('#app #cmp-group-search'), 'поиск не показан — группа уже запомнена')
  check(!!doc.querySelector('#app .cmp-summary'), 'сразу показан итог сравнения')

  const uniq = [...new Set(errors)]
  check(uniq.length === 0, uniq.length ? `ошибок: ${uniq.length}` : 'ошибок в консоли нет')
}

console.log(failed ? `\n❌ ПРОВАЛЕНО: ${failed}` : '\n✅ ДОСТУП К СРАВНЕНИЮ РАБОТАЕТ ПРАВИЛЬНО')
process.exit(failed ? 1 : 0)
