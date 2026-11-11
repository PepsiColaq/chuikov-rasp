/**
 * Telegram support webhook (Cloudflare Worker).
 * Vars: BOT_TOKEN, ADMIN_CHAT_ID, WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * setWebhook must use the same secret_token as WEBHOOK_SECRET.
 */

const BTN_SUPPORT = '✍️ Написать в поддержку'
const BTN_REPLY = '✍️ Ответить'
const BTN_DELETE_ALL = '🗑 Удалить все обращения'
const BTN_NEXT = '➡️ Следующее'

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
    keyboard: [[{ text: BTN_REPLY }, { text: BTN_DELETE_ALL }], [{ text: BTN_NEXT }]],
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

const memState = new Map()

async function getState(env, chatId) {
  try {
    const rows = await sb(env, `tg_chat_state?chat_id=eq.${encodeURIComponent(chatId)}&select=*`)
    if (rows?.[0]) {
      memState.set(String(chatId), rows[0])
      return rows[0]
    }
  } catch {
    /* table may be missing until SQL applied */
  }
  return memState.get(String(chatId)) || null
}

async function setState(env, chatId, patch) {
  const prev = memState.get(String(chatId)) || {}
  const body = {
    chat_id: String(chatId),
    mode: 'idle',
    admin_index: 0,
    reply_ticket_id: null,
    reply_user_id: null,
    ...prev,
    ...patch,
    updated_at: new Date().toISOString(),
  }
  memState.set(String(chatId), body)
  try {
    await sb(env, 'tg_chat_state', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body,
    })
  } catch (e) {
    console.log('setState sb', e && e.message ? e.message : e)
  }
}

async function createTicket(env, from, bodyText) {
  const payload = {
    tg_user_id: String(from.id),
    tg_username: from.username || '',
    tg_name: displayName(from),
    body: String(bodyText || '').slice(0, 3500) || '(без текста)',
    status: 'open',
  }
  const rows = await sb(env, 'support_tickets', {
    method: 'POST',
    prefer: 'return=representation',
    body: payload,
  })
  if (!rows?.[0]) throw new Error('Не удалось сохранить обращение')
  return rows[0]
}

async function listOpen(env) {
  const rows = await sb(
    env,
    'support_tickets?status=eq.open&select=id,tg_user_id,tg_username,tg_name,body&order=created_at.asc&limit=200',
  )
  return Array.isArray(rows) ? rows : []
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

async function closeTicket(env, id) {
  await sb(env, `support_tickets?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: { status: 'closed', pending_send: false },
  })
}

async function closeAll(env) {
  const rows = await sb(env, 'support_tickets?status=neq.closed', {
    method: 'PATCH',
    prefer: 'return=representation',
    body: { status: 'closed', pending_send: false },
  })
  return Array.isArray(rows) ? rows.length : 0
}

async function flushPending(env, token) {
  const rows =
    (await sb(
      env,
      'support_tickets?pending_send=eq.true&select=id,tg_user_id,answer&limit=40',
    )) || []
  for (const t of rows) {
    const text = (t.answer || '').trim()
    if (!text || !t.tg_user_id) continue
    const r = await tg(token, 'sendMessage', {
      chat_id: t.tg_user_id,
      text: `Ответ поддержки:\n${text}`.slice(0, 4000),
    })
    if (r.ok) {
      await sb(env, `support_tickets?id=eq.${encodeURIComponent(t.id)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: { pending_send: false, status: 'answered' },
      })
    }
  }
}

function formatCard(totalAll, open, index) {
  if (!open.length) {
    return {
      text: `Всего: ${totalAll} вопросов\n\nОбращений нет.`,
      has: false,
      index: 0,
      ticket: null,
    }
  }
  const i = Math.min(Math.max(index, 0), open.length - 1)
  const t = open[i]
  const uname = t.tg_username ? `@${t.tg_username}` : 'нет'
  const text = [
    `Всего: ${totalAll} вопросов`,
    `Открытых: ${open.length} · сейчас ${i + 1}/${open.length}`,
    '',
    `Вопрос:`,
    t.body || '(без текста)',
    '',
    `Юзернейм: ${uname}`,
    `Имя: ${t.tg_name || '—'}`,
    `ID: ${t.tg_user_id}`,
  ].join('\n')
  return { text: text.slice(0, 4000), has: true, index: i, ticket: t }
}

