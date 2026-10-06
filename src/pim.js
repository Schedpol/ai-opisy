// Import listy asortymentu z eksportu PIM (kolumny mapowane po POZYCJI – nagłówki w eksporcie są błędne).
// Jeśli układ eksportu się zmieni, popraw indeksy w PIM_COLUMNS (liczone od zera).
export const PIM_COLUMNS = { sku: 0, type: 1, locale: 2, path: 10, ean: 17, shape: 20, brand: 21, model: 22, name: 23, color: 31, series_label: 32, dims_label: 36, technology: 44, weight: 46 }

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
      _raw: { name: rawName, series: String(r[C.series_label] || '').trim(), dims: String(r[C.dims_label] || '').trim(), weight: String(r[C.weight] || '').trim(), path: String(r[C.path] || '') },
    })
  })
  checkQuality(out)
  out.forEach(o => { delete o._raw })
  return { rows: out, badLayout: out.length > 0 && problems.length / out.length > 0.2 }
}

// ===== Kontrola jakości danych PIM =====
export const RULES = {
  shape_name: 'Kształt w nazwie ≠ pole kształtu',
  square_dims: 'Kwadrat z różnymi bokami',
  radius: 'Promień R przy kształcie bez łuku',
  variant_shape: 'Wariant kolorystyczny ma inny kształt niż wersja bazowa',
  color: 'Kolor w nazwie ≠ pole koloru',
  model: 'Model ≠ seria / nazwa w cudzysłowie',
  dims_label: 'Wymiar w nazwie ≠ wymiar etykiety',
  ean_checksum: 'Błędna suma kontrolna EAN',
  ean_duplicate: 'Ten sam EAN na kilku SKU',
  missing: 'Brak kluczowych pól',
  name_format: 'Formatowanie nazwy',
}
const SHAPE_WORDS = [['pięciokąt', 'pięciokątny'], ['półokrągł', 'półokrągły'], ['asymetryczn', 'asymetryczny'], ['kwadratow', 'kwadratowy'], ['prostokątn', 'prostokątny']]
const COLORS = ['black scale', 'cement scale', 'anthracite scale', 'grey scale', 'gray scale', 'white scale', 'beige scale', 'biege scale', 'smooth white']
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').trim()
const dimsOf = s => { const m = String(s || '').match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)(?:\s*x\s*(\d+(?:[.,]\d+)?))?/i); return m ? m.slice(1).map(x => x == null ? null : Number(x.replace(',', '.'))) : null }
const eanOk = e => { if (!/^\d{13}$/.test(e)) return /^\d{8}$/.test(e); const d = e.split('').map(Number); const sum = d.slice(0, 12).reduce((a, x, i) => a + x * (i % 2 ? 3 : 1), 0); return (10 - sum % 10) % 10 === d[12] }
const NEEDS_SHAPE = /brodzik|wann|panel|nośnik|nosnik|obudow/i

export function checkQuality(rows) {
  const byEan = {}, bySku = Object.fromEntries(rows.map(r => [r.sku, r]))
  rows.forEach(r => { if (r.ean) (byEan[r.ean] ||= []).push(r.sku) })
  for (const r of rows) {
    const iss = [], add = (code, msg) => iss.push({ code, msg })
    const raw = r._raw || {}, name = raw.name || r.name || ''
    // kształt z nazwy
    // „do wanien półokrągłych” opisuje produkt docelowy, nie ten produkt – pomijamy frazy „do …” aż do wymiaru/przecinka
    const ownName = name.replace(/\bdo\s+[^\d,]*?(?=\d|,|$)/gi, ' ')
    const nameShape = SHAPE_WORDS.find(([w]) => ownName.toLowerCase().includes(w))?.[1]
    if (nameShape && r.shape && nameShape !== r.shape) add('shape_name', `w nazwie „${nameShape}”, w polu „${r.shape}”`)
    // kwadrat z różnymi bokami
    const nd = dimsOf(name)
    if (nd && nd[0] !== nd[1] && (nameShape === 'kwadratowy' || (!nameShape && r.shape === 'kwadratowy'))) add('square_dims', `„kwadratowy”, a wymiar ${nd[0]}x${nd[1]}`)
    // promień
    const rm = name.match(/\bR(\d{2})\b/)
    if (rm && r.shape && !['półokrągły', 'asymetryczny'].includes(r.shape)) add('radius', `R${rm[1]} w nazwie, kształt „${r.shape}”`)
    // wariant vs baza
    const base = r.sku.split('/')[0]
    if (base !== r.sku && bySku[base] && bySku[base].shape && r.shape && bySku[base].shape !== r.shape) add('variant_shape', `${base}: „${bySku[base].shape}”, ten wariant: „${r.shape}”`)
    // kolor
    const nameColor = COLORS.find(c => norm(name).includes(c))
    if (r.color && nameColor && norm(r.color) !== nameColor) add('color', `w nazwie „${nameColor.replace(/\b\w/g, m => m.toUpperCase())}”, w polu „${r.color}”`)
    if (r.color && /biege/i.test(r.color)) add('color', `literówka w kolorze: „${r.color}” (Beige?)`)
    // model
    const quoted = (name.match(/"\s*([^"]+?)\s*"/) || [])[1]
    const qModel = quoted ? quoted.replace(/\s+(SET|Plus)$/i, '').trim() : null
    const series = raw.series && raw.series.length <= 25 && !/accessor|für|for |passt/i.test(raw.series) ? raw.series : null
    if (r.model && qModel && !norm(qModel).startsWith(norm(r.model)) && !norm(r.model).startsWith(norm(qModel)) && !/de luxe/i.test(qModel)) add('model', `pole modelu „${r.model}”, w nazwie „${quoted}”`)
    else if (r.model && series && !norm(series).startsWith(norm(r.model))) add('model', `pole modelu „${r.model}”, seria „${series}”`)
    // wymiary nazwa vs etykieta
    const ld = dimsOf(raw.dims)
    if (nd && ld && nd[2] != null && ld[2] != null) {
      const same = (a, b) => Math.abs(a - b) < 0.01
      const sameWD = (same(nd[0], ld[0]) && same(nd[1], ld[1])) || (same(nd[0], ld[1]) && same(nd[1], ld[0]))
      if (!sameWD || !same(nd[2], ld[2])) add('dims_label', `nazwa ${nd.map(n => String(n).replace('.', ',')).join('x')}, etykieta ${raw.dims}`)
    }
    // EAN
    if (r.ean && !eanOk(r.ean)) add('ean_checksum', `EAN ${r.ean}`)
    if (r.ean && byEan[r.ean].length > 1) add('ean_duplicate', `ten sam EAN co ${byEan[r.ean].filter(x => x !== r.sku).join(', ')}`)
    // braki
    const miss = []
    if (!r.ean) miss.push('EAN')
    if (!r.shape && NEEDS_SHAPE.test(raw.path + ' ' + name)) miss.push('kształt')
    if (!r.model && /^\\?(brodziki|wanny)/i.test(raw.path)) miss.push('model')
    if (!(Number(String(raw.weight).replace(',', '.')) > 0)) miss.push('waga')
    if (miss.length) add('missing', `brak: ${miss.join(', ')}`)
    // formatowanie nazwy
    if (raw.name && raw.name.startsWith(r.sku) && /^\S/.test(raw.name.slice(r.sku.length))) add('name_format', 'brak spacji po SKU na początku nazwy')
    if (/\s{2,}/.test(raw.name || '')) add('name_format', 'podwójne spacje w nazwie')
    r.issues = iss
  }
  return rows
}
