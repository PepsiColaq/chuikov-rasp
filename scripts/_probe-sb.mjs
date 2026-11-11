import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
for (const name of ['.env.local', '.env']) {
  const p = join(root, name)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    env[m[1]] = v
  }
}
const urls = [
  env.VITE_SUPABASE_DIRECT_URL,
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_PROXY_URL,
]
  .filter(Boolean)
  .map((u) => u.replace(/\/$/, ''))
const anon = env.VITE_SUPABASE_ANON_KEY
for (const base of [...new Set(urls)]) {
  const url = `${base}/rest/v1/groups?select=id,name&active=eq.true&limit=3`
  try {
    const r = await fetch(url, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    })
    const t = await r.text()
    console.log(r.status, base, t.slice(0, 100).replace(/\n/g, ' '))
  } catch (e) {
    console.log('FAIL', base, e.cause?.code || e.message)
  }
}
