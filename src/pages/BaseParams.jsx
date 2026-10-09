import { useEffect, useMemo, useState } from 'react'
import { supabase, plError } from '../supabase.js'
import { runJob, PUBLISH_URL } from '../jobs.js'
import { computeParams, categoryKey } from '../params.js'
import { skuAttributes } from '../parser.js'

const SOURCES = { pim: 'kolumna PIM', atrybut: 'atrybut produktu', nazwa: 'z nazwy (wyrażenie)', stala: 'stała wartość', frazy: 'bank fraz', pomin: 'nie wysyłaj' }
const TRANSFORMS = { tekst: 'bez zmian', etykieta: 'etykieta PIM → tekst', liczba: 'liczba (kropka)', liczba_pl: 'liczba (przecinek)' }
const ATTRS = ['wykonczenie', 'ksztalt', 'odplyw', 'powloka', 'w_zestawie', 'wymiar', 'wysokosc_cm', 'material']
const CHUNK = 150
const fetchAll = async (table, cols) => { let out = [], from = 0; for (;;) { const { data, error } = await supabase.from(table).select(cols).range(from, from + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) return out; from += 1000 } }
const plN = (n, a, b, c) => `${n} ${n === 1 ? a : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? b : c}`

function Mapping({ mapping, admin, sampleRaw, onSaved }) {
  const [rows, setRows] = useState(mapping)
  const [dirty, setDirty] = useState(new Set())
  const [msg, setMsg] = useState(null)
  useEffect(() => { setRows(mapping); setDirty(new Set()) }, [mapping])
  const set = (id, patch) => { setRows(r => r.map(x => x.id === id ? { ...x, ...patch } : x)); setDirty(d => new Set(d).add(id)) }
  async function save() {
    const changed = rows.filter(r => dirty.has(r.id)).map(({ id, name, sort, source, pim_col, attr_key, regex, const_value, fallback_col, transform, value_map, suffix, note, default_value, kw_lang, kw_count, only_categories }) =>
      ({ id, name: name.trim(), sort, source, pim_col: pim_col ? Number(pim_col) : null, attr_key: attr_key || null, regex: regex || null, const_value: const_value || null,
         fallback_col: fallback_col ? Number(fallback_col) : null, transform, value_map: value_map || null, suffix: suffix || null, note: note || null, default_value: default_value || null, kw_lang: kw_lang || null, kw_count: kw_count ? Number(kw_count) : null, only_categories: only_categories || null, updated_at: new Date().toISOString() }))
    const { error } = await supabase.from('bl_param_map').upsert(changed)
    setMsg(error ? { type: 'error', text: plError(error.message) } : { type: 'ok', text: `Zapisano ${plN(changed.length, 'parametr', 'parametry', 'parametrów')}.` })
    if (!error) onSaved()
  }
  async function add() {
    const name = (prompt('Nazwa parametru dokładnie jak w Base:') || '').trim(); if (!name) return
    const { error } = await supabase.from('bl_param_map').insert({ name, sort: rows.length + 1, source: 'pomin' })
    setMsg(error ? { type: 'error', text: plError(error.message) } : null); if (!error) onSaved()
  }
  async function remove(r) {
    if (!confirm(`Usunąć parametr „${r.name}” z mapowania? W Base nic się nie zmieni.`)) return
    const { error } = await supabase.from('bl_param_map').delete().eq('id', r.id)
    setMsg(error ? { type: 'error', text: plError(error.message) } : null); if (!error) onSaved()
  }
  const sample = n => sampleRaw && n ? String(sampleRaw[Number(n) - 1] ?? '').slice(0, 40) : ''
  return (
    <details className="panel">
      <summary><strong>Mapowanie parametrów</strong> <span className="muted small">skąd brać wartość każdego parametru · {mapping.filter(m => m.source !== 'pomin').length} z {mapping.length} wysyłanych</span></summary>
      <div className="table-wrap"><table className="compact map-table">
        <thead><tr><th>Parametr w Base</th><th>Źródło</th><th>Szczegół</th><th>Zapas: kol. PIM</th><th>Przekształcenie</th><th>Zamiany (stara=nowa; …)</th><th>Dopisek</th>{admin && <th />}</tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.id} className={r.source === 'pomin' ? 'inactive-row' : ''}>
            <td><strong>{r.name}</strong>{r.note && <div className="muted small">{r.note}</div>}</td>
            <td><select value={r.source} disabled={!admin} onChange={e => set(r.id, { source: e.target.value })}>{Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
            <td>
              {r.source === 'pim' && <><input type="number" min="1" className="num" value={r.pim_col || ''} disabled={!admin} onChange={e => set(r.id, { pim_col: e.target.value })} />{sample(r.pim_col) && <span className="muted small"> np. „{sample(r.pim_col)}”</span>}</>}
              {r.source === 'atrybut' && <input list="attr-list" value={r.attr_key || ''} disabled={!admin} onChange={e => set(r.id, { attr_key: e.target.value })} />}
              {r.source === 'nazwa' && <input className="mono" value={r.regex || ''} disabled={!admin} onChange={e => set(r.id, { regex: e.target.value })} />}
              {r.source === 'stala' && <input value={r.const_value || ''} disabled={!admin} onChange={e => set(r.id, { const_value: e.target.value })} />}
              {r.source === 'frazy' && <span className="kw-cfg">język <input className="num" value={r.kw_lang || 'pl'} disabled={!admin} onChange={e => set(r.id, { kw_lang: e.target.value.trim().toLowerCase() })} /> liczba <input type="number" min="1" max="50" className="num" value={r.kw_count || 10} disabled={!admin} onChange={e => set(r.id, { kw_count: e.target.value })} /></span>}
              {r.source !== 'pomin' && <div className="small muted">tylko kategorie: <input className="inline-input" value={r.only_categories || ''} placeholder="wszystkie" disabled={!admin} onChange={e => set(r.id, { only_categories: e.target.value })} /></div>}
              {r.source !== 'pomin' && r.source !== 'stala' && <div className="small muted">gdy puste: <input className="inline-input" value={r.default_value || ''} placeholder="nic nie wysyłaj" disabled={!admin} onChange={e => set(r.id, { default_value: e.target.value })} /></div>}
            </td>
            <td><input type="number" min="1" className="num" value={r.fallback_col || ''} disabled={!admin || r.source === 'pomin'} onChange={e => set(r.id, { fallback_col: e.target.value })} /></td>
            <td><select value={r.transform} disabled={!admin || r.source === 'pomin'} onChange={e => set(r.id, { transform: e.target.value })}>{Object.entries(TRANSFORMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
            <td><input value={r.value_map || ''} disabled={!admin || r.source === 'pomin'} onChange={e => set(r.id, { value_map: e.target.value })} /></td>
            <td><input className="num" value={r.suffix || ''} disabled={!admin || r.source === 'pomin'} onChange={e => set(r.id, { suffix: e.target.value })} /></td>
            {admin && <td className="actions"><button className="link-dark danger-link" onClick={() => remove(r)}>Usuń</button></td>}
          </tr>
        ))}</tbody>
      </table></div>
      <datalist id="attr-list">{ATTRS.map(a => <option key={a} value={a} />)}</datalist>
      <p className="muted small">Kolumny PIM liczone od 1, jak w Excelu (1 = SKU). „Etykieta PIM → tekst” zamienia np. <code>ksztalt__polokragly</code> na „półokrągły”. Puste wartości nie są wysyłane – w Base zostaje to, co tam jest.</p>
      {admin && <div className="row-actions"><button className="btn" disabled={!dirty.size} onClick={save}>Zapisz mapowanie</button><button className="link-dark" onClick={add}>+ dodaj parametr</button></div>}
      {msg && <p className={msg.type} role="status">{msg.text}</p>}
    </details>
  )
}

