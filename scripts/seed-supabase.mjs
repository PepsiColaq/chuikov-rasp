/**
 * Upload schedule + code hashes into Supabase.
 * Usage:
 *   set SUPABASE_URL=...
 *   set SUPABASE_SERVICE_ROLE_KEY=...
 *   node scripts/seed-supabase.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars')
  process.exit(1)
}

const schedule = JSON.parse(readFileSync(join(root, 'src/data/schedule.json'), 'utf8'))
const hashes = JSON.parse(readFileSync(join(root, 'src/data/code-hashes.json'), 'utf8'))

function groupIdFromName(name) {
  return `g_${name.replace(/[^a-zA-Z0-9а-яА-ЯёЁ]+/gi, '_').toLowerCase()}`
}

function facultyFromName(name) {
  const n = name.toUpperCase()
  if (n.includes('ПД')) return 'ПД'
  if (n.includes('ПСА')) return 'ПСА'
  if (n.includes('ПСО')) return 'ПСО'
  if (n.includes('ЭБАС')) return 'ЭБАС'
  if (n.includes('ИБАС')) return 'ИБАС'
  if (n.includes('-Ю') || n.includes('Ю-')) return 'Ю'
  return ''
}

function lessonId(groupId, l, i) {
  const sub = String(l.subject || '')
    .replace(/[^a-zA-Z0-9а-яА-ЯёЁ]+/gi, '_')
    .slice(0, 40)
  return `${groupId}_${l.day}_${String(l.start).replace(':', '')}_${i}_${sub}`.slice(0, 120)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

const groups = schedule.groups.map((name) => ({
  id: groupIdFromName(name),
  name,
  faculty: facultyFromName(name),
  active: true,
  starosta_code_hash: hashes.groups[name],
}))

const lessons = []
for (const name of schedule.groups) {
  const gid = groupIdFromName(name)
  const rows = schedule.lessons[name] || []
  rows.forEach((l, i) => {
    lessons.push({
      id: lessonId(gid, l, i),
      group_id: gid,
      day: l.day,
      start_time: l.start,
      end_time: l.end,
      subject: l.subject,
      teacher: l.teacher || '',
      room: l.room || '',
      remote: !!l.remote,
      week_type: l.weekType || 'every',
      pair: l.pair || null,
    })
  })
}

console.log('Upserting app_meta…')
{
  const { error } = await sb.from('app_meta').upsert({
    id: 'main',
    admin_code_hash: hashes.admin,
    semester_label: schedule.semesterLabel,
  })
  if (error) throw error
}

console.log(`Upserting ${groups.length} groups…`)
{
  const { error } = await sb.from('groups').upsert(groups)
  if (error) throw error
}

console.log('Clearing old lessons…')
{
  const { error } = await sb.from('lessons').delete().neq('id', '')
  if (error) throw error
}

console.log(`Inserting ${lessons.length} lessons…`)
const chunk = 200
for (let i = 0; i < lessons.length; i += chunk) {
  const slice = lessons.slice(i, i + chunk)
  const { error } = await sb.from('lessons').insert(slice)
  if (error) throw error
  console.log(`  ${Math.min(i + chunk, lessons.length)}/${lessons.length}`)
}

console.log('Done.')
