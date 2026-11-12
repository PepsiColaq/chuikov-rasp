import { createClient } from '@supabase/supabase-js'

const PROXY = (import.meta.env.VITE_SUPABASE_PROXY_URL || import.meta.env.VITE_SUPABASE_URL || '')
  .replace(/\/$/, '')
const DIRECT = (import.meta.env.VITE_SUPABASE_DIRECT_URL || '').replace(/\/$/, '')
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

/** Базовый URL клиента: прокси если есть, иначе прямой */
const primary = PROXY || DIRECT

export const supabaseConfigured = Boolean(primary && anon && !primary.includes('YOUR_'))

const FETCH_MS = 12000
/** Первая попытка не должна съедать весь таймаут: иначе при VPN ждём мёртвый хост. */
const FIRST_MS = 5500

/** Какой хост ответил последним успешно — дальше пробуем его первым */
let preferred = null // 'proxy' | 'direct'

function hostsFor(url) {
  const u = new URL(typeof url === 'string' ? url : url.url)
  const path = u.pathname + u.search
  const list = []
  const push = (kind, base) => {
    if (!base) return
    list.push({ kind, href: base + path })
  }
  // Прокси (Cloudflare Worker) доступен и из РФ, и через VPN — он первый.
  // Прямой supabase.co часто режется DPI, а под VPN может «висеть» до таймаута.
  if (preferred === 'direct') {
    push('direct', DIRECT)
    push('proxy', PROXY)
  } else if (preferred === 'proxy') {
    push('proxy', PROXY)
    push('direct', DIRECT)
  } else {
    push('proxy', PROXY)
    push('direct', DIRECT)
    if (!list.length) push('proxy', primary)
  }
  // убрать дубли
  const seen = new Set()
  return list.filter((x) => {
    if (seen.has(x.href)) return false
    seen.add(x.href)
    return true
  })
}

function isNetworkFail(err) {
  if (!err) return true
  const m = err.message || String(err)
  return /abort|timeout|Failed to fetch|NetworkError|Load failed|Таймаут|network/i.test(m)
}

async function oneFetch(href, init, ms) {
  const ctrl = new AbortController()
  const outer = init?.signal
  if (outer) {
    if (outer.aborted) ctrl.abort()
    else outer.addEventListener('abort', () => ctrl.abort(), { once: true })
  }
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(href, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Проверить оба хоста параллельно и запомнить живой. Вызывается один раз при старте. */
export async function probeHosts() {
  const list = [
    ['proxy', PROXY],
    ['direct', DIRECT],
  ].filter(([, base]) => base)
  if (!list.length) return null
  if (list.length === 1) {
    preferred = list[0][0]
    return preferred
  }
  const results = await Promise.all(
    list.map(async ([kind, base]) => {
      try {
        const r = await oneFetch(`${base}/rest/v1/`, { method: 'GET', headers: { apikey: anon } }, 5000)
        return r.ok || r.status === 400 || r.status === 401 || r.status === 404 ? kind : null
      } catch {
        return null
      }
    }),
  )
  // Предпочитаем прокси, если живы оба: он одинаково работает в РФ и за рубежом.
  preferred = results[0] || results[1] || preferred
  return preferred
}

if (typeof window !== 'undefined') {
  // Не ждём: пусть проверка идёт параллельно с загрузкой данных.
  void probeHosts()
  window.addEventListener('online', () => {
    void probeHosts()
  })
}

/**
 * Диагностика для экрана поддержки: что реально отвечает — прямой Supabase,
 * прокси или GitHub. Показывает задержку в мс, чтобы отличить «медленно»
 * от «заблокировано» (например, под VPN).
 */
export async function checkConnectivity() {
  const rows = []
  const probe = async (name, href) => {
    const t0 = Date.now()
    try {
      const r = await oneFetch(href, { method: 'GET', headers: { apikey: anon } }, 6000)
      const ok = r.status < 500
      rows.push({ name, ok, ms: Date.now() - t0, status: r.status })
      return ok
    } catch (e) {
      rows.push({ name, ok: false, ms: Date.now() - t0, status: 0, error: String(e?.message || e) })
      return false
    }
  }

  if (DIRECT) await probe('Supabase (напрямую)', `${DIRECT}/rest/v1/`)
  if (PROXY && PROXY !== DIRECT) await probe('Прокси Cloudflare', `${PROXY}/rest/v1/`)
  try {
    await probe('Сайт (GitHub)', `${location.origin}/index.html?ping=${Date.now()}`)
  } catch {
    /* ignore */
  }
  preferred = rows.find((r) => r.ok && r.name.startsWith('Прокси'))
    ? 'proxy'
    : rows.find((r) => r.ok && r.name.startsWith('Supabase'))
      ? 'direct'
      : preferred
  return rows
}

/** Чтение (GET/HEAD) гоним на оба хоста сразу — первый ответивший и побеждает. */
async function raceRead(targets, init) {
  const attempts = targets.map((t) =>
    oneFetch(t.href, init, FETCH_MS).then((resp) => {
      preferred = t.kind
      return resp
    }),
  )
  try {
    return await Promise.any(attempts)
  } catch (e) {
    const reasons = e?.errors || []
    const net = reasons.find((x) => !isNetworkFail(x))
    throw net || reasons[0] || e
  }
}

/** REST/Storage: пробуем direct и proxy, запоминаем рабочий */
async function smartFetch(input, init = {}) {
  const targets = hostsFor(input)
  if (!targets.length) throw new Error('Нет URL Supabase')

  const method = String(init?.method || 'GET').toUpperCase()
  // Запись (RPC, POST/PATCH) — только последовательно: иначе можно записать дважды.
  if (method === 'GET' || method === 'HEAD') return raceRead(targets, init)

  let lastErr = null
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]
    try {
      const resp = await oneFetch(t.href, init, i === 0 && !preferred ? FIRST_MS : FETCH_MS)
      preferred = t.kind
      return resp
    } catch (e) {
      lastErr = e
      if (!isNetworkFail(e)) throw e
    }
  }
  throw lastErr || new Error('Нет связи с сервером')
}

