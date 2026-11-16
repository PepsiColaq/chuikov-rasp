// Что реально видно на экране сравнения — по данным, а не по коду.
import fs from 'node:fs'
import { compareDays, dayBlocks, minutesToHHMM, planFormation } from '../src/lib/group-compare.js'

const sched = JSON.parse(fs.readFileSync('src/data/schedule.json', 'utf8'))
const lessonsOf = (n) =>
  (sched.lessons[n] || []).map((l) => ({
    start: l.start, end: l.end, subject: l.subject, room: l.room, remote: !!l.remote, cancelled: false,
  }))
const fmt = (m) => `${minutesToHHMM(m.start)}–${minutesToHHMM(m.end)}`

const a = '0901-ПД3'
const b = '0903-ПД1'
const fa = planFormation(lessonsOf(a), { groupName: a, faculties: ['ПД', 'МЧС'], lead: 15 })
const fb = planFormation(lessonsOf(b), { groupName: b, faculties: ['ПД', 'МЧС'], lead: 15 })
const d = compareDays({ mine: { blocks: dayBlocks(lessonsOf(a), fa) }, other: { blocks: dayBlocks(lessonsOf(b), fb) } })

console.log(`=== ${a} vs ${b} ===`)
console.log('Что сейчас выводится в «Кто где»:')
for (const s of d.segments) {
  const rooms = s.rooms.length ? ` · каб. ${s.rooms.join('/')}` : ''
  console.log(`  ${fmt(s)}  ${s.a} / ${s.b}${rooms}`)
}

console.log('\nЧто есть в данных, но НЕ выводится:')
for (const s of d.segments.slice(0, 6)) {
  console.log(`  ${fmt(s)} — у сегмента нет своих кабинетов и предметов каждой группы`)
}

console.log('\nСырые пары (что можно показать):')
for (const l of lessonsOf(a).slice(0, 5)) console.log(`  ${a}: ${l.start}-${l.end} ${l.subject} · ${l.room}`)
for (const l of lessonsOf(b).slice(0, 5)) console.log(`  ${b}: ${l.start}-${l.end} ${l.subject} · ${l.room}`)

console.log('\nВстречи:')
for (const m of d.meetings) console.log(`  ${fmt(m)} ${m.minutes} мин ${m.kind} ${m.rooms.join('/')}`)
