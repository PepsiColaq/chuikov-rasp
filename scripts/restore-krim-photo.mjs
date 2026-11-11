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

const base = env.SUPABASE_URL.replace(/\/$/, '')
const key = env.SUPABASE_SERVICE_ROLE_KEY
const h = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'User-Agent': 'chuikov-restore/1.0',
}

async function attempt(fn, n = 8) {
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
    const r = await fetch(base + path, { headers: h })
    const text = await r.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}
    return { status: r.status, text, json }
  })
}

async function post(path, body) {
  return attempt(async () => {
    const r = await fetch(base + path, {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(body),
    })
    const text = await r.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}
    return { status: r.status, text, json }
  })
}

const dels = await get('/rest/v1/audit_log?select=*&action=eq.homework_delete&order=at.desc&limit=25')
console.log('DELETES')
for (const d of dels.json || []) console.log(d.at, d.detail)

const krim = await get(
  '/rest/v1/homework?select=id,subject,body,due_date,images,attachments,author_label,created_at&subject=ilike.*Криминал*&order=created_at.desc&limit=20',
)
console.log('\nKRIM LIVE')
console.log(JSON.stringify(krim.json, null, 2))

const info = await get(
  '/rest/v1/homework?select=id,subject,body,due_date&subject=ilike.*Информ*&limit=10',
)
console.log('\nINFO LIVE', info.json)

// list storage root folders
const list = await attempt(async () => {
  const r = await fetch(`${base}/storage/v1/object/list/hw-files`, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: '', limit: 100, offset: 0 }),
  })
  return { status: r.status, text: await r.text() }
})
console.log('\nSTORAGE ROOT', list.status, list.text.slice(0, 2000))

// try group folder variants
for (const prefix of [
  'g_0903_пд3/',
  'hw_g_0903_пд3/',
  '0903/',
]) {
  const l2 = await attempt(async () => {
    const r = await fetch(`${base}/storage/v1/object/list/hw-files`, {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 100, offset: 0 }),
    })
    return { status: r.status, text: await r.text() }
  }).catch((e) => ({ status: 0, text: String(e) }))
  console.log('\nPREFIX', prefix, l2.status, l2.text.slice(0, 1500))
}
