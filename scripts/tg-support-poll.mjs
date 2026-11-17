/**
 * Telegram support bot (long-poll).
 * Admin: /verify → card + buttons Ответить / Удалить все.
 * After Ответить → «Напишите ответ:» → next message goes to student.
 *
 *   node scripts/tg-support-poll.mjs --loop
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TOKEN = process.env.TG_BOT_TOKEN
const ADMIN = String(process.env.TG_ADMIN_CHAT_ID || '')
const SB_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_DIRECT_URL || '').replace(
  /\/$/,
  '',
)
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Без токена и админ-чата бот не сможет ни читать сообщения, ни отвечать.
if (!TOKEN) {
  console.error('Нет TG_BOT_TOKEN: задай переменную окружения или GitHub Secret.')
  process.exit(1)
}
if (!ADMIN) {
  console.error('Нет TG_ADMIN_CHAT_ID: задай переменную окружения или GitHub Secret.')
  process.exit(1)
}

const BTN_SUPPORT = '✍️ Написать в поддержку'
const BTN_REPLY = '✍️ Ответить'
const BTN_DELETE_ALL = '🗑 Удалить все обращения'
const BTN_NEXT = '➡️ Следующее'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const STORE_PATH = join(ROOT, 'scripts', '.tg-support-store.json')

if (!TOKEN) {
  console.error('TG_BOT_TOKEN missing')
  process.exit(1)
}

async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  return res.json()
}

/**
 * Ошибка, после которой крутить цикл бессмысленно.
 *
 * Было: при недействительном токене Telegram отвечал 401 на каждый
 * getUpdates, once() писал ошибку в лог и возвращался, а цикл main()
 * тут же звал once() снова. За 4,5 минуты набегало 817 одинаковых
 * «401 Unauthorized» — по логу невозможно было понять, что случилось.
 *
 * Стало: 401/403 — это «токен мёртв», выходим сразу и говорим,
 * что именно делать. Остальные ошибки (сеть, 502 от Telegram) —
 * не повод падать, но и не повод долбить сервер: пауза перед повтором.
 */
class FatalBotError extends Error {}

function isAuthError(r) {
  return r && (r.error_code === 401 || r.error_code === 403)
}

function authHelp(where) {
  return [
    `Бот не авторизовался (${where}): ${'401/403 Unauthorized'}.`,
    'Токен недействителен или отозван.',
    'Что делать: открыть @BotFather → /mybots → выбрать бота → API Token,',
    'скопировать новый токен и обновить GitHub Secret TG_BOT_TOKEN',
    '(Settings → Secrets and variables → Actions). Больше ничего менять не нужно.',
  ].join('\n')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Проверить токен до начала работы.
 * Возвращает username бота или бросает FatalBotError.
 */
async function checkToken() {
  let me = null
  let lastErr = null
  // Сеть на собираемой машине может моргнуть. Один сетевой сбой — не повод
  // падать: три попытки, потом уже честно говорим, что не дозвонились.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      me = await tg('getMe', {})
      break
    } catch (e) {
      lastErr = e
      if (attempt < 3) await sleep(4000)
    }
  }
  if (!me) {
    throw new FatalBotError(
      `Не удалось связаться с api.telegram.org за 3 попытки: ${lastErr?.message || lastErr}. ` +
        'Проверь настройки сети у раннера (или что Telegram не заблокирован).',
    )
  }
  if (!me.ok) {
    if (isAuthError(me)) throw new FatalBotError(authHelp('getMe'))
    throw new FatalBotError(`getMe не сработал: ${me.error_code} ${me.description || ''}`)
  }
  return me.result?.username || 'bot'
}

function studentKeyboard() {
  return {
    keyboard: [[{ text: BTN_SUPPORT }]],
    resize_keyboard: true,
    is_persistent: true,
  }
}

function adminKeyboard(hasTickets) {
  if (!hasTickets) return { remove_keyboard: true }
  return {
    keyboard: [[{ text: BTN_REPLY }, { text: BTN_DELETE_ALL }], [{ text: BTN_NEXT }]],
    resize_keyboard: true,
    is_persistent: true,
  }
}

function emptyStore() {
  return { offset: 0, awaiting: {}, tickets: [], adminIndex: 0, adminReplyTo: null }
}

