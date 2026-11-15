// Заменяет обращения к внутренней переменной лайтбокса на публичную функцию.
// hwLightboxEl теперь приватная внутри features/lightbox.js, наружу отдаётся
// isHwLightboxOpen(). Скрипт правит импорты и вызовы во всех модулях.
import fs from 'node:fs'
import path from 'node:path'

const files = []
;(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.js')) files.push(p)
  }
})('src')

let touched = 0
for (const f of files) {
  if (f.endsWith('features/lightbox.js')) continue
  let t = fs.readFileSync(f, 'utf8')
  if (!t.includes('hwLightboxEl')) continue

  t = t.replace(/\bhwLightboxEl\b(?!\s*=)/g, 'isHwLightboxOpen()')
  // внутри импорта имя нужно без вызова
  t = t.replace(/isHwLightboxOpen\(\)(\s*\})/g, 'isHwLightboxOpen$1')
  t = t.replace(/import\s*\{([^}]*)\}\s*from\s*'([^']*lightbox\.js)'/g, (m, list, src) => {
    const names = list
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const fixed = names.map((n) => (n === 'isHwLightboxOpen()' ? 'isHwLightboxOpen' : n))
    return `import { ${fixed.join(', ')} } from '${src}'`
  })

  fs.writeFileSync(f, t)
  touched++
  console.log('обновлён', f.replace(/\\/g, '/'))
}
console.log('файлов изменено:', touched)
