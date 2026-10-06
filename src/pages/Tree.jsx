import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Papa from 'papaparse'
import { supabase, plError } from '../supabase.js'
import { parseModel } from '../parser.js'

const ST = {
  opublikowany: { label: 'opublikowany', cls: 'st-opublikowany' },
  zaakceptowany: { label: 'zaakceptowany', cls: 'st-zaakceptowany' },
  do_weryfikacji: { label: 'do weryfikacji', cls: 'st-do_weryfikacji' },
  generowanie: { label: 'w trakcie', cls: 'st-do_weryfikacji' },
  poprawki: { label: 'poprawiany', cls: 'st-do_weryfikacji' },
  blad: { label: 'błąd', cls: 'st-blad' },
  brak_opisu: { label: 'brak opisu', cls: 'st-none' },
  poza_aplikacja: { label: 'poza aplikacją', cls: 'st-out' },
}
const pct = (a, b) => b ? Math.round(100 * a / b) : 0
const plural = (n, a, b, c) => n === 1 ? a : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? b : c

function rowsFromCsv(data) {
  const get = (r, ...k) => { for (const x of k) if (r[x] != null && String(r[x]).trim() !== '') return String(r[x]).trim(); return '' }
  return data.map(r => {
    const sku = get(r, 'produkt_sku', 'sku', 'SKU'); if (!sku) return null
    const name = get(r, 'produkt_nazwa', 'nazwa', 'name').replace(/\s+/g, ' ')
    const parsed = parseModel(name)
    const idRaw = get(r, 'produkt_id', 'id')
    return { sku, name, ean: get(r, 'produkt_ean', 'ean', 'EAN') || null, brand: get(r, 'producent_nazwa', 'marka', 'brand') || parsed.brand,
      category: get(r, 'kategoria_nazwa', 'kategoria', 'category') || null, model: parsed.model, bl_id: /^\d+$/.test(idRaw) ? Number(idRaw) : null }
  }).filter(Boolean)
}

function Upload({ last, onDone }) {
  const [busy, setBusy] = useState(''); const [msg, setMsg] = useState(null)
  function pick(e) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
    setMsg(null)
    const reader = new FileReader()
    reader.onload = async () => {
      const text = String(reader.result)
      const { data } = Papa.parse(text, { header: true, skipEmptyLines: true, delimitersToGuess: [';', ',', '\t'] })
      const rows = rowsFromCsv(data)
      if (!rows.length) { setMsg({ type: 'error', text: 'Nie znaleziono kolumny z SKU (produkt_sku albo sku).' }); return }
      const dup = rows.length - new Set(rows.map(r => r.sku)).size
      try {
        setBusy(`Zapisywanie ${rows.length} SKU…`)
        const { data: { session } } = await supabase.auth.getSession()
        const batch = crypto.randomUUID()
        const uniq = [...new Map(rows.map(r => [r.sku, r])).values()].map(r => ({ ...r, batch_id: batch, uploaded_by: session.user.id, uploaded_at: new Date().toISOString() }))
        for (let i = 0; i < uniq.length; i += 500) {
          const { error } = await supabase.from('assortment').upsert(uniq.slice(i, i + 500), { onConflict: 'sku' })
          if (error) throw error
        }
        const del = await supabase.from('assortment').delete().neq('batch_id', batch)
        if (del.error) throw del.error
        const warn = /\p{L}\?\p{L}/u.test(text) ? ' Uwaga: plik ma uszkodzone polskie znaki (eksport bez UTF-8) – nazwy mogą zawierać „?”.' : ''
        setMsg({ type: 'ok', text: `Zapisano ${uniq.length} SKU${dup ? ` (pominięto ${dup} powtórzeń)` : ''}. Produkty spoza pliku usunięto z listy asortymentu.${warn}` })
        onDone()
      } catch (err) { setMsg({ type: 'error', text: plError(err.message) }) } finally { setBusy('') }
    }
    reader.readAsText(file, 'utf-8')
  }
  return (
    <details className="panel upload-panel" open={!last}>
      <summary><strong>Lista asortymentu</strong> <span className="muted small">{last ? `wgrana ${new Date(last.at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })} · ${last.count} SKU` : 'jeszcze nie wgrana'}</span></summary>
      <p className="muted small">Wgraj CSV ze wszystkimi produktami (eksport z Baselinkera albo plik z kolumnami sku, nazwa, kategoria, marka). Lista służy tylko do podglądu pokrycia – nie tworzy produktów do generowania opisów. Nowy plik zastępuje poprzednią listę.</p>
      <label>Plik CSV (UTF-8)<input type="file" accept=".csv,text/csv" onChange={pick} disabled={!!busy} /></label>
      {busy && <p className="muted" role="status">{busy}</p>}
      {msg && <p className={msg.type} role="status">{msg.text}</p>}
    </details>
  )
}

