// Czy fakt dotyczy rodziny (dziedziczenie: marka → technologia → seria → model → wariant)
const eq = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

export function applies(fact, fam) {
  if (fact.brand_id && fact.brand_id !== fam.brand_id) return false
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
