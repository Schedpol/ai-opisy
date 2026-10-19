import { useEffect, useMemo, useState } from 'react'
import { supabase, plError, fetchAll } from '../supabase.js'
import { runJob, PUBLISH_URL } from '../jobs.js'
import { suggestions } from '../dealavo.js'
import DrainLoader from '../components/DrainLoader.jsx'

const KIND = { partner: 'partner', wlasny: 'kanał własny', marketplace: 'marketplace' }
const pct = v => v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${Number(v).toLocaleString('pl-PL', { maximumFractionDigits: 1 })}%`
const zl = v => v === null || v === undefined ? '—' : `${Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`
const when = t => { const m = String(t || '').match(/^(\d{4})_(\d{2})_(\d{2})(?:_(\d{2})_(\d{2}))?/); return m ? `${m[3]}.${m[2]}.${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ''}` : (t || '—') }

function Aliases({ partner, retailers, taken, onChange }) {
  const [manual, setManual] = useState('')
  const sug = suggestions(partner, retailers, taken).slice(0, 12)
  const save = aliases => onChange({ ...partner, aliases })
  return (
    <div className="alias-box">
      <h3>Nazwy w Dealavo</h3>
      <p className="muted small">Oferty liczą się do partnera tylko pod tymi nazwami. Jeden partner może mieć kilka (np. sklep i konto na Allegro).</p>
      <div className="alias-chips">
        {(partner.aliases || []).length === 0 && <span className="muted small">Brak – wybierz z podpowiedzi albo dopisz.</span>}
        {(partner.aliases || []).map(a => <span key={a} className="alias-chip">{a}<button aria-label={`Usuń ${a}`} onClick={() => save(partner.aliases.filter(x => x !== a))}>×</button></span>)}
      </div>
      {sug.length > 0 && <>
        <p className="small"><strong>Podpowiedzi</strong> <span className="muted">(sprawdź, czy to na pewno ten partner)</span></p>
        <div className="alias-chips">{sug.map(r => <button key={r.name} className="alias-sug" onClick={() => save([...(partner.aliases || []), r.name])}>+ {r.name} <span className="muted">· {r.offers} ofert{r.source ? ` · ${r.source}` : ''}</span></button>)}</div>
      </>}
      <div className="row-actions">
        <input list="dealavo-retailers" value={manual} onChange={e => setManual(e.target.value)} placeholder="Dopisz nazwę dokładnie jak w Dealavo…" />
        <datalist id="dealavo-retailers">{retailers.slice(0, 2000).map(r => <option key={r.name} value={r.name} />)}</datalist>
        <button className="btn ghost small-btn" disabled={!manual.trim()} onClick={() => { save([...new Set([...(partner.aliases || []), manual.trim()])]); setManual('') }}>Dodaj</button>
      </div>
    </div>
  )
}

export default function Prices({ profile }) {
  const admin = profile?.role === 'admin'
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState('')
  const [offers, setOffers] = useState(null)
  const [onlyBelow, setOnlyBelow] = useState(false)
  const [np, setNp] = useState('')

  async function load() {
    try {
      const [p, st, rt] = await Promise.all([
        supabase.from('dealavo_partners').select('*').order('name'),
        fetchAll('dealavo_stats', '*'),
        fetchAll('dealavo_retailers', 'name, source, offers, update_time'),
      ])
      if (p.error) throw p.error
      const last = st.reduce((m, s) => s.update_time > m ? s.update_time : m, '')
      setD({ partners: p.data, stats: Object.fromEntries(st.filter(s => s.update_time === last).map(s => [s.partner_id, s])), last, retailers: rt.sort((a, b) => b.offers - a.offers) })
    } catch (e) { setErr(/dealavo_/.test(e.message) ? 'Brak tabel Dealavo – uruchom migrację 31_dealavo.sql.' : plError(e.message)) }
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!sel) { setOffers(null); return }
    fetchAll('dealavo_offers', '*', q => q.eq('partner_id', sel)).then(setOffers).catch(e => setErr(plError(e.message)))
  }, [sel, d?.last])

  const taken = useMemo(() => new Set((d?.partners || []).flatMap(p => p.aliases || [])), [d])
  if (err) return <section className="page"><h1>Ceny u partnerów</h1><p className="error">{err}</p></section>
  if (!d) return <section className="page"><DrainLoader /></section>

  async function savePartner(p) {
    const { error } = await supabase.from('dealavo_partners').update({ aliases: p.aliases }).eq('id', p.id)
    if (error) setMsg({ type: 'error', text: plError(error.message) }); else { setD({ ...d, partners: d.partners.map(x => x.id === p.id ? p : x) }); setMsg(null) }
  }
  async function addPartner() {
    const { error } = await supabase.from('dealavo_partners').insert({ name: np.trim(), keywords: [np.trim().toLowerCase()] })
    if (error) setMsg({ type: 'error', text: plError(error.message) }); else { setNp(''); load() }
  }
  async function sync() {
    setBusy(true); setMsg(null)
    try {
      const r = await runJob('dealavo_sync', {}, { url: PUBLISH_URL, timeoutSec: 300 })
      setMsg({ type: 'ok', text: `Pobrano aktualizację z ${when(r?.update_time)}: ${r?.rows ?? '?'} ofert w raporcie, ${r?.tracked ?? '?'} u śledzonych partnerów.` }); load()
    } catch (e) { setMsg({ type: 'error', text: /nie obsługuje zadania/.test(e.message) ? 'Pobieranie z Dealavo nie jest jeszcze podłączone w n8n (czeka na dokumentację API).' : plError(e.message) }) } finally { setBusy(false) }
  }
  function exportCsv() {
    const rows = d.partners.map(p => { const s = d.stats[p.id] || {}; return [p.name, KIND[p.kind], (p.aliases || []).join(' | '), s.available_offers ?? '', s.products ?? '', s.avg_gap_pct ?? '', s.median_gap_pct ?? '', s.below_min_products ?? '', s.missing_min_products ?? ''] })
    const csv = '\uFEFF' + [['Partner', 'Typ', 'Nazwy w Dealavo', 'Dostępne oferty', 'Produkty', 'Średnia rozbieżność %', 'Mediana rozbieżności %', 'Produkty poniżej ceny min.', 'Produkty bez ceny min.'], ...rows].map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `ceny-partnerzy-${d.last || 'brak'}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  const order = p => [p.kind === 'partner' ? 0 : 1, -((d.stats[p.id] || {}).below_min_products || 0), p.name]
  const list = [...d.partners].filter(p => p.active).sort((a, b) => { const x = order(a), y = order(b); return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2], 'pl') })
  const unmapped = list.filter(p => !(p.aliases || []).length).length
  const cur = d.partners.find(p => p.id === sel)
  const shown = (offers || []).filter(o => !onlyBelow || o.below_min).sort((a, b) => (b.below_min - a.below_min) || ((a.gap_pct ?? 0) - (b.gap_pct ?? 0)))

  return (
    <section className="page wide">
      <h1>Ceny u partnerów</h1>
      <p className="muted lead">Dane z Dealavo (Polska): ceny dostępnych ofert u partnerów wobec Waszej ceny referencyjnej i cen minimalnych. Rozbieżność bez kosztu wysyłki; wartość ujemna = partner sprzedaje taniej.</p>
      <div className="panel">
        <div className="prices-head">
          <span>{d.last ? <>Ostatnia aktualizacja Dealavo: <strong>{when(d.last)}</strong></> : <span className="muted">Dane z Dealavo nie były jeszcze pobrane.</span>}</span>
          <span className="row-actions">
            {admin && <button className="btn" disabled={busy} onClick={sync}>{busy ? 'Pobieranie…' : 'Pobierz z Dealavo'}</button>}
            <button className="btn ghost small-btn" onClick={exportCsv}>Pobierz tabelę (CSV)</button>
          </span>
        </div>
        {busy && <p className="muted working" role="status">Pobieranie i liczenie wskaźników – to może potrwać kilka minut.</p>}
        {msg && <p className={msg.type} role="status">{msg.text}</p>}
        {unmapped > 0 && <p className="hint">{unmapped} z {list.length} partnerów nie ma jeszcze przypisanych nazw z Dealavo – ich oferty nie są liczone. Kliknij partnera, żeby je dopasować{d.retailers.length ? '' : ' (podpowiedzi pojawią się po pierwszym pobraniu)'}.</p>}
        <div className="table-wrap"><table className="compact prices-table">
          <thead><tr><th>Partner</th><th className="num-cell">Nazwy</th><th className="num-cell">Dostępne oferty</th><th className="num-cell">Produkty</th><th className="num-cell">Średnia rozbieżność</th><th className="num-cell">Mediana</th><th className="num-cell">Poniżej ceny min.</th><th className="num-cell">Bez ceny min.</th></tr></thead>
          <tbody>{list.map((p, i) => {
            const mapped = (p.aliases || []).length > 0, s = mapped ? d.stats[p.id] : null, sep = i > 0 && p.kind !== 'partner' && list[i - 1].kind === 'partner'
            return (
              <tr key={p.id} className={(sel === p.id ? 'sel ' : '') + (sep ? 'group-sep ' : '') + (mapped ? '' : 'unmapped')} onClick={() => setSel(sel === p.id ? '' : p.id)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && setSel(sel === p.id ? '' : p.id)}>
                <td>{p.name}{p.kind !== 'partner' && <span className="tag">{KIND[p.kind]}</span>}</td>
                <td className="num-cell">{mapped ? p.aliases.length : <span className="warn-text" title="Brak nazw z Dealavo – kliknij, żeby dopasować">0</span>}</td>
                <td className="num-cell">{s?.available_offers ?? '—'}</td>
                <td className="num-cell">{s?.products ?? '—'}</td>
                <td className={'num-cell' + (s?.avg_gap_pct < 0 ? ' neg' : '')}>{pct(s?.avg_gap_pct)}</td>
                <td className={'num-cell' + (s?.median_gap_pct < 0 ? ' neg' : '')}>{pct(s?.median_gap_pct)}</td>
                <td className="num-cell">{s ? (s.below_min_products > 0 ? <strong className="crit-text">{s.below_min_products}</strong> : 0) : '—'}</td>
                <td className="num-cell muted">{s?.missing_min_products ?? '—'}</td>
              </tr>
            )
          })}</tbody>
        </table></div>
        {admin && <div className="row-actions"><input value={np} onChange={e => setNp(e.target.value)} placeholder="Nowy partner do śledzenia…" /><button className="btn ghost small-btn" disabled={!np.trim()} onClick={addPartner}>Dodaj partnera</button></div>}
      </div>

      {cur && (
        <div className="panel">
          <div className="prices-head"><h2>{cur.name}</h2><button className="link-dark" onClick={() => setSel('')}>zamknij</button></div>
          {cur.note && <p className="muted small">{cur.note}</p>}
          {admin && <Aliases partner={cur} retailers={d.retailers} taken={taken} onChange={savePartner} />}
          <h3>Oferty z ostatniej aktualizacji</h3>
          {offers === null ? <DrainLoader /> : offers.length === 0 ? <p className="muted">Brak ofert {(cur.aliases || []).length ? 'w ostatniej aktualizacji' : '– najpierw przypisz nazwy z Dealavo'}.</p> : <>
            <label className="check small"><input type="checkbox" checked={onlyBelow} onChange={e => setOnlyBelow(e.target.checked)} /> tylko poniżej ceny minimalnej</label>
            <div className="table-wrap"><table className="compact">
              <thead><tr><th>Produkt</th><th>Sprzedawca</th><th className="num-cell">Cena partnera</th><th className="num-cell">Wasza cena</th><th className="num-cell">Rozbieżność</th><th className="num-cell">Cena min.</th><th>Status</th></tr></thead>
              <tbody>{shown.map(o => (
                <tr key={o.id} className={o.below_min ? 'below-min' : ''}>
                  <td>{o.url ? <a href={o.url} target="_blank" rel="noreferrer">{o.article || o.product_id}</a> : (o.article || o.product_id)}{o.ean && <span className="muted small mono"> {o.ean}</span>}</td>
                  <td className="small">{o.retailer}{o.source ? <span className="muted"> · {o.source}</span> : null}</td>
                  <td className="num-cell">{zl(o.retailer_price)}</td>
                  <td className="num-cell">{zl(o.price)}</td>
                  <td className={'num-cell' + (o.gap_pct < 0 ? ' neg' : '')}>{pct(o.gap_pct)}</td>
                  <td className="num-cell">{zl(o.min_price)}</td>
                  <td className="small">{!o.available ? <span className="muted">niedostępna</span> : o.below_min ? <strong className="crit-text">poniżej min.</strong> : !(o.min_price > 0) ? <span className="muted">brak ceny min.</span> : 'OK'}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </>}
        </div>
      )}
    </section>
  )
}
