/**
 * Минимальное чтение .xlsx в браузере — без библиотек и без сервера.
 *
 * .xlsx — это ZIP с XML. Распаковываем через нативный `DecompressionStream`,
 * который есть в Chrome/Android 80+, Safari 16.4+, Firefox 113+.
 * На старых браузерах честно говорим «обнови» — это лучше, чем молча
 * показать пустую таблицу.
 *
 * Наружу отдаём простую матрицу: rows[номер строки][номер колонки] = текст.
 */

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50
const LOC_SIG = 0x04034b50

function readU16(view, off) {
  return view.getUint16(off, true)
}
function readU32(view, off) {
  return view.getUint32(off, true)
}

/** Найти End of Central Directory: идём с конца, там может быть comment. */
function findEocd(view, bytes) {
  const min = Math.max(0, bytes.byteLength - 22 - 0xffff)
  for (let off = bytes.byteLength - 22; off >= min; off--) {
    if (readU32(view, off) === EOCD_SIG) return off
  }
  return -1
}

/** Центральный каталог: имена, метод сжатия, смещения. */
function readCentralDirectory(buf) {
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)
  const eocd = findEocd(view, bytes)
  if (eocd < 0) throw new Error('Это не .xlsx — не нашёл ZIP-каталог')

  const total = readU16(view, eocd + 10)
  let off = readU32(view, eocd + 16)
  const entries = []
  const decoder = new TextDecoder('utf-8')

  for (let i = 0; i < total; i++) {
    if (off + 46 > bytes.byteLength || readU32(view, off) !== CEN_SIG) break
    const method = readU16(view, off + 10)
    const compSize = readU32(view, off + 20)
    const rawSize = readU32(view, off + 24)
    const nameLen = readU16(view, off + 28)
    const extraLen = readU16(view, off + 30)
    const commentLen = readU16(view, off + 32)
    const localOff = readU32(view, off + 42)
    const name = decoder.decode(bytes.subarray(off + 46, off + 46 + nameLen))
    entries.push({ name, method, compSize, rawSize, localOff })
    off += 46 + nameLen + extraLen + commentLen
  }
  return { entries, bytes, view }
}

async function inflateRaw(chunk) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error(
      'Браузер не умеет распаковывать .xlsx. Обнови Chrome/Safari или открой файл на компьютере.',
    )
  }
  // Основной путь — Response(...).body: так работает и там, где у Blob нет stream().
  let source = null
  try {
    const res = new Response(chunk)
    source = res.body
  } catch {
    source = null
  }
  if (!source) {
    if (typeof Blob === 'function' && typeof new Blob([]).stream === 'function') {
      source = new Blob([chunk]).stream()
    } else {
      throw new Error('Браузер не умеет распаковывать .xlsx. Обнови Chrome/Safari.')
    }
  }
  const stream = source.pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Достать содержимое одного файла из ZIP. */
async function readEntry(zip, entry) {
  const { bytes, view } = zip
  const off = entry.localOff
  if (readU32(view, off) !== LOC_SIG) throw new Error(`Битый .xlsx: ${entry.name}`)
  const nameLen = readU16(view, off + 26)
  const extraLen = readU16(view, off + 28)
  const start = off + 30 + nameLen + extraLen
  const raw = bytes.subarray(start, start + entry.compSize)
  if (entry.method === 0) return new TextDecoder('utf-8').decode(raw)
  if (entry.method === 8) return new TextDecoder('utf-8').decode(await inflateRaw(raw))
  throw new Error('Неизвестный способ сжатия в .xlsx')
}

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('Повреждённый XML внутри .xlsx')
  return doc
}

/** Общий текст узла: собираем все <t>, включая rich-text прогоны. */
function nodeText(node) {
  if (!node) return ''
  const parts = node.getElementsByTagName('t')
  if (!parts.length) return (node.textContent || '').trim()
  let out = ''
  for (const t of parts) out += t.textContent || ''
  return out.trim()
}