function readLocalStore() {
  try {
    if (!existsSync(STORE_PATH)) return emptyStore()
    const raw = JSON.parse(readFileSync(STORE_PATH, 'utf8'))
    return {
      offset: Number(raw.offset || 0),
      awaiting: raw.awaiting && typeof raw.awaiting === 'object' ? raw.awaiting : {},
      tickets: Array.isArray(raw.tickets) ? raw.tickets : [],
      adminIndex: Number(raw.adminIndex || 0),
      adminReplyTo: raw.adminReplyTo || null,
    }
  } catch {
    return emptyStore()
  }
}

function writeLocalStore(store) {
  try {
    mkdirSync(dirname(STORE_PATH), { recursive: true })
    writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8')
  } catch (e) {
    console.error('save store', e.message || e)
  }
}

/**
 * Состояние бота между запусками.
 *
 * Было: только файл scripts/.tg-support-store.json. Он в .gitignore,
 * а GitHub Actions каждый запуск поднимает чистую машину — файла нет.
 * Поэтому offset каждый раз начинался с нуля, Telegram заново отдавал
 * те же сообщения, а «жду вопроса от студента» терялось. Снаружи это
 * выглядело как «бот не работает».
 *
 * Стало: главное хранилище — таблица tg_bot_state в Supabase,
 * файл остался резервом для локального запуска (если нет ключей).
 */
let storeLoaded = null

async function loadStore() {
  if (storeLoaded) return storeLoaded
  if (SB_URL && SB_KEY) {
    try {
      const rows = await sb('tg_bot_state?key=eq.cli&select=value')
      const value = rows?.[0]?.value
      if (value && typeof value === 'object') {
        storeLoaded = {
          offset: Number(value.offset || 0),
          awaiting: value.awaiting && typeof value.awaiting === 'object' ? value.awaiting : {},
          tickets: Array.isArray(value.tickets) ? value.tickets : [],
          adminIndex: Number(value.adminIndex || 0),
          adminReplyTo: value.adminReplyTo || null,
        }
        return storeLoaded
      }
    } catch (e) {
      console.error('load store from supabase', e.message || e)
    }
  }
  storeLoaded = readLocalStore()
  return storeLoaded
}

async function saveStore(store) {
  storeLoaded = store
  // Локальная копия — чтобы отладка без сети работала как раньше.
  writeLocalStore(store)
  if (!SB_URL || !SB_KEY) return
  try {
    await sb('tg_bot_state?on_conflict=key', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: { key: 'cli', value: store, updated_at: new Date().toISOString() },
    })
  } catch (e) {
    console.error('save store to supabase', e.message || e)
  }
}

async function sb(path, { method = 'GET', body, prefer } = {}) {
  if (!SB_URL || !SB_KEY) return null
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (prefer) headers.Prefer = prefer
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`)
  return data
}

function displayName(from) {
  if (!from) return ''
  return [from.first_name, from.last_name].filter(Boolean).join(' ')
}

function normalizeTicket(t) {
  return {
    id: t.id,
    tgUserId: String(t.tgUserId || t.tg_user_id || ''),
    tgUsername: t.tgUsername || t.tg_username || '',
    tgName: t.tgName || t.tg_name || '',
    body: t.body || '',
    status: t.status || 'open',
  }
}

async function createTicket(store, from, body) {
  const payload = {
    tg_user_id: String(from.id),
    tg_username: from.username || '',
    tg_name: displayName(from),
    body: String(body || '').slice(0, 3500) || '(без текста)',
    status: 'open',
  }
  try {
    const rows = await sb('support_tickets', {
      method: 'POST',
      prefer: 'return=representation',
      body: payload,
    })
    if (rows?.[0]) return normalizeTicket(rows[0])
  } catch (e) {
    console.error('sb insert', e.message || e)
  }
  const id = `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const row = { id, ...payload, created_at: new Date().toISOString() }
  store.tickets.unshift(row)
  store.tickets = store.tickets.slice(0, 500)
  return normalizeTicket(row)
}

async function listOpenTickets(store) {
  try {
    const rows = await sb(
      'support_tickets?status=eq.open&select=id,tg_user_id,tg_username,tg_name,body,status&order=created_at.asc&limit=200',
    )
    if (Array.isArray(rows)) return rows.map(normalizeTicket)
  } catch (e) {
    console.error('sb list', e.message || e)
  }
  return store.tickets.filter((t) => t.status === 'open').map(normalizeTicket)
}

