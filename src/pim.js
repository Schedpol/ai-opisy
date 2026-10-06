// Import listy asortymentu z eksportu PIM (kolumny mapowane po POZYCJI – nagłówki w eksporcie są błędne).
// Jeśli układ eksportu się zmieni, popraw indeksy w PIM_COLUMNS (liczone od zera).
export const PIM_COLUMNS = { sku: 0, type: 1, locale: 2, path: 10, ean: 17, shape: 20, brand: 21, model: 22, name: 23, color: 31, series_label: 32, technology: 44 }

// --- kodowanie: UTF-8, Windows-1250, albo „podwójne” UTF-8 (otwarte w programie jako ISO-8859-2) ---
const MOJIBAKE = /[ĹÄĂÂ][\u0080-\u00BF\u0100-\u017F\u02C0-\u02DD\u2010-\u203A]|Ä[…™‡]|Ĺ[‚„›şź]/
let latin2Map = null
function latin2ToBytes(text) {
  if (!latin2Map) {
    latin2Map = new Map()
    const dec = new TextDecoder('iso-8859-2')
    for (let b = 0; b < 256; b++) latin2Map.set(dec.decode(new Uint8Array([b])), b)
    const dec2 = new TextDecoder('windows-1250')
    for (let b = 128; b < 256; b++) { const ch = dec2.decode(new Uint8Array([b])); if (!latin2Map.has(ch)) latin2Map.set(ch, b) }
  }
  const out = []
  for (const ch of text) {
    const b = latin2Map.get(ch)
    if (b === undefined) { for (const x of new TextEncoder().encode(ch)) out.push(x) } else out.push(b)
  }
  return new Uint8Array(out)
}
export function fixMojibake(text) {
  if (!MOJIBAKE.test(text)) return { text, fixed: false, lossy: false }
  const repaired = new TextDecoder('utf-8').decode(latin2ToBytes(text))
  const bad = (repaired.match(/\uFFFD/g) || []).length
  if (bad > repaired.length / 200) return { text, fixed: false, lossy: true }
  return { text: repaired.replace(/\uFFFD/g, ''), fixed: true, lossy: bad > 0 }
}
export function decodeBytes(buf) {
  let text
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf) } catch { text = new TextDecoder('windows-1250').decode(buf) }
  return fixMojibake(text.replace(/^\uFEFF/, ''))
}

const SHAPES = { kwadratowy: 'kwadratowy', prostokatny: 'prostokątny', polokragly: 'półokrągły', pieciokatny: 'pięciokątny', asymetryczny: 'asymetryczny' }
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s
const titleCase = s => String(s || '').toLowerCase().replace(/(^|\s)\p{L}/gu, m => m.toUpperCase())

// Czy wiersze wyglądają jak eksport PIM (tabela bez sensownych nagłówków)
export function isPim(rows) {
  const sample = rows.slice(1, 21).filter(r => r.length > 40)
  if (sample.length < 1) return false
  const ok = sample.filter(r => /PRODUCT/i.test(r[PIM_COLUMNS.type] || '') || /^[a-z]{2}_[A-Z]{2}$/.test(r[PIM_COLUMNS.locale] || '')).length
  return ok / sample.length > 0.7
}

export function rowsFromPim(rows) {
  const C = PIM_COLUMNS
  const out = [], problems = []
  const body = /PRODUCT/i.test(rows[0]?.[C.type] || '') ? rows : rows.slice(1)
  body.forEach((r, i) => {
    const sku = String(r[C.sku] || '').trim()
    if (!sku) return
    const ean = String(r[C.ean] || '').trim()
    if (ean && !/^\d{8,14}$/.test(ean)) problems.push(i)
    const path = String(r[C.path] || '').split('\\').map(s => s.trim()).filter(Boolean).map(cap)
    const rawName = String(r[C.name] || '').replace(/\s+/g, ' ').trim()
    const name = rawName.startsWith(sku) ? rawName.slice(sku.length).trim() : rawName
    const shapeKey = String(r[C.shape] || '').replace(/^ksztalt__/, '')
    out.push({
      sku, name, ean: ean || null, brand: String(r[C.brand] || '').trim() || null,
      model: String(r[C.model] || '').trim() || null,
      category: path[0] || null, category_path: path.length ? path : null,
      technology: String(r[C.technology] || '').trim() || null,
      color: r[C.color] ? titleCase(r[C.color].trim()) : null,
      shape: SHAPES[shapeKey] || (shapeKey || null), source: 'pim', bl_id: null,
    })
  })
  return { rows: out, badLayout: out.length > 0 && problems.length / out.length > 0.2 }
}
