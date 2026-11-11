import { createClient } from '@supabase/supabase-js'

const PROXY = (import.meta.env.VITE_SUPABASE_PROXY_URL || import.meta.env.VITE_SUPABASE_URL || '')
  .replace(/\/$/, '')
const DIRECT = (import.meta.env.VITE_SUPABASE_DIRECT_URL || '').replace(/\/$/, '')
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

/** Базовый URL клиента: прокси если есть, иначе прямой */
const primary = PROXY || DIRECT

export const supabaseConfigured = Boolean(primary && anon && !primary.includes('YOUR_'))

const FETCH_MS = 12000

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
  if (preferred === 'direct') {
    push('direct', DIRECT)
    push('proxy', PROXY)
  } else if (preferred === 'proxy') {
    push('proxy', PROXY)
    push('direct', DIRECT)
  } else {
    // Сначала прямой (быстрее без VPN), потом прокси (обход DPI)
    push('direct', DIRECT)
    push('proxy', PROXY)
    // если задан только один — он уже в списке
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

/** REST/Storage: пробуем direct и proxy, запоминаем рабочий */
async function smartFetch(input, init = {}) {
  const targets = hostsFor(input)
  if (!targets.length) throw new Error('Нет URL Supabase')

  let lastErr = null
  for (const t of targets) {
    try {
      const resp = await oneFetch(t.href, init, FETCH_MS)
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
