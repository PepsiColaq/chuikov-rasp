/**
 * Deploy dist/ to gh-pages via GitHub API (api.github.com).
 * Нужен, когда git://github.com рвётся (DPI), а API доступен.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const owner = 'PepsiColaq'
const repo = 'chuikov-rasp'
const branch = 'gh-pages'
const dist = join(process.cwd(), 'dist')

function getToken() {
  const out = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const m = String(out).match(/^password=(.+)$/m)
  if (!m?.[1]) throw new Error('Нет git-credential для github.com')
  return m[1].trim()
}

async function api(token, path, opts = {}, attempt = 1) {
  try {
    const r = await fetch(`https://api.github.com${path}`, {
      method: opts.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'chuikov-rasp-api-deploy',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body || undefined,
    })
    const text = await r.text()
    if (!r.ok) throw new Error(`${opts.method || 'GET'} ${path} → ${r.status}: ${text.slice(0, 400)}`)
    if (!text) return null
    return JSON.parse(text)
  } catch (err) {
    if (attempt >= 12) throw err
    const wait = Math.min(15000, 600 * attempt * attempt)
    console.warn(`\nretry ${attempt} ${path}: ${err.message || err}`)
    await new Promise((r) => setTimeout(r, wait))
    return api(token, path, opts, attempt + 1)
  }
}

function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, base, out)
    else out.push(relative(base, p).replace(/\\/g, '/'))
  }
  return out
}

if (!existsSync(join(dist, '.nojekyll'))) {
  writeFileSync(join(dist, '.nojekyll'), '')
}

const token = getToken()
console.log('Auth OK, uploading via api.github.com…')

let parent = null
try {
  const ref = await api(token, `/repos/${owner}/${repo}/git/ref/heads/${branch}`)
  parent = ref.object.sha
  console.log('gh-pages HEAD', parent.slice(0, 8))
} catch (err) {
  console.warn('ref read failed, retry later if needed:', err.message || err)
  console.log('gh-pages branch missing — create new')
}

const files = walk(dist)
console.log('files', files.length)

const tree = []
for (const f of files) {
  const buf = readFileSync(join(dist, f))
  const blob = await api(token, `/repos/${owner}/${repo}/git/blobs`, {
    method: 'POST',
    body: JSON.stringify({
      content: buf.toString('base64'),
      encoding: 'base64',
    }),
  })
  tree.push({ path: f, mode: '100644', type: 'blob', sha: blob.sha })
  process.stdout.write('.')
  await new Promise((r) => setTimeout(r, 120))
}
process.stdout.write('\n')

const treeRes = await api(token, `/repos/${owner}/${repo}/git/trees`, {
  method: 'POST',
  body: JSON.stringify({ tree }),
})

const commit = await api(token, `/repos/${owner}/${repo}/git/commits`, {
  method: 'POST',
  body: JSON.stringify({
    message: `deploy ${new Date().toISOString()}`,
    tree: treeRes.sha,
    parents: parent ? [parent] : [],
  }),
})

async function publishRef(sha) {
  if (parent) {
    await api(token, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha, force: true }),
    })
    return
  }
  try {
    await api(token, `/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
    })
  } catch (err) {
    const msg = String(err.message || err)
    if (!/already exists|422/.test(msg)) throw err
    console.warn('ref exists — force update')
    const ref = await api(token, `/repos/${owner}/${repo}/git/ref/heads/${branch}`)
    parent = ref.object.sha
    await api(token, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha, force: true }),
    })
  }
}

await publishRef(commit.sha)

console.log('Published to gh-pages:', commit.sha)
console.log('https://pepsicolaq.github.io/chuikov-rasp/')
