/**
 * Self-check: gallery must include every visible thumb URL (no silent drop).
 * Run: node scripts/check-hw-lightbox.mjs
 */
function normalizeAttachments(raw, legacyImages = []) {
  const out = []
  const seen = new Set()
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const url = typeof item.url === 'string' ? item.url : ''
      if (!url.startsWith('https://') && !url.startsWith('http://')) continue
      if (seen.has(url)) continue
      seen.add(url)
      out.push({ url, name: item.name || 'файл', mime: item.mime || '' })
    }
  }
  if (Array.isArray(legacyImages)) {
    for (const url of legacyImages) {
      if (typeof url !== 'string') continue
      if (!url.startsWith('https://') && !url.startsWith('http://')) continue
      if (seen.has(url)) continue
      seen.add(url)
      out.push({ url, name: 'фото', mime: 'image/jpeg' })
    }
  }
  return out.slice(0, 8)
}

function isImageMime(mime, name = '') {
  if ((mime || '').startsWith('image/')) return true
  return /\.(jpe?g|png|webp|gif|heic|heif|bmp|avif)$/i.test(String(name || ''))
}

// Case that previously broke: 3 attachments + 4th only in images[]
const attachments = [
  { url: 'https://x/a.jpg', name: '1.jpg', mime: 'image/jpeg' },
  { url: 'https://x/b.jpg', name: '2.jpg', mime: 'image/jpeg' },
  { url: 'https://x/c.jpg', name: '3.jpg', mime: 'image/jpeg' },
]
const images = [
  'https://x/a.jpg',
  'https://x/b.jpg',
  'https://x/c.jpg',
  'https://x/d.jpg',
]

const oldBehavior = (() => {
  const out = []
  for (const item of attachments) out.push(item)
  // old: only if empty
  if (!out.length) for (const u of images) out.push({ url: u })
  return out.filter((a) => isImageMime(a.mime, a.name))
})()

const merged = normalizeAttachments(attachments, images).filter(
  (a) => isImageMime(a.mime, a.name) || isImageMime('', a.url),
)

if (oldBehavior.length !== 3) {
  console.error('expected old bug length 3, got', oldBehavior.length)
  process.exit(1)
}
if (merged.length !== 4) {
  console.error('FAIL: merged should be 4 photos, got', merged.length, merged)
  process.exit(1)
}
console.log('OK: merged gallery has 4 photos (was 3 with old logic)')

// Case: 3 separate HW entries under one author (3+1 photos) → shared gallery = 4
const authorItems = [
  {
    attachments: [
      { url: 'https://x/a.jpg', name: '1.jpg', mime: 'image/jpeg' },
      { url: 'https://x/b.jpg', name: '2.jpg', mime: 'image/jpeg' },
      { url: 'https://x/c.jpg', name: '3.jpg', mime: 'image/jpeg' },
    ],
    images: [],
  },
  {
    attachments: [{ url: 'https://x/d.jpg', name: '4.jpg', mime: 'image/jpeg' }],
    images: [],
  },
  { attachments: [], images: [] },
]
const shared = []
for (const h of authorItems) {
  const photos = normalizeAttachments(h.attachments, h.images).filter(
    (a) => isImageMime(a.mime, a.name) || isImageMime('', a.url),
  )
  for (const p of photos) shared.push([p.url])
}
if (shared.length !== 4) {
  console.error('FAIL: author shared gallery should be 4, got', shared.length)
  process.exit(1)
}
console.log('OK: author-block shared gallery has 4 photos across HW items')
