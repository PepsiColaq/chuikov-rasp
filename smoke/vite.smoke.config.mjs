// Собирает src/main.js как IIFE-бандл для прогона в jsdom (проверка, что приложение поднимается).
import { defineConfig } from 'vite'
import { existsSync, readFileSync } from 'node:fs'

function fileEnv(key) {
  for (const file of ['.env.local', '.env', '.env.production']) {
    if (!existsSync(file)) continue
    const m = readFileSync(file, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'))
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return (process.env[key] || '').trim().replace(/^["']|["']$/g, '')
}

export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist-test',
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: 'src/main.js',
      name: 'RaspApp',
      formats: ['iife'],
      fileName: () => 'app.js',
    },
  },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(''),
    'import.meta.env.VITE_SUPABASE_PROXY_URL': JSON.stringify(''),
    'import.meta.env.VITE_SUPABASE_DIRECT_URL': JSON.stringify(''),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(''),
  },
})
