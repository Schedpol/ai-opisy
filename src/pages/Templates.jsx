import { useEffect, useMemo, useState } from 'react'
import { supabase, plError } from '../supabase.js'
import { renderDescription, resolveImages, DEFAULT_STYLES } from '../render.js'

function sampleFields(template) {
  const f = { HERO_IMG_ALT: 'Baner', HERO_H1: 'Brodzik akrylowy Aedler Antis 90x90 cm, Smooth White', HERO_LEAD: 'Tu pojawi się lead: 1–2 zdania z najważniejszymi korzyściami i frazą główną.', FAQ_H2: 'Najczęściej zadawane pytania' }
  for (const s of template.sections || []) {
    if (s?.type !== 'content') continue
    const k = s.key
    Object.assign(f, {
      [`${k}_H2`]: s.topic || k, [`${k}_P`]: `Akapit sekcji „${s.topic || k}” – AI napisze go wyłącznie z faktów zatwierdzonych w księdze wiedzy.`,
      [`${k}_P_BOLD`]: 'Zdanie z najmocniejszym dowodem.', [`${k}_LI1`]: 'Pierwszy konkretny atut', [`${k}_LI2`]: 'Drugi konkretny atut',
      [`${k}_AKCENT`]: 'Wyróżnik marki', [`${k}_IMG_ALT`]: s.topic || k,
    })
  }
  ;[1, 2, 3].forEach(i => { f[`FAQ_Q${i}`] = `Przykładowe pytanie klienta ${i}?`; f[`FAQ_A${i}`] = 'Odpowiedź wyłącznie na podstawie faktów.' })
  return f
}

const SEC_NAME = { hero: 'Nagłówek (hero)', content: 'Sekcja treści', faq: 'FAQ' }

