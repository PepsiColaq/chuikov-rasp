import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const env = Object.fromEntries(
  readFileSync(join(process.cwd(), '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1)]
    }),
)

const direct = (env.SUPABASE_URL || env.VITE_SUPABASE_DIRECT_URL || '').replace(/\/$/, '')
const anon = env.VITE_SUPABASE_ANON_KEY
const ua = { 'User-Agent': 'chuikov-check/1.0' }

async function attempt(fn, tries = 5) {
  let last
  for (let i = 1; i <= tries; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      await new Promise((r) => setTimeout(r, 400 * i * i))
    }
  }
  throw last
}

async function get(path) {
  return attempt(async () => {
    const r = await fetch(direct + path, {
      headers: { ...ua, apikey: anon, Authorization: `Bearer ${anon}` },
    })
    return { status: r.status, text: await r.text() }
  })
}

async function rpc(name, body) {
  return attempt(async () => {
    const r = await fetch(`${direct}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        ...ua,
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    return { status: r.status, text: await r.text() }
  })
}

function classify(res) {
  const t = res.text || ''
  if (res.status === 404 || /PGRST202|could not find function|schema cache/i.test(t)) return 'MISSING'
  if (/column .* does not exist|42703/i.test(t)) return 'COL_MISSING'
  if (/Нужен вход|Только админ|Нет прав|Недопустимый|Неверный|invalid input|PGRST301/i.test(t))
    return 'EXISTS'
  if (res.status >= 200 && res.status < 300) return 'EXISTS_OK'
  return `OTHER ${res.status}: ${t.slice(0, 180)}`
}

const probes = [
  ['app_meta display/avatar', '/rest/v1/app_meta?select=admin_display_name,admin_avatar_url&limit=1'],
  ['homework author cols', '/rest/v1/homework?select=author_label,author_code_id,author_avatar_url&limit=1'],
  ['group_codes avatar', '/rest/v1/group_codes?select=label,avatar_url&limit=1'],
]

console.log('DB probes (anon)')
for (const [title, path] of probes) {
  try {
    const res = await get(path)
    const missing = /column .* does not exist|42703/i.test(res.text)
    console.log(title, missing ? 'SQL NOT APPLIED' : res.status === 200 ? 'SQL OK' : `status ${res.status}`, res.text.slice(0, 120))
  } catch (e) {
    console.log(title, 'NET FAIL', e.cause?.code || e.message)
  }
}

const rpcs = [
  ['rasp_set_admin_display_name', { p_token: 'x', p_name: 'Никитос' }],
  ['rasp_rename_starosta_label', { p_token: 'x', p_code_id: 'x', p_label: 't' }],
  [
    'rasp_set_avatar',
    {
      p_token: 'x',
      p_url: 'https://azuergqxvqrkvrvqelha.supabase.co/storage/v1/object/public/hw-files/x.jpg',
    },
  ],
  ['rasp_clear_avatar', { p_token: 'x' }],
  ['rasp_session', { p_token: 'x' }],
]

console.log('\nRPC probes')
for (const [name, body] of rpcs) {
  try {
    const res = await rpc(name, body)
    console.log(name, classify(res), res.text.slice(0, 100).replace(/\s+/g, ' '))
  } catch (e) {
    console.log(name, 'NET FAIL', e.cause?.code || e.message)
  }
}

console.log('\nSite probes')
try {
  const api = await attempt(() =>
    fetch('https://api.github.com/repos/PepsiColaq/chuikov-rasp/commits/gh-pages', { headers: ua }).then((r) =>
      r.json(),
    ),
  )
  console.log('gh-pages', api.sha?.slice(0, 8), api.commit?.message, api.commit?.committer?.date)
} catch (e) {
  console.log('github NET FAIL', e.cause?.code || e.message)
}

try {
  const html = await attempt(() =>
    fetch('https://pepsicolaq.github.io/chuikov-rasp/?t=' + Date.now(), {
      headers: { ...ua, 'Cache-Control': 'no-cache' },
    }).then((r) => r.text()),
  )
  const js = (html.match(/assets\/(index-[^"' ]+\.js)/) || [])[1]
  const css = (html.match(/assets\/(index-[^"' ]+\.css)/) || [])[1]
  console.log('live assets', js, css)
  console.log('expected', 'index-Be7jA3Ya.js', 'index-qhgKwMkx.css')
  if (js) {
    const body = await attempt(() =>
      fetch('https://pepsicolaq.github.io/chuikov-rasp/assets/' + js, { headers: ua }).then((r) => r.text()),
    )
    for (const s of [
      'openAvatarCropEditor',
      'login-highlight',
      'Никитос',
      'rasp_rename_starosta_label',
      'rasp_set_admin_display_name',
      'Подгони фото',
    ]) {
      console.log('in bundle:', s, body.includes(s))
    }
  }
} catch (e) {
  console.log('pages NET FAIL', e.cause?.code || e.message)
}
