/**
 * Keep trying deploy until success or max minutes.
 * Network to api.github.com is flaky (ECONNRESET).
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const maxMs = 12 * 60 * 1000
const started = Date.now()
let attempt = 0

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function ping() {
  try {
    const r = await fetch('https://api.github.com', {
      headers: { 'User-Agent': 'rasp-deploy-retry' },
    })
    return r.ok || r.status === 401 || r.status === 403
  } catch {
    return false
  }
}

function runDeploy() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/deploy-gh-pages-api.mjs'], {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    })
    child.on('exit', (code) => resolve(code === 0))
    child.on('error', () => resolve(false))
  })
}

console.log('Retry deploy until GitHub stays up…')
while (Date.now() - started < maxMs) {
  attempt++
  const okPing = await ping()
  console.log(`\n=== attempt ${attempt} ping=${okPing} elapsed=${Math.round((Date.now() - started) / 1000)}s ===`)
  if (!okPing) {
    await sleep(4000 + attempt * 500)
    continue
  }
  const ok = await runDeploy()
  if (ok) {
    console.log('\nDEPLOY OK')
    process.exit(0)
  }
  await sleep(5000)
}
console.error('\nDEPLOY FAILED after retries')
process.exit(1)
