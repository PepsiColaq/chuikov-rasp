// Один прогон проверки: сборка теста → тест в jsdom → сравнение с эталоном.
// Если сборка падает — тест НЕ запускается на старом бандле (иначе можно
// получить ложное «всё ок» после сломанной правки).
import { spawnSync } from 'node:child_process'

const run = (cmd, args, label) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1e8 })
  if (r.status !== 0) {
    console.error(`\n❌ ${label} упал (код ${r.status})`)
    console.error((r.stdout || '').slice(-3000))
    console.error((r.stderr || '').slice(-3000))
    process.exit(1)
  }
  return r.stdout || ''
}

// На Windows .cmd-обёртки не запускаются без shell — вызываем vite как обычный JS.
run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'smoke/vite.smoke.config.mjs'], 'Сборка smoke-бандла')
console.log('✓ smoke-бандл собран')

const out = run(process.execPath, ['smoke/run.mjs'], 'Дымовой тест')
const tail = out.split(/\r?\n/).filter((l) => l.trim()).slice(-14).join('\n')
console.log(tail)

if (!out.includes('DOM идентичен эталону')) {
  console.error('\n❌ DOM отличается от эталона — разбивка что-то сломала')
  process.exit(1)
}
