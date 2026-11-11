import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const env = Object.fromEntries(
  readFileSync(join(process.cwd(), '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1)]
    }),
)

const base = (env.SUPABASE_URL || env.VITE_SUPABASE_DIRECT_URL || '').replace(/\/$/, '')
const anon = env.VITE_SUPABASE_ANON_KEY
const key = env.SUPABASE_SERVICE_ROLE_KEY
const h = (k) => ({
  'User-Agent': 'chuikov-fix/1.0',
  apikey: k,
  Authorization: `Bearer ${k}`,
})

async function attempt(fn, n = 6) {
  let last
  for (let i = 1; i <= n; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      await new Promise((r) => setTimeout(r, 350 * i * i))
    }
  }
  throw last
}

async function rest(path, useKey = anon) {
  return attempt(async () => {
    const r = await fetch(base + path, { headers: h(useKey) })
    const t = await r.text()
    return { status: r.status, text: t, json: () => { try { return JSON.parse(t) } catch { return null } } }
  })
}

const codes = await rest('/rest/v1/group_codes?select=id,group_id,label,active,created_at&active=eq.true&order=created_at.asc')
console.log('CODES', codes.status)
console.log(JSON.stringify(codes.json(), null, 2))

const hw = await rest(
  '/rest/v1/homework?select=id,group_id,subject,body,due_date,author_label,author_code_id,author_avatar_url,created_at&order=created_at.desc&limit=40',
)
console.log('\nHW', hw.status)
const rows = hw.json() || []
for (const r of rows) {
  console.log(
    [
      (r.due_date || '').slice(0, 10),
      (r.created_at || '').slice(0, 10),
      (r.subject || '').slice(0, 40),
      'label=' + JSON.stringify(r.author_label),
      'code=' + JSON.stringify(r.author_code_id),
      (r.body || '').replace(/\s+/g, ' ').slice(0, 60),
    ].join(' | '),
  )
}

const fire = rows.filter(
  (r) =>
    /огне/i.test(r.subject || '') ||
    /распечат|конспект|тг/i.test(r.body || '') ||
    r.due_date === '2026-09-30' ||
    (r.created_at || '').startsWith('2026-09-30'),
)
console.log('\nFIRE/MATCH', JSON.stringify(fire, null, 2))
