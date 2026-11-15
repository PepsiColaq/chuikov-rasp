// Сверяет то, что реально передаётся через мост, с видами объявлений.
// Ищет имена, которые модули получают через hub, но которые НЕ являются
// функциями (Set, число, флаг, объект) — именно это ломает вызовы вроде
// set.clear() или сравнение числа.
import fs from 'node:fs'
import path from 'node:path'
import * as acorn from 'acorn'

// 1. Что модули реально зовут через hub
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.js')) out.push(p.replace(/\\/g, '/'))
  }
  return out
}

const viaHub = new Set()
for (const f of walk('src')) {
  if (f.endsWith('src/main.js') || f.endsWith('app/hub.js')) continue
  const t = fs.readFileSync(f, 'utf8')
  for (const m of t.matchAll(/^\s*const (\w+) = \(\.\.\.args\) => hub\.\1\(/gm)) viaHub.add(m[1])
}

// 2. Что из этого — не функция
// Проверяем модули: если там объявлено не функцией — всё хорошо.
// Проблема только если имя ОБЪЯВЛЕНО в main.js как значение (и модуль его не импортирует).
const main = fs.readFileSync('src/main.js', 'utf8')
const ast = acorn.parse(main, { ecmaVersion: 'latest', sourceType: 'module' })

const imported = new Set()
for (const n of ast.body) {
  if (n.type === 'ImportDeclaration') for (const s of n.specifiers) imported.add(s.local.name)
}

const valueKinds = new Map()
for (const n of ast.body) {
  if (n.type === 'VariableDeclaration') {
    for (const d of n.declarations) {
      if (d.id.type !== 'Identifier') continue
      const init = d.init
      if (!init) continue
      const isFn = init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression'
      if (isFn) continue
      let kind = init.type
      if (init.type === 'NewExpression') kind = 'new ' + init.callee.name
      if (init.type === 'Literal') kind = 'значение ' + JSON.stringify(init.value)
      valueKinds.set(d.id.name, kind)
    }
  }
}

const problems = []
for (const name of viaHub) {
  if (imported.has(name)) continue // приходит из модуля — там проверим отдельно
  if (valueKinds.has(name)) problems.push(`${name} → ${valueKinds.get(name)}`)
}

console.log('через мост зовётся имён:', viaHub.size)
if (problems.length) {
  console.log('❌ ЗНАЧЕНИЯ ЧЕРЕЗ МОСТ:')
  for (const p of problems) console.log('   ' + p)
  process.exit(1)
} else {
  console.log('✅ Все имена, идущие через мост, — функции')
}
