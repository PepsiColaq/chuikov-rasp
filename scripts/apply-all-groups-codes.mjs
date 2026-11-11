/**
 * Apply supabase/all_groups_codes.sql
 * Prefers DATABASE_URL (postgres), else SUPABASE_ACCESS_TOKEN + project ref.
 */
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sqlPath = resolve(root, 'supabase/all_groups_codes.sql')
const sql = readFileSync(sqlPath, 'utf8')

function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = resolve(root, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (!m || process.env[m[1]]) continue
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

loadEnv()

const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || ''
const token = process.env.SUPABASE_ACCESS_TOKEN || ''
const ref =
  process.env.SUPABASE_PROJECT_REF ||
  (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_DIRECT_URL || '')
    .replace(/^https?:\/\//, '')
    .split('.')[0]

if (dbUrl) {
  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()
  await client.query(sql)
  await client.end()
  console.log('OK: all_groups_codes.sql via DATABASE_URL')
  process.exit(0)
}

if (token && ref) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) {
    console.error('FAIL Management API', res.status, text.slice(0, 500))
    process.exit(1)
  }
  console.log('OK: all_groups_codes.sql via Management API')
  process.exit(0)
}

console.log('SKIP: нет DATABASE_URL / SUPABASE_ACCESS_TOKEN')
console.log('Открой Supabase → SQL Editor и выполни файл:')
console.log(sqlPath)
process.exit(2)
