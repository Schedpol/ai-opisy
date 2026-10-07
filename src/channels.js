// Operacje na kanałach wspólne dla Ustawień i Szablonów
import { supabase } from './supabase.js'
import { OUTPUT_PRESETS } from './render.js'

// Kopiuje aktywne szablony (domyślny + kategorie) z rynku źródłowego na docelowy; formatKey = klucz OUTPUT_PRESETS albo '' (jak w źródle)
export async function copyTemplates(source, target, formatKey = '') {
  const [{ data: tpls, error: e1 }, { data: existing }] = await Promise.all([
    supabase.from('templates').select('*').eq('channel_id', source.id).eq('status', 'aktywny'),
    supabase.from('templates').select('brand_id, category').eq('channel_id', target.id).eq('status', 'aktywny'),
  ])
  if (e1) throw e1
  const from = `${source.marketplace} ${source.language.toUpperCase()}`, to = `${target.marketplace} ${target.language.toUpperCase()}`
  const rows = (tpls || [])
    .filter(t => !(existing || []).some(x => x.brand_id === t.brand_id && (x.category || '') === (t.category || '')))
    .map(t => ({
      channel_id: target.id, brand_id: t.brand_id, category: t.category, sections: t.sections, version: 1, status: 'aktywny',
      styles: formatKey ? { ...(t.styles || {}), output: { ...OUTPUT_PRESETS[formatKey].output } } : t.styles,
      name: String(t.name).replace(from, to),
    }))
  if (rows.length) { const { error } = await supabase.from('templates').insert(rows); if (error) throw error }
  return { copied: rows.length, skipped: (tpls || []).length - rows.length, withCategories: rows.some(r => r.category) }
}

// Usuwa kanał razem z jego szablonami; blokuje, gdy kanał ma już opisy (wtedy tylko wyłączenie)
export async function deleteChannel(channel, { withLanguageData = false } = {}) {
  const { count } = await supabase.from('descriptions').select('id', { count: 'exact', head: true }).eq('channel_id', channel.id)
  if (count) return { blocked: count }
  const t = await supabase.from('templates').delete().eq('channel_id', channel.id); if (t.error) throw t.error
  const c = await supabase.from('channels').delete().eq('id', channel.id); if (c.error) throw c.error
  let langRemoved = 0
  if (withLanguageData) {
    const kb = await supabase.from('keyword_banks').delete().eq('language', channel.language).select('id'); if (kb.error) throw kb.error
    const qa = await supabase.from('qa_rules').delete().eq('language', channel.language).select('id'); if (qa.error) throw qa.error
    langRemoved = (kb.data || []).length + (qa.data || []).length
  }
  return { deleted: true, langRemoved }
}