function Bar({ done, total }) {
  return <span className="tree-bar" title={`${done} / ${total}`}><span style={{ width: `${pct(done, total)}%` }} /></span>
}

export default function Tree() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [channel, setChannel] = useState('')
  const [q, setQ] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [open, setOpen] = useState(new Set())

  async function load() {
    const fetchAll = async (table, cols) => { let out = [], from = 0; for (;;) { const { data, error } = await supabase.from(table).select(cols).range(from, from + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) return out; from += 1000 } }
    try {
      const [as, pr, fam, ch, ds] = await Promise.all([
        fetchAll('assortment', 'sku, name, brand, category, model, uploaded_at'), fetchAll('products', 'id, sku, family_id'),
        fetchAll('product_families', 'id, model_name'), supabase.from('channels').select('id, marketplace, language').eq('active', true),
        fetchAll('descriptions', 'id, channel_id, product_id, version, status'),
      ])
      const order = { ro: 1, hu: 2, bg: 3 }
      const channels = (ch.data || []).sort((a, b) => (order[a.language] || 9) - (order[b.language] || 9))
      const latest = {}
      for (const x of ds.sort((a, b) => b.version - a.version)) { const k = `${x.channel_id}|${x.product_id}`; if (!latest[k]) latest[k] = x }
      setD({ as, products: Object.fromEntries(pr.map(p => [p.sku, p])), fam: Object.fromEntries(fam.map(f => [f.id, f.model_name])), channels, latest })
      setChannel(c => c || channels[0]?.id || '')
    } catch (e) { setErr(plError(e.message)) }
  }
  useEffect(() => { load() }, [])

  const tree = useMemo(() => {
    if (!d) return null
    const status = (p, chId) => { if (!p) return 'poza_aplikacja'; const x = d.latest[`${chId}|${p.id}`]; return x ? x.status : 'brak_opisu' }
    const ql = q.trim().toLowerCase()
    const root = {}
    let total = 0, inApp = 0
    const perCh = Object.fromEntries(d.channels.map(c => [c.id, 0]))
    for (const r of d.as) {
      const p = d.products[r.sku]
      const sts = Object.fromEntries(d.channels.map(c => [c.id, status(p, c.id)]))
      const descId = Object.fromEntries(d.channels.map(c => [c.id, p ? d.latest[`${c.id}|${p.id}`]?.id : null]))
      total++; if (p) inApp++
      d.channels.forEach(c => { if (sts[c.id] === 'opublikowany') perCh[c.id]++ })
      if (ql && !`${r.sku} ${r.name}`.toLowerCase().includes(ql)) continue
      if (onlyMissing && sts[channel] === 'opublikowany') continue
      const brand = r.brand || '(bez marki)', cat = r.category || '(bez kategorii)', model = (p && d.fam[p.family_id]) || r.model || '(bez modelu)'
      const b = (root[brand] ||= {}), c = (b[cat] ||= {}), m = (c[model] ||= [])
      m.push({ ...r, p, sts, descId })
    }
    const count = items => ({ total: items.length, done: items.filter(x => x.sts[channel] === 'opublikowany').length })
    const flat = obj => Array.isArray(obj) ? obj : Object.values(obj).flatMap(flat)
    return { root, total, inApp, perCh, count: node => count(flat(node)) }
  }, [d, q, onlyMissing, channel])

  if (err) return <section className="page"><h1>Drzewo produktów</h1><p className="error">{err}</p></section>
  if (!d) return <section className="page"><p className="muted">Ładowanie…</p></section>
  const toggle = k => { const n = new Set(open); n.has(k) ? n.delete(k) : n.add(k); setOpen(n) }
  const last = d.as.length ? { at: d.as.reduce((m, r) => r.uploaded_at > m ? r.uploaded_at : m, d.as[0].uploaded_at), count: d.as.length } : null
  const sortKeys = o => Object.keys(o).sort((a, b) => a.localeCompare(b, 'pl'))
  const Node = ({ k, label, node, level }) => {
    const { total, done } = tree.count(node)
    const isOpen = open.has(k) || !!q.trim()
    return (
      <div className={`tree-node lvl-${level}`}>
        <button className="tree-head" onClick={() => toggle(k)} aria-expanded={isOpen}>
          <span className="caret">{isOpen ? '▾' : '▸'}</span><span className="tree-label">{label}</span>
          <span className="tree-count">{done} / {total}</span><Bar done={done} total={total} />
        </button>
        {isOpen && (Array.isArray(node) ? (
          <table className="compact tree-skus">
            <tbody>{node.sort((a, b) => a.sku.localeCompare(b.sku)).map(r => (
              <tr key={r.sku}>
                <td className="mono">{r.sku}</td><td className="tree-name">{r.name}</td>
                {d.channels.map(c => (
                  <td key={c.id} className={c.id === channel ? 'sel' : ''}>
                    {r.descId[c.id] ? <Link to={`/weryfikacja/${r.descId[c.id]}`} className={`tag ${ST[r.sts[c.id]]?.cls}`}>{c.language.toUpperCase()}: {ST[r.sts[c.id]]?.label}</Link>
                      : <span className={`tag ${ST[r.sts[c.id]]?.cls}`}>{c.language.toUpperCase()}: {ST[r.sts[c.id]]?.label}</span>}
                  </td>
                ))}
              </tr>
            ))}</tbody>
          </table>
        ) : <div className="tree-children">{sortKeys(node).map(x => <Node key={k + '|' + x} k={k + '|' + x} label={x} node={node[x]} level={level + 1} />)}</div>)}
      </div>
    )
  }
  const allKeys = () => { const ks = []; const walk = (o, k) => { if (Array.isArray(o)) return; for (const x of Object.keys(o)) { ks.push(k + '|' + x); walk(o[x], k + '|' + x) } }; walk(tree.root, ''); return ks }

  return (
    <section className="page wide">
      <h1>Drzewo produktów</h1>
      <Upload last={last} onDone={load} />
      {d.as.length > 0 && (
        <>
          <div className="tree-summary">
            <div className="panel stat"><span className="big">{tree.total}</span><span className="muted">SKU w asortymencie</span></div>
            <div className="panel stat"><span className="big">{pct(tree.inApp, tree.total)}%</span><span className="muted">w aplikacji ({tree.inApp})</span></div>
            {d.channels.map(c => (
              <div key={c.id} className="panel stat"><span className="big">{pct(tree.perCh[c.id], tree.total)}%</span><span className="muted">opublikowane {c.marketplace} {c.language.toUpperCase()} ({tree.perCh[c.id]})</span></div>
            ))}
          </div>
          <div className="tree-tools">
            <div className="seg">{d.channels.map(c => <button key={c.id} className={c.id === channel ? 'seg-btn on' : 'seg-btn'} onClick={() => setChannel(c.id)}>{c.marketplace} {c.language.toUpperCase()}</button>)}</div>
            <input className="tree-search" placeholder="Szukaj SKU albo nazwy…" value={q} onChange={e => setQ(e.target.value)} aria-label="Szukaj" />
            <label className="check small"><input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} /> tylko nieopublikowane</label>
            <button className="link-dark" onClick={() => setOpen(new Set(allKeys()))}>Rozwiń wszystko</button>
            <button className="link-dark" onClick={() => setOpen(new Set())}>Zwiń</button>
          </div>
          <p className="muted small">Pasek i licznik przy każdej gałęzi: opublikowane w wybranym kanale / wszystkie SKU. Kliknij status przy SKU, żeby otworzyć opis.</p>
          <div className="panel tree">
            {Object.keys(tree.root).length === 0 ? <p className="muted">Nic nie pasuje do filtrów.</p>
              : sortKeys(tree.root).map(b => <Node key={b} k={b} label={b} node={tree.root[b]} level={0} />)}
          </div>
        </>
      )}
    </section>
  )
}