async function countAllTickets(store) {
  if (SB_URL && SB_KEY) {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/support_tickets?select=id`, {
        method: 'HEAD',
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          Prefer: 'count=exact',
        },
      })
      const range = res.headers.get('content-range') || ''
      const m = /\/(\d+)/.exec(range)
      if (m) return Number(m[1])
    } catch {
      /* local */
    }
  }
  return store.tickets.length
}

async function closeTicket(store, id) {
  try {
    await sb(`support_tickets?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: { status: 'closed', pending_send: false },
    })
  } catch (e) {
    console.error('sb close', e.message || e)
  }
  store.tickets = store.tickets.map((t) =>
    t.id === id ? { ...t, status: 'closed' } : t,
  )
}

async function closeAllTickets(store) {
  let n = 0
  try {
    const rows = await sb('support_tickets?status=neq.closed', {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { status: 'closed', pending_send: false },
    })
    if (Array.isArray(rows)) n = rows.length
  } catch (e) {
    console.error('sb close all', e.message || e)
  }
  const localOpen = store.tickets.filter((t) => t.status === 'open').length
  store.tickets = store.tickets.map((t) =>
    t.status === 'open' ? { ...t, status: 'closed' } : t,
  )
  store.adminReplyTo = null
  return Math.max(n, localOpen)
}

