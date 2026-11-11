/**
 * Cloudflare Worker — прокси к Supabase.
 * Браузер ходит сюда (обычно проходит через VPN/DPI), Worker — к *.supabase.co.
 *
 * Деплой (один раз):
 *   1. Бесплатный аккаунт https://dash.cloudflare.com
 *   2. В папке workers: npx wrangler login
 *   3. npx wrangler secret put SUPABASE_URL
 *      (вставь https://azuergqxvqrkvrvqelha.supabase.co )
 *   4. npx wrangler deploy
 *   5. Полученный URL вида https://rasp-supabase-proxy.XXXX.workers.dev
 *      пропиши в .env.local:
 *        VITE_SUPABASE_URL=https://rasp-supabase-proxy.XXXX.workers.dev
 *   6. npm run deploy  (сайт на GitHub Pages)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization,apikey,content-type,x-client-info,x-supabase-api-version,prefer,range,accept-profile,content-profile',
  'Access-Control-Expose-Headers':
    'content-range,content-profile,x-supabase-api-version',
  'Access-Control-Max-Age': '86400',
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    const upstream = (env.SUPABASE_URL || '').replace(/\/$/, '')
    if (!upstream) {
      return new Response('SUPABASE_URL secret not set', { status: 500, headers: CORS })
    }

    const inUrl = new URL(request.url)
    const target = new URL(inUrl.pathname + inUrl.search, upstream)

    // WebSocket (Supabase Realtime) — прозрачный прокси
    if ((request.headers.get('Upgrade') || '').toLowerCase() === 'websocket') {
      return fetch(new Request(target.toString(), request))
    }

    const headers = new Headers(request.headers)
    headers.delete('host')
    headers.set('Host', new URL(upstream).host)

    // Реальный IP клиента → Supabase (для лимита попыток входа)
    const clientIp =
      request.headers.get('CF-Connecting-IP') ||
      (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() ||
      ''
    if (clientIp) {
      headers.set('X-Forwarded-For', clientIp)
      headers.set('CF-Connecting-IP', clientIp)
      headers.set('X-Real-IP', clientIp)
    }

    const init = {
      method: request.method,
      headers,
      redirect: 'follow',
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body
      // @ts-expect-error duplex for streaming bodies
      init.duplex = 'half'
    }

    try {
      const resp = await fetch(target.toString(), init)
      const out = new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: resp.headers,
      })
      for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v)
      return out
    } catch (e) {
      return new Response('Proxy error: ' + (e && e.message ? e.message : String(e)), {
        status: 502,
        headers: CORS,
      })
    }
  },
}
