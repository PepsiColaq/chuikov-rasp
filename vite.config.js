import { defineConfig } from 'vite'
import { existsSync, readFileSync } from 'node:fs'

/** Читаем .env.local сами — process.env иначе перебивает прокси прямым supabase.co */
function fileEnv(key) {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue
    const m = readFileSync(file, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'))
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return ''
}

const proxyUrl =
  fileEnv('VITE_SUPABASE_PROXY_URL') || fileEnv('VITE_SUPABASE_URL') || ''
const directUrl =
  fileEnv('VITE_SUPABASE_DIRECT_URL') ||
  fileEnv('SUPABASE_URL') ||
  'https://azuergqxvqrkvrvqelha.supabase.co'

export default defineConfig({
  base: '/chuikov-rasp/',
  build: {
    outDir: 'dist',
  },
  define: {
    // Прокси (VPN/DPI) + прямой хост для failover
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(proxyUrl),
    'import.meta.env.VITE_SUPABASE_PROXY_URL': JSON.stringify(proxyUrl),
    'import.meta.env.VITE_SUPABASE_DIRECT_URL': JSON.stringify(directUrl),
  },
})