function columnIndex(ref) {
  const m = /^([A-Z]+)/.exec(String(ref || '').toUpperCase())
  if (!m) return -1
  let n = 0
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** Выбрать нужный лист: по имени (если задано) или первый. */
async function pickSheet(zip, wantedName) {
  const byName = new Map(zip.entries.map((e) => [e.name, e]))
  const sheets = zip.entries
    .filter((e) => /^xl\/worksheets\/[^/]+\.xml$/i.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
  if (!sheets.length) throw new Error('В файле нет листов — это точно .xlsx?')

  let sheetName = ''
  let target = sheets[0]
  const wbEntry = byName.get('xl/workbook.xml')
  if (wbEntry) {
    try {
      const wb = parseXml(await readEntry(zip, wbEntry))
      const list = [...wb.getElementsByTagName('sheet')].map((s) => ({
        name: s.getAttribute('name') || '',
        rid: s.getAttribute('r:id') || s.getAttribute('id') || '',
      }))
      const relsEntry = byName.get('xl/_rels/workbook.xml.rels')
      const rels = new Map()
      if (relsEntry) {
        const relDoc = parseXml(await readEntry(zip, relsEntry))
        for (const r of relDoc.getElementsByTagName('Relationship')) {
          const id = r.getAttribute('Id') || ''
          let t = r.getAttribute('Target') || ''
          if (!t) continue
          if (!t.startsWith('/')) t = `xl/${t.replace(/^\.\//, '')}`
          else t = t.slice(1)
          rels.set(id, t.replace(/\/{2,}/g, '/'))
        }
      }
      const picked = wantedName
        ? list.find((s) => s.name.toLowerCase() === String(wantedName).toLowerCase())
        : list[0]
      if (picked) {
        sheetName = picked.name
        const path = rels.get(picked.rid)
        if (path && byName.has(path)) target = byName.get(path)
      }
    } catch {
      /* остаёмся на первом листе */
    }
  }
  return { entry: target, name: sheetName }
}

/**
 * Прочитать книгу.
 * @returns {Promise<{name:string, rows:string[][], maxRow:number, maxCol:number}>}
 */
export async function readXlsx(file, { sheetName = '' } = {}) {
  if (!file) throw new Error('Файл не выбран')
  const buf = await file.arrayBuffer()
  if (!buf || buf.byteLength < 64) throw new Error('Файл пустой или повреждён')
  if (typeof DOMParser === 'undefined') throw new Error('Браузер не умеет читать .xlsx')

  // Старый .xls (бинарный) — не ZIP, распаковать нечем.
  const head = new Uint8Array(buf, 0, Math.min(4, buf.byteLength))
  if (head[0] === 0xd0 && head[1] === 0xcf) {
    throw new Error('Это старый Excel .xls. Пересохрани как .xlsx (Файл → Сохранить как).')
  }

  const zip = readCentralDirectory(buf)
  const byName = new Map(zip.entries.map((e) => [e.name, e]))

  // Общие строки: почти весь текст в шаблоне лежит здесь.
  const shared = []
  const ssEntry = byName.get('xl/sharedStrings.xml')
  if (ssEntry) {
    const doc = parseXml(await readEntry(zip, ssEntry))
    for (const si of doc.getElementsByTagName('si')) shared.push(nodeText(si))
  }

  const { entry, name } = await pickSheet(zip, sheetName)
  const doc = parseXml(await readEntry(zip, entry))

  const rows = []
  let maxRow = 0
  let maxCol = 0
  for (const rowEl of doc.getElementsByTagName('row')) {
    const r = Number(rowEl.getAttribute('r')) - 1
    if (!Number.isFinite(r) || r < 0) continue
    const line = rows[r] || (rows[r] = [])
    for (const c of rowEl.getElementsByTagName('c')) {
      const col = columnIndex(c.getAttribute('r'))
      if (col < 0) continue
      const type = c.getAttribute('t') || ''
      let value = ''
      if (type === 's') {
        const v = c.getElementsByTagName('v')[0]
        const idx = v ? Number(v.textContent) : -1
        value = Number.isFinite(idx) ? shared[idx] || '' : ''
      } else if (type === 'inlineStr') {
        value = nodeText(c.getElementsByTagName('is')[0])
      } else {
        const v = c.getElementsByTagName('v')[0]
        value = v ? (v.textContent || '').trim() : ''
      }
      if (value === '') continue
      line[col] = value
      if (col > maxCol) maxCol = col
    }
    if (line.length && r > maxRow) maxRow = r
  }

  for (let i = 0; i <= maxRow; i++) {
    const line = rows[i] || (rows[i] = [])
    for (let j = 0; j <= maxCol; j++) if (line[j] === undefined) line[j] = ''
  }

  return {
    name: name || 'Лист1',
    rows,
    maxRow: maxRow + 1,
    maxCol: maxCol + 1,
  }
}

export default readXlsx
