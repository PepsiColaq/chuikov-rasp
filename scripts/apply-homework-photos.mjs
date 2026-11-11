/**
 * Applies supabase/homework_photos.sql via Supabase Management API if available,
 * otherwise prints that SQL Editor is required.
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_ACCESS_TOKEN="sbp_..."; $env:SUPABASE_PROJECT_REF="azuergqxvqrkvrvqelha"; node scripts/apply-homework-photos.mjs
 *
 * Or with DB URL:
 *   $env:DATABASE_URL="postgresql://..."; node scripts/apply-homework-photos.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sqlPath = resolve(root, 'supabase/homework_photos.sql')
const sql = readFileSync(sqlPath, 'utf8')

function loadDotEnv() {
  const p = resolve(root, '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    if (process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

loadDotEnv()

const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
const token = process.env.SUPABASE_ACCESS_TOKEN
const ref =
  process.env.SUPABASE_PROJECT_REF ||
  (process.env.VITE_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]

if (dbUrl) {
  const { default: pg } = await import('pg').catch(() => ({ default: null }))
  if (!pg) {
    console.error('Install pg: npm i -D pg')
    process.exit(1)
  }
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()
  await client.query(sql)
  await client.end()
  console.log('OK: homework_photos.sql applied via DATABASE_URL')
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
    console.error('Management API failed:', res.status, text.slice(0, 400))
    process.exit(1)
  }
  console.log('OK: homework_photos.sql applied via Management API')
  process.exit(0)
}

console.log('SKIP: no DATABASE_URL / SUPABASE_ACCESS_TOKEN — run supabase/homework_photos.sql in SQL Editor')
process.exit(2)
