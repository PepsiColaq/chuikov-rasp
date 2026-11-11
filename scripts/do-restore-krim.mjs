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

async function list(prefix) {
  return attempt(async () => {
    const r = await fetch(`${base}/storage/v1/object/list/hw-files`, {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prefix,
        limit: 200,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' },
      }),
    })
    const text = await r.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}
    return { status: r.status, text, json }
  })
}

async function get(path) {
  return attempt(async () => {
    const r = await fetch(base + path, { headers: h })
    const text = await r.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}
    return { status: r.status, json, text }
  })
}

async function post(path, body) {
  return attempt(async () => {
    const r = await fetch(base + path, {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(body),
    })
    return { status: r.status, text: await r.text() }
  })
}

for (const prefix of ['g_0903_3_fe182836', 'g_0903_3_fe182836/']) {
  const l = await list(prefix)
  console.log('prefix', JSON.stringify(prefix), 'status', l.status, 'n', l.json?.length)
  if (Array.isArray(l.json)) {
    for (const f of l.json.slice(0, 50)) {
      console.log('-', f.name, f.created_at, f.id)
    }
  } else {
    console.log(l.text.slice(0, 500))
  }
}

// All homework attachments/images currently referencing storage — to see used files
const hw = await get(
  '/rest/v1/homework?select=id,subject,due_date,images,attachments,created_at&group_id=eq.' +
    encodeURIComponent('g_0903_пд3'),
)
const used = new Set()
for (const row of hw.json || []) {
  for (const u of row.images || []) {
    const m = String(u).match(/g_0903_3_fe182836\/([^?]+)/)
    if (m) used.add(m[1])
  }
  for (const a of row.attachments || []) {
    const m = String(a?.url || '').match(/g_0903_3_fe182836\/([^?]+)/)
    if (m) used.add(m[1])
  }
}
console.log('\nused files', [...used])

const l = await list('g_0903_3_fe182836')
const all = Array.isArray(l.json) ? l.json : []
const unused = all.filter((f) => f.name && !used.has(f.name) && /\.(webp|jpe?g|png)$/i.test(f.name))
console.log('\nunused', unused.map((f) => `${f.name} ${f.created_at}`))

// Тюшкин code id
const codes = await get(
  '/rest/v1/group_codes?select=id,label&group_id=eq.' +
    encodeURIComponent('g_0903_пд3') +
    '&label=eq.' +
    encodeURIComponent('Тюшкин'),
)
console.log('tyushkin', codes.json)

// If unused images exist around deleted time, restore
const pick = unused.filter((f) => {
  const t = f.created_at || ''
  return t.startsWith('2026-09-28T08:') || t.startsWith('2026-09-28T09:0')
})
console.log('pick near delete', pick.map((f) => f.name))

const images = (pick.length ? pick : unused.slice(0, 3)).map(
  (f) => `${base}/storage/v1/object/public/hw-files/g_0903_3_fe182836/${f.name}`,
)
const names = (pick.length ? pick : unused.slice(0, 3)).map((f) => f.name)

if (!images.length) {
  console.log('NO IMAGES TO RESTORE')
  process.exit(0)
}

const ty = codes.json?.[0]
const row = {
  id: 'hw_6cfd6af64026b65d',
  group_id: 'g_0903_пд3',
  subject: 'Криминалистика',
  body: ' ',
  due_date: '2026-09-28',
  images,
  attachments: images.map((url, i) => ({
    url,
    name: names[i],
    mime: 'image/webp',
  })),
  author_code_id: ty?.id || null,
  author_label: ty?.label || 'Тюшкин',
  created_at: '2026-09-28T08:57:35.861795+00:00',
}

const exists = await get('/rest/v1/homework?select=id&id=eq.hw_6cfd6af64026b65d')
if (exists.json?.length) {
  console.log('already exists')
} else {
  const ins = await post('/rest/v1/homework', row)
  console.log('insert krim', ins.status, ins.text.slice(0, 500))
}
