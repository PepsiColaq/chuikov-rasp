// Механический разрезатель src/main.js на модули.
//
// Зачем скрипт, а не руками: в файле 269 объявлений и ~7000 перекрёстных
// ссылок. Ручная резка гарантированно что-то потеряет. Скрипт режет по
// точным границам из AST, сам считает импорты и отказывается работать,
// если после переноса осталось хоть одно неразрешённое имя.
//
// Использование:
//   node scripts/split/cut.mjs --dry            — показать план, ничего не менять
//   node scripts/split/cut.mjs --module <key>   — вынести один модуль по конфигу
import fs from 'node:fs'
import path from 'node:path'
import * as acorn from 'acorn'

const ROOT = process.cwd()
const MAIN = path.join(ROOT, 'src/main.js')
const LEDGER = path.join(ROOT, 'scripts/split/ledger.json')

// ── «встроенные» имена, которые не надо импортировать
const GLOBALS = new Set([
  'window', 'document', 'console', 'navigator', 'localStorage', 'sessionStorage', 'location',
  'history', 'screen', 'performance', 'fetch', 'setTimeout', 'clearTimeout', 'setInterval',
  'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask',
  'URL', 'URLSearchParams', 'Blob', 'File', 'FileReader', 'FormData', 'Image', 'CustomEvent',
  'Event', 'MouseEvent', 'KeyboardEvent', 'TouchEvent', 'PointerEvent', 'DragEvent',
  'MutationObserver', 'IntersectionObserver', 'ResizeObserver', 'crypto', 'structuredClone',
  'Intl', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'RegExp',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Symbol', 'Error', 'TypeError', 'RangeError',
  'SyntaxError', 'isNaN', 'isFinite', 'parseInt', 'parseFloat', 'encodeURIComponent',
  'decodeURIComponent', 'encodeURI', 'decodeURI', 'atob', 'btoa', 'alert', 'confirm', 'prompt',
  'matchMedia', 'getComputedStyle', 'devicePixelRatio', 'globalThis', 'undefined', 'NaN',
  'Infinity', 'AbortController', 'TextEncoder', 'TextDecoder', 'Uint8Array', 'ArrayBuffer',
  'Element', 'HTMLElement', 'Node', 'NodeList', 'DocumentFragment', 'DOMParser', 'CSS',
  'Notification', 'visualViewport', 'BroadcastChannel', 'Worker', 'indexedDB', 'caches',
  'self', 'top', 'parent', 'frames', 'clipboard', 'screen', 'ImageData',
])

const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const MODULE_KEY = (() => {
  const i = args.indexOf('--module')
  return i >= 0 ? args[i + 1] : null
})()

function parse(file) {
  const src = fs.readFileSync(file, 'utf8')
  return { src, ast: acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true }) }
}

function collect(node, fn) {
  if (!node || typeof node.type !== 'string') return
  fn(node)
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue
    const v = node[k]
    if (Array.isArray(v)) v.forEach((c) => collect(c, fn))
    else if (v && typeof v.type === 'string') collect(v, fn)
  }
}

// имена, объявленные внутри поддерева (локальные, параметры и т.п.)
function localBindings(node) {
  const set = new Set()
  collect(node, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier') set.add(n.id.name)
    if (n.type === 'FunctionDeclaration' && n.id) set.add(n.id.name)
    if (n.type === 'FunctionExpression' && n.id) set.add(n.id.name)
    if (n.type === 'ClassExpression' && n.id) set.add(n.id.name)
    if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') {
      for (const p of n.params) {
        if (p.type === 'Identifier') set.add(p.name)
        else if (p.type === 'AssignmentPattern' && p.left.type === 'Identifier') set.add(p.left.name)
        else if (p.type === 'RestElement' && p.argument.type === 'Identifier') set.add(p.argument.name)
        else if (p.type === 'ObjectPattern')
          p.properties.forEach((pr) => {
            if (pr.value && pr.value.type === 'Identifier') set.add(pr.value.name)
            if (pr.value && pr.value.type === 'AssignmentPattern' && pr.value.left.type === 'Identifier')
              set.add(pr.value.left.name)
          })
        else if (p.type === 'ArrayPattern')
          p.elements.forEach((e) => {
            if (e && e.type === 'Identifier') set.add(e.name)
          })
      }
    }
    if (n.type === 'CatchClause' && n.param && n.param.type === 'Identifier') set.add(n.param.name)
    if ((n.type === 'ForOfStatement' || n.type === 'ForInStatement') && n.left.type === 'VariableDeclaration')
      for (const dd of n.left.declarations) if (dd.id.type === 'Identifier') set.add(dd.id.name)
  })
  return set
}

