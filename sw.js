/* Offline shell — bump CACHE to drop stale HTML/JS */
const CACHE = 'rasp-shell-v99'
const SCOPE_PATH = '/chuikov-rasp/'

function assetUrlsFromHtml(html) {
  const out = []
  const re = /(?:src|href)="(\/chuikov-rasp\/[^"]+)"/g
  let m
  while ((m = re.exec(html))) {
    const u = m[1]
    // hashed assets, boot-gate, logo — критично для cold start PWA
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

async function putHtml(cache, html) {
  await cache.put(
    SCOPE_PATH,
    new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
    }),
  )
}

async function precacheFromNetwork(cache) {
  const idx = await fetch(SCOPE_PATH, { cache: 'no-store' })
  if (!idx.ok) throw new Error('html ' + idx.status)
  const html = await idx.text()
  await putHtml(cache, html)
  const urls = assetUrlsFromHtml(html)
  await Promise.all(
    urls.map(async (path) => {
      try {
        const r = await fetch(path, { cache: 'no-store' })
        if (r.ok) await cache.put(path, r.clone())
      } catch {
        /* ignore one asset */
      }
    }),
  )
}

async function matchAsset(req) {
  const exact = await caches.match(req)
  if (exact) return exact
  // fallback: любой кэш (после обновления SW старые hashed файлы ещё могут быть нужны)
  const keys = await caches.keys()
  for (const k of keys) {
    const c = await caches.open(k)
    const hit = await c.match(req)
    if (hit) return hit
  }
  return null
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      try {
        await precacheFromNetwork(cache)
      } catch {
        /* первая установка без сети — ок, будет network */
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      const hasShell = !!(await cache.match(SCOPE_PATH))
      // Старые кэши не трогаем, пока новый shell не готов — иначе Android PWA
      // открывает старый HTML без JS (бесконечная «Загрузка»).
      if (hasShell) {
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
        const cached = await cache.match(SCOPE_PATH)

        const network = fetch(req, { cache: 'no-store' })
          .then(async (fresh) => {
            if (fresh && fresh.ok) {
              const html = await fresh.clone().text()
              await putHtml(cache, html)
              // докачать ассеты нового билда в фоне
              assetUrlsFromHtml(html).forEach((path) => {
                fetch(path, { cache: 'no-store' })
                  .then((r) => (r.ok ? cache.put(path, r) : null))
                  .catch(() => {})
              })
            }
            return fresh
          })
          .catch(() => null)

        // Есть кэш — сразу показываем (заставка), сеть обновляет в фоне.
        // Нет кэша — ждём сеть, но не дольше 8с.
        if (cached) {
          network.catch(() => {})
          return cached
        }

        const raced = await Promise.race([
          network,
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
        try {
          const fresh = await fetch(req, { cache: 'no-store' })
          if (fresh && fresh.ok) {
            const cache = await caches.open(CACHE)
            cache.put(req, fresh.clone())
          }
          return fresh
        } catch {
          return (await matchAsset(req)) || Response.error()
        }
      })(),
    )
    return
  }

  // JS/CSS: сначала кэш (быстрый cold start PWA), потом сеть
  if (url.pathname.includes('/assets/') || url.pathname.endsWith('college-logo.jpg')) {
    event.respondWith(
      (async () => {
        const cached = await matchAsset(req)
        if (cached) {
          // фоновое обновление той же URL (обычно immutable hash — no-op)
          fetch(req)
            .then(async (fresh) => {
              if (fresh && fresh.ok) {
                const cache = await caches.open(CACHE)
                cache.put(req, fresh.clone())
              }
            })
            .catch(() => {})
          return cached
        }
        try {
          const fresh = await fetch(req)
          if (fresh && fresh.ok) {
            const cache = await caches.open(CACHE)
            cache.put(req, fresh.clone())
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
        return await fetch(req)
      } catch {
        return (await matchAsset(req)) || new Response('Нет сети', { status: 503 })
      }
    })(),
  )
})
