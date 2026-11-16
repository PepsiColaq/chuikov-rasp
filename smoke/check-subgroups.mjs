// Перепроверка: есть ли у групп несколько пар в один слот (подгруппы).
import fs from 'node:fs'
const s = JSON.parse(fs.readFileSync('src/data/schedule.json', 'utf8'))

let groupsWithParallel = 0
let maxParallel = 0
const samples = []
for (const [g, list] of Object.entries(s.lessons)) {
  const bySlot = new Map()
  for (const l of list) {
    const k = l.day + '|' + l.start
    if (!bySlot.has(k)) bySlot.set(k, [])
    bySlot.get(k).push(l)
  }
  let hit = 0
  for (const [k, arr] of bySlot) {
    if (arr.length > 1) {
      hit++
      if (arr.length > maxParallel) maxParallel = arr.length
    }
  }
  if (hit) {
    groupsWithParallel++
    if (samples.length < 5) {
      const firstParallel = [...bySlot.entries()].find(([, arr]) => arr.length > 1)
      samples.push({
        group: g,
        slot: firstParallel[0],
        items: firstParallel[1].map((x) => `${x.subject} (${x.room})${x.remote ? ' дистант' : ''}`),
      })
    }
  }
}

console.log('групп с параллельными парами:', groupsWithParallel, 'из', Object.keys(s.lessons).length)
console.log('максимум пар в один слот:', maxParallel)
for (const x of samples) {
  console.log(`\n${x.group}  слот ${x.slot}:`)
  for (const i of x.items) console.log('   ' + i)
}

// сколько всего таких слотов
let total = 0
for (const list of Object.values(s.lessons)) {
  const bySlot = new Map()
  for (const l of list) {
    const k = l.day + '|' + l.start
    bySlot.set(k, (bySlot.get(k) || 0) + 1)
  }
  for (const n of bySlot.values()) if (n > 1) total++
}
console.log('\nвсего слотов с параллельными парами:', total)
