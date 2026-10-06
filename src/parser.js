// Rozpoznawanie atrybutów wariantów z nazwy, SKU i ścieżki zdjęcia.
// Ta sama logika dla importu z Baselinkera i z pliku CSV.

const NAME_RX = /^(\S+)\s+Brodzik\s+(\S+)\s+(\S+)\s+(.+?)\s+(\d+)\s*x\s*(\d+)\s*x\s*(\d+(?:[.,]\d+)?)(?:\s+R(\d+))?$/i
const IMG_SHAPES = { kwadrat: 'kwadratowy', prostokat: 'prostokątny', polokragly: 'półokrągły', pieciokat: 'pięciokątny' }
const MATERIALS = { akrylowy: 'akryl', kompozytowy: 'kompozyt' }

export const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim()

function ruleFor(rules, brandId, attribute, sku) {
  const [base, ...rest] = sku.split('/')
  const suffix = rest.join('/')
  const list = rules.filter(r => r.active !== false && r.attribute === attribute && (!r.brand_id || r.brand_id === brandId))
  return (
    list.find(r => r.match_type === 'base' && r.pattern === base) ||
    list.find(r => r.match_type === 'suffix' && r.pattern === suffix) ||
    list.filter(r => r.match_type === 'prefix' && r.pattern && base.startsWith(r.pattern)).sort((a, b) => b.pattern.length - a.pattern.length)[0] ||
    null
  )
}

// raw: [{ sku, ean, name, image, bl_id, weight }], brands: [{id, name}], rules: import_rules
export function parseProducts(raw, brands, rules) {
  const out = raw.map(p => {
    const sku = clean(p.sku), name = clean(p.name), flags = []
    if (String(p.name ?? '') !== name) flags.push('Podwójne spacje w nazwie (poprawione)')
    if (/\p{L}\?\p{L}/u.test(name)) flags.push('Nazwa zawiera „?” zamiast polskich znaków – sprawdź kodowanie pliku')
    const m = name.match(NAME_RX)
    const brand = m ? brands.find(b => b.name.toLowerCase() === m[1].toLowerCase()) : null
    const a = {}
    if (!m) flags.push('Nazwa nierozpoznana – rodzinę i atrybuty uzupełnij ręcznie')
    else {
      if (!brand) flags.push(`Nieznana marka „${m[1]}” – dodaj ją w bazie`)
      a.material = MATERIALS[m[2].toLowerCase()] || m[2].toLowerCase()
      a.wymiar = `${m[5]}x${m[6]}`
      a.wysokosc_cm = Number(m[7].replace(',', '.'))
      const fromName = m[8] ? 'półokrągły' : m[5] === m[6] ? 'kwadratowy' : 'prostokątny'
      const override = ruleFor(rules, brand?.id, 'ksztalt', sku)
      a.ksztalt = override ? override.value : fromName
      if (m[8]) a.promien_cm = Number(m[8])
      if (override && override.value !== fromName) flags.push(`Kształt z reguły słownika: ${override.value} (z nazwy wynikałby ${fromName})`)
    }
    const fin = ruleFor(rules, brand?.id, 'wykonczenie', sku)
    if (fin) a.wykonczenie = fin.value
    else if (m) flags.push(`Brak reguły wykończenia dla końcówki SKU „${sku.split('/').slice(1).join('/') || '(brak)'}”`)
    // „krótszy/dłuższy bok” ma sens tylko w prostokącie
    const drain = ruleFor(rules, brand?.id, 'odplyw', sku)
    if (drain && a.ksztalt === 'prostokątny') a.odplyw = drain.value
    const imgShape = Object.keys(IMG_SHAPES).find(k => new RegExp(`/${k}/`, 'i').test(p.image || ''))
    if (imgShape && a.ksztalt && IMG_SHAPES[imgShape] !== a.ksztalt) flags.push(`Zdjęcie główne pokazuje kształt „${IMG_SHAPES[imgShape]}”, a wariant to „${a.ksztalt}”`)
    if (p.weight !== undefined && !(Number(String(p.weight).replace(',', '.')) > 0)) flags.push('Waga = 0')
    // wszystkie zdjęcia SKU z rolą z reguł słownika (pozycja w Base albo fragment nazwy pliku)
    const imgRules = rules.filter(r => r.active !== false && r.attribute === 'zdjecie' && (!r.brand_id || r.brand_id === brand?.id))
    const images = (p.images?.length ? p.images : p.image ? [p.image] : []).filter(Boolean).map((url, i) => {
      const file = String(url).split('/').pop().toLowerCase()
      const rule = imgRules.find(r => r.match_type === 'filename' && r.pattern && file.includes(r.pattern.toLowerCase()))
        || imgRules.find(r => r.match_type === 'position' && Number(r.pattern) === i + 1)
      return { url, position: i + 1, role: rule ? rule.value : null }
    })
    return {
      sku, ean: clean(p.ean), name, image_url: images[0]?.url || null, images, bl_id: p.bl_id ? Number(p.bl_id) : null,
      brand_id: brand?.id || null, brand_name: brand?.name || (m ? m[1] : null),
      model_name: m ? m[3] : null, series: m ? clean(m[4]) : null, category: m ? `brodziki ${a.material === 'akryl' ? 'akrylowe' : a.material}` : null,
      attributes: a, flags,
    }
  })
  // nazwa identyczna z innym SKU = marketplace pokaże duplikaty
  const count = {}
  out.forEach(p => { count[p.name] = (count[p.name] || 0) + 1 })
  out.forEach(p => { if (count[p.name] > 1) p.flags.push(`Nazwa identyczna jak u ${count[p.name] - 1} innych SKU`) })
  return out
}

export function groupFamilies(parsed) {
  const fams = {}
  for (const p of parsed) {
    const key = p.model_name ? `${p.brand_name}|${p.model_name}` : '—|nierozpoznane'
    ;(fams[key] ||= { key, brand_name: p.brand_name, brand_id: p.brand_id, model_name: p.model_name, series: p.series, category: p.category, items: [] }).items.push(p)
  }
  return Object.values(fams)
}

// Wiersze z eksportu CSV Baselinkera
export function rowsFromBaselinkerCsv(rows) {
  return rows.filter(r => r.produkt_sku).map(r => ({
    sku: r.produkt_sku, ean: r.produkt_ean, name: r.produkt_nazwa, image: r.zdjecie, bl_id: r.produkt_id, weight: r.waga,
    images: [r.zdjecie, ...Array.from({ length: 15 }, (_, i) => r[`zdjecie_dodatkowe_${i + 1}`])].filter(Boolean),
  }))
}

// Marka i model z nazwy (do drzewa asortymentu); dla nazw spoza wzorca: marka = pierwsze słowo
export function parseModel(name) {
  const n = clean(name)
  const m = n.match(NAME_RX)
  if (m) return { brand: m[1], model: m[3] }
  return { brand: n.split(' ')[0] || null, model: null }
}
