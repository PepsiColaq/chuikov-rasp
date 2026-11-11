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

async function rpc(name, body) {
  return attempt(async () => {
    const r = await fetch(`${base}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        'User-Agent': 'chuikov-fix/1.0',
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    return { status: r.status, text: await r.text() }
  })
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
    const text = await r.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}
    return { status: r.status, text, json }
  })
}

const claim = await rpc('rasp_claim_orphan_homework', { p_token: 'x', p_code_id: 'x' })
console.log('claim rpc', claim.status, claim.text.slice(0, 200))

const hw = await get(
  '/rest/v1/homework?select=id,subject,due_date,author_label,author_code_id,body&or=(author_code_id.is.null,author_label.eq.,author_label.eq.Староста)&order=created_at.desc&limit=15',
)
console.log('orphan-ish hw', hw.status)
for (const r of hw.json || []) {
  console.log(
    (r.due_date || ''),
    JSON.stringify(r.author_label),
    r.author_code_id,
    (r.subject || '').slice(0, 30),
    (r.body || '').replace(/\s+/g, ' ').slice(0, 40),
  )
}

const named = await get(
  '/rest/v1/homework?select=author_label,author_code_id&author_label=neq.&limit=20',
)
console.log('\nnamed labels', [...new Set((named.json || []).map((x) => x.author_label))])
