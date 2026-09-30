/**
 * Telegram support webhook — same UX as poller (/verify, no push).
 * Vars: BOT_TOKEN, ADMIN_CHAT_ID, SUPABASE_URL?, SUPABASE_SERVICE_ROLE_KEY?
 */

const TAG_RE = /\[#u(-?\d+)\]/
const BTN_SUPPORT = '✍️ Написать в поддержку'
const BTN_NEXT = '➡️ Следующее'
const BTN_PREV = '⬅️ Предыдущее'
const BTN_DELETE = '🗑 Удалить это'

const awaiting = new Map()
const adminIndex = new Map()

function apiUrl(token, method) {
  return `https://api.telegram.org/bot${token}/${method}`
}

async function tg(token, method, body) {
  const res = await fetch(apiUrl(token, method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json().catch(() => ({}))
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
    keyboard: [[{ text: BTN_PREV }, { text: BTN_NEXT }], [{ text: BTN_DELETE }]],
    resize_keyboard: true,
    is_persistent: true,
  }
}

function displayName(from) {
  if (!from) return ''
  return [from.first_name, from.last_name].filter(Boolean).join(' ')
}

async function sb(env, path, { method = 'GET', body, prefer } = {}) {
  const base = (env.SUPABASE_URL || '').replace(/\/$/, '')
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) return null
  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (prefer) headers.Prefer = prefer
  const res = await fetch(`${base}/rest/v1/${path}`, {
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
  if (!res.ok) throw new Error(`SB ${res.status}: ${text}`)
  return data
}

async function createTicket(env, from, bodyText) {
  const payload = {
    tg_user_id: String(from.id),
    tg_username: from.username || '',
    tg_name: displayName(from),
    body: String(bodyText || '').slice(0, 3500) || '(без текста)',
    status: 'open',
  }
  try {
    const rows = await sb(env, 'support_tickets', {
      method: 'POST',
      prefer: 'return=representation',
      body: payload,
    })
    if (rows?.[0]) return rows[0]
  } catch (e) {
    console.log('insert', e && e.message ? e.message : e)
  }
  return { id: `T${Date.now().toString(36)}`, ...payload }
}

async function listOpen(env) {
  try {
    const rows = await sb(
      env,
      'support_tickets?status=eq.open&select=id,tg_user_id,tg_username,tg_name,body&order=created_at.asc&limit=200',
    )
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

async function countAll(env) {
  try {
    const base = (env.SUPABASE_URL || '').replace(/\/$/, '')
    const key = env.SUPABASE_SERVICE_ROLE_KEY
    if (!base || !key) return 0
    const res = await fetch(`${base}/rest/v1/support_tickets?select=id`, {
      method: 'HEAD',
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
    })
    const range = res.headers.get('content-range') || ''
    const m = /\/(\d+)/.exec(range)
    return m ? Number(m[1]) : 0
  } catch {
    return 0
  }
}

function formatCard(totalAll, open, index) {
  if (!open.length) {
    return {
      text: `Всего вопросов (за всё время): ${totalAll}\nОткрытых сейчас: 0\n\nОбращений нет.`,
      has: false,
      index: 0,
    }
  }
  const i = Math.min(Math.max(index, 0), open.length - 1)
  const t = open[i]
  const uname = t.tg_username ? `@${t.tg_username}` : 'нет'
  const text = [
    `Всего: ${totalAll} вопросов`,
    `Открытых: ${open.length}`,
    '',
    `Обращение ${i + 1}/${open.length}`,
    '',
    `1. Вопрос:`,
    t.body || '(без текста)',
    '',
    `2. Юзернейм: ${uname}`,
    `3. Имя: ${t.tg_name || '—'}`,
    `4. ID: ${t.tg_user_id}`,
    '',
    `Ответь Reply на это сообщение.`,
    `[#u${t.tg_user_id}]`,
  ].join('\n')
  return { text: text.slice(0, 4000), has: true, index: i }
}

async function sendVerify(env, token, adminId, bump = 0) {
  const open = await listOpen(env)
  const totalAll = (await countAll(env)) || open.length
  let idx = adminIndex.get(adminId) || 0
  if (open.length) {
    idx = ((idx + bump) % open.length + open.length) % open.length
    if (bump === 0 && idx >= open.length) idx = 0
  } else idx = 0
  adminIndex.set(adminId, idx)
  const card = formatCard(totalAll, open, idx)
  adminIndex.set(adminId, card.index)
  await tg(token, 'sendMessage', {
    chat_id: adminId,
    text: card.text,
    reply_markup: adminKeyboard(card.has),
  })
}

async function handleUpdate(env, update) {
  const token = env.BOT_TOKEN
  const adminId = String(env.ADMIN_CHAT_ID || '')
  if (!token || !adminId) return

  const msg = update.message || update.edited_message
  if (!msg?.chat || msg.chat.type !== 'private') return
  const chatId = String(msg.chat.id)
  const text = (msg.text || '').trim()
  const isAdmin = chatId === adminId

  if (isAdmin) {
    if (text === '/start' || text === '/help') {
      await tg(token, 'sendMessage', {
        chat_id: chatId,
        text: 'Админ. /verify — очередь. Пуши выключены. Ответ — Reply на карточку.',
        reply_markup: { remove_keyboard: true },
      })
      return
    }
    if (text === '/verify') {
      adminIndex.set(adminId, 0)
      await sendVerify(env, token, adminId, 0)
      return
    }
    if (text === BTN_NEXT) {
      await sendVerify(env, token, adminId, 1)
      return
    }
    if (text === BTN_PREV) {
      await sendVerify(env, token, adminId, -1)
      return
    }
    if (text === BTN_DELETE) {
      const open = await listOpen(env)
      const idx = adminIndex.get(adminId) || 0
      if (open[idx]) {
        try {
          await sb(env, `support_tickets?id=eq.${encodeURIComponent(open[idx].id)}`, {
            method: 'PATCH',
            prefer: 'return=minimal',
            body: { status: 'closed', pending_send: false },
          })
        } catch (e) {
          console.log('close', e && e.message ? e.message : e)
        }
      }
      await sendVerify(env, token, adminId, 0)
      return
    }
    const reply = msg.reply_to_message
    if (!reply) {
      await tg(token, 'sendMessage', {
        chat_id: adminId,
        text: 'Reply на карточку /verify или снова /verify.',
      })
      return
    }
    const m = TAG_RE.exec(`${reply.text || ''}\n${reply.caption || ''}`)
    if (!m) {
      await tg(token, 'sendMessage', { chat_id: adminId, text: 'Не вижу [#u…].' })
      return
    }
    const ans = (msg.text || msg.caption || '').trim()
    if (!ans && !msg.photo?.length) {
      await tg(token, 'sendMessage', { chat_id: adminId, text: 'Пустой ответ.' })
      return
    }
    if (msg.photo?.length) {
      const best = msg.photo[msg.photo.length - 1]
      await tg(token, 'sendPhoto', {
        chat_id: m[1],
        photo: best.file_id,
        caption: ans ? `Ответ поддержки:\n${ans}`.slice(0, 1024) : 'Ответ поддержки (фото)',
      })
    } else {
      await tg(token, 'sendMessage', {
        chat_id: m[1],
        text: `Ответ поддержки:\n${ans}`.slice(0, 4000),
      })
    }
    await tg(token, 'sendMessage', { chat_id: adminId, text: '✓ Отправлено' })
    return
  }

  if (text === '/start' || text === '/help') {
    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text: 'Привет! Что вы хотели бы сделать?',
      reply_markup: studentKeyboard(),
    })
    return
  }
  if (text === BTN_SUPPORT) {
    awaiting.set(chatId, true)
    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text: 'Напишите ваш вопрос одним сообщением — передам администратору.',
      reply_markup: studentKeyboard(),
    })
    return
  }
  if (awaiting.get(chatId)) {
    const body =
      text ||
      (msg.photo?.length ? '(фото)' : '') ||
      (msg.document?.file_name ? msg.document.file_name : '') ||
      '(без текста)'
    await createTicket(env, msg.from, body)
    awaiting.delete(chatId)
    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text: 'Спасибо! Вопрос отправлен в поддержку. Ответ придёт сюда.',
      reply_markup: studentKeyboard(),
    })
    return
  }
  await tg(token, 'sendMessage', {
    chat_id: chatId,
    text: 'Нажмите кнопку «Написать в поддержку» внизу, затем отправьте вопрос одним сообщением.',
    reply_markup: studentKeyboard(),
  })
}

export default {
  async fetch(request, env) {
    if (request.method === 'GET') return new Response('rasp-tg-support ok', { status: 200 })
    if (request.method === 'POST') {
      try {
        await handleUpdate(env, await request.json())
      } catch (e) {
        console.log('webhook error', e && e.message ? e.message : e)
      }
      return new Response('ok')
    }
    return new Response('not found', { status: 404 })
  },
}
