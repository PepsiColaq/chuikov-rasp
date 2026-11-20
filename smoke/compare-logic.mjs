// Проверка логики сравнения групп — без браузера, на реальном расписании.
//
// Запуск: node smoke/compare-logic.mjs
import fs from 'node:fs'
import {
  MIN_BREAK_MINUTES,
  compareDays,
  dayBlocks,
  minutesToHHMM,
  parseHHMM,
  planFormation,
} from '../src/lib/group-compare.js'

const sched = JSON.parse(fs.readFileSync('src/data/schedule.json', 'utf8'))

let failed = 0
const ok = (m) => console.log('✅ ' + m)
const bad = (m) => {
  console.log('❌ ' + m)
  failed++
}
const check = (cond, m) => (cond ? ok(m) : bad(m))

const lessonsOf = (name) =>
  (sched.lessons[name] || []).map((l) => ({
    start: l.start,
    end: l.end,
    subject: l.subject,
    room: l.room,
    remote: !!l.remote,
    cancelled: false,
  }))

const fmt = (m) => `${minutesToHHMM(m.start)}–${minutesToHHMM(m.end)}`

// ── 1. Время
check(parseHHMM('09:30') === 570, '09:30 → 570 минут')
check(parseHHMM('9:5') === null, 'кривое время → null')
check(minutesToHHMM(570) === '09:30', '570 → 09:30')
check(parseHHMM(minutesToHHMM(0)) === 0, 'полночь не теряется')

// ── 2. Построение
const p1 = lessonsOf('0901-ПД1').filter((l) => true)
const formation = planFormation(p1, { groupName: '0901-ПД1', faculties: ['ПД', 'МЧС'], lead: 15 })
check(formation.show === true, 'ПД: построение есть')
check(
  parseHHMM(formation.anchorStart) - parseHHMM(formation.formStart) === 15,
  `построение за 15 мин до первой очной пары (${formation.formStart} → ${formation.anchorStart})`,
)

const noFormation = planFormation(lessonsOf('0901-ЭБАС1'), {
  groupName: '0901-ЭБАС1',
  faculties: ['ПД', 'МЧС'],
  lead: 15,
})
check(noFormation.show === false, 'ЭБАС: построения нет (факультет не в списке)')

const allRemote = planFormation(
  [
    { start: '10:20', end: '11:30', remote: true },
    { start: '11:50', end: '13:00', remote: true },
  ],
  { groupName: '0901-ПД1', faculties: ['ПД'], lead: 15 },
)
check(allRemote.show === false, 'только дистант → построения нет (некого строить)')

// ── 3. Блоки дня
const blocksA = dayBlocks(p1, formation)
check(blocksA.length === p1.length + 1, 'блоки = пары + построение')
check(
  blocksA.every((b) => b.end > b.start),
  'у всех блоков конец позже начала',
)
const cancelledBlocks = dayBlocks(
  [{ start: '10:20', end: '11:30', cancelled: true }, { start: '11:50', end: '13:00' }],
  null,
)
check(cancelledBlocks.length === 1, 'отменённая пара не занимает время')

// ── 4. Сравнение двух групп ПД (построение у обеих)
const p2 = lessonsOf('0901-ПД2')
const formationB = planFormation(p2, { groupName: '0901-ПД2', faculties: ['ПД', 'МЧС'], lead: 15 })
const day = compareDays({ mine: { blocks: dayBlocks(p1, formation) }, other: { blocks: dayBlocks(p2, formationB) } })

check(!day.empty, 'день не пустой')
check(day.dayStart > 0 && day.dayEnd > day.dayStart, `учебный день ${minutesToHHMM(day.dayStart)}–${minutesToHHMM(day.dayEnd)}`)

// сегменты покрывают день без дыр
let covered = 0
for (let i = 0; i < day.segments.length; i++) {
  covered += day.segments[i].end - day.segments[i].start
  if (i) {
    check(day.segments[i].start === day.segments[i - 1].end, `сегмент ${i} стыкуется с предыдущим`)
  }
}
check(covered === day.dayEnd - day.dayStart, `сегменты покрывают день целиком (${covered} мин)`)

// все встречи лежат внутри дня и не накладываются
for (const m of day.meetings) {
  check(m.start >= day.dayStart && m.end <= day.dayEnd, `встреча ${fmt(m)} внутри дня`)
  check(m.end > m.start, `встреча ${fmt(m)} положительной длины`)
  check(m.minutes === m.end - m.start, `встреча ${fmt(m)}: длительность сходится`)
}
const sorted = day.meetings.every((m, i) => !i || m.start >= day.meetings[i - 1].end)
check(sorted, 'встречи не накладываются друг на друга')

check(day.counts.total === day.meetings.length, 'счётчик встреч совпадает со списком')
check(
  day.counts.total === day.counts.break + day.counts.formation + day.counts.room,
  'встречи только трёх нужных типов (перемена/построение/кабинет)',
)

// переменами считаются только окна длиннее порога
check(
  day.meetings.filter((m) => m.kind === 'break').every((m) => m.minutes >= MIN_BREAK_MINUTES),
  `короткие окна (< ${MIN_BREAK_MINUTES} мин) не выдаются за перемену`,
)

