// Заменяет в main.js импорт hwLightboxEl на публичную функцию isHwLightboxOpen(),
// потому что сама переменная теперь приватная внутри features/lightbox.js.
import fs from 'node:fs'

const file = 'src/main.js'
let t = fs.readFileSync(file, 'utf8')

t = t.replace(/import\s*\{([^}]*)\}\s*from\s*'(\.\/features\/lightbox\.js)'/, (m, list, src) => {
  const names = list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((n) => n !== 'hwLightboxEl')
  names.push('isHwLightboxOpen')
  return `import { ${names.sort().join(', ')} } from '${src}'`
})

fs.writeFileSync(file, t)
const lines = t.split(/\r?\n/)
console.log(
  lines.filter((l) => l.includes('lightbox.js') || l.includes('isHwLightboxOpen')).join('\n')
)
