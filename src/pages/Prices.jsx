import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, plError, fetchAll } from '../supabase.js'
import { runJob, DATA_URL } from '../jobs.js'
import { suggestions, summarize, defaultLabel } from '../dealavo.js'
import { parseReport, computeHistory } from '../dealavoFile.js'
import DrainLoader from '../components/DrainLoader.jsx'

const KIND = { partner: 'partner', wlasny: 'kanał własny', marketplace: 'marketplace' }
const pct = v => v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${Number(v).toLocaleString('pl-PL', { maximumFractionDigits: 1 })}%`
const zl = v => v === null || v === undefined ? '—' : `${Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`
const quarterOf = t => { const m = String(t || '').match(/^(\d{4})_(\d{2})/); return m ? `${m[1]}-Q${Math.ceil(Number(m[2]) / 3)}` : null }
const dayOf = t => { const m = String(t || '').match(/^(\d{4})_(\d{2})_(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : '—' }
const nowQuarter = () => { const d = new Date(); return `${d.getFullYear()}-Q${Math.ceil((d.getMonth() + 1) / 3)}` }
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

function BelowNow({ offers, channels }) {
  const label = r => channels.find(c => c.retailer === r)?.label || r
  const byProd = new Map()
  for (const o of (offers || []).filter(o => o.available && o.below_min)) {
    const g = byProd.get(o.product_id) || { ...o, list: [] }
    g.list.push(o); if (o.retailer_price < g.retailer_price) Object.assign(g, { retailer_price: o.retailer_price, url: o.url, gap_pct: o.gap_pct })
    byProd.set(o.product_id, g)
  }
  const rows = [...byProd.values()].sort((x, y) => (x.gap_pct ?? 0) - (y.gap_pct ?? 0))
  if (!offers) return <DrainLoader />
  if (!rows.length) return <p className="muted">Żaden produkt nie ma teraz ceny poniżej katalogowej.</p>
  return (
    <div className="table-wrap"><table className="compact">
      <thead><tr><th>Produkt</th><th className="num-cell" title="Promocyjna, jeśli obowiązywała, inaczej katalogowa – z cennika Studio">Cena minimalna</th><th className="num-cell">Najniższa cena</th><th className="num-cell">Poniżej o</th><th>Kanały (cena)</th></tr></thead>
      <tbody>{rows.map(g => (
        <tr key={g.product_id} className="below-min">
          <td>{g.url ? <a href={g.url} target="_blank" rel="noreferrer">{g.article || g.product_id}</a> : (g.article || g.product_id)}{g.ean && <span className="muted small mono"> {g.ean}</span>}</td>
          <td className="num-cell">{zl(g.min_price)}</td>
          <td className="num-cell"><strong className="crit-text">{zl(g.retailer_price)}</strong></td>
          <td className="num-cell neg">{pct(g.gap_pct)}</td>
          <td className="small">{g.list.sort((x, y) => x.retailer_price - y.retailer_price).map(o => <span key={o.id} className="ch-price">{label(o.retailer)}: {zl(o.retailer_price)}</span>)}</td>
        </tr>
      ))}</tbody>
    </table></div>
  )
}

function BelowHistory({ partner, channels, quarters, stats }) {
  const [q, setQ] = useState(quarters[0] || nowQuarter())
  const [rows, setRows] = useState(null)
  useEffect(() => { setRows(null); fetchAll('dealavo_violations', '*', x => x.eq('partner_id', partner.id).eq('quarter', q)).then(r => setRows(r.sort((a, b) => b.max_below_pct - a.max_below_pct))).catch(() => setRows([])) }, [partner.id, q])
  const label = r => channels.find(c => c.retailer === r)?.label || r
  const st = stats.filter(x => x.partner_id === partner.id && quarterOf(x.update_time) === q && x.offers > 0)
  const avg = st.length ? st.reduce((m, x) => m + Number(x.avg_gap_pct || 0), 0) / st.length : null
  return (
    <>
      <div className="row-actions">
        <label className="inline-label">Kwartał<select className="quarter-select" value={q} onChange={e => setQ(e.target.value)}>{[...new Set([nowQuarter(), ...quarters])].sort().reverse().map(x => <option key={x} value={x}>{x.replace('-', ' ')}</option>)}</select></label>
        <span className="muted small">{st.length ? `${st.length} ${st.length === 1 ? 'pobranie' : (st.length % 10 >= 2 && st.length % 10 <= 4 && (st.length % 100 < 10 || st.length % 100 >= 20)) ? 'pobrania' : 'pobrań'} w kwartale · średnia rozbieżność ${pct(Math.round(avg * 100) / 100)}` : 'brak pobrań w tym kwartale'}</span>
      </div>
      {rows === null ? <DrainLoader /> : rows.length === 0 ? <p className="muted">W tym kwartale żaden produkt nie był poniżej ceny katalogowej.</p> : (
        <div className="table-wrap"><table className="compact">
          <thead><tr><th>Produkt</th><th className="num-cell" title="Promocyjna, jeśli obowiązywała, inaczej katalogowa – z cennika Studio">Cena minimalna</th><th className="num-cell">Najniższa cena</th><th className="num-cell">Maks. poniżej</th><th>Kanały</th><th className="num-cell">W ilu pobraniach</th><th>Pierwszy / ostatni raz</th></tr></thead>
          <tbody>{rows.map(v => (
            <tr key={v.product_id}>
              <td>{v.url ? <a href={v.url} target="_blank" rel="noreferrer">{v.article || v.product_id}</a> : (v.article || v.product_id)}{v.ean && <span className="muted small mono"> {v.ean}</span>}</td>
              <td className="num-cell">{zl(v.catalogue_price)}</td>
              <td className="num-cell crit-text">{zl(v.min_retailer_price)}</td>
              <td className="num-cell neg">−{Number(v.max_below_pct).toLocaleString('pl-PL', { maximumFractionDigits: 1 })}%</td>
              <td className="small">{(v.channels || []).map(label).join(', ')}</td>
              <td className="num-cell">{v.seen_updates}{st.length ? <span className="muted"> / {st.length}</span> : null}</td>
              <td className="small">{dayOf(v.first_seen)} – {dayOf(v.last_seen)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  )
}

// Import historii z raportów cenowych Dealavo (pliki XLSX z panelu, ok. 29 dni każdy)
function FileImport({ d, onDone }) {
  const [files, setFiles] = useState([])
  const [skipExisting, setSkipExisting] = useState(true)
  const [ack, setAck] = useState(false)
  const [st, setSt] = useState(null)
  const [err, setErr] = useState('')
  async function pick(list) {
    setErr(''); setSt(null)
    const parsed = []
    for (const f of list) { try { parsed.push(parseReport(new Uint8Array(await f.arrayBuffer()), f.name)) } catch (e) { setErr(e.message) } }
    setFiles(parsed)
  }
  const plan = useMemo(() => files.length ? computeHistory(files, d.channels, d.partners.filter(p => p.active), skipExisting ? new Set((d.allStats || []).map(x => x.update_time)) : new Set()) : null, [files, skipExisting, d])
  const quarters = plan ? [...new Set(plan.days.map(quarterOf))] : []
  async function run() {
    setErr(''); const t = plan
    try {
      setSt({ running: true, text: 'Zapisywanie wskaźników…' })
      for (let i = 0; i < t.stats.length; i += 1000) {
        const { error } = await supabase.from('dealavo_stats').upsert(t.stats.slice(i, i + 1000), { onConflict: 'update_time,partner_id' })
        if (error) throw error
      }
      for (const [n, day] of t.days.entries()) {         // dni po kolei – rejestr liczy „w ilu pobraniach” poprawnie
        setSt({ running: true, text: `Rejestr naruszeń: ${when(day)} (${n + 1} / ${t.days.length})` })
        const rows = t.violations.filter(v => v.update_time === day)
        for (let i = 0; i < rows.length; i += 2000) {
          const { error } = await supabase.rpc('dealavo_import_violations', { rows: rows.slice(i, i + 2000) })
          if (error) throw new Error(/dealavo_import_violations/.test(error.message) ? 'Brak funkcji importu – uruchom migrację 34_dealavo_import.sql.' : error.message)
        }
      }
      setSt({ running: false, text: `Zaimportowano ${t.days.length} dni (${quarters.map(q => q.replace('-', ' ')).join(', ')}): ${t.violations.length} naruszeń w rejestrze.` })
      setFiles([]); onDone()
    } catch (e) { setSt(null); setErr(plError(e.message)) }
  }
  const top = plan ? [...plan.unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8) : []
  return (
    <div className="file-import">
      <h3>Z pliku – raport cenowy z panelu Dealavo</h3>
      <p className="muted small">Raport z panelu zawiera ceny dzienne z ok. 29 dni wstecz, więc kwartał to 4 pliki. Wybierz kilka naraz – dni powtarzające się w plikach liczą się raz. Nie zużywa wykonań n8n.</p>
      <p className="hint small"><strong>Uwaga:</strong> raport ma jedną cenę katalogową na ofertę – z dnia wygenerowania raportu – i porównuje z nią ceny ze wszystkich 29 dni. Jeśli w tym okresie zmienialiście ceny katalogowe (np. promocja), naruszenia będą policzone błędnie. Dla takich okresów użyj pobierania przez API powyżej – liczy każdy dzień od ceny obowiązującej tego dnia. Raport z panelu <strong>nie zawiera marki</strong>, więc import obejmie wszystkie produkty, a nie tylko analizowaną markę – wygeneruj w panelu raport zawężony do niej.</p>
      <input type="file" accept=".xlsx" multiple onChange={e => pick([...e.target.files])} disabled={st?.running} />
      {err && <p className="error">{err}</p>}
      {plan && !st?.running && (
        <div className="import-plan">
          <ul className="small">{files.map(f => <li key={f.fileName}><strong>{f.fileName}</strong> – {dayOf(f.days[0])} – {dayOf(f.days.at(-1))}, {f.rows.length} ofert</li>)}</ul>
          <p className="small">Do importu: <strong>{plan.days.length} dni</strong>{plan.days.length ? ` (${dayOf(plan.days[0])} – ${dayOf(plan.days.at(-1))})` : ''}{plan.skipped.length ? ` · ${plan.skipped.length} pominiętych, bo są już w historii` : ''} · oferty w kanałach śledzonych podmiotów: <strong>{plan.matchedRows}</strong> z {plan.totalRows} · naruszeń: {plan.violations.length}</p>
          {top.length > 0 && <p className="muted small">Najczęstsi sprzedawcy bez przypisania do podmiotu: {top.map(([n, c]) => `${n} (${c})`).join(', ')}. Jeśli to któryś z Waszych partnerów – dodaj kanał przed importem.</p>}
          <label className="check small"><input type="checkbox" checked={skipExisting} onChange={e => setSkipExisting(e.target.checked)} /> pomiń dni, które są już w historii</label>
          <label className="check small"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} /> w tym okresie nie zmienialiśmy cen katalogowych w Dealavo</label>
          <div className="row-actions"><button className="btn" disabled={!plan.days.length || !ack} onClick={run}>Importuj {plan.days.length} dni</button></div>
        </div>
      )}
      {st && <p className={st.running ? 'muted working' : 'ok'} role="status">{st.text}</p>}
    </div>
  )
}

// Uzupełnianie historii z API: najpierw lista dni (bez pobierania danych), potem każdy dzień jako osobne zadanie.
// Dni sprzed daty początku pomiarów (nowy cennik w Dealavo) nie są pobierane.
const qStart = q => `${q.slice(0, 4)}-${String((Number(q.slice(6)) - 1) * 3 + 1).padStart(2, '0')}-01`
const qRange = q => { const y = Number(q.slice(0, 4)), n = Number(q.slice(6)); return [`${y}_${String((n - 1) * 3 + 1).padStart(2, '0')}`, n === 4 ? `${y + 1}_01` : `${y}_${String(n * 3 + 1).padStart(2, '0')}`] }
function Backfill({ d, onDone }) {
  const vf = d.validFrom ? `${d.validFrom.slice(0, 4)}-${d.validFrom.slice(5, 7)}-${d.validFrom.slice(8, 10)}` : null
  const [q, setQ] = useState('2026-Q3')
  const [from, setFrom] = useState(vf && vf > qStart('2026-Q3') ? vf : qStart('2026-Q3'))
  const [cadence, setCadence] = useState('daily')
  const [st, setSt] = useState(null)
  const stop = useRef(false)
  const fmt = sec => sec >= 3600 ? `${Math.floor(sec / 3600)} h ${Math.round(sec % 3600 / 60)} min` : `${Math.max(1, Math.round(sec / 60))} min`
  const changeQ = v => { setQ(v); const s0 = qStart(v); setFrom(vf && vf > s0 ? vf : s0) }
  async function start(rebuild) {
    const fromKey = from.replace(/-/g, '_')
    if (rebuild && !confirm(`Przeliczyć ${q.replace('-', ' ')} od ${from.split('-').reverse().join('.')}?\n\nUsunie wszystkie wskaźniki i rejestr naruszeń z tego kwartału, a potem pobierze ponownie dni od tej daty (ok. 1 min na dzień). Data zostanie zapisana jako początek ważnych pomiarów.`)) return
    stop.current = false
    let targets = [], done = 0, skipped = 0, errors = [], ran = 0
    const t0 = Date.now()
    const job = async payload => { for (let a = 1; a <= 2; a++) { try { return await runJob('dealavo_sync', payload, { url: DATA_URL, timeoutSec: 300 }) } catch (e) { if (a === 2) throw e } } }
    try {
      if (rebuild) {
        setSt({ running: true, text: 'Czyszczenie danych kwartału…' })
        const [lo, hi] = qRange(q)
        const a1 = await supabase.from('dealavo_stats').delete().gte('update_time', lo).lt('update_time', hi); if (a1.error) throw a1.error
        const a2 = await supabase.from('dealavo_violations').delete().eq('quarter', q); if (a2.error) throw a2.error
        const a3 = await supabase.from('dealavo_settings').upsert({ key: 'valid_from', value: fromKey, updated_at: new Date().toISOString() }); if (a3.error) throw a3.error
      }
      setSt({ running: true, text: 'Pobieranie listy dni z Dealavo…' })
      targets = (await job({ backfill: q, cadence, from: fromKey, list_only: true })).targets || []
      const loaded = rebuild ? new Set() : new Set((d.allStats || []).map(x => x.update_time))
      for (let i = 0; i < targets.length; i++) {
        if (stop.current) break
        if (loaded.has(targets[i])) { skipped++; done++; continue }
        const left = (targets.length - i) * (ran ? (Date.now() - t0) / ran : 60000)
        setSt({ running: true, done, total: targets.length, skipped, errors, text: `Aktualizacja z ${when(targets[i])} · pozostało ok. ${fmt(left / 1000)}` })
        try {
          const r = await job({ backfill: q, cadence, from: fromKey, step: i })
          if (r.update_time !== targets[i]) throw new Error(`n8n pobrał ${when(r.update_time)} zamiast ${when(targets[i])} – przerwano`)
          ran++
        } catch (e) { errors = [...errors, `${when(targets[i])}: ${plError(e.message)}`]; if (/przerwano/.test(e.message)) break }
        done++
      }
      setSt({ running: false, done, total: targets.length, skipped, errors, text: stop.current ? 'Zatrzymano – możesz wznowić („Uzupełnij”), pobrane dni zostaną pominięte.' : `Zakończono: ${targets.length} dni z ${q.replace('-', ' ')} od ${from.split('-').reverse().join('.')}${skipped ? ` (${skipped} było już pobranych)` : ''}.` })
    } catch (e) { setSt({ running: false, done, total: targets.length || null, errors, text: plError(e.message), failed: true }) }
    onDone()
  }
  const pctDone = st?.total ? Math.round(100 * st.done / st.total) : 0
  return (
    <>
      <p className="muted small">Pobiera kolejne aktualizacje z Dealavo przez n8n (ok. 1 min na dzień, każda to jedno wykonanie n8n) i zapisuje wskaźniki oraz naruszenia – bieżące oferty nie zmieniają się. Ceny katalogowe są z dnia pomiaru. <strong>Nie zamykaj tej karty</strong> w trakcie.</p>
      <div className="row-actions">
        <label className="inline-label">Kwartał<select value={q} onChange={e => changeQ(e.target.value)} disabled={st?.running}>{['2026-Q4', '2026-Q3', '2026-Q2', '2026-Q1'].map(x => <option key={x} value={x}>{x.replace('-', ' ')}</option>)}</select></label>
        <label className="inline-label">Od dnia<input type="date" value={from} min={qStart(q)} onChange={e => setFrom(e.target.value)} disabled={st?.running} /></label>
        <label className="inline-label">Częstotliwość<select value={cadence} onChange={e => setCadence(e.target.value)} disabled={st?.running}><option value="daily">codziennie</option><option value="weekly">co tydzień</option></select></label>
      </div>
      <div className="row-actions">
        {st?.running ? <button className="btn ghost" onClick={() => { stop.current = true }}>Zatrzymaj po bieżącym</button> : <>
          <button className="btn" onClick={() => start(false)}>Uzupełnij brakujące dni</button>
          <button className="btn ghost danger-btn" onClick={() => start(true)}>Przelicz kwartał od tego dnia</button>
        </>}
      </div>
      {st && <>
        {st.total ? <div className="usage-row"><span className="bar usage-bar"><span style={{ width: `${pctDone}%` }} /></span><span className="muted small">{st.done} / {st.total}</span></div> : null}
        <p className={st.failed ? 'error' : st.running ? 'muted working' : 'ok'} role="status">{st.text}</p>
        {st.errors?.length > 0 && <details><summary className="small warn-text">{st.errors.length} nieudanych – „Uzupełnij brakujące dni” spróbuje ponownie</summary><ul className="small">{st.errors.map(x => <li key={x}>{x}</li>)}</ul></details>}
      </>}
    </>
  )
}

function QuarterHistory({ d, onPick }) {
  const years = [...new Set([...(d.allStats || []).map(x => quarterOf(x.update_time)), ...(d.vcount || []).map(x => x.quarter)].filter(Boolean).map(q => q.slice(0, 4)))].sort().reverse()
  const [year, setYear] = useState(years[0] || String(new Date().getFullYear()))
  const [metric, setMetric] = useState('dziennie')
  const [tol, setTol] = useState(0)
  if (!years.length) return <p className="muted">Historia pojawi się po pierwszych pobraniach – od teraz codziennie o 7:00.</p>
  const Q = [1, 2, 3, 4].map(n => `${year}-Q${n}`)
  const viol = {}; for (const v of d.vcount || []) if (Number(v.max_below_pct || 0) > tol) viol[`${v.partner_id}|${v.quarter}`] = (viol[`${v.partner_id}|${v.quarter}`] || 0) + 1
  const daily = {}; for (const x of d.allStats || []) { if (!(x.offers > 0)) continue; const k = `${x.partner_id}|${quarterOf(x.update_time)}`; (daily[k] = daily[k] || []).push(Number(x.below_min_products || 0)) }
  const gap = {}, runs = {}
  for (const x of d.allStats || []) { if (!(x.offers > 0)) continue; const k = `${x.partner_id}|${quarterOf(x.update_time)}`; (gap[k] = gap[k] || []).push(Number(x.avg_gap_pct || 0)) }
  for (const x of d.allStats || []) { const k = quarterOf(x.update_time); runs[k] = runs[k] || new Set(); runs[k].add(x.update_time) }
  const first = (d.allStats || []).reduce((m, x) => !m || x.update_time < m ? x.update_time : m, '')
  const list = d.partners.filter(p => p.active && Q.some(q => viol[`${p.id}|${q}`] || gap[`${p.id}|${q}`]))
    .sort((a, b) => { const sc = p => metric === 'dziennie' ? Q.reduce((s2, q) => { const v = daily[`${p.id}|${q}`]; return s2 + (v ? v.reduce((x, y) => x + y, 0) / v.length : 0) }, 0) : Q.reduce((s2, q) => s2 + (viol[`${p.id}|${q}`] || 0), 0); return sc(b) - sc(a) || a.name.localeCompare(b.name, 'pl') })
  const cell = (p, q) => {
    if (metric === 'naruszenia') { const n = viol[`${p.id}|${q}`]; return gap[`${p.id}|${q}`] || n ? (n ? <strong className="crit-text">{n}</strong> : 0) : '—' }
    if (metric === 'dziennie') { const a = daily[`${p.id}|${q}`]; if (!a) return '—'; const v = a.reduce((s2, x) => s2 + x, 0) / a.length; return v >= 0.05 ? <strong className="crit-text">{v.toLocaleString('pl-PL', { maximumFractionDigits: 1 })}</strong> : 0 }
    const g = gap[`${p.id}|${q}`]; return g ? pct(Math.round(g.reduce((s, x) => s + x, 0) / g.length * 100) / 100) : '—'
  }
  return (
    <>
      <div className="row-actions">
        <label className="inline-label">Rok<select value={year} onChange={e => setYear(e.target.value)}>{years.map(y => <option key={y}>{y}</option>)}</select></label>
        <div className="seg" role="radiogroup">
          <button className={metric === 'dziennie' ? 'on' : ''} onClick={() => setMetric('dziennie')}>Poniżej ceny – średnio na pobranie</button>
          <button className={metric === 'naruszenia' ? 'on' : ''} onClick={() => setMetric('naruszenia')}>Poniżej ceny – choć raz w kwartale</button>
          <button className={metric === 'rozbieznosc' ? 'on' : ''} onClick={() => setMetric('rozbieznosc')}>Średnia rozbieżność</button>
        </div>
      </div>
      {metric === 'naruszenia' && <label className="inline-label small">Tolerancja<select value={tol} onChange={e => setTol(Number(e.target.value))}>{[0, 1, 2, 3, 5, 10].map(t => <option key={t} value={t}>{t === 0 ? 'każde zejście poniżej' : `poniżej o więcej niż ${t}%`}</option>)}</select></label>}
      <p className="muted small">{metric === 'dziennie' ? 'Ile produktów średnio w jednym pomiarze było poniżej ceny katalogowej – porównywalne między kwartałami niezależnie od liczby pobrań.' : metric === 'naruszenia' ? `Liczba różnych produktów, które w kwartale choć raz były poniżej ceny katalogowej${tol ? ` o więcej niż ${tol}%` : ''}. Rośnie z liczbą pobrań – do porównań między kwartałami użyj „średnio na pobranie”.` : 'Średnia z rozbieżności zmierzonych w pobraniach w danym kwartale.'} Dane od {dayOf(first)}.{d.validFrom ? ` Pomiary ważne od ${dayOf(d.validFrom + '_00_00')} (aktualny cennik w Dealavo).` : ''}</p>
      <div className="table-wrap"><table className="compact prices-table">
        <thead><tr><th>Podmiot</th>{Q.map(q => <th key={q} className="num-cell">{q.slice(5)}<span className="muted small"> · {runs[q]?.size || 0} pobr.</span></th>)}</tr></thead>
        <tbody>{list.map(p => <tr key={p.id} onClick={() => onPick(p.id)}><td>{p.name}{p.kind !== 'partner' && <span className="tag">{KIND[p.kind]}</span>}</td>{Q.map(q => <td key={q} className="num-cell">{cell(p, q)}</td>)}</tr>)}</tbody>
      </table></div>
      {list.length === 0 && <p className="muted">Brak danych w {year} r.</p>}
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
  const [tab, setTab] = useState('ponizej')
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
      const vi = await fetchAll('dealavo_violations', 'partner_id, quarter, max_below_pct').catch(() => null)
      const vf = await supabase.from('dealavo_settings').select('value').eq('key', 'valid_from').maybeSingle()
      const last = st.reduce((m, s) => s.update_time > m ? s.update_time : m, '')
      setD({ validFrom: vf?.data?.value || null, allStats: st, vcount: vi, channels: ch, partners: p.data, stats: Object.fromEntries(st.filter(s => s.update_time === last).map(s => [s.partner_id, s])), last, retailers: rt.sort((a, b) => b.offers - a.offers) })
    } catch (e) { setErr(/migrację 32/.test(e.message) ? e.message : /dealavo_/.test(e.message) ? 'Brak tabel Dealavo – uruchom migrację 31_dealavo.sql.' : plError(e.message)) }
  }
  useEffect(() => { load() }, [])
  useEffect(() => { if (sel) setTimeout(() => document.getElementById('partner-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }, [sel])
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
      const ex = (r?.unmatched_sample || []).slice(0, 5).map(x => `${x.article || x.ean || x.producer_code || '?'} (${x.offers})`).join(', ')
      setMsg({ type: r?.matched ? 'ok' : 'hint', text: `Pobrano aktualizację z ${when(r?.update_time)}: ${r?.rows ?? '?'} dostępnych ofert w raporcie, ${r?.tracked ?? '?'} w kanałach śledzonych podmiotów. Dopasowano do produktów z bazy: ${r?.matched ?? 0}${r?.no_price ? ` (bez cennika na ten dzień: ${r.no_price})` : ''}, bez dopasowania: ${r?.unmatched ?? 0}${ex ? ` – np. ${ex}` : ''}. Naruszeń: ${r?.violations ?? 0}.` }); load()
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
      <p className="muted lead">Dane z Dealavo (Polska): ceny dostępnych ofert u partnerów wobec cen z Waszych cenników (Produkty i cenniki): cena minimalna dnia to promocyjna, jeśli jest, inaczej katalogowa. Liczone są tylko produkty z bazy. Rozbieżność bez kosztu wysyłki; wartość ujemna = oferta poniżej ceny katalogowej (naruszenie).</p>
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
          <thead><tr><th>Podmiot</th><th className="num-cell">Kanały</th><th className="num-cell">Dostępne oferty</th><th className="num-cell">Produkty</th><th className="num-cell">Średnia rozbieżność</th><th className="num-cell">Mediana</th><th className="num-cell">Poniżej ceny min.</th><th className="num-cell">Bez ceny min.</th><th className="num-cell" title="Oferty w kanałach podmiotu, których nie udało się dopasować do produktu z bazy (EAN / kod)">Bez dopasowania</th></tr></thead>
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
                <td className="num-cell muted">{s?.unmatched_offers ?? '—'}</td>
              </tr>
            )
          })}</tbody>
        </table></div>
        {admin && <div className="row-actions"><input value={np} onChange={e => setNp(e.target.value)} placeholder="Nowy podmiot do śledzenia…" /><button className="btn ghost small-btn" disabled={!np.trim()} onClick={addPartner}>Dodaj podmiot</button></div>}
      </div>

      <div className="panel">
        <h2>Historia kwartalna</h2>
        <QuarterHistory d={d} onPick={id => { setSel(id); setTab('historia') }} />
        {admin && <details className="backfill">
          <summary><strong>Uzupełnij historię z Dealavo</strong> <span className="muted small">– wcześniejsze kwartały (admin)</span></summary>
          <h3>Z API Dealavo – kolejne aktualizacje przez n8n (zalecane)</h3>
          <Backfill d={d} onDone={load} />
          <p className="muted small file-import">Import z raportu z panelu Dealavo jest wyłączony: weryfikacja liczy się teraz według cenników Studio, a raport z panelu porównywał ceny z „Suggested price”. Historię uzupełniaj przez API powyżej.</p>
        </details>}
      </div>

      {cur && (
        <div className="panel" id="partner-details">
          <div className="prices-head"><h2>{cur.name}</h2><button className="link-dark" onClick={() => setSel('')}>zamknij</button></div>
          {cur.note && <p className="muted small">{cur.note}</p>}
          <Entity partner={cur} channels={d.channels} retailers={d.retailers} taken={taken} offers={offers} admin={admin} onSaved={load} setMsg={setMsg} />
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'ponizej'} className={tab === 'ponizej' ? 'tab on' : 'tab'} onClick={() => setTab('ponizej')}>Poniżej ceny katalogowej – teraz</button>
            <button role="tab" aria-selected={tab === 'historia'} className={tab === 'historia' ? 'tab on' : 'tab'} onClick={() => setTab('historia')}>Historia naruszeń</button>
            <button role="tab" aria-selected={tab === 'oferty'} className={tab === 'oferty' ? 'tab on' : 'tab'} onClick={() => setTab('oferty')}>Wszystkie oferty</button>
          </div>
          {tab === 'ponizej' && <BelowNow offers={offers} channels={d.channels} />}
          {tab === 'historia' && <BelowHistory key={cur.id} partner={cur} channels={d.channels} stats={d.allStats || []} quarters={[...new Set((d.vcount || []).filter(v => v.partner_id === cur.id).map(v => v.quarter))].sort().reverse()} />}
          {tab === 'oferty' && <>
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
          </>}
        </div>
      )}
    </section>
  )
}
