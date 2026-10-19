import { useEffect, useMemo, useState } from 'react'
import { supabase, plError, fetchAll } from '../supabase.js'
import { runJob, DATA_URL } from '../jobs.js'
import { suggestions, summarize, defaultLabel } from '../dealavo.js'
import DrainLoader from '../components/DrainLoader.jsx'

const KIND = { partner: 'partner', wlasny: 'kanał własny', marketplace: 'marketplace' }
const pct = v => v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${Number(v).toLocaleString('pl-PL', { maximumFractionDigits: 1 })}%`
const zl = v => v === null || v === undefined ? '—' : `${Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`
const when = t => { const m = String(t || '').match(/^(\d{4})_(\d{2})_(\d{2})(?:_(\d{2})_(\d{2}))?/); return m ? `${m[3]}.${m[2]}.${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ''}` : (t || '—') }

const dupMsg = e => /duplicate key|23505/.test(e.message || '') ? 'Ta nazwa z Dealavo jest już przypisana do innego podmiotu – jedna oferta nie może liczyć się dwa razy.' : plError(e.message)

function Entity({ partner, channels, retailers, taken, offers, admin, onSaved, setMsg }) {
  const [name, setName] = useState(partner.name)
  const [kind, setKind] = useState(partner.kind)
  const [manual, setManual] = useState({ retailer: '', label: '' })
  useEffect(() => { setName(partner.name); setKind(partner.kind) }, [partner.id])
  const mine = channels.filter(c => c.partner_id === partner.id)
  const sug = suggestions({ ...partner, aliases: mine.map(c => c.retailer) }, retailers, taken).slice(0, 12)
  const rinfo = Object.fromEntries(retailers.map(r => [r.name, r]))
  const run = async (q, ok) => { const { error } = await q; if (error) setMsg({ type: 'error', text: dupMsg(error) }); else { setMsg(ok ? { type: 'ok', text: ok } : null); onSaved() } }
  const addChannel = (retailer, label) => run(supabase.from('dealavo_channels').insert({ partner_id: partner.id, retailer, label: label || defaultLabel(retailer, rinfo[retailer]?.source) }))
  const per = Object.fromEntries(mine.map(c => [c.retailer, summarize((offers || []).filter(o => o.retailer === c.retailer))]))
  return (
    <>
      {admin && (
        <div className="entity-form">
          <label>Nazwa podmiotu<input value={name} onChange={e => setName(e.target.value)} /></label>
          <label>Typ<select value={kind} onChange={e => setKind(e.target.value)}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <span className="row-actions">
            <button className="btn ghost small-btn" disabled={!name.trim() || (name.trim() === partner.name && kind === partner.kind)} onClick={() => run(supabase.from('dealavo_partners').update({ name: name.trim(), kind }).eq('id', partner.id), 'Zapisano.')}>Zapisz</button>
            <button className="link-dark danger-link small" onClick={() => confirm(`Przestać śledzić „${partner.name}”? Historia wskaźników zostanie.`) && run(supabase.from('dealavo_partners').update({ active: false }).eq('id', partner.id), 'Podmiot nie jest już śledzony.')}>przestań śledzić</button>
          </span>
        </div>
      )}
      <h3>Kanały w Dealavo</h3>
      <p className="muted small">Kanał = miejsce sprzedaży podmiotu (sklep, konto na Allegro, Castorama…) i nazwa, pod którą Dealavo pokazuje jego oferty. Wskaźniki podmiotu to suma jego kanałów.</p>
      {mine.length === 0 ? <p className="hint">Brak kanałów – oferty tego podmiotu nie są liczone.{admin ? ' Dodaj kanał z podpowiedzi albo ręcznie.' : ''}</p> : (
        <div className="table-wrap"><table className="compact channels-table">
          <thead><tr><th>Kanał</th><th>Nazwa w Dealavo</th><th className="num-cell">Dostępne oferty</th><th className="num-cell">Średnia</th><th className="num-cell">Mediana</th><th className="num-cell">Poniżej ceny min.</th>{admin && <th />}</tr></thead>
          <tbody>{mine.map(c => { const st = per[c.retailer]; return (
            <tr key={c.id}>
              <td>{admin ? <input className="inline-input" defaultValue={c.label} aria-label="Etykieta kanału" onBlur={e => e.target.value.trim() && e.target.value.trim() !== c.label && run(supabase.from('dealavo_channels').update({ label: e.target.value.trim() }).eq('id', c.id))} /> : c.label}</td>
              <td className="small">{c.retailer}{!rinfo[c.retailer] && retailers.length > 0 && <span className="warn-text small" title="Tej nazwy nie było w ostatniej aktualizacji Dealavo"> · brak w ostatniej aktualizacji</span>}</td>
              <td className="num-cell">{offers ? st.available_offers : '…'}</td>
              <td className={'num-cell' + (st?.avg_gap_pct < 0 ? ' neg' : '')}>{offers ? pct(st.avg_gap_pct) : '…'}</td>
              <td className={'num-cell' + (st?.median_gap_pct < 0 ? ' neg' : '')}>{offers ? pct(st.median_gap_pct) : '…'}</td>
              <td className="num-cell">{offers ? (st.below_min_products > 0 ? <strong className="crit-text">{st.below_min_products}</strong> : 0) : '…'}</td>
              {admin && <td><button className="link-dark danger-link small" onClick={() => run(supabase.from('dealavo_channels').delete().eq('id', c.id))}>usuń</button></td>}
            </tr>) })}</tbody>
        </table></div>
      )}
      {admin && (
        <div className="alias-box">
          {sug.length > 0 && <>
            <p className="small"><strong>Podpowiedzi z Dealavo</strong> <span className="muted">– kliknij, żeby dodać jako kanał (sprawdź, czy to na pewno ten podmiot)</span></p>
            <div className="alias-chips">{sug.map(r => <button key={r.name} className="alias-sug" onClick={() => addChannel(r.name)}>+ {r.name} <span className="muted">· {defaultLabel(r.name, r.source)} · {r.offers} ofert</span></button>)}</div>
          </>}
          <div className="row-actions channel-add">
            <input list="dealavo-retailers" value={manual.retailer} onChange={e => setManual({ ...manual, retailer: e.target.value, label: manual.label || '' })} placeholder="Nazwa sprzedawcy w Dealavo…" />
            <datalist id="dealavo-retailers">{retailers.filter(r => !taken.has(r.name)).slice(0, 2000).map(r => <option key={r.name} value={r.name} />)}</datalist>
            <input value={manual.label} onChange={e => setManual({ ...manual, label: e.target.value })} placeholder={manual.retailer ? defaultLabel(manual.retailer, rinfo[manual.retailer]?.source) : 'Etykieta, np. Allegro PL'} />
            <button className="btn ghost small-btn" disabled={!manual.retailer.trim()} onClick={() => { addChannel(manual.retailer.trim(), manual.label.trim()); setManual({ retailer: '', label: '' }) }}>Dodaj kanał</button>
          </div>
        </div>
      )}
    </>
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
      const [p, st, rt, ch] = await Promise.all([
        supabase.from('dealavo_partners').select('*').order('name'),
        fetchAll('dealavo_stats', '*'),
        fetchAll('dealavo_retailers', 'name, source, offers, update_time'),
        fetchAll('dealavo_channels', '*').catch(e => { throw new Error(/dealavo_channels/.test(e.message) ? 'Brak tabeli kanałów – uruchom migrację 32_dealavo_kanaly.sql.' : e.message) }),
      ])
      if (p.error) throw p.error
      const last = st.reduce((m, s) => s.update_time > m ? s.update_time : m, '')
      setD({ channels: ch, partners: p.data, stats: Object.fromEntries(st.filter(s => s.update_time === last).map(s => [s.partner_id, s])), last, retailers: rt.sort((a, b) => b.offers - a.offers) })
    } catch (e) { setErr(/migrację 32/.test(e.message) ? e.message : /dealavo_/.test(e.message) ? 'Brak tabel Dealavo – uruchom migrację 31_dealavo.sql.' : plError(e.message)) }
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!sel) { setOffers(null); return }
    fetchAll('dealavo_offers', '*', q => q.eq('partner_id', sel)).then(setOffers).catch(e => setErr(plError(e.message)))
  }, [sel, d?.last])

  const taken = useMemo(() => new Set((d?.channels || []).map(c => c.retailer)), [d])
  if (err) return <section className="page"><h1>Ceny u partnerów</h1><p className="error">{err}</p></section>
  if (!d) return <section className="page"><DrainLoader /></section>

  async function addPartner() {
    const { error } = await supabase.from('dealavo_partners').insert({ name: np.trim(), keywords: [np.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l')] })
    if (error) setMsg({ type: 'error', text: plError(error.message) }); else { setNp(''); load() }
  }
  async function sync() {
    setBusy(true); setMsg(null)
    try {
      const r = await runJob('dealavo_sync', {}, { url: DATA_URL, timeoutSec: 300 })
      const refName = /suggested/i.test(r?.reference || '') ? 'ceny katalogowej (w API Dealavo: „Suggested price”)' : r?.reference === 'Catalogue Price' ? 'ceny katalogowej' : r?.reference === 'Price' ? 'ceny Waszego sklepu' : null
      const sameMin = r?.min_price_column && r.min_price_column === r.reference
      setMsg({ type: r?.has_min_price === false ? 'hint' : 'ok', text: `Pobrano aktualizację z ${when(r?.update_time)}: ${r?.rows ?? '?'} dostępnych ofert${r?.pages ? ` (${r.pages} ${r.pages === 1 ? 'strona' : 'strony'})` : ''}, ${r?.tracked ?? '?'} w kanałach śledzonych podmiotów.${refName ? ` Rozbieżność${sameMin ? ' i naruszenia ceny minimalnej' : ''} liczone od ${refName}.` : ''}${r?.has_min_price === false ? ' Uwaga: brak cen minimalnych – naruszeń nie da się policzyć.' : ''}` }); load()
    } catch (e) { setMsg({ type: 'error', text: /^n8n odrzucił zadanie \(kod 404\)/.test(e.message) ? 'n8n nie zna adresu „studio-dane” – workflow „Studio – dane rynkowe” nie jest aktywny.' : plError(e.message) }) } finally { setBusy(false) }
  }
  function exportCsv() {
    const rows = d.partners.filter(p => p.active).map(p => { const s = d.stats[p.id] || {}; return [p.name, KIND[p.kind], d.channels.filter(c => c.partner_id === p.id).map(c => `${c.label}: ${c.retailer}`).join(' | '), s.available_offers ?? '', s.products ?? '', s.avg_gap_pct ?? '', s.median_gap_pct ?? '', s.below_min_products ?? '', s.missing_min_products ?? ''] })
    const csv = '\uFEFF' + [['Podmiot', 'Typ', 'Kanały (etykieta: nazwa w Dealavo)', 'Dostępne oferty', 'Produkty', 'Średnia rozbieżność %', 'Mediana rozbieżności %', 'Produkty poniżej ceny min.', 'Produkty bez ceny min.'], ...rows].map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `ceny-partnerzy-${d.last || 'brak'}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  const order = p => [p.kind === 'partner' ? 0 : 1, -((d.stats[p.id] || {}).below_min_products || 0), p.name]
  const list = [...d.partners].filter(p => p.active).sort((a, b) => { const x = order(a), y = order(b); return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2], 'pl') })
  const chOf = id => d.channels.filter(c => c.partner_id === id)
  const unmapped = list.filter(p => !chOf(p.id).length).length
  const cur = d.partners.find(p => p.id === sel)
  const sameMin = (offers || []).length > 0 && offers.every(o => o.min_price === null || Number(o.min_price) === Number(o.price))
  const shown = (offers || []).filter(o => !onlyBelow || o.below_min).sort((a, b) => (b.below_min - a.below_min) || ((a.gap_pct ?? 0) - (b.gap_pct ?? 0)))

  return (
    <section className="page wide">
      <h1>Ceny u partnerów</h1>
      <p className="muted lead">Dane z Dealavo (Polska): ceny dostępnych ofert u partnerów wobec Waszej ceny katalogowej, która jest ceną minimalną. Rozbieżność bez kosztu wysyłki; wartość ujemna = oferta poniżej ceny katalogowej (naruszenie).</p>
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
        {unmapped > 0 && <p className="hint">{unmapped} z {list.length} podmiotów nie ma jeszcze kanałów z Dealavo – ich oferty nie są liczone. Kliknij podmiot, żeby dodać kanały{d.retailers.length ? '' : ' (podpowiedzi pojawią się po pierwszym pobraniu)'}.</p>}
        <div className="table-wrap"><table className="compact prices-table">
          <thead><tr><th>Podmiot</th><th className="num-cell">Kanały</th><th className="num-cell">Dostępne oferty</th><th className="num-cell">Produkty</th><th className="num-cell">Średnia rozbieżność</th><th className="num-cell">Mediana</th><th className="num-cell">Poniżej ceny min.</th><th className="num-cell">Bez ceny min.</th></tr></thead>
          <tbody>{list.map((p, i) => {
            const chs = chOf(p.id), mapped = chs.length > 0, s = mapped ? d.stats[p.id] : null, sep = i > 0 && p.kind !== 'partner' && list[i - 1].kind === 'partner'
            return (
              <tr key={p.id} className={(sel === p.id ? 'sel ' : '') + (sep ? 'group-sep ' : '') + (mapped ? '' : 'unmapped')} onClick={() => setSel(sel === p.id ? '' : p.id)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && setSel(sel === p.id ? '' : p.id)}>
                <td>{p.name}{p.kind !== 'partner' && <span className="tag">{KIND[p.kind]}</span>}{mapped && <span className="channel-labels">{[...new Set(chs.map(c => c.label))].join(' · ')}</span>}</td>
                <td className="num-cell">{mapped ? chs.length : <span className="warn-text" title="Brak kanałów – kliknij, żeby dodać">0</span>}</td>
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
        {admin && <div className="row-actions"><input value={np} onChange={e => setNp(e.target.value)} placeholder="Nowy podmiot do śledzenia…" /><button className="btn ghost small-btn" disabled={!np.trim()} onClick={addPartner}>Dodaj podmiot</button></div>}
      </div>

      {cur && (
        <div className="panel">
          <div className="prices-head"><h2>{cur.name}</h2><button className="link-dark" onClick={() => setSel('')}>zamknij</button></div>
          {cur.note && <p className="muted small">{cur.note}</p>}
          <Entity partner={cur} channels={d.channels} retailers={d.retailers} taken={taken} offers={offers} admin={admin} onSaved={load} setMsg={setMsg} />
          <h3>Oferty z ostatniej aktualizacji</h3>
          {offers === null ? <DrainLoader /> : offers.length === 0 ? <p className="muted">Brak ofert {chOf(cur.id).length ? 'w ostatniej aktualizacji' : '– najpierw dodaj kanały'}.</p> : <>
            <label className="check small"><input type="checkbox" checked={onlyBelow} onChange={e => setOnlyBelow(e.target.checked)} /> tylko poniżej ceny minimalnej</label>
            <div className="table-wrap"><table className="compact">
              <thead><tr><th>Produkt</th><th>Kanał</th><th className="num-cell">Cena partnera</th><th className="num-cell">{sameMin ? 'Cena katalogowa (min.)' : 'Cena katalogowa'}</th><th className="num-cell">Rozbieżność</th>{!sameMin && <th className="num-cell">Cena min.</th>}<th>Status</th></tr></thead>
              <tbody>{shown.map(o => (
                <tr key={o.id} className={o.below_min ? 'below-min' : ''}>
                  <td>{o.url ? <a href={o.url} target="_blank" rel="noreferrer">{o.article || o.product_id}</a> : (o.article || o.product_id)}{o.ean && <span className="muted small mono"> {o.ean}</span>}</td>
                  <td className="small">{d.channels.find(c => c.retailer === o.retailer)?.label || o.retailer}<span className="muted"> · {o.retailer}</span></td>
                  <td className="num-cell">{zl(o.retailer_price)}</td>
                  <td className="num-cell">{zl(o.price)}</td>
                  <td className={'num-cell' + (o.gap_pct < 0 ? ' neg' : '')}>{pct(o.gap_pct)}</td>
                  {!sameMin && <td className="num-cell">{zl(o.min_price)}</td>}
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
