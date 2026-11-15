// Ищет опасный шаблон: обработчик ввода, который пересобирает список
// через replaceChildren. Это и есть причина «сайт закрыл клавиатуру и
// улетел наверх»: контейнер на миг пустеет, документ становится короче,
// браузер сам подрезает прокрутку.
//
// Безопасный вариант — swapKeepScroll (сохраняет прокрутку и фокус)
// или вставка всех узлов одним replaceChildren(...nodes).
import fs from 'node:fs'
import path from 'node:path'

const files = []
;(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.js')) files.push(p.replace(/\\/g, '/'))
  }
})('src')

const risky = []
const safe = []

for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // пустая очистка контейнера
    const emptyClear = /(\w+)\.replaceChildren\(\)\s*$/.test(line.trim())
    // «Загружаем…» перед асинхронной загрузкой — тоже рвёт список
    const loadingClear = /(\w+)\.replaceChildren\([^)]*Загружаем/.test(line)
    if (!emptyClear && !loadingClear) continue

    const target = (line.match(/(\w+)\.replaceChildren/) || [])[1]
    // ищем рядом (в пределах 40 строк) addEventListener('input'
    const from = Math.max(0, i - 40)
    const to = Math.min(lines.length, i + 40)
    const window = lines.slice(from, to).join('\n')
    const inInputHandler = /addEventListener\('input'|addEventListener\('search'|onInput/.test(window)
    const asyncLoad = /await\s/.test(window)

    const entry = { file: f, line: i + 1, target, text: line.trim().slice(0, 80) }
    if (inInputHandler || asyncLoad) risky.push(entry)
    else safe.push(entry)
  }
}

console.log(`=== ОПАСНО (${risky.length}): очистка внутри обработчика ввода или асинхронной загрузки ===`)
for (const r of risky) console.log(`  ${r.file}:${r.line}  ${r.target}.replaceChildren  ${r.text}`)

console.log(`\n=== Безопасно (${safe.length}): статическая отрисовка ===`)
for (const s of safe) console.log(`  ${s.file}:${s.line}  ${s.target}.replaceChildren`)
