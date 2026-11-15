// Для заданных диапазонов строк считает, какие top-level имена нужны «снаружи».
import fs from 'node:fs'

const g = JSON.parse(fs.readFileSync('./scratch-split-graph.json', 'utf8'))
const byName = new Map(g.decls.map((d) => [d.name, d]))

const CLUSTERS = {
  lightbox: [985, 1247, 1249, 1702, 990, 1011, 1013, 1022, 1025, 1056, 1058, 1064, 1067, 1094, 1101, 1223],
  gates: [8085, 8174],
  programs: [8247, 9186],
  audit: [5903, 6507],
  news: [9468, 10932],
  home: [9334, 9482],
  admin: [4626, 5894],
  teachers: [3208, 3669],
  schedule: [2042, 2737],
  more: [6531, 8083],
}

function namesInRange(from, to) {
  return g.decls.filter((d) => d.lineStart >= from && d.lineEnd <= to).map((d) => d.name)
}

for (const [label, pairs] of Object.entries(CLUSTERS)) {
  const names = new Set()
  for (let i = 0; i < pairs.length; i += 2) for (const n of namesInRange(pairs[i], pairs[i + 1])) names.add(n)
  const external = new Map()
  for (const n of names) {
    for (const dep of g.deps[n] || []) {
      if (names.has(dep)) continue
      external.set(dep, (external.get(dep) || 0) + 1)
    }
  }
  const totalLines = [...names].reduce((s, n) => {
    const d = byName.get(n)
    return s + (d ? d.lineEnd - d.lineStart + 1 : 0)
  }, 0)
  const sorted = [...external.entries()].sort((a, b) => b[1] - a[1])
  console.log(`\n### ${label}: ${names.size} объявлений, ${totalLines} строк`)
  console.log(`внешних зависимостей: ${sorted.length}`)
  console.log(sorted.map(([n, c]) => `${n}(${c})`).join(' '))
}