console.log('\nПример — 0901-ПД1 против 0901-ПД2:')
for (const m of day.meetings) {
  const label = m.kind === 'break' ? 'перемена' : m.kind === 'formation' ? 'построение' : `кабинет ${m.rooms.join('/')}`
  console.log(`   ${fmt(m)}  ${m.minutes} мин  ${label}`)
}

// ── 5. Дистант не считается встречей в колледже
const remoteDay = compareDays({
  mine: { blocks: dayBlocks([{ start: '10:20', end: '11:30', remote: true, subject: 'Ист' }], null) },
  other: { blocks: dayBlocks([{ start: '10:20', end: '11:30', remote: true, subject: 'Ист' }], null) },
})
check(
  remoteDay.meetings.length === 0,
  'двое дома на дистанте — это не встреча в колледже',
)

// ── 6. Один свободен, другой на паре → не встреча
const mixed = compareDays({
  mine: { blocks: dayBlocks([{ start: '10:20', end: '11:30' }], null) },
  other: { blocks: dayBlocks([{ start: '11:50', end: '13:00' }], null) },
})
check(mixed.meetings.length === 0, 'свободен только один — встречи нет')

// ── 7. Общая перемена находится
const freeA = compareDays({
  mine: { blocks: dayBlocks([{ start: '09:00', end: '10:10' }, { start: '11:50', end: '13:00' }], null) },
  other: { blocks: dayBlocks([{ start: '09:00', end: '10:10' }, { start: '11:50', end: '13:00' }], null) },
})
check(freeA.meetings.length === 1, 'одинаковое расписание → одна общая перемена')
check(freeA.meetings[0]?.minutes === 100, `перемена 10:10–11:50 = 100 мин (получено ${freeA.meetings[0]?.minutes})`)

// ── 8. Общий кабинет
const sameRoom = compareDays({
  mine: { blocks: dayBlocks([{ start: '10:20', end: '11:30', room: '210' }], null) },
  other: { blocks: dayBlocks([{ start: '10:20', end: '11:30', room: '210' }], null) },
})
check(sameRoom.counts.room === 1, 'одна пара в одном кабинете — найдена')
check(sameRoom.meetings[0]?.rooms?.[0] === '210', 'кабинет указан верно')

const diffRoom = compareDays({
  mine: { blocks: dayBlocks([{ start: '10:20', end: '11:30', room: '210' }], null) },
  other: { blocks: dayBlocks([{ start: '10:20', end: '11:30', room: '214' }], null) },
})
check(diffRoom.counts.room === 0, 'разные кабинеты — общей пары нет')

// ── 9. Пустой день
const empty = compareDays({ mine: { blocks: [] }, other: { blocks: [] } })
check(empty.empty === true && empty.meetings.length === 0, 'нет пар ни у кого → пустой день, без падения')

// ── 9б. Построение не съедает следующую пару
//
// Раньше соседние куски склеивались по одному только признаку «mixed»,
// поэтому «построение + свободен» сливалось с «пара + свободен», и строка
// 13:05–14:30 подписывалась «Построение» — пара «Русский язык» внутри неё
// становилась невидимой.
const fpViews = [{ start: '13:20', end: '14:30', subject: 'Русский язык', room: '413' }]
const formationThenPair = compareDays({
  mine: {
    blocks: dayBlocks(
      fpViews,
      planFormation(fpViews, { faculties: ['ПД'], groupName: '0901-ПД3', lead: 15 }),
    ),
  },
  other: { blocks: dayBlocks([], null) },
})
const fRow = formationThenPair.segments.find((s) => s.start === parseHHMM('13:05'))
const pRow = formationThenPair.segments.find((s) => s.start === parseHHMM('13:20'))
check(fRow?.kind === 'mixed' && fRow?.mine.state === 'formation', 'построение — отдельная строка')
check(fRow?.end === parseHHMM('13:20'), `построение кончается в 13:20 (${fRow ? minutesToHHMM(fRow.end) : '—'})`)
check(pRow?.mine.subject === 'Русский язык', `следующая строка — пара, а не «Построение» (${pRow?.mine.subject || '—'})`)

// ── 10. Все пары всех групп: логика не падает и не врёт
let worst = null
let totalMeetings = 0
for (const g1 of sched.groups) {
  const l1 = lessonsOf(g1)
  const f1 = planFormation(l1, { groupName: g1, faculties: ['ПД', 'МЧС'], lead: 15 })
  for (const g2 of sched.groups) {
    if (g1 === g2) continue
    const l2 = lessonsOf(g2)
    const f2 = planFormation(l2, { groupName: g2, faculties: ['ПД', 'МЧС'], lead: 15 })
    const d = compareDays({ mine: { blocks: dayBlocks(l1, f1) }, other: { blocks: dayBlocks(l2, f2) } })
    if (d.empty) continue
    totalMeetings += d.meetings.length
    for (const m of d.meetings) {
      if (m.start < d.dayStart || m.end > d.dayEnd || m.end <= m.start) worst = { g1, g2, m, d }
    }
  }
}
check(!worst, `все ${sched.groups.length} групп перебраны, странных встреч нет (всего ${totalMeetings})`)

console.log(failed ? `\n❌ ПРОВАЛЕНО: ${failed}` : '\n✅ ЛОГИКА СРАВНЕНИЯ В ПОРЯДКЕ')
process.exit(failed ? 1 : 0)