export default function Templates({ profile }) {
  const [list, setList] = useState(null)
  const [names, setNames] = useState({})
  const [sel, setSel] = useState(null)
  const [draft, setDraft] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [library, setLibrary] = useState([])
  const [prodRoles, setProdRoles] = useState([])
  const admin = profile?.role === 'admin'

  async function load(keepId) {
    const [t, c, b] = await Promise.all([
      supabase.from('templates').select('*').order('name'),
      supabase.from('channels').select('id, marketplace, language'),
      supabase.from('brands').select('id, name'),
    ])
    if (t.error) { setMsg({ type: 'error', text: plError(t.error.message) }); return }
    const [lib, ir] = await Promise.all([supabase.from('media_library').select('*'), supabase.from('import_rules').select('value').eq('attribute', 'zdjecie')])
    setLibrary(lib.data || []); setProdRoles([...new Set((ir.data || []).map(x => x.value))])
    setList(t.data); setNames({ c: c.data || [], b: b.data || [] })
    const pick = t.data.find(x => x.id === (keepId || sel)) || t.data[0]
    if (pick) { setSel(pick.id); setDraft({ sections: pick.sections, styles: { ...DEFAULT_STYLES, ...pick.styles } }) }
  }
  useEffect(() => { load() }, [])

  const current = list?.find(t => t.id === sel)
  const PLACEHOLDER = role => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="920" height="320"><rect width="100%" height="100%" fill="#E6E8E5"/><text x="50%" y="50%" fill="#4A5672" font-family="Arial" font-size="22" text-anchor="middle">Zdjęcie produktu z Base: ${role || 'pierwsze'}</text></svg>`)
  const preview = useMemo(() => {
    if (!draft) return ''
    const imgs = {}
    for (const sec of draft.sections.filter(x => x && x.enabled !== false && x.type !== 'faq')) {
      const src = sec.image_source || 'static'
      if (src === 'static' && sec.image_url) imgs[sec.key] = sec.image_url
      if (src === 'library') { const hit = library.find(m => (m.role || '').toLowerCase() === (sec.image_role || '').toLowerCase()); if (hit || sec.image_url) imgs[sec.key] = hit ? hit.url : sec.image_url }
      if (src === 'product') imgs[sec.key] = PLACEHOLDER(sec.image_role)
    }
    return renderDescription(sampleFields(draft), draft, imgs)
  }, [draft, library])
  const dirty = current && draft && JSON.stringify({ s: current.sections, st: { ...DEFAULT_STYLES, ...current.styles } }) !== JSON.stringify({ s: draft.sections, st: draft.styles })

  const setSec = (i, patch) => setDraft(d => ({ ...d, sections: d.sections.map((s, j) => j === i ? { ...s, ...patch } : s) }))
  const move = (i, dir) => setDraft(d => { const a = [...d.sections]; const j = i + dir; if (j < 0 || j >= a.length) return d; [a[i], a[j]] = [a[j], a[i]]; return { ...d, sections: a } })
  const setStyle = (k, v) => setDraft(d => ({ ...d, styles: { ...d.styles, [k]: v } }))
  function addSection() {
    const used = draft.sections.map(s => s.key)
    let n = 1; while (used.includes(`S${n}`)) n++
    if (n > 9) return
    const faqAt = draft.sections.findIndex(s => s.type === 'faq')
    const a = [...draft.sections]; a.splice(faqAt < 0 ? a.length : faqAt, 0, { key: `S${n}`, type: 'content', enabled: true, topic: 'Nowa sekcja', image_source: 'none', image_url: '', list: true, bold: true, accent: false })
    setDraft({ ...draft, sections: a })
  }

  async function upload(i, file) {
    if (!file) return
    setBusy(true); setMsg(null)
    const path = `szablony/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`
    const { error } = await supabase.storage.from('images').upload(path, file, { contentType: file.type })
    if (error) setMsg({ type: 'error', text: plError(error.message) })
    else setSec(i, { image_url: supabase.storage.from('images').getPublicUrl(path).data.publicUrl })
    setBusy(false)
  }

  async function save() {
    setBusy(true); setMsg(null)
    const { error } = await supabase.from('templates').update({ sections: draft.sections, styles: draft.styles, version: (current.version || 1) + 1 }).eq('id', current.id)
    setMsg(error ? { type: 'error', text: plError(error.message) } : { type: 'ok', text: `Zapisano wersję ${(current.version || 1) + 1}. Nowe opisy powstaną według tej wersji.` })
    setBusy(false); if (!error) load(current.id)
  }

  if (!list) return <section className="page"><p className="muted">Ładowanie…</p></section>
  const label = t => { const c = names.c.find(x => x.id === t.channel_id); const b = names.b.find(x => x.id === t.brand_id); return `${b?.name || ''} · ${c ? `${c.marketplace} ${c.language.toUpperCase()}` : ''} · ${t.category || 'domyślny'}` }
  async function newForCategory() {
    const category = (prompt('Dla jakiej kategorii? (jak w PIM, np. „nośniki”). Nowy szablon będzie kopią obecnie wybranego.') || '').trim().toLowerCase()
    if (!category) return
    if (list.some(t => t.channel_id === current.channel_id && t.brand_id === current.brand_id && (t.category || '') === category)) { setMsg({ type: 'error', text: 'Taki szablon już istnieje.' }); return }
    const base = current.name.split(' · ').slice(0, 2).join(' · ')
    const { data, error } = await supabase.from('templates').insert({ channel_id: current.channel_id, brand_id: current.brand_id, name: `${base} · ${category}`, sections: draft.sections, styles: draft.styles, version: 1, status: 'aktywny', category }).select('id').single()
    setMsg(error ? { type: 'error', text: plError(error.message) } : { type: 'ok', text: `Utworzono szablon dla kategorii „${category}”. Zmień tematy sekcji i zapisz.` })
    if (!error) load(data.id)
  }

  return (
    <section className="page wide">
      <header className="page-head">
        <h1>Szablony</h1>
        <div className="tpl-pick">
          <select value={sel || ''} onChange={e => { const t = list.find(x => x.id === e.target.value); setSel(t.id); setDraft({ sections: t.sections, styles: { ...DEFAULT_STYLES, ...t.styles } }); setMsg(null) }} aria-label="Wybierz szablon">
            {list.map(t => <option key={t.id} value={t.id}>{label(t)} · wersja {t.version}</option>)}
          </select>
          {admin && current && <button className="link-dark gap" onClick={newForCategory}>+ szablon dla kategorii</button>}
        </div>
      </header>
      {!admin && <p className="hint">Szablony edytuje admin. Możesz oglądać podgląd.</p>}
      <p className="muted small">Generacja używa szablonu kategorii produktu (np. „wanny”), a jeśli go nie ma – domyślnego dla marki i kanału.</p>
      {draft && (
        <div className="tpl-grid">
          <div className="tpl-editor">
            <div className="panel">
              <h2>Sekcje</h2>
              <p className="muted small">Kolejność z góry na dół = kolejność w opisie. Temat podpowiada AI, o czym pisać; sekcja bez pasujących faktów zniknie z opisu.</p>
              {draft.sections.map((s, i) => (
                <div key={s.key} className={'sec-row' + (s.enabled === false ? ' off' : '')}>
                  <div className="sec-head">
                    <label className="check"><input type="checkbox" checked={s.enabled !== false} disabled={!admin} onChange={e => setSec(i, { enabled: e.target.checked })} /> <strong>{SEC_NAME[s.type]}</strong> <span className="muted">{s.type === 'content' ? s.key : ''}</span></label>
                    {admin && <span className="sec-move"><button className="link-dark" onClick={() => move(i, -1)} aria-label="W górę">↑</button><button className="link-dark" onClick={() => move(i, 1)} aria-label="W dół">↓</button></span>}
                  </div>
                  {s.type === 'content' && (
                    <>
                      <label>Temat sekcji<input value={s.topic || ''} disabled={!admin} onChange={e => setSec(i, { topic: e.target.value })} /></label>
                      <div className="sec-opts">
                        <label className="check"><input type="checkbox" checked={s.list !== false} disabled={!admin} onChange={e => setSec(i, { list: e.target.checked })} /> lista punktów</label>
                        <label className="check"><input type="checkbox" checked={s.bold !== false} disabled={!admin} onChange={e => setSec(i, { bold: e.target.checked })} /> pogrubione zdanie</label>
                        <label className="check"><input type="checkbox" checked={!!s.accent} disabled={!admin} onChange={e => setSec(i, { accent: e.target.checked })} /> wyróżnik</label>
                      </div>
                    </>
                  )}
                  {s.type === 'faq' && (
                    <label>Liczba pytań (max)<input type="number" min="1" max="6" value={s.max_questions || 6} disabled={!admin} onChange={e => setSec(i, { max_questions: Math.min(6, Math.max(1, Number(e.target.value) || 1)) })} /></label>
                  )}
                  {s.type !== 'faq' && (
                    <>
                      <div className="img-row">
                        <label>Obrazek<select value={s.image_source || 'static'} disabled={!admin} onChange={e => setSec(i, { image_source: e.target.value })}>
                          <option value="none">brak</option><option value="static">stały (wgrany do szablonu)</option>
                          <option value="library">z biblioteki grafik</option><option value="product">zdjęcie produktu z Base</option></select></label>
                        {['library', 'product'].includes(s.image_source) && (
                          <label>Rola<input list={s.image_source === 'library' ? 'roles-lib' : 'roles-prod'} value={s.image_role || ''} disabled={!admin} placeholder={s.image_source === 'product' ? 'puste = pierwsze zdjęcie' : 'np. baner'} onChange={e => setSec(i, { image_role: e.target.value })} /></label>
                        )}
                      </div>
                      {['static', 'library'].includes(s.image_source || 'static') && (
                        <div className="img-row">
                          <label>{s.image_source === 'library' ? 'Adres zapasowy (gdy biblioteka nie ma grafiki)' : 'Adres HTTPS'}<input value={s.image_url || ''} disabled={!admin} placeholder="brak" onChange={e => setSec(i, { image_url: e.target.value.trim() })} /></label>
                          {admin && <label className="btn ghost upload">Wgraj<input type="file" accept="image/*" hidden onChange={e => upload(i, e.target.files?.[0])} /></label>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
              {admin && <button className="link-dark" onClick={addSection}>+ Dodaj sekcję treści</button>}
            </div>
            <div className="panel">
              <h2>Wygląd</h2>
              <div className="grid-form">
                <label>Kolor tekstu<input type="color" value={draft.styles.text_color} disabled={!admin} onChange={e => setStyle('text_color', e.target.value)} /></label>
                <label>Kolor nagłówków<input type="color" value={draft.styles.heading_color} disabled={!admin} onChange={e => setStyle('heading_color', e.target.value)} /></label>
                <label>Kolor wyróżnika<input type="color" value={draft.styles.accent_color} disabled={!admin} onChange={e => setStyle('accent_color', e.target.value)} /></label>
                <label>Tekst (px)<input type="number" min="12" max="20" value={draft.styles.font_size} disabled={!admin} onChange={e => setStyle('font_size', Number(e.target.value))} /></label>
                <label>Tytuł (px)<input type="number" min="18" max="40" value={draft.styles.h1_size} disabled={!admin} onChange={e => setStyle('h1_size', Number(e.target.value))} /></label>
                <label>Nagłówki sekcji (px)<input type="number" min="16" max="32" value={draft.styles.h2_size} disabled={!admin} onChange={e => setStyle('h2_size', Number(e.target.value))} /></label>
                <label>Maks. szerokość (px)<input type="number" min="600" max="1400" step="10" value={draft.styles.max_width} disabled={!admin} onChange={e => setStyle('max_width', Number(e.target.value))} /></label>
                <label>Znacznik tytułu<select value={draft.styles.hero_tag} disabled={!admin} onChange={e => setStyle('hero_tag', e.target.value)}><option value="h1">H1</option><option value="h2">H2</option></select></label>
              </div>
              <p className="muted small">eMAG wyświetla nazwę produktu jako H1 strony. Tytuł w opisie jako H2 unika dwóch H1 na jednej stronie – wygląd się nie zmienia.</p>
            </div>
            {admin && <button className="btn" onClick={save} disabled={!dirty || busy}>{busy ? 'Zapisywanie…' : dirty ? 'Zapisz nową wersję' : 'Brak zmian'}</button>}
            {msg && <p className={msg.type} role="status">{msg.text}</p>}
          </div>
          <div className="tpl-preview">
            <div className="preview-label">Podgląd z przykładową treścią</div>
            <datalist id="roles-lib">{[...new Set(['baner', ...library.map(m => m.role)])].map(r => <option key={r} value={r} />)}</datalist>
            <datalist id="roles-prod">{[...new Set(['packshot', 'aranżacja', 'rysunek techniczny', ...prodRoles])].map(r => <option key={r} value={r} />)}</datalist>
            <div className="preview-frame" dangerouslySetInnerHTML={{ __html: preview }} />
          </div>
        </div>
      )}
    </section>
  )
}
