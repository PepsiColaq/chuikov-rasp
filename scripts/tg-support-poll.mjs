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
const ADMIN = String(process.env.TG_ADMIN_CHAT_ID || '1070877182')
const SB_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_DIRECT_URL || '').replace(
  /\/$/,
  '',
)
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

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

function loadStore() {
  try {
    if (!existsSync(STORE_PATH)) {
      return { offset: 0, awaiting: {}, tickets: [], adminIndex: 0, adminReplyTo: null }
    }
    const raw = JSON.parse(readFileSync(STORE_PATH, 'utf8'))
    return {
      offset: Number(raw.offset || 0),
      awaiting: raw.awaiting && typeof raw.awaiting === 'object' ? raw.awaiting : {},
      tickets: Array.isArray(raw.tickets) ? raw.tickets : [],
      adminIndex: Number(raw.adminIndex || 0),
      adminReplyTo: raw.adminReplyTo || null,
    }
  } catch {
    return { offset: 0, awaiting: {}, tickets: [], adminIndex: 0, adminReplyTo: null }
  }
}

function saveStore(store) {
  try {
    mkdirSync(dirname(STORE_PATH), { recursive: true })
    writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8')
  } catch (e) {
    console.error('save store', e.message || e)
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

async function once() {
  const store = loadStore()
  const adminId = ADMIN
  await tg('deleteWebhook', { drop_pending_updates: false }).catch(() => {})

  let offset = store.offset || 0
  const updates = await tg('getUpdates', {
    offset: offset || undefined,
    timeout: process.argv.includes('--loop') ? 25 : 0,
    allowed_updates: ['message'],
  })
  if (!updates.ok) {
    console.error(updates)
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
  saveStore(store)
  if ((updates.result || []).length) {
    console.log('processed', updates.result.length, 'offset', offset)
  }
}

async function main() {
  const loop = process.argv.includes('--loop')
  const minArg = process.argv.find((a) => a.startsWith('--minutes='))
  const minutes = minArg ? Number(minArg.split('=')[1]) : 0

  if (loop || minutes > 0) {
    const until = minutes > 0 ? Date.now() + minutes * 60 * 1000 : Infinity
    console.log('tg-support poller loop, admin=', ADMIN, minutes ? `for ${minutes}m` : 'forever')
    // Make getUpdates long-poll when looping
    if (!process.argv.includes('--loop')) process.argv.push('--loop')
    while (Date.now() < until) {
      try {
        await once()
      } catch (e) {
        console.error('loop error', e)
        await new Promise((r) => setTimeout(r, 3000))
      }
    }
    console.log('loop window done')
    return
  }
  await once()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