async function sendVerify(env, token, adminId, bump = 0) {
  const open = await listOpen(env)
  const totalAll = Math.max(await countAll(env), open.length)
  const st = await getState(env, adminId)
  let idx = Number(st?.admin_index || 0)
  if (open.length) {
    idx = ((idx + bump) % open.length + open.length) % open.length
  } else idx = 0
  const card = formatCard(totalAll, open, idx)
  await setState(env, adminId, {
    mode: 'idle',
    admin_index: card.index,
    reply_ticket_id: null,
    reply_user_id: null,
  })
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

  try {
    await flushPending(env, token)
  } catch (e) {
    console.log('flush', e && e.message ? e.message : e)
  }

  const msg = update.message || update.edited_message
  if (!msg?.chat || msg.chat.type !== 'private') return
  const chatId = String(msg.chat.id)
  const text = (msg.text || '').trim()
  const isAdmin = chatId === adminId

  if (isAdmin) {
    const st = await getState(env, adminId)

    if (st?.mode === 'await_reply' && text && !text.startsWith('/') && text !== BTN_REPLY && text !== BTN_DELETE_ALL && text !== BTN_NEXT) {
      const userId = st.reply_user_id
      const ticketId = st.reply_ticket_id
      if (!userId) {
        await setState(env, adminId, { mode: 'idle', reply_ticket_id: null, reply_user_id: null })
        await tg(token, 'sendMessage', { chat_id: adminId, text: 'Сессия ответа сброшена. /verify' })
        return
      }
      const ans = (msg.text || msg.caption || '').trim()
      if (msg.photo?.length) {
        const best = msg.photo[msg.photo.length - 1]
        await tg(token, 'sendPhoto', {
          chat_id: userId,
          photo: best.file_id,
          caption: ans ? `Ответ поддержки:\n${ans}`.slice(0, 1024) : 'Ответ поддержки (фото)',
        })
      } else {
        await tg(token, 'sendMessage', {
          chat_id: userId,
          text: `Ответ поддержки:\n${ans}`.slice(0, 4000),
        })
      }
      if (ticketId) {
        try {
          await closeTicket(env, ticketId)
        } catch (e) {
          console.log('close', e && e.message ? e.message : e)
        }
      }
      await setState(env, adminId, { mode: 'idle', reply_ticket_id: null, reply_user_id: null })
      await tg(token, 'sendMessage', { chat_id: adminId, text: '✓ Ответ отправлен пользователю' })
      await sendVerify(env, token, adminId, 0)
      return
    }

    if (text === '/start' || text === '/help') {
      await tg(token, 'sendMessage', {
        chat_id: chatId,
        text: 'Админ поддержки.\n/verify — очередь. Пуши выключены.',
        reply_markup: { remove_keyboard: true },
      })
      return
    }
    if (text === '/verify') {
      await setState(env, adminId, { admin_index: 0 })
      await sendVerify(env, token, adminId, 0)
      return
    }
    if (text === BTN_REPLY) {
      const open = await listOpen(env)
      const st2 = await getState(env, adminId)
      const idx = Math.min(Number(st2?.admin_index || 0), Math.max(open.length - 1, 0))
      if (!open.length) {
        await tg(token, 'sendMessage', {
          chat_id: adminId,
          text: 'Обращений нет',
          reply_markup: adminKeyboard(false),
        })
        return
      }
      const t = open[idx]
      await setState(env, adminId, {
        mode: 'await_reply',
        reply_ticket_id: t.id,
        reply_user_id: String(t.tg_user_id),
        admin_index: idx,
      })
      await tg(token, 'sendMessage', {
        chat_id: adminId,
        text: 'Напишите ответ:',
        reply_markup: { force_reply: true, selective: true },
      })
      return
    }
    if (text === BTN_DELETE_ALL) {
      const n = await closeAll(env)
      await setState(env, adminId, { mode: 'idle', admin_index: 0 })
      await tg(token, 'sendMessage', {
        chat_id: adminId,
        text: n ? `Удалено обращений: ${n}` : 'Обращений нет',
        reply_markup: adminKeyboard(false),
      })
      return
    }
    if (text === BTN_NEXT) {
      await sendVerify(env, token, adminId, 1)
      return
    }
    await tg(token, 'sendMessage', {
      chat_id: adminId,
      text: 'Команда: /verify',
    })
    return
  }

  // student
  if (text === '/start' || text === '/help') {
    await setState(env, chatId, { mode: 'idle' })
    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text: 'Привет! Что вы хотели бы сделать?',
      reply_markup: studentKeyboard(),
    })
    return
  }
  if (text === BTN_SUPPORT) {
    await setState(env, chatId, { mode: 'await_question' })
    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text: 'Напишите ваш вопрос одним сообщением — передам администратору.',
      reply_markup: studentKeyboard(),
    })
    return
  }

  const st = await getState(env, chatId)
  if (st?.mode === 'await_question') {
    const body =
      text ||
      (msg.photo?.length ? '(фото)' : '') ||
      (msg.document?.file_name ? msg.document.file_name : '') ||
      '(без текста)'
    try {
      await createTicket(env, msg.from, body)
      await setState(env, chatId, { mode: 'idle' })
      await tg(token, 'sendMessage', {
        chat_id: chatId,
        text: 'Спасибо! Вопрос отправлен в поддержку. Ответ придёт сюда.',
        reply_markup: studentKeyboard(),
      })
    } catch (e) {
      await tg(token, 'sendMessage', {
        chat_id: chatId,
        text: 'Не удалось отправить. Попробуйте позже.',
        reply_markup: studentKeyboard(),
      })
    }
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
    if (request.method === 'GET') {
      return new Response('rasp-tg-support ok', { status: 200 })
    }
    if (request.method === 'POST') {
      const secret = env.WEBHOOK_SECRET || ''
      if (secret) {
        const hdr = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || ''
        if (hdr !== secret) {
          return new Response('forbidden', { status: 403 })
        }
      }
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
