/** XSS-safe text + hashing + input limits */

export const LIMITS = {
  groupName: 48,
  subject: 80,
  room: 32,
  homework: 1000,
  accessCode: 64,
  minCodeLength: 8,
}

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

/** Strip control chars and trim; never treat as HTML. */
export function sanitizeText(value, maxLen) {
  if (value == null) return ''
  let s = String(value).replace(CONTROL_CHARS, '').trim()
  if (s.length > maxLen) s = s.slice(0, maxLen)
  return s
}

/** Create a text node (safe). Prefer this over innerHTML. */
export function text(str) {
  return document.createTextNode(str == null ? '' : String(str))
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag)
  for (const [key, val] of Object.entries(attrs)) {
    if (val == null || val === false) continue
    if (key === 'className') node.className = val
    else if (key === 'dataset') {
      for (const [dk, dv] of Object.entries(val)) node.dataset[dk] = dv
    } else if (key.startsWith('on') && typeof val === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), val)
    } else if (key === 'text') {
      node.textContent = val
    } else {
      node.setAttribute(key, val === true ? '' : String(val))
    }
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue
    node.append(typeof child === 'string' ? text(child) : child)
  }
  return node
}

export async function sha256Hex(plain) {
  const data = new TextEncoder().encode(String(plain))
  const buf = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function hashAccessCode(code, salt) {
  const clean = sanitizeText(code, LIMITS.accessCode)
  return sha256Hex(`${salt}:${clean}`)
}

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

const RATE_KEY = 'rasp_rate_v1'

export function checkRateLimit(bucket, maxAttempts = 8, windowMs = 15 * 60 * 1000) {
  const now = Date.now()
  let all = {}
  try {
    all = JSON.parse(localStorage.getItem(RATE_KEY) || '{}')
  } catch {
    all = {}
  }
  const entry = all[bucket] || { fails: 0, until: 0 }
  if (entry.until && now < entry.until) {
    return { ok: false, retryAfterMs: entry.until - now }
  }
  if (entry.until && now >= entry.until) {
    entry.fails = 0
    entry.until = 0
  }
  all[bucket] = entry
  localStorage.setItem(RATE_KEY, JSON.stringify(all))
  return { ok: true, entry, persist: (next) => {
    all[bucket] = next
    localStorage.setItem(RATE_KEY, JSON.stringify(all))
  } }
}

export function registerFailedAttempt(bucket, maxAttempts = 8, windowMs = 15 * 60 * 1000) {
  const rate = checkRateLimit(bucket, maxAttempts, windowMs)
  if (!rate.ok) return rate
  const entry = rate.entry
  entry.fails += 1
  if (entry.fails >= maxAttempts) {
    entry.until = Date.now() + windowMs
    entry.fails = 0
  }
  rate.persist(entry)
  return { ok: entry.until ? false : true, locked: !!entry.until, retryAfterMs: entry.until ? entry.until - Date.now() : 0 }
}

export function clearRateLimit(bucket) {
  try {
    const all = JSON.parse(localStorage.getItem(RATE_KEY) || '{}')
    delete all[bucket]
    localStorage.setItem(RATE_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

export function escapeForDisplay(str) {
  return sanitizeText(str, 10000)
}
