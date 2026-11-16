// Скачивает живой бандл с GitHub Pages и прогоняет на нём тесты.
//
// Зачем: имена в минифицированном коде переименованы, поэтому искать
// «фикс по тексту» бессмысленно — надо запускать. Если тест проходит на
// скачанном файле, значит на сайте именно то, что мы собрали.
//
// Запуск: node smoke/verify-live.mjs [тест1.mjs тест2.mjs ...]
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const BASE = 'https://pepsicolaq.github.io/chuikov-rasp/'

const tests = process.argv.slice(2)
const toRun = tests.length ? tests : ['smoke/group-search.mjs', 'smoke/compare-screen.mjs']

const indexHtml = await fetch(BASE).then((r) => r.text())
const m = indexHtml.match(/assets\/index-[A-Za-z0-9_-]+\.js/)
if (!m) {
  console.error('❌ В index.html не найден бандл')
  process.exit(1)
}
const bundleUrl = BASE + m[0]
console.log('Живой бандл:', m[0])
console.log('Версия загрузчика:', /boot-gate\.js\?v=\d+/.exec(indexHtml)?.[0] || 'не найдена')

const code = await fetch(bundleUrl, { cache: 'no-store' }).then((r) => r.text())
console.log('Размер:', code.length, 'байт')

// Кладём скачанный бандл туда, куда смотрят тесты
fs.mkdirSync('dist-test', { recursive: true })
fs.writeFileSync('dist-test/app.js', code)
console.log('Сохранён в dist-test/app.js — прогоняем тесты на живом коде\n')

let failed = 0
for (const test of toRun) {
  console.log(`──────── ${test} ────────`)
  try {
    const out = execFileSync(process.execPath, [test], { encoding: 'utf8' })
    const lines = out.split(/\r?\n/).filter((l) => l.trim())
    console.log(lines.slice(-6).join('\n'))
    if (/ПРОВАЛЕНО|ЕСТЬ ПРОБЛЕМЫ|❌/.test(out)) {
      failed++
      console.log('❌ ТЕСТ УПАЛ НА ЖИВОМ КОДЕ')
    } else {
      console.log('✅ прошёл на живом коде')
    }
  } catch (e) {
    failed++
    console.log((e.stdout || '').split(/\r?\n/).slice(-14).join('\n'))
    console.log('❌ ТЕСТ УПАЛ НА ЖИВОМ КОДЕ')
  }
  console.log('')
}

console.log(failed ? `\n❌ ЖИВОЙ САЙТ: провалено ${failed} из ${toRun.length}` : `\n✅ ЖИВОЙ САЙТ СОДЕРЖИТ ВСЁ, ЧТО МЫ СОБРАЛИ (${toRun.length} тестов)`)
process.exit(failed ? 1 : 0)
