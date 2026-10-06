/* Offline shell — bump CACHE to drop stale HTML/JS */
const CACHE = 'rasp-shell-v115'
const SCOPE_PATH = '/chuikov-rasp/'

function assetUrlsFromHtml(html) {
  const out = []
  const re = /(?:src|href)="(\/chuikov-rasp\/[^"]+)"/g
  let m
  while ((m = re.exec(html))) {
    const u = m[1]
    if (
      u.includes('/assets/') ||
      u.includes('boot-gate.js') ||
      u.endsWith('college-logo.jpg') ||
      u.endsWith('manifest.webmanifest')
    ) {
      out.push(u)
    }
  }
  return [...new Set(out)]
}

function isCriticalAsset(path) {
  return path.includes('/assets/') || path.includes('boot-gate.js')
}

async function fetchWithTimeout(url, ms = 8000, init = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

async function putHtml(cache, html) {
  await cache.put(
    SCOPE_PATH,
    new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
    }),
  )
}

/** Кладём HTML только после JS/CSS — иначе Android PWA зависает на иконке. */
async function commitShell(cache, html) {
  const urls = assetUrlsFromHtml(html)
  let need = 0
  let ok = 0
  await Promise.all(
    urls.map(async (path) => {
      const critical = isCriticalAsset(path)
      if (critical) need += 1
      try {
        const r = await fetchWithTimeout(path, 8000, { cache: 'no-store' })
        if (r && r.ok) {
          await cache.put(path, r.clone())
          if (critical) ok += 1
        }
      } catch {
        /* один ассет */
      }
    }),
  )
  if (need > 0 && ok < need) return false
  await putHtml(cache, html)
  return true
}

async function precacheFromNetwork(cache) {
  const idx = await fetchWithTimeout(SCOPE_PATH, 10000, { cache: 'no-store' })
  if (!idx || !idx.ok) throw new Error('html ' + (idx && idx.status))
  const html = await idx.text()
  const ready = await commitShell(cache, html)
  if (!ready) throw new Error('shell assets incomplete')
}

async function matchAsset(req) {
  const exact = await caches.match(req)
  if (exact) return exact
  const keys = await caches.keys()
  for (const k of keys) {
    const c = await caches.open(k)
    const hit = await c.match(req)
    if (hit) return hit
  }
  return null
}

async function shellReady(cache) {
  const htmlRes = await cache.match(SCOPE_PATH)
  if (!htmlRes) return false
  try {
    const html = await htmlRes.clone().text()
    const critical = assetUrlsFromHtml(html).filter(isCriticalAsset)
    if (!critical.length) return false
    for (const path of critical) {
      if (!(await cache.match(path))) return false
    }
    return true
  } catch {
    return false
  }
}

/** HTML из текущего или ЛЮБОГО старого rasp-shell-* (после bump CACHE новый кэш пуст). */
async function matchHtml() {
  const cur = await caches.open(CACHE)
  const hit = await cur.match(SCOPE_PATH)
  if (hit) return hit
  const keys = await caches.keys()
  for (const k of keys) {
    if (k === CACHE) continue
    if (!String(k).startsWith('rasp-shell-')) continue
    const c = await caches.open(k)
    const older = await c.match(SCOPE_PATH)
    if (older) return older
  }
  return null
}

/** Если новый CACHE пуст — скопировать рабочий shell из предыдущей версии. */
async function adoptPreviousShell(cache) {
  if (await shellReady(cache)) return true
  const keys = await caches.keys()
  for (const k of keys) {
    if (k === CACHE) continue
    if (!String(k).startsWith('rasp-shell-')) continue
    const old = await caches.open(k)
    if (!(await shellReady(old))) continue
    const reqs = await old.keys()
    await Promise.all(
      reqs.map(async (req) => {
        const res = await old.match(req)
        if (res) await cache.put(req, res.clone())
      }),
    )
    return shellReady(cache)
  }
  return false
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      try {
        await precacheFromNetwork(cache)
      } catch {
        try {
          await adoptPreviousShell(cache)
        } catch {
          /* ок */
        }
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await adoptPreviousShell(cache)
      // Старые кэши не трогаем, пока новый shell+JS не готов
      if (await shellReady(cache)) {
        const keys = await caches.keys()
        await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.hostname.includes('supabase.co')) return
  if (url.origin !== self.location.origin) return

  const isNav =
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    url.pathname === SCOPE_PATH ||
    url.pathname === SCOPE_PATH + 'index.html' ||
    url.pathname.endsWith('/index.html')

  if (isNav) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        const cached = await matchHtml()

        const networkUpdate = fetchWithTimeout(SCOPE_PATH, 10000, { cache: 'no-store' })
          .then(async (fresh) => {
            if (fresh && fresh.ok) {
              const html = await fresh.clone().text()
              await commitShell(cache, html)
            }
            return fresh
          })
          .catch(() => null)

        // Всегда отдаём кэш сразу — иначе Android ~4с держит иконку ярлыка
        if (cached) {
          networkUpdate.catch(() => {})
          return cached
        }

        const raced = await Promise.race([
          networkUpdate,
          new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
        ])
        if (raced && raced.ok) return raced
        return new Response(
          '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="font-family:system-ui;padding:48px 20px;text-align:center;background:#f7f7f5"><p>Нет сети. Откройте ещё раз, когда будет интернет.</p><p><a href="' +
            SCOPE_PATH +
            '">Обновить</a></p></body>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        )
      })(),
    )
    return
  }

  if (
    url.pathname.endsWith('manifest.webmanifest') ||
    url.pathname.endsWith('/sw.js') ||
    url.pathname.includes('boot-gate.js') ||
    /\/icon[^/]*\.(png|svg)$/i.test(url.pathname) ||
    /apple-touch-icon/i.test(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        const cached = await matchAsset(req)
        try {
          const fresh = await fetchWithTimeout(req.url, 6000, { cache: 'no-store' })
          if (fresh && fresh.ok) {
            const c = await caches.open(CACHE)
            c.put(req, fresh.clone())
            return fresh
          }
        } catch {
          /* fallback */
        }
        return cached || Response.error()
      })(),
    )
    return
  }

  if (url.pathname.includes('/assets/') || url.pathname.endsWith('college-logo.jpg')) {
    event.respondWith(
      (async () => {
        const cached = await matchAsset(req)
        if (cached) {
          fetchWithTimeout(req.url, 8000)
            .then(async (fresh) => {
              if (fresh && fresh.ok) {
                const c = await caches.open(CACHE)
                c.put(req, fresh.clone())
              }
            })
            .catch(() => {})
          return cached
        }
        try {
          const fresh = await fetchWithTimeout(req.url, 8000)
          if (fresh && fresh.ok) {
            const c = await caches.open(CACHE)
            c.put(req, fresh.clone())
          }
          return fresh
        } catch {
          return new Response('Нет сети и нет кэша', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        }
      })(),
    )
    return
  }

  event.respondWith(
    (async () => {
      try {
        return await fetchWithTimeout(req.url, 10000)
      } catch {
        return (await matchAsset(req)) || new Response('Нет сети', { status: 503 })
      }
    })(),
  )
})
