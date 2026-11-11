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

const base = (env.SUPABASE_URL || '').replace(/\/$/, '')
const anon = env.VITE_SUPABASE_ANON_KEY

async function attempt(fn, n = 8) {
  let last
  for (let i = 1; i <= n; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      await new Promise((r) => setTimeout(r, 250 * i * i))
    }
  }
  throw last
}

async function get(path) {
  return attempt(async () => {
    const r = await fetch(base + path, {
      headers: {
        'User-Agent': 'chuikov-restore/1.0',
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
    })
    const text = await r.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}
    return { status: r.status, text, json }
  })
}

const hw = await get(
  "/rest/v1/homework?select=*&subject=ilike.*Информатика*&order=created_at.desc&limit=20",
)
console.log('live informatics', hw.status)
console.log(JSON.stringify(hw.json, null, 2)?.slice(0, 4000))

const audit = await get(
  "/rest/v1/audit_log?select=*&or=(action.eq.homework_delete,action.eq.homework_add)&order=at.desc&limit=30",
)
console.log('\naudit', audit.status)
console.log(JSON.stringify(audit.json, null, 2)?.slice(0, 4000))

const fri = await get(
  "/rest/v1/homework?select=*&due_date=eq.2026-10-02&order=created_at.desc&limit=30",
)
console.log('\ndue friday', fri.status)
for (const r of fri.json || []) {
  console.log(r.id, r.subject?.slice(0, 40), JSON.stringify(r.author_label), (r.body || '').replace(/\s+/g, ' ').slice(0, 80))
}