function Result({ res }) {
  if (!res) return null
  if (res.error) return <p className="error">{res.error}</p>
  const r = res.result, changed = (r.items || []).filter(x => x.found && x.changes.length)
  return (
    <div className="panel">
      <h2>{r.mode === 'compare' ? 'Porównanie z Base' : r.dry_run ? 'Tryb próbny – nic nie zapisano' : 'Zapis w Base'}</h2>
      <p>
        {plN(changed.length, 'produkt wymaga', 'produkty wymagają', 'produktów wymaga')} zmian · {plN((r.items || []).filter(x => x.found && !x.changes.length).length, 'produkt jest', 'produkty są', 'produktów jest')} aktualnych
        {r.not_found ? ` · ${r.not_found} nie znaleziono w Base` : ''}
        {r.updated !== undefined && <> · <strong>zapisano: {r.updated}</strong></>}
        {r.dry_run && r.mode === 'write' && <> · w trybie próbnym zapisanoby {r.would_update}. Ustaw DRY_RUN = false w n8n (workflow publikacji), żeby zapisywać.</>}
      </p>
      {(r.failed || []).length > 0 && <p className="error">Błędy: {r.failed.map(f => `${f.sku}: ${f.error}`).join('; ')}</p>}
      {(r.warnings || []).length > 0 && <p className="hint">Ostrzeżenia Base: {r.warnings.map(w => `${w.sku}: ${w.warnings.join(', ')}`).join('; ')}</p>}
      <div className="table-wrap"><table className="compact">
        <thead><tr><th>SKU</th><th>Zmiany (obecnie w Base → nowa wartość)</th><th>Inne parametry w Base</th></tr></thead>
        <tbody>
          {changed.map(x => <tr key={x.sku}><td className="mono">{x.sku}</td><td>{x.changes.map(c => <div key={c.name} className="small"><strong>{c.name}:</strong> <span className="muted">{c.old || '(brak)'}</span> → {c.new}</div>)}</td><td className="muted small">{x.other_params} (zostaną bez zmian)</td></tr>)}
          {(r.items || []).filter(x => !x.found).map(x => <tr key={x.sku} className="inactive-row"><td className="mono">{x.sku}</td><td colSpan={2} className="error small">{x.error}</td></tr>)}
        </tbody>
      </table></div>
    </div>
  )
}

