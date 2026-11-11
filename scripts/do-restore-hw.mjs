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

async function req(method, path, body) {
  return attempt(async () => {
    const r = await fetch(base + path, {
      method,
      headers: {
        ...h,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await r.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}
    return { status: r.status, text, json }
  })
}

const folder = 'g_0903_3_fe182836'
const listed = await attempt(async () => {
  const r = await fetch(`${base}/storage/v1/object/list/hw-files`, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: folder + '/', limit: 200, offset: 0 }),
  })
  return { status: r.status, text: await r.text(), json: await r.json().catch(() => null) }
})
console.log('files count', listed.json?.length)
const files = (listed.json || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)))
for (const f of files) {
  console.log(f.name, f.created_at || f.updated_at || '', f.metadata?.size)
}

const add = await get(
  '/rest/v1/audit_log?select=*&detail=ilike.*hw_6cfd6af64026b65d*&order=at.asc&limit=10',
)
console.log('\nkrim deleted audit', JSON.stringify(add.json, null, 2))

const adminName =
  (
    await get('/rest/v1/app_meta?select=admin_display_name,admin_avatar_url&id=eq.main')
  ).json?.[0]?.admin_display_name || 'Никитос'
const adminAva =
  (await get('/rest/v1/app_meta?select=admin_avatar_url&id=eq.main')).json?.[0]?.admin_avatar_url ||
  null
console.log('admin', adminName, adminAva)

const lessonId = 'g_0903_пд3_5_0900_15_Информатика_и_информационные_технологии_'
const subject = 'Информатика и информационные технологии в проф.деятельности'

// Infer which storage files belong to deleted krim hw:
// remaining photo hw a27e6f has files 1790585992249, 1790585993267, 1790585994003
// deleted 6cfd was created 08:57:35, a27e at 08:59:54 — so files just before a27e's
const used = new Set([
  '1790585992249_ykrqth.webp',
  '1790585993267_shd2yb.webp',
  '1790585994003_8z333n.webp',
])
const candidates = files
  .filter((f) => /\.(webp|jpe?g|png)$/i.test(f.name) && !used.has(f.name))
  .filter((f) => {
    // around deleted hw time Sept 28 ~08:57 UTC = timestamps in name often ms
    return true
  })
console.log('\ncandidate unused images', candidates.map((f) => f.name))

// Also get files by created_at near 2026-09-28T08:57
const near = files.filter((f) => {
  const t = f.created_at || f.updated_at || ''
  return t.startsWith('2026-09-28T08:5') || t.startsWith('2026-09-28T09:0')
})
console.log('\nnear time', near.map((f) => `${f.name} ${f.created_at}`))

const pub = (name) =>
  `${base}/storage/v1/object/public/hw-files/${folder}/${name}`

// Pick images for deleted krim: files created at/before a27e batch, unused
let krimImages = near
  .map((f) => f.name)
  .filter((n) => !used.has(n) && /\.(webp|jpe?g|png)$/i.test(n))
if (!krimImages.length) {
  // fallback: numeric prefix just below 1790585992249
  krimImages = files
    .map((f) => f.name)
    .filter((n) => /^1790585990|^179058598|^179058597/.test(n) || /^1759|^1760|^1770|^1780|^17905859/.test(n))
    .filter((n) => !used.has(n) && /\.(webp|jpe?g|png)$/i.test(n))
}
console.log('krimImages chosen', krimImages)

const rows = [
  {
    id: 'hw_1fc683a3e6dcbeef',
    group_id: 'g_0903_пд3',
    subject,
    body: 'бульба',
    due_date: '2026-10-02',
    lesson_id: lessonId,
    images: [],
    attachments: [],
    author_code_id: 'admin',
    author_label: adminName,
    author_avatar_url: adminAva,
    created_at: '2026-10-01T11:05:46.071418+00:00',
  },
  {
    id: 'hw_95a21b3a1a4b9676',
    group_id: 'g_0903_пд3',
    subject,
    body: 'это все в консультанте студенте 👆',
    due_date: '2026-10-02',
    lesson_id: lessonId,
    images: [],
    attachments: [],
    author_code_id: 'admin',
    author_label: adminName,
    author_avatar_url: adminAva,
    created_at: '2026-09-28T06:23:23.001548+00:00',
  },
  {
    id: 'hw_c07a62db398bda8a',
    group_id: 'g_0903_пд3',
    subject,
    body: 'тема 1 урок 3 ( через карточку поиска), 4 доделать',
    due_date: '2026-10-02',
    lesson_id: lessonId,
    images: [],
    attachments: [],
    author_code_id: 'admin',
    author_label: adminName,
    author_avatar_url: adminAva,
    created_at: '2026-09-28T06:22:32.579508+00:00',
  },
]

if (krimImages.length) {
  const urls = krimImages.map(pub)
  rows.push({
    id: 'hw_6cfd6af64026b65d',
    group_id: 'g_0903_пд3',
    subject: 'Криминалистика',
    body: ' ',
    due_date: '2026-09-28',
    lesson_id: null,
    images: urls,
    attachments: urls.map((url, i) => ({
      url,
      name: krimImages[i],
      mime: 'image/webp',
    })),
    author_code_id: 'admin',
    author_label: adminName,
    author_avatar_url: adminAva,
    created_at: '2026-09-28T08:57:35.861795+00:00',
  })
} else {
  console.log('WARN: no krim images found — will restore empty photo hw? skip photo')
}

for (const row of rows) {
  const exists = await get(`/rest/v1/homework?select=id&id=eq.${row.id}`)
  if (exists.json?.length) {
    console.log('exists skip', row.id)
    continue
  }
  const ins = await req('POST', '/rest/v1/homework', row)
  console.log('insert', row.id, ins.status, ins.text.slice(0, 300))
}

const check = await get(
  '/rest/v1/homework?select=id,subject,body,due_date,author_label,images&or=(id.eq.hw_1fc683a3e6dcbeef,id.eq.hw_95a21b3a1a4b9676,id.eq.hw_c07a62db398bda8a,id.eq.hw_6cfd6af64026b65d)',
)
console.log('\nCHECK', JSON.stringify(check.json, null, 2))
