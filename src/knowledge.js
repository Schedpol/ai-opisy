// Poziomy: marka → kategoria → technologia → seria (rodzina, np. Antis) → model (seria w kolorze) → wariant (SKU)
const eq = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

export const baseModel = name => String(name || '').split(' + ')[0].trim()

// rodzina faktu albo jej zestaw (fakty „Antis” obowiązują też „Antis + nośnik”)
function familyMatch(fact, fam, families) {
  if (!fact.family_id) return false
  if (fact.family_id === fam.id) return true
  const src = families.find(f => f.id === fact.family_id)
  return !!src && src.brand_id === fam.brand_id && eq(src.model_name, baseModel(fam.model_name)) && fam.model_name !== src.model_name
}

// kategoria faktu „brodziki” obejmuje „brodziki standard”, „brodziki kompozytowe”…; „brodziki kompozytowe” – tylko siebie
export const categoryMatch = (famCat, factCat) => { const a = String(famCat || '').trim().toLowerCase(), b = String(factCat || '').trim().toLowerCase(); return !!b && (a === b || a.startsWith(b + ' ')) }

// Czy fakt dotyczy produktu (product = konkretny SKU; bez niego tylko poziomy ogólne)
export function applies(fact, fam, families = [], product = null) {
  if (fact.brand_id && fact.brand_id !== fam.brand_id) return false
  switch (fact.level) {
    case 'marka': return !!fact.brand_id
    case 'kategoria': return categoryMatch(fam.category, fact.category)
    case 'technologia': return (fam.technologies || []).some(t => eq(t, fact.technology))
    case 'seria': return familyMatch(fact, fam, families)
    case 'model': return familyMatch(fact, fam, families) && !!product && eq(product.attributes?.wykonczenie, fact.color)
    case 'wariant': return !!product && fact.product_id === product.id
    default: return false
  }
}

// Czy fakt w ogóle dotyczy rodziny (do list i liczników, bez wskazywania SKU)
export function touchesFamily(fact, fam, families = []) {
  if (['model', 'wariant'].includes(fact.level)) return (!fact.brand_id || fact.brand_id === fam.brand_id) && familyMatch(fact, fam, families)
  return applies(fact, fam, families)
}

export const LEVEL_LABEL = { marka: 'Marka', kategoria: 'Kategoria', technologia: 'Technologia', seria: 'Seria', model: 'Model (kolor)', wariant: 'Wariant (SKU)' }
export const LEVEL_HINT = { marka: 'cała marka', kategoria: 'grupa produktów, np. brodziki, wanny', technologia: 'technologia ze słownika marki', seria: 'rodzina produktów, np. Antis', model: 'seria w konkretnym kolorze', wariant: 'konkretne SKU' }

export const categoryLabel = key => String(key || '').replace(/(^|\s)\p{L}/u, m => m.toUpperCase())

export function scopeLabel(fact, brands, families, products = [], categories = []) {
  const brand = brands.find(b => b.id === fact.brand_id)?.name
  const fam = families.find(f => f.id === fact.family_id)?.model_name
  const sku = products.find(p => p.id === fact.product_id)?.sku
  const what = { marka: brand, kategoria: categories.find(c => c.key === fact.category)?.label || categoryLabel(fact.category), technologia: fact.technology, seria: fam, model: fam && fact.color ? `${fam} · ${fact.color}` : fam, wariant: sku || fam }[fact.level]
  return `${LEVEL_LABEL[fact.level] || fact.level}: ${what || '—'}${brand && fact.level !== 'marka' ? ` · ${brand}` : ''}`
}

// Technologie (kb_technologies): podtechnologia + nadrzędna. Rodzina z „Stabildense – technologia kompozytowa”
// dostaje też „Stabildense”, więc fakty o technologii nadrzędnej trafiają do wszystkich jej odmian.
export function techFor(family, techs) {
  const cat = String(family.category || '').toLowerCase(), ser = String(family.series || '').toLowerCase()
  const out = new Set()
  for (const t of techs.filter(t => !t.brand_id || t.brand_id === family.brand_id)) {
    const hit = (t.match_category && cat.startsWith(t.match_category.toLowerCase())) || (t.match_series && ser.includes(t.match_series.toLowerCase()))
    if (!hit) continue
    out.add(t.name)
    const parent = techs.find(x => x.id === t.parent_id)
    if (parent) out.add(parent.name)
  }
  return [...out]
}

// Uzupełnia technologie rodzin według reguł (nigdy nie usuwa przypisanych ręcznie)
export async function autoAssignTechnologies(supabase, familyIds = null) {
  const [{ data: techs }, fq] = await Promise.all([
    supabase.from('kb_technologies').select('*'),
    (familyIds ? supabase.from('product_families').select('id, brand_id, category, series, technologies').in('id', familyIds) : supabase.from('product_families').select('id, brand_id, category, series, technologies')),
  ])
  if (!techs?.length) return 0
  let changed = 0
  for (const f of fq.data || []) {
    const add = techFor(f, techs).filter(t => !(f.technologies || []).includes(t))
    if (!add.length) continue
    const { error } = await supabase.from('product_families').update({ technologies: [...(f.technologies || []), ...add].sort() }).eq('id', f.id)
    if (!error) changed++
  }
  return changed
}
