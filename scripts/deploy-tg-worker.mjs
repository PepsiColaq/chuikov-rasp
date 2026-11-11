/**
 * Redeploy Telegram worker after: npx wrangler login
 *
 *   node scripts/deploy-tg-worker.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const secretPath = join(root, 'scripts', '.tg-webhook-secret.txt')

const BOT_TOKEN = process.env.TG_BOT_TOKEN || '8969613240:AAHhxcLbE4DhGonv5NOnWfu46eWaZLpzYns'
const ADMIN = process.env.TG_ADMIN_CHAT_ID || '1070877182'
const SB_URL = process.env.SUPABASE_URL || 'https://azuergqxvqrkvrvqelha.supabase.co'
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

let secret = existsSync(secretPath) ? readFileSync(secretPath, 'utf8').trim() : ''
if (!secret) {
  secret = randomBytes(32).toString('hex')
  writeFileSync(secretPath, secret, 'utf8')
}

if (!SB_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const args = [
  'wrangler',
  'deploy',
  '-c',
  'workers/wrangler-tg.toml',
  '--var',
  `BOT_TOKEN:${BOT_TOKEN}`,
  '--var',
  `ADMIN_CHAT_ID:${ADMIN}`,
  '--var',
  `SUPABASE_URL:${SB_URL}`,
  '--var',
  `SUPABASE_SERVICE_ROLE_KEY:${SB_KEY}`,
  '--var',
  `WEBHOOK_SECRET:${secret}`,
]

console.log('Deploying rasp-tg-support…')
const r = spawnSync('npx', args, { cwd: root, encoding: 'utf8', shell: true })
console.log(r.stdout || '')
console.error(r.stderr || '')
if (r.status !== 0) process.exit(r.status || 1)

const m = /https:\/\/rasp-tg-support\.[a-z0-9-]+\.workers\.dev/i.exec(r.stdout + r.stderr)
const url = m ? m[0] + '/' : process.env.TG_WEBHOOK_URL
if (!url) {
  console.log('Deployed. Set webhook manually with secret_token from scripts/.tg-webhook-secret.txt')
  process.exit(0)
}

const wh = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url,
    secret_token: secret,
    allowed_updates: ['message', 'edited_message'],
    drop_pending_updates: false,
  }),
}).then((x) => x.json())
console.log('setWebhook', wh)
