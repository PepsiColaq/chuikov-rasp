// Находит все поля ввода в приложении и места, где экран пересобирается
// так, что поле может исчезнуть прямо во время набора.
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

console.log('=== ПОЛЯ ВВОДА ===')
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/)
  lines.forEach((s, i) => {
    if (/el\('(input|textarea)'|type: 'search'|type: 'tel'|type: 'date'|type: 'password'/.test(s)) {
      console.log(`  ${f}:${i + 1}  ${s.trim().slice(0, 100)}`)
    }
  })
}

console.log('\n=== ПЕРЕСБОРКА ЭКРАНА (replaceChildren / replaceChildren()) ===')
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/)
  lines.forEach((s, i) => {
    if (/replaceChildren\(/.test(s) && !/empty|\.replaceChildren\(\)\s*$/.test(s.trim()) === false) {
      console.log(`  ${f}:${i + 1}  ${s.trim().slice(0, 100)}`)
    }
  })
}

console.log('\n=== TIMERS (setInterval / setTimeout с перерисовкой) ===')
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (/setInterval\(/.test(lines[i])) {
      const block = lines.slice(i, i + 12).join('\n')
      if (/render|replaceChildren|refreshTabPanes/.test(block)) {
        console.log(`  ${f}:${i + 1}  ${lines[i].trim().slice(0, 90)}`)
      }
    }
  }
}
