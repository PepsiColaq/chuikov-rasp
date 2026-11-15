// Временный анализатор: разбирает src/main.js на top-level объявления и строит граф зависимостей.
import fs from 'node:fs'
import * as acorn from 'acorn'

const src = fs.readFileSync('./src/main.js', 'utf8')
const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true })

const decls = []
const imports = []

for (const node of ast.body) {
  if (node.type === 'ImportDeclaration') {
    imports.push({ start: node.loc.start.line, end: node.loc.end.line })
    continue
  }
  const push = (name, kind) =>
    decls.push({ name, kind, start: node.start, lineStart: node.loc.start.line, lineEnd: node.loc.end.line })
  if (node.type === 'FunctionDeclaration') push(node.id.name, 'function')
  else if (node.type === 'VariableDeclaration')
    for (const d of node.declarations) if (d.id.type === 'Identifier') push(d.id.name, node.kind)
  else if (node.type === 'ClassDeclaration') push(node.id.name, 'class')
  else push('__stmt' + node.start, 'stmt:' + node.type)
}

const globalNames = new Set(decls.map((d) => d.name))

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

const deps = new Map()
for (const d of decls) {
  const node = ast.body.find((n) => n.start === d.start)
  const inside = new Set()
  collect(node, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier') inside.add(n.id.name)
    if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ClassExpression') && n.id)
      inside.add(n.id.name)
    if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') {
      for (const p of n.params) {
        if (p.type === 'Identifier') inside.add(p.name)
        else if (p.type === 'AssignmentPattern' && p.left.type === 'Identifier') inside.add(p.left.name)
        else if (p.type === 'RestElement' && p.argument.type === 'Identifier') inside.add(p.argument.name)
        else if (p.type === 'ObjectPattern')
          p.properties.forEach((pr) => {
            if (pr.value && pr.value.type === 'Identifier') inside.add(pr.value.name)
          })
        else if (p.type === 'ArrayPattern')
          p.elements.forEach((e) => {
            if (e && e.type === 'Identifier') inside.add(e.name)
          })
      }
    }
    if (n.type === 'CatchClause' && n.param && n.param.type === 'Identifier') inside.add(n.param.name)
    if ((n.type === 'ForOfStatement' || n.type === 'ForInStatement') && n.left.type === 'VariableDeclaration')
      for (const dd of n.left.declarations) if (dd.id.type === 'Identifier') inside.add(dd.id.name)
  })

  const used = new Set()
  collect(node, (n) => {
    if (n.type === 'Identifier' && !inside.has(n.name)) used.add(n.name)
  })
  deps.set(
    d.name,
    [...used].filter((n) => globalNames.has(n) && n !== d.name)
  )
}

const out = []
out.push(`# top-level declarations: ${decls.length}`)
out.push(`# import ranges: ${imports.map((i) => i.start + '-' + i.end).join(', ')}`)
for (const d of decls) {
  if (d.name.startsWith('__stmt')) {
    out.push(`${String(d.lineStart).padStart(5)}-${String(d.lineEnd).padStart(5)}  [${d.kind}] lines:${d.lineEnd - d.lineStart + 1}`)
    continue
  }
  out.push(
    `${String(d.lineStart).padStart(5)}-${String(d.lineEnd).padStart(5)}  ${d.kind.padEnd(7)} ${d.name.padEnd(30)} lines:${String(
      d.lineEnd - d.lineStart + 1
    ).padStart(4)}  deps:${deps.get(d.name).length}`
  )
}
console.log(out.join('\n'))

const fanIn = new Map()
for (const [, v] of deps) for (const n of v) fanIn.set(n, (fanIn.get(n) || 0) + 1)
console.log('\n# fan-in:')
console.log(
  [...fanIn.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([n, c]) => `${n}: ${c}`)
    .join('\n')
)

fs.writeFileSync(
  './scratch-split-graph.json',
  JSON.stringify({ decls: decls.filter((d) => !d.name.startsWith('__stmt')), deps: Object.fromEntries(deps) }, null, 1)
)
