/**
 * Имитация гостей на сайте (только чтение, без входа и записи ДЗ).
 *
 *   node scripts/load-sim-users.mjs --users 500 --minutes 3
 *
 * Ctrl+C — остановить.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv() {
  const out = { ...process.env }
  for (const name of ['.env.local', '.env']) {
    const p = join(root, name)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      if (out[m[1]] == null || out[m[1]] === '') out[m[1]] = v
    }
  }
  return out
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]
  return fallback
}

const env = loadEnv()
// Для нагрузочного теста лучше прямой URL (прокси может резать пачку запросов)
const baseUrl = (
  env.VITE_SUPABASE_DIRECT_URL ||
  env.VITE_SUPABASE_URL ||
  env.VITE_SUPABASE_PROXY_URL ||
  ''
).replace(/\/$/, '')
const anon = env.VITE_SUPABASE_ANON_KEY || ''
const site = 'https://pepsicolaq.github.io/chuikov-rasp/'
const USERS = Math.max(1, Math.min(2000, Number(arg('users', '500')) || 500))
const MINUTES = Math.max(0.5, Math.min(30, Number(arg('minutes', '3')) || 3))
const POLL_MS = Math.max(3000, Number(arg('poll', '8000')) || 8000)

if (!baseUrl || !anon) {
  console.error('Нет VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY в .env.local')
  process.exit(1)
}

const headers = {
  apikey: anon,
  Authorization: `Bearer ${anon}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
}

const stats = {
  ok: 0,
  fail: 0,
  latSum: 0,
  latN: 0,
  by: Object.create(null),
}
let stop = false
process.on('SIGINT', () => {
  stop = true
  console.log('\nОстанавливаем…')
})

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

async function hit(label, url, init = {}) {
  const t0 = Date.now()
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) })
    const ms = Date.now() - t0
    stats.latSum += ms
    stats.latN++
    if (!stats.by[label]) stats.by[label] = { ok: 0, fail: 0 }
    if (r.ok) {
      stats.ok++
      stats.by[label].ok++
    } else {
      stats.fail++
      stats.by[label].fail++
    }
    return r
  } catch {
    stats.fail++
    if (!stats.by[label]) stats.by[label] = { ok: 0, fail: 0 }
    stats.by[label].fail++
    return null
  }
}

async function loadGroups() {
  const url = `${baseUrl}/rest/v1/groups?select=id,name,faculty,active&active=eq.true`
  const r = await hit('groups', url, { headers })
  if (!r) {
    console.error('groups: network fail')
    return []
  }
  const text = await r.text()
  if (!r.ok) {
    console.error('groups:', r.status, text.slice(0, 200))
    return []
  }
  try {
    return JSON.parse(text)
  } catch {
    console.error('groups: bad json', text.slice(0, 120))
    return []
  }
}

async function userLoop(id, groups, until) {
  // «зашёл на сайт»
  await hit('shell', site, { method: 'GET' })
  await sleep(200 + Math.random() * 800)

  const group = rand(groups)
  if (!group?.id) return

  // выбор группы + первичная подгрузка
  await Promise.all([
    hit('meta', `${baseUrl}/rest/v1/rpc/rasp_public_meta`, {
      method: 'POST',
      headers,
      body: '{}',
    }),
    hit(
      'hw',
      `${baseUrl}/rest/v1/homework?select=id,group_id,subject,text,due_date,created_at&group_id=eq.${encodeURIComponent(group.id)}&order=created_at.desc&limit=80`,
      { headers },
    ),
    hit(
      'ovr',
      `${baseUrl}/rest/v1/overrides?select=id,group_id,lesson_id,on_date,type&group_id=eq.${encodeURIComponent(group.id)}&order=on_date.desc&limit=80`,
      { headers },
    ),
  ])

  // редкий «визит» как в приложении
  if (Math.random() < 0.35) {
    await hit('visit', `${baseUrl}/rest/v1/rpc/rasp_track_visit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_visitor_id: `load_${id}_${Math.random().toString(36).slice(2, 10)}`,
        p_group_id: group.id,
      }),
    })
  }

  const tabs = ['schedule', 'hw', 'teacher', 'overrides', 'more']
  while (!stop && Date.now() < until) {
    // «листает вкладки»
    void rand(tabs)
    await sleep(400 + Math.random() * 1600)

    // как poll ~8с, но с джиттером
    await Promise.all([
      hit(
        'hw_poll',
        `${baseUrl}/rest/v1/homework?select=id,group_id,subject,due_date,created_at&group_id=eq.${encodeURIComponent(group.id)}&order=created_at.desc&limit=40`,
        { headers },
      ),
      hit(
        'ovr_poll',
        `${baseUrl}/rest/v1/overrides?select=id,group_id,on_date,type&group_id=eq.${encodeURIComponent(group.id)}&limit=40`,
        { headers },
      ),
    ])

    await sleep(POLL_MS * (0.7 + Math.random() * 0.6))
  }
}

function printStats(prefix = '') {
  const avg = stats.latN ? Math.round(stats.latSum / stats.latN) : 0
  const parts = Object.entries(stats.by)
    .map(([k, v]) => `${k}:${v.ok}/${v.fail}`)
    .join(' ')
  console.log(
    `${prefix}ok=${stats.ok} fail=${stats.fail} avg=${avg}ms | ${parts}`,
  )
}

const until = Date.now() + MINUTES * 60 * 1000
console.log(`Load sim: users=${USERS} minutes=${MINUTES} poll≈${POLL_MS}ms`)
console.log(`Target DB: ${baseUrl}`)
console.log('Только чтение (гости). Ctrl+C — стоп.\n')

const groups = await loadGroups()
if (!groups.length) {
  console.error('Не удалось загрузить группы — проверь сеть/Supabase')
  process.exit(1)
}
console.log(`Групп: ${groups.length}. Стартуем пользователей…`)

const ticker = setInterval(() => printStats('live '), 5000)
const starters = []
for (let i = 0; i < USERS; i++) {
  starters.push(
    (async () => {
      await sleep(Math.floor((i / USERS) * 25000)) // растянуть старт на ~25с
      if (stop || Date.now() >= until) return
      await userLoop(i, groups, until)
    })(),
  )
}

await Promise.all(starters)
clearInterval(ticker)
printStats('DONE ')
console.log('Готово.')
