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
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'User-Agent': 'chuikov-usage/1.0',
}

function fmtBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '?'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let x = n
  let i = 0
  while (x >= 1024 && i < u.length - 1) {
    x /= 1024
    i += 1
  }
  return `${x.toFixed(i === 0 ? 0 : 2)} ${u[i]}`
}

async function listAll(prefix = '') {
  const out = []
  let offset = 0
  for (;;) {
    const r = await fetch(`${base}/storage/v1/object/list/hw-files`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prefix,
        limit: 1000,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      }),
    })
    const text = await r.text()
    if (!r.ok) throw new Error(`list ${prefix || '/'} → ${r.status} ${text.slice(0, 200)}`)
    const batch = JSON.parse(text)
    if (!Array.isArray(batch) || !batch.length) break
    out.push(...batch)
    if (batch.length < 1000) break
    offset += batch.length
  }
  return out
}

async function walk(prefix = '', depth = 0) {
  const items = await listAll(prefix)
  let files = 0
  let bytes = 0
  const folders = []
  for (const it of items) {
    const isFolder = !it.id && (!it.metadata || it.metadata === null)
    // Supabase: folders have id=null; files have metadata.size
    const size = Number(it?.metadata?.size || 0)
    if (size > 0 || it.id) {
      files += 1
      bytes += size
    } else if (it.name) {
      folders.push(it.name)
    }
  }
  // recurse folders (cap depth)
  if (depth < 4) {
    for (const name of folders) {
      const childPrefix = prefix ? `${prefix}/${name}` : name
      const child = await walk(childPrefix, depth + 1)
      files += child.files
      bytes += child.bytes
    }
  }
  return { files, bytes, folders: folders.length, top: items.length }
}

async function rpcOrSql() {
  // DB size via rpc if available; else count rows via REST
  const tables = ['homework', 'overrides', 'groups', 'lessons', 'group_codes', 'app_meta']
  const counts = {}
  for (const t of tables) {
    try {
      const r = await fetch(`${base}/rest/v1/${t}?select=id`, {
        headers: { ...headers, Prefer: 'count=exact', Range: '0-0' },
      })
      const cr = r.headers.get('content-range') || ''
      const m = cr.match(/\/(\d+|\*)/)
      counts[t] = m && m[1] !== '*' ? Number(m[1]) : (r.ok ? '?' : `err ${r.status}`)
    } catch (e) {
      counts[t] = e.message
    }
  }

  // Try pg size via a common pattern — may fail without custom RPC
  let dbSize = null
  for (const q of [
    `${base}/rest/v1/rpc/pg_database_size`,
    `${base}/rest/v1/rpc/rasp_db_size`,
  ]) {
    try {
      const r = await fetch(q, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (r.ok) {
        dbSize = await r.json()
        break
      }
    } catch {
      /* ignore */
    }
  }

  // Approximate homework payload size sample
  let hwSampleBytes = 0
  let hwSampleN = 0
  try {
    const r = await fetch(
      `${base}/rest/v1/homework?select=id,text,attachments,images,author_label&limit=200`,
      { headers },
    )
    if (r.ok) {
      const rows = await r.json()
      hwSampleN = rows.length
      hwSampleBytes = Buffer.byteLength(JSON.stringify(rows), 'utf8')
    }
  } catch {
    /* ignore */
  }

  return { counts, dbSize, hwSampleBytes, hwSampleN }
}

console.log('Measuring Supabase usage…')
const storage = await walk('')
const db = await rpcOrSql()

const FREE_STORAGE = 1 * 1024 ** 3
const FREE_DB = 500 * 1024 ** 2
const PRO_STORAGE = 100 * 1024 ** 3
const PRO_DB = 8 * 1024 ** 3
const PRO_EGRESS = 250 * 1024 ** 3

console.log('\n=== STORAGE (bucket hw-files) ===')
console.log('files:', storage.files)
console.log('bytes:', storage.bytes, `(${fmtBytes(storage.bytes)})`)
console.log('of Free 1 GB:', `${((storage.bytes / FREE_STORAGE) * 100).toFixed(2)}%`)
console.log('of Pro 100 GB:', `${((storage.bytes / PRO_STORAGE) * 100).toFixed(4)}%`)

console.log('\n=== DB (approx via REST counts) ===')
console.log(db.counts)
if (db.hwSampleN) {
  const avg = db.hwSampleBytes / db.hwSampleN
  const totalHw = typeof db.counts.homework === 'number' ? db.counts.homework : db.hwSampleN
  const est = avg * totalHw
  console.log('hw sample rows:', db.hwSampleN, 'avg JSON bytes/row:', Math.round(avg))
  console.log('est homework JSON footprint:', fmtBytes(est), `(${totalHw} rows)`)
}
if (db.dbSize != null) console.log('dbSize rpc:', db.dbSize)

console.log('\n=== FREE vs PRO (official quotas) ===')
console.log('Free: DB 500MB, Storage 1GB, Egress 5GB, MAU 50k')
console.log('Pro ~$25 (~1800₽): DB 8GB, Storage 100GB, Egress 250GB, MAU 100k')
console.log('Free DB used unknown exactly without dashboard; storage above is measured.')

// Rough capacity for 3000 users
const perUserStorageNow =
  typeof db.counts.homework === 'number' && db.counts.homework > 0
    ? storage.bytes / Math.max(1, db.counts.homework)
    : null
console.log('\n=== 3000 USERS ROUGH ===')
console.log('Note: most students only READ; writers = starostas. Bottleneck = photos + egress.')
if (perUserStorageNow != null) {
  console.log('storage bytes per HW row now:', Math.round(perUserStorageNow), `(${fmtBytes(perUserStorageNow)})`)
}
console.log('If 3000 students, ~100 groups, each group ~20 photo HW/week compressed ~150KB:')
const weekly = 100 * 20 * 150 * 1024
const yearly = weekly * 40 // ~40 study weeks
console.log('  est weekly new photos:', fmtBytes(weekly))
console.log('  est / academic year:', fmtBytes(yearly), '→ fits in Pro 100GB?', yearly < PRO_STORAGE)
console.log('  egress if each of 3000 opens 10 photos/week @150KB:', fmtBytes(3000 * 10 * 150 * 1024), '/week')
console.log('  monthly egress that pattern:', fmtBytes(3000 * 10 * 150 * 1024 * 4), 'vs Pro 250GB')
