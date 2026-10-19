// Czy fakt dotyczy rodziny (dziedziczenie: marka → technologia → seria → model → wariant)
const eq = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

export const baseModel = name => String(name || '').split(' + ')[0].trim()

export function applies(fact, fam, families = []) {
  if (fact.brand_id && fact.brand_id !== fam.brand_id) return false
  // fakty modelu przechodzą na zestawy tego modelu (np. „Hesperia” → „Hesperia + nośnik”)
  if ((fact.level === 'model' || fact.level === 'wariant') && fact.family_id && fact.family_id !== fam.id) {
    const src = families.find(f => f.id === fact.family_id)
    return !!src && src.brand_id === fam.brand_id && eq(src.model_name, baseModel(fam.model_name)) && fam.model_name !== src.model_name
  }
  switch (fact.level) {
    case 'marka': return !!fact.brand_id
    case 'technologia': return (fam.technologies || []).some(t => eq(t, fact.technology))
    case 'seria': return eq(fam.series, fact.series)
    case 'model':
    case 'wariant': return fact.family_id === fam.id
    default: return false
  }
}

export const LEVEL_LABEL = { marka: 'Marka', technologia: 'Technologia', seria: 'Seria', model: 'Model', wariant: 'Wariant' }

export function scopeLabel(fact, brands, families) {
  const brand = brands.find(b => b.id === fact.brand_id)?.name
  const fam = families.find(f => f.id === fact.family_id)?.model_name
  const what = { marka: brand, technologia: fact.technology, seria: fact.series, model: fam, wariant: fam }[fact.level]
  return `${LEVEL_LABEL[fact.level]}: ${what || '—'}${brand && fact.level !== 'marka' ? ` · ${brand}` : ''}`
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
