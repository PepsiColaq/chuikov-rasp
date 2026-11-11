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

async function attempt(fn, n = 6) {
  let last
  for (let i = 1; i <= n; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      await new Promise((r) => setTimeout(r, 300 * i * i))
    }
  }
  throw last
}

async function get(path) {
  return attempt(async () => {
    const r = await fetch(base + path, {
      headers: {
        'User-Agent': 'chuikov-fix/1.0',
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
    })
    const t = await r.text()
    let j = null
    try {
      j = JSON.parse(t)
    } catch {}
    return { status: r.status, t: t.slice(0, 500), j }
  })
}

const paths = [
  '/rest/v1/audit_log?select=at,action,group_id,detail,by_role,actor_role&action=eq.homework_add&order=at.desc&limit=30',
  '/rest/v1/audit_log?select=at,action,group_id,detail,by_role&or=(action.eq.starosta_code_add,action.eq.starosta_label_rename,action.eq.login_starosta)&order=at.desc&limit=40',
  '/rest/v1/group_codes?select=id,group_id,label,active&limit=20',
]
for (const p of paths) {
  const res = await get(p)
  console.log('\n', p.split('?')[0], res.status)
  console.log(JSON.stringify(res.j, null, 2)?.slice(0, 2500) || res.t)
}