// Свободные имена: ссылки на переменные, но НЕ имена свойств (obj.x, { x: 1 }).
function freeNames(node) {
  const inside = localBindings(node)
  const used = new Set()

  function walk(n, parent, key) {
    if (!n || typeof n.type !== 'string') return

    // имя свойства / метода / ключа объекта — это не переменная
    const isPropertyName =
      (parent &&
        ((parent.type === 'MemberExpression' && key === 'property' && !parent.computed) ||
          (parent.type === 'Property' && key === 'key' && !parent.computed && !parent.shorthand) ||
          (parent.type === 'MethodDefinition' && key === 'key' && !parent.computed) ||
          (parent.type === 'PropertyDefinition' && key === 'key' && !parent.computed) ||
          (parent.type === 'LabeledStatement' && key === 'label') ||
          ((parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') && key === 'label') ||
          (parent.type === 'ImportSpecifier' && key === 'imported') ||
          (parent.type === 'ExportSpecifier' && key === 'exported'))) &&
      n.type === 'Identifier'

    if (n.type === 'Identifier' && !isPropertyName && !inside.has(n.name)) used.add(n.name)

    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue
      const v = n[k]
      if (Array.isArray(v)) v.forEach((c) => walk(c, n, k))
      else if (v && typeof v.type === 'string') walk(v, n, k)
    }
  }

  walk(node, null, null)
  return used
}

// ── разбор main.js
function analyzeMain() {
  const { src, ast } = parse(MAIN)
  const lines = src.split(/\r?\n/)
  const decls = []
  const imports = [] // { source, bindings:Set, start, end }

  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      const bindings = new Set()
      for (const sp of node.specifiers) bindings.add(sp.local.name)
      imports.push({ source: node.source.value, bindings, start: node.start, end: node.end })
      continue
    }
    let name = null
    if (node.type === 'FunctionDeclaration') name = node.id.name
    else if (node.type === 'ClassDeclaration') name = node.id.name
    else if (node.type === 'VariableDeclaration') {
      if (node.declarations.length !== 1) throw new Error('Мульти-декларация на верхнем уровне — скрипт не поддерживает')
      if (node.declarations[0].id.type !== 'Identifier') continue
      name = node.declarations[0].id.name
    }
    if (!name) continue

    // комментарий непосредственно над объявлением
    let first = node.loc.start.line
    for (let i = node.loc.start.line - 1; i >= 1; i--) {
      const t = lines[i - 1].trim()
      if (t === '') continue
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.endsWith('*/')) {
        first = i
        continue
      }
      break
    }
    decls.push({
      name,
      kind: node.type === 'FunctionDeclaration' ? 'function' : node.type === 'VariableDeclaration' ? node.kind : 'class',
      start: node.start,
      end: node.end,
      lineStart: node.loc.start.line,
      lineEnd: node.loc.end.line,
      commentFrom: first,
      node,
    })
  }
  return { src, lines, decls, imports }
}

// ── конфиги модулей
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/split/modules.json'), 'utf8'))

function readLedger() {
  try {
    return JSON.parse(fs.readFileSync(LEDGER, 'utf8'))
  } catch {
    return { modules: {}, names: {} }
  }
}

function writeLedger(l) {
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 1))
}

const main0 = analyzeMain()
const ledger = readLedger()

if (!MODULE_KEY) {
  console.log('Модули в конфиге:')
  for (const [k, v] of Object.entries(CONFIG)) {
    console.log(`  ${k.padEnd(14)} ${v.file.padEnd(34)} имён: ${v.names.length}`)
  }
  process.exit(0)
}

const cfg = CONFIG[MODULE_KEY]
if (!cfg) throw new Error(`Нет модуля ${MODULE_KEY} в scripts/split/modules.json`)

const byName = new Map(main0.decls.map((d) => [d.name, d]))
const missing = cfg.names.filter((n) => !byName.has(n))
if (missing.length) throw new Error(`Этих имён нет в main.js: ${missing.join(', ')}`)

const alreadyMoved = cfg.names.filter((n) => ledger.names[n])
if (alreadyMoved.length) throw new Error(`Уже вынесены: ${alreadyMoved.join(', ')}`)

// ── что нужно модулю извне
const localSet = new Set(cfg.names)
const inject = cfg.inject || {} // имя -> имя сеттера
const needFromModules = new Map() // module file -> Set(names)
const needFromLib = new Map() // source -> Set(names)
const unresolved = new Map() // name -> [decls внутри модуля, где встретилось]

