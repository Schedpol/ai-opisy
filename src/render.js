// Renderer opisu HTML sterowany szablonem (kolejność sekcji, obrazki, style).
// Ten sam kod działa w aplikacji (podgląd) i w n8n (generacja) – nie zmieniaj jednego bez drugiego.
export const DEFAULT_STYLES = { max_width: 920, font_size: 15, line_height: 1.6, text_color: '#333333', heading_color: '#0D1B3E', accent_color: '#1E4D9B', h1_size: 26, h2_size: 22, hero_tag: 'h1' }

export function renderDescription(fields, template, images) {
  const st = { ...DEFAULT_STYLES, ...(template?.styles || {}) }
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const attr = s => esc(s).replace(/"/g, '&quot;')
  const g = k => String(fields?.[k] ?? '').trim()
  const img = (src, alt) => src ? `<img alt="${attr(alt)}" src="${attr(src)}" style="width: 100%; height: auto">` : ''
  // obrazek sekcji: rozwiązany adres (biblioteka / produkt) albo stały adres z szablonu
  const srcOf = sec => images ? (images[sec.key] || '') : ((sec.image_source || 'static') === 'static' ? (sec.image_url || '') : '')
  const hr = '<hr style="border: none; margin: 32px auto">'
  const h2 = (text, bottom) => `<h2 style="font-size: ${st.h2_size}px; color: ${st.heading_color}; margin: 0 0 ${bottom}px 0">${esc(text)}</h2>`
  const ht = st.hero_tag === 'h2' ? 'h2' : 'h1'
  let h = `<div style="max-width: ${st.max_width}px; margin: 0 auto; color: ${st.text_color}; font-size: ${st.font_size}px; line-height: ${st.line_height}">`
  for (const sec of (template?.sections || []).filter(s => s && s.enabled !== false)) {
    const k = sec.key
    if (sec.type === 'hero') {
      h += img(srcOf(sec), g('HERO_IMG_ALT'))
      h += `<${ht} style="font-size: ${st.h1_size}px; color: ${st.heading_color}; margin: 0 0 10px 0">${esc(g('HERO_H1'))}</${ht}>`
      if (g('HERO_LEAD')) h += `<p style="margin: 0 0 8px 0; font-size: 16px">${esc(g('HERO_LEAD'))}</p>`
    } else if (sec.type === 'content') {
      const lis = sec.list === false ? [] : [1, 2, 3, 4, 5].map(b => g(`${k}_LI${b}`)).filter(Boolean)
      const H2 = g(`${k}_H2`), P = g(`${k}_P`), PB = sec.bold === false ? '' : g(`${k}_P_BOLD`), AK = sec.accent ? g(`${k}_AKCENT`) : ''
      if (!H2 && !P && !PB && !lis.length && !AK) continue   // pusta sekcja znika razem z obrazkiem
      h += hr + '<div style="text-align: left">' + h2(H2, 12)
      if (P || PB) h += `<p style="margin: 0 0 ${(lis.length || AK) ? 10 : 14}px 0">${esc(P)}${PB ? ' <strong>' + esc(PB) + '</strong>' : ''}</p>`
      if (lis.length) h += `<ul style="margin: 0 0 ${AK ? 10 : 14}px 0; padding-left: 18px">` + lis.map(l => `<li>${esc(l)}</li>`).join('') + '</ul>'
      if (AK) h += `<p style="margin: 0 0 14px 0; color: ${st.accent_color}"><strong>${esc(AK)}</strong></p>`
      h += img(srcOf(sec), g(`${k}_IMG_ALT`)) + '</div>'
    } else if (sec.type === 'faq') {
      const qs = [1, 2, 3, 4, 5, 6].slice(0, sec.max_questions || 6).map(i => ({ q: g(`FAQ_Q${i}`), a: g(`FAQ_A${i}`) })).filter(x => x.q && x.a)
      if (!qs.length) continue
      h += hr + '<div>' + h2(g('FAQ_H2'), 16)
      qs.forEach((x, i) => {
        h += `<p style="margin: 0 0 4px 0; color: ${st.heading_color}"><strong>${i + 1}. ${esc(x.q)}</strong></p><p style="${i === qs.length - 1 ? 'margin: 0' : 'margin: 0 0 14px 0'}">${esc(x.a)}</p>`
      })
      h += '</div>'
    }
  }
  return h + '</div>'
}

// Lista pól, które AI ma wypełnić dla danego szablonu (kontrakt generacji)
export function templateFields(template) {
  const keys = []
  for (const sec of (template?.sections || []).filter(s => s && s.enabled !== false)) {
    if (sec.type === 'hero') keys.push('HERO_IMG_ALT', 'HERO_H1', 'HERO_LEAD')
    if (sec.type === 'content') {
      keys.push(`${sec.key}_H2`, `${sec.key}_P`)
      if (sec.bold !== false) keys.push(`${sec.key}_P_BOLD`)
      if (sec.list !== false) keys.push(...[1, 2, 3, 4, 5].map(b => `${sec.key}_LI${b}`))
      if (sec.accent) keys.push(`${sec.key}_AKCENT`)
      if (hasImage(sec)) keys.push(`${sec.key}_IMG_ALT`)
    }
    if (sec.type === 'faq') { keys.push('FAQ_H2'); for (let i = 1; i <= (sec.max_questions || 6); i++) keys.push(`FAQ_Q${i}`, `FAQ_A${i}`) }
  }
  return keys
}

const hasImage = sec => { const src = sec.image_source || 'static'; return src === 'static' ? !!sec.image_url : src !== 'none' }

const eq = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

// Dobór grafik: biblioteka (model → seria → technologia → marka → stały adres zapasowy) albo zdjęcie SKU wg roli
export function resolveImages(template, { brand_id, family = {}, product = {}, library = [] } = {}) {
  const out = {}
  for (const sec of (template?.sections || []).filter(s => s && s.enabled !== false && s.type !== 'faq')) {
    const src = sec.image_source || 'static'
    if (src === 'none') continue
    if (src === 'static') { if (sec.image_url) out[sec.key] = sec.image_url; continue }
    if (src === 'product') {
      const imgs = product.images || []
      const hit = sec.image_role ? imgs.find(i => eq(i.role, sec.image_role)) : [...imgs].sort((a, b) => a.position - b.position)[0]
      if (hit) out[sec.key] = hit.url
      continue
    }
    const pool = library.filter(m => eq(m.role, sec.image_role) && (!m.brand_id || m.brand_id === brand_id))
    const hit = pool.find(m => m.scope === 'model' && m.scope_value === family.id)
      || pool.find(m => m.scope === 'seria' && eq(m.scope_value, family.series))
      || pool.find(m => m.scope === 'technologia' && (family.technologies || []).some(t => eq(t, m.scope_value)))
      || pool.find(m => m.scope === 'marka')
    if (hit) out[sec.key] = hit.url
    else if (sec.image_url) out[sec.key] = sec.image_url
  }
  return out
}
