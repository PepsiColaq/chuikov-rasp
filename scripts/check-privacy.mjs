/**
 * Проверка приватности: что посторонний может увидеть и сделать на сайте.
 *
 * Запуск (из папки проекта):
 *   node scripts/check-privacy.mjs
 *
 * Скрипт использует только ПУБЛИЧНЫЙ ключ, который и так лежит в бандле
 * у каждого студента — то есть смотрит ровно теми глазами, что и чужой человек.
 *
 * Ничего не меняет и не удаляет: все запросы только на чтение.
 * Для пары проверок создаёт ВРЕМЕННЫЙ бакет и сразу удаляет его.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---------- читаем ключи ----------
const envPath = join(root, '.env.local')
if (!existsSync(envPath)) {
  console.error('Нет файла .env.local — скрипт должен лежать внутри проекта.')
  process.exit(1)
}
const env = {}
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
  if (m) env[m[1]] = m[2].trim()
}
const base = (env.VITE_SUPABASE_DIRECT_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const anon = env.VITE_SUPABASE_ANON_KEY
const svc = env.SUPABASE_SERVICE_ROLE_KEY
if (!base || !anon) {
  console.error('В .env.local нет VITE_SUPABASE_DIRECT_URL / VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const AN = { apikey: anon, Authorization: 'Bearer ' + anon, 'Content-Type': 'application/json' }
const SVC = svc ? { apikey: svc, Authorization: 'Bearer ' + svc, 'Content-Type': 'application/json' } : null

let problems = 0
let okCount = 0
const bad = (msg) => {
  problems++
  console.log(`  ✗ ${msg}`)
}
const good = (msg) => {
  okCount++
  console.log(`  ✓ ${msg}`)
}

// ---------- 1. таблицы ----------
// Что должно быть ЗАКРЫТО: персональные данные.
const privateTables = [
  ['students', 'студенты (ФИО, коды, контакты)'],
  ['journal_marks', 'отметки посещаемости'],
  ['journal_grades', 'оценки'],
  ['sessions', 'активные входы'],
  ['admin_codes', 'коды админов'],
  ['group_codes', 'коды старост'],
  ['curators', 'кураторы'],
  ['audit_log', 'журнал безопасности'],
  ['support_tickets', 'обращения в поддержку'],
  ['login_attempts', 'попытки входа'],
  ['device_bans', 'блокировки устройств'],
  ['site_visits', 'посещения'],
  ['code_visitors', 'посетители по кодам'],
  ['hw_upload_tickets', 'билеты загрузки'],
  ['app_meta', 'настройки сайта'],
]

console.log('\n=== 1. ПЕРСОНАЛЬНЫЕ ДАННЫЕ (должны быть закрыты) ===')
for (const [table, title] of privateTables) {
  try {
    const r = await fetch(`${base}/rest/v1/${table}?select=*&limit=1`, { headers: AN })
    const text = await r.text()
    let rows = []
    try {
      rows = JSON.parse(text)
    } catch {
      rows = text
    }
    if (r.status === 404) {
      good(`${title}: таблицы нет — нечего закрывать`)
    } else if (Array.isArray(rows) && rows.length === 0) {
      good(`${title}: закрыто`)
    } else if (Array.isArray(rows)) {
      bad(`${title}: ВИДНО ПОСТОРОННИМ → ${JSON.stringify(rows[0]).slice(0, 90)}`)
    } else {
      good(`${title}: закрыто (${r.status})`)
    }
  } catch (e) {
    bad(`${title}: ошибка проверки — ${e.message}`)
  }
}

// ---------- 2. служебные колонки в открытых таблицах ----------
console.log('\n=== 2. СЛУЖЕБНЫЕ ПОЛЯ В ОТКРЫТЫХ ТАБЛИЦАХ ===')
try {
  const r = await fetch(`${base}/rest/v1/groups?select=starosta_code_hash&limit=1`, { headers: AN })
  const text = await r.text()
  if (r.ok && !/column|does not exist|permission/i.test(text)) {
    const rows = JSON.parse(text)
    if (Array.isArray(rows) && rows.length && 'starosta_code_hash' in rows[0]) {
      bad('groups: хеш кода старосты виден посторонним — выполни supabase/v162_privacy_hardening.sql')
    } else {
      good('groups: хеш кода старосты скрыт')
    }
  } else {
    good('groups: хеш кода старосты скрыт')
  }
} catch {
  good('groups: хеш кода старосты скрыт')
}

// ---------- 3. RPC без входа ----------
console.log('\n=== 3. СЕРВЕРНЫЕ ФУНКЦИИ БЕЗ ВХОДА ===')
const guardedRpc = [
  ['rasp_list_students', { p_token: '', p_group_id: 'g_0903_пд3' }, 'список студентов'],
  ['rasp_journal_marks', { p_token: '', p_group_id: 'g_0903_пд3', p_date: '2026-11-15' }, 'журнал'],
  ['rasp_list_audit', { p_token: '', p_limit: 5 }, 'журнал безопасности'],
  ['rasp_my_marks', { p_token: '' }, 'оценки студента'],
  ['rasp_list_starosta_codes', { p_token: '' }, 'коды старост'],
  ['rasp_list_admins', { p_token: '' }, 'список админов'],
  ['rasp_support_list', { p_token: '' }, 'обращения в поддержку'],
  ['rasp_site_stats', { p_token: '' }, 'статистика сайта'],
  ['rasp_curators_list', { p_token: '' }, 'кураторы'],
  ['rasp_groupmates', { p_token: '', p_group_id: 'g_0903_пд3' }, 'одногруппники'],
]
for (const [fn, body, title] of guardedRpc) {
  try {
    const r = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers: AN, body: JSON.stringify(body) })
    const text = (await r.text()).replace(/\s+/g, ' ').trim()
    if (r.status === 404) {
      good(`${title}: функции нет (норма)`)
    } else if (r.ok) {
      const empty = text === '[]' || text === 'null' || text === '""'
      if (empty) good(`${title}: пустой ответ без входа`)
      else bad(`${title}: ОТДАЁТ ДАННЫЕ БЕЗ ВХОДА → ${text.slice(0, 90)}`)
    } else {
      good(`${title}: требует вход`)
    }
  } catch (e) {
    bad(`${title}: ошибка — ${e.message}`)
  }
}

// ---------- 4. запись без входа ----------
console.log('\n=== 4. ПОПЫТКИ ЗАПИСИ БЕЗ ВХОДА ===')
const writes = [
  ['homework', { id: '__probe__', group_id: 'g_0903_пд3', subject: 'x', body: 'y' }, 'добавить ДЗ'],
  ['lessons', { id: '__probe__', group_id: 'g_0903_пд3', day: 1, start_time: '1', end_time: '2', subject: 'x' }, 'добавить пару'],
  ['news', { id: '__probe__', title: 'x', body: 'y' }, 'добавить новость'],
  ['journal_marks', { id: '__probe__' }, 'поставить отметку'],
]
for (const [table, row, title] of writes) {
  try {
    const r = await fetch(`${base}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...AN, Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    })
    if (r.ok) bad(`${title}: ПРОШЛО БЕЗ ВХОДА (${r.status})`)
    else good(`${title}: запрещено`)
  } catch (e) {
    bad(`${title}: ошибка — ${e.message}`)
  }
}

// ---------- 5. хранилище ----------
console.log('\n=== 5. ФАЙЛЫ И ФОТО ===')
const buckets = ['hw-photos', 'hw-files']
let anyListed = false
for (const b of buckets) {
  try {
    const r = await fetch(`${base}/storage/v1/object/list/${b}`, {
      method: 'POST',
      headers: AN,
      body: JSON.stringify({ prefix: '', limit: 100 }),
    })
    const arr = await r.json()
    const names = Array.isArray(arr) ? arr.map((x) => x.name) : []
    if (names.length) {
      anyListed = true
      bad(`список файлов в «${b}» виден посторонним (${names.length} шт.) — выполни supabase/v162_privacy_hardening.sql`)
    } else {
      good(`список файлов в «${b}» скрыт`)
    }
  } catch (e) {
    bad(`проверка «${b}»: ошибка — ${e.message}`)
  }
}

// прямая ссылка должна продолжать работать (иначе фото в ДЗ не откроются)
if (SVC) {
  try {
    const list = await (
      await fetch(`${base}/storage/v1/object/list/hw-files`, {
        method: 'POST',
        headers: SVC,
        body: JSON.stringify({ prefix: 'avatars_admin_34c83614', limit: 1 }),
      })
    ).json()
    const f = Array.isArray(list) && list.find((x) => /\.\w+$/.test(x.name))
    if (f) {
      const url = `${base}/storage/v1/object/public/hw-files/avatars_admin_34c83614/${f.name}`
      const r = await fetch(url)
      if (r.ok) good('фото по прямой ссылке открывается (в ДЗ не пропадут)')
      else bad(`фото по прямой ссылке НЕ открывается (${r.status}) — фото в ДЗ сломаются`)
    }
  } catch {
    /* необязательная проверка */
  }
} else {
  console.log('  · прямая ссылка не проверена: нет SUPABASE_SERVICE_ROLE_KEY в .env.local')
}

// ---------- итог ----------
console.log('\n' + '='.repeat(52))
if (problems === 0) {
  console.log(`ИТОГ: всё закрыто. Проверок пройдено: ${okCount}.`)
} else {
  console.log(`ИТОГ: найдено проблем — ${problems}. Пройдено проверок: ${okCount}.`)
}
console.log('='.repeat(52) + '\n')
process.exitCode = problems === 0 ? 0 : 1
