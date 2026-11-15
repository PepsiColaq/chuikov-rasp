// 1) Находит «склейки» — top-level код между объявлениями (то, что нельзя унести в модуль).
// 2) Для каждого top-level let/const находит, в каких объявлениях ему присваивают значение.
import fs from 'node:fs'
import * as acorn from 'acorn'

const src = fs.readFileSync('./src/main.js', 'utf8')
const lines = src.split(/\r?\n/)
const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true })

const decls = []
for (const node of ast.body) {
  const name =
    node.type === 'FunctionDeclaration'
      ? node.id.name
      : node.type === 'VariableDeclaration'
        ? node.declarations.map((d) => (d.id.type === 'Identifier' ? d.id.name : '?')).join(',')
        : '__stmt'
  decls.push({ name, type: node.type, start: node.start, lineStart: node.loc.start.line, lineEnd: node.loc.end.line, node })
}

// ---- gaps: строки между объявлениями (и до первого, и после последнего)
const gaps = []
let prevEnd = 0
for (const d of decls) {
  if (d.lineStart > prevEnd + 1) {
    gaps.push({ from: prevEnd + 1, to: d.lineStart - 1 })
  }
  prevEnd = d.lineEnd
}
if (prevEnd < lines.length) gaps.push({ from: prevEnd + 1, to: lines.length })

console.log('# GAPS (top-level glue code)')
for (const g of gaps) {
  const text = lines.slice(g.from - 1, g.to).join('\n')
  const nonEmpty = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  const kind = nonEmpty.length === 0 ? 'только комментарии/пусто' : 'КОД: ' + nonEmpty.length + ' строк'
  console.log(`${g.from}-${g.to}  (${g.to - g.from + 1} строк) ${kind}`)
  if (nonEmpty.length && nonEmpty.length <= 40) console.log(nonEmpty.slice(0, 40).map((l) => '    | ' + l).join('\n'))
}

// ---- reassignments
function walk(node, fn, parent) {
  if (!node || typeof node.type !== 'string') return
  fn(node, parent)
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue
    const v = node[k]
    if (Array.isArray(v)) v.forEach((c) => walk(c, fn, node))
    else if (v && typeof v.type === 'string') walk(v, fn, node)
  }
}

const mutableTop = []
for (const node of ast.body) {
  if (node.type !== 'VariableDeclaration' || node.kind !== 'let') continue
  for (const d of node.declarations) if (d.id.type === 'Identifier') mutableTop.push(d.id.name)
}

// какие объявления присваивают mutableTop-переменным
const assigns = new Map() // varName -> Set(declName)
const declOfLine = (line) => {
  for (const d of decls) if (line >= d.lineStart && line <= d.lineEnd) return d.name
  return '?'
}
walk(ast, (n) => {
  if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier' && mutableTop.includes(n.left.name)) {
    const d = declOfLine(n.loc.start.line)
    if (!assigns.has(n.left.name)) assigns.set(n.left.name, new Set())
    assigns.get(n.left.name).add(d)
  }
  if (n.type === 'UpdateExpression' && n.argument.type === 'Identifier' && mutableTop.includes(n.argument.name)) {
    const d = declOfLine(n.loc.start.line)
    if (!assigns.has(n.left?.name || n.argument.name)) assigns.set(n.argument.name, new Set())
    assigns.get(n.argument.name).add(d)
  }
})

console.log('\n# MUTABLE TOP-LEVEL (let) -> where reassigned')
for (const v of mutableTop) {
  const s = assigns.get(v)
  console.log(`${v}: ${s ? [...s].join(', ') : '(никогда не переприсваивается)'}`)
}

fs.writeFileSync('./scratch-gaps.json', JSON.stringify({ gaps, mutableTop, assigns: Object.fromEntries([...assigns].map(([k, v]) => [k, [...v]])) }, null, 1))
