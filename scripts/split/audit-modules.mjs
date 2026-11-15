// Статический поиск типичных ошибок после разбивки на модули:
//   1. пустышки моста там, где модуль зовёт hub.X, но X никто не зарегистрировал;
//   2. импорт несуществующего имени из модуля;
//   3. имя используется, но нигде не объявлено и не импортировано;
//   4. циклический импорт (A → B → A), который может дать undefined.
import fs from 'node:fs'
import path from 'node:path'
import * as acorn from 'acorn'

const files = []
;(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.js')) files.push(p.replace(/\\/g, '/'))
  }
})('src')

const info = new Map() // file -> { exports:Set, imports:[{source,names}], text }

for (const f of files) {
  const text = fs.readFileSync(f, 'utf8')
  let ast
  try {
    ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module' })
  } catch (e) {
    console.log(`❌ ${f} не парсится: ${e.message}`)
    continue
  }
  const exportsSet = new Set()
  const imports = []
  for (const n of ast.body) {
    if (n.type === 'ExportNamedDeclaration' && n.declaration) {
      const d = n.declaration
      if (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') exportsSet.add(d.id.name)
      if (d.type === 'VariableDeclaration') for (const v of d.declarations) if (v.id.type === 'Identifier') exportsSet.add(v.id.name)
    }
    if (n.type === 'ExportNamedDeclaration' && !n.declaration) {
      for (const s of n.specifiers) exportsSet.add(s.exported.name)
    }
    if (n.type === 'ExportDefaultDeclaration') exportsSet.add('default')
    if (n.type === 'ImportDeclaration') {
      imports.push({
        source: n.source.value,
        names: n.specifiers.map((s) => s.imported?.name || s.local.name),
      })
    }
  }
  info.set(f, { exports: exportsSet, imports, text })
}

const resolve = (from, src) => {
  const dir = path.posix.dirname(from)
  let p = path.posix.normalize(path.posix.join(dir, src))
  if (!p.endsWith('.js')) p += '.js'
  return p
}

let problems = 0

// ── 1. импорт несуществующих имён
for (const [f, d] of info) {
  for (const im of d.imports) {
    const target = resolve(f, im.source)
    const t = info.get(target)
    if (!t) {
      if (!im.source.startsWith('.')) continue // внешний пакет
      console.log(`❌ ${f}: импорт из несуществующего файла ${im.source}`)
      problems++
      continue
    }
    for (const name of im.names) {
      if (!t.exports.has(name)) {
        console.log(`❌ ${f}: «${name}» не экспортируется из ${im.source}`)
        problems++
      }
    }
  }
}

// ── 2. hub.X, которые никто не регистрирует
const mainText = fs.readFileSync('src/main.js', 'utf8')
const hubStubText = fs.readFileSync('src/app/hub.js', 'utf8')
const registered = new Set()
const wireMatch = mainText.match(/wireHub\(\{([^}]*)\}\)/)
if (wireMatch) for (const n of wireMatch[1].split(',')) registered.add(n.trim())
// плюс те, что объявлены в hub.js как пустышки
for (const m of hubStubText.matchAll(/^\s+(\w+): noop,/gm)) registered.add(m[1])

for (const [f, d] of info) {
  if (f.endsWith('main.js') || f.endsWith('app/hub.js')) continue
  for (const m of d.text.matchAll(/\bhub\.(\w+)\(/g)) {
    if (!registered.has(m[1])) {
      console.log(`⚠️  ${f}: зовёт hub.${m[1]}(), но такого имени нет ни в hub.js, ни в wireHub — вернёт undefined`)
      problems++
    }
  }
}

// ── 3. циклические импорты
const graph = new Map()
for (const [f, d] of info) {
  graph.set(
    f,
    d.imports.filter((i) => i.source.startsWith('.')).map((i) => resolve(f, i.source))
  )
}
const seen = new Set()
function findCycle(node, stack) {
  if (stack.includes(node)) {
    const cycle = stack.slice(stack.indexOf(node)).concat(node)
    const key = cycle.join('→')
    if (!seen.has(key)) {
      seen.add(key)
      console.log('⚠️  цикл: ' + cycle.map((x) => x.replace('src/', '')).join(' → '))
    }
    return
  }
  if (stack.length > 12) return
  for (const next of graph.get(node) || []) findCycle(next, [...stack, node])
}
for (const f of graph.keys()) findCycle(f, [])

console.log(problems ? `\n❌ проблем: ${problems}` : '\n✅ статических проблем не найдено')
process.exit(problems ? 1 : 0)