async function flushPendingReplies() {
  if (!SB_URL || !SB_KEY) return 0
  let rows = []
  try {
    rows =
      (await sb(
        'support_tickets?pending_send=eq.true&select=id,tg_user_id,answer&limit=40',
      )) || []
  } catch {
    return 0
  }
  let n = 0
  for (const t of rows) {
    const text = (t.answer || '').trim()
    if (!text || !t.tg_user_id) continue
    const r = await tg('sendMessage', {
      chat_id: t.tg_user_id,
      text: `Ответ поддержки:\n${text}`.slice(0, 4000),
    })
    if (r.ok) {
      await sb(`support_tickets?id=eq.${encodeURIComponent(t.id)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: { pending_send: false, status: 'answered' },
      })
      n++
    }
  }
  return n
}

function clampIndex(store, total) {
  if (total <= 0) {
    store.adminIndex = 0
    return 0
  }
  if (store.adminIndex < 0) store.adminIndex = 0
  if (store.adminIndex >= total) store.adminIndex = total - 1
  return store.adminIndex
}

function formatCard(totalAll, openItems, index) {
  const totalOpen = openItems.length
  if (!totalOpen) {
    return {
      text: `Всего: ${totalAll} вопросов\n\nОбращений нет.`,
      hasTickets: false,
      ticket: null,
      index: 0,
    }
  }
  const i = Math.min(Math.max(index, 0), totalOpen - 1)
  const t = openItems[i]
  const uname = t.tgUsername ? `@${t.tgUsername}` : 'нет'
  const text = [
    `Всего: ${totalAll} вопросов`,
    `Открытых: ${totalOpen} · сейчас ${i + 1}/${totalOpen}`,
    '',
    `Вопрос:`,
    t.body || '(без текста)',
    '',
    `Юзернейм: ${uname}`,
    `Имя: ${t.tgName || '—'}`,
    `ID: ${t.tgUserId}`,
  ].join('\n')
  return { text: text.slice(0, 4000), hasTickets: true, ticket: t, index: i }
}

async function sendVerify(store, adminId, { bump = 0 } = {}) {
  store.adminReplyTo = null
  const open = await listOpenTickets(store)
  const totalAll = Math.max(await countAllTickets(store), open.length)
  if (bump) store.adminIndex = clampIndex(store, open.length) + bump
  const idx = clampIndex(store, open.length)
  const card = formatCard(totalAll, open, idx)
  store.adminIndex = card.index
  await tg('sendMessage', {
    chat_id: adminId,
    text: card.text,
    reply_markup: adminKeyboard(card.hasTickets),
  })
  return card
}

async function handleMessage(store, adminId, msg) {
  if (!msg?.chat || msg.chat.type !== 'private') return
  const chatId = String(msg.chat.id)
  const text = (msg.text || '').trim()
  const isAdmin = chatId === String(adminId)

  if (isAdmin) {
    // Waiting for answer text after «Ответить»
    if (store.adminReplyTo && text && !text.startsWith('/') && text !== BTN_REPLY && text !== BTN_DELETE_ALL && text !== BTN_NEXT) {
      const target = store.adminReplyTo
      const answer = (msg.text || msg.caption || '').trim()
      if (!answer && !msg.photo?.length) {
        await tg('sendMessage', {
          chat_id: adminId,
          text: 'Пусто. Напишите ответ текстом:',
          reply_markup: adminKeyboard(true),
        })
        return
      }
      if (msg.photo?.length) {
        const best = msg.photo[msg.photo.length - 1]
        await tg('sendPhoto', {
          chat_id: target.tgUserId,
          photo: best.file_id,
          caption: answer ? `Ответ поддержки:\n${answer}`.slice(0, 1024) : 'Ответ поддержки (фото)',
        })
      } else {
        await tg('sendMessage', {
          chat_id: target.tgUserId,
          text: `Ответ поддержки:\n${answer}`.slice(0, 4000),
        })
      }
      await closeTicket(store, target.id)
      store.adminReplyTo = null
      await tg('sendMessage', {
        chat_id: adminId,
        text: '✓ Ответ отправлен пользователю',
      })
      await sendVerify(store, adminId)
      return
    }

    if (text === '/start' || text === '/help') {
      store.adminReplyTo = null
      await tg('sendMessage', {
        chat_id: chatId,
        text: 'Админ поддержки.\n\n/verify — смотреть обращения.\nПуши выключены.',
        reply_markup: { remove_keyboard: true },
      })
      return
    }

    if (text === '/verify') {
      store.adminIndex = 0
      await sendVerify(store, adminId)
      return
    }

    if (text === BTN_REPLY) {
      const open = await listOpenTickets(store)
      const idx = clampIndex(store, open.length)
      if (!open.length) {
        await tg('sendMessage', {
          chat_id: adminId,
          text: 'Обращений нет',
          reply_markup: adminKeyboard(false),
        })
        return
      }
      const t = open[idx]
      store.adminReplyTo = { id: t.id, tgUserId: t.tgUserId }
      await tg('sendMessage', {
        chat_id: adminId,
        text: 'Напишите ответ:',
        reply_markup: { force_reply: true, selective: true },
      })
      return
    }

    if (text === BTN_DELETE_ALL) {
      const n = await closeAllTickets(store)
      await tg('sendMessage', {
        chat_id: adminId,
        text: n ? `Удалено обращений: ${n}` : 'Обращений нет',
        reply_markup: adminKeyboard(false),
      })
      return
    }

    if (text === BTN_NEXT) {
      await sendVerify(store, adminId, { bump: 1 })
      return
    }

    // old buttons
    if (text === '📥 Обращения' || text === '🗑 Удалить все' || text === '⬅️ Предыдущее' || text === '🗑 Удалить это') {
      await sendVerify(store, adminId)
      return
    }

    await tg('sendMessage', {
      chat_id: adminId,
      text: 'Команда: /verify\nИли кнопки: Ответить / Удалить все обращения',
    })
    return
  }

  // student
  if (text === '/start' || text === '/help') {
    await tg('sendMessage', {
      chat_id: chatId,
      text: 'Привет! Что вы хотели бы сделать?',
      reply_markup: studentKeyboard(),
    })
    return
  }
  if (text === BTN_SUPPORT) {
    store.awaiting[chatId] = true
    await tg('sendMessage', {
      chat_id: chatId,
      text: 'Напишите ваш вопрос одним сообщением — передам администратору.',
      reply_markup: studentKeyboard(),
    })
    return
  }
  if (store.awaiting[chatId]) {
    const body =
      text ||
      (msg.photo?.length ? '(фото)' : '') ||
      (msg.document?.file_name ? msg.document.file_name : '') ||
      '(без текста)'
    await createTicket(store, msg.from, body)
    delete store.awaiting[chatId]
    await tg('sendMessage', {
      chat_id: chatId,
      text: 'Спасибо! Вопрос отправлен в поддержку. Ответ придёт сюда.',
      reply_markup: studentKeyboard(),
    })
    return
  }
  await tg('sendMessage', {
    chat_id: chatId,
    text: 'Нажмите кнопку «Написать в поддержку» внизу, затем отправьте вопрос одним сообщением.',
    reply_markup: studentKeyboard(),
  })
}

/**
 * Проверить, отвечает ли адрес webhook.
 *
 * Нужно, чтобы не снести рабочий webhook: если воркер оживёт после
 * передеплоя, скрипт не должен его отключать и перехватывать сообщения
 * на себя.
 *
 * @returns {Promise<boolean>} true — адрес живой
 */
async function webhookAlive(url) {
  if (!url) return false
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 8000)
    const res = await fetch(url, { method: 'GET', signal: ctl.signal })
    clearTimeout(timer)
    // Воркер на GET обычно отвечает 200/405 — главное, что он существует.
    // 404 — типичный ответ Cloudflare на незадеплоенный воркер.
    return res.status !== 404
  } catch {
    return false
  }
}

/**
 * Снять webhook, если он указывает в мёртвый адрес.
 *
 * Зачем: production-схема — Cloudflare Worker с webhook. Но воркер
 * rasp-tg-support отдаёт 404 (не задеплоен). Telegram продолжает стучаться
 * в мёртвый адрес, на getUpdates отвечает 409, а старый код на 409 просто
 * выходил. В итоге сообщения не доходили вовсе: последнее обращение
 * в базе — 13 октября, ровно с момента падения воркера.
 *
 * Живой webhook не трогаем никогда — иначе после передеплоя воркера
 * скрипт начал бы перехватывать сообщения на себя.
 */
async function dropDeadWebhook() {
  const info = await tg('getWebhookInfo', {})
  const url = info?.result?.url || ''
  if (!url) return false
  if (await webhookAlive(url)) {
    console.log('webhook жив, не трогаем:', url)
    return false
  }
  const r = await tg('deleteWebhook', { drop_pending_updates: false })
  if (!r.ok) {
    console.error('deleteWebhook failed', r)
    return false
  }
  console.log('webhook указывал в мёртвый адрес, снят:', url)
  return true
}

async function once() {
  const store = await loadStore()
  const adminId = ADMIN

  try {
    const sent = await flushPendingReplies()
    if (sent) console.log('flushed replies', sent)
  } catch (e) {
    console.error('flush', e.message || e)
  }

  let offset = store.offset || 0
  const ask = () =>
    tg('getUpdates', {
      offset: offset || undefined,
      timeout: process.argv.includes('--loop') ? 25 : 0,
      allowed_updates: ['message'],
    })

  let updates = await ask()

  // 409 — значит стоит webhook. Если он указывает в мёртвый воркер,
  // опрос не запустится никогда. Снимаем и пробуем ещё раз.
  if (!updates.ok && updates.error_code === 409) {
    const dropped = await dropDeadWebhook()
    if (dropped) {
      updates = await ask()
    } else {
      console.log('webhook активен и не снят — пропускаю этот запуск')
      return
    }
  }

  if (!updates.ok) {
    if (isAuthError(updates)) throw new FatalBotError(authHelp('getUpdates'))
    const text = `getUpdates: ${updates.error_code} ${updates.description || ''}`
    console.error(text)
    // Не крутим цикл вхолостую: при 5-секундном ожидании Telegram
    // лишняя пауза ничего не ломает, а при ошибке — спасает лог.
    if (process.argv.includes('--loop')) await sleep(5000)
    return
  }

  for (const u of updates.result || []) {
    offset = Math.max(offset, u.update_id + 1)
    if (u.message) {
      try {
        await handleMessage(store, adminId, u.message)
      } catch (e) {
        console.error('handle', e)
      }
    }
  }
  store.offset = offset
  await saveStore(store)
  if ((updates.result || []).length) {
    console.log('processed', updates.result.length, 'offset', offset)
  }
}

async function main() {
  const loop = process.argv.includes('--loop')
  const minArg = process.argv.find((a) => a.startsWith('--minutes='))
  const minutes = minArg ? Number(minArg.split('=')[1]) : 0

  // До первого getUpdates убеждаемся, что токен вообще рабочий.
  // Один запрос вместо сотни бесполезных в логе.
  const botName = await checkToken()
  console.log('бот на связи:', botName)

  if (loop || minutes > 0) {
    const until = minutes > 0 ? Date.now() + minutes * 60 * 1000 : Infinity
    console.log('tg-support poller loop, admin=', ADMIN, minutes ? `for ${minutes}m` : 'forever')
    // Make getUpdates long-poll when looping
    if (!process.argv.includes('--loop')) process.argv.push('--loop')
    let failures = 0
    while (Date.now() < until) {
      try {
        await once()
        failures = 0
      } catch (e) {
        if (e instanceof FatalBotError) throw e
        failures++
        // 3с, 6с, 12с… но не больше минуты — иначе GitHub убьёт job раньше.
        const wait = Math.min(60000, 3000 * 2 ** Math.min(failures - 1, 5))
        console.error('loop error', e.message || e, `— повтор через ${Math.round(wait / 1000)}с`)
        await sleep(wait)
      }
    }
    console.log('loop window done')
    return
  }
  await once()
}

main().catch((e) => {
  if (e instanceof FatalBotError) {
    console.error('\n' + e.message + '\n')
    process.exit(1)
  }
  console.error(e)
  process.exit(1)
})