export const supabase = supabaseConfigured
  ? createClient(primary, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: smartFetch },
      // Realtime через прокси часто рвётся → шторм reconnect и лаги. Отключаем.
      realtime: { params: { eventsPerSecond: 0 } },
    })
  : null

export function rpcErrorMessage(err) {
  if (!err) return 'Ошибка сети'
  const m = err.message || String(err)
  if (/abort|timeout|Failed to fetch|NetworkError|Load failed|Таймаут/i.test(m)) {
    return 'Нет связи с сервером. Проверь интернет и обнови страницу.'
  }
  const tip = m.replace(/^.*error:\s*/i, '').split('\n')[0]
  return tip || m
}

export function withTimeout(promise, ms = FETCH_MS, label = 'запрос') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Таймаут ${label}`)), ms)
    }),
  ])
}

/** Канонический URL файла в Storage на прямом хосте (для записи в БД). */
export function toDirectStorageUrl(url) {
  try {
    const u = new URL(url)
    if (!u.pathname.includes('/storage/v1/object/')) return url
    if (DIRECT) return `${DIRECT}${u.pathname}${u.search}`
    return u.href
  } catch {
    return url
  }
}

/** Варианты URL файла: сначала прямой, потом прокси (как у API). */
export function storageUrlCandidates(url) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return []
    const path = u.pathname + u.search
    const out = []
    const add = (base) => {
      if (!base) return
      const href = `${base}${path}`
      if (!out.includes(href)) out.push(href)
    }
    const isStorageObject = u.pathname.includes('/storage/v1/object/')
    if (isStorageObject) {
      if (preferred === 'proxy') {
        add(PROXY)
        add(DIRECT)
      } else {
        add(DIRECT)
        add(PROXY)
      }
    }
    // Всегда оставляем исходный URL — иначе фото выпадает из галереи
    if (!out.includes(u.href)) out.push(u.href)
    return out
  } catch {
    return typeof url === 'string' && /^https?:\/\//i.test(url) ? [url] : []
  }
}

/** Скачать файл через failover (direct↔proxy) → blob: URL */
export async function fetchStorageObjectUrl(url) {
  const list = storageUrlCandidates(url)
  let lastErr = null
  for (const href of list) {
    try {
      const resp = await oneFetch(href, {}, 25000)
      if (!resp.ok) {
        lastErr = new Error(`HTTP ${resp.status}`)
        continue
      }
      const blob = await resp.blob()
      if (href.includes('workers.dev')) preferred = 'proxy'
      else preferred = 'direct'
      return URL.createObjectURL(blob)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('Не удалось скачать файл')
}
