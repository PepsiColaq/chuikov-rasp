const ua = { 'User-Agent': 'chuikov-check/1.0' }
const c = await fetch('https://api.github.com/repos/PepsiColaq/chuikov-rasp/commits/gh-pages', { headers: ua }).then((r) => r.json())
console.log('sha', c.sha?.slice(0, 8), c.commit?.message, c.commit?.committer?.date)
const t = await fetch(`https://api.github.com/repos/PepsiColaq/chuikov-rasp/git/trees/${c.sha}?recursive=1`, { headers: ua }).then((r) => r.json())
for (const x of (t.tree || []).filter((f) => f.path.startsWith('assets/') || f.path === 'index.html' || f.path === 'sw.js')) {
  console.log(x.path, x.size)
}
const htmlBlob = (t.tree || []).find((x) => x.path === 'index.html')
const blob = await fetch(`https://api.github.com/repos/PepsiColaq/chuikov-rasp/git/blobs/${htmlBlob.sha}`, { headers: ua }).then((r) => r.json())
const html = Buffer.from(blob.content, 'base64').toString('utf8')
console.log('repo html js', html.match(/assets\/index-[^"]+\.js/)?.[0])
console.log('repo html boot', html.match(/boot-gate\.js\?v=\d+/)?.[0])
console.log('repo html css', html.match(/assets\/index-[^"]+\.css/)?.[0])
