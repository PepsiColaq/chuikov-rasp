import { supabase, supabaseConfigured, rpcErrorMessage } from './supabase.js'
import { getSession } from './store.js'

function parseJson(data) {
  let payload = data
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      payload = null
    }
  }
  if (Array.isArray(payload) && payload.length === 1 && !payload[0]?.id && !payload[0]?.studentId) {
    payload = payload[0]
  }
  return payload
}

async function rpc(name, args) {
  if (!supabaseConfigured || !supabase) throw new Error('Нет связи с сервером')
  const session = getSession()
  if (!session?.token) throw new Error('Сначала войди')
  const { data, error } = await supabase.rpc(name, args)
  if (error) {
    let msg = rpcErrorMessage(error)
    if (/админ-код/i.test(msg)) msg = 'Такой код уже используется'
    throw new Error(msg)
  }
  return parseJson(data)
}

export function canGradeGroup(session, groupId) {
  if (!session || !groupId) return false
  if (session.role === 'admin') return true
  if (session.role !== 'starosta') return false
  if (session.allGroups) return true
  return session.groupId === groupId
}

export async function listStudents(groupId) {
  const session = getSession()
  const rows = await rpc('rasp_list_students', {
    p_token: session.token,
    p_group_id: groupId,
  })
  return Array.isArray(rows) ? rows : []
}

export async function addStudent(groupId, fullName) {
  const session = getSession()
  return rpc('rasp_add_student', {
    p_token: session.token,
    p_group_id: groupId,
    p_full_name: fullName,
  })
}

export async function setStudentCode(studentId, code) {
  const session = getSession()
  return rpc('rasp_set_student_code', {
    p_token: session.token,
    p_student_id: studentId,
    p_code: code,
  })
}

export async function setOwnStudentCode(code) {
  const session = getSession()
  return rpc('rasp_student_set_own_code', {
    p_token: session.token,
    p_code: code,
  })
}

export async function listJournalMarks(groupId, dateStr) {
  const session = getSession()
  const rows = await rpc('rasp_journal_marks', {
    p_token: session.token,
    p_group_id: groupId,
    p_date: dateStr,
  })
  return Array.isArray(rows) ? rows : []
}

export async function upsertMark(row) {
  const session = getSession()
  return rpc('rasp_upsert_mark', {
    p_token: session.token,
    p_student_id: row.studentId,
    p_date: row.date,
    p_lesson_id: row.lessonId || '',
    p_start: row.start,
    p_end: row.end,
    p_subject: row.subject,
    p_attendance: row.attendance || 'present',
    p_grade: row.grade == null || row.grade === '' ? 0 : Number(row.grade),
    p_comment: row.comment || '',
  })
}

export async function listMyMarks() {
  const session = getSession()
  const rows = await rpc('rasp_my_marks', { p_token: session.token })
  return Array.isArray(rows) ? rows : []
}

export function newStudentCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const buf = new Uint8Array(10)
  crypto.getRandomValues(buf)
  let out = ''
  for (const b of buf) out += alphabet[b % alphabet.length]
  return out
}

const ATT_SHORT = {
  present: '+',
  absent: 'н',
  sick: 'б',
  duty: 'наряд',
  event: 'мп',
  excused: 'отп',
}

export function attendanceShort(att) {
  return ATT_SHORT[att] || ''
}

/** Текст расхода, как на сайте посещаемости: без оценок. */
export function buildJournalReport(groupName, people) {
  const onList = people.length
  const event = people.filter((p) => p.attendance === 'event')
  const duty = people.filter((p) => p.attendance === 'duty')
  const absent = people.filter((p) =>
    ['absent', 'sick', 'excused'].includes(p.attendance),
  )
  const present = people.filter((p) => p.attendance === 'present')
  const unmarked = people.filter((p) => !p.attendance)
  const lines = [`Расход группы ${groupName}:`, `По списку: ${onList}`, `На лицо: ${present.length}`]
  if (unmarked.length) lines.push(`Не отмечены: ${unmarked.length}`)
  if (absent.length) {
    lines.push(`Отсутствуют: ${absent.length}`)
    for (const p of absent) {
      const reason = (p.comment || '').trim()
      const tag = p.attendance === 'sick' ? 'б' : p.attendance === 'excused' ? 'отп' : 'н'
      lines.push(reason ? `${p.surname} (${tag}, ${reason})` : `${p.surname} (${tag})`)
    }
  } else {
    lines.push('Отсутствуют: 0')
  }
  lines.push('', `Мероприятие: ${event.length}`)
  for (const p of event) lines.push(p.surname)
  lines.push('', `Наряд: ${duty.length}`)
  for (const p of duty) lines.push(p.surname)
  return lines.join('\n').trimEnd()
}