for (const name of cfg.names) {
  const d = byName.get(name)
  for (const used of freeNames(d.node)) {
    if (localSet.has(used) || GLOBALS.has(used) || inject[used]) continue
    const owner = ledger.names[used]
    if (owner) {
      if (!needFromModules.has(owner)) needFromModules.set(owner, new Set())
      needFromModules.get(owner).add(used)
      continue
    }
    const lib = main0.imports.find((im) => im.bindings.has(used))
    if (lib) {
      if (!needFromLib.has(lib.source)) needFromLib.set(lib.source, new Set())
      needFromLib.get(lib.source).add(used)
      continue
    }
    if (!unresolved.has(used)) unresolved.set(used, new Set())
    unresolved.get(used).add(name)
  }
}

if (unresolved.size) {
  console.error(`\n❌ Нельзя вынести ${MODULE_KEY}: эти имена остаются в main.js`)
  for (const [n, who] of unresolved) console.error(`   ${n}  ← используется в: ${[...who].join(', ')}`)
  console.error('\nСначала вынеси их в отдельный модуль (или в bridge.js), потом повтори.')
  process.exit(1)
}

// ── собираем текст модуля
// Импорты в main.js записаны относительно src/ — из нового файла глубины другие,
// поэтому путь пересчитывается от директории модуля.
const moduleDir = path.posix.dirname(cfg.file)
function relImport(fromLibSource) {
  const target = fromLibSource.replace(/^\.\//, '') // 'lib/security.js'
  let rel = path.posix.relative(moduleDir, target)
  if (!rel.startsWith('.')) rel = './' + rel
  return rel
}

const internal = new Set(cfg.internal || [])

const parts = []
parts.push(cfg.header || `// ${cfg.file}`)
parts.push('')

for (const [src, names] of needFromModules) parts.push(`import { ${[...names].sort().join(', ')} } from '${src}'`)
for (const [src, names] of needFromLib) parts.push(`import { ${[...names].sort().join(', ')} } from '${relImport(src)}'`)
if (needFromModules.size || needFromLib.size) parts.push('')

// внедряемые снаружи функции: let renderImpl = null; export function setRenderFn(fn) { renderImpl = fn }
for (const [name, setter] of Object.entries(inject)) {
  parts.push(`// ${name}() остаётся в main.js — внедряется снаружи, чтобы не было циклического импорта.`)
  parts.push(`let ${name}Impl = null`)
  parts.push(`export function ${setter}(fn) {`)
  parts.push(`  ${name}Impl = fn`)
  parts.push(`}`)
  parts.push('')
}

for (const name of cfg.names) {
  const d = byName.get(name)
  const text = main0.lines.slice(d.commentFrom - 1, d.lineEnd).join('\n')
  if (internal.has(name)) {
    parts.push(text) // внутренняя переменная модуля, наружу не нужна
    parts.push('')
    continue
  }
  const withExport = text.replace(
    new RegExp(`^(\\s*)(async\\s+)?function\\s+${name}\\b`, 'm'),
    (m, ws, a) => `${ws}export ${a || ''}function ${name}`
  )
  if (withExport !== text) parts.push(withExport)
  else if (d.kind === 'let' || d.kind === 'var') parts.push(text.replace(/^(let|var)\s/m, 'export let '))
  else if (d.kind === 'const') parts.push(text.replace(/^const\s/m, 'export const '))
  else if (d.kind === 'class') parts.push(text.replace(/^class\s/m, 'export class '))
  else throw new Error('Не понял, как экспортировать ' + name)
  parts.push('')
}

const moduleText = parts.join('\n').replace(/\n{3,}/g, '\n\n')

// ── заменяем внедрённые имена на локальные (render → renderImpl) строго по AST,
// иначе regex заденет строки и похожие имена вроде renderSchedule.
function renameInjected(text, injectMap) {
  const keys = Object.keys(injectMap)
  if (!keys.length) return text
  const ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module', locations: false })
  const edits = []
  const declared = new Set()
  for (const n of ast.body) {
    if (n.type === 'FunctionDeclaration') declared.add(n.id.name)
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (d.id.type === 'Identifier') declared.add(d.id.name)
  }
  function walk(n, parent, key) {
    if (!n || typeof n.type !== 'string') return
    const isPropertyName =
      parent &&
      ((parent.type === 'MemberExpression' && key === 'property' && !parent.computed) ||
        (parent.type === 'Property' && key === 'key' && !parent.computed && !parent.shorthand) ||
        (parent.type === 'ImportSpecifier' && key === 'imported') ||
        (parent.type === 'ExportSpecifier' && key === 'exported'))
    if (n.type === 'Identifier' && !isPropertyName && keys.includes(n.name) && !declared.has(n.name)) {
      edits.push({ start: n.start, end: n.end, name: n.name })
    }
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue
      const v = n[k]
      if (Array.isArray(v)) v.forEach((c) => walk(c, n, k))
      else if (v && typeof v.type === 'string') walk(v, n, k)
    }
  }
  walk(ast, null, null)
  let out = text
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.name + 'Impl' + out.slice(e.end)
  }
  return out
}

