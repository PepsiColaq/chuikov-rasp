// Достаёт glue-блок (код верхнего уровня) из main.js и кладёт его в конфиг модуля.
// Аргументы: <module> <fromLine> <toLine>
// Пример: node scripts/split/add-glue.mjs install 246 258
import fs from 'node:fs'

const [moduleKey, fromArg, toArg] = process.argv.slice(2)
const from = Number(fromArg)
const to = Number(toArg)
const CONFIG = 'scripts/split/modules.json'

const lines = fs.readFileSync('src/main.js', 'utf8').split(/\r?\n/)
const text = lines.slice(from - 1, to).join('\n')

const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
if (!cfg[moduleKey]) throw new Error('Нет модуля ' + moduleKey)
cfg[moduleKey].glue = cfg[moduleKey].glue || []
cfg[moduleKey].glue.push({ text })
fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 1))

console.log(`Добавлен glue-блок строк ${from}-${to} (${text.length} символов) в модуль ${moduleKey}:`)
console.log(text)