export default function BaseParams({ profile }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [f, setF] = useState({ brand: '', cat: '', model: '', q: '' })
  const [sel, setSel] = useState(new Set())
  const [busy, setBusy] = useState('')
  const [res, setRes] = useState(null)
  const admin = profile?.role === 'admin'
  async function load() {
    try {
      const [{ data: mapping, error }, as, pr, kb, br, ir] = await Promise.all([
        supabase.from('bl_param_map').select('*').order('sort'),
        fetchAll('assortment', 'sku, name, brand, category_path, category, model, raw'),
        fetchAll('products', 'sku, attributes'),
        supabase.from('keyword_banks').select('category, language, keywords, excluded'),
        supabase.from('brands').select('id, name'),
        supabase.from('import_rules').select('*'),
      ])
      if (error) throw error
      const banks = Object.fromEntries((kb.data || []).map(b => [`${b.category}|${b.language}`, b]))
      setD({ mapping: mapping || [], rows: as, products: Object.fromEntries(pr.map(p => [p.sku, p])), banks, brands: br.data || [], rules: ir.data || [] })
    } catch (e) { setErr(/raw|bl_param_map/.test(e.message) ? 'Baza nie ma jeszcze tabel parametrów – uruchom migrację 18_parametry_base.sql.' : plError(e.message)) }
  }
  useEffect(() => { load() }, [])
  const catOf = r => (r.category_path?.length ? r.category_path.join(' › ') : r.category) || '—'
  const computed = useMemo(() => {
    if (!d) return []
    return d.rows.map(r => {
      // atrybuty: z aplikacji, a brakujące (wykończenie, powłoka) wyliczone z SKU wg Słownika importu
      const brandId = d.brands.find(b => b.name.toLowerCase() === String(r.brand || '').toLowerCase())?.id || null
      const fromSku = skuAttributes(r.sku, brandId, d.rules, categoryKey(r))
      const attrs = { ...fromSku, ...((d.products[r.sku] || {}).attributes || {}) }
      return { ...r, cat: catOf(r), ...computeParams(d.mapping, r, { attributes: attrs }, { banks: d.banks }), inApp: !!d.products[r.sku] }
    })
  }, [d])
  if (err) return <section className="page"><h1>Parametry w Base</h1><p className="error">{err}</p></section>
  if (!d) return <section className="page"><p className="muted">Ładowanie…</p></section>

  const active = d.mapping.filter(m => m.source !== 'pomin')
  const noRaw = d.rows.length > 0 && !d.rows.some(r => Array.isArray(r.raw))
  const opts = key => [...new Set(computed.filter(r => (!f.brand || r.brand === f.brand) && (key === 'cat' || !f.cat || r.cat === f.cat)).map(r => r[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pl'))
  const ql = f.q.trim().toLowerCase()
  const list = computed.filter(r => (!f.brand || r.brand === f.brand) && (!f.cat || r.cat === f.cat) && (!f.model || r.model === f.model) && (!ql || `${r.sku} ${r.name}`.toLowerCase().includes(ql)))
  const allSel = list.length > 0 && list.every(r => sel.has(r.sku))
  const toggleAll = () => setSel(s => { const n = new Set(s); list.forEach(r => allSel ? n.delete(r.sku) : n.add(r.sku)); return n })
  const chosen = computed.filter(r => sel.has(r.sku))
  const emptyCount = chosen.reduce((a, r) => a + active.filter(m => !r.values[m.name]).length, 0)

  async function run(mode) {
    if (!chosen.length) return
    if (mode === 'write' && !confirm(`Zapisać parametry ${plN(chosen.length, 'produktu', 'produktów', 'produktów')} w Base?\n\nZmienione zostaną tylko parametry z mapowania; pozostałe parametry produktów zostaną bez zmian. Puste wartości nie są wysyłane.`)) return
    setRes(null)
    const all = { mode, items: [], not_found: 0, to_change: 0, updated: mode === 'write' ? 0 : undefined, failed: [], warnings: [], dry_run: false, would_update: 0 }
    try {
      for (let i = 0; i < chosen.length; i += CHUNK) {
        const part = chosen.slice(i, i + CHUNK)
        setBusy(`${mode === 'write' ? 'Zapisywanie' : 'Porównywanie'}: ${i + 1}–${i + part.length} z ${chosen.length}…`)
        const r = await runJob('params_sync', { mode, items: part.map(x => ({ sku: x.sku, features: x.values })) }, { url: PUBLISH_URL, timeoutSec: 60 + part.length * 3 })
        const x = r.result || r
        all.items.push(...(x.items || [])); all.not_found += x.not_found || 0; all.to_change += x.to_change || 0
        if (x.updated !== undefined) all.updated += x.updated
        all.failed.push(...(x.failed || [])); all.warnings.push(...(x.warnings || [])); all.dry_run = all.dry_run || !!x.dry_run; all.would_update += x.would_update || 0
      }
      setRes({ result: all })
    } catch (e) { setRes({ error: plError(e.message) }) } finally { setBusy('') }
  }

  return (
    <section className="page wide">
      <h1>Parametry w Base</h1>
      <p className="muted lead">Wartości parametrów wyliczane z listy PIM (Drzewo produktów) i atrybutów produktów w aplikacji. Najpierw porównaj z Base, potem zapisz.</p>
      {d.mapping.some(m => m.source === 'frazy') && (() => {
        const langs = [...new Set(d.mapping.filter(m => m.source === 'frazy').map(m => m.kw_lang || 'pl'))]
        const missing = [...new Set(computed.map(r => categoryKey(r)).filter(Boolean))].flatMap(c => langs.filter(l => !d.banks[`${c}|${l}`] || !(d.banks[`${c}|${l}`].keywords || []).length).map(l => `${c} (${l.toUpperCase()})`))
        return missing.length ? <p className="hint">Słowa kluczowe: brak odświeżonego banku fraz dla: {missing.join(', ')}. Dodaj je w zakładce Frazy kluczowe – do tego czasu parametr nie będzie wysyłany dla tych kategorii.</p> : null
      })()}
      {noRaw && <p className="hint">Lista asortymentu nie ma jeszcze pełnych wierszy PIM – wgraj ponownie eksport z PIM w zakładce Drzewo produktów. Do tego czasu parametry z kolumn PIM będą puste.</p>}
      <Mapping mapping={d.mapping} admin={admin} sampleRaw={(chosen[0] || list[0])?.raw} onSaved={load} />

      <div className="panel">
        <div className="filters">
          <select value={f.brand} onChange={e => setF({ brand: e.target.value, cat: '', model: '', q: f.q })}><option value="">wszystkie marki</option>{opts('brand').map(x => <option key={x}>{x}</option>)}</select>
          <select value={f.cat} onChange={e => setF({ ...f, cat: e.target.value, model: '' })}><option value="">wszystkie kategorie</option>{opts('cat').map(x => <option key={x}>{x}</option>)}</select>
          <select value={f.model} onChange={e => setF({ ...f, model: e.target.value })}><option value="">wszystkie modele</option>{opts('model').map(x => <option key={x}>{x}</option>)}</select>
          <input placeholder="Szukaj SKU albo nazwy…" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} />
        </div>
        <div className="row-actions">
          <span className="muted">{plN(list.length, 'produkt', 'produkty', 'produktów')} na liście · zaznaczono {chosen.length}{chosen.length > 0 && emptyCount > 0 ? ` · ${emptyCount} pustych wartości (nie zostaną wysłane)` : ''}</span>
          <button className="btn ghost" disabled={!chosen.length || !!busy} onClick={() => run('compare')}>Porównaj z Base</button>
          {admin && <button className="btn" disabled={!chosen.length || !!busy} onClick={() => run('write')}>Zapisz w Base</button>}
          {chosen.length > 0 && <button className="link-dark" onClick={() => setSel(new Set())}>odznacz</button>}
        </div>
        {busy && <p className="muted" role="status">{busy}</p>}
        <div className="table-wrap params-wrap"><table className="compact params-table">
          <thead><tr><th><input type="checkbox" checked={allSel} onChange={toggleAll} aria-label="Zaznacz wszystkie na liście" /></th><th>SKU</th>{active.map(m => <th key={m.id}>{m.name}</th>)}</tr></thead>
          <tbody>{list.slice(0, 300).map(r => (
            <tr key={r.sku}>
              <td><input type="checkbox" checked={sel.has(r.sku)} onChange={() => setSel(s => { const n = new Set(s); n.has(r.sku) ? n.delete(r.sku) : n.add(r.sku); return n })} /></td>
              <td className="mono" title={r.name}>{r.sku}{!r.inApp && <span className="muted small" title="Produktu nie ma w aplikacji – atrybuty z aplikacji (np. wykończenie) są puste"> ·PIM</span>}</td>
              {active.map(m => <td key={m.id} title={r.origin[m.name] || 'brak wartości'} className={r.values[m.name] ? '' : 'empty-cell'}>{r.values[m.name] || '—'}</td>)}
            </tr>
          ))}</tbody>
        </table></div>
        {list.length > 300 && <p className="muted small">Pokazano 300 z {list.length}. Zaznaczanie „wszystkich” obejmuje całą przefiltrowaną listę.</p>}
      </div>
      <Result res={res} />
    </section>
  )
}
