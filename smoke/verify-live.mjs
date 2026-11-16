// Скачивает живой бандл с GitHub Pages и прогоняет на нём тест поиска группы.
// Это единственная настоящая проверка «на сайте именно то, что мы собрали»:
// имена функций в минифицированном коде переименованы, поэтому искать их
// по тексту бессмысленно — надо запускать.
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const BASE = 'https://pepsicolaq.github.io/chuikov-rasp/'

const indexHtml = await fetch(BASE).then((r) => r.text())
const m = indexHtml.match(/assets\/index-[A-Za-z0-9_-]+\.js/)
if (!m) {
  console.error('❌ В index.html не найден бандл')
  process.exit(1)
}
const bundleUrl = BASE + m[0]
console.log('Живой бандл:', m[0])

const code = await fetch(bundleUrl).then((r) => r.text())
console.log('Размер:', code.length, 'байт')

// Кладём скачанный бандл туда, куда смотрит тест
fs.mkdirSync('dist-test', { recursive: true })
fs.writeFileSync('dist-test/app.js', code)
console.log('Сохранён в dist-test/app.js — прогоняем тест поиска на живом коде\n')

try {
  const out = execFileSync(process.execPath, ['smoke/group-search.mjs'], { encoding: 'utf8' })
  console.log(out)
  console.log('\n✅ ЖИВОЙ САЙТ СОДЕРЖИТ ФИКС')
} catch (e) {
  console.log(e.stdout || '')
  console.log('\n❌ ЖИВОЙ САЙТ НЕ СОДЕРЖИТ ФИКС (или тест упал)')
  process.exit(1)
}
