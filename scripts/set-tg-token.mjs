/**
 * Обновить токен бота одной командой.
 *
 * Зачем: руками это несколько шагов в вебе (Settings → Secrets → …),
 * а ошибка в одном символе выглядит потом как «бот молчит».
 * Скрипт проверяет токен у Telegram и кладёт его в GitHub Secret.
 *
 *   node scripts/set-tg-token.mjs
 *   node scripts/set-tg-token.mjs 123456789:AAH... --admin=123456789
 *
 * Токен нигде не печатается и не сохраняется в файл: он уходит
 * в Telegram (проверка) и в `gh secret set` (через stdin).
 */
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'

const argv = process.argv.slice(2)
const adminArg = argv.find((a) => a.startsWith('--admin='))
const adminId = adminArg ? adminArg.split('=')[1].trim() : ''
let token = (argv.find((a) => !a.startsWith('--')) || '').trim()

const rl = createInterface({ input: process.stdin, output: process.stdout })

if (!token) {
  console.log('Токен берём у @BotFather: /mybots → выбрать бота → API Token.\n')
  token = (await rl.question('Вставь токен: ')).trim()
}

if (!token) {
  console.error('Пусто. Ничего не меняю.')
  rl.close()
  process.exit(1)
}

// Форма телеграмного токена: <цифры>:<30+ символов>.
// Проверяем до запросов, чтобы отличить опечатку при вставке
// от «токен отозван»: Telegram на оба случая отвечает одинаково.
if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(token)) {
  console.error(
    [
      '',
      'Это не похоже на токен Telegram.',
      `Длина: ${token.length}, двоеточий: ${(token.match(/:/g) || []).length}.`,
      'Ожидается вид 123456789:AAH... (цифры, двоеточие, ~35 символов).',
      'Скорее всего скопировалась только часть или попал пробел.',
      '',
    ].join('\n'),
  )
  rl.close()
  process.exit(1)
}

// ── 1. Спросить у Telegram, чей это токен
console.log('\nПроверяю токен у Telegram…')
let botName = ''
try {
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { method: 'POST' })
  const data = await res.json()
  if (data.ok) {
    botName = data.result?.username || '?'
    console.log(`✅ Токен рабочий. Бот: @${botName}`)
  } else {
    console.error(`❌ Telegram не принял токен: ${data.error_code} ${data.description || ''}`)
    console.error('   Возьми новый у @BotFather и попробуй снова.')
    rl.close()
    process.exit(1)
  }
} catch (e) {
  // Из России api.telegram.org часто недоступен напрямую. Это не значит,
  // что токен плохой, — на раннере GitHub он может работать.
  console.log(`⚠️  Проверить онлайн не вышло (${e.message || e}).`)
  console.log('   Похоже, Telegram блокируется у тебя локально. Продолжаю:')
  console.log('   работоспособность покажет первый запуск на GitHub.')
}

// ── 2. Положить в GitHub Secret
console.log('\nОбновляю GitHub Secret TG_BOT_TOKEN…')
const setSecret = (name, value) => {
  const r = spawnSync('gh', ['secret', 'set', name], {
    input: value,
    encoding: 'utf8',
    shell: true,
  })
  if (r.status !== 0) {
    console.error(`❌ Не удалось записать ${name}:`)
    console.error((r.stderr || r.stdout || '').trim())
    return false
  }
  console.log(`✅ ${name} обновлён`)
  return true
}

let ok = setSecret('TG_BOT_TOKEN', token)
if (ok && adminId) ok = setSecret('TG_ADMIN_CHAT_ID', adminId)

if (!ok) {
  rl.close()
  process.exit(1)
}

// ── 3. Сразу проверить на GitHub, чтобы не гадать
console.log('\nЗапускаю бота на GitHub для проверки…')
const run = spawnSync('gh', ['workflow', 'run', 'tg-support-poll.yml'], {
  encoding: 'utf8',
  shell: true,
})
if (run.status !== 0) {
  console.log('Не удалось запустить автоматически. Это не страшно — бот запустится сам по расписанию.')
  console.log('Вручную: gh workflow run tg-support-poll.yml')
} else {
  console.log('Запущено. Через полминуты посмотреть результат:')
  console.log('  gh run list --workflow=tg-support-poll.yml --limit 1')
  console.log('  gh run view --log-failed')
}

console.log('\nГотово. Если в логе «бот на связи: …» — всё, поддержка работает.')
rl.close()
