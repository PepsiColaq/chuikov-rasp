import fs from 'fs'
const p = new URL('../src/main.js', import.meta.url)
let s = fs.readFileSync(p, 'utf8')
const start = s.indexOf("const TAB_ORDER = ['schedule'")
const end = s.indexOf('function render() {')
if (start < 0 || end < 0) {
  console.error('markers', start, end)
  process.exit(1)
}
const next = fs.readFileSync(new URL('./_swipe_patch.js', import.meta.url), 'utf8')
s = s.slice(0, start) + next + '\n\n' + s.slice(end)
fs.writeFileSync(p, s)
console.log('ok', start, end)
