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
    p_grade: 0,
    p_comment: row.comment || '',
  })
}

/* ── Оценки: несколько на одну пару ─────────────────────────────── */

export const GRADE_KINDS = [
  ['answer', 'ответ'],
  ['test', 'тест'],
  ['independent', 'самост.'],
  ['project', 'проект'],
  ['oral', 'устно'],
  ['other', 'другое'],
]

/** Все оценки пары: [{ id, studentId, value, kind, comment, author }] */
export async function listLessonGrades(groupId, date, start, end) {
  const session = getSession()
  const rows = await rpc('rasp_lesson_grades', {
    p_token: session.token,
    p_group_id: groupId,
    p_date: date,
    p_start: start,
    p_end: end,
  })
  return Array.isArray(rows) ? rows : []
}

export async function addGrade(row) {
  const session = getSession()
  return rpc('rasp_add_grade', {
    p_token: session.token,
    p_student_id: row.studentId,
    p_date: row.date,
    p_lesson_id: row.lessonId || '',
    p_start: row.start,
    p_end: row.end,
    p_subject: row.subject,
    p_value: Number(row.value),
    p_kind: row.kind || 'answer',
    p_comment: row.comment || '',
  })
}

export async function deleteGrade(gradeId) {
  const session = getSession()
  return rpc('rasp_delete_grade', {
    p_token: session.token,
    p_grade_id: gradeId,
  })
}

/* ── Построение: явка и отмена ──────────────────────────────────── */

/** { cancelled, note, canEdit, marks: [{ studentId, attendance, comment }] } */
export async function getFormationDay(groupId, date) {
  const session = getSession()
  if (!session?.token) return { cancelled: false, note: '', canEdit: false, marks: [] }
  const data = await rpc('rasp_formation_day', {
    p_token: session.token,
    p_group_id: groupId,
    p_date: date,
  })
  const payload = data || {}
  return {
    cancelled: payload.cancelled === true,
    note: payload.note || '',
    canEdit: payload.canEdit === true,
    marks: Array.isArray(payload.marks) ? payload.marks : [],
  }
}

export async function setFormationCancelled(groupId, date, cancelled, note = '') {
  const session = getSession()
  return rpc('rasp_set_formation_cancelled', {
    p_token: session.token,
    p_group_id: groupId,
    p_date: date,
    p_cancelled: !!cancelled,
    p_note: note || '',
  })
}

export async function setFormationMark(studentId, date, attendance, comment = '') {
  const session = getSession()
  return rpc('rasp_set_formation_mark', {
    p_token: session.token,
    p_student_id: studentId,
    p_date: date,
    p_attendance: attendance || '',
    p_comment: comment || '',
  })
}

export async function listMyMarks() {
  const session = getSession()
  const rows = await rpc('rasp_my_marks', { p_token: session.token })
  return Array.isArray(rows) ? rows : []
}

/* ── Роли и дополнительные админы ──────────────────────────────── */

/** Поставить роль студенту: 'student' | 'starosta' | 'teacher'. */
export async function setStudentRole(studentId, role) {
  const session = getSession()
  return rpc('rasp_set_student_role', {
    p_token: session.token,
    p_student_id: studentId,
    p_role: role,
  })
}

/** { main: 'Имя', extra: [{ id, label, code, active, createdAt }] } */
export async function listAdmins() {
  const session = getSession()
  const data = await rpc('rasp_list_admins', { p_token: session.token })
  const payload = data || {}
  return {
    main: payload.main || 'Админ',
    extra: Array.isArray(payload.extra) ? payload.extra : [],
  }
}

export async function addAdmin(code, label) {
  const session = getSession()
  return rpc('rasp_add_admin', {
    p_token: session.token,
    p_code: code,
    p_label: label,
  })
}

export async function revokeAdmin(adminId) {
  const session = getSession()
  return rpc('rasp_revoke_admin', {
    p_token: session.token,
    p_admin_id: adminId,
  })
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
