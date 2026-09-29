/* Offline shell — bump CACHE to drop stale HTML/JS */
const CACHE = 'rasp-shell-v37'
const SCOPE_PATH = '/chuikov-rasp/'

self.addEventListener('install', (event) => {
  // Don't precache index.html — it must always be fresh (kill-switch UI).
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.hostname.includes('supabase.co')) return
  if (url.origin !== self.location.origin) return

  // Always fresh HTML / entry
  if (
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    url.pathname === SCOPE_PATH ||
    url.pathname === SCOPE_PATH + 'index.html' ||
    url.pathname.endsWith('/index.html')
  ) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(
        () =>
          new Response('<!doctype html><meta charset=utf-8><p>Нет сети</p>', {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          }),
      ),
    )
    return
  }

  // Manifest + icons + sw itself: network first
  if (
    url.pathname.endsWith('manifest.webmanifest') ||
    url.pathname.endsWith('/sw.js') ||
    /\/icon[^/]*\.(png|svg)$/i.test(url.pathname) ||
    /apple-touch-icon/i.test(url.pathname)
  ) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() => caches.match(req)),
    )
    return
  }

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req)
        if (fresh && fresh.ok && url.pathname.includes('/assets/')) {
          const cache = await caches.open(CACHE)
          cache.put(req, fresh.clone())
        }
        return fresh
      } catch {
        const cached = await caches.match(req)
        if (cached) return cached
        return new Response('Нет сети и нет кэша', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      }
    })(),
  )
})
