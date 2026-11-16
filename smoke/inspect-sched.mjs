import fs from 'node:fs'

const s = JSON.parse(fs.readFileSync('src/data/schedule.json', 'utf8'))
const types = new Map()
const rooms = new Map()
let remoteCount = 0
let total = 0
for (const [g, list] of Object.entries(s.lessons)) {
  for (const l of list) {
    total++
    types.set(l.weekType, (types.get(l.weekType) || 0) + 1)
    if (l.remote) remoteCount++
    const r = String(l.room || '').trim()
    if (r) rooms.set(r, (rooms.get(r) || 0) + 1)
  }
}
console.log('всего пар:', total, 'дистант:', remoteCount)
console.log('weekType:', [...types.entries()])
console.log('кабинеты (топ 15):', [...rooms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15))
console.log('пустых кабинетов:', [...rooms.entries()].filter(([r]) => !r).length)

// сколько пар у двух случайных групп совпадают по времени
const g1 = '0901-ПД1'
const g2 = '0901-ПД2'
const l1 = s.lessons[g1] || []
const l2 = s.lessons[g2] || []
console.log(`\n${g1}: ${l1.length} пар, ${g2}: ${l2.length} пар`)
const t = (x) => x.start
const set2 = new Set(l2.map((x) => x.day + '|' + t(x)))
const same = l1.filter((x) => set2.has(x.day + '|' + t(x)))
console.log('совпадают по дню и времени:', same.length)