const moduleTextFinal = renameInjected(moduleText, inject)

// ── проверяем готовый текст модуля: все свободные имена покрыты
{
  const ast = acorn.parse(moduleTextFinal, { ecmaVersion: 'latest', sourceType: 'module' })
  const declared = new Set()
  const unwrap = (n) =>
    n.type === 'ExportNamedDeclaration' || n.type === 'ExportDefaultDeclaration' ? n.declaration || n : n

  for (const raw of ast.body) {
    const n = unwrap(raw)
    if (!n) continue
    if (n.type === 'FunctionDeclaration' && n.id) declared.add(n.id.name)
    if (n.type === 'ClassDeclaration' && n.id) declared.add(n.id.name)
    if (n.type === 'VariableDeclaration')
      for (const d of n.declarations) if (d.id.type === 'Identifier') declared.add(d.id.name)
    if (raw.type === 'ImportDeclaration') for (const sp of raw.specifiers) declared.add(sp.local.name)
  }

  const bad = new Set()
  for (const raw of ast.body) {
    if (raw.type === 'ImportDeclaration') continue
    const n = unwrap(raw)
    if (!n) continue
    for (const used of freeNames(n)) {
      if (!declared.has(used) && !GLOBALS.has(used)) bad.add(used)
    }
  }
  if (bad.size) {
    console.error(`\n❌ В модуле остались неизвестные имена: ${[...bad].join(', ')}`)
    process.exit(1)
  }
}

const moduleLines = moduleTextFinal.split('\n').length
console.log(`\n=== ${MODULE_KEY} → src/${cfg.file}`)
console.log(`объявлений: ${cfg.names.length}, строк: ${moduleLines}`)
console.log(`импорты из lib:     ${[...needFromLib].map(([s, n]) => `${s} (${[...n].join(', ')})`).join('; ') || '—'}`)
console.log(`импорты из модулей: ${[...needFromModules].map(([s, n]) => `${s} (${[...n].join(', ')})`).join('; ') || '—'}`)
console.log(`внедряется снаружи: ${Object.keys(inject).join(', ') || '—'}`)

if (DRY) {
  fs.writeFileSync(path.join(ROOT, `scripts/split/preview-${MODULE_KEY}.js`), moduleTextFinal)
  console.log(`\n--dry: текст записан в scripts/split/preview-${MODULE_KEY}.js, main.js не тронут`)
  process.exit(0)
}

// ── пишем модуль
const outFile = path.join(ROOT, 'src', cfg.file)
fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, moduleTextFinal)

// ── вырезаем из main.js по номерам строк (от конца к началу, чтобы не сбить нумерацию)
const toCut = cfg.names.map((n) => byName.get(n)).sort((a, b) => b.commentFrom - a.commentFrom)
const srcLines = [...main0.lines]
for (const d of toCut) {
  // съедаем и пустую строку после объявления, чтобы не копились двойные пропуски
  let to = d.lineEnd
  if (srcLines[to] !== undefined && srcLines[to].trim() === '') to++
  srcLines.splice(d.commentFrom - 1, to - d.commentFrom + 1)
}
const newMain = srcLines.join('\n').replace(/\n{3,}/g, '\n\n')

// ── импорт + подключение внедрённых функций
const exportedNames = cfg.names.filter((n) => !internal.has(n)).slice().sort()
const importLine =
  `import { ${exportedNames.join(', ')}` +
  `${Object.values(inject).length ? ', ' + Object.values(inject).sort().join(', ') : ''} } from './${cfg.file}'`

const injectLines = Object.entries(inject)
  .map(([name, setter]) => `${setter}(${name})`)
  .join('\n')

const ast2 = acorn.parse(newMain, { ecmaVersion: 'latest', sourceType: 'module' })
const lastImportEnd = ast2.body.filter((n) => n.type === 'ImportDeclaration').pop().end
const finalMain =
  newMain.slice(0, lastImportEnd) +
  '\n' +
  importLine +
  (injectLines ? '\n\n// Внедряем функции из main.js в вынесенный модуль\n' + injectLines : '') +
  newMain.slice(lastImportEnd)

fs.writeFileSync(MAIN, finalMain)

// ── ledger
ledger.modules[MODULE_KEY] = cfg.file
for (const n of cfg.names) ledger.names[n] = `./${cfg.file}`
writeLedger(ledger)

console.log(`\n✅ Готово. main.js: ${finalMain.split('\n').length} строк (было ${main0.lines.length})`)

