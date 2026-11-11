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
const ids = ['hw_1fc683a3e6dcbeef', 'hw_95a21b3a1a4b9676', 'hw_c07a62db398bda8a']

async function get(path) {
  const r = await fetch(base + path, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'User-Agent': 'chuikov-restore/1.0',
    },
  })
  return { status: r.status, text: await r.text() }
}

for (const id of ids) {
  const a = await get(`/rest/v1/audit_log?select=*&detail=ilike.*${id}*&order=at.desc&limit=10`)
  console.log('\n===', id, a.status)
  console.log(a.text.slice(0, 2000))
}

const adds = await get(
  '/rest/v1/audit_log?select=*&action=eq.homework_add&group_id=eq.' +
    encodeURIComponent('g_0903_пд3') +
    '&order=at.desc&limit=50',
)
console.log('\nADD', adds.status)
console.log(adds.text.slice(0, 8000))
