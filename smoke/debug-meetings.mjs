// Проверка ОДНОГО дня (понедельник) — как считает экран, а не как считал мой
// прошлый отладочный скрипт (он ошибочно смешивал все дни в один).
import fs from 'node:fs'
import { compareDays, dayBlocks, minutesToHHMM, planFormation, scheduleRows } from '../src/lib/group-compare.js'

const s = JSON.parse(fs.readFileSync('src/data/schedule.json', 'utf8'))
const DAY = 1 // понедельник

const monday = (n) =>
  (s.lessons[n] || [])
    .filter((l) => l.day === DAY)
    .map((l) => ({ start: l.start, end: l.end, subject: l.subject, room: l.room, remote: !!l.remote, cancelled: false }))

const f = (m) => `${minutesToHHMM(m.start)}–${minutesToHHMM(m.end)}`
const a = '0901-ПД3'
const b = '0903-ПД1'

const va = monday(a)
const vb = monday(b)
console.log(`${a} в понедельник: ${va.length} пар`)
for (const l of va) console.log(`   ${l.start}-${l.end} ${l.subject} · ${l.room}`)
console.log(`${b} в понедельник: ${vb.length} пар`)
for (const l of vb) console.log(`   ${l.start}-${l.end} ${l.subject} · ${l.room}`)

const fa = planFormation(va, { groupName: a, faculties: ['ПД', 'МЧС'], lead: 15 })
const fb = planFormation(vb, { groupName: b, faculties: ['ПД', 'МЧС'], lead: 15 })
const d = compareDays({ mine: { blocks: dayBlocks(va, fa) }, other: { blocks: dayBlocks(vb, fb) } })

console.log('\nсегменты:')
for (const x of d.segments) console.log(`  ${f(x)} ${x.kind} inside=${x.inside}`)
console.log('\nвстречи:', d.counts)
for (const m of d.meetings) console.log(`  ${f(m)} ${m.kind} ${m.minutes}`)

console.log('\nстроки таблицы (★ = подсвечена как встреча):')
for (const x of scheduleRows(d)) {
  const star = x.kind === 'break' || x.kind === 'formation' || x.kind === 'room' ? '★' : ' '
  console.log(`  ${star} ${f(x)} ${x.kind}`)
}

console.log('\nПРОБЛЕМА, если строк со ★ больше, чем встреч в списке:',
  scheduleRows(d).filter((x) => ['break', 'formation', 'room'].includes(x.kind)).length,
  'vs', d.meetings.length)
